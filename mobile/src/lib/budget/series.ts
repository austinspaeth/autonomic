/**
 * Per-day budget and spend across a range, for Progress.
 *
 * `buildBudget` answers "what about today" and does a 42-day walk to get
 * there. Progress asks the same question of up to a year of days, and calling
 * the full builder once per day would redo that walk 365 times over — tens of
 * thousands of `scoreSet` calls on a tab that is already deferred behind a
 * skeleton.
 *
 * So the caches are shared across the whole range: one score per day, one
 * spend per day, one ceiling per day, each computed the first time it is
 * asked for and reused by every later day that looks back at it. The numbers
 * are identical to the full builder's; only the arithmetic is not repeated.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import { scoreCat } from '../scoring/day';
import type { AppState, TypeDef } from '../types';
import { typesFor } from '../typeResolve';
import { exertionLine, capacityBaseline } from './baseline';
import { makeSpendLookup } from './burn';
import { makeScoreLookup, outcomeOf, type DayOutcome } from './outcome';

export interface BudgetDay {
  dk: string;
  /** Effort minutes the day could absorb, or null when suppressed. */
  envelopeMin: number | null;
  spendMin: number;
  /** envelope - spend. Positive is room left, negative is an overspend.
   *  Null when the day published no budget. */
  marginMin: number | null;
  outcome: DayOutcome;
  /** True while the ceiling was still being fitted on that day. */
  learning: boolean;
  /** Whether the app had any way to know what this day cost. */
  known: boolean;
}

/**
 * One row per key that exists in the journal. Days with no record are skipped
 * rather than returned as zero: a day the user did not open the app is not a
 * day they spent nothing.
 */
export function budgetSeries(
  state: AppState,
  keys: string[],
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
): BudgetDay[] {
  const days: DaysMap = state.days;
  const types: Record<string, TypeDef> = typesFor(state, 'activities');
  const scoreAt = makeScoreLookup(days, ctx);

  // The line moves slowly (a 42-day median of resting HR), so it is taken once
  // at the range's end rather than per day. Recomputing it 365 times would
  // dominate the whole build and move the answer by a beat or two.
  const lineBpm = keys.length ? exertionLine(days, keys[keys.length - 1], ctx, addDays) : null;

  const spendOf = makeSpendLookup(days, types, lineBpm);

  const out: BudgetDay[] = [];
  keys.forEach((dk) => {
    const d = days[dk];
    if (!d) return;
    const score = scoreAt(dk);
    // The same suppression rule the strip follows. A crash day publishes no
    // number, so it contributes nothing to a margin chart either — the
    // alternative is a huge fake overspend on the worst day of the month.
    const suppressed = score != null && scoreCat(score).short === 'Crash';
    // A finished day with no logged activity and no health read has an
    // UNKNOWN spend, not a spend of zero — and a margin computed from it would
    // report the whole budget as room the user had left over, which is a claim
    // about a day the app never saw. Today is the exception the strip handles:
    // there, spend genuinely starts at zero and accrues through the day.
    const known = (d.activities || []).length > 0 || d.load?.readAt != null;
    const base = capacityBaseline(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendOf);
    const spend = spendOf(dk);
    const blank = suppressed || !known;
    out.push({
      dk,
      envelopeMin: suppressed ? null : base.effortMin,
      spendMin: spend,
      marginMin: blank ? null : base.effortMin - spend,
      outcome: outcomeOf(days, dk, ctx, addDays, scoreAt),
      learning: base.learning < 1,
      known,
    });
  });
  return out;
}
