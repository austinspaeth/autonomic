/**
 * Effectful shell of the periodic health-store update check behind the import
 * pill (src/features/HealthUpdates.tsx) and Settings → Apple Health → "Check
 * for updates". The dedup rules themselves are pure and live in ./updateSet.
 *
 * The product model: at most once an hour (plus once per launch), quietly look
 * at today's Apple Health / Health Connect data and offer ONLY what the journal
 * doesn't already have. `importUpdates` writes the accepted items through the
 * store's normal entry paths (scores + waveform sidecar included).
 */
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import type { Entry } from '../types';
import { computeScores } from '../scoring';
import { addDays, todayKey, uid } from '../dates';
import { typesFor } from '../typeCatalog';
import { rrCoverageSec } from '../hrvQuality';
import { ensureDay, getState, save, storeWaveform, upsertEntry } from '../../store/store';
import { health, healthAppName, type ImportedMed, type ImportedReading, type ImportedWorkout } from './index';
import {
  allItemKeys, buildUpdateSet, filterDeclined, filterSeen, updateCount, updateSignature,
  type HealthUpdateSet, type UpdateMed, type UpdateReading,
} from './updateSet';
import { getDeclinedKeys } from './declined';
import { withAuthTimeout } from './askedAuth';

export { allItemKeys, filterDeclined, filterSeen, updateCount, updateSignature };
export { getDeclinedKeys, markDeclinedKeys } from './declined';
export type { HealthUpdateSet, UpdateMed, UpdateReading };

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
 */
export async function checkHealthUpdates(dk: string, opts: { sinceMs?: number; includeSleep?: boolean } = {}): Promise<HealthUpdateSet | null> {
  const api = health();
  const s = getState();
  if (!api.available || !s.settings.healthEnabled) return null;
  await withAuthTimeout(api.requestAuth());
  const [imports, workouts, sleep, meds] = await Promise.all([
    api.readImports(dk).catch(() => [] as ImportedReading[]),
    api.readWorkouts(dk).catch(() => [] as ImportedWorkout[]),
    opts.includeSleep === false ? Promise.resolve(null) : api.readSleep(dk).catch(() => null),
    api.readMedications(dk).catch(() => [] as ImportedMed[]),
  ]);
  const after = <T extends { startMs: number }>(rows: T[]): T[] =>
    opts.sinceMs != null ? rows.filter((r) => r.startMs >= opts.sinceMs!) : rows;
  return buildUpdateSet(dk, s.days[dk], {
    imports: after(imports), workouts: after(workouts), sleep, meds: after(meds),
  }, typesFor(s, 'meds'));
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
    checkHealthUpdates(addDays(today, -1), { sinceMs, includeSleep: false }),
    checkHealthUpdates(today, { sinceMs }),
  ]);
  return [yesterday, current].filter((s): s is HealthUpdateSet => !!s && updateCount(s) > 0);
}

/** What one import wrote: the item count, plus the workout entries themselves
 *  so a single imported workout can be shown as its report (features/HealthUpdates). */
export interface ImportResult { added: number; workouts: Entry[] }

/**
 * Write the chosen items into the journal through the normal entry paths.
 * `selected` holds item keys (plus 'sleep' for the sleep row); null imports
 * everything in the set. Returns what was written.
 */
export function importUpdates(set: HealthUpdateSet, selected: Set<string> | null): ImportResult {
  const take = (key: string) => selected == null || selected.has(key);
  const s = getState();
  const ctx = { sex: s.profile.sex, height: s.profile.height };
  // Match the one-time history import's provenance so journal rows label
  // identically ("Apple Watch HRV" / "Imported HRV").
  const source = Platform.OS === 'android' ? 'health' : 'watch';
  const note = `From ${healthAppName()}`;
  let added = 0;
  const workouts: Entry[] = [];

  for (const r of set.readings) {
    if (!take(r.key)) continue;
    // healthKey rides on the entry so that deleting it can permanently decline
    // this exact sample (see ./declined + deleteEntry in store).
    const entry: Entry = { id: uid(), type: r.type, time: r.time, note, source, imported: true, healthKey: r.key, ...r.fields };
    // RR coverage rides on the entry: it's what decides, forever after, whether
    // this imported reading is long enough to trust (src/lib/hrvQuality.ts).
    if (r.type === 'hrv') entry.durationSec = rrCoverageSec(r.rr);
    if (r.rr) storeWaveform(entry.id, { rrRaw: r.rr });
    entry.scores = computeScores(entry, ctx);
    upsertEntry(set.dk, 'readings', entry);
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
    const amount = m.amount ? (m.amount.match(/[\d.]+/)?.[0] ?? '') : '';
    const entry: Entry = { id: uid(), type: m.type, time: m.time, note, amount, imported: true, healthKey: m.key };
    upsertEntry(set.dk, 'meds', entry);
    added++;
  }

  if (set.sleep && take('sleep')) {
    const d = ensureDay(set.dk);
    d.sleep = {
      ...d.sleep,
      bed: set.sleep.bed,
      wake: set.sleep.wake,
      quality: set.sleep.interrupted ? 'interrupted' : (d.sleep?.quality || 'good'),
      ...(set.sleep.hrLow != null ? { hrLow: set.sleep.hrLow } : {}),
      ...(set.sleep.hrHigh != null ? { hrHigh: set.sleep.hrHigh } : {}),
    };
    // Stages describe the imported night; drop any from a previous import.
    if (set.sleep.stages) d.sleep.stages = set.sleep.stages;
    else delete d.sleep.stages;
    save();
    added++;
  }

  return { added, workouts };
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

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Module-scoped on purpose: a fresh launch always checks ("on mount if it
// hasn't checked in a while" — a new process hasn't), then foregrounds
// re-check at most hourly. Not worth a persisted timestamp.
let lastAutoCheck = 0;

export function dueForAutoCheck(now = Date.now()): boolean {
  return now - lastAutoCheck >= CHECK_INTERVAL_MS;
}
export function markAutoChecked(now = Date.now()): void {
  lastAutoCheck = now;
}
