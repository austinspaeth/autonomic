/**
 * Effectful shell of the periodic health-store update check behind the import
 * pill (src/features/HealthUpdates.tsx) and Settings → Apple Health → "Check
 * for updates". The dedup rules themselves are pure and live in ./updateSet.
 *
 * The product model: on launch, on every foreground and on the Journal's
 * pull-to-refresh, quietly look at today's Apple Health / Health Connect data
 * and offer ONLY what the journal doesn't already have. There is deliberately
 * no throttle on the check itself (opening the app IS the request to bring it
 * up to date); the one paced part is the pair of "what you log in Health
 * itself" reads, for the reason in ./logsSweep. `importUpdates` writes the
 * accepted items through the store's normal entry paths (scores + waveform
 * sidecar included).
 */
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import type { Entry } from '../types';
import { computeScores, profileCtx } from '../scoring';
import { addDays, todayKey, uid } from '../dates';
import { addCustomType, typesFor } from '../typeCatalog';
import { rrCoverageSec } from '../hrvQuality';
import { rrWaveform } from '../waveforms';
import { applyIntent, claimWatchIntent } from '../garmin/intent';
import { logError } from '../diagnostics/errorLog';
import { deleteEntry, ensureDay, getState, save, storeSleepSeries, storeWaveform, upsertEntry } from '../../store/store';
import {
  health, healthAppName, medicationsSupported,
  type ImportedMed, type ImportedReading, type ImportedSymptom, type ImportedWorkout,
} from './index';
import { logsSweepDue, noteLogsSweep } from './logsSweep';
import { logsSweepMemory, saveLogsSweepMemory } from './logsSweepMemory';
import {
  allItemKeys, buildUpdateSet, emptyUpdateSet, filterDeclined, filterSeen, splitForReview,
  sleepToFile, updateCount, updateSignature,
  type HealthUpdateSet, type ReviewItem, type UpdateMed, type UpdateReading, type UpdateSymptom,
} from './updateSet';
import { withAuthTimeout } from './askedAuth';
import { workoutCandidateOf } from './workoutCandidate';
import { correctedDistance } from './workoutDistance';

export { allItemKeys, emptyUpdateSet, filterDeclined, filterSeen, splitForReview, updateCount, updateSignature };
export { getDeclinedKeys, markDeclinedKeys } from './declined';
export type { HealthUpdateSet, ReviewItem, UpdateMed, UpdateReading, UpdateSymptom };

/**
 * Read a day's health-store data and reduce it to the importable set. Returns
 * null when Health isn't connected.
 *
 * Every check requests authorization first. It is self-gating (see
 * HealthApi.requestAuth): silent when the platform has nothing left to ask,
 * and at most one prompt per launch otherwise — but it must run, because a
 * permission we were never granted (a type added in an app update, a sheet the
 * user swiped away) otherwise reads back as "nothing new to import" forever.
 * It is also on a deadline: an unanswered (or never-presented) OS sheet leaves
 * that promise pending, and the check has to go on reading regardless — the
 * pill hanging on "Checking…" is worse than a check that ran unauthorized.
 *
 * `sinceMs` drops samples older than that instant (the Settings check's
 * 24-hour window); `includeSleep: false` skips the night read (used for the
 * yesterday half of that window — the night belongs to the day it ends on).
 * `explicit` marks a check the USER asked for, which bypasses the logs-read
 * throttle below (and only that — nothing else in a check is ever paced).
 */
export async function checkHealthUpdates(dk: string, opts: { sinceMs?: number; includeSleep?: boolean; explicit?: boolean } = {}): Promise<HealthUpdateSet | null> {
  const api = health();
  const s = getState();
  if (!api.available || !s.settings.healthEnabled) return null;
  await withAuthTimeout(api.requestAuth());
  // A failed read degrades to "nothing new", which is indistinguishable from a
  // quiet day — so each failure goes to the error log on its way to being
  // swallowed. This is the top suspect whenever health data never appears.
  const failed = (where: string) => (e: unknown) => { logError(`health.${where}`, e); };
  // What the user logs in Health ITSELF — symptoms, and on iOS 26 medication
  // doses — rides the Apple Health connect ask now rather than a toggle, so
  // the gate per read is the platform's own answer plus a throttle.
  //
  // The throttle is NOT the check's: `readSymptoms` is one native category
  // query per mapped type (23 of them) and this runs on every foreground, and
  // HealthKit never reports read grants, so somebody who DENIED the symptom
  // types in the connect sheet is indistinguishable from somebody with nothing
  // logged there and would be swept forever. See ./logsSweep — once an hour,
  // always on a new day, and always when the user asked.
  const sweep = logsSweepDue(logsSweepMemory(), dk, Date.now(), !!opts.explicit);
  // `shouldRequest` means the sheet has never been shown for these types,
  // which is the one honest question iOS allows here — there is nothing to
  // read. Health Connect answers `denied` (it has no symptom record at all),
  // so this is also what keeps the Android side from running a no-op read.
  const logsStatus = sweep
    ? await api.readAuthStatus('logs').catch(() => 'unknown' as const)
    : 'unknown' as const;
  const readSymptoms = sweep && logsStatus !== 'shouldRequest' && logsStatus !== 'denied';
  // Doses need iOS 26 (and the local module's own per-object grant, which the
  // Settings picker is the way to). Everywhere else the read answers [].
  const readMeds = sweep && await medicationsSupported().catch(() => false);
  // Note the ORDER: the throttle is asked first, so a check inside the hour
  // costs exactly what it did before the feature existed — no status read, no
  // support probe, and neither of the two queries.
  const [imports, workouts, sleep, meds, symptoms] = await Promise.all([
    api.readImports(dk).catch((e) => { failed('readImports')(e); return [] as ImportedReading[]; }),
    api.readWorkouts(dk).catch((e) => { failed('readWorkouts')(e); return [] as ImportedWorkout[]; }),
    opts.includeSleep === false ? Promise.resolve(null) : api.readSleep(dk).catch((e) => { failed('readSleep')(e); return null; }),
    readMeds ? api.readMedications(dk).catch((e) => { failed('readMedications')(e); return [] as ImportedMed[]; })
      : Promise.resolve([] as ImportedMed[]),
    readSymptoms ? api.readSymptoms(dk).catch((e) => { failed('readSymptoms')(e); return [] as ImportedSymptom[]; })
      : Promise.resolve([] as ImportedSymptom[]),
  ]);
  // Stamped only once a read actually went out, so a skipped one never pushes
  // the next sweep an hour further away.
  if (readSymptoms || readMeds) saveLogsSweepMemory(noteLogsSweep(dk, Date.now()));
  const after = <T extends { startMs: number }>(rows: T[]): T[] =>
    opts.sinceMs != null ? rows.filter((r) => r.startMs >= opts.sinceMs!) : rows;
  return buildUpdateSet(dk, s.days[dk], {
    imports: after(imports), workouts: after(workouts), sleep,
    meds: after(meds), symptoms: after(symptoms),
  }, { meds: typesFor(s, 'meds'), symptoms: typesFor(s, 'symptoms') });
}

/**
 * The Settings check: everything importable from the last 24 hours — spanning
 * yesterday + today — deliberately IGNORING the pill's "already shown" memory
 * (it still dedups against the journal). One set per day so imports land on
 * the right day key.
 */
export async function checkHealthUpdatesLast24h(): Promise<HealthUpdateSet[]> {
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  const today = todayKey();
  const [yesterday, current] = await Promise.all([
    checkHealthUpdates(addDays(today, -1), { sinceMs, includeSleep: false, explicit: true }),
    checkHealthUpdates(today, { sinceMs, explicit: true }),
  ]);
  return [yesterday, current].filter((s): s is HealthUpdateSet => !!s && updateCount(s) > 0);
}

/** What one import wrote: the item count, plus the workout entries and the
 *  beat-backed HRV readings themselves, so a single one can be shown as its
 *  report (features/HealthUpdates). */
export interface ImportResult { added: number; workouts: Entry[]; hrv: Entry[] }

/**
 * Write the chosen items into the journal through the normal entry paths.
 * `selected` holds item keys (plus 'sleep' for the sleep row); null imports
 * everything in the set. Returns what was written.
 */
export function importUpdates(set: HealthUpdateSet, selected: Set<string> | null): ImportResult {
  const take = (key: string) => selected == null || selected.has(key);
  const s = getState();
  const ctx = profileCtx(s.profile);
  // Match the one-time history import's provenance so journal rows label
  // identically ("Apple Watch HRV" / "Imported HRV").
  const source = Platform.OS === 'android' ? 'health' : 'watch';
  const note = `From ${healthAppName()}`;
  let added = 0;
  const workouts: Entry[] = [];
  const hrv: Entry[] = [];

  for (const r of set.readings) {
    if (!take(r.key)) continue;
    // healthKey rides on the entry so that deleting it can permanently decline
    // this exact sample (see ./declined + deleteEntry in store).
    let entry: Entry = { id: uid(), type: r.type, time: r.time, note, source, imported: true, healthKey: r.key, ...r.fields };
    // RR coverage rides on the entry: it's what decides, forever after, whether
    // this imported reading is long enough to trust (src/lib/hrvQuality.ts).
    if (r.type === 'hrv') {
      entry.durationSec = rrCoverageSec(r.rr);
      // How good the beats behind it were — the same three the results card
      // stamps on a live capture, so an imported reading can still be judged on
      // its own quality once this sheet is gone. Only when there was a series
      // to grade: absent means UNKNOWN, never clean.
      if (r.quality) {
        entry.artifactPct = r.quality.artifactPct;
        entry.confidence = r.quality.confidence;
        entry.beatCount = r.quality.beatCount;
      }
    }
    // A watch reading has no kind of its own: the session the phone started
    // for it says (`claimWatchIntent`), and otherwise its card asks.
    if (r.type === 'hrv' && r.rr && source === 'watch') {
      const intent = r.startMs != null ? claimWatchIntent(r.startMs) : null;
      entry = intent ? applyIntent(entry, intent) : { ...entry, kindOpen: true };
    }
    if (r.rr) storeWaveform(entry.id, rrWaveform({ ...r, rr: r.rr }));
    entry.scores = computeScores(entry, ctx);
    upsertEntry(set.dk, 'readings', entry);
    if (r.type === 'hrv' && r.rr) hrv.push(entry);
    added++;
  }

  for (const w of set.workouts) {
    if (!take(w.key)) continue;
    const entry: Entry = { id: uid(), type: w.type, time: w.time, note: '', source: 'health', imported: true, healthKey: w.key, ...w.entry };
    if (w.hrSeries?.length) storeWaveform(entry.id, { sampledHr: w.hrSeries });
    entry.scores = computeScores(entry, ctx);
    upsertEntry(set.dk, 'activities', entry);
    workouts.push(entry);
    added++;
  }

  for (const m of set.meds) {
    if (!take(m.key)) continue;
    // A type the user has no row for yet (their Health list is the authority on
    // what they take). Resolved against the catalog first: `addCustomType`
    // refuses a duplicate label, and between the check and here the user may
    // have created it themselves, or two doses of the same new medication may
    // be in one batch.
    let type = m.type;
    if (m.create) {
      const want = m.create.label.trim().toLowerCase();
      const catalog = typesFor(getState(), 'meds');
      const existing = Object.keys(catalog)
        .find((k) => catalog[k].label.trim().toLowerCase() === want);
      const made = existing ?? addCustomType('meds', m.create.label);
      if (!made) continue;            // a label the catalog would not take
      type = made;
    }
    // The amount is filed WHOLE, unit included ("400 mg", "2 capsules"): the
    // dose field is free text that already holds its unit everywhere else in
    // the app, and the digits alone turned every dose into a bare number whose
    // unit the user had to remember. Spreadsheet sums still parse it
    // (lib/export/csv parseFloats the field).
    const entry: Entry = {
      id: uid(), type, time: m.time, note, amount: m.amount ?? '',
      imported: true, healthKey: m.key,
    };
    upsertEntry(set.dk, 'meds', entry);
    added++;
  }

  for (const y of set.symptoms) {
    if (!take(y.key)) continue;
    // Severity rides the NOTE rather than a field: the journal's built-in
    // symptoms carry none, and inventing one from an import would put a field
    // on an entry the log form cannot edit.
    const entry: Entry = {
      id: uid(), type: y.type, time: y.time,
      note: y.severity ? `${y.severity} · ${note}` : note,
      imported: true, healthKey: y.key,
    };
    upsertEntry(set.dk, 'symptoms', entry);
    added++;
  }

  if (set.sleep && take('sleep')) {
    const d = ensureDay(set.dk);
    // Replacing a night an earlier check imported: its quality was that read's
    // verdict, not the user's, so the new read decides it.
    const kept = d.sleep?.imported ? 'good' : (d.sleep?.quality || 'good');
    d.sleep = {
      ...d.sleep,
      bed: set.sleep.bed,
      wake: set.sleep.wake,
      quality: set.sleep.interrupted ? 'interrupted' : kept,
      ...(set.sleep.hrLow != null ? { hrLow: set.sleep.hrLow } : {}),
      ...(set.sleep.hrHigh != null ? { hrHigh: set.sleep.hrHigh } : {}),
      imported: true,
    };
    // Stages describe the imported night; drop any from a previous import.
    if (set.sleep.stages) d.sleep.stages = set.sleep.stages;
    else delete d.sleep.stages;
    storeSleepSeries(set.dk, set.sleep);
    save();
    added++;
  }

  return { added, workouts, hrv };
}

/**
 * Undo an auto-import: delete the entries carrying these health item keys.
 *
 * The receipt's checkboxes mean REMOVE, and this is what they commit. It goes
 * through `deleteEntry`, which is the whole point — that path already records
 * the sample in the permanent declined list (./declined), so unticking a row
 * both takes the entry back out of the journal and guarantees the same sample
 * is never imported again. Settings → Apple Health still finds it, exactly as
 * it finds anything else the user once deleted.
 *
 * Sleep is not here: it is a field on the day rather than an entry, so there is
 * no entry to delete and nothing to record a decline against. The receipt shows
 * the night without a checkbox for that reason.
 */
export function undoImports(dk: string, keys: readonly string[]): number {
  const day = getState().days[dk];
  if (!day || !keys.length) return 0;
  const wanted = new Set(keys);
  let removed = 0;
  for (const arrKey of ['readings', 'activities', 'meds', 'symptoms'] as const) {
    // Snapshot first: deleteEntry rewrites the array as we walk it.
    for (const e of [...(day[arrKey] || [])]) {
      if (typeof e.healthKey === 'string' && wanted.has(e.healthKey)) {
        deleteEntry(dk, arrKey, e.id);
        removed++;
      }
    }
  }
  return removed;
}

/* ---------- one-time repair of nights read early ---------- */

// Before 1.36 a night was final once filed, and Android filed the longest
// single Health Connect session rather than the stitched night, so a split
// night stayed split for good. Today's night heals on the next check now
// (`sleepToFile`); this walks the recent past ONCE and gives every imported,
// unedited night the same chance. Never requests a permission.
// 1.37 runs it again (new key): a night with a waking of 2h or more that the
// watch recorded as Awake was split there on iOS too, and filed as one half.
const KEY_SLEEP_REPAIRED = 'sleepStitchRepaired2';
const REPAIR_DAYS = 30;

export async function repairSplitNights(): Promise<number> {
  const api = health();
  const s = getState();
  if (!api.available || !s.settings.healthEnabled) return 0;
  try { if (seenStore()?.getBoolean(KEY_SLEEP_REPAIRED)) return 0; } catch { return 0; }
  const today = todayKey();
  let repaired = 0;
  for (let i = 0; i < REPAIR_DAYS; i++) {
    const dk = addDays(today, -i);
    const night = getState().days[dk]?.sleep;
    if (!night?.imported || night.edited) continue;
    try {
      const sleep = sleepToFile(getState().days[dk]?.sleep, await api.readSleep(dk));
      if (sleep) repaired += importUpdates({ ...emptyUpdateSet(dk), sleep }, null).added;
    } catch (e) { logError('health.repairSleep', e); }
  }
  try { seenStore()?.set(KEY_SLEEP_REPAIRED, true); } catch { /* runs again next launch */ }
  return repaired;
}

/* ---------- one-time repair of inflated workout distances ---------- */

// Before 1.38.1 an Android workout's distance summed EVERY app's Distance
// records inside the session, so a Garmin run plus the phone's own step-based
// distance was filed at nearly twice its length (./workoutDistance). This
// re-reads each imported Android workout that carries a distance, once, and
// lowers the ones the corrected read says were inflated. Only distance moves:
// the rest of the entry, its note and its HR trace are left as they are.
// Never requests a permission; a launch without Health flags nothing, so it
// runs on a later one.
const KEY_DISTANCE_REPAIRED = 'workoutDistanceRepaired';
const DISTANCE_REPAIR_DAYS = 400;  // the backfill reaches back a year

export async function repairWorkoutDistances(): Promise<number> {
  if (Platform.OS !== 'android') return 0;
  const api = health();
  if (!api.available || !getState().settings.healthEnabled) return 0;
  try { if (seenStore()?.getBoolean(KEY_DISTANCE_REPAIRED)) return 0; } catch { return 0; }
  const oldest = addDays(todayKey(), -DISTANCE_REPAIR_DAYS);
  const days = Object.entries(getState().days)
    .filter(([dk, d]) => dk >= oldest && (d.activities || []).some(
      (e) => e.imported && typeof e.healthKey === 'string' && Number(e.distance) > 0))
    .map(([dk]) => dk);
  let fixed = 0;
  for (const dk of days) {
    try {
      const fresh = new Map((await api.readWorkouts(dk)).map((w) => [workoutCandidateOf(w).key, w]));
      for (const e of [...(getState().days[dk]?.activities || [])]) {
        if (!e.imported || typeof e.healthKey !== 'string') continue;
        const w = fresh.get(e.healthKey);
        const distance = w ? correctedDistance(e.distance, w.distanceMi) : null;
        if (distance == null) continue;
        const entry: Entry = { ...e, distance };
        entry.scores = computeScores(entry, profileCtx(getState().profile));
        upsertEntry(dk, 'activities', entry);
        fixed++;
      }
    } catch (e) { logError('health.repairDistance', e); }
  }
  try { seenStore()?.set(KEY_DISTANCE_REPAIRED, true); } catch { /* runs again next launch */ }
  return fixed;
}

/* ---------- "already shown" memory ---------- */

// Items the user has already been offered by the pill (viewed the card or
// dismissed it) — the pill never re-offers these; Settings ignores them.
// Lives in the plaintext flags MMKV (see src/store/tier.ts for the pattern):
// it's opaque item keys only, must not ride export/import, and should survive
// "Erase journal". Entries are pruned after 48h — by then the 24h Settings
// window has moved past them anyway.
const FLAGS_ID = 'autonomic.flags';
const KEY_SEEN = 'healthUpdatesSeen';
const SEEN_TTL_MS = 48 * 60 * 60 * 1000;

let seenKv: MMKV | null | undefined;
let seenMem: Record<string, number> | null = null; // in-memory fallback + cache
function seenStore(): MMKV | null {
  if (seenKv !== undefined) return seenKv;
  try { seenKv = new MMKV({ id: FLAGS_ID }); } catch { seenKv = null; }
  return seenKv;
}
function loadSeen(): Record<string, number> {
  if (seenMem) return seenMem;
  let parsed: Record<string, number> = {};
  try {
    const raw = seenStore()?.getString(KEY_SEEN);
    if (raw) parsed = JSON.parse(raw) as Record<string, number>;
  } catch { /* corrupt/missing — start clean */ }
  const cutoff = Date.now() - SEEN_TTL_MS;
  seenMem = Object.fromEntries(Object.entries(parsed).filter(([, at]) => at >= cutoff));
  return seenMem;
}

export function getSeenKeys(): Set<string> {
  return new Set(Object.keys(loadSeen()));
}

/** Remember that these items were shown (pill dismissed / card viewed). */
export function markSeenKeys(keys: string[]): void {
  if (!keys.length) return;
  const seen = loadSeen();
  const now = Date.now();
  keys.forEach((k) => { seen[k] = now; });
  try { seenStore()?.set(KEY_SEEN, JSON.stringify(seen)); } catch { /* in-memory only this session */ }
}

/* ---------- auto-check pacing ---------- */

// There is none, deliberately. EVERY foreground runs a check: opening the app
// IS the request to bring it up to date, and there is no background execution
// here, so a foreground is the only moment a check can happen at all. It used
// to be throttled to an hour, which meant a reading taken minutes ago was
// invisible unless the user remembered to pull the Journal down.
//
// Nothing is needed to keep that cheap. The check is silent unless it finds
// something the user has not already been offered (filterSeen / filterDeclined),
// and the pill's own runCheck refuses to start while a check is running or
// while the pill or the import card is on screen, so foregrounds cannot stack.
