/**
 * Trend Watch: metrics that have actually moved, month against month.
 *
 * Unlike `findTrend` in ../trends, this reports DECLINES as well as gains. That
 * difference is deliberate and it is the one place the app's "never volunteer bad
 * news" rule is relaxed, so it is worth being precise about why:
 *
 * `findTrend` feeds the Journal card and the home-screen widget — surfaces the
 * user did not ask for, glanced at first thing in the morning. Insights is a view
 * somebody deliberately opened to analyse their own data, and a screen that could
 * only ever report improvements would be lying by omission in exactly the place
 * honesty is the whole point. The neutral `compareWindows` layer already reports
 * both directions; this consumes it directly.
 *
 * The one guard that stays: the whole section is suppressed while a downturn is
 * active. Somebody mid-crash is being handled by DownturnWarning, which has the
 * copy and the framing for it, and does not need a list of five things also going
 * wrong.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { TREND_METRICS, TREND_WINDOW_DAYS, WATCH_PRIORITY, compareWindows, type TrendMetricId } from '../trends';
import { shortMetric } from './correlate';
import type { DayMatrix } from './matrix';

/** Never more than this on screen — a longer list is a dashboard, not a finding. */
export const MAX_WATCH_ITEMS = 5;
/**
 * Sparkline length: BOTH windows, not just the recent one.
 *
 * The row's claim is "down 10 points vs last month", so the line has to contain
 * last month or it cannot show the thing it sits next to. Drawing only the recent
 * 30 days put a flat-looking line beside a sentence about a fall, which reads as
 * the chart contradicting the copy.
 */
export const WATCH_SPARK_DAYS = TREND_WINDOW_DAYS * 2;

export interface WatchItem {
  metric: TrendMetricId;
  /** "SDNN" */
  title: string;
  /** "Up 8.3 ms vs last month" */
  sub: string;
  /** The window's current number, e.g. "53 ms". */
  value: string;
  good: boolean;
  /** Last 30 days, oldest first, nulls preserved for the gaps. */
  series: (number | null)[];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Up to MAX_WATCH_ITEMS movements, in WATCH_PRIORITY order.
 *
 * `suppressed` is the downturn gate, passed in rather than detected here so the
 * caller pays for `detectDownturn` once for the whole report.
 */
export function findWatchItems(matrix: DayMatrix, suppressed: boolean): WatchItem[] {
  if (suppressed) return [];
  const out: WatchItem[] = [];

  for (const id of WATCH_PRIORITY) {
    if (out.length >= MAX_WATCH_ITEMS) break;
    const series = matrix.outcomes[id];
    if (!series) continue;
    const def = TREND_METRICS[id];
    const delta = compareWindows(series, TREND_WINDOW_DAYS, TREND_WINDOW_DAYS, def);
    // 'flat' and 'unknown' both say nothing worth a row, for different reasons.
    if (!delta.significant) continue;

    out.push({
      metric: id,
      title: shortMetric(def),
      sub: `${capitalize(def.phrase(delta.delta))} vs last month`,
      value: `${def.fmt(delta.recent)} ${def.unit}`,
      good: delta.direction === 'improving',
      series: series.slice(Math.max(0, series.length - WATCH_SPARK_DAYS)),
    });
  }
  return out;
}

/* ---------- overall direction ---------- */

export type OverallDirection = 'up' | 'down' | 'flat' | 'unknown';

export interface Overall {
  direction: OverallDirection;
  /** "Trending up" / "Trending down" / "Holding steady", or null when unknown. */
  label: string | null;
  /** What the verdict was read from, for the accessibility label. */
  detail: string;
}

/**
 * One word for where the whole journal is heading, for the Insights header.
 *
 * Two passes, in this order for a reason:
 *
 * 1. THE DAILY SCORE, if it moved. It is the app's own composite of everything and
 *    the number the user already reads as "how am I doing", so when it has a verdict
 *    that verdict IS the answer. Anything else would be a second opinion competing
 *    with the headline number on the Journal.
 * 2. OTHERWISE A VOTE across the metrics Trend Watch is allowed to show. A journal
 *    with too few scored days can still have a clear direction in HRV, resting HR
 *    and sleep, and refusing to say so would be needlessly mute.
 *
 * A tie is 'flat', not a coin toss, and thin coverage is 'unknown' rather than
 * 'flat' — the same distinction ../trends/compare draws, and the caller falls back
 * to the days-logged count rather than claiming anything.
 *
 * Reports declines. Insights is a view the user deliberately opened; see the note
 * at the top of this file.
 */
export function overallDirection(matrix: DayMatrix): Overall {
  const verdict = (d: OverallDirection, detail: string): Overall => ({
    direction: d,
    label: d === 'up' ? 'Trending up' : d === 'down' ? 'Trending down' : d === 'flat' ? 'Holding steady' : null,
    detail,
  });

  const scores = matrix.outcomes.score;
  if (scores) {
    const delta = compareWindows(scores, TREND_WINDOW_DAYS, TREND_WINDOW_DAYS, TREND_METRICS.score);
    if (delta.significant) {
      return verdict(delta.direction === 'improving' ? 'up' : 'down',
        `daily score ${TREND_METRICS.score.phrase(delta.delta)} vs last month`);
    }
    // A score that is present and genuinely flat is an answer in itself.
    if (delta.direction === 'flat') return verdict('flat', 'daily score level vs last month');
  }

  let up = 0, down = 0;
  for (const id of WATCH_PRIORITY) {
    const series = matrix.outcomes[id];
    if (!series) continue;
    const delta = compareWindows(series, TREND_WINDOW_DAYS, TREND_WINDOW_DAYS, TREND_METRICS[id]);
    if (!delta.significant) continue;
    if (delta.direction === 'improving') up++; else down++;
  }
  if (!up && !down) return verdict('unknown', 'not enough to compare yet');
  if (up === down) return verdict('flat', `${up} improving, ${down} slipping`);
  return verdict(up > down ? 'up' : 'down', `${up} improving, ${down} slipping`);
}
