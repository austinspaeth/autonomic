/**
 * "Worth a look" — findings that are not correlations.
 *
 * ./correlate can only answer one shape of question: does this column move with
 * that column. Plenty of the most useful things in a journal are a different
 * shape entirely — a time of day that reads better, a weekday that reliably goes
 * badly, a test nobody has run in three weeks, what the good days have in common.
 * Each of those is a small bespoke analysis, so this file is a REGISTRY of probes
 * rather than one algorithm: a probe is an independent function returning at most
 * one observation plus an importance, and `findObservations` takes the best three.
 *
 * That shape is the point. Adding a new kind of insight later is appending one
 * function to `OBSERVATION_PROBES`, with no effect on the others and its own unit
 * test — the same reason ../trends/metrics is a table.
 *
 * Every probe is held to the same bar as a correlation: enough observations to
 * mean something, a rank test rather than a difference of means, and copy that
 * describes what was seen rather than what to do about it.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { isEvening, isMorning } from '../analysis/buckets';
import { dateFromKey, fmtMonthDay } from '../dates';
import { trustedReadings } from '../hrvQuality';
import { resolveProtocol, streakInfo } from '../scoring/day';
import { READING_TYPES } from '../registry';
import type { AppState, Entry } from '../types';
import type { DayMatrix } from './matrix';
import { mannWhitney, median } from './stats';

/** Never more than three, so the section stays readable. */
export const MAX_OBSERVATIONS = 3;

export interface Observation {
  id: string;
  title: string;
  body: string;
  /** Drives the glyph colour: something working, something to keep an eye on,
   *  something that needs attention. */
  tone: 'good' | 'watch' | 'alert';
  /** An `IconName` from src/components/Icon. Unused by the current UI, which draws
   *  one fixed glyph per tone, but kept because the probe knows its own subject and
   *  a future surface may want it. */
  icon: string;
  /**
   * Where tapping this row should land: a Progress category id, or absent when the
   * probe has nowhere useful to send anybody.
   *
   * Absent is a real answer and the UI respects it by drawing no chevron and not
   * making the row pressable. A chevron on a row that does nothing is a promise the
   * app doesn't keep.
   */
  section?: string;
  /** Higher wins the three slots. Set by hand per probe, because these are not
   *  comparable statistics and pretending otherwise would rank them wrongly. */
  importance: number;
}

export interface ProbeInput {
  matrix: DayMatrix;
  state: AppState;
  dk: string;
}

export type ObservationProbe = (input: ProbeInput) => Observation | null;

/* ---------- helpers ---------- */

const round1 = (v: number) => Math.round(v * 10) / 10;

const hrvOf = (r: Entry): number | null => {
  const v = parseFloat(String(r.rmssd));
  return Number.isFinite(v) ? v : null;
};

/** Every trusted HRV reading across the window, with its day key. */
function hrvReadings(input: ProbeInput): { r: Entry; dk: string }[] {
  const out: { r: Entry; dk: string }[] = [];
  input.matrix.keys.forEach((dk) => {
    const d = input.matrix.days[dk];
    if (!d) return;
    trustedReadings(d.readings).forEach((r) => {
      if (r.type === 'hrv' || r.type === 'breathHrv') out.push({ r, dk });
    });
  });
  return out;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which Progress chart a stale reading type belongs to. */
const STALE_SECTION: Record<string, string | undefined> = {
  hrv: 'hrv', breathHrv: 'hrv', bp: 'vitals', restingHr: 'vitals', standTest: 'pots', orthostatic: 'pots',
};

/* ---------- probes ---------- */

/**
 * Does time of day change what the readings say?
 *
 * Worth its own probe rather than a factor column because it is a WITHIN-day
 * split: the same day contributes to both groups, which no factor column can
 * express. Practically the most actionable observation in the set, since "measure
 * before 8am" costs nothing and makes every other number more comparable.
 */
const timeOfDay: ObservationProbe = (input) => {
  const morning: number[] = [], later: number[] = [];
  hrvReadings(input).forEach(({ r }) => {
    const v = hrvOf(r);
    if (v == null) return;
    if (isMorning(r)) morning.push(v);
    else if (isEvening(r) || !isMorning(r)) later.push(v);
  });
  if (morning.length < 8 || later.length < 8) return null;
  const g = mannWhitney(morning, later);
  if (g.p > 0.05) return null;
  const diff = g.median1 - g.median2;
  if (Math.abs(diff) < 2) return null;
  const higher = diff > 0;
  return {
    id: 'timeOfDay',
    section: 'hrv',
    title: higher ? 'Your morning readings run higher' : 'Your later readings run higher',
    body: `RMSSD ${higher ? 'before noon' : 'after noon'} averages ${round1(Math.abs(diff))} ms above the other half of the day, across ${morning.length + later.length} readings. Taking readings at a consistent hour makes every trend here sharper.`,
    tone: 'good',
    icon: 'sun',
    importance: 78,
  };
};

/**
 * The best and worst day of the week by daily score.
 *
 * Needs three scored days on each end and a gap wide enough to survive a single
 * bad week, since with only eight weeks of data one crash lands entirely inside
 * one weekday.
 */
const weekday: ObservationProbe = (input) => {
  const scores = input.matrix.outcomes.score;
  if (!scores) return null;
  const byDay: number[][] = [[], [], [], [], [], [], []];
  input.matrix.keys.forEach((k, i) => {
    const v = scores[i];
    if (v == null) return;
    byDay[dateFromKey(k).getDay()].push(v);
  });
  const eligible = byDay.map((vals, i) => ({ i, n: vals.length, m: median(vals) })).filter((x) => x.n >= 3);
  if (eligible.length < 4) return null;
  const best = eligible.reduce((a, b) => (b.m > a.m ? b : a));
  const worst = eligible.reduce((a, b) => (b.m < a.m ? b : a));
  if (best.i === worst.i || best.m - worst.m < 10) return null;
  return {
    id: 'weekday',
    section: 'outlook',
    title: `${WEEKDAYS[worst.i]}s are your hardest day`,
    body: `Your score averages ${Math.round(worst.m)} on ${WEEKDAYS[worst.i]}s against ${Math.round(best.m)} on ${WEEKDAYS[best.i]}s. Worth asking what is different about the day before.`,
    tone: 'watch',
    icon: 'chart',
    importance: 58,
  };
};

/**
 * A reading type the user clearly uses, but hasn't taken in a while.
 *
 * Framed as a gap in the analysis rather than a scolding, because that is what it
 * is: a stale POTS test does not make anyone less well, it makes the orthostatic
 * findings on this screen impossible to compute.
 */
const stale: ObservationProbe = (input) => {
  const { days } = input.matrix;
  const counts = new Map<string, { n: number; last: string }>();
  Object.keys(days).sort().forEach((k) => {
    (days[k].readings || []).forEach((r) => {
      if (!r.type || !READING_TYPES[r.type]) return;
      const cur = counts.get(r.type);
      counts.set(r.type, { n: (cur ? cur.n : 0) + 1, last: k });
    });
  });
  const todayMs = dateFromKey(input.dk).getTime();
  let worst: { type: string; age: number } | null = null;
  counts.forEach((v, type) => {
    if (v.n < 3) return;
    const age = Math.round((todayMs - dateFromKey(v.last).getTime()) / 86400000);
    if (age < 14) return;
    if (!worst || age > worst.age) worst = { type, age };
  });
  if (!worst) return null;
  const { type, age } = worst as { type: string; age: number };
  const label = READING_TYPES[type].label;
  return {
    id: `stale:${type}`,
    section: STALE_SECTION[type],
    title: `No ${label.toLowerCase()} in ${age} days`,
    body: `You have logged ${label} before, but not since ${fmtMonthDay((counts.get(type) as { last: string }).last)}. A fresh one sharpens every finding that depends on it.`,
    tone: age >= 30 ? 'alert' : 'watch',
    icon: 'clipboard',
    importance: 62,
  };
};

/**
 * What the good days have in common.
 *
 * Compares the top and bottom quartile of scored days and looks for the factor
 * most over-represented in the good ones. Cruder than ./correlate and deliberately
 * so: it can surface something on a journal too thin for a rank test to clear the
 * FDR bar, which is exactly the user who most needs a lead to follow. The copy
 * therefore says "show up on" rather than making a claim, and the lift threshold
 * is set high enough that noise doesn't qualify.
 */
const bestDays: ObservationProbe = (input) => {
  const scores = input.matrix.outcomes.score;
  if (!scores) return null;
  const scored = input.matrix.keys.map((k, i) => ({ i, v: scores[i] })).filter((x) => x.v != null) as { i: number; v: number }[];
  if (scored.length < 24) return null;
  const sorted = scored.slice().sort((a, b) => a.v - b.v);
  const q = Math.max(6, Math.floor(sorted.length / 4));
  const low = new Set(sorted.slice(0, q).map((x) => x.i));
  const high = new Set(sorted.slice(sorted.length - q).map((x) => x.i));

  let best: { label: string; hi: number; lo: number; lift: number } | null = null;
  input.matrix.defs.forEach((f) => {
    if (f.kind !== 'binary' || f.group === 'symptom') return;
    const col = input.matrix.factors[f.id];
    if (!col) return;
    let hi = 0, hiN = 0, lo = 0, loN = 0;
    high.forEach((i) => { if (col[i] != null) { hiN++; if (col[i]) hi++; } });
    low.forEach((i) => { if (col[i] != null) { loN++; if (col[i]) lo++; } });
    if (hiN < 5 || loN < 5 || hi < 3) return;
    const pHi = hi / hiN, pLo = lo / loN;
    const lift = pHi / Math.max(0.08, pLo);
    if (lift < 1.8) return;
    if (!best || lift > best.lift) best = { label: f.label, hi: Math.round(pHi * 100), lo: Math.round(pLo * 100), lift };
  });
  if (!best) return null;
  const b = best as { label: string; hi: number; lo: number };
  return {
    id: 'bestDays',
    section: 'outlook',
    title: `${b.label} shows up on your best days`,
    body: `It appears on ${b.hi}% of your highest-scoring days and ${b.lo}% of your lowest. Not proof of anything on its own, but the clearest lead in your log.`,
    tone: 'good',
    icon: 'star',
    importance: 72,
  };
};

/** Short nights recently — the most common single explanation for a flat month. */
const sleepDebt: ObservationProbe = (input) => {
  const series = input.matrix.outcomes.sleepDuration;
  if (!series) return null;
  const recent = series.slice(Math.max(0, series.length - 14)).filter((v): v is number => v != null);
  if (recent.length < 8) return null;
  const short = recent.filter((h) => h < 6).length;
  if (short < 4) return null;
  return {
    id: 'sleepDebt',
    section: 'sleep',
    title: `${short} short nights in the last two weeks`,
    body: `You slept under six hours on ${short} of the ${recent.length} nights recorded. Sleep is the factor most often sitting underneath everything else on this screen.`,
    tone: short >= 7 ? 'alert' : 'watch',
    icon: 'moon',
    importance: 66,
  };
};

/** Two symptoms that keep arriving together. */
const symptomPair: ObservationProbe = (input) => {
  const sym = input.matrix.defs.filter((f) => f.group === 'symptom');
  if (sym.length < 2) return null;
  let best: { a: string; b: string; both: number; lift: number } | null = null;
  for (let i = 0; i < sym.length; i++) {
    for (let j = i + 1; j < sym.length; j++) {
      const ca = input.matrix.factors[sym[i].id], cb = input.matrix.factors[sym[j].id];
      if (!ca || !cb) continue;
      let both = 0, na = 0, nb = 0, n = 0;
      for (let k = 0; k < ca.length; k++) {
        if (ca[k] == null || cb[k] == null) continue;
        n++;
        if (ca[k]) na++;
        if (cb[k]) nb++;
        if (ca[k] && cb[k]) both++;
      }
      if (both < 6 || !n) continue;
      const expected = (na / n) * (nb / n) * n;
      const lift = both / Math.max(1, expected);
      if (lift < 1.6) continue;
      if (!best || lift > best.lift) best = { a: sym[i].label, b: sym[j].label, both, lift };
    }
  }
  if (!best) return null;
  const b = best as { a: string; b: string; both: number };
  return {
    id: 'symptomPair',
    section: 'triggers',
    title: `${b.a} and ${b.b} travel together`,
    body: `They were logged on the same day ${b.both} times, more often than either one's frequency would predict. They may share a trigger.`,
    tone: 'watch',
    icon: 'gut',
    importance: 48,
  };
};

/** A clean-day streak worth knowing about. */
const streak: ObservationProbe = (input) => {
  const info = streakInfo(input.matrix.days, input.dk, resolveProtocol(input.state.settings.protocol), input.state.customTypes);
  if (!info || info.current < 4) return null;
  return {
    id: 'streak',
    section: 'outlook',
    title: `${info.current} clean days in a row`,
    body: info.longest > info.current
      ? `Your longest run is ${info.longest}. Everything on this screen gets easier to read while a streak holds, because the days are comparable.`
      : `That is your longest run so far.`,
    tone: 'good',
    icon: 'checklist',
    importance: 52,
  };
};

/**
 * Thin coverage. Deliberately the lowest importance in the file: the header's
 * confidence ring already says this properly, so it should only take a slot when
 * there is genuinely nothing else to report — which is exactly the case where the
 * user needs to be told why the screen is empty.
 */
const coverage: ObservationProbe = (input) => {
  const logged = input.matrix.logged.slice(-30).filter(Boolean).length;
  if (logged >= 20) return null;
  // An EMPTY journal is not thin coverage, it is no coverage: "Only 0 of the last
  // 30 days are logged" is the absence of an observation rather than one, and as
  // the only card on the screen it also counted as a finding — which suppressed the
  // countdown view (`InsightsEmpty`) that is the whole answer for a new user.
  if (!input.matrix.logged.some(Boolean)) return null;
  return {
    id: 'coverage',
    title: `Only ${logged} of the last 30 days are logged`,
    body: 'Most findings here need eight days on each side of a comparison. Filling in more days is the fastest way to make this screen useful.',
    tone: 'watch',
    icon: 'alert',
    importance: 30,
  };
};

/**
 * The registry. Order is irrelevant — `importance` decides — but keeping the
 * strongest first makes the file read the way the screen does.
 */
export const OBSERVATION_PROBES: ObservationProbe[] = [
  timeOfDay, bestDays, sleepDebt, stale, weekday, streak, symptomPair, coverage,
];

/**
 * The best MAX_OBSERVATIONS observations. A probe that throws is skipped rather
 * than taking the whole report down with it: these are heuristics over
 * user-shaped data and one bad edge case should cost one row, not the screen.
 */
export function findObservations(input: ProbeInput): Observation[] {
  const found: Observation[] = [];
  OBSERVATION_PROBES.forEach((probe) => {
    try {
      const o = probe(input);
      if (o) found.push(o);
    } catch { /* one probe's edge case is not the report's problem */ }
  });
  return found.sort((a, b) => b.importance - a.importance).slice(0, MAX_OBSERVATIONS);
}

/** Exported for the tests, which assert each probe in isolation. */
export const PROBES_BY_ID = { timeOfDay, weekday, stale, bestDays, sleepDebt, symptomPair, streak, coverage };
