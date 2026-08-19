/**
 * Strain detection — the second way the Journal's warning card can fire.
 *
 * ./downturn asks one question: is the daily autonomic SCORE sliding. That
 * catches a crash once it has already reached the number, and it is blind to
 * the markers that move first. Heart rate settling more slowly after a workout,
 * a legs-up rate that will not come down, a resting rate creeping up, a
 * standing rise getting worse: each of those can drift for days while the score
 * still reads fine, and each is a reason to pace before the crash arrives.
 *
 * The whole design problem here is NOT sensitivity, it is restraint. Every one
 * of these markers wobbles day to day, and a card that fires on a single one is
 * a card the user learns to ignore, at which point it is worse than nothing. So:
 *
 * 1. EVERY SIGNAL IS AGAINST THE USER'S OWN BASELINE, never a population
 *    threshold. This population runs numbers a textbook would call abnormal
 *    every day of the week; what means something is the move away from their
 *    own recent normal. Medians, not means, for the reason ../trends/compare
 *    spells out: one 130 bpm artifact is ordinary here.
 * 2. EACH WINDOW HAS ITS OWN COVERAGE BAR, enforced independently. Two workouts
 *    against one is not a comparison, and a sparse marker simply does not vote.
 * 3. IT TAKES A CHORUS, NOT A SOLO. Two distinct signals AND a combined weight
 *    of three, so a single marker off by a hair can never fire the card. A
 *    weight of 2 is reserved for a move big enough to stand on its own, and
 *    even that still needs a second signal beside it.
 * 4. AT LEAST ONE SIGNAL MUST BE A MEASUREMENT. Heavy activity is context, not
 *    evidence: it corroborates a marker, it never carries the card alone.
 * 5. IT NEVER CONTRADICTS THE OUTLOOK ABOVE IT. A day still scoring Excellent
 *    is not a day to be told to rest, so the card is suppressed there.
 *
 * A strain warning is deliberately quieter than a downturn: it renders the same
 * card, but it does NOT fire the crash notification (../reminders) — the score
 * downturn keeps that, because a push is the loudest thing the app does and
 * this is a caution, not a crash. It does suppress the proactive offers and the
 * review ask, for the obvious reason that nothing should be sold to somebody
 * who was just told to take it easy.
 *
 * Pure: days map in, verdict out.
 */
import { addDays } from '../dates';
import type { Entry } from '../types';
import type { ScoreContext } from './index';
import { activityGrade, type DaysMap } from './day';
import type { DownturnFactor } from './downturn';
import { dayScore } from '../trends/metrics';
import { keyRange, metricSeries } from '../trends/series';
import { median } from '../trends/compare';

export type StrainSignalId =
  | 'hrRecovery' | 'legsUpHr' | 'restingHr' | 'sleepingHr'
  | 'orthostatic' | 'symptoms' | 'exertion';

export interface StrainSignal {
  id: StrainSignalId;
  /** 'marker' is a measurement off its own baseline; 'context' is behaviour
   *  found in the journal, which corroborates but never fires the card. */
  kind: 'marker' | 'context';
  /** 1 = a real move. 2 = a move large enough to lead the card on its own. */
  weight: 1 | 2;
  /** Row label in the explain sheet. */
  label: string;
  /** Row value, in the marker's own unit. */
  value: string;
  /** Headline clause, lower case and carrying its own number:
   *  "resting heart rate is up 6 bpm". */
  phrase: string;
  detail: string;
}

export interface Strain {
  severity: 'watch' | 'alert';
  /** Everything that fired, strongest first. */
  signals: StrainSignal[];
  /** Combined weight, the number the fire rule is written against. */
  weight: number;
  /** Short label for the sheet. */
  title: string;
  /** The whole warning as ONE sentence carrying its own numbers, for the
   *  Journal card — same contract as `Downturn.headline`. */
  headline: string;
  body: string;
  /** The explain sheet's headline tile. There is no "down N points" here, so
   *  the tile states the count of markers instead of inventing a score move. */
  readout: { value: string; sub: string };
  /** Same row shape the downturn sheet renders. */
  factors: DownturnFactor[];
}

/** The window a signal has to be moving in for the card to be timely. */
export const RECENT_DAYS = 7;
/** The user's own normal, taken from the days BEFORE the recent window. */
export const BASELINE_DAYS = 42;
/** Days of activity scanned for the corroborating exertion signal. */
const EXERTION_DAYS = 5;
/** Today scoring at or above this is an Excellent day; never a day to be told
 *  to rest, and the card would sit directly under a green Outlook saying so. */
export const SCORE_CEILING = 85;

/** Combined weight required to fire, alongside two distinct signals. */
const MIN_WEIGHT = 3;
/** At or above this, the card wears the stop sign. */
const ALERT_WEIGHT = 5;

/* ---------- thresholds, all in the marker's own unit ---------- */

/** Heart-rate recovery: bpm the one-minute drop has to LOSE against baseline. */
const HRR_SAG = 8;
const HRR_SAG_BIG = 15;
/** A one-minute drop under this is weak by any standard, not just this user's. */
const HRR_LOW = 12;
/** Legs-up low HR, bpm above baseline. */
const LEGS_UP_RISE = 6;
const LEGS_UP_RISE_BIG = 12;
/** Resting and overnight heart rate, bpm above baseline. */
const HR_RISE = 4;
const HR_RISE_BIG = 8;
/** Standing HR rise, bpm above baseline. */
const ORTHO_RISE = 8;
const ORTHO_RISE_BIG = 15;
/** A standing rise at or above this is severe however it compares. */
const ORTHO_HIGH = 40;
/** Symptom load: multiples of the user's own rate, and entries above it. */
const SYMPTOM_MULT = 2;
const SYMPTOM_MULT_BIG = 3;
const SYMPTOM_EXTRA = 4;
const SYMPTOM_EXTRA_BIG = 8;

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};

const bpm = (v: number) => `${Math.round(Math.abs(v))} bpm`;

/** Median of each window plus the move between them, or null when either
 *  window is too thin to compare (rule 2). */
function shift(recent: number[], base: number[], minRecent: number, minBase: number) {
  if (recent.length < minRecent || base.length < minBase) return null;
  const r = median(recent);
  const b = median(base);
  if (!Number.isFinite(r) || !Number.isFinite(b)) return null;
  return { r, b, delta: r - b, recentN: recent.length, baseN: base.length };
}

/** Every entry value of one kind across a key range, flattened and filtered. */
function pick(
  days: DaysMap,
  keys: string[],
  kind: 'activities' | 'readings' | 'symptoms',
  of: (e: Entry) => number | null,
): number[] {
  const out: number[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    (d[kind] || []).forEach((e: Entry) => {
      const v = of(e);
      if (v != null) out.push(v);
    });
  });
  return out;
}

export function detectStrain(days: DaysMap, dk: string, ctx: ScoreContext = {}): Strain | null {
  // Rule 5: never argue with an Excellent Outlook sitting directly above.
  const today = dayScore(days[dk], dk, days, ctx);
  if (today != null && today >= SCORE_CEILING) return null;

  const keys = keyRange(dk, RECENT_DAYS + BASELINE_DAYS, addDays);
  const recentKeys = keys.slice(-RECENT_DAYS);
  const baseKeys = keys.slice(0, keys.length - RECENT_DAYS);

  const signals: StrainSignal[] = [];
  const push = (s: StrainSignal) => { signals.push(s); };

  /* ---------- heart-rate recovery after exercise ---------- */
  // The drop from the session's peak to the hand-entered rate one minute after
  // stopping. `hr60` is hand-entered (no health store records it), so these
  // events are sparse by nature and the coverage bars are set for that.
  const hrrOf = (a: Entry): number | null => {
    const h60 = num(a.hr60);
    if (h60 == null) return null;
    let peak = num(a.maxHr);
    if (peak == null && ctx.hrCurve) {
      const c = ctx.hrCurve(String(a.id));
      if (c && c.length) peak = Math.max(...c.map((q) => q.bpm));
    }
    if (peak == null || peak <= h60) return null;
    return peak - h60;
  };
  const hrr = shift(pick(days, recentKeys, 'activities', hrrOf), pick(days, baseKeys, 'activities', hrrOf), 1, 3);
  if (hrr && hrr.delta <= -HRR_SAG) {
    const big = hrr.r < HRR_LOW || hrr.delta <= -HRR_SAG_BIG;
    push({
      id: 'hrRecovery', kind: 'marker', weight: big ? 2 : 1,
      label: 'Heart-rate recovery', value: `${Math.round(hrr.r)} bpm drop`,
      phrase: `your heart rate is settling ${bpm(hrr.delta)} slower after workouts`,
      detail: `Your rate has been coming down about ${bpm(hrr.r)} in the minute after you stop, against ${bpm(hrr.b)} across your recent sessions. How fast it falls once you stop is a fairly direct read on vagal reactivation, and it tends to sag before anything else does.`,
    });
  }

  /* ---------- legs up ---------- */
  const legsOf = (a: Entry) => (a.type === 'legsUp' ? num(a.lowHr) : null);
  const legs = shift(pick(days, recentKeys, 'activities', legsOf), pick(days, baseKeys, 'activities', legsOf), 1, 3);
  if (legs && legs.delta >= LEGS_UP_RISE) {
    push({
      id: 'legsUpHr', kind: 'marker', weight: legs.delta >= LEGS_UP_RISE_BIG ? 2 : 1,
      label: 'Legs-up heart rate', value: `${Math.round(legs.r)} bpm`,
      phrase: `your legs-up heart rate is up ${bpm(legs.delta)}`,
      detail: `Legs up has been settling around ${bpm(legs.r)}, against ${bpm(legs.b)} normally. A rate that will not come down in the one position that should drop it is one of the earlier signs that your system is working harder than usual.`,
    });
  }

  /* ---------- resting and overnight heart rate ---------- */
  // Both come from the shared trend extractors, so "what is this day's resting
  // heart rate" is answered the same way here, in Progress and in the widgets.
  const series = metricSeries(days, keys, ['restingHr', 'sleepingHr'], ctx);
  const split = (id: 'restingHr' | 'sleepingHr') => {
    const s = series[id];
    const present = (xs: (number | null)[]) => xs.filter((v): v is number => v != null);
    return { recent: present(s.slice(-RECENT_DAYS)), base: present(s.slice(0, s.length - RECENT_DAYS)) };
  };

  const rhr = (() => { const { recent, base } = split('restingHr'); return shift(recent, base, 3, 10); })();
  if (rhr && rhr.delta >= HR_RISE) {
    push({
      id: 'restingHr', kind: 'marker', weight: rhr.delta >= HR_RISE_BIG ? 2 : 1,
      label: 'Resting heart rate', value: `${Math.round(rhr.r)} bpm`,
      phrase: `your resting heart rate is up ${bpm(rhr.delta)}`,
      detail: `Resting around ${bpm(rhr.r)} this week, against ${bpm(rhr.b)} over the weeks before it. A sustained rise with nothing obvious behind it is one of the ways an infection, a poor stretch of sleep or accumulated load shows up first.`,
    });
  }

  const shr = (() => { const { recent, base } = split('sleepingHr'); return shift(recent, base, 3, 10); })();
  if (shr && shr.delta >= HR_RISE) {
    push({
      id: 'sleepingHr', kind: 'marker', weight: shr.delta >= HR_RISE_BIG ? 2 : 1,
      label: 'Overnight heart rate', value: `${Math.round(shr.r)} bpm`,
      phrase: `your overnight heart rate is up ${bpm(shr.delta)}`,
      detail: `Your nights have been bottoming out around ${bpm(shr.r)}, against ${bpm(shr.b)} normally. How far your rate settles overnight is a picture of how much recovery the night actually bought.`,
    });
  }

  /* ---------- standing response ---------- */
  const orthoOf = (r: Entry): number | null => {
    if (r.type === 'orthostatic') {
      const before = num(r.beforeHr);
      const after = num(r.afterHr);
      return before != null && after != null ? after - before : null;
    }
    if (r.type === 'standTest') return num(r.sustainedDelta) ?? num(r.peakDelta);
    return null;
  };
  const ortho = shift(pick(days, recentKeys, 'readings', orthoOf), pick(days, baseKeys, 'readings', orthoOf), 1, 3);
  if (ortho && ortho.delta >= ORTHO_RISE) {
    const big = ortho.delta >= ORTHO_RISE_BIG || ortho.r >= ORTHO_HIGH;
    push({
      id: 'orthostatic', kind: 'marker', weight: big ? 2 : 1,
      label: 'Standing heart-rate rise', value: `+${Math.round(ortho.r)} bpm`,
      phrase: `your standing heart-rate rise is up ${bpm(ortho.delta)}`,
      detail: `Standing has been costing about ${bpm(ortho.r)} lately, against ${bpm(ortho.b)} across your earlier tests. A widening rise usually tracks blood volume, sleep and load rather than anything new.`,
    });
  }

  /* ---------- symptom load ---------- */
  // A rate, not a median: most days log zero symptoms, and a median of zeros
  // could never move. Only days with a record count on either side, so somebody
  // simply starting to log more often does not read as getting worse.
  const symptomsOn = (ks: string[]) => {
    let total = 0;
    let logged = 0;
    ks.forEach((k) => {
      const d = days[k];
      if (!d) return;
      logged++;
      total += (d.symptoms || []).length;
    });
    return { total, logged };
  };
  const sr = symptomsOn(recentKeys);
  const sb = symptomsOn(baseKeys);
  if (sr.logged >= 4 && sb.logged >= 21) {
    const expected = (sb.total / sb.logged) * sr.logged;
    const extra = sr.total - expected;
    const mult = expected > 0 ? sr.total / expected : Infinity;
    if (mult >= SYMPTOM_MULT && extra >= SYMPTOM_EXTRA) {
      push({
        id: 'symptoms', kind: 'marker',
        weight: mult >= SYMPTOM_MULT_BIG && extra >= SYMPTOM_EXTRA_BIG ? 2 : 1,
        label: 'Symptoms logged', value: `${sr.total} in ${RECENT_DAYS} days`,
        phrase: `you have logged ${Math.round(extra)} more symptom${Math.round(extra) === 1 ? '' : 's'} than usual`,
        detail: `${sr.total} symptom entries this week against about ${Math.round(expected)} in a normal week of yours. You logged them, so this is the one signal here you already know about; it is included because it corroborates the measurements.`,
      });
    }
  }

  /* ---------- heavy activity (context, never alone) ---------- */
  let heavy = 0;
  let moderate = 0;
  keys.slice(-EXERTION_DAYS).forEach((k) => {
    const d = days[k];
    if (!d) return;
    const g = activityGrade(d.activities);
    if (g === 'bad') heavy++;
    else if (g === 'ok') moderate++;
  });
  if (heavy >= 2 || heavy + moderate >= 3) {
    const dayN = heavy + moderate;
    push({
      id: 'exertion', kind: 'context', weight: 1,
      label: 'Heavy activity', value: `${dayN} day${dayN === 1 ? '' : 's'}`,
      phrase: 'activity has run heavy',
      detail: `Activity ran heavy on ${dayN} of the last ${EXERTION_DAYS} days. On its own that is just a busy week; alongside the markers above it is the most likely thing driving them.`,
    });
  }

  /* ---------- the verdict (rules 3 and 4) ---------- */
  const weight = signals.reduce((s, x) => s + x.weight, 0);
  const markers = signals.filter((s) => s.kind === 'marker');
  if (signals.length < 2 || weight < MIN_WEIGHT || !markers.length) return null;

  // Strongest first, and a marker always leads: the card's sentence has to open
  // on something measured, not on "activity has run heavy".
  const order: StrainSignalId[] = ['hrRecovery', 'orthostatic', 'restingHr', 'sleepingHr', 'legsUpHr', 'symptoms', 'exertion'];
  const ranked = signals.slice().sort((a, b) =>
    (b.kind === 'marker' ? 1 : 0) - (a.kind === 'marker' ? 1 : 0)
    || b.weight - a.weight
    || order.indexOf(a.id) - order.indexOf(b.id));

  const strong = signals.filter((s) => s.weight === 2).length;
  const severity: Strain['severity'] = weight >= ALERT_WEIGHT || strong >= 2 ? 'alert' : 'watch';

  const lead = ranked[0];
  const others = ranked.length - 1;
  const extra = others ? `, plus ${others} other sign${others === 1 ? '' : 's'}` : '';
  const headline = severity === 'alert'
    ? `Time to take it easy: ${lead.phrase}${extra}`
    : `Worth easing off: ${lead.phrase}${extra}`;
  const title = severity === 'alert' ? 'Your body is signalling strain' : 'Recovery markers are drifting';

  const body = `${lead.detail} ${others ? `${others} other marker${others === 1 ? '' : 's'} moved with it, listed below. ` : ''}Your score has not broken yet, which is the point of flagging it now: a few lighter days here is usually cheaper than a crash later. This describes a pattern in your own log, not a diagnosis.`;

  return {
    severity,
    signals: ranked,
    weight,
    title,
    headline,
    body,
    readout: { value: `${ranked.length} markers off`, sub: `over the last ${RECENT_DAYS} days` },
    factors: ranked.map((s) => ({ label: s.label, value: s.value, detail: s.detail })),
  };
}
