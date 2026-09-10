/**
 * What a logged entry COSTS, in effort minutes.
 *
 * The unit is the minute of moderate effort: one minute of errands costs one,
 * one minute of strength costs 1.6, one minute of legs-up gives 0.35 back. It
 * was chosen because the user can check it against their own afternoon — an
 * index out of 100 would be a second score competing with the Outlook's, and a
 * point is a quantity nobody can picture.
 *
 * THE TABLE IS THE PRODUCT, the way the scoring thresholds are. The
 * non-exercise rows are the whole reason this exists: `activityGrade` in
 * scoring/day.ts already half-knows that stressfulWork, errands, shower and
 * carWash are what put this population on the floor, but it only COUNTS
 * entries by type and cannot tell a five-minute set from a ninety-minute one.
 * Here duration is the multiplicand and every type has a weight, including the
 * ones no fitness app would bill for.
 *
 * Pure: no store, no native, no React.
 */
import type { Entry, TypeDef } from '../types';

export type LoadWeight = 'rest' | 'light' | 'moderate' | 'heavy' | 'strenuous';

/**
 * Effort minutes per logged minute.
 *
 * Deliberately compressed at the top. A POTS/ME body does not pay four times
 * more for strength than for standing in a supermarket queue, which is what a
 * metabolic-equivalent table would claim; the spread here is under 4x across
 * the whole range because the cost of being upright and stressed is the point.
 */
export const LOAD_PER_MIN: Record<LoadWeight, number> = {
  rest: -0.35,
  light: 0.6,
  moderate: 1.0,
  heavy: 1.6,
  strenuous: 2.2,
};

/**
 * The refund rate, kept separate from LOAD_PER_MIN.rest so it can be tuned
 * without touching a single cost. Lying with your legs up genuinely buys room
 * back in this population, and "you bought yourself 7 minutes by lying down"
 * is the most reinforcing sentence this feature can produce. It is bounded by
 * CREDIT_CAP so a day of it can never manufacture a budget.
 */
export const CREDIT_PER_MIN = LOAD_PER_MIN.rest;

/** A day's credits may return at most this share of the envelope. Rest helps;
 *  it does not reset the day, and an uncapped refund would let someone log
 *  four hours of legs-up and buy a whole second day. */
export const CREDIT_CAP = 0.25;

/** Minutes assumed when an entry carries no duration. Low on purpose: the
 *  guess should never be the largest row on the sheet, and the drill-in says
 *  it was a guess. */
export const ASSUMED_MIN = 20;

/** The default for a user-created activity that never answered the question. */
export const DEFAULT_WEIGHT: LoadWeight = 'moderate';

/**
 * Every built-in activity type. A test asserts this covers ACTIVITY_TYPES, so
 * a new registry type cannot ship without a decision about what it costs.
 */
export const LOAD_TABLE: Record<string, LoadWeight> = {
  // Restorative. These BUY BACK, they do not merely cost nothing.
  legsUp: 'rest',
  breathwork: 'rest',
  cooldown: 'rest',

  // Upright and gentle. Non-zero because upright is the axis that matters:
  // a shower is thermal load plus standing, and it flattens people.
  walk: 'light',
  taiChi: 'light',
  yoga: 'light',
  pilates: 'light',
  shower: 'light',

  // A moderate minute is the unit. Note what is in here: errands, stressful
  // work and washing the car sit beside cycling, which is the correction this
  // whole table exists to make.
  errands: 'moderate',
  stressfulWork: 'moderate',
  carWash: 'moderate',
  dance: 'moderate',
  hike: 'moderate',
  cycle: 'moderate',
  elliptical: 'moderate',
  swim: 'moderate',
  rower: 'moderate',
  stairStepper: 'moderate',
  sex: 'moderate',
  indoorBike: 'moderate',
  otherExercise: 'moderate',

  strength: 'heavy',
  coreWorkout: 'heavy',
  hiit: 'heavy',
  kickboxing: 'heavy',
  run: 'heavy',

  strenuousWork: 'strenuous',
};

/**
 * How much harder a minute gets when the heart ran above the user's own
 * exertion line during it, capped so a single hard session cannot dominate.
 *
 * ONE slope and ONE cap for the whole feature. `burn.ts` prices the passive
 * heart-rate row off the same two constants, because a minute at line+30 has
 * to cost the same whether the user happened to log an activity over it or
 * not — two curves would mean the same afternoon was worth two different
 * numbers depending on how diligent the journal was.
 */
export const HR_BOOST_CAP = 0.5;
export const HR_BOOST_PER_BPM = 1 / 40;

/**
 * The multiplier for a heart rate `deltaBpm` above the line.
 *
 * Relative to the person, never a textbook rate: in this population a resting
 * heart rate of 95 is a Tuesday, and an absolute "over 110 bpm" threshold
 * would call half of them permanently exerting. At the line itself the
 * multiplier is 1 and it climbs from there, so the charge is CONTINUOUS —
 * which is also what makes it robust. A hard threshold puts somebody hovering
 * at their own line one beat of watch error away from a completely different
 * day.
 */
export function hrBoostFor(deltaBpm: number): number {
  if (!(deltaBpm > 0)) return 1;
  return 1 + Math.min(HR_BOOST_CAP, deltaBpm * HR_BOOST_PER_BPM);
}

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};

/**
 * The weight for one type. A user-created type's own answer wins, then the
 * table, then moderate — so an activity is never free just because nobody
 * decided what it cost.
 */
export function loadOf(def: TypeDef | undefined, key: string): LoadWeight {
  if (def?.load) return def.load;
  return LOAD_TABLE[key] || DEFAULT_WEIGHT;
}

export interface EntryCost {
  minutes: number;
  effortMin: number;
  weight: LoadWeight;
  /** The multiplier the heart rate applied, 1 when it did not. */
  hrBoost: number;
  /** True when `minutes` was assumed rather than logged. */
  assumed: boolean;
  credit: boolean;
}

/**
 * What one logged entry cost. `lineBpm` is the user's own exertion line
 * (budget/baseline.ts); pass null when there is no baseline for one, and the
 * heart-rate boost is simply not applied rather than guessed at.
 */
export function entryCost(entry: Entry, def: TypeDef | undefined, lineBpm: number | null): EntryCost {
  const weight = loadOf(def, entry.type);
  const logged = num(entry.duration);
  const minutes = logged != null && logged > 0 ? logged : ASSUMED_MIN;
  const assumed = logged == null || logged <= 0;
  const credit = weight === 'rest';

  let hrBoost = 1;
  if (!credit && lineBpm != null) {
    const avg = num(entry.avgHr);
    if (avg != null && avg > lineBpm) hrBoost = hrBoostFor(avg - lineBpm);
  }

  const perMin = credit ? CREDIT_PER_MIN : LOAD_PER_MIN[weight];
  return {
    minutes,
    effortMin: minutes * perMin * hrBoost,
    weight,
    hrBoost,
    assumed,
    credit,
  };
}
