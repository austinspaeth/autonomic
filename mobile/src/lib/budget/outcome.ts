/**
 * Was that day's pacing RIGHT? The answer key the whole feature rests on.
 *
 * This is the thing no other pacing app has. Visible's formula is the formula:
 * it hands out points and never finds out whether the ceiling it drew was the
 * user's real one. We keep the journal and the score history, so every day the
 * user paced can be marked afterwards against what actually happened, and the
 * budget can then be corrected toward the person rather than toward a model.
 *
 * THE WINDOW IS +1 AND +2, NEVER "TOMORROW". Post-exertional malaise is
 * delayed 24 to 72 hours; a verdict read off tomorrow alone would clear a day
 * that put someone on the floor on Thursday, and confidently telling a
 * chronically ill person their Tuesday was fine is the single worst failure
 * available to this feature. Two days is the honest minimum and it is what the
 * sheet says out loud ("whether the next two days held").
 *
 * Pure: no store, no native, no React.
 */
import { scoreCat, type DaysMap } from '../scoring/day';
import type { ScoreContext } from '../scoring';
import { dayScore } from '../trends/metrics';

/** Points the following days may fall below the paced day before it counts as
 *  a dip. Below a full grade band: a 9-point wobble is noise in a score built
 *  from a handful of readings, and a card that fires on noise is one the user
 *  learns to disbelieve. */
export const DECLINE_PTS = 10;

/** How far ahead the verdict looks. Days +1 and +2. */
export const OUTCOME_DAYS = 2;

export type DayOutcome = 'held' | 'dipped' | 'unknown';

/** One day's score, memoized.
 *
 *  The ceiling walks 42 days and every verdict looks two further ahead, so a
 *  naive pass would score most days three times over. `scoreSet` is by far the
 *  most expensive thing in the scoring library and this runs inside the
 *  Journal's render memo, so the shared lookup is not an optimisation, it is
 *  what keeps the Journal from stuttering on a long journal. */
export type ScoreLookup = (dk: string) => number | null;

export function makeScoreLookup(days: DaysMap, ctx: ScoreContext): ScoreLookup {
  const cache = new Map<string, number | null>();
  return (dk: string) => {
    if (cache.has(dk)) return cache.get(dk) as number | null;
    const v = dayScore(days[dk], dk, days, ctx);
    cache.set(dk, v);
    return v;
  };
}


/**
 * The verdict on `dk`, read from the two days after it.
 *
 * `'unknown'` is a first-class answer and is never rendered as either of the
 * others: it covers a window still in the future and a window whose days were
 * never scored, and both are "we do not know", not "it was fine".
 */
export function outcomeOf(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
  scoreAt: ScoreLookup = makeScoreLookup(days, ctx),
): DayOutcome {
  const base = scoreAt(dk);
  if (base == null) return 'unknown';

  let seen = 0;
  let dipped = false;

  for (let i = 1; i <= OUTCOME_DAYS; i++) {
    const k = addDays(dk, i);
    const s = scoreAt(k);
    if (s == null) continue;
    seen++;
    // A crash is a dip whatever the arithmetic says: a day that scored 22
    // after a day that scored 30 is not an 8-point wobble.
    if (base - s > DECLINE_PTS || scoreCat(s).short === 'Crash') dipped = true;
  }

  // One scored day out of two is not a window. Requiring both is what stops a
  // sparse journal manufacturing a hit rate out of the days it happens to
  // hold readings for.
  if (seen < OUTCOME_DAYS) return 'unknown';
  return dipped ? 'dipped' : 'held';
}
