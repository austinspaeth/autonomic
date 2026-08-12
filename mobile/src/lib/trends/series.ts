/**
 * days -> per-day values, in ONE pass over the key range.
 *
 * The pass matters. `metricHistory` (../scoring/day) walks the whole journal,
 * and six metrics asking it separately would be six full walks on a screen that
 * re-renders on every sheet and animation. Here the caller names the ~60 keys
 * it cares about and the metrics it wants, and each day is visited once — with
 * the day's score computed once and shared by every metric that needs it, since
 * `scoreSet` is by far the most expensive extractor in the registry.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import { TREND_METRICS, dayScore, type TrendMetricId } from './metrics';

/** Metrics whose value is derived from the day score, so the score is computed
 *  once per day and handed to both rather than scored twice. */
const SCORE_DERIVED: TrendMetricId[] = ['score', 'badDays'];

export type MetricSeries = Record<TrendMetricId, (number | null)[]>;

/**
 * Per-day values for the requested metrics across `keys`, index-aligned to
 * `keys`. A day with nothing to say for a metric is `null`, never 0 — the
 * difference is the whole basis of the coverage rules in ./compare.
 */
export function metricSeries(
  days: DaysMap,
  keys: string[],
  ids: TrendMetricId[],
  ctx: ScoreContext = {},
): MetricSeries {
  const out = {} as MetricSeries;
  ids.forEach((id) => { out[id] = []; });
  const needsScore = ids.some((id) => SCORE_DERIVED.includes(id));

  keys.forEach((dk) => {
    const d = days[dk];
    // One scoreSet per day, shared by 'score' and 'badDays'.
    const score = needsScore ? dayScore(d, dk, days, ctx) : null;
    ids.forEach((id) => {
      if (id === 'score') { out[id].push(score); return; }
      if (id === 'badDays') {
        out[id].push(score == null ? null : TREND_METRICS.badDays.value(d, dk, days, ctx));
        return;
      }
      out[id].push(TREND_METRICS[id].value(d, dk, days, ctx));
    });
  });

  return out;
}

/** The day keys from `from` days before `dk` up to and including `dk`. */
export function keyRange(dk: string, count: number, addDays: (k: string, n: number) => string): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(addDays(dk, -i));
  return keys;
}
