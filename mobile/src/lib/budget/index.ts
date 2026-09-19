/**
 * The pacing budget: one entry point, one view object.
 *
 * `buildBudget(state, dk, ctx, opts)` returns everything the Journal strip,
 * the sheet, the drill-in and the Progress card render from — the shape
 * `buildInsights` established. Nothing downstream recomputes anything.
 *
 * The honesty rules the whole module is written to, restated here because
 * this is the file a future reader opens first:
 *
 *   1. UNKNOWN IS UNKNOWN. Null is never rendered as zero and never as full.
 *   2. COVERAGE IS STATED. A budget from three logged activities is not the
 *      same object as one from a full day of heart rate, and must not look
 *      like it.
 *   3. NEVER SUGGEST DOING MORE. The budget is a ceiling, never a target. No
 *      copy anywhere may imply that unspent budget was wasted.
 *   4. SILENCE ON BAD DAYS, BUT SILENCE IS AN EVENT. A downturn, a crash-grade
 *      FALL or a strain alert publishes no number at all. Each of the three is
 *      measured against the person rather than a band, so none can latch on
 *      for ever (./envelope's `crashIsFall` is what fixed the one that could);
 *      ./pause is the backstop for the rest, with a run valve and the reader's
 *      own per-day override. A feature that has shown nothing for three days
 *      is not being careful with somebody, it is broken as far as they know.
 *   5. UNDERSHOOT. Where the model is uncertain it errs low.
 *   6. THE OUTCOME WINDOW IS +1 AND +2, never "tomorrow".
 *   7. SAY WHEN IT WAS WRONG. The accuracy readout reports misses as readily
 *      as hits, and that is the entire basis for trusting it.
 *   8. NO CAUSAL COPY. Associational, in the user's own log, in their units.
 *
 * Pure: no store, no native, no React. The shell (src/store/budget.ts) does
 * the health reads; this reads only what the shell already wrote.
 */
import type { AppState, TypeDef } from '../types';
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import { typesFor } from '../typeResolve';
import { about, clock, hm } from './format';
import { exertionLine, LEARN_DAYS } from './baseline';
import { buildEnvelope, makeEnvelopeLookup, wakeMinutes, type Envelope } from './envelope';
import { buildBurn, makeBurnLookup, makeSpendLookup, type Burn, type BudgetMultiplier } from './burn';
import { paceAt, type Pace } from './pace';
import { buildAccuracy, type Accuracy } from './accuracy';
import { ceilingMove } from './calibrate';
import { makeScoreLookup, makeSetLookup } from './outcome';
import { nextRecommendation, type Recommendation } from './recommend';
import { PAUSED_TODAY_SUB, pauseReasonText, pauseRunBefore, unpausedBy, unpausedText, type Unpaused } from './pause';
import { uprightSignature } from './upright';

/** The states the BAR can be in. Confidence is deliberately not one of them —
 *  see "which state" below. */
export type BudgetState =
  | 'healthy' | 'ahead' | 'over' | 'suppressed'
  /** A finished day the app has no way to describe. Not zero, not full: it
   *  carries no bar at all, only a line saying so. */
  | 'unknown'
  /** A finished day, under its budget. */
  | 'final-under'
  /** A finished day, past it. */
  | 'final-over';

/** Live states carry a pace line and a Todo. Finished ones carry neither. */
export const isFinal = (s: BudgetState) => s === 'final-under' || s === 'final-over' || s === 'unknown';

/**
 * Did the app see enough of this day to say what it cost?
 *
 * A logged activity, or a health read that actually landed. Without either, a
 * finished day's spend is UNKNOWN rather than zero — and a margin computed from
 * a zero would report the whole budget as room the user had left over, which is
 * a claim about a day nobody watched. Days before the pacing budget shipped are
 * mostly this, which is why the note exists.
 */
export function dayIsKnown(day: { activities?: unknown[]; load?: { readAt?: string | null } } | undefined): boolean {
  if (!day) return false;
  if ((day.activities || []).length > 0) return true;
  return day.load?.readAt != null;
}

/** Below this the figure takes the "About 3h" form, because the language has
 *  to match a graphic the reader is being told is provisional. */
const FIRM_LEARNING = 0.5;

/** How far back the ceiling-movement sentence looks. */
export const CEILING_LOOKBACK = 21;

export interface BudgetView {
  state: BudgetState;
  envelope: Envelope;
  burn: Burn;
  pace: Pace | null;
  accuracy: Accuracy;
  /** Effort minutes left. Null only when suppressed. */
  leftMin: number | null;
  /** Effort minutes past the ceiling, when over. */
  overByMin: number | null;
  /** 0..1 for the bar's fill. May exceed 1 when over. */
  fill: number;
  /** "3h 20m" / "About 3h" / "Over by 45m" */
  figure: string;
  /** "left of 5h 30m" / "" when over. */
  figureSub: string;
  /** The one subtext line. */
  sub: string;
  /** The mark beside the subtext, when there is one. */
  flag: 'amber' | 'red' | null;
  /** The right-hand label: "Low confidence" or "Learning · day 3". */
  rightLabel: string | null;
  /** The ceiling is fitted from thin evidence. It changes the WORDS — the
   *  softened figure, the label, the Todo — and never the graphic. */
  lowConfidence: boolean;
  recommendation: Recommendation | null;
  ceilingMoved: { min: number; dir: 'up' | 'down' } | null;
  /** True while the ceiling is still being fitted to the person. */
  learning: boolean;
  /** A finished day: the card reflects rather than tracks. */
  past: boolean;
  /** Nothing has been logged and nothing has been read, so the bar is an empty
   *  track waiting on a first reading. It breathes, like the tiles below it. */
  skeleton: boolean;
  /** The app is not getting this user's steps, so the strip wears a mark and
   *  the sheet leads with the ask. Only ever true on today: it is an offer to
   *  fix something, and there is nothing to fix about last Tuesday. */
  stepsMissing: boolean;
  /** Why the app would rather this day published nothing. Set on a paused day
   *  AND on one showing its number anyway, which is the whole point: the
   *  warning is not what the override takes away. */
  pausedReason: Envelope['suppressed'];
  /** Non-null when a paused day is showing its number: 'user' if the reader
   *  asked, 'run' if ./pause's valve opened it. */
  unpaused: Unpaused;
}

export interface BuildBudgetOpts {
  now: Date;
  addDays: (k: string, n: number) => string;
  /** Passed in because DaySummary has already computed both. */
  downturn: boolean;
  strain: 'watch' | 'alert' | null;
  /** A named multiplier from the user's own confirmed correlations. */
  multiplier?: BudgetMultiplier | null;
  stepsGranted?: boolean;
  /** This day is finished. Set by the caller rather than derived, because a
   *  past day is built with `now` pinned to its own end and would otherwise
   *  look like today to the engine. */
  past?: boolean;
  /** Skip the expensive history passes: the Progress card builds one of these
   *  per day and does not render an accuracy strip or a ceiling sentence. */
  brief?: boolean;
  /** The reader tapped "Show it anyway" on this day (./pauseMemory). */
  userUnpaused?: boolean;
  /** Days the budget was paused on, for ./pause's run valve. Passed in rather
   *  than read, because this module is pure and the callers that care about
   *  the valve are the ones with a screen. `src/store/pacingAlerts.ts`
   *  deliberately passes NEITHER: an override is a decision to LOOK at a
   *  number, never a licence for the app to volunteer one unprompted. */
  pausedDays?: string[];
}

export function buildBudget(
  state: AppState,
  dk: string,
  ctx: ScoreContext,
  opts: BuildBudgetOpts,
): BudgetView {
  return buildBudgetAt(state, dk, ctx, opts, [opts.now])[0];
}

/**
 * The same day's view at several moments, one per entry of `nows`.
 *
 * Everything that reads history (the envelope, the burn, the accuracy strip,
 * the ceiling sentence) is computed ONCE; only the clock-dependent tail — the
 * pace marker, the Todo, and the state and copy that follow from them — is
 * re-derived per moment. That split is what lets the iOS widget carry a
 * timeline of the marker walking across the day without the app running, at
 * the price of one build rather than one per entry. `opts.now` is ignored.
 */
export function buildBudgetAt(
  state: AppState,
  dk: string,
  ctx: ScoreContext,
  opts: BuildBudgetOpts,
  nows: Date[],
): BudgetView[] {
  const days: DaysMap = state.days;
  const { addDays } = opts;
  const types: Record<string, TypeDef> = typesFor(state, 'activities');
  // One scoreSet per day, shared by every pass below AND by the envelope's
  // morning readings, which quote components out of the same result.
  const setAt = makeSetLookup(days, ctx);
  const scoreAt = makeScoreLookup(days, ctx, setAt);

  const lineBpm = exertionLine(days, dk, ctx, addDays);
  // Created ONCE and handed to every pass below. The accuracy strip alone
  // computes a ceiling for each of 42 days, and each of those walks 42 days of
  // its own; without these two caches that is thousands of repeated scores and
  // spends on the Journal's render path.
  const burnAt = makeBurnLookup(days, types, lineBpm);
  const spendAt = makeSpendLookup(days, types, lineBpm, burnAt);
  // What each PAST day published, for the passes that grade one. Shares every
  // cache above, so the accuracy strip's 42 days cost one envelope each.
  const envelopeAt = makeEnvelopeLookup({ days, ctx, addDays, types, lineBpm, scoreAt, setAt, spendAt, burnAt });
  // The burn is built FIRST: its coverage is an input to the envelope's
  // confidence, and it needs nothing from the envelope in return (the credit
  // cap is a share of the day's own gross spend, not of the budget).
  const burn = buildBurn({ day: days[dk], types, lineBpm, multiplier: opts.multiplier, past: !!opts.past });
  // Whether a paused day shows its number anyway. Decided here rather than in
  // the envelope so the reason survives into the view: the sheet says a
  // different sentence for "you asked" than for "the app stopped waiting".
  const unpaused = unpausedBy({
    userAsked: !!opts.userUnpaused,
    run: pauseRunBefore(dk, opts.pausedDays || [], addDays),
  });
  const envelope = buildEnvelope({
    days, dk, ctx, addDays, types, lineBpm,
    downturn: opts.downturn, strain: opts.strain, coverage: burn.coverage, scoreAt, setAt, spendAt,
    past: !!opts.past, unpaused: !!unpaused,
  });

  const accuracy = opts.brief
    ? { ready: false, held: 0, of: 0, missed: 0, strip: [], needed: 21, weeks: [], widenedMin: null }
    : buildAccuracy(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt, envelopeAt);

  const wake = wakeMinutes(days, dk);
  const learning = envelope.learning < 1;
  const past = !!opts.past;
  // The same "waiting on a first reading" state the three tiles below the
  // strip are in: nothing logged, nothing read, nothing to draw a fill from.
  const skeleton = !past && burn.coverage === 'none' && burn.effortMin < 1;
  // Only ever on today. On a finished day it would be an offer to fix
  // something that has already happened.
  const stepsMissing = !past && opts.stepsGranted === false;

  /* ---------- suppressed: no number, and nothing that implies one ----------
     The test is the NUMBER, not the reason. `envelope.suppressed` stays set
     on a day the reader has revealed — it is what every surface below reads
     to keep the warning on screen — so branching on it here sent an
     overridden day straight back to the paused card and made the play button
     look dead. */
  if (envelope.effortMin == null) {
    const view: BudgetView = {
      state: 'suppressed', envelope, burn, pace: null, accuracy,
      leftMin: null, overByMin: null, fill: 0,
      figure: past ? 'Budget was paused' : 'Budget paused for today', figureSub: '',
      sub: past ? pauseReasonText(envelope.suppressed || 'downturn', true) : PAUSED_TODAY_SUB,
      flag: null, rightLabel: null, lowConfidence: false,
      recommendation: null,
      ceilingMoved: null,
      learning,
      past,
      stepsMissing,
      skeleton,
      pausedReason: envelope.suppressed,
      unpaused: null,
    };
    return nows.map(() => view);
  }

  /* A finished day nobody watched. No bar, no figure, no verdict — the app
     cannot say what that day cost and must not imply it was a quiet one. */
  if (past && !dayIsKnown(days[dk])) {
    const view: BudgetView = {
      state: 'unknown', envelope, burn, pace: null, accuracy,
      leftMin: null, overByMin: null, fill: 0,
      figure: '', figureSub: '',
      sub: 'No pacing data for this day', flag: null, rightLabel: null,
      lowConfidence: false,
      recommendation: null, ceilingMoved: null, learning, past, stepsMissing,
      skeleton,
      pausedReason: envelope.suppressed,
      unpaused,
    };
    return nows.map(() => view);
  }

  const env = envelope.effortMin;
  const spent = burn.effortMin;
  const left = env - spent;
  const fill = env > 0 ? spent / env : 0;

  const sig = past ? null : uprightSignature(days, dk, ctx, addDays);

  const ceilingMoved = opts.brief
    ? null
    : ceilingMove(days, dk, ctx, addDays, types, lineBpm, CEILING_LOOKBACK, scoreAt, spendAt);
  // The trend chart's own figure: how the ceiling moved across the weeks it
  // draws, signed, so "+40m budget widened" sits beside the bars that earned it.
  if (accuracy.weeks.length && ceilingMoved) {
    accuracy.widenedMin = ceilingMoved.dir === 'up' ? ceilingMoved.min : -ceilingMoved.min;
  }

  const low = envelope.confidence === 'low';
  // The figure softens while the ceiling is unfitted or the inputs are thin,
  // so the words and the graphic never disagree about how sure this is.
  const soft = low || envelope.learning < FIRM_LEARNING;

  /* The right-hand label states how sure the estimate is. On a finished day it
     names the day's coverage instead: "how much of that day did you see" is
     the question a record raises, where a live card raises "how sure are you
     right now". */
  const rightLabel = past
    ? (burn.coverage === 'logged-only' ? 'Logged activities only'
      : burn.coverage === 'partial' ? 'Partial day' : null)
    : learning
      ? `Learning · day ${Math.min(LEARN_DAYS, envelope.heldDays + 1)}`
      : envelope.confidence === 'low' ? 'Low confidence'
        : envelope.confidence === 'medium' ? 'Medium confidence'
          : null;

  return nows.map((now) => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    // A finished day has no "where should you be by now": the day is where it
    // ended up. The marker, the projection and the ahead/behind reading all go.
    const pace = past ? null : paceAt(nowMin, wake, env, spent);

    const recommendation = past ? null : nextRecommendation({
      days, dk, nowMin,
      learning: envelope.learning,
      heldDays: envelope.heldDays,
      signatureSource: sig?.source ?? null,
      hasHrSeries: days[dk]?.load?.hrCoverageMin != null,
      stepsGranted: opts.stepsGranted !== false && days[dk]?.load?.steps != null,
      spentShare: fill,
    });

    /* ---------- which state ----------
       Confidence is NOT a state. It used to be: low confidence outranked the
       pace and the bar drew itself in the placeholder grey, which is the same
       colour the card uses for "no data yet" — so a user who had hand-entered
       a night of sleep without its low HR opened the Journal to a faded-out
       budget and read it, correctly, as a broken feature. The estimate is real
       on every one of those days, and for plenty of people it will never be
       anything else. So the state is the day's own pace, the graphic is drawn
       at full strength in every one of them, and how sure the app is is said in
       WORDS — the softened "About 3h" figure, the "Low confidence" label and
       the Todo below it. Recommend, never diminish. */
    const over = past ? spent > env : pace!.status === 'over';
    const view: BudgetState = past
      ? (over ? 'final-over' : 'final-under')
      : over ? 'over'
        : pace!.status === 'ahead' ? 'ahead'
          : 'healthy';

    let figure: string;
    let figureSub: string;
    if (past) {
      /* A finished day reads as a record, not as a remainder. The figure is what
         the day COST and the sub is what it had, which is the pair a reader can
         compare against another day. "3h 20m left" is a live quantity and means
         nothing once the day is over. */
      figure = hm(spent);
      figureSub = soft ? `of about ${hm(env)}` : `of ${hm(env)}`;
    } else if (over) {
      figure = `Over by ${hm(spent - env)}`;
      figureSub = '';
    } else if (spent < 1) {
      // Nothing spent yet, so "left of" would print the same figure twice. Early
      // in the day, and on the empty-journal card, this is the common case.
      figure = soft ? about(env) : hm(env);
      figureSub = 'to spend today';
    } else if (soft) {
      figure = about(left);
      figureSub = `left of ${about(env).replace(/^About /, 'about ')}`;
    } else {
      figure = hm(left);
      figureSub = `left of ${hm(env)}`;
    }

    /* ---------- the one subtext line ---------- */
    let sub: string;
    let flag: BudgetView['flag'] = null;
    if (past) {
      /* Past tense, and no advice: the day is done and there is nothing to do
         about it. Naming the margin is the whole of what a finished card owes
         the reader, and it is what makes two days comparable. */
      sub = over
        ? `Finished ${hm(spent - env)} over budget`
        : `Finished ${hm(left)} under budget`;
      flag = over ? 'red' : null;
    } else if (over) {
      sub = 'Resting now brings this back down';
      flag = 'red';
    } else if (low && recommendation) {
      /* The one useful thing a thin estimate can say: what would sharpen it.
         This is the whole of what low confidence changes about the card. */
      sub = recommendation.title;
    } else if (view === 'ahead') {
      sub = pace!.runsOutMin != null
        ? `At this pace the budget runs out around ${clock(pace!.runsOutMin)}`
        : 'Running ahead of an even day';
      flag = 'amber';
    } else if (recommendation && recommendation.id !== 'learning') {
      sub = recommendation.title;
    } else {
      sub = `Pacing well for ${clock(nowMin)}, with some in reserve`;
    }

    /* A day the app would rather had published nothing, publishing anyway.
       The standing advice outranks every pacing line above: the reader has
       one line of subtext and on this day it belongs to the warning, not to
       how evenly they are spending. The exception is `over`, whose own copy
       already says to rest and says it in red, which is the louder of the
       two — replacing it would trade a stronger sentence for a weaker one. */
    if (unpaused && envelope.suppressed && !past && !over) {
      sub = unpausedText(envelope.suppressed, unpaused);
      flag = 'amber';
    }

    return {
      state: view, envelope, burn, pace, accuracy,
      // Set on a finished day too: "over by 45m" is what that day's record
      // says, and a null here put a green "Spare -45m" tile on a day the card
      // beside it had just called over budget.
      leftMin: left, overByMin: over ? spent - env : null,
      fill,
      figure, figureSub, sub, flag, rightLabel, lowConfidence: low,
      recommendation,
      ceilingMoved,
      learning,
      past,
      stepsMissing,
      skeleton,
      pausedReason: envelope.suppressed,
      unpaused,
    };
  });
}

export type { Envelope, EnvelopeInput } from './envelope';
export type { Burn, SpendRow, SpendSource, SpendMember, BudgetMultiplier } from './burn';
export type { Accuracy, AccuracyCell, CellOutcome } from './accuracy';
export type { Pace } from './pace';
export type { Recommendation, RecommendationId } from './recommend';
export type { UprightSignature } from './upright';
export { hm, about, clock } from './format';
export { exertionLine } from './baseline';
export { uprightSignature, stillUprightMinutes } from './upright';
export { hrMinutesAbove, walkingMinutes, uprightMinutes } from './burn';
export { LOAD_TABLE, LOAD_PER_MIN, loadOf, entryCost, type LoadWeight } from './load';
