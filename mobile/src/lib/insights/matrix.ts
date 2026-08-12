/**
 * One table: a row per day, a column per outcome and per factor, every column
 * index-aligned to the same key range.
 *
 * Everything downstream (./correlate, ./change, ./observations) reads this and
 * nothing else, which is what makes the whole engine one pass over the journal
 * rather than one pass per question. The expensive part by a wide margin is
 * `scoreSet`, and ../trends/series already computes it once per day and shares it
 * between every score-derived metric — so outcomes come from a single
 * `metricSeries` call rather than from anything hand-rolled here.
 *
 * This module also owns the active-window rule described in ./factors: a factor
 * is `null` outside the span where its category was being logged. It is applied
 * here rather than inside each factor's `value` because it needs the whole key
 * range to find the span, which a per-day extractor cannot see.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import { metricSeries, type TrendMetricId } from '../trends';
import type { AppState } from '../types';
import type { FactorDef } from './factors';

export interface DayMatrix {
  /** Oldest first. Every column is indexed by position in here. */
  keys: string[];
  /** True where the journal has a record for that day at all. */
  logged: boolean[];
  outcomes: Partial<Record<TrendMetricId, (number | null)[]>>;
  /** Keyed by `FactorDef.id`. */
  factors: Record<string, (number | null)[]>;
  /** The factor definitions the columns came from, in the same order they were
   *  built, so callers can go from a column back to its copy. */
  defs: FactorDef[];
  ctx: ScoreContext;
  days: DaysMap;
}

/**
 * Index of the first day a factor's category appears, or -1 if never.
 *
 * Memoized by `presence.key` across factors, because a user with 14 supplements
 * has 14 factors that all share one answer.
 */
function spanStarts(days: DaysMap, keys: string[], defs: FactorDef[]): Map<string, number> {
  const out = new Map<string, number>();
  defs.forEach((f) => {
    const pres = f.presence;
    if (!pres || pres.mode !== 'span' || out.has(pres.key)) return;
    let start = -1;
    for (let i = 0; i < keys.length; i++) {
      const d = days[keys[i]];
      if (d && pres.has(d)) { start = i; break; }
    }
    out.set(pres.key, start);
  });
  return out;
}

/**
 * Build the table.
 *
 * `outcomeIds` is passed in rather than assumed so ./watch and ./correlate can
 * ask for different sets, and so a test can pin one metric without paying for
 * eighteen.
 */
export function buildDayMatrix(
  state: AppState,
  keys: string[],
  outcomeIds: TrendMetricId[],
  defs: FactorDef[],
  ctx: ScoreContext,
): DayMatrix {
  const days = state.days;
  const outcomes = metricSeries(days, keys, outcomeIds, ctx) as Partial<Record<TrendMetricId, (number | null)[]>>;
  const logged = keys.map((k) => !!days[k]);
  const starts = spanStarts(days, keys, defs);

  const factors: Record<string, (number | null)[]> = {};
  defs.forEach((f) => {
    const pres = f.presence;
    const spanStart = pres && pres.mode === 'span' ? (starts.get(pres.key) ?? -1) : 0;
    const col = new Array<number | null>(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const d = days[keys[i]];
      // Never knowable: no record for the day, before the category was ever
      // logged, or (for `day` presence) the day itself carries nothing.
      if (!d || (pres && pres.mode === 'span' && (spanStart < 0 || i < spanStart)) || (pres && pres.mode === 'day' && !pres.has(d))) {
        col[i] = null;
        continue;
      }
      col[i] = f.value(d, keys[i], days, ctx);
    }
    factors[f.id] = col;
  });

  return { keys, logged, outcomes, factors, defs, ctx, days };
}

/**
 * A factor column shifted forward by `lag` days, so index i holds the factor
 * value from i − lag.
 *
 * Shifting the factor rather than the outcome keeps every column aligned to the
 * same key range, which means the outcome column, the `logged` mask and the day
 * labels all stay usable without a second set of offsets to reason about.
 */
export function laggedColumn(col: (number | null)[], lag: number): (number | null)[] {
  if (!lag) return col;
  const out = new Array<number | null>(col.length).fill(null);
  for (let i = lag; i < col.length; i++) out[i] = col[i - lag];
  return out;
}

/** Index pairs where both columns have a value — the only days a test may see. */
export function pairs(a: (number | null)[], b: (number | null)[]): { x: number[]; y: number[] } {
  const x: number[] = [], y: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i], bv = b[i];
    if (av == null || bv == null) continue;
    x.push(av); y.push(bv);
  }
  return { x, y };
}
