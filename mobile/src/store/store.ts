/**
 * Single-object app state persisted to MMKV under `autonomic.journal.v1`.
 * Every mutation flows through `save()`, which stamps meta.lastUpdated — never
 * write MMKV directly. A tiny external store + useSyncExternalStore gives React
 * components a synchronous, always-current view.
 *
 * The disk write is debounced (src/lib/persist.ts): save() updates memory and
 * notifies React synchronously, while the stringify + MMKV write coalesces
 * behind a short trailing delay, flushed whenever the app leaves the
 * foreground. HRV waveform arrays (rrRaw, sampledHr, …) live OUTSIDE the
 * journal in a sidecar MMKV instance keyed by reading id (src/lib/waveforms.ts),
 * so the per-mutation stringify stays O(journal-without-waveforms) — small —
 * no matter how many live sessions accumulate.
 */
import { useSyncExternalStore } from 'react';
import { AppState as RNAppState } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { keyOf } from '../lib/dates';
import { SCHEMA_VERSION, assertImportVersion, blankDay, defaultState, isPlainObject, migrate } from '../lib/migrate';
import { createDebouncedWriter } from '../lib/persist';
import { logError } from '../lib/diagnostics/errorLog';
import { migrateLegacyJournal } from '../lib/storeMigration';
import { stampImportedHrvCoverage } from '../lib/hrvQuality';
import { markDeclinedKeys } from '../lib/health/declined';
import { resetFindingMemory } from '../lib/insights/findingMemory';
import { resetInsightsCache } from '../lib/insights/cache';
import { setInsightsAnchor } from '../lib/insights/anchorMemory';
import { resetTrendMemory } from '../lib/trends/memory';
import { importFingerprint } from '../lib/health/updateSet';
import type { AppState, DayRecord, Entry } from '../lib/types';
import {
  collectImportWaveforms, extractWaveforms, findEmbeddedWaveform, sleepWaveformId,
  waveformIds, type WaveformData,
} from '../lib/waveforms';

const STORAGE_KEY = 'autonomic.journal.v1';
// Raw copy of a blob loadState() could not honor (newer schema, or unparseable),
// stashed before the normalized state overwrites the original on the next save().
const RECOVERY_KEY = 'autonomic.journal.v1.recovery';

/* ---------- encryption at rest ----------
 * The journal is health data, so the MMKV store is encrypted with a random key
 * held in the iOS Keychain. AFTER_FIRST_UNLOCK matches the sandbox's default
 * file protection (the store must stay readable during background BLE / Health
 * work) and — critically — migrates with encrypted device backups, so a journal
 * restored onto a new phone can still be decrypted. The daily JSON snapshots in
 * src/lib/backup.ts stay deliberately plaintext as the user-recoverable escape
 * hatch (see the note there). */
const KEYCHAIN_ENTRY = 'autonomic.mmkv.key';
const LEGACY_ID = 'autonomic';
const SECURE_ID = 'autonomic.secure';

// Both modules were added after the first shipped binaries. A static `import`
// throws at module load on any binary that predates them (old dev clients,
// web, jest), so require them guardedly and degrade to the plaintext store.
let SecureStore: typeof import('expo-secure-store') | null = null;
let getRandomBytes: ((byteCount: number) => Uint8Array) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require('expo-secure-store');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getRandomBytes = (require('expo-crypto') as typeof import('expo-crypto')).getRandomBytes;
} catch {
  // native modules unavailable — encryption off, same behavior as before
}
// Guarded separately: file scrubbing is optional even when encryption works.
let FSNext: typeof import('expo-file-system/next') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  FSNext = require('expo-file-system/next');
} catch {
  // sync file API unavailable — migration still runs, remnants stay until it is
}

/** Best-effort handle on the legacy store's on-disk files (react-native-mmkv
 * keeps stores under `<Documents>/mmkv`). Lets kv() skip the migration once the
 * plaintext files are gone, and scrub the remnants clearAll() leaves in the
 * mmap page — deleted only after migrateLegacyJournal says they're disposable. */
function legacyStoreFiles(): { exists: boolean; remove(): void } | null {
  if (!FSNext) return null;
  try {
    const { File, Paths } = FSNext;
    const files = [LEGACY_ID, `${LEGACY_ID}.crc`].map((n) => new File(Paths.document, 'mmkv', n));
    return {
      exists: files[0].exists,
      remove: () => files.forEach((f) => { try { f.delete(); } catch { /* already gone */ } }),
    };
  } catch {
    return null;
  }
}

function encryptionKey(): string | null {
  if (!SecureStore || !getRandomBytes) return null;
  try {
    const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
    const existing = SecureStore.getItem(KEYCHAIN_ENTRY, opts);
    if (existing) return existing;
    // MMKV caps encryption keys at 16 bytes; 16 chars over 64 symbols = 96 bits.
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const key = Array.from(getRandomBytes(16), (b) => chars[b % 64]).join('');
    SecureStore.setItem(KEYCHAIN_ENTRY, key, opts);
    return key;
  } catch {
    return null; // Keychain unavailable — fall back to the plaintext store
  }
}

let mmkv: MMKV | null = null;
function kv(): MMKV {
  if (mmkv) return mmkv;
  const key = encryptionKey();
  if (key) {
    try {
      const secure = new MMKV({ id: SECURE_ID, encryptionKey: key });
      const legacyFiles = legacyStoreFiles();
      if (!legacyFiles || legacyFiles.exists) {
        try {
          if (migrateLegacyJournal(new MMKV({ id: LEGACY_ID }), secure, STORAGE_KEY)) {
            legacyFiles?.remove();
          }
        } catch {
          // nothing readable to migrate
        }
      }
      mmkv = secure;
      return mmkv;
    } catch {
      // encrypted store unavailable — fall through to the legacy plaintext store
    }
  }
  mmkv = new MMKV({ id: LEGACY_ID });
  return mmkv;
}

/* ---------- waveform sidecar ----------
 * Separate MMKV instance (same Keychain key) holding one JSON blob per HRV
 * reading id: { rrRaw, sampledHr, sampledSdnn } — see src/lib/waveforms.ts.
 * Kept out of the journal instance so the journal's mmap file stays tiny, and
 * out of `state` so waveform history never sits in the JS heap. Reads happen
 * lazily (the HRV detail view); writes happen once, when a reading is saved. */
const WAVE_ID = 'autonomic.waveforms';
let waveKv: MMKV | null = null;
function wkv(): MMKV {
  if (waveKv) return waveKv;
  const key = encryptionKey();
  if (key) {
    try {
      waveKv = new MMKV({ id: WAVE_ID, encryptionKey: key });
      return waveKv;
    } catch {
      // encrypted sidecar unavailable — fall back like kv() does
    }
  }
  waveKv = new MMKV({ id: WAVE_ID });
  return waveKv;
}

/* Read cache in front of the sidecar: the Journal re-resolves a day's
 * orthostatic curves on every re-render, and each miss is an encrypted-MMKV
 * read + JSON.parse. Bounded (LRU) so waveform history still never accumulates
 * in the JS heap — a day's worth of readings fits with plenty of headroom.
 * Misses cache as null too; putWaveform refreshes the entry on write. */
const WAVE_CACHE_MAX = 32;
const waveCache = new Map<string, WaveformData | null>();
function waveCachePut(id: string, data: WaveformData | null) {
  waveCache.delete(id);
  waveCache.set(id, data);
  if (waveCache.size > WAVE_CACHE_MAX) waveCache.delete(waveCache.keys().next().value as string);
}

function putWaveform(id: string, data: WaveformData) {
  try {
    wkv().set(id, JSON.stringify(data));
    waveCachePut(id, data);
  } catch (e) {
    // Plots degrade, journal unaffected — drop any stale cache entry so a
    // failed write can't keep serving a value the disk doesn't hold.
    //
    // Logged because the DEGRADING is invisible: the reading is saved and looks
    // complete, and only its beat-to-beat trace is gone. Nobody notices until
    // they open a chart weeks later, by which point the cause is unknowable.
    waveCache.delete(id);
    logError('store.waveform', e);
  }
}

/** Sidecar waveform for a reading, or null (never saved / pruned / unreadable).
 *  Callers fall back to any inline fields — pre-save live previews still carry
 *  them, as do imported-but-not-yet-migrated entries. */
export function getWaveform(id: string): WaveformData | null {
  if (waveCache.has(id)) {
    const hit = waveCache.get(id) ?? null;
    waveCachePut(id, hit); // refresh recency
    return hit;
  }
  let val: WaveformData | null = null;
  try {
    const raw = wkv().getString(id);
    const parsed = raw ? JSON.parse(raw) : null;
    val = isPlainObject(parsed) ? (parsed as WaveformData) : null;
  } catch {
    val = null;
  }
  waveCachePut(id, val);
  return val;
}

/** Same read, but without touching the LRU. Bulk walks over the whole sidecar
 *  (export, daily backup) would otherwise evict every hot entry and leave the
 *  Journal re-parsing today's curves on its next render. */
function readWaveformUncached(id: string): WaveformData | null {
  try {
    if (waveCache.has(id)) return waveCache.get(id) ?? null;
    const raw = wkv().getString(id);
    const parsed = raw ? JSON.parse(raw) : null;
    return isPlainObject(parsed) ? (parsed as WaveformData) : null;
  } catch {
    return null;
  }
}

/** Persist a reading's waveform arrays. Write this BEFORE upserting the entry
 *  so the journal never references a waveform that isn't on disk yet. */
export function storeWaveform(id: string, data: WaveformData) {
  putWaveform(id, data);
}

/**
 * A night's series (overnight HR curve, respiratory rate, hypnogram spans)
 * into the sidecar under its own namespaced key — never into the journal,
 * where a year of nights would be re-stringified on every mutation.
 *
 * Passing nothing CLEARS the night's blob, which is the important half: an
 * unstaged re-import, or a hand-corrected bed/wake, must not leave yesterday's
 * curve behind describing a window it no longer covers.
 */
export function storeSleepSeries(dk: string, s: {
  hrSeries?: WaveformData['sampledHr'] | null;
  respSeries?: WaveformData['sampledResp'] | null;
  spans?: WaveformData['stageSpans'] | null;
} = {}) {
  const data: WaveformData = {};
  if (s.hrSeries && s.hrSeries.length) data.sampledHr = s.hrSeries;
  if (s.respSeries && s.respSeries.length) data.sampledResp = s.respSeries;
  if (s.spans && s.spans.length) data.stageSpans = s.spans;
  const id = sleepWaveformId(dk);
  if (Object.keys(data).length) { putWaveform(id, data); return; }
  waveCache.delete(id);
  try { wkv().delete(id); } catch { /* stray blob — pruned on next launch */ }
}

/** A night's stored series, or null when it was logged by hand. */
export const getSleepSeries = (dk: string): WaveformData | null => getWaveform(sleepWaveformId(dk));

/** Drop sidecar blobs whose entry no longer exists (deleted while the
 *  journal write raced a crash, or left behind by an older build). */
function pruneWaveforms(s: AppState) {
  try {
    const ids = waveformIds(s);
    for (const k of wkv().getAllKeys()) {
      if (!ids.has(k)) { wkv().delete(k); waveCache.delete(k); }
    }
  } catch {
    // best effort — strays cost bytes, not correctness
  }
}

// State normalization (the import + load funnel) lives in src/lib/migrate.ts
// so it stays pure and unit-testable; re-exported here for existing callers.
export { blankDay, migrate };

/** Set when launch found no persisted journal ('fresh') or an unreadable one
 *  ('corrupt', with the raw blob when it could at least be read). RestoreGate
 *  checks this to offer the on-device backup snapshots before onboarding. */
export let loadIssue: { kind: 'fresh' | 'corrupt'; raw?: string } | null = null;

function loadState(): AppState {
  let raw: string | undefined;
  try {
    raw = kv().getString(STORAGE_KEY);
    if (!raw) {
      loadIssue = { kind: 'fresh' };
      return defaultState();
    }
    const parsed = JSON.parse(raw);
    // A blob stamped with a newer schema (device-backup restore onto an older
    // binary) is about to be normalized down to this build's shape, dropping
    // fields this build doesn't know. Keep the original bytes recoverable —
    // the daily backups can't cover this: they snapshot post-migrate state and
    // rotate the pre-strip copies out within KEEP days.
    if (isPlainObject(parsed) && typeof parsed.version === 'number' && parsed.version > SCHEMA_VERSION) {
      try { kv().set(RECOVERY_KEY, raw); } catch { /* best effort */ }
    }
    const migrated = migrate(parsed);
    // Waveform arrays historically lived inline on HRV readings. Move them to
    // the sidecar (sidecar written first, journal persisted after — a crash in
    // between just re-runs the idempotent move next launch), then drop sidecar
    // blobs whose reading is gone.
    const movedWaveforms = extractWaveforms(migrated, putWaveform);
    pruneWaveforms(migrated);
    // Older builds imported HRV without recording how much RR it covered, so
    // journals can hold short Apple/Health Connect samples that skew every
    // average. Stamp their real coverage from the sidecar — readings that never
    // had a beat series get 0 and stay excluded (see src/lib/hrvQuality.ts).
    // Uncached read: this walks the sidecar once and must not evict the entries
    // the Journal is about to render.
    const stampedHrv = stampImportedHrvCoverage(migrated, (id) => readWaveformUncached(id)?.rrRaw);
    // If a one-time migration (sleep reframing, waveform extraction, HRV
    // coverage) ran, persist immediately so it can't re-run next launch.
    if (movedWaveforms || stampedHrv || !(parsed && parsed.meta && parsed.meta.sleepReframed)) {
      try { kv().set(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* keep in memory */ }
    }
    return migrated;
  } catch {
    loadIssue = { kind: 'corrupt', raw };
    // Stash the unreadable blob before the next save() overwrites it, so the
    // data stays recoverable (e.g. by a future parser fix) even after the app
    // starts writing a fresh journal over STORAGE_KEY.
    if (raw) {
      try { kv().set(RECOVERY_KEY, raw); } catch { /* best-effort */ }
    }
    return defaultState();
  }
}

/* ---------- external store ---------- */
let state: AppState = loadState();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let cachedSnapshot: { state: AppState; v: number } = { state, v: snapshotVersion };

function emit() {
  snapshotVersion++;
  cachedSnapshot = { state, v: snapshotVersion };
  listeners.forEach((l) => l());
}

function persistNow() {
  if (__DEV__) {
    // Tripwire: every write path must route waveform arrays through the
    // sidecar (storeWaveform) — an inline array here means one was missed and
    // the journal blob is growing again.
    const offender = findEmbeddedWaveform(state);
    if (offender) console.warn(`[store] inline waveform persisted on ${offender} — route it through storeWaveform()`);
  }
  try {
    kv().set(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // storage error — state stays in memory. Worth recording: a journal that
    // silently stops persisting looks exactly like one that lost a day's
    // entries on the next launch, and nothing on screen says so.
    logError('store.persist', e);
  }
}

// Persist is debounced so a tap never pays for stringifying the journal; the
// app leaving the foreground is the durability backstop (see flushSave).
const persister = createDebouncedWriter(persistNow, 400);

/* `state.days` gets a fresh reference only when a day was actually touched, so
 * the O(history) useMemos keyed on `days` (Analysis sections, milestones,
 * insights hasData) skip settings-only saves instead of recomputing the whole
 * journal. Every day-writing path already funnels through ensureDay /
 * upsertEntry / deleteEntry / mutate / replaceState, each of which marks this —
 * new code that writes state.days must use one of those, never getState(). */
let daysTouched = true; // first save after load must re-wrap
function touchDays() { daysTouched = true; }

/** Centralized persistence — stamps meta.lastUpdated on every call.
 *  Memory + React notification are synchronous; the disk write is debounced.
 *  Re-wraps `state` (and, when a day was touched, the days map) in fresh
 *  objects before emitting: mutations happen in place, so without new
 *  references useSyncExternalStore consumers and any useMemo keyed on
 *  `state.days` would never see a change (readings used to appear in Progress
 *  only after an unrelated re-render). */
export function save() {
  state = {
    ...state,
    days: daysTouched ? { ...state.days } : state.days,
    meta: { ...(state.meta || { lastImport: null }), lastUpdated: new Date().toISOString() },
  };
  daysTouched = false;
  persister.schedule();
  // A save issued while the app isn't foregrounded can't trust the debounce
  // timer — iOS freezes timers on suspend — so it writes through immediately.
  try {
    if (RNAppState.currentState !== 'active') persister.flush();
  } catch { /* no AppState here (jest / bare node) */ }
  emit();
}

/** Force any debounced journal write to disk now. Called on every foreground
 *  exit; exposed for the rare caller that must not ride the debounce window. */
export function flushSave() {
  persister.flush();
}

// iOS delivers 'inactive' (app-switcher, lock, incoming call overlay) before
// 'background' — flushing on the first non-active transition means even an
// app-switcher swipe-kill persists the last edit. Guarded: AppState is absent
// under jest / bare node.
try {
  RNAppState.addEventListener('change', (next) => {
    if (next !== 'active') persister.flush();
  });
} catch {
  // no AppState here — flushSave() remains available to callers
}

/** Apply a mutation to state and persist. Conservatively assumes the mutation
 *  may have touched days — the generic escape hatch stays safe by default. */
export function mutate(fn: (s: AppState) => void) {
  touchDays();
  fn(state);
  save();
}

export function getState(): AppState {
  return state;
}

/** Replace all state (import). Records lastImport, persists, notifies.
 *  Throws (before touching anything) on a newer-schema file — UI callers
 *  should pre-check with assertImportVersion() for a friendly error. */
export function replaceState(parsed: unknown, importName?: string) {
  assertImportVersion(parsed);
  state = migrate(parsed);
  touchDays();
  // Rebuild the waveform sidecar to match the imported journal: old exports
  // embed arrays per entry (stripped out here), new exports carry a top-level
  // `waveforms` map keyed by reading id — both shapes import.
  waveCache.clear();
  try {
    wkv().clearAll();
    extractWaveforms(state, putWaveform);
    const imported = collectImportWaveforms(parsed, waveformIds(state));
    for (const id of Object.keys(imported)) putWaveform(id, imported[id]);
  } catch {
    // waveforms are best-effort — the journal itself is intact without them
  }
  if (importName) state.meta.lastImport = { name: importName, at: new Date().toISOString() };
  // A retained Insights finding is a claim about the journal it was computed
  // from; letting one coast at the loose bar over a different journal would
  // break the strict-entry rule.
  resetFindingMemory();
  save();
  // Imports are rare and irreversible-feeling — don't ride the debounce window.
  persister.flush();
}

/** Erase the journal: both MMKV instances (journal + recovery blob + waveform
 *  sidecar) and the in-memory state, back to a fresh install's defaults. The
 *  daily backup snapshots are plaintext files, not MMKV — callers must clear
 *  those too (deleteAllBackups) or the data stays readable in the Files app.
 *  The blank state is written straight back so the next launch loads it rather
 *  than seeing an empty store and offering RestoreGate. */
export function clearAllData() {
  try { kv().clearAll(); } catch { /* the overwrite below still lands */ }
  try { wkv().clearAll(); } catch { /* strays pruned on next launch */ }
  waveCache.clear();
  // Unlike the rest of the flags MMKV (which is about the person, not the
  // journal), these four are claims ABOUT the erased data and would otherwise
  // outlive it: a retained Insights finding, the report cached from it, the
  // Trend card's pinned headline (still live for the rest of the journal day, so
  // a wiped app keeps congratulating the user on numbers it no longer holds),
  // and the chosen "day one", which now points at a day that does not exist.
  resetFindingMemory();
  resetInsightsCache();
  resetTrendMemory();
  setInsightsAnchor(null);
  state = defaultState();
  touchDays();
  // save() stamps meta.lastUpdated, which also keeps onboarding from re-firing
  // on an app the user has merely reset.
  save();
  persister.flush();
}

/* ---------- day accessors ---------- */
export function getDay(k: string): DayRecord {
  return state.days[k] || blankDay();
}
/** get-or-create a day record (mutating callers pass create=true) */
export function ensureDay(k: string): DayRecord {
  touchDays(); // every caller mutates the returned record before save()
  if (!state.days[k]) state.days[k] = blankDay();
  return state.days[k];
}

export function upsertEntry(dk: string, arrKey: 'readings' | 'activities' | 'meds' | 'symptoms', entry: Entry) {
  const d = ensureDay(dk);
  const arr = d[arrKey];
  const i = arr.findIndex((x) => x.id === entry.id);
  if (i >= 0) arr[i] = entry;
  else arr.push(entry);
  save();
}

/** Deleting a health-imported entry is a permanent "no thanks" — record it so
 *  the import pill never offers that sample back (src/lib/health/declined.ts).
 *  Settings → Apple Health's manual check still shows it. */
function noteDeclinedImport(dk: string, arrKey: 'readings' | 'activities' | 'meds' | 'symptoms', entry: Entry | undefined) {
  if (!entry?.imported) return;
  const kind = arrKey === 'readings' ? 'reading' : arrKey === 'activities' ? 'workout' : arrKey === 'meds' ? 'med' : null;
  if (!kind) return;
  const keys = [importFingerprint(dk, kind, entry.type, String(entry.time || ''))];
  if (typeof entry.healthKey === 'string') keys.push(entry.healthKey);
  markDeclinedKeys(keys);
}

export function deleteEntry(dk: string, arrKey: 'readings' | 'activities' | 'meds' | 'symptoms', id: string) {
  const d = ensureDay(dk);
  noteDeclinedImport(dk, arrKey, d[arrKey].find((x) => x.id === id));
  d[arrKey] = d[arrKey].filter((x) => x.id !== id);
  // Only readings carry sidecar waveforms; drop the blob with its entry.
  if (arrKey === 'readings') {
    waveCache.delete(id);
    try { wkv().delete(id); } catch { /* stray blob — pruned on next launch */ }
  }
  save();
}

/** Non-React subscription to any store change (used by the watch relay to
 *  re-push profile context). Returns the unsubscribe. */
export function subscribeStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* ---------- React binding ---------- */
export function useStore<T>(selector: (snap: { state: AppState; v: number }) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selector(cachedSnapshot),
    () => selector(cachedSnapshot),
  );
}

/** Convenience: re-render on any state change, return the live state. */
export function useAppState(): AppState {
  return useStore((s) => s.state);
}

/** Full journal as export JSON. Exports stay one self-contained file: sidecar
 *  waveforms ride along under a top-level `waveforms` map keyed by entry id
 *  (filtered to ids that exist, so a stray blob can't bloat exports forever).
 *  replaceState() accepts this shape and the old embedded-arrays shape alike.
 *
 *  `pretty` is for the human-facing export in Settings only. It is NOT free:
 *  indentation puts every RR interval and HR sample on its own line, so a year
 *  of waveforms inflates several-fold in both stringify time and bytes written.
 *  Machine-read callers (the daily backup) leave it off. */
export function serializeState(pretty = false): string {
  const out: Record<string, unknown> = { ...state };
  try {
    const ids = waveformIds(state);
    const waveforms: Record<string, WaveformData> = {};
    for (const id of wkv().getAllKeys()) {
      if (!ids.has(id)) continue;
      const w = readWaveformUncached(id);
      if (w) waveforms[id] = w;
    }
    if (Object.keys(waveforms).length) out.waveforms = waveforms;
  } catch {
    // export without waveforms rather than fail the export
  }
  return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}

/** Storage facts for the support dump (src/lib/diagnostics/collectApp.ts):
 *  how big the journal blob is, how many waveform blobs sit beside it, and
 *  whether either instance ended up encrypted. Nothing here reads a value —
 *  sizes and key counts only, so it stays cheap and carries no health data.
 *  `encrypted: false` means the Keychain was unavailable and both stores fell
 *  back to plaintext, which is worth knowing when a journal reads as empty
 *  after a restore. */
export function storageStats(): {
  journalBytes: number | null; waveformCount: number | null; waveformBytes: number | null;
  encrypted: boolean; orphanWaveforms: number | null;
} {
  const out = {
    journalBytes: null as number | null,
    waveformCount: null as number | null,
    waveformBytes: null as number | null,
    encrypted: !!encryptionKey(),
    orphanWaveforms: null as number | null,
  };
  try { out.journalBytes = kv().getString(STORAGE_KEY)?.length ?? 0; } catch { /* unreadable */ }
  try {
    const ids = waveformIds(state);
    const keys = wkv().getAllKeys();
    out.waveformCount = keys.length;
    out.orphanWaveforms = keys.filter((k) => !ids.has(k)).length;
    out.waveformBytes = keys.reduce((n, k) => {
      try { return n + (wkv().getString(k)?.length ?? 0); } catch { return n; }
    }, 0);
  } catch { /* unreadable */ }
  return out;
}

export { STORAGE_KEY, keyOf };
