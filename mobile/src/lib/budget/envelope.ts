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
 * And on the worst days it publishes NOTHING. A downturn, a crash-grade day or
 * a fired strain alert suppresses the number entirely rather than showing a
 * small one, because a small budget on a bad day is still an invitation to
 * spend it.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import { scoreCat, sleepGradeParts, sleepHours, type DaysMap } from '../scoring/day';
import { shift } from '../scoring/baseline';
import { median } from '../trends/compare';
import { keyRange, metricSeries } from '../trends/series';
import type { Entry, TypeDef } from '../types';
import { hm } from './format';
import { ceilingAt } from './calibrate';
import { capacityBaseline } from './baseline';
import { makeScoreLookup, type ScoreLookup } from './outcome';
import { makeSpendLookup, type SpendLookup } from './burn';

/** The most a good morning may add, and the most a bad one may take. */
const FACTOR_MAX = 1.1;
const FACTOR_MIN = 0.5;
/** Per-input bounds, so no single reading can carry the whole day. */
const INPUT_MAX = 1.1;
const INPUT_MIN = 0.7;

/** Yesterday's overspend carries into today: PEM is a debt instrument, not a
 *  daily reset. Half the overspend ratio, capped at a third of the budget. */
const CARRY_SHARE = 0.5;
const CARRY_CAP = 0.3;

/** A strain WATCH narrows the day. A strain ALERT suppresses it entirely. */
const STRAIN_FACTOR = 0.8;

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
  /** Effort minutes. Null only when suppressed. */
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
): EnvelopeInput {
  if (today == null || history.length < 3) {
    return {
      id, label, value: null, unit,
      vs: past ? 'Not logged' : 'Not logged today', vsCat: 'neutral',
      bar: null, usual: null, factor: 1, known: false,
    };
  }
  const s = shift([today], history, 1, 3);
  const usual = median(history);
  const delta = today - usual;
  const placed = place(today, history);

  // 'band' metrics (sleep duration) are good in a range: distance from the
  // middle of the band is what costs, in either direction.
  const signed = better === 'down' ? -delta : better === 'up' ? delta : -Math.abs(delta);
  const raw = 1 + (signed / scale) * 0.1;
  const factor = Math.min(INPUT_MAX, Math.max(INPUT_MIN, raw));

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
  spendAt?: SpendLookup;
  /** A finished day. The arithmetic is identical; only the tense changes. */
  past?: boolean;
}

export function buildEnvelope(opts: EnvelopeOpts): Envelope {
  const { days, dk, ctx, addDays, types, lineBpm, downturn, strain, coverage } = opts;
  const past = !!opts.past;
  const scoreAt = opts.scoreAt || makeScoreLookup(days, ctx);
  const spendAt = opts.spendAt || makeSpendLookup(days, types, lineBpm);

  const base = capacityBaseline(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt);
  const ceiling = ceilingAt(days, dk, ctx, addDays, types, lineBpm, scoreAt, spendAt);

  /* ---- the morning inputs, each against the user's own recent history ---- */
  const histKeys = keyRange(addDays(dk, -1), 42, addDays);
  const hist = metricSeries(days, histKeys, ['rmssd', 'restingHr', 'sleepDuration', 'sleepingHr'], ctx);
  const today = metricSeries(days, [dk], ['rmssd', 'restingHr', 'sleepDuration', 'sleepingHr'], ctx);
  const vals = (xs: (number | null)[]) => xs.filter((v): v is number => v != null);

  const inputs: EnvelopeInput[] = [
    makeInput('hrv', past ? 'HRV that morning' : 'HRV this morning', 'ms', today.rmssd[0], vals(hist.rmssd), 'up', (v) => String(Math.round(v)), 8, past),
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
  const suppressed: Envelope['suppressed'] =
    downturn ? 'downturn'
      : strain === 'alert' ? 'strain-alert'
        : score != null && scoreCat(score).short === 'Crash' ? 'crash'
          : null;

  /* ---- confidence ---- */
  const weightOf = (i: EnvelopeInput) => (i.id === 'hrv' ? W_HRV : i.id === 'sleep' ? W_SLEEP : W_OTHER);
  const core = inputs.filter((i) => ['hrv', 'restingHr', 'sleep', 'sleepingHr'].includes(i.id));
  const total = core.reduce((s, i) => s + weightOf(i), 0) || 1;
  const known = core.filter((i) => i.known).reduce((s, i) => s + weightOf(i), 0);
  // The ceiling's own maturity caps confidence, but never below half: a
  // day-one user with a full set of morning readings has GOOD inputs and an
  // unfitted ceiling, and the strip says which of those two it is.
  const raw = (known / total) * Math.max(CONF_LOW, base.learning) * COVERAGE_CAP[coverage];
  const confidence: Confidence = raw < CONF_LOW ? 'low' : raw < CONF_MED ? 'medium' : 'high';

  return {
    effortMin: suppressed ? null : Math.max(30, Math.round(effortMin)),
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
