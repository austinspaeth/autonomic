/**
 * Windowed aggregate + delta + significance.
 *
 * The statistics here ARE the product, because every number that comes out of
 * this file becomes a factual claim made to the user about their own health
 * data. Four rules, each of them load-bearing:
 *
 * 1. MEDIAN, NOT MEAN. One 130 bpm reading or one catastrophic night is
 *    ordinary in this population and drags a mean into a claim that isn't true.
 *    This is the specific bug in the week-trend helper this module replaces.
 * 2. `minPoints` IS ENFORCED IN EACH WINDOW INDEPENDENTLY. Logging here is
 *    irregular and crash weeks are often empty; comparing 14 readings against 2
 *    is not a comparison.
 * 3. `minDelta` IS ENFORCED. The registry's thresholds are set at "worth
 *    telling someone about", not "detectable". A 1 bpm move is noise dressed as
 *    progress.
 * 4. 'unknown' IS A FIRST-CLASS RESULT, AND THE DEFAULT. Insufficient coverage
 *    is never reported as 'flat' — "we can't tell" and "it didn't move" are
 *    different facts and callers render them differently.
 *
 * Known confounder, not a blocker: without cycle data, a 30-vs-30 comparison
 * can be reading menstrual phase rather than recovery.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import type { TrendMetricDef, TrendMetricId } from './metrics';

export type TrendDirection = 'improving' | 'declining' | 'flat' | 'unknown';

export interface TrendDelta {
  metric: TrendMetricId;
  direction: TrendDirection;
  /** Window aggregates (median unless the metric declares otherwise). */
  recent: number;
  prior: number;
  /** recent − prior, raw and unrounded. Round only for display. */
  delta: number;
  /** Clears minDelta AND both minPoints. */
  significant: boolean;
  recentN: number;
  priorN: number;
}

const present = (xs: (number | null)[]): number[] => xs.filter((v): v is number => v != null);

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Population standard deviation — a window's spread, not an estimate of some
 *  wider population's. */
export function stdev(xs: number[]): number {
  if (!xs.length) return NaN;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

function aggregate(xs: number[], def: TrendMetricDef): number {
  if (def.aggregate === 'count') return xs.reduce((s, x) => s + x, 0);
  if (def.aggregate === 'stdev') return stdev(xs);
  return median(xs);
}

/** Distance outside the target band (0 when inside it). */
function bandDistance(v: number, target: [number, number]): number {
  if (v < target[0]) return target[0] - v;
  if (v > target[1]) return v - target[1];
  return 0;
}

/**
 * Compare the last `recentLen` entries of `series` against the `priorLen`
 * before them. `series` is index-aligned to a key range that ENDS at the day
 * being evaluated, so the recent window is its tail.
 */
export function compareWindows(
  series: (number | null)[],
  recentLen: number,
  priorLen: number,
  def: TrendMetricDef,
): TrendDelta {
  const recentRaw = series.slice(Math.max(0, series.length - recentLen));
  const priorRaw = series.slice(Math.max(0, series.length - recentLen - priorLen), Math.max(0, series.length - recentLen));
  const recentVals = present(recentRaw);
  const priorVals = present(priorRaw);
  const recentN = recentVals.length;
  const priorN = priorVals.length;

  const base: TrendDelta = {
    metric: def.id,
    direction: 'unknown',
    recent: NaN,
    prior: NaN,
    delta: NaN,
    significant: false,
    recentN,
    priorN,
  };

  // Rule 2 and rule 4: too thin to say anything is 'unknown', never 'flat'.
  if (recentN < def.minPoints || priorN < def.minPoints) return base;

  const recent = aggregate(recentVals, def);
  const prior = aggregate(priorVals, def);
  if (!Number.isFinite(recent) || !Number.isFinite(prior)) return base;
  const delta = recent - prior;

  // How much movement counts, and which way is good. For a banded metric the
  // movement that matters is the change in DISTANCE FROM the band, so 8h -> 11h
  // is a decline and 5h -> 7h an improvement, both of them "up".
  const threshold = def.deltaKind === 'relative' ? def.minDelta * Math.abs(prior) : def.minDelta;
  let magnitude: number;
  let improving: boolean;
  if (def.better === 'band') {
    const target = def.target || [0, 0];
    const dRecent = bandDistance(recent, target);
    const dPrior = bandDistance(prior, target);
    // Both windows already inside the band: nothing moved that matters.
    if (dRecent === 0 && dPrior === 0) {
      return { ...base, direction: 'flat', recent, prior, delta };
    }
    magnitude = Math.abs(dPrior - dRecent);
    improving = dRecent < dPrior;
  } else {
    magnitude = Math.abs(delta);
    improving = def.better === 'up' ? delta > 0 : delta < 0;
  }

  // Rule 3.
  if (!(magnitude >= threshold) || threshold <= 0) {
    return { ...base, direction: 'flat', recent, prior, delta };
  }

  return {
    ...base,
    direction: improving ? 'improving' : 'declining',
    recent,
    prior,
    delta,
    significant: true,
  };
}
