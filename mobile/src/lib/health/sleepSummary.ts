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
 * `groupNights` extends the same rules to a long span: the one-time historical
 * import reads months of sleep in a single query and buckets it into nights
 * here, rather than issuing one windowed query per day.
 *
 * Kept free of native imports so jest can exercise it directly.
 */
import type { SleepStages } from '../types';
import { keyOf } from '../dates';

/** The slice of an HKCategorySample this module needs. */
export interface SleepSample { value: number; startDate: Date; endDate: Date }

/** The night ending on day X is queried from X-1 18:00 → X 14:00. Both the
 *  per-day reads and the historical sweep use these bounds so a night lands on
 *  the same day key either way. */
export const NIGHT_START_HOUR = 18;
export const NIGHT_END_HOUR = 14;

/** One block of the night: `s` seconds after bed, `d` seconds long. */
export interface StageSpan { s: number; d: number; v: 'deep' | 'rem' | 'core' | 'awake' }

export interface SleepSummary {
  bed: Date;
  wake: Date;
  minutesAsleep: number;
  interrupted: boolean;
  /** Per-stage minutes when the source staged the night; null when every
   *  sample is plain asleepUnspecified (manual logs, older sources). */
  stages: SleepStages | null;
  /**
   * The same stages as a timeline rather than four totals — every block in the
   * order it happened, awake blocks included, sorted by start.
   *
   * This is the half that used to be summed away. Totals cannot answer "was I
   * awake at 3am, and did my heart rate do anything then", which is the
   * question a person actually has about a bad night, so the spans are kept
   * and stored in the waveform sidecar (never in the journal — see
   * `sleepWaveformId`). Empty on an unstaged night with no awake samples.
   */
  spans: StageSpan[];
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

  const stageIv = (value: number) => unionIntervals(asleep.filter((r) => r.value === value && inMain(r)));
  const coreIv = stageIv(3), deepIv = stageIv(4), remIv = stageIv(5);
  const awakeIntervals = unionIntervals(rows.filter((r) => r.value === AWAKE && inMain(r)));

  const staged: SleepStages = {
    core: minutesOf(coreIv),
    deep: minutesOf(deepIv),
    rem: minutesOf(remIv),
    awake: minutesOf(awakeIntervals),
  };

  // Same intervals, kept as a timeline. Offsets from bed in whole seconds, so
  // the series survives a journal that only knows the night's clock times.
  const toSpans = (iv: readonly Interval[], v: StageSpan['v']): StageSpan[] =>
    iv.map((i) => ({ s: Math.round((i.start - bedMs) / 1000), d: Math.round((i.end - i.start) / 1000), v }));
  const spans = [
    ...toSpans(deepIv, 'deep'),
    ...toSpans(remIv, 'rem'),
    ...toSpans(coreIv, 'core'),
    ...toSpans(awakeIntervals, 'awake'),
  ].sort((a, b) => a.s - b.s);

  return {
    bed: new Date(bedMs),
    wake: new Date(wakeMs),
    minutesAsleep: minutesOf(main),
    interrupted: staged.awake > INTERRUPTED_AWAKE_MIN,
    stages: staged.core + staged.deep + staged.rem > 0 ? staged : null,
    spans,
  };
}

/**
 * The day key whose night a sleep sample belongs to, judged by when it *ends*:
 * an evening sample (≥ 18:00) belongs to the next morning's night, an early
 * sample (< 14:00) to that same morning. Anything ending mid-afternoon is an
 * afternoon nap that no night's window would have caught either — null.
 */
export function nightKeyOf(end: Date): string | null {
  const h = end.getHours();
  if (h >= NIGHT_START_HOUR) return keyOf(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1));
  if (h < NIGHT_END_HOUR) return keyOf(end);
  return null;
}

/**
 * Bucket a long span of sleep samples into nights, so one range query can
 * stand in for a per-day read across months of history. Each bucket is what
 * {@link summarizeSleep} would have received from that day's own window;
 * buckets come back oldest first.
 */
export function groupNights(rows: readonly SleepSample[]): { dayKey: string; rows: SleepSample[] }[] {
  const byDay = new Map<string, SleepSample[]>();
  for (const r of rows) {
    const dk = nightKeyOf(r.endDate);
    if (!dk) continue;
    const bucket = byDay.get(dk);
    if (bucket) bucket.push(r);
    else byDay.set(dk, [r]);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dayKey, list]) => ({ dayKey, rows: list }));
}
