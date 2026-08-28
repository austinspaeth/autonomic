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
import { TREND_METRICS, TREND_WINDOW_DAYS, WATCH_PRIORITY, compareWindows, metricSeries, phraseOf, type TrendMetricId } from '../trends';
import type { ScoreContext } from '../scoring';
import { scoreSet, type DaysMap } from '../scoring/day';
import { median } from './stats';
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
  /** The window's current number, e.g. "53 ms". The LEVEL, kept for anything that
   *  wants it — the row itself shows `change`, and the sheet it opens shows both
   *  windows side by side. */
  value: string;
  /**
   * THE MOVEMENT, signed and in the metric's own unit: "-8 pts", "+4 days".
   *
   * This is what the row shows, because "has this moved?" is the only question
   * this card answers — the level belongs in the sheet the row opens.
   *
   * A DISPERSION metric carries no number here, the same rule the Journal's Trend
   * card follows: `sleepConsistency` is a stdev, so its delta is a change in
   * night-to-night scatter, and "-89 min" is not a quantity anybody can picture.
   * It gets the word instead.
   */
  change: string;
  good: boolean;
  /** Last 60 days, oldest first, nulls preserved for the gaps. */
  series: (number | null)[];
  /** Day keys index-aligned to `series`, so the sheet's chart can label its axis
   *  and shade the two windows without re-deriving the range. */
  keys: string[];
  /**
   * Where the recent window starts inside `series` — the before/after split the
   * whole claim rests on, drawn as the chart's divider.
   */
  splitIndex: number;
  /** The two window aggregates, in the metric's own unit, already formatted:
   *  the sheet states the comparison rather than only its result. */
  beforeValue: string;
  afterValue: string;
  /** "Month before" / "Last month". */
  beforeLabel: string;
  afterLabel: string;
  /**
   * The signed movement as a tile, or NULL for a dispersion metric — a change in
   * night-to-night scatter is not a quantity anybody can picture, so the sheet
   * shows the two spreads (which ARE readable) and no delta tile, the same rule
   * the row's `change` follows.
   */
  changeValue: string | null;
  unit: string;
  /** How many days each window actually holds. The sheet says this out loud
   *  instead of a confidence bar: a windowed median is not a statistical test and
   *  the honest measure of how much it rests on is the coverage. */
  recentN: number;
  priorN: number;
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

    const sliceFrom = Math.max(0, series.length - WATCH_SPARK_DAYS);
    const keys = matrix.keys.slice(sliceFrom);
    const values = series.slice(sliceFrom);
    const dispersion = def.aggregate === 'stdev';

    out.push({
      metric: id,
      title: shortMetric(def),
      sub: `${capitalize(phraseOf(def, delta.delta))} vs last month`,
      value: `${def.fmt(delta.recent)} ${def.unit}`,
      change: dispersion
        ? (delta.direction === 'improving' ? 'Steadier' : 'Less steady')
        : `${delta.delta > 0 ? '+' : '-'}${def.fmt(Math.abs(delta.delta))} ${def.unit}`,
      good: delta.direction === 'improving',
      series: values,
      keys,
      // The recent window is the tail of the FULL series, so its start inside the
      // slice is measured from the slice's own end, not from the journal's.
      splitIndex: Math.max(0, values.length - TREND_WINDOW_DAYS),
      beforeValue: def.fmt(delta.prior),
      afterValue: def.fmt(delta.recent),
      beforeLabel: 'Month before',
      afterLabel: 'Last month',
      changeValue: dispersion ? null : `${delta.delta > 0 ? '+' : '-'}${def.fmt(Math.abs(delta.delta))}`,
      unit: def.unit,
      recentN: delta.recentN,
      priorN: delta.priorN,
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
        `daily score ${phraseOf(TREND_METRICS.score, delta.delta)} vs last month`);
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

/* ---------- how far you have come ---------- */

/** Logged days needed at each end before a first-versus-now claim is allowed. */
export const SINCE_WINDOW = 14;
/** Total logged days needed for the two windows not to overlap and still mean something. */
export const SINCE_MIN_DAYS = SINCE_WINDOW * 2;

/**
 * One score component's contribution to the change: how it graded then, how it
 * grades now, and what that difference is worth in points of the final score.
 */
export interface SincePart {
  label: string;
  /** The component's weight in `scoreSet`, as a percentage. */
  weight: number;
  /** Median grade points (0-100) in each window. */
  then: number;
  now: number;
  /** Points of the FINAL score this component's move accounts for, signed. */
  delta: number;
}

export interface SinceStart {
  /** Signed percent change in the daily score, recent against earliest. */
  pct: number;
  /** Scored days each window actually had. */
  thenN: number;
  nowN: number;
  /** The two window medians, on the 0-100 score. */
  thenScore: number;
  nowScore: number;
  /** First and last logged day the comparison used. */
  fromKey: string;
  toKey: string;
  /** What moved, largest contribution first. Empty when nothing is comparable. */
  parts: SincePart[];
  /** Is the change the healthy direction? */
  better: boolean;
  /** The coloured half: "14% better", "9% worse", "About the same". */
  value: string;
  /** The grey half, including its leading space: " than day one". */
  tail: string;
  /** For the accessibility label. */
  detail: string;
}

/**
 * "14% better than day one" — the daily score now against the daily score at the
 * very start of the journal.
 *
 * This is the one number on the screen that answers "is any of this working",
 * which is why it earns the header. Three things make it honest:
 *
 * 1. IT SCORES ONLY THE TWO ENDS. `scoreSet` is the expensive extractor in the
 *    app, and this needs the earliest fortnight and the latest fortnight, not the
 *    two years in between. So it takes the LOGGED day keys, slices both ends, and
 *    runs `metricSeries` over 28 days regardless of journal length. That also means
 *    "day one" really is day one, rather than the start of the 180-day analysis
 *    window that everything else here uses.
 * 2. SIGNIFICANCE IS `compareWindows`, not a fresh threshold. The two windows are
 *    concatenated with the recent one at the tail, which is exactly the shape it
 *    expects, so the question "has this moved enough to say so" is answered by the
 *    registry the rest of the app already agrees with. Below that bar it reports
 *    "About the same", which is a real answer and not a hedge.
 * 3. THE PERCENTAGE IS POINTS ON A 0-100 INDEX, so it is bounded and cannot read as
 *    hype. See the comment at the calculation.
 * 4. IT RETURNS null RATHER THAN GUESSING. Under SINCE_MIN_DAYS of logged days, or
 *    with too few scored days at either end, there is no comparison to make and the
 *    header falls back to stating its window instead.
 *
 * Reports a decline, in red. Somebody who has got worse over a year is owed that
 * plainly on a screen they opened to find out, and `detectDownturn` is what handles
 * the acute case.
 */
export function changeSinceStart(days: DaysMap, dk: string, ctx: ScoreContext = {}, anchor?: string | null): SinceStart | null {
  const all = Object.keys(days).sort().filter((k) => k <= dk);
  // An explicit anchor moves day one forward: the baseline becomes the first
  // SINCE_WINDOW logged days at or after it. Somebody who imported a year of Health
  // data has a "day one" from before they were paying attention, and somebody
  // recovering from a distinct event wants to measure from that event. An anchor with
  // too little behind it is ignored rather than honoured into a null result, because
  // silently losing the claim is worse than quietly using the default.
  const anchored = anchor ? all.filter((k) => k >= anchor) : all;
  const logged = anchored.length >= SINCE_MIN_DAYS ? anchored : all;
  if (logged.length < SINCE_MIN_DAYS) return null;

  const first = logged.slice(0, SINCE_WINDOW);
  const last = logged.slice(-SINCE_WINDOW);
  const def = TREND_METRICS.score;
  // One array, earliest first, so `compareWindows` reads the recent window off the
  // tail the way it does everywhere else.
  const series = [
    ...(metricSeries(days, first, ['score'], ctx).score || []),
    ...(metricSeries(days, last, ['score'], ctx).score || []),
  ];
  const delta = compareWindows(series, SINCE_WINDOW, SINCE_WINDOW, def);
  if (delta.direction === 'unknown' || !Number.isFinite(delta.prior) || delta.prior <= 0) return null;

  // PERCENTAGE POINTS ON THE SCORE'S OWN SCALE, not a ratio.
  //
  // The daily score is an index out of 100, so a rise from 25 to 90 is 65 points on
  // a 100-point scale — which is exactly 65 percentage points, and reads correctly
  // as "65% better". A ratio of the two would call the same move "251% better":
  // arithmetically true, unbounded, and hype rather than information. Same reason
  // ./change gates its percent tile on `deltaKind`.
  const pct = Math.round(delta.recent - delta.prior);
  const better = delta.direction === 'improving';
  const detail = `${def.fmt(delta.prior)} then, ${def.fmt(delta.recent)} now`;
  const base = {
    thenN: delta.priorN,
    nowN: delta.recentN,
    thenScore: delta.prior,
    nowScore: delta.recent,
    fromKey: first[0],
    toKey: last[last.length - 1],
    parts: comparePartsOf(days, first, last, ctx),
    detail,
  };

  // Not significant, or a rounded percentage of zero: say so rather than dress a
  // flat month as a gain.
  if (!delta.significant || pct === 0) {
    return { ...base, pct: 0, better: true, value: 'About the same', tail: ' as day one' };
  }
  return {
    ...base,
    pct,
    better,
    value: `${Math.abs(pct)}% ${better ? 'better' : 'worse'}`,
    tail: ' than day one',
  };
}

/**
 * WHAT moved between the two windows, component by component.
 *
 * The score is a weighted blend, so "40% better" is the sum of its parts and this
 * is those parts: for every component `scoreSet` graded in BOTH windows, the median
 * grade points then against now, converted into points of the final score by its own
 * weight. Only components present at both ends are comparable — one that appeared
 * partway through has no "then" to be measured against, and counting it as zero
 * would credit the whole of its weight to a change that is really just the user
 * starting to log it.
 */
function comparePartsOf(days: DaysMap, first: string[], last: string[], ctx: ScoreContext): SincePart[] {
  const grade = (keys: string[]) => {
    const out = new Map<string, { w: number; pts: number[] }>();
    const confs: number[] = [];
    keys.forEach((k) => {
      const d = days[k];
      if (!d) return;
      const readings = (d.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
      const set = scoreSet(readings, d, k, days, ctx);
      if (set.score == null) return;
      confs.push(set.confidence);
      set.comps.forEach((c) => {
        const cur = out.get(c.label) || { w: c.w, pts: [] };
        cur.pts.push(c.p);
        out.set(c.label, cur);
      });
    });
    return { comps: out, avail: median(confs) };
  };

  const a = grade(first);
  const b = grade(last);
  // DIVIDE BY THE AVAILABLE WEIGHT, NOT BY 100.
  //
  // `scoreSet` normalises: score = sum(w * p) / confidence, where confidence is the
  // weight it actually had. So a day scored from HRV alone has 25% of the weight
  // carrying the whole 0-100 range, and dividing by 100 understated every component
  // by a factor of four — the parts summed to 10 against a headline of 40. Using the
  // median available weight makes them add up, which is the only reason showing them
  // is honest.
  const avail = median([a.avail, b.avail].filter((v) => Number.isFinite(v) && v > 0));
  if (!Number.isFinite(avail) || avail <= 0) return [];

  const parts: SincePart[] = [];
  a.comps.forEach((av, label) => {
    const bv = b.comps.get(label);
    if (!bv || av.pts.length < 3 || bv.pts.length < 3) return;
    const then = median(av.pts);
    const now = median(bv.pts);
    parts.push({ label, weight: av.w, then, now, delta: (av.w * (now - then)) / avail });
  });
  return parts.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}
