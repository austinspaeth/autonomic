/**
 * How much this person can absorb — the number that makes the budget theirs.
 *
 * Two things live here. The EXERTION LINE, which is what "above your line"
 * means for this user, and the CAPACITY BASELINE, which is the ceiling.
 *
 * The ceiling is deliberately not a constant and not a population figure. It
 * is read off the days this user got away with: days that were FOLLOWED by a
 * non-declining window (./outcome). In other words "how much you have been
 * able to do without paying for it", which is only computable because the app
 * keeps the journal and the score history.
 *
 * DAY ONE IS THE HARD PART, and it is solved with a prior rather than with a
 * blank screen. A feature that says "come back in three weeks" is one most
 * users never meet: they install on a bad week, see an empty box, and the app
 * has spent its one chance. So the first budget is sized by the user's own
 * morning readings through the grade the Outlook already computed, and every
 * held day pulls it toward what this person has actually been absorbing. The
 * strip says "Learning" the whole time it is doing that, so the claim is "this
 * is yours and still being fitted", never "this is measured".
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import { scoreCat, type DaysMap } from '../scoring/day';
import { median } from '../trends/compare';
import { keyRange, metricSeries } from '../trends/series';
import type { TypeDef } from '../types';
import { makeSpendLookup, type SpendLookup } from './burn';
import { makeScoreLookup, outcomeOf, type ScoreLookup } from './outcome';

/** bpm above the user's own resting rate that counts as exertion. Not a
 *  fitness zone: this population's resting rate is often already high, and a
 *  %HRmax line would call their normal afternoon a workout. */
export const LINE_ABOVE_RESTING = 25;
/** Resting-HR readings needed before there is a line at all. */
export const MIN_LINE_READINGS = 5;

/**
 * bpm BELOW the user's own resting rate that counts as settled.
 *
 * Their own median would be no bar at all — half of every day sits under a
 * median by definition — so the line is a few beats under it, which is a heart
 * that has genuinely come down rather than one going about its business.
 */
export const RECOVERY_BELOW_RESTING = 5;

/**
 * The fallback when there is no resting baseline yet.
 *
 * A population number, which this app otherwise refuses to use, and it is only
 * defensible as a FLOOR: 75 is low enough that almost nobody in this population
 * is under it while doing something, so a new user is credited too little
 * rather than too much. It retires itself the moment five resting readings
 * exist, and everything downstream then runs on the person.
 */
export const RECOVERY_DEFAULT_BPM = 75;

/** Days of history the ceiling reads. */
export const BASELINE_DAYS = 42;
/** Held days needed before the budget is fully the user's own. */
export const LEARN_DAYS = 14;
/**
 * Which held day the evidence is read off.
 *
 * Held-day spend is a LOWER BOUND on capacity, never an estimate of it: a day
 * spent at 20 effort minutes that held says nothing about where 200 would
 * land. So the statistic is a high percentile rather than a median — the most
 * this person has been seen to absorb and get away with — and it can only
 * RAISE the ceiling above the prior.
 *
 * Lowering has to have a reason, and the reason is a DIP, which is
 * ./calibrate's job. Letting a quiet week pull the ceiling down was the first
 * real bug this model had: run against the demo journal, whose logged
 * activities are a couple of short walks a day, the median of held-day spend
 * collapsed the budget to 33 minutes for every day of a two-month recovery
 * arc. That is not a person whose capacity is half an hour. It is a person
 * whose PHONE only saw half an hour, and a ceiling built from it would have
 * called an ordinary afternoon an overspend.
 */
export const EVIDENCE_PCT = 0.75;
/** Held days needed before the evidence statistic means anything. */
export const MIN_EVIDENCE_DAYS = 3;

/**
 * Where a brand new journal starts, in effort minutes, by the day's own grade.
 *
 * Low for the population on purpose. These are starting points, not claims:
 * the first evaluated outcome already moves them, and the strip never presents
 * them as measured. A Crash day is suppressed and never reaches this table.
 */
export const PRIOR_BY_GRADE: Record<string, number> = {
  Excellent: 300,
  Good: 270,
  Moderate: 220,
  Compromised: 170,
  Bad: 120,
};
/** Used when the day has no score at all yet. */
export const PRIOR_DEFAULT = 200;

/** How hard the first couple of verdicts move the prior. Fast early, because
 *  a new user has to SEE it learn, then ./calibrate takes over at its slower
 *  rate for the rest of the journal's life. */
export const EARLY_LEARN_DAYS = 2;
const EARLY_DIP_FACTOR = 0.85;
const EARLY_HELD_GAP = 0.5;

/**
 * The heart rate above which a minute is charged, for this user.
 *
 * Goes through `metricSeries` rather than reading entries directly, so "what
 * is this day's resting heart rate" stays answered in exactly one place
 * (trends/metrics.ts) the way strain.ts does it.
 */
export function exertionLine(days: DaysMap, dk: string, ctx: ScoreContext, addDays: (k: string, n: number) => string): number | null {
  const keys = keyRange(dk, BASELINE_DAYS, addDays);
  const series = metricSeries(days, keys, ['restingHr'], ctx);
  const vals = series.restingHr.filter((v): v is number => v != null);
  if (vals.length < MIN_LINE_READINGS) return null;
  return Math.round(median(vals) + LINE_ABOVE_RESTING);
}

/** The heart rate below which an awake minute counts as recovery, for this
 *  user. Never null: without a baseline it falls back to the conservative
 *  floor rather than crediting nothing. */
export function recoveryLine(days: DaysMap, dk: string, ctx: ScoreContext, addDays: (k: string, n: number) => string): number {
  const keys = keyRange(dk, BASELINE_DAYS, addDays);
  const vals = metricSeries(days, keys, ['restingHr'], ctx).restingHr.filter((v): v is number => v != null);
  if (vals.length < MIN_LINE_READINGS) return RECOVERY_DEFAULT_BPM;
  return Math.round(median(vals) - RECOVERY_BELOW_RESTING);
}


/** The value at `p` through a sorted sample, linearly interpolated. */
function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export interface CapacityBaseline {
  /** The ceiling in effort minutes. Never null: day one gets the prior. */
  effortMin: number;
  /** Days whose outcome was 'held' and so fed the evidence. */
  heldDays: number;
  /** 0..1. How much of the figure is the person rather than the prior. */
  learning: number;
  /** The evidence statistic, or null before there is enough of it. */
  personal: number | null;
  prior: number;
  /** What the early-days adjustment did, for the sheet's "it is learning"
   *  line. Null once the journal is past the first couple of verdicts. */
  earlyMove: { min: number; dir: 'up' | 'down'; dk: string } | null;
}

/**
 * The ceiling for `dk`, raising the prior toward demonstrated capacity.
 *
 * `now` is not needed: this looks only at COMPLETE days behind `dk`, because a
 * day in progress has not spent what it is going to spend and would drag every
 * median it entered.
 */
export function capacityBaseline(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
  types: Record<string, TypeDef>,
  lineBpm: number | null,
  scoreAt: ScoreLookup = makeScoreLookup(days, ctx),
  spendAt: SpendLookup = makeSpendLookup(days, types, lineBpm),
): CapacityBaseline {
  // The prior, from today's own grade.
  const todayScore = scoreAt(dk);
  const prior0 = todayScore == null ? PRIOR_DEFAULT : (PRIOR_BY_GRADE[scoreCat(todayScore).short] ?? PRIOR_DEFAULT);

  // Walk the complete days behind today, oldest first, collecting verdicts.
  const keys = keyRange(addDays(dk, -1), BASELINE_DAYS, addDays);
  const held: number[] = [];
  const verdicts: { dk: string; spend: number; outcome: 'held' | 'dipped' }[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    const outcome = outcomeOf(days, k, ctx, addDays, scoreAt);
    if (outcome === 'unknown') return;
    const spend = spendAt(k);
    verdicts.push({ dk: k, spend, outcome });
    if (outcome === 'held') held.push(spend);
  });

  // Early days move the prior directly, so a new user watches it fit itself.
  let prior = prior0;
  let earlyMove: CapacityBaseline['earlyMove'] = null;
  verdicts.slice(0, EARLY_LEARN_DAYS).forEach((v) => {
    const before = prior;
    if (v.outcome === 'dipped') {
      prior = prior * EARLY_DIP_FACTOR;
    } else if (v.spend > prior) {
      prior = prior + (v.spend - prior) * EARLY_HELD_GAP;
    }
    const delta = prior - before;
    if (Math.abs(delta) >= 5) {
      earlyMove = { min: Math.abs(delta), dir: delta > 0 ? 'up' : 'down', dk: v.dk };
    }
  });

  const learning = Math.min(1, held.length / LEARN_DAYS);

  // Evidence of capacity, read off the days this person actually got away
  // with. It is a floor under the ceiling, never a cap on it.
  const personal = held.length >= MIN_EVIDENCE_DAYS ? percentile(held, EVIDENCE_PCT) : null;
  const effortMin = personal != null && personal > prior
    ? prior + (personal - prior) * learning
    : prior;

  return {
    effortMin: Math.max(30, Math.round(effortMin)),
    heldDays: held.length,
    learning,
    personal: personal == null ? null : Math.round(personal),
    prior: Math.round(prior),
    earlyMove,
  };
}
