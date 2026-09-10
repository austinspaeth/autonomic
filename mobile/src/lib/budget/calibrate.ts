/**
 * The correction: if the ceiling keeps being wrong for this person, move it.
 *
 * This is the half that makes the budget worth obeying. A user who repeatedly
 * stays under budget and dips anyway has a lower ceiling than the model
 * thinks, and the model has to say so rather than keep publishing a number
 * their body disagrees with. A user who repeatedly goes over and is fine has a
 * higher one.
 *
 * Three rules keep it from thrashing:
 *   - BOUNDED. The adjustment is clamped, so no run of days can halve or
 *     double the ceiling.
 *   - SLOW. Each day nudges by a few percent, and the first couple of days of
 *     each kind are ignored entirely (that is ./baseline's job, and it moves
 *     much faster on purpose while the journal is new).
 *   - ASYMMETRIC. Coming down is twice as fast as going up. The cost of a
 *     ceiling that is too low is a good day under-used; the cost of one that
 *     is too high is a crash.
 *
 * It is a PURE FUNCTION OF HISTORY, not a stored number. "Has the ceiling
 * moved this month" is this function at two dates, so there is no drifting
 * memory file to reset, migrate or get out of step with the journal.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import type { TypeDef } from '../types';
import { capacityBaseline } from './baseline';
import { makeSpendLookup, type SpendLookup } from './burn';
import { makeScoreLookup, outcomeOf, type ScoreLookup } from './outcome';

/** Days of verdicts the correction reads. */
export const CALIBRATE_DAYS = 28;
/** Days of each kind that pass before the correction starts counting them. */
export const FREE_DAYS = 2;
/** Per-day nudge, down and up. */
const DOWN_STEP = 0.05;
const UP_STEP = 0.03;
/** The correction can never move the ceiling outside this. */
const FLOOR = 0.7;
const CEIL = 1.15;

/** How much the ceiling has to move before the sheet mentions it. Below this
 *  it is arithmetic, not news. */
export const CEILING_NEWS_MIN = 10;

export interface Ceiling {
  effortMin: number;
  /** The uncorrected baseline, so the sheet can say what the correction did. */
  baseMin: number;
  factor: number;
  /** Under-budget days that dipped anyway, and over-budget days that held. */
  underDipped: number;
  overHeld: number;
}

/**
 * The corrected ceiling for `dk`.
 *
 * The envelope each past day is judged against is that day's own baseline,
 * recomputed. That is more expensive than storing it, and it is the reason
 * there is no memory file: a stored envelope would be a claim about a journal
 * the user may since have edited or imported over.
 */
export function ceilingAt(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
  types: Record<string, TypeDef>,
  lineBpm: number | null,
  scoreAt: ScoreLookup = makeScoreLookup(days, ctx),
  spendAt: SpendLookup = makeSpendLookup(days, types, lineBpm),
): Ceiling {
  const base = capacityBaseline(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt);

  let underDipped = 0;
  let overHeld = 0;
  for (let i = 1; i <= CALIBRATE_DAYS; i++) {
    const k = addDays(dk, -i);
    const d = days[k];
    if (!d) continue;
    const outcome = outcomeOf(days, k, ctx, addDays, scoreAt);
    if (outcome === 'unknown') continue;
    const spend = spendAt(k);
    const over = spend > base.effortMin;
    if (!over && outcome === 'dipped') underDipped++;
    else if (over && outcome === 'held') overHeld++;
  }

  const down = Math.max(0, underDipped - FREE_DAYS) * DOWN_STEP;
  const up = Math.max(0, overHeld - FREE_DAYS) * UP_STEP;
  const factor = Math.min(CEIL, Math.max(FLOOR, 1 - down + up));

  return {
    effortMin: Math.max(30, Math.round(base.effortMin * factor)),
    baseMin: base.effortMin,
    factor,
    underDipped,
    overHeld,
  };
}

/** "The budget widened by 40m over the last three weeks." Null when the move
 *  is too small to be worth a sentence. */
export function ceilingMove(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
  types: Record<string, TypeDef>,
  lineBpm: number | null,
  backDays: number,
  scoreAt?: ScoreLookup,
  spendAt?: SpendLookup,
): { min: number; dir: 'up' | 'down' } | null {
  const now = ceilingAt(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt);
  const then = ceilingAt(days, addDays(dk, -backDays), ctx, addDays, types, lineBpm, scoreAt, spendAt);
  const delta = now.effortMin - then.effortMin;
  if (Math.abs(delta) < CEILING_NEWS_MIN) return null;
  return { min: Math.abs(delta), dir: delta > 0 ? 'up' : 'down' };
}
