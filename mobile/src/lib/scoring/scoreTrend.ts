/**
 * The Outlook gauge's answer to "did today move?", shown under the score itself.
 *
 * `computeScores` grades against absolute clinical thresholds, so for this
 * population the daily score reads roughly the same every day and the second
 * reading tells the reader nothing the first did not. Everything else
 * comparative in the app is a fortnight or more out (Insights at 14 days,
 * `changeSinceStart` at 28, the Trend card at ~35). This is the one thing on the
 * card that moves when they measure, which is why it sits INSIDE the ring, under
 * the number: it is about that number. The card's vs-AM delta stacks directly
 * beneath it in the same shape — a different comparison over a different span,
 * but the same question, so the two read as one block.
 *
 * Four rules keep it honest, and all four live here rather than in the view:
 *
 *  - ONE window, picked by COVERAGE and never by which reads better. Trailing 7
 *    days, falling back to 14 only when the 7-day window holds too few scored
 *    days to speak. Choosing among three windows by whichever showed the nicer
 *    number would be cherry-picking — the same failure `findCorrelations` spends
 *    its whole BH correction avoiding — and it is not repeatable: a flat journal
 *    would say "up vs yesterday" one morning and "up vs 14 days" the next, and
 *    the reader could not tell whether their number moved or the window did.
 *  - Never "vs yesterday" alone. One night's sleep swings this score further
 *    than a fortnight of real change does, so a single-day comparison reports
 *    noise with the confidence of a finding.
 *  - MEDIAN, not mean, exactly as `trends/compare` does: one artifact day drags
 *    a mean far enough to invent a move.
 *  - Under `LEVEL_DELTA` the answer is 'level', never a direction. An arrow that
 *    flips on a one-point wobble is the thing `widgets.ts` lost its local
 *    today-vs-week-mean helper over.
 *
 * What it does NOT do is filter by direction. `findTrend` reports improvements
 * only, because a card that volunteers "your HRV fell" is a crash trigger — but
 * that card VOLUNTEERS a claim, in a sentence, unprompted. This is a readout
 * under the number it describes, it names its own window, and the vs-AM line
 * stacked beneath it has always shown both directions. The neutral
 * half of `trends/` (`compareWindows`, `trendDirection`) is the precedent, and
 * it is what the widget arrows use.
 *
 * Pure: no store, no MMKV, no React.
 */
import type { ScoreContext } from './index';
import type { DaysMap } from './day';
import { metricSeries, keyRange } from '../trends/series';

/** How far back the windows may reach. */
export const TREND_LOOKBACK = 14;
/** Windows tried, in order. The first with enough coverage wins. */
export const TREND_WINDOWS = [7, 14] as const;
/** Scored days a window needs before it may be compared against. */
export const MIN_WINDOW_DAYS = 4;
/** Below this the day is 'level'. The vs-AM line beneath it uses the same floor. */
export const LEVEL_DELTA = 3;

export type ScoreTrend = {
  /** Today minus the window's median, rounded. Null when no window qualified. */
  delta: number | null;
  direction: 'up' | 'down' | 'level' | null;
  /** The window `delta` was measured against, for the copy that names it. */
  windowDays: number | null;
  /** Scored days inside that window, today excluded. */
  windowN: number;
};

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function scoreTrend(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
): ScoreTrend | null {
  const keys = keyRange(dk, TREND_LOOKBACK, addDays);
  const series = metricSeries(days, keys, ['score'], ctx).score;
  const today = series[series.length - 1];
  // Everything before today, most recent last.
  const prior = series.slice(0, -1);
  if (!prior.some((v) => v != null)) return null;

  const empty: ScoreTrend = { delta: null, direction: null, windowDays: null, windowN: 0 };
  if (today == null) return empty;

  for (const w of TREND_WINDOWS) {
    const vals = prior.slice(Math.max(0, prior.length - w)).filter((v): v is number => v != null);
    if (vals.length < MIN_WINDOW_DAYS) continue;
    const delta = Math.round(today - median(vals));
    return {
      delta,
      direction: Math.abs(delta) < LEVEL_DELTA ? 'level' : delta > 0 ? 'up' : 'down',
      windowDays: w,
      windowN: vals.length,
    };
  }
  return empty;
}
