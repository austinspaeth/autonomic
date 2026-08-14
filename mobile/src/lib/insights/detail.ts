/**
 * The per-day evidence behind ONE finding, for the sheet that opens when a
 * correlation (or the Biggest change card) is tapped.
 *
 * Every other module here reduces the journal to a claim. This one goes the other
 * way: it hands back the two columns the claim was computed from, aligned to the
 * same day keys, so the chart in the sheet is drawing the SAME numbers the
 * statistics used rather than a second extraction that could quietly disagree.
 * That is the whole reason it reads ./matrix instead of the journal.
 *
 * What the chart gets:
 *   · `values` — the outcome, one entry per day, null where the day has none.
 *   · `on`     — the factor, 1/0 for a binary factor and its raw value for a
 *                continuous one, null where the day says NOTHING about it (the
 *                active-window rule ./factors describes). Null is not zero here,
 *                and the chart must not shade it.
 *   · `onsetIndex` — where the before/after split sits, for an onset change.
 *
 * The lag is carried but NOT applied: a "next day" correlation is still drawn
 * against the day the factor happened, because that is the day the user did the
 * thing and the only day they can recognise. The sheet says which lag it was.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { TREND_METRICS, type TrendMetricId } from '../trends';
import type { BiggestChange } from './change';
import type { Correlation } from './correlate';
import type { FactorKind } from './factors';
import type { DayMatrix } from './matrix';

export interface DetailSeries {
  /** Oldest first. Every array below is indexed by position in here. */
  keys: string[];
  /** The outcome, in the metric's own unit. */
  values: (number | null)[];
  /** The factor: 1/0 when binary, the raw value when continuous, null when the
   *  day carries no information about it. */
  on: (number | null)[];
  factorKind: FactorKind | null;
  /** "Liquid IV", or null for a shift change, which has no driver. */
  factorLabel: string | null;
  metric: TrendMetricId;
  metricLabel: string;
  unit: string;
  /** Where the before/after split sits, for an onset. Null for everything else. */
  onsetIndex: number | null;
  /** 0 same-day, 1 next-day. Reported, never applied — see the module note. */
  lag: number;
}

/** The largest value in a continuous factor column, for scaling its bars. Null
 *  when the column is empty or entirely zero, where a bar chart says nothing. */
export function factorPeak(on: (number | null)[]): number | null {
  let max = 0;
  on.forEach((v) => { if (v != null && v > max) max = v; });
  return max > 0 ? max : null;
}

/**
 * The column as the chart shades it: 1 = highlight this day, 0 = don't, null =
 * nothing is known about it.
 *
 * A binary factor is already this. A CONTINUOUS one has to be split somewhere for
 * a shaded day to mean anything, and the split is its own MEDIAN — "days you drank
 * more water than you usually do", which is the same both-halves-of-your-own-log
 * comparison the row's readout reports. It is deliberately not a fixed target: a
 * threshold the user never crosses would shade nothing and imply there was nothing
 * to see.
 */
export function markColumn(s: DetailSeries): (number | null)[] {
  if (s.factorKind !== 'continuous') return s.on;
  const known = s.on.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!known.length) return s.on;
  const mid = known.length % 2 ? known[(known.length - 1) / 2] : (known[known.length / 2 - 1] + known[known.length / 2]) / 2;
  return s.on.map((v) => (v == null ? null : v >= mid && v > 0 ? 1 : 0));
}

/**
 * Trim the ends that carry nothing.
 *
 * A user who logged blood pressure for three weeks of a six-month journal should
 * see three weeks of chart, not a flat run of empty days with a scribble at one
 * end. Only the ENDS go: an interior gap is real information about the log and the
 * chart draws it as a gap.
 */
function trim(keys: string[], values: (number | null)[], on: (number | null)[]) {
  let a = 0;
  let b = keys.length - 1;
  const empty = (i: number) => values[i] == null && on[i] == null;
  while (a <= b && empty(a)) a++;
  while (b >= a && empty(b)) b--;
  return { keys: keys.slice(a, b + 1), values: values.slice(a, b + 1), on: on.slice(a, b + 1), offset: a };
}

function build(
  matrix: DayMatrix,
  outcome: TrendMetricId,
  factorId: string | null,
  lag: number,
  onsetAt: number | null,
): DetailSeries | null {
  const def = TREND_METRICS[outcome];
  const series = matrix.outcomes[outcome];
  if (!def || !series) return null;

  const factor = factorId ? matrix.defs.find((f) => f.id === factorId) || null : null;
  const col = factorId ? matrix.factors[factorId] : null;
  const on = col ? col.slice() : matrix.keys.map(() => null);

  const t = trim(matrix.keys, series.slice(), on);
  if (!t.keys.length) return null;

  return {
    keys: t.keys,
    values: t.values,
    on: t.on,
    factorKind: factor ? factor.kind : null,
    factorLabel: factor ? factor.driver : null,
    metric: outcome,
    metricLabel: def.label,
    unit: def.unit,
    // Re-based onto the trimmed range, and dropped entirely if the trim ate it.
    onsetIndex: onsetAt == null ? null : (onsetAt - t.offset >= 0 && onsetAt - t.offset < t.keys.length ? onsetAt - t.offset : null),
    lag,
  };
}

export function correlationSeries(matrix: DayMatrix, c: Correlation): DetailSeries | null {
  return build(matrix, c.outcome, c.factorId, c.lag, null);
}

/**
 * The same for the Biggest change card, whose finding is an event rather than an
 * association: the chart shows the outcome with the onset day marked, and a shift
 * (which has no driver at all) gets the outcome alone.
 */
export function changeSeries(matrix: DayMatrix, change: BiggestChange): DetailSeries | null {
  if (!change.outcome) return null;
  return build(matrix, change.outcome, change.factorId, 0, change.onsetIndex);
}
