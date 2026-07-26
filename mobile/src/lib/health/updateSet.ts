/**
 * Pure core of the periodic health-store update check: given a day's raw
 * platform reads and the journal day they'd land in, decide what is actually
 * importable — never our own write-backs, never anything that would duplicate
 * an existing entry. Kept free of react-native/store imports so the dedup
 * rules run in jest; the fetching/writing shell lives in ./updates.
 *
 * What qualifies:
 *  - Sleep: last night's session, only while the day has no bed/wake yet.
 *  - Readings: HRV with real beat-to-beat RR covering ≥ 4 minutes, resting HR,
 *    and blood pressure — each deduped against the day's readings.
 *  - Exercises: the day's workouts, one row per session, excluding sessions
 *    this app authored (watch stand tests etc.).
 *  - Medications: doses that match a known med type by name (the platform
 *    read is a stub today — see HealthApi.readMedications).
 */
import type { DayRecord, TypeDef } from '../types';
import { fmtTime12 } from '../dates';
import type { ImportedMed, ImportedReading, ImportedWorkout, SleepImport } from './index';
import { workoutCandidateOf, type WorkoutCandidate } from './workoutCandidate';

/** Minimum RR coverage for an importable HRV reading (sum of intervals). */
const HRV_MIN_MS = 4 * 60 * 1000;
/** Two timestamps this close (minutes) are "the same moment" for dedup. */
const NEAR_MIN = 10;
/** A med dose within this window of a logged dose of the same type is a dupe. */
const MED_NEAR_MIN = 60;

export interface UpdateReading {
  key: string;
  type: 'hrv' | 'restingHr' | 'bp';
  time: string;                        // HH:MM local
  title: string;                       // "HRV 48 ms" / "118/76" / "Resting HR 58 bpm"
  sub: string;                         // "6:52 AM · 5 min"
  fields: Record<string, string>;      // prefilled entry fields
  rr?: number[];                       // beat-to-beat RR, destined for the sidecar
}

export interface UpdateMed {
  key: string;
  type: string;                        // med type key (registry or custom)
  time: string;
  title: string;
  sub: string;
  amount: string | null;
}

export interface HealthUpdateSet {
  dk: string;
  sleep: SleepImport | null;
  readings: UpdateReading[];
  workouts: WorkoutCandidate[];
  meds: UpdateMed[];
}

export function updateCount(set: HealthUpdateSet): number {
  return (set.sleep ? 1 : 0) + set.readings.length + set.workouts.length + set.meds.length;
}

/** Stable identity of the sleep row (its selection key is just 'sleep'). */
export const sleepItemKey = (s: SleepImport): string => `sleep-${s.bed}-${s.wake}`;

/** Every item's stable key — what the pill's "already shown this" memory holds. */
export function allItemKeys(set: HealthUpdateSet): string[] {
  return [
    ...(set.sleep ? [sleepItemKey(set.sleep)] : []),
    ...set.readings.map((r) => r.key),
    ...set.workouts.map((w) => w.key),
    ...set.meds.map((m) => m.key),
  ];
}

/** Drop items the user has already been shown (viewed the card, or dismissed
 *  the pill) so the pill never re-offers them; the Settings check skips this. */
export function filterSeen(set: HealthUpdateSet, seen: ReadonlySet<string>): HealthUpdateSet {
  return {
    dk: set.dk,
    sleep: set.sleep && !seen.has(sleepItemKey(set.sleep)) ? set.sleep : null,
    readings: set.readings.filter((r) => !seen.has(r.key)),
    workouts: set.workouts.filter((w) => !seen.has(w.key)),
    meds: set.meds.filter((m) => !seen.has(m.key)),
  };
}

/** Stable id of a result set — lets the pill remember "already dismissed this
 *  exact batch" without suppressing genuinely new items on the next check. */
export function updateSignature(set: HealthUpdateSet): string {
  return [
    set.dk,
    set.sleep ? `sleep-${set.sleep.bed}-${set.sleep.wake}` : '',
    ...set.readings.map((r) => r.key),
    ...set.workouts.map((w) => w.key),
    ...set.meds.map((m) => m.key),
  ].join('|');
}

const toMin = (t: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const near = (a: unknown, b: unknown, tol: number): boolean => {
  const ma = toMin(a); const mb = toMin(b);
  return ma != null && mb != null && Math.abs(ma - mb) <= tol;
};

const rrTotalMs = (rr: number[] | undefined): number =>
  (rr || []).reduce((s, v) => s + v, 0);

/** What the raw platform reads hand `buildUpdateSet`. */
export interface RawHealthDay {
  imports: ImportedReading[];
  workouts: ImportedWorkout[];
  sleep: SleepImport | null;
  meds: ImportedMed[];
}

/** Filter a day's raw health-store reads down to what's actually importable. */
export function buildUpdateSet(
  dk: string,
  day: DayRecord | undefined,
  raw: RawHealthDay,
  medTypes: Record<string, TypeDef>,
): HealthUpdateSet {
  const readings = day?.readings || [];
  const activities = day?.activities || [];
  const meds = day?.meds || [];

  const out: HealthUpdateSet = { dk, sleep: null, readings: [], workouts: [], meds: [] };

  // Sleep — only while the day has none, so an edited night is never fought over.
  if (raw.sleep && !(day?.sleep?.bed && day?.sleep?.wake)) out.sleep = raw.sleep;

  for (const im of raw.imports) {
    if (im.ownApp) continue;
    if (im.type === 'hrv') {
      // Only trustworthy HRV: real beat-to-beat RR spanning at least 4 minutes
      // (SDNN-only samples carry no series and are excluded outright).
      if (!im.rr || rrTotalMs(im.rr) < HRV_MIN_MS) continue;
      if (readings.some((e) => (e.type === 'hrv' || e.type === 'breathHrv') && near(e.time, im.time, NEAR_MIN))) continue;
      const ms = im.fields.sdnn ?? im.fields.rmssd;
      out.readings.push({
        key: `hrv-${im.startMs}`, type: 'hrv', time: im.time,
        title: ms != null ? `HRV ${ms} ms` : 'HRV reading',
        sub: `${fmtTime12(im.time)} · ${Math.round(rrTotalMs(im.rr) / 60000)} min`,
        fields: im.fields, rr: im.rr,
      });
    } else if (im.type === 'restingHr') {
      // Apple's resting HR is ~one derived sample a day; a same-value or
      // same-moment entry already in the journal makes it a dupe.
      if (readings.some((e) => e.type === 'restingHr' && (String(e.hr) === im.fields.hr || near(e.time, im.time, NEAR_MIN)))) continue;
      out.readings.push({
        key: `restingHr-${im.startMs}`, type: 'restingHr', time: im.time,
        title: `Resting HR ${im.fields.hr} bpm`, sub: fmtTime12(im.time),
        fields: { hr: im.fields.hr, position: im.fields.position || 'Laying' },
      });
    } else if (im.type === 'bp') {
      if (readings.some((e) => e.type === 'bp'
        && ((String(e.sys) === im.fields.sys && String(e.dia) === im.fields.dia) || near(e.time, im.time, NEAR_MIN)))) continue;
      out.readings.push({
        key: `bp-${im.startMs}`, type: 'bp', time: im.time,
        title: `${im.fields.sys}/${im.fields.dia}`, sub: fmtTime12(im.time),
        fields: { sys: im.fields.sys, dia: im.fields.dia },
      });
    }
  }
  out.readings.sort((a, b) => a.time.localeCompare(b.time));

  for (const w of raw.workouts) {
    // Never re-offer this app's own sessions (watch stand tests, published
    // captures) or a workout already logged at the same time.
    if (w.ownApp) continue;
    if (activities.some((e) => e.type === w.type && near(e.time, w.time, NEAR_MIN))) continue;
    out.workouts.push(workoutCandidateOf(w));
  }

  const medLabelToKey = new Map(Object.keys(medTypes).map((k) => [medTypes[k].label.toLowerCase(), k]));
  for (const m of raw.meds) {
    if (m.ownApp) continue;
    const key = medLabelToKey.get(m.name.trim().toLowerCase());
    if (!key) continue; // no matching med type — nothing sane to file it under
    if (meds.some((e) => e.type === key && near(e.time, m.time, MED_NEAR_MIN))) continue;
    out.meds.push({
      key: `med-${key}-${m.startMs}`, type: key, time: m.time,
      title: medTypes[key].label,
      sub: [m.amount, fmtTime12(m.time)].filter(Boolean).join(' · '),
      amount: m.amount,
    });
  }

  return out;
}
