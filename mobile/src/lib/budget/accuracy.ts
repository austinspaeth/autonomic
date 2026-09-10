/**
 * "Your budget held on 11 of your last 13 days."
 *
 * The sentence that makes the feature worth trusting, and the one thing no
 * other pacing app can print. It is only sayable because the journal is kept
 * and every paced day gets a verdict two days later (./outcome).
 *
 * Two rules do the work:
 *
 *   MISSES ARE REPORTED AS READILY AS HITS. An accuracy readout that only
 *   counts its wins is marketing. The whole basis of obeying a ceiling is that
 *   the app tells you when it was wrong.
 *
 *   UNDER A MINIMUM IT CLAIMS NOTHING. "2 of 2" is not a hit rate, it is two
 *   days, and quoting it would teach a new user to trust a number built from
 *   nothing. Below the bar the card states the count it has and says when the
 *   readout arrives.
 *
 * THREE OUTCOMES, NOT TWO. A day over budget is its own cell and is counted in
 * neither column: collapsing it into "missed" would turn a record of the
 * MODEL'S accuracy into a scorecard of the user's behaviour, which is the one
 * thing this card must never be.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import type { TypeDef } from '../types';
import { capacityBaseline } from './baseline';
import { makeSpendLookup, type SpendLookup } from './burn';
import { makeScoreLookup, outcomeOf, type ScoreLookup } from './outcome';

/** Under-budget days with a verdict needed before a hit rate is claimed. */
export const MIN_EVALUATED = 21;
/** Days the history strip shows. */
export const STRIP_DAYS = 13;
/** Days scanned for the readout. */
export const ACCURACY_DAYS = 42;

export type CellOutcome = 'held' | 'dipped' | 'over' | 'pending';

export interface AccuracyCell {
  dk: string;
  outcome: CellOutcome;
}

/** One week of the trend chart: how many under-budget days held, of how many
 *  were evaluated. A week with nothing evaluated is not drawn. */
export interface AccuracyWeek {
  /** The Monday of the week, for ordering. */
  dk: string;
  held: number;
  of: number;
}

/** Weeks the trend chart shows, newest last. */
export const TREND_WEEKS = 5;
/** Weeks of history needed before the chart can be drawn at all. Below this it
 *  would be one or two bars, which is a shape, not a trend. */
export const MIN_TREND_WEEKS = 4;

export interface Accuracy {
  /** True once there are enough evaluated days to quote a rate. */
  ready: boolean;
  /** Under-budget days that held. */
  held: number;
  /** Under-budget days with any verdict. The denominator. */
  of: number;
  /** Under-budget days that dipped anyway: the model was too generous. */
  missed: number;
  strip: AccuracyCell[];
  needed: number;
  /** Week by week, for the trend chart. Empty until there are enough weeks. */
  weeks: AccuracyWeek[];
  /** How much the ceiling has moved across the charted window, in minutes.
   *  Null when it has not moved enough to be worth a figure. */
  widenedMin: number | null;
}

export function buildAccuracy(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
  types: Record<string, TypeDef>,
  lineBpm: number | null,
  scoreAt: ScoreLookup = makeScoreLookup(days, ctx),
  spendAt: SpendLookup = makeSpendLookup(days, types, lineBpm),
): Accuracy {
  const cells: AccuracyCell[] = [];
  let held = 0;
  let missed = 0;

  // Oldest first so the strip reads left to right like the rest of the app.
  for (let i = ACCURACY_DAYS; i >= 1; i--) {
    const k = addDays(dk, -i);
    const d = days[k];
    if (!d) continue;
    const envelope = capacityBaseline(days, k, ctx, addDays, types, lineBpm, scoreAt, spendAt).effortMin;
    const spend = spendAt(k);
    if (spend > envelope) { cells.push({ dk: k, outcome: 'over' }); continue; }
    const outcome = outcomeOf(days, k, ctx, addDays, scoreAt);
    if (outcome === 'unknown') { cells.push({ dk: k, outcome: 'pending' }); continue; }
    if (outcome === 'held') held++; else missed++;
    cells.push({ dk: k, outcome: outcome === 'held' ? 'held' : 'dipped' });
  }

  const of = held + missed;

  /* Week buckets, newest last. Only weeks that actually evaluated something are
     kept: an empty bar would read as a week that went badly. */
  const weekOf = new Map<string, { held: number; of: number }>();
  cells.forEach((c) => {
    if (c.outcome !== 'held' && c.outcome !== 'dipped') return;
    const d = new Date(`${c.dk}T00:00:00`);
    const mon = addDays(c.dk, -((d.getDay() + 6) % 7));
    const w = weekOf.get(mon) || { held: 0, of: 0 };
    w.of++;
    if (c.outcome === 'held') w.held++;
    weekOf.set(mon, w);
  });
  const weeks: AccuracyWeek[] = [...weekOf.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-TREND_WEEKS)
    .map(([dkk, w]) => ({ dk: dkk, held: w.held, of: w.of }));

  return {
    ready: of >= MIN_EVALUATED,
    held,
    of,
    missed,
    strip: cells.slice(-STRIP_DAYS),
    needed: MIN_EVALUATED,
    weeks: weeks.length >= MIN_TREND_WEEKS ? weeks : [],
    widenedMin: null,
  };
}
