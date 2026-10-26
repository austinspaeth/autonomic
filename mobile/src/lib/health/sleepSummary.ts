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
 *  vs. the night). Only UNRECORDED time counts toward it: a stretch the source
 *  itself labelled Awake is part of its night, however long (see
 *  {@link summarizeSleep}). */
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

/** Milliseconds of [start, end) covered by the disjoint intervals `iv`. */
function coveredMs(start: number, end: number, iv: readonly Interval[]): number {
  let ms = 0;
  for (const i of iv) {
    const s = Math.max(start, i.start), e = Math.min(end, i.end);
    if (e > s) ms += e - s;
  }
  return ms;
}

/**
 * Summarize one night from raw sleep samples: pick the main sleep session,
 * report its bounds and union-measured minutes. Returns null with no asleep
 * samples at all. `gapMs` is how long a break has to be before the blocks
 * either side of it are separate sessions.
 */
export function summarizeSleep(rows: readonly SleepSample[], gapMs = SESSION_GAP_MS): SleepSummary | null {
  const asleep = rows.filter((r) => ASLEEP_VALUES.has(r.value));
  const merged = unionIntervals(asleep);
  if (!merged.length) return null;

  // Cluster the disjoint sleep blocks into sessions, then keep the one with
  // the most actual sleep — that is the night; shorter clusters are naps.
  // A gap is measured WITHOUT the time the source recorded as Awake: a bad
  // night with a 2h20m waking in the middle is one night to Apple Health, which
  // charted it as one and counted both halves, and splitting it there dropped
  // the first half and reported 3h of a 6h39m night.
  const awakeAll = unionIntervals(rows.filter((r) => r.value === AWAKE));
  const sessions: Interval[][] = [];
  for (const i of merged) {
    const cur = sessions[sessions.length - 1];
    const prevEnd = cur ? cur[cur.length - 1].end : 0;
    const unrecorded = cur ? i.start - prevEnd - coveredMs(prevEnd, i.start, awakeAll) : Infinity;
    if (unrecorded < gapMs) cur.push(i);
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
 * One Health Connect sleep session, reduced to what {@link summarizeHcSessions}
 * needs. `stage` is Health Connect's own constant (1 AWAKE, 2 SLEEPING,
 * 3 OUT_OF_BED, 4 LIGHT, 5 DEEP, 6 REM, 7 AWAKE_IN_BED).
 */
export interface HcSleepSession {
  startMs: number;
  endMs: number;
  /** The writing app's package name; '' when the record carries none. */
  origin: string;
  stages: { startMs: number; endMs: number; stage: number }[];
}

/** Health Connect stage → the HealthKit value `summarizeSleep` reads. Light is
 *  Apple's "core"; SLEEPING is asleep with no stage. UNKNOWN and OUT_OF_BED
 *  have no entry and are ignored. */
const HC_TO_HK: Record<number, number> = { 1: AWAKE, 7: AWAKE, 2: 1, 4: 3, 5: 4, 6: 5 };

/**
 * Health Connect's session gap is wider than HealthKit's. Google Health
 * (Fitbit, Pixel Watch) writes ONE night as several sessions, cut wherever the
 * wearer woke: a night it reported as 12:48am to 11:25am with a 2½-hour waking
 * reached Health Connect in pieces, and Google itself still calls it one
 * night. Three hours stitches that and still keeps an evening nap (ending
 * before 8pm for an 11pm bedtime) out of the night.
 */
export const HC_SESSION_GAP_MS = 3 * 60 * 60000;

/**
 * Summarize the night from every Health Connect session in its window.
 *
 * This used to take the longest single session, which is right only when the
 * night arrives as one record. Split nights arrived as their longest PIECE: a
 * 1:27am to 10:40am night read as 1:27 to 5:56, "uninterrupted". So the
 * sessions are now stitched exactly the way iOS stitches samples (union of the
 * blocks, clustered by gap, the cluster with the most sleep wins).
 *
 * Sources are never mixed. Two apps that both track sleep write the same night
 * twice, and stitching ACROSS them would let one app's late morning extend the
 * other's night (or double its stages, were the unions not used). Each app's
 * sessions are summarized on their own and the source that saw the most sleep
 * is the night, which is the `stepTotalFromRecords` rule for steps.
 *
 * Bed and wake are the bounds of that source's sessions around the night
 * rather than the first and last asleep minute, so the times match the ones
 * the writing app shows (it opens the night on the first minute in bed).
 */
export function summarizeHcSessions(sessions: readonly HcSleepSession[]): SleepSummary | null {
  const byOrigin = new Map<string, HcSleepSession[]>();
  for (const s of sessions) {
    if (!(s.endMs > s.startMs)) continue;
    const list = byOrigin.get(s.origin);
    if (list) list.push(s); else byOrigin.set(s.origin, [s]);
  }

  let best: { summary: SleepSummary; sessions: HcSleepSession[] } | null = null;
  for (const list of byOrigin.values()) {
    const rows: SleepSample[] = [];
    for (const s of list) {
      const known = s.stages.filter((st) => HC_TO_HK[st.stage] != null && st.endMs > st.startMs);
      // A session with no usable stages is one asleep block, as it always was.
      if (!known.length) {
        rows.push({ value: 1, startDate: new Date(s.startMs), endDate: new Date(s.endMs) });
        continue;
      }
      for (const st of known) {
        rows.push({ value: HC_TO_HK[st.stage], startDate: new Date(st.startMs), endDate: new Date(st.endMs) });
      }
    }
    const summary = summarizeSleep(rows, HC_SESSION_GAP_MS);
    if (summary && (!best || summary.minutesAsleep > best.summary.minutesAsleep)) best = { summary, sessions: list };
  }
  if (!best) return null;

  const { summary } = best;
  const sleepStart = summary.bed.getTime();
  const sleepEnd = summary.wake.getTime();
  const around = best.sessions.filter((s) => s.startMs < sleepEnd && s.endMs > sleepStart);
  const bedMs = Math.min(sleepStart, ...around.map((s) => s.startMs));
  const wakeMs = Math.max(sleepEnd, ...around.map((s) => s.endMs));
  // Spans are offsets from bed; moving bed earlier moves every one later.
  const shift = Math.round((sleepStart - bedMs) / 1000);
  return {
    ...summary,
    bed: new Date(bedMs),
    wake: new Date(wakeMs),
    spans: shift ? summary.spans.map((sp) => ({ ...sp, s: sp.s + shift })) : summary.spans,
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
