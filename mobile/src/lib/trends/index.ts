/**
 * Public API for trend detection.
 *
 * THE ONE RULE THAT MUST NEVER BREAK: `findTrend` returns improvements only.
 *
 * Telling someone with a chronic autonomic condition that their HRV fell 15%
 * is cruel, useless, and for this population an actual crash trigger. Decline
 * is already owned by `detectDownturn` and `DownturnWarning`, which have the
 * framing and the copy for it. `findTrend` also stays silent DURING a downturn
 * even when some metric improved — someone mid-crash does not want to hear
 * their bedtime got more consistent.
 *
 * The lower layers (`compareWindows`, `trendDirection`) are neutral and do
 * report declines; the never-bad-news rule lives here and only here, because
 * the widgets legitimately need a down arrow.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { addDays } from '../dates';
import type { ScoreContext } from '../scoring';
import { DEFAULT_PROTOCOL, type DaysMap } from '../scoring/day';
import { detectDownturn } from '../scoring/downturn';
import type { CustomTypes, Protocol } from '../types';
import { OUTCOME_FAMILY, phraseOf, TREND_METRICS, TREND_PRIORITY, type TrendMetricId } from './metrics';
import { keyRange, metricSeries } from './series';
import { compareWindows, type TrendDelta, type TrendDirection } from './compare';

export { TREND_METRICS, TREND_PRIORITY, INSIGHT_OUTCOMES, WATCH_PRIORITY, OUTCOME_FAMILY, FAMILY_RANK, familyRank, phraseOf } from './metrics';
export type { TrendMetricId, TrendMetricDef, TrendAggregate } from './metrics';
export { metricSeries, keyRange } from './series';
export {
  claimTrend, emptyTrendMemory, migrateTrendMemory, trendGate,
  TREND_COPY_VERSION, TREND_FAMILY_COOLDOWN_DAYS, TREND_LIVE_HOURS, TREND_MIN_DAYS_BETWEEN,
} from './pacing';
export type { TrendClaim, TrendGate, TrendMemory } from './pacing';
export type { MetricSeries } from './series';
export { compareWindows, median, stdev } from './compare';
export type { TrendDelta, TrendDirection } from './compare';

/** The window the Trend card compares: the last month against the one before. */
export const TREND_WINDOW_DAYS = 30;
/** Default window for a widget arrow — a week against the week before. */
export const WIDGET_WINDOW_DAYS = 7;

export interface TrendFinding {
  metric: TrendMetricId;
  /** "Your resting heart rate is down 6 bpm since last month" */
  headline: string;
  /** "62 → 56 bpm · 21 readings" */
  detail: string;
  delta: TrendDelta;
}

/**
 * The single best improvement worth surfacing, or null.
 *
 * Walks TREND_PRIORITY and returns the first metric whose delta is both
 * significant and improving — exactly one finding, never a list, so the card
 * can never turn into a wall of claims.
 *
 * `exclude` drops whole OUTCOME_FAMILY groups from the walk, which is how the
 * card's month-long per-subject cooldown (./pacing) forces the next thing it
 * says to be about something else. Excluding the family rather than the metric
 * matters: retiring `sleepConsistency` alone would just hand the slot to
 * `sleepDuration` and say the same thing again in different units.
 */
export function findTrend(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext = {},
  protocol: Protocol = DEFAULT_PROTOCOL,
  custom?: CustomTypes,
  exclude: string[] = [],
): TrendFinding | null {
  // Never good news over the top of bad news.
  if (detectDownturn(days, dk, ctx, protocol, custom)) return null;

  const muted = new Set(exclude);
  const eligible = TREND_PRIORITY.filter((id) => !muted.has(OUTCOME_FAMILY[id]));
  if (!eligible.length) return null;

  const keys = keyRange(dk, TREND_WINDOW_DAYS * 2, addDays);
  const series = metricSeries(days, keys, eligible, ctx);

  for (const id of eligible) {
    const def = TREND_METRICS[id];
    const delta = compareWindows(series[id], TREND_WINDOW_DAYS, TREND_WINDOW_DAYS, def);
    if (!delta.significant || delta.direction !== 'improving') continue;
    return {
      metric: id,
      // The exclamation is the point of the card: it is the only place the app
      // congratulates anyone, and ./pacing is what keeps it earned.
      // Subject, magnitude, "on average" where the number is one (`phraseOf`),
      // then the window — the reader has to be told all four or the sentence is
      // a claim about today.
      headline: `${def.subject} ${phraseOf(def, delta.delta)} ${def.tail ?? 'since last month'}!`,
      detail: `${def.fmt(delta.prior)} → ${def.fmt(delta.recent)} ${def.unit} · ${delta.recentN} ${def.countNoun}`,
      delta,
    };
  }
  return null;
}

/**
 * Direction of one metric over a window against the window before it. Neutral:
 * this is what the widgets use, and a widget that could only ever show an up
 * arrow would be lying by omission.
 */
export function trendDirection(
  days: DaysMap,
  dk: string,
  id: TrendMetricId,
  windowDays: number = WIDGET_WINDOW_DAYS,
  ctx: ScoreContext = {},
): TrendDirection {
  const keys = keyRange(dk, windowDays * 2, addDays);
  const series = metricSeries(days, keys, [id], ctx);
  return compareWindows(series[id], windowDays, windowDays, TREND_METRICS[id]).direction;
}
