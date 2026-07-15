/**
 * Pure sleep-night summarization over HealthKit sleep-analysis samples.
 *
 * Two realities of HealthKit sleep data drive the shape of this module:
 *
 * 1. Multiple sources (iPhone + Apple Watch, or two apps) record the same
 *    night, so samples overlap. Durations must be measured on the *union* of
 *    intervals, never by summing raw sample lengths, or minutes double-count.
 * 2. The query window for "the night ending on day X" spans the prior evening
 *    through the next early afternoon, so it can also catch an evening nap or
 *    a morning nap. The night is the *longest* cluster of sleep, not simply
 *    earliest-start → latest-end across the whole window.
 *
 * Kept free of native imports so jest can exercise it directly.
 */
import type { SleepStages } from '../types';

/** The slice of an HKCategorySample this module needs. */
export interface SleepSample { value: number; startDate: Date; endDate: Date }

export interface SleepSummary {
  bed: Date;
  wake: Date;
  minutesAsleep: number;
  interrupted: boolean;
  /** Per-stage minutes when the source staged the night; null when every
   *  sample is plain asleepUnspecified (manual logs, older sources). */
  stages: SleepStages | null;
}

// HKCategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake,
// 3 asleepCore, 4 asleepDeep, 5 asleepREM.
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
const AWAKE = 2;

/** Gap between sleep blocks that splits them into separate sessions (a nap
 *  vs. the night). Ordinary mid-night wakings are far shorter than this. */
const SESSION_GAP_MS = 2 * 60 * 60000;

/** A night only counts as interrupted when time spent awake mid-sleep
 *  exceeds this many minutes; brief stirrings are normal sleep. */
export const INTERRUPTED_AWAKE_MIN = 10;

interface Interval { start: number; end: number }

/** Merge overlapping/touching intervals into a sorted disjoint union. */
function unionIntervals(rows: readonly SleepSample[]): Interval[] {
  const iv = rows
    .map((r) => ({ start: r.startDate.getTime(), end: r.endDate.getTime() }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of iv) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

const minutesOf = (iv: readonly Interval[]): number =>
  Math.round(iv.reduce((s, i) => s + (i.end - i.start), 0) / 60000);

/**
 * Summarize one night from raw sleep samples: pick the main sleep session,
 * report its bounds and union-measured minutes. Returns null with no asleep
 * samples at all.
 */
export function summarizeSleep(rows: readonly SleepSample[]): SleepSummary | null {
  const asleep = rows.filter((r) => ASLEEP_VALUES.has(r.value));
  const merged = unionIntervals(asleep);
  if (!merged.length) return null;

  // Cluster the disjoint sleep blocks into sessions, then keep the one with
  // the most actual sleep — that is the night; shorter clusters are naps.
  const sessions: Interval[][] = [];
  for (const i of merged) {
    const cur = sessions[sessions.length - 1];
    if (cur && i.start - cur[cur.length - 1].end < SESSION_GAP_MS) cur.push(i);
    else sessions.push([i]);
  }
  const main = sessions.reduce((a, b) => (minutesOf(b) >= minutesOf(a) ? b : a));

  const bedMs = main[0].start;
  const wakeMs = main[main.length - 1].end;
  const inMain = (r: SleepSample) =>
    r.startDate.getTime() < wakeMs && r.endDate.getTime() > bedMs;

  const stageMinutes = (value: number) =>
    minutesOf(unionIntervals(asleep.filter((r) => r.value === value && inMain(r))));
  const awakeIntervals = unionIntervals(rows.filter((r) => r.value === AWAKE && inMain(r)));

  const staged: SleepStages = {
    core: stageMinutes(3),
    deep: stageMinutes(4),
    rem: stageMinutes(5),
    awake: minutesOf(awakeIntervals),
  };

  return {
    bed: new Date(bedMs),
    wake: new Date(wakeMs),
    minutesAsleep: minutesOf(main),
    interrupted: staged.awake > INTERRUPTED_AWAKE_MIN,
    stages: staged.core + staged.deep + staged.rem > 0 ? staged : null,
  };
}
