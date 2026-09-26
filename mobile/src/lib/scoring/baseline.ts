/**
 * "Against this user's own normal" — the two primitives.
 *
 * Both were private to ./strain, where they answer "has this marker moved away
 * from the user's own 42-day baseline". The pacing budget asks the same
 * question of the same journal, and a second copy would be two places for the
 * coverage rule to drift. This population runs "abnormal" numbers every day of
 * the week and only the move away from their OWN normal means anything, so
 * these are the shape every comparison in the app takes.
 *
 * Pure: no store, no native, no React.
 */
import { median } from '../trends/compare';
import { addDays } from '../dates';
import { isTrustedReading } from '../hrvQuality';
import type { DaysMap } from './day';
import type { DayRecord, Entry, ScoreCat } from '../types';

export interface Shift {
  /** Median of the recent window. */
  r: number;
  /** Median of the baseline window. */
  b: number;
  delta: number;
  recentN: number;
  baseN: number;
}

/**
 * Median of each window plus the move between them, or null when EITHER window
 * is too thin to compare. The null is the point: a two-reading baseline that
 * quietly became a percentage is how an app tells somebody something confident
 * and false about their body.
 */
export function shift(recent: number[], base: number[], minRecent: number, minBase: number): Shift | null {
  if (recent.length < minRecent || base.length < minBase) return null;
  const r = median(recent);
  const b = median(base);
  if (!Number.isFinite(r) || !Number.isFinite(b)) return null;
  return { r, b, delta: r - b, recentN: recent.length, baseN: base.length };
}

/** Every entry value of one kind across a key range, flattened and filtered. */
export function pick(
  days: DaysMap,
  keys: string[],
  kind: 'activities' | 'readings' | 'symptoms',
  of: (e: Entry) => number | null,
): number[] {
  const out: number[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    (d[kind] || []).forEach((e: Entry) => {
      const v = of(e);
      if (v != null) out.push(v);
    });
  });
  return out;
}

/* ---------- the baseline HRV reading, against the user's own usual ---------- */

/** How far back a baseline reading is compared, and how many earlier days need
 *  one before "your usual" means anything. Below the bar the reading is graded
 *  on the absolute bands alone, never on a two-reading median. */
export const PERSONAL_WINDOW_DAYS = 42;
export const PERSONAL_MIN_READINGS = 5;

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

/**
 * The day's trusted baseline (`hrv`) readings in time order. The FIRST is the
 * one the day is built on — the snapshot taken before the day has had a say —
 * so every caller that wants "the baseline reading" means `[0]` of this.
 */
export function baselineReadings(d: DayRecord | undefined): Entry[] {
  return ((d && d.readings) || [])
    .filter((r) => r.type === 'hrv' && isTrustedReading(r))
    .sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
}

/** RMSSD of the day's first baseline reading that carries one, or null. */
export function firstBaselineRmssd(d: DayRecord | undefined): number | null {
  for (const r of baselineReadings(d)) {
    const v = num(r.rmssd);
    if (v != null && v > 0) return v;
  }
  return null;
}

/** The prior-day keys of the window, memoised: a pure function of the day key,
 *  and scoreSet asks it once per day over the whole history. */
const windowKeys = new Map<string, string[]>();
function priorKeys(dk: string, n: number): string[] {
  const id = `${dk}|${n}`;
  let ks = windowKeys.get(id);
  if (!ks) {
    ks = [];
    for (let i = 1; i <= n; i++) ks.push(addDays(dk, -i));
    if (windowKeys.size > 4000) windowKeys.clear();
    windowKeys.set(id, ks);
  }
  return ks;
}

/** Each earlier day's FIRST baseline RMSSD across the window before `dk`. Only
 *  first-of-day readings, so a user who takes three a day is not compared
 *  against a usual that is mostly their afternoons. */
export function baselineHistory(days: DaysMap, dk: string, n = PERSONAL_WINDOW_DAYS): number[] {
  const out: number[] = [];
  priorKeys(dk, n).forEach((k) => {
    const v = firstBaselineRmssd(days[k]);
    if (v != null) out.push(v);
  });
  return out;
}

/** The user's usual baseline RMSSD before `dk`, or null below the reading bar. */
export function usualBaseline(days: DaysMap, dk: string): { median: number; n: number } | null {
  const h = baselineHistory(days, dk);
  if (h.length < PERSONAL_MIN_READINGS) return null;
  return { median: median(h), n: h.length };
}

/**
 * A baseline RMSSD graded against the user's own usual, as a percent move.
 *
 * This is what answers "a baseline runs lower than a training reading": an
 * unpaced reading is compared with the person's own unpaced readings, never
 * with the numbers paced breathing produces. Bands are percent because RMSSD
 * scales with the person — 3 ms is noise at 60 and a real drop at 18.
 */
export function personalBaselineCat(value: number, usual: number): ScoreCat {
  const pct = (value / usual - 1) * 100;
  if (pct >= 8) return 'great';
  if (pct >= -5) return 'good';
  if (pct >= -12) return 'ok';
  if (pct >= -22) return 'bad';
  return 'crash';
}
