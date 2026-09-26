/**
 * Today's budget: the ceiling, modified by what this morning's readings say.
 *
 * Every input is stated against the USER'S OWN 42-day median, never against a
 * textbook range. This population runs "abnormal" numbers every day of the
 * week; only the move away from their own normal means anything, which is the
 * discipline scoring/strain.ts is built on and the reason the sheet can write
 * "31 ms, 6 below your usual" instead of a percentile against strangers.
 *
 * The modifier is ASYMMETRIC. A good morning can lift the budget by a tenth; a
 * bad one can halve it. Erring low costs a good day under-used, erring high
 * costs a crash, and those are not the same price (honesty rule 5).
 *
 * And on the worst days it publishes NOTHING. A downturn, a CRASH-GRADE FALL
 * or a fired strain alert suppresses the number entirely rather than showing a
 * small one, because a small budget on a bad day is still an invitation to
 * spend it.
 *
 * A CRASH IS A FALL, NOT AN ADDRESS — see `crashIsFall`. The other two
 * suppressors are already relative to the person (a downturn is a slide, a
 * strain alert is this user's own 7-day medians against their own previous
 * 42), so neither can latch on for ever. Crash-grade was the odd one out: an
 * absolute band at score < 25, which for a severely ill user is not an event
 * but where they live. It switched the whole feature off for exactly the
 * population it was built for, every morning, under copy promising it would
 * resume tomorrow.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import { scoreCat, sleepGradeParts, sleepHours, type DaysMap } from '../scoring/day';
import { baselineHistory, firstBaselineRmssd, shift } from '../scoring/baseline';
import { median } from '../trends/compare';
import { keyRange, metricSeries } from '../trends/series';
import type { Entry, TypeDef } from '../types';
import { hm } from './format';
import { ceilingAt } from './calibrate';
import { capacityBaseline } from './baseline';
import { compValue, makeScoreLookup, makeSetLookup, type ScoreLookup, type SetLookup } from './outcome';
import { HR_FULL_COVERAGE, HR_MIN_COVERAGE, makeBurnLookup, makeSpendLookup, type BurnLookup, type SpendLookup } from './burn';

/** The most a good morning may add, and the most a bad one may take. */
const FACTOR_MAX = 1.1;
const FACTOR_MIN = 0.5;
/** Per-input bounds, so no single reading can carry the whole day. */
const INPUT_MAX = 1.1;
const INPUT_MIN = 0.7;
/** The baseline HRV reading alone may take this much off: it is the one input
 *  that is a direct snapshot of the system the budget describes, so it is the
 *  one allowed to outweigh the rest. */
const BASELINE_INPUT_MIN = 0.6;
/** Percent below the user's usual baseline RMSSD that costs a 10% step. */
const BASELINE_PCT_SCALE = 10;

/** Yesterday's overspend carries into today: PEM is a debt instrument, not a
 *  daily reset. Half the overspend ratio, capped at a third of the budget. */
const CARRY_SHARE = 0.5;
const CARRY_CAP = 0.3;

/** A strain WATCH narrows the day. A strain ALERT suppresses it entirely. */
const STRAIN_FACTOR = 0.8;

/* ---- what makes a crash-grade day a crash rather than a Tuesday ---- */

/** How far below their own recent median today has to sit for a crash-grade
 *  score to read as a FALL. The same size as ./outcome's `DECLINE_PTS`, and
 *  for the same reason: below a full grade band, a 9-point wobble is noise in
 *  a score built from a handful of readings. */
export const CRASH_DROP_PTS = 10;
/** How far back the comparison median is read. */
export const CRASH_REL_WINDOW = 28;
/** Scored days needed before the journal can answer "is this unusual for
 *  you". Under this the old absolute rule stands and the day is suppressed:
 *  honesty rule 5, where the model cannot tell, it errs low. */
export const CRASH_REL_MIN_DAYS = 10;

/**
 * Is today's crash-grade score a FALL for this person, or their floor?
 *
 * `recent` is the scored days before today, most recent `CRASH_REL_WINDOW`.
 * A user whose median day is 20 and whose today is 22 has not crashed, they
 * are at home, and the question the budget answers — how much can today
 * absorb — is the only question they have. Suppressing it hands them nothing
 * on every day they own. A user whose median is 60 and whose today is 22 has
 * had something happen, and a number there is an invitation to spend.
 *
 * Note it is deliberately one-sided: this can only ever DECLINE to suppress a
 * day the absolute rule would have suppressed. A day above the crash band is
 * never reached by this function at all.
 */
export function crashIsFall(today: number, recent: number[]): boolean {
  if (recent.length < CRASH_REL_MIN_DAYS) return true;
  return median(recent) - today >= CRASH_DROP_PTS;
}

/** The scored days before `dk`, for the comparison above. */
function recentScores(
  days: DaysMap,
  dk: string,
  addDays: (k: string, n: number) => string,
  scoreAt: ScoreLookup,
): number[] {
  return keyRange(addDays(dk, -1), CRASH_REL_WINDOW, addDays)
    .map(scoreAt)
    .filter((s): s is number => s != null);
}

/** Confidence weights. HRV is what everything downstream is built from. */
const W_HRV = 3;
const W_SLEEP = 2;
const W_OTHER = 1;

const CONF_LOW = 0.5;
const CONF_MED = 0.8;

/**
 * What the day's coverage does to confidence.
 *
 * The morning readings can be perfect and the budget still be a guess, because
 * the SPEND half of the comparison is invisible: with nothing connected the
 * app sees a couple of logged activities and none of the eight hours around
 * them. A wide-open bar built on that is a claim of room the app has no way to
 * make, so the strip drops to Low and the one Todo becomes "Connect steps".
 */
const COVERAGE_CAP: Record<'full' | 'partial' | 'logged-only' | 'none', number> = {
  full: 1,
  partial: 0.9,
  'logged-only': 0.6,
  none: 0.4,
};

/**
 * The same weights, as a RAMP rather than four steps.
 *
 * `burn.coverage` is a four-value word because the sheet has to name the day
 * in English, but reading confidence straight off it made a cliff out of a
 * threshold: a day holding 119 minutes of heart-rate coverage was weighted
 * 0.6 and one holding 121 was weighted 0.9, and which side of that line a day
 * landed on came down to whether the watch was on the charger over lunch. Two
 * days that saw almost the same amount of a life were reported with very
 * different certainty.
 *
 * So coverage moves the weight continuously between the anchors it already
 * had. Each class ramps from its own weight up to the next class's, and never
 * past it, so nothing is ever weighted MORE than the word beside it claims and
 * a day with no series at all keeps exactly the figure it always had.
 */
export function coverageFactor(
  coverage: 'full' | 'partial' | 'logged-only' | 'none',
  hrCoverageMin: number | null | undefined,
): number {
  const cap = COVERAGE_CAP[coverage];
  // No series read at all: there is nothing to ramp along, and the word is the
  // whole of what we know.
  if (hrCoverageMin == null || !Number.isFinite(hrCoverageMin)) return cap;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (coverage === 'partial') {
    return lerp(COVERAGE_CAP.partial, COVERAGE_CAP.full,
      (hrCoverageMin - HR_MIN_COVERAGE) / Math.max(1, HR_FULL_COVERAGE - HR_MIN_COVERAGE));
  }
  if (coverage === 'logged-only') {
    return lerp(COVERAGE_CAP['logged-only'], COVERAGE_CAP.partial, hrCoverageMin / HR_MIN_COVERAGE);
  }
  // 'full' is already the top of the scale, and 'none' is a day with no steps
  // and nothing logged, where a heart-rate series is not the thing that was
  // missing. Both keep their own weight.
  return cap;
}

export type Confidence = 'low' | 'medium' | 'high';

export interface EnvelopeInput {
  id: 'hrv' | 'restingHr' | 'sleep' | 'sleepingHr' | 'orthostatic' | 'carryover' | 'strain';
  label: string;
  value: string | null;
  unit: string;
  /** "6 below your usual", or "Not logged today" for a ghost row. */
  vs: string;
  vsCat: 'good' | 'bad' | 'neutral';
  /** 0..1 placements for the row's own bar and the tick at their usual. */
  bar: number | null;
  usual: number | null;
  factor: number;
  known: boolean;
}

export interface Envelope {
  /** Effort minutes. Null only when suppressed and not overridden. */
  effortMin: number | null;
  confidence: Confidence;
  inputs: EnvelopeInput[];
  reduced: 'strain' | 'carryover' | null;
  suppressed: 'downturn' | 'crash' | 'strain-alert' | null;
  /** 0..1, how much of the ceiling is the person rather than the prior. */
  learning: number;
  heldDays: number;
  /** What the early-days fitting did, for the sheet's learning line. */
  earlyMove: { min: number; dir: 'up' | 'down'; dk: string } | null;
  /** The uncorrected ceiling, before today's morning modifier. */
  ceilingMin: number;
}

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};

/** Place a value on a 0..1 scale spanning the user's own recent range, so the
 *  row's bar and the tick at their usual are both in their own units. */
function place(v: number, vals: number[]): { bar: number; usual: number } | null {
  if (vals.length < 3) return null;
  const lo = Math.min(...vals, v);
  const hi = Math.max(...vals, v);
  if (hi - lo < 1e-6) return null;
  return { bar: (v - lo) / (hi - lo), usual: (median(vals) - lo) / (hi - lo) };
}

/**
 * One input's contribution. `better` says which direction is good, so resting
 * heart rate and HRV can share the arithmetic and disagree about its sign.
 */
function makeInput(
  id: EnvelopeInput['id'],
  label: string,
  unit: string,
  today: number | null,
  history: number[],
  better: 'up' | 'down' | 'band',
  fmt: (v: number) => string,
  /** How many of the value's own units count as a full step of the modifier. */
  scale: number,
  /** A finished day. Copy only: "Not logged today" about last Tuesday is a
   *  sentence about a day that has not happened yet. */
  past = false,
  /** `relative` reads the move as a PERCENT of the usual rather than in the
   *  value's own units (`scale` is then percent); `floor` overrides the
   *  per-input floor. */
  opts: { relative?: boolean; floor?: number } = {},
): EnvelopeInput {
  if (today == null || history.length < 3) {
    return {
      id, label, value: today == null ? null : fmt(today), unit,
      // A value with too little history behind it was logged; saying it was
      // not would be false. It simply has nothing to be compared with yet.
      vs: today != null ? 'Learning your usual' : past ? 'Not logged' : 'Not logged today', vsCat: 'neutral',
      bar: null, usual: null, factor: 1, known: false,
    };
  }
  const s = shift([today], history, 1, 3);
  const usual = median(history);
  const delta = today - usual;
  const placed = place(today, history);

  // 'band' metrics (sleep duration) are good in a range: distance from the
  // middle of the band is what costs, in either direction.
  const moved = opts.relative && usual > 0 ? (delta / usual) * 100 : delta;
  const signed = better === 'down' ? -moved : better === 'up' ? moved : -Math.abs(moved);
  const raw = 1 + (signed / scale) * 0.1;
  const factor = Math.min(INPUT_MAX, Math.max(opts.floor ?? INPUT_MIN, raw));

  const mag = fmt(Math.abs(delta));
  const dir = better === 'band'
    ? (delta > 0 ? 'above your usual' : 'below your usual')
    : (delta > 0 ? 'above your usual' : 'below your usual');
  const vs = Math.abs(delta) < 1e-6 ? 'Right at your usual' : `${mag} ${dir}`;

  return {
    id, label, value: fmt(today), unit,
    vs,
    vsCat: signed > 0.01 ? 'good' : signed < -0.01 ? 'bad' : 'neutral',
    bar: placed?.bar ?? null,
    usual: placed?.usual ?? null,
    factor,
    known: true,
    ...(s ? {} : {}),
  };
}

export interface EnvelopeOpts {
  days: DaysMap;
  dk: string;
  ctx: ScoreContext;
  addDays: (k: string, n: number) => string;
  types: Record<string, TypeDef>;
  lineBpm: number | null;
  /** Passed in because DaySummary already computed both. */
  downturn: boolean;
  strain: 'watch' | 'alert' | null;
  /** How much of the day the app can actually see (./burn). A budget built
   *  from three logged activities is not the same object as one built from a
   *  full day of heart rate and must not be presented as one. */
  coverage: 'full' | 'partial' | 'logged-only' | 'none';
  scoreAt?: ScoreLookup;
  setAt?: SetLookup;
  spendAt?: SpendLookup;
  /** A finished day. The arithmetic is identical; only the tense changes. */
  past?: boolean;
  /** The reader has asked to see this day's number anyway, or the run valve
   *  has opened it. `suppressed` keeps its reason either way. */
  unpaused?: boolean;
}

export function buildEnvelope(opts: EnvelopeOpts): Envelope {
  const { days, dk, ctx, addDays, types, lineBpm, downturn, strain, coverage } = opts;
  const past = !!opts.past;
  const setAt = opts.setAt || makeSetLookup(days, ctx);
  const scoreAt = opts.scoreAt || makeScoreLookup(days, ctx, setAt);
  const spendAt = opts.spendAt || makeSpendLookup(days, types, lineBpm);

  const base = capacityBaseline(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt);
  const ceiling = ceilingAt(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt);

  /* ---- the morning inputs, each against the user's own recent history ---- */
  const histKeys = keyRange(addDays(dk, -1), 42, addDays);
  const hist = metricSeries(days, histKeys, ['restingHr', 'sleepDuration', 'sleepingHr'], ctx);
  const today = metricSeries(days, [dk], ['restingHr', 'sleepDuration', 'sleepingHr'], ctx);
  const vals = (xs: (number | null)[]) => xs.filter((v): v is number => v != null);

  /**
   * HRV is the BASELINE reading whenever there is one to compare.
   *
   * The budget describes the system the user woke up with, and the baseline
   * (unpaced) reading is the direct snapshot of it: today's FIRST baseline
   * RMSSD against each earlier day's first, on a percent scale because RMSSD
   * scales with the person (3 ms is noise at 60 and a real drop at 18). Only
   * the first reading, so a training session later in the day can never move
   * a budget that was already published from the baseline. It is the one input
   * allowed to reach `BASELINE_INPUT_MIN` on its own.
   *
   * With no baseline to compare, it falls back to the TRAINING component read
   * out of the score (never the trends registry, which averages the two kinds
   * into one figure), against its own history, in ms, as before.
   */
  const fmtMs = (v: number) => String(Math.round(v));
  const baseToday = firstBaselineRmssd(days[dk]);
  const baseHist = baselineHistory(days, dk);
  const trainOf = (k: string) => compValue(setAt(k), 'Training HRV');
  let hrvInput: EnvelopeInput;
  if (baseToday != null && baseHist.length >= 3) {
    hrvInput = makeInput('hrv', 'Baseline HRV', 'ms', baseToday, baseHist, 'up', fmtMs, BASELINE_PCT_SCALE, past, { relative: true, floor: BASELINE_INPUT_MIN });
  } else {
    const trainToday = trainOf(dk);
    const trainHist = trainToday != null ? histKeys.map(trainOf).filter((v): v is number => v != null) : [];
    hrvInput = trainToday != null && trainHist.length >= 3
      ? makeInput('hrv', 'Training HRV', 'ms', trainToday, trainHist, 'up', fmtMs, 8, past)
      // Nothing comparable: the row asks for (or is still learning) the baseline.
      : makeInput('hrv', 'Baseline HRV', 'ms', baseToday, baseHist, 'up', fmtMs, BASELINE_PCT_SCALE, past, { relative: true, floor: BASELINE_INPUT_MIN });
  }

  const inputs: EnvelopeInput[] = [
    hrvInput,
    makeInput('restingHr', 'Resting heart rate', 'bpm', today.restingHr[0], vals(hist.restingHr), 'down', (v) => String(Math.round(v)), 6, past),
    makeInput('sleep', past ? 'Sleep the night before' : 'Sleep last night', '', today.sleepDuration[0], vals(hist.sleepDuration), 'band', (v) => hm(v * 60), 1.5, past),
    makeInput('sleepingHr', 'Overnight low', 'bpm', today.sleepingHr[0], vals(hist.sleepingHr), 'down', (v) => String(Math.round(v)), 6, past),
  ];

  // A recent standing test, if the user logged one today. Not a ghost row on
  // every other day: a stand test is not a daily reading and a permanent
  // "Not logged today" would read as a chore.
  const stand = (days[dk]?.readings || []).find((r: Entry) => r.type === 'standTest');
  if (stand) {
    const d = num(stand.sustainedDelta) ?? num(stand.peakDelta);
    if (d != null) {
      const histStand: number[] = [];
      histKeys.forEach((k) => (days[k]?.readings || []).forEach((r: Entry) => {
        if (r.type !== 'standTest') return;
        const v = num(r.sustainedDelta) ?? num(r.peakDelta);
        if (v != null) histStand.push(v);
      }));
      inputs.push(makeInput('orthostatic', 'Standing test', 'bpm', d, histStand, 'down', (v) => String(Math.round(v)), 8, past));
    }
  }

  /* ---- the combined modifier ---- */
  let modifier = inputs.reduce((f, i) => f * i.factor, 1);
  modifier = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, modifier));

  let effortMin = ceiling.effortMin * modifier;
  let reduced: Envelope['reduced'] = null;

  /* ---- yesterday's overspend carries in ---- */
  const yk = addDays(dk, -1);
  const yday = days[yk];
  if (yday) {
    const yEnv = capacityBaseline(days, yk, ctx, addDays, types, lineBpm, scoreAt, spendAt).effortMin;
    const ySpend = spendAt(yk);
    if (yEnv > 0 && ySpend > yEnv) {
      const ratio = ySpend / yEnv;
      const cut = Math.min(CARRY_CAP, (ratio - 1) * CARRY_SHARE);
      if (cut > 0.02) {
        effortMin *= 1 - cut;
        reduced = 'carryover';
        inputs.push({
          id: 'carryover',
          label: past ? 'The day before ran over' : 'Yesterday ran over',
          value: hm(ySpend - yEnv), unit: 'over',
          vs: `${Math.round(cut * 100)}% off${past ? '' : ' today'}`, vsCat: 'bad',
          bar: null, usual: null, factor: 1 - cut, known: true,
        });
      }
    }
  }

  /* ---- strain narrows the day ---- */
  if (strain === 'watch') {
    effortMin *= STRAIN_FACTOR;
    reduced = 'strain';
    inputs.push({
      id: 'strain',
      label: 'Early strain signs', value: null, unit: '',
      vs: `${Math.round((1 - STRAIN_FACTOR) * 100)}% off${past ? '' : ' today'}`, vsCat: 'bad',
      bar: null, usual: null, factor: STRAIN_FACTOR, known: true,
    });
  }

  /* ---- the days that publish no number at all ---- */
  const score = scoreAt(dk);
  const crashGrade = score != null && scoreCat(score).short === 'Crash';
  const suppressed: Envelope['suppressed'] =
    downturn ? 'downturn'
      : strain === 'alert' ? 'strain-alert'
        : crashGrade && crashIsFall(score, recentScores(days, dk, addDays, scoreAt)) ? 'crash'
          : null;

  /* ---- confidence ---- */
  const weightOf = (i: EnvelopeInput) => (i.id === 'hrv' ? W_HRV : i.id === 'sleep' ? W_SLEEP : W_OTHER);
  const core = inputs.filter((i) => ['hrv', 'restingHr', 'sleep', 'sleepingHr'].includes(i.id));
  const total = core.reduce((s, i) => s + weightOf(i), 0) || 1;
  const known = core.filter((i) => i.known).reduce((s, i) => s + weightOf(i), 0);
  // The ceiling's own maturity caps confidence, but never below half: a
  // day-one user with a full set of morning readings has GOOD inputs and an
  // unfitted ceiling, and the strip says which of those two it is.
  const raw = (known / total) * Math.max(CONF_LOW, base.learning)
    * coverageFactor(coverage, days[dk]?.load?.hrCoverageMin);
  const confidence: Confidence = raw < CONF_LOW ? 'low' : raw < CONF_MED ? 'medium' : 'high';

  return {
    // The override does not change the VERDICT, only whether the number is
    // published: `suppressed` still names the reason, so every surface can go
    // on saying the app advises resting while showing what it would have said.
    effortMin: suppressed && !opts.unpaused ? null : Math.max(30, Math.round(effortMin)),
    confidence,
    inputs,
    reduced,
    suppressed,
    learning: base.learning,
    heldDays: base.heldDays,
    earlyMove: base.earlyMove,
    ceilingMin: ceiling.effortMin,
  };
}

/**
 * The envelope a PAST day was actually judged against, memoized.
 *
 * Everything that grades a finished day has to grade it against the number the
 * app put on the screen that morning, not against an earlier stage of the same
 * pipeline. The accuracy strip and the Progress margin chart both used
 * `capacityBaseline`, which is the ceiling BEFORE the correction, before that
 * morning's readings and before yesterday's overspend carried in — so a day the
 * card called under budget at the time could turn up as an "over budget" cell
 * in the strip a week later, and the two were describing different ceilings
 * with no way for the reader to tell.
 *
 * ./calibrate is the one place that deliberately stays on the raw baseline, and
 * it has to: the correction is an input to this envelope, so judging its own
 * days against the corrected number would recurse for ever. Its counts are
 * internal and never rendered, so nothing the reader sees disagrees.
 *
 * `downturn` and `strain` are not reconstructed for a past day — both are
 * caller-supplied for today and cost a walk of their own — so a day suppressed
 * by one of those reads here as the number it would otherwise have published.
 * That is the behaviour these callers already had; the crash-grade suppression,
 * which is the common case by far, is computed inside `buildEnvelope` and is
 * honoured.
 */
export type EnvelopeLookup = (dk: string) => Envelope;

export function makeEnvelopeLookup(opts: {
  days: DaysMap;
  ctx: ScoreContext;
  addDays: (k: string, n: number) => string;
  types: Record<string, TypeDef>;
  lineBpm: number | null;
  scoreAt?: ScoreLookup;
  setAt?: SetLookup;
  spendAt?: SpendLookup;
  burnAt?: BurnLookup;
}): EnvelopeLookup {
  const { days, ctx, addDays, types, lineBpm } = opts;
  const setAt = opts.setAt || makeSetLookup(days, ctx);
  const scoreAt = opts.scoreAt || makeScoreLookup(days, ctx, setAt);
  const burnAt = opts.burnAt || makeBurnLookup(days, types, lineBpm);
  const spendAt = opts.spendAt || makeSpendLookup(days, types, lineBpm, burnAt);
  const cache = new Map<string, Envelope>();
  return (dk: string) => {
    const hit = cache.get(dk);
    if (hit) return hit;
    const v = buildEnvelope({
      days, dk, ctx, addDays, types, lineBpm,
      downturn: false, strain: null,
      coverage: burnAt(dk)?.coverage || 'none',
      scoreAt, setAt, spendAt, past: true,
    });
    cache.set(dk, v);
    return v;
  };
}

/** Last night's wake time in minutes past midnight, for the pace line. */
export function wakeMinutes(days: DaysMap, dk: string): number | null {
  const sleep = days[dk]?.sleep;
  if (!sleep?.wake) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(sleep.wake).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mi)) return null;
  return h * 60 + mi;
}

/** Unused re-exports kept out; sleepGradeParts/sleepHours are imported by the
 *  sheet for its grade copy rather than duplicated there. */
export { sleepGradeParts, sleepHours };
