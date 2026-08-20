/**
 * The overnight series: heart rate, respiratory rate and the hypnogram, read
 * as a night rather than as four totals.
 *
 * Everything here is pure and works on offsets from bedtime in seconds, which
 * is how the waveform sidecar stores a night (see `sleepWaveformId` in
 * ../waveforms). The journal knows when the night began; the series only has
 * to know how far into it each point sits.
 *
 * No store, no native imports, no React.
 */
import type { Band } from '../types';
import { SLEEP_HR_HIGH, SLEEP_HR_LOW_1, SLEEP_HR_LOW_2 } from '../scoring/day';
import type { StageKey } from './stages';

/**
 * Colour bands for the overnight heart-rate curve.
 *
 * Deliberately the SAME numbers the sleep grade demotes on
 * (`SLEEP_HR_LOW_1/2`, `SLEEP_HR_HIGH` in ../scoring/day), not a second
 * palette invented for the chart: the point of showing the curve is to see
 * where the night crossed the lines it was actually graded against. Anything
 * else and the picture and the grade would be telling different stories.
 */
export const OVERNIGHT_HR_BANDS: Band[] = [
  { max: SLEEP_HR_LOW_1, cat: 'great' },
  { max: SLEEP_HR_LOW_2, cat: 'ok' },
  { max: SLEEP_HR_HIGH, cat: 'bad' },
  { max: Infinity, cat: 'crash' },
];

export interface HrPoint { t: number; bpm: number }
export interface RespPoint { t: number; br: number }
export interface StageSpan { s: number; d: number; v: StageKey }

/* ---------- thinning ---------- */

/**
 * Cap a series at `max` points by uniform stride, always keeping the first and
 * last. A watch can record a sample every few seconds; a year of backfilled
 * nights at that density is tens of megabytes of sidecar for a chart 320
 * points wide. Thinning at WRITE time is deliberate — it bounds what a
 * historical import can put on disk, which no amount of care at read time
 * could undo.
 */
export function thinSeries<T>(rows: readonly T[], max: number): T[] {
  if (rows.length <= max) return [...rows];
  const stride = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * stride)]);
  const last = rows[rows.length - 1];
  if (out[out.length - 1] !== last) out[out.length - 1] = last;
  return out;
}

/* ---------- overnight heart rate ---------- */

/** Rolling window (minutes) the dip's "settled stretch" low is measured over. */
export const SETTLED_WINDOW_MIN = 10;

/**
 * The lowest average across any `minutes`-long stretch of the night.
 *
 * This is what the nocturnal dip should be measured from once the curve
 * exists: the stored `hrLow` is a single beat, and one artifact — a watch
 * reseating itself, a stray reading through a tattoo — moves the whole dip
 * percentage. A ten-minute floor cannot be produced by one bad sample.
 *
 * Returns null when the series does not span a full window.
 */
export function lowestRollingMean(hr: readonly HrPoint[], minutes = SETTLED_WINDOW_MIN): number | null {
  if (hr.length < 2) return null;
  const span = minutes * 60;
  if (hr[hr.length - 1].t - hr[0].t < span) return null;
  let best: number | null = null;
  let lo = 0, sum = 0;
  for (let hi = 0; hi < hr.length; hi++) {
    sum += hr[hi].bpm;
    while (hr[hi].t - hr[lo].t > span) { sum -= hr[lo].bpm; lo++; }
    // Only score a window that actually covers the span, or the first few
    // samples would each score as their own (very short) window.
    if (hr[hi].t - hr[lo].t >= span * 0.8 && hi > lo) {
      const mean = sum / (hi - lo + 1);
      if (best == null || mean < best) best = mean;
    }
  }
  return best == null ? null : Math.round(best * 10) / 10;
}

/** Mean rate across the night. */
export function overnightMean(hr: readonly HrPoint[]): number | null {
  if (!hr.length) return null;
  return Math.round((hr.reduce((s, q) => s + q.bpm, 0) / hr.length) * 10) / 10;
}

/**
 * Seconds from bed to the night's lowest point — how long the system took to
 * settle. On a calm night the floor arrives in the first couple of hours; a
 * floor that only turns up near morning is the shape of a night that never
 * really let go.
 */
export function timeToFloor(hr: readonly HrPoint[]): number | null {
  if (hr.length < 2) return null;
  let best = hr[0];
  for (const q of hr) if (q.bpm < best.bpm) best = q;
  return Math.max(0, Math.round(best.t - hr[0].t));
}

/**
 * A centred moving average over the curve, for the line drawn through the
 * per-sample scatter. Window is in samples, not seconds, because sample
 * cadence varies by source and the line is a reading aid, not a statistic.
 */
export function smoothHr(hr: readonly HrPoint[], window = 15): HrPoint[] {
  if (hr.length < 3) return [...hr];
  const half = Math.max(1, Math.floor(window / 2));
  return hr.map((q, i) => {
    const from = Math.max(0, i - half), to = Math.min(hr.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += hr[j].bpm;
    return { t: q.t, bpm: sum / (to - from + 1) };
  });
}

/** Prior nights needed before a "typical low" is claimed. */
export const TYPICAL_LOW_MIN_NIGHTS = 3;
/** How many prior nights it looks back over. */
export const TYPICAL_LOW_NIGHTS = 30;

/**
 * The user's typical overnight low: the median of their previous nights'
 * `hrLow`. Median over mean for the usual reason — one artifact night should
 * not move the line the curve is read against.
 */
export function typicalOvernightLow(
  days: Record<string, { sleep?: { hrLow?: string | number } } | undefined>,
  dk: string,
  nights = TYPICAL_LOW_NIGHTS,
): number | null {
  const vals = Object.keys(days)
    .filter((k) => k < dk)
    .sort()
    .slice(-nights)
    .map((k) => parseFloat(String(days[k]?.sleep?.hrLow ?? '')))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < TYPICAL_LOW_MIN_NIGHTS) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/* ---------- wakefulness ---------- */

/** Awake blocks shorter than this are stirrings, not wakeups. Below it a
 *  hypnogram is mostly noise and counting them would alarm for nothing. */
export const WAKEUP_MIN_SEC = 90;

export interface WakeStats {
  /** Awake blocks that lasted long enough to count as waking up. */
  count: number;
  /** Total awake minutes across the night, stirrings included. */
  totalMin: number;
  /** The longest single awake block, in minutes. */
  longestMin: number;
  /** Those blocks, for the strip under the numbers. */
  blocks: StageSpan[];
}

/** Wakefulness read off the hypnogram, or null on a night with no spans. */
export function wakeStats(spans: readonly StageSpan[] | null | undefined): WakeStats | null {
  if (!spans || !spans.length) return null;
  const awake = spans.filter((s) => s.v === 'awake' && s.d > 0);
  if (!awake.length) return { count: 0, totalMin: 0, longestMin: 0, blocks: [] };
  const total = awake.reduce((s, a) => s + a.d, 0);
  const longest = awake.reduce((m, a) => Math.max(m, a.d), 0);
  return {
    count: awake.filter((a) => a.d >= WAKEUP_MIN_SEC).length,
    totalMin: Math.round(total / 60),
    longestMin: Math.round(longest / 60),
    blocks: awake,
  };
}

/** Total length of the night the spans describe, in seconds. */
export function spansDuration(spans: readonly StageSpan[] | null | undefined): number {
  if (!spans || !spans.length) return 0;
  return spans.reduce((m, s) => Math.max(m, s.s + s.d), 0);
}

/* ---------- respiratory rate ---------- */

/** Median breaths per minute across the night. Median, not mean: respiratory
 *  samples carry the occasional wild value and one of them should not move a
 *  number the user is asked to compare against their own baseline. */
export function respMedian(resp: readonly RespPoint[] | null | undefined): number | null {
  if (!resp || !resp.length) return null;
  const s = resp.map((q) => q.br).sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(v * 10) / 10;
}
