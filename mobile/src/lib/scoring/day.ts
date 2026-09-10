/**
 * Day-level scoring — ported from the PWA: scoreSet (weighted Autonomic
 * Score), sleepGrade, activityGrade, sleepHours, dayCleanliness,
 * streakInfo/streakTier, blueZone, readingPeriod, scoreCat.
 * Pure: operates on a days map + score context, no store imports.
 */
import { dateFromKey, keyOf, todayKey } from '../dates';
import { hrvCaptureUsedToday } from '../gating';
import { isTrustedReading } from '../hrvQuality';
import { ACTIVITY_TYPES, MED_TYPES, TRIGGER_TYPES } from '../registry';
import type { Band, CustomTypes, DayRecord, Entry, Protocol, ScoreCat, SleepRecord, SleepStages } from '../types';
import {
  BANDS, GRADE_PTS, computeScores, numOr, restingHrBands, totalPower,
  type ScoreContext,
} from './index';

export type DaysMap = Record<string, DayRecord>;

/* ---------- final-score bands ---------- */
export interface DayCat { min: number; label: string; short: string; color: string }
export const SCORE_CATS: DayCat[] = [
  { min: 85, label: 'Excellent Autonomic Day', short: 'Excellent', color: '#2ee06a' },
  { min: 70, label: 'Good Autonomic Day', short: 'Good', color: '#16a34a' },
  { min: 55, label: 'Moderate Autonomic Day', short: 'Moderate', color: '#eab308' },
  { min: 40, label: 'Compromised Day', short: 'Compromised', color: '#f97316' },
  { min: 25, label: 'Bad Day', short: 'Bad', color: '#ef4444' },
  { min: 0, label: 'Crash Day', short: 'Crash', color: '#b91c1c' },
];
export const scoreCat = (s: number): DayCat => SCORE_CATS.find((c) => s >= c.min) || SCORE_CATS[SCORE_CATS.length - 1];

/** Guidance shown on the Autonomic Outlook card. Keep this general: it speaks to
 *  capacity and pacing, never to a specific training plan. Nothing here should
 *  tell someone to exercise — on strong days it offers headroom for their own
 *  protocol and whatever activity they already tolerate, and it always defers to
 *  their plan over the number. */
export const OUTLOOK_GUIDE: Record<string, string> = {
  Excellent: 'Strong autonomic baseline with reserves to spare. A good day for your full protocol, and for whatever activity you normally tolerate. Work within your plan rather than past it.',
  Good: 'Solid baseline. Enough reserve for your protocol and a normal day. Keep anything demanding at a level you already know you handle well.',
  Moderate: 'Reduced reserves. Keep the day easy and stay with the basics of your protocol. Lean on hydration, pacing, and rest, and hold back on anything demanding.',
  Compromised: 'Significantly reduced reserves. This is a recovery day: rest, hydration, and essentials only. Avoid added load and late meals.',
  Bad: 'System is stressed. Rest and gentle breathing. Look at what’s driving it: sleep, food, illness, or accumulated load.',
  Crash: 'System in a crash state. Full rest and your protocol. Check for illness or stacked triggers; seek care if symptoms warrant.',
};
export const TOMORROW: Record<string, string> = {
  Excellent: 'Tomorrow likely Good to Excellent.',
  Good: 'Tomorrow likely Good.',
  Moderate: 'Tomorrow likely Moderate, so plan a lighter day.',
  Compromised: 'Tomorrow likely Compromised to Moderate, so keep it light.',
  Bad: 'Tomorrow likely Bad. Plan a rest day.',
  Crash: 'Tomorrow Bad to Crash. Prepare for full rest.',
};

export const SCORE_TIPS: Record<string, string> = {
  'HRV (RMSSD)': 'Vagal tone responds to rest, hydration, slow breathing, and avoiding triggers or over-exertion the day before.',
  'Total power': 'Low total power means little overall autonomic engagement - favor rest, fluids, and gentle movement over intensity.',
  'pNN50': 'Parasympathetic depth builds on genuine recovery days and consistent, earlier sleep.',
  'VLF power': 'Elevated VLF reflects stress load - cut late stimulation, manage stress, and wind down earlier.',
  'LF peak': 'Aim slow-breathing sessions toward about 0.08–0.10 Hz to train the baroreflex back into range.',
  'Blood pressure': 'Support pressure with fluids and electrolytes; note salt, meds, posture, and heat as context.',
  'Resting HR': 'A lower resting HR follows from hydration, rest, and avoiding stimulants and late activity.',
  'Sleep': 'Target 7h+ - an earlier, consistent bedtime is usually the single biggest lever here.',
  'Activity': "Match activity to today's capacity; pacing now prevents a post-exertional setback later.",
};

/** Which part of the day a reading belongs to (explicit period wins over clock). */
export function readingPeriod(r: Entry): 'morning' | 'midday' | 'evening' {
  if (r.period === 'Morning') return 'morning';
  if (r.period === 'Evening') return 'evening';
  const m = /^(\d{1,2}):/.exec((r.time as string) || '');
  if (!m) return 'midday';
  const h = +m[1];
  return h < 12 ? 'morning' : h >= 18 ? 'evening' : 'midday';
}

/**
 * Hours slept the night that ended the morning of `dk`. Both endpoints live on
 * the same day record: `bed` = last night's bedtime, `wake` = this morning's
 * wake. The midnight wrap handles an evening bedtime → next-morning wake.
 * Returns null when either endpoint is missing.
 */
export function sleepHours(days: DaysMap, dk: string): number | null {
  const d = days[dk];
  const bed = d && d.sleep ? d.sleep.bed : '';
  const wake = d && d.sleep ? d.sleep.wake : '';
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins < 0) mins += 1440;
  return mins / 60;
}

/** Minutes covered by a stage breakdown (asleep stages + awake-in-bed). */
const stageTotal = (s: SleepStages) => s.deep + s.rem + s.core + s.awake;

/** How far the stage breakdown may sit from the bed→wake window and still be
 *  taken as describing that night. Health sources round and drop a few minutes
 *  at the edges; a watch that came off mid-night misses hours. */
const STAGE_WINDOW_TOLERANCE_MIN = 30;

/**
 * The stage breakdown for a night, but only when it still matches the recorded
 * window. Stages come from the health store; the user can afterwards correct
 * bed/wake by hand (a watch charged mid-night records half the night, so Health
 * reports half). Once the window is edited the old stage minutes no longer
 * describe it, and treating them as the night's duration is what made the hours
 * shown disagree with the times the user just entered. Returns null in that
 * case, so duration falls back to bed→wake and the stage bar is hidden.
 */
export function stagesForWindow(sleep: SleepRecord | undefined | null): SleepStages | null {
  if (!sleep || !sleep.stages) return null;
  const days: DaysMap = { d: { sleep } as DayRecord };
  const hrs = sleepHours(days, 'd');
  if (hrs == null) return sleep.stages;
  return Math.abs(hrs * 60 - stageTotal(sleep.stages)) <= STAGE_WINDOW_TOLERANCE_MIN ? sleep.stages : null;
}

/** Overnight-HR thresholds that demote the sleep grade. Exported so the sleep
 *  report can quote the exact numbers it graded against instead of restating
 *  them in copy that then drifts. */
export const SLEEP_HR_LOW_1 = 65;   // sleeping low at/above this costs one step
export const SLEEP_HR_LOW_2 = 75;   // ...and two steps at/above this
export const SLEEP_HR_HIGH = 110;   // an overnight peak at/above this costs one

/** The grade order demotion walks down. */
const SLEEP_GRADE_ORDER: ScoreCat[] = ['great', 'good', 'ok', 'bad', 'crash'];

export interface SleepGradeParts {
  /** Hours between bed and wake (the window, not staged sleep). */
  hours: number;
  interrupted: boolean;
  /** Grade from duration + quality alone, before any HR demotion. */
  base: ScoreCat;
  hrLow: number | null;
  hrHigh: number | null;
  /** Steps the sleeping low cost, and the steps the peak cost. */
  demoteLow: number;
  demoteHigh: number;
  /** Steps actually applied (the larger of the two, not their sum). */
  demote: number;
  cat: ScoreCat;
}

/**
 * Every input the sleep grade used, and what each one did to it. `sleepGrade`
 * is this function's `cat` — the report explains the grade from the same
 * computation rather than a second copy of the thresholds.
 */
export function sleepGradeParts(days: DaysMap, dk: string): SleepGradeParts | null {
  const dur = sleepHours(days, dk);
  if (dur == null) return null;
  const d = days[dk];
  const good = !(d && d.sleep && d.sleep.quality === 'interrupted');
  let cat: ScoreCat;
  if (dur >= 8 && good) cat = 'great';
  else if (dur >= 7) cat = good ? 'good' : 'ok';
  else if (dur >= 6) cat = good ? 'ok' : 'bad';
  else if (dur >= 5) cat = 'bad';
  else cat = 'crash';
  const base = cat;
  const num = (x: unknown) => { const v = parseFloat(String(x)); return isNaN(v) ? null : v; };
  const lo = d && d.sleep ? num(d.sleep.hrLow) : null;
  const hi = d && d.sleep ? num(d.sleep.hrHigh) : null;
  const demoteLow = lo != null ? (lo >= SLEEP_HR_LOW_2 ? 2 : lo >= SLEEP_HR_LOW_1 ? 1 : 0) : 0;
  const demoteHigh = hi != null && hi >= SLEEP_HR_HIGH ? 1 : 0;
  const demote = Math.max(demoteLow, demoteHigh);
  if (demote) {
    cat = SLEEP_GRADE_ORDER[Math.min(SLEEP_GRADE_ORDER.length - 1, SLEEP_GRADE_ORDER.indexOf(cat) + demote)];
  }
  return { hours: dur, interrupted: !good, base, hrLow: lo, hrHigh: hi, demoteLow, demoteHigh, demote, cat };
}

/** Sleep recovery grade for the night before `dk`. Duration + quality set the
 *  base grade; an elevated overnight heart rate then caps it — a long night
 *  spent at a high rate is not restorative sleep. The sleeping low is the
 *  strongest signal (a low that never dropped under ~65 bpm means the system
 *  never settled); a very high overnight peak also costs a step. */
export function sleepGrade(days: DaysMap, dk: string): ScoreCat | null {
  const parts = sleepGradeParts(days, dk);
  return parts ? parts.cat : null;
}

/** Behaviour grade from logged activity load (lightly weighted). */
export function activityGrade(acts?: Entry[]): ScoreCat | null {
  if (!acts || !acts.length) return null;
  const heavy = acts.filter((a) => ['stressfulWork', 'strength', 'coreWorkout', 'indoorBike', 'carWash'].includes(a.type));
  if (acts.some((a) => a.type === 'strenuousWork') || heavy.length >= 3) return 'bad';
  if (heavy.length === 2) return 'ok';
  return 'good';
}

export interface CompDetailMetric { label: string; raw: number; bands: Band[] | null; unit?: string; lowerBetter?: boolean }
export interface CompDetail { value: string; metrics: CompDetailMetric[]; note?: string; maxCat?: ScoreCat }
export interface ScoreComp {
  w: number; p: number; label: string; detail: CompDetail;
  /** How many of the day's readings supplied a value for this component. 1 for
   *  everything that can only come from a single entry (sleep, activity, BP). */
  readings?: number;
}

/** The full input set and what each part is worth. Exported because the
 *  confidence copy in DaySummary needs the same weights the score uses, and a
 *  second copy of the table drifts silently the first time one moves. */
export const SCORE_WEIGHTS: { label: string; w: number }[] = [
  { label: 'HRV (RMSSD)', w: 25 },
  { label: 'Total power', w: 15 },
  { label: 'pNN50', w: 10 },
  { label: 'VLF power', w: 10 },
  { label: 'LF peak', w: 10 },
  { label: 'Blood pressure', w: 8 },
  { label: 'Resting HR', w: 7 },
  { label: 'Sleep', w: 8 },
  { label: 'Activity', w: 2 },
];
/** Weight of a fully logged day — what `confidence` is a percentage OF. */
export const SCORE_TOTAL_WEIGHT = SCORE_WEIGHTS.reduce((s, c) => s + c.w, 0);

export interface ScoreSetResult {
  score: number | null;
  /** Share of the full input set available today, 0-100. A fully logged day
   *  reads 100%. NOT the divisor for the headline — see `weightSum`. */
  confidence: number;
  /** The raw weight actually available (max SCORE_TOTAL_WEIGHT). The score is
   *  sum(w * p) / weightSum, so anything expressing a component in points of
   *  the final score must divide by THIS, never by `confidence`. */
  weightSum: number;
  hasStruct: boolean;
  hasUnstruct: boolean;
  comps: ScoreComp[];
  /** Trusted training (structured) readings the day held, and the usable-pulse
   *  seconds of the most recent one that stamped it — what the confidence copy
   *  needs to tell "nothing captured" apart from "captured, but too short to
   *  resolve the frequency metrics". Null seconds = an older build's reading,
   *  which stamped no coverage: unknown, not zero. */
  structCount: number;
  lastStructCoverageSec: number | null;
}

/**
 * Recency-weighted blend of grade POINTS, oldest to newest.
 *
 * Later readings weigh more — the evening is a better description of the day
 * than the morning — but never 100%, because the morning happened too. A
 * normalized linear ramp: two readings are 1/3 and 2/3, three are 1/6, 2/6, 3/6.
 *
 * POINTS, not raw values: `lfPeak` is a non-monotone LOCATION, so an average of
 * two frequencies is not a frequency anyone measured, and the same blend is
 * already what `hrvPts` does across the two HRV kinds at 0.7/0.3.
 */
export function recencyBlend(pts: readonly number[]): number | null {
  if (!pts.length) return null;
  const denom = (pts.length * (pts.length + 1)) / 2;
  return pts.reduce((s, v, i) => s + v * (i + 1), 0) / denom;
}

/**
 * Weighted Autonomic Score from a subset of readings + the day record.
 * Missing components drop out and the weight is redistributed (confidence).
 *
 * THE DAY IS AGGREGATED, NOT SAMPLED. Every structured component used to come
 * from `last(structured)` alone, which conflated two different questions: could
 * this record RESOLVE the metric, and was the number GOOD. A short evening
 * reading resolves no frequency domain at all, so taking the last one deleted
 * Total power, VLF and LF peak that a full morning reading had measured — a
 * user who took a second reading watched her confidence fall from 77% to 42%
 * for doing it. Completeness now decides only whether a reading can CONTRIBUTE
 * a metric; every trusted reading that resolved one contributes it.
 *
 * Selection is deliberately blind to the VALUE. A worse-but-complete evening
 * reading is real data about a worse evening and must drag the day down; there
 * is no "best reading" anywhere in here. The trade-off being made is that
 * metrics captured hours apart are combined into one number — the recency ramp
 * is what keeps that honest, since the day ends where it ended.
 */
export function scoreSet(readings: Entry[], d: DayRecord, dk: string, days: DaysMap, ctx: ScoreContext = {}): ScoreSetResult {
  const last = <T,>(a: T[]): T | undefined => a[a.length - 1];
  const pts = (cat: ScoreCat | null | undefined): number | null => (cat ? GRADE_PTS[cat] : null);
  // Chronological, because the blend below is a recency ramp and "later" has to
  // mean something. Callers pass the day's readings in log order already; this
  // only makes the assumption explicit rather than load-bearing.
  const byTime = (a: Entry, b: Entry) => ((a.time as string) || '').localeCompare((b.time as string) || '');
  // Imported HRV that carries too little real RR never scores (hrvQuality.ts).
  const structured = readings.filter((r) => r.type === 'breathHrv' && isTrustedReading(r)).sort(byTime);
  const unstructured = readings.filter((r) => r.type === 'hrv' && isTrustedReading(r)).sort(byTime);
  const gStruct = structured.map((r) => computeScores(r, ctx));
  const gUn = unstructured.map((r) => computeScores(r, ctx));

  // A metric's points across every reading of that kind that RESOLVED it.
  // computeScores only records a grade it could compute, so a present key IS
  // "this record resolved it" — a 90-second reading has no `totalPower` key and
  // therefore contributes nothing to Total power, rather than deleting it.
  const blendOf = (graded: Record<string, ScoreCat>[], key: string): { p: number | null; n: number } => {
    const vals = graded.map((g) => (g[key] ? GRADE_PTS[g[key]] : null)).filter((v): v is number => v != null);
    return { p: recencyBlend(vals), n: vals.length };
  };
  /** The most recent reading that resolved `key` — what the explain sheet
   *  quotes a raw number from, since a blended grade has no raw value. */
  const lastWith = (list: Entry[], graded: Record<string, ScoreCat>[], key: string): Entry | null => {
    for (let i = list.length - 1; i >= 0; i--) if (graded[i][key]) return list[i];
    return null;
  };

  const rmS = blendOf(gStruct, 'rmssd'), rmU = blendOf(gUn, 'rmssd');
  let hrvPts: number | null = null;
  if (rmS.p != null && rmU.p != null) hrvPts = 0.7 * rmS.p + 0.3 * rmU.p;
  else if (rmS.p != null) hrvPts = rmS.p;
  else if (rmU.p != null) hrvPts = rmU.p;

  const tp = blendOf(gStruct, 'totalPower');
  const pn = blendOf(gStruct, 'pnn50');
  const vlfB = blendOf(gStruct, 'vlf');
  const lfB = blendOf(gStruct, 'lfPeak');

  const bp = last(readings.filter((r) => r.type === 'bp'));
  const bpPts = bp ? pts(computeScores(bp, ctx).bp) : null;

  const rhrs = readings.filter((r) => r.type === 'restingHr').sort(byTime);
  const rhr = last(rhrs);
  const rhrBlend = blendOf(rhrs.map((r) => computeScores(r, ctx)), 'hr');
  let rhrPts = rhrBlend.p;
  let rhrN = rhrBlend.n;
  if (rhrPts == null) {
    const fromStruct = blendOf(gStruct, 'hr');
    if (fromStruct.p != null) { rhrPts = fromStruct.p; rhrN = fromStruct.n; }
  }
  if (rhrPts == null) {
    const fromUn = blendOf(gUn, 'avgHr');
    if (fromUn.p != null) { rhrPts = fromUn.p; rhrN = fromUn.n; }
  }

  // ---- Per-component detail (raw values + bands) for the score-explain sheet ----
  // The grade is blended across the day, so there IS no single raw value behind
  // it. Each row quotes the most recent reading that resolved the metric and
  // says how many readings the grade came from, rather than implying the last
  // number is the whole story.
  const bs = last(structured), bu = last(unstructured);
  const nv = (x: unknown): number | null => { const v = parseFloat(x as string); return isNaN(v) ? null : v; };
  const fromN = (n: number) => (n > 1 ? `Combined across ${n} readings today, weighted toward the most recent. ` : '');
  const rmSv = (() => { const e = lastWith(structured, gStruct, 'rmssd'); return e ? nv(e.rmssd) : null; })();
  const rmUv = (() => { const e = lastWith(unstructured, gUn, 'rmssd'); return e ? nv(e.rmssd) : null; })();
  const hrvMetrics: CompDetailMetric[] = [];
  if (rmSv != null) hrvMetrics.push({ label: 'RMSSD (training)', raw: rmSv, bands: BANDS.rmssdS, unit: 'ms' });
  if (rmUv != null) hrvMetrics.push({ label: 'RMSSD (baseline)', raw: rmUv, bands: BANDS.rmssdU, unit: 'ms' });
  const hrvDetail: CompDetail = {
    value: rmSv != null && rmUv != null ? `${rmSv}/${rmUv} ms` : rmSv != null ? `${rmSv} ms` : rmUv != null ? `${rmUv} ms` : '',
    metrics: hrvMetrics,
    note: fromN(rmS.n + rmU.n) || undefined,
  };

  const tpE = lastWith(structured, gStruct, 'totalPower');
  const tpV = tpE ? totalPower(tpE) : null;
  const tpR = tpV != null ? Math.round(tpV) : null;
  const tpDetail: CompDetail = { value: tpR != null ? `${tpR} ms²` : '', metrics: tpR != null ? [{ label: 'Total power', raw: tpR, bands: BANDS.totalPower, unit: 'ms²' }] : [], note: fromN(tp.n) || undefined };
  const pnE = lastWith(structured, gStruct, 'pnn50');
  const pnV = pnE ? nv(pnE.pnn50) : null;
  const pnDetail: CompDetail = { value: pnV != null ? `${pnV}%` : '', metrics: pnV != null ? [{ label: 'pNN50', raw: pnV, bands: BANDS.pnn50, unit: '%' }] : [], note: fromN(pn.n) || undefined };
  const vlfE = lastWith(structured, gStruct, 'vlf');
  const vlfV = vlfE ? nv(vlfE.vlowPower) : null;
  const vlfDetail: CompDetail = { value: vlfV != null ? `${vlfV} ms²` : '', metrics: vlfV != null ? [{ label: 'VLF power', raw: vlfV, bands: BANDS.vlf, unit: 'ms²', lowerBetter: true }] : [], note: fromN(vlfB.n) || undefined };
  const lfE = lastWith(structured, gStruct, 'lfPeak');
  const lfV = lfE ? nv(lfE.lfPeak) : null;
  const lfDetail: CompDetail = { value: lfV != null ? `${lfV} Hz` : '', metrics: lfV != null ? [{ label: 'LF peak', raw: lfV, bands: BANDS.lfPeak, unit: 'Hz' }] : [], note: fromN(lfB.n) || undefined };

  const sysV = bp ? nv(bp.sys) : null, diaV = bp ? nv(bp.dia) : null;
  const bpDetail: CompDetail = {
    value: bp ? `${sysV != null ? sysV : '-'}/${diaV != null ? diaV : '-'} mmHg` : '',
    metrics: [
      sysV != null ? { label: 'Systolic', raw: sysV, bands: BANDS.sys, unit: 'mmHg' } : null,
      diaV != null ? { label: 'Diastolic', raw: diaV, bands: BANDS.dia, unit: 'mmHg' } : null,
    ].filter(Boolean) as CompDetailMetric[],
  };

  let rhrV: number | null = null, rhrBands: Band[] | null = null, rhrLabel = 'Resting HR';
  if (rhr) {
    rhrV = nv(rhr.hr); rhrBands = restingHrBands(rhr.position);
    if (rhr.position) rhrLabel = `Resting HR (${rhr.position})`;
  } else if (bs) { rhrV = nv(bs.hr); rhrBands = BANDS.hrBreath; rhrLabel = 'HR (from training HRV)'; }
  else if (bu) { rhrV = nv(bu.avgHr); rhrBands = BANDS.hrBreath; rhrLabel = 'Avg HR (from HRV)'; }
  const rhrDetail: CompDetail = { value: rhrV != null ? `${rhrV} bpm` : '', metrics: rhrV != null ? [{ label: rhrLabel, raw: rhrV, bands: rhrBands, unit: 'bpm', lowerBetter: true }] : [], note: fromN(rhrN) || undefined };

  const slH = sleepHours(days, dk);
  const slInt = !!(d && d.sleep && d.sleep.quality === 'interrupted');
  const sleepDetail: CompDetail = {
    value: slH != null ? `${slH.toFixed(1)} h${slInt ? ', interrupted' : ''}` : 'not logged',
    metrics: [],
    note: 'Targets 7h or more for a good grade; 8h+ and uninterrupted scores best. An elevated overnight heart rate (sleeping low of 65+ bpm) lowers the grade, since restorative sleep needs the rate to settle. An earlier, consistent bedtime is usually the single biggest lever.',
  };

  const actDetail: CompDetail = {
    value: (d.activities || []).length ? String((d.activities || []).length) + ' logged' : 'none logged',
    metrics: [],
    maxCat: 'good',
    note: 'Graded on pacing, not volume: a gentle or normal day scores good (the ceiling here); two heavy sessions drop it to ok, and strenuous work or three or more heavy sessions to bad. Match activity to today’s capacity to avoid a later setback.',
  };

  // Ordered exactly like SCORE_WEIGHTS, whose weights these are.
  const byLabel: Record<string, { p: number | null; detail: CompDetail; readings: number }> = {
    'HRV (RMSSD)': { p: hrvPts, detail: hrvDetail, readings: rmS.n + rmU.n },
    'Total power': { p: tp.p, detail: tpDetail, readings: tp.n },
    'pNN50': { p: pn.p, detail: pnDetail, readings: pn.n },
    'VLF power': { p: vlfB.p, detail: vlfDetail, readings: vlfB.n },
    'LF peak': { p: lfB.p, detail: lfDetail, readings: lfB.n },
    'Blood pressure': { p: bpPts, detail: bpDetail, readings: bp ? 1 : 0 },
    'Resting HR': { p: rhrPts, detail: rhrDetail, readings: rhrN },
    'Sleep': { p: pts(sleepGrade(days, dk)), detail: sleepDetail, readings: 1 },
    'Activity': { p: pts(activityGrade(d.activities)), detail: actDetail, readings: 1 },
  };
  const comps = SCORE_WEIGHTS
    .map((c) => ({ w: c.w, label: c.label, ...byLabel[c.label] }))
    .filter((c) => c.p != null) as ScoreComp[];

  // The most recent training reading's usable pulse, for the confidence copy —
  // absent on a reading from before capture quality was stamped, and null there
  // means UNKNOWN, never zero.
  const lastCov = bs != null && bs.coverageSec != null ? nv(bs.coverageSec) : null;
  const base = {
    hasStruct: !!structured.length, hasUnstruct: !!unstructured.length,
    structCount: structured.length, lastStructCoverageSec: lastCov,
  };
  if (!comps.length) return { score: null, confidence: 0, weightSum: 0, comps: [], ...base };
  const weightSum = comps.reduce((s, c) => s + c.w, 0);
  const sum = comps.reduce((s, c) => s + c.p * c.w, 0);
  return {
    score: Math.round(sum / weightSum),
    // A percentage of the FULL input set, so a fully logged day reads 100%. The
    // raw weight it is a percentage of stays available as `weightSum`, which is
    // what anything converting a component into points of the final score must
    // divide by — the two were one field, and presenting a 95-point sum as a
    // percent meant confidence could never reach 100.
    confidence: Math.round((weightSum / SCORE_TOTAL_WEIGHT) * 100),
    weightSum,
    comps, ...base,
  };
}

/**
 * Blue-zone flag: high baseline readiness masking a fragile training RMSSD.
 *
 * Reads the whole day, like `scoreSet` — it asks whether ANY trusted training
 * reading came back fragile, not whether one particular one did. Picking a
 * single reading (it used to take the first) made the flag depend on which
 * reading happened to be first in the array, and a fragile evening reading
 * behind a strong morning is exactly the case the flag exists for. Still not a
 * blend: this is a "did it happen at all today" question, not a grade.
 */
export function blueZone(readings: Entry[], ctx: ScoreContext = {}): boolean {
  const u = readings.find((r) => r.type === 'hrv' && isTrustedReading(r) && numOr(r.readiness) != null);
  if (!u || numOr(u.readiness)! < 90) return false;
  const fragile: ScoreCat[] = ['ok', 'bad', 'crash'];
  return readings.some((r) => r.type === 'breathHrv' && isTrustedReading(r)
    && fragile.includes(computeScores(r, ctx).rmssd));
}

/* ---------- Clean Day Streak ---------- */
export interface Criterion {
  key: string; label: string; pass: boolean;
  hard?: boolean; broken?: boolean; pending?: boolean; need?: string;
}
export interface Cleanliness { clean: boolean; criteria: Criterion[] }

/** Baseline protocol a user gets before ever opening the editor: 7h sleep,
 *  2.5 L water, no triggers, and an HRV reading. Meds/activities start off and
 *  empty — users pick their own meds in the editor (there are no default drugs
 *  any more). HRV is on because taking the reading is the one habit the whole
 *  app is built around, and a checklist that never asks for it teaches the
 *  opposite. */
export const DEFAULT_PROTOCOL: Protocol = {
  triggers: { enabled: true, types: [] },
  hrv: { enabled: true },
  water: { enabled: true, liters: 2.5 },
  meds: { enabled: false, types: [] },
  activities: { enabled: false, types: [] },
  sleep: { enabled: true, hours: 7 },
};

/** Fill a (possibly partial/absent) stored protocol with defaults. */
export function resolveProtocol(p?: Partial<Protocol> | null): Protocol {
  if (!p) return DEFAULT_PROTOCOL;
  return {
    triggers: { ...DEFAULT_PROTOCOL.triggers, ...p.triggers },
    hrv: { ...DEFAULT_PROTOCOL.hrv, ...p.hrv },
    water: { ...DEFAULT_PROTOCOL.water, ...p.water },
    meds: { ...DEFAULT_PROTOCOL.meds, ...p.meds },
    activities: { ...DEFAULT_PROTOCOL.activities, ...p.activities },
    sleep: { ...DEFAULT_PROTOCOL.sleep, ...p.sleep },
  };
}

/** Daily water goal (liters): the clean-day protocol amount when one is set,
 *  otherwise the 2.5 L default. The protocol holds the ONE goal number, whether
 *  or not water is an enabled requirement — `enabled` only decides whether the
 *  goal counts toward the clean-day streak, not what the goal is. */
export function waterGoalL(p?: Partial<Protocol> | null): number {
  const w = resolveProtocol(p).water;
  return w.liters > 0 ? w.liters : DEFAULT_PROTOCOL.water.liters;
}

const typeLabel = (map: Record<string, { label: string }>, k: string, custom?: Record<string, { label: string }>) => custom?.[k]?.label || map[k]?.label || k;
const joinLabels = (map: Record<string, { label: string }>, keys: string[], custom?: Record<string, { label: string }>) => keys.map((k) => typeLabel(map, k, custom)).join(', ');

/** Build the clean-day checklist for a day against a protocol. An absent or
 *  empty day yields the same criteria as a blank one — every requirement simply
 *  reads as unmet. This is the DISPLAY primitive: it lets the streak widget show
 *  a new user their protocol before anything is logged. Streak/rate math still
 *  goes through dayCleanliness, which returns null for days with no record so a
 *  gap day is excluded rather than counted as a broken day. */
export function protocolCriteria(days: DaysMap, dk: string, protocol: Protocol = DEFAULT_PROTOCOL, custom?: CustomTypes): Criterion[] {
  const d = days[dk];
  const criteria: Criterion[] = [];

  // Triggers (hard — logging one can't be undone for the day). Empty selection
  // means "avoid all triggers"; a selection narrows it to those specific ones.
  if (protocol.triggers.enabled) {
    const triggers = (d && d.food && d.food.triggers) || {};
    const count = (k: string) => (triggers[k] > 0 ? triggers[k] : 0);
    const sel = protocol.triggers.types;
    const logged = (sel.length ? sel : Object.keys(triggers)).reduce((s, k) => s + count(k), 0);
    const label = sel.length ? `No ${joinLabels(TRIGGER_TYPES, sel, custom?.triggers)}` : 'No triggers';
    criteria.push({ key: 'triggers', label, pass: logged === 0, hard: true, broken: logged > 0 });
  }

  // At least one HRV reading captured in-app that day. Health-imported readings
  // (imported: true) don't count — the requirement is to take a reading, same
  // definition the freemium allowance uses (hrvCaptureUsedToday).
  if (protocol.hrv.enabled) {
    criteria.push({ key: 'hrv', label: 'Take an HRV reading', pass: hrvCaptureUsedToday(d) > 0 });
  }

  if (protocol.water.enabled) {
    const water = (d && d.food && d.food.water) || 0;
    criteria.push({ key: 'water', label: `Water (${protocol.water.liters} L)`, pass: water >= protocol.water.liters });
  }

  // Each required medication/activity is its own criterion (own checkmark).
  if (protocol.meds.enabled) {
    const meds = (d && d.meds) || [];
    protocol.meds.types.forEach((t) => {
      const label = typeLabel(MED_TYPES, t, custom?.meds);
      criteria.push({ key: `meds:${t}`, label, pass: meds.some((m) => m.type === t) });
    });
  }

  if (protocol.activities.enabled) {
    const acts = (d && d.activities) || [];
    protocol.activities.types.forEach((t) => {
      const label = typeLabel(ACTIVITY_TYPES, t, custom?.activities);
      criteria.push({ key: `activities:${t}`, label, pass: acts.some((a) => a.type === t) });
    });
  }

  if (protocol.sleep.enabled) {
    const hrs = sleepHours(days, dk);
    const sleepLogged = hrs != null;
    criteria.push({ key: 'sleep', label: `Sleep ${protocol.sleep.hours}h or more`, pass: sleepLogged && hrs! >= protocol.sleep.hours, hard: true, broken: sleepLogged && hrs! < protocol.sleep.hours });
  }

  return criteria;
}

export function dayCleanliness(days: DaysMap, dk: string, protocol: Protocol = DEFAULT_PROTOCOL, custom?: CustomTypes): Cleanliness | null {
  if (!days[dk]) return null;
  const criteria = protocolCriteria(days, dk, protocol, custom);
  const clean = criteria.length > 0 && criteria.filter((c) => !c.pending).every((c) => c.pass);
  return { clean, criteria };
}

export const streakTier = (n: number) =>
  n <= 0 ? { tier: 'Start fresh', msg: 'Today is day 1. Start fresh.' }
  : n <= 3 ? { tier: 'Building', msg: 'Building momentum.' }
  : n <= 7 ? { tier: 'Established', msg: 'Strong week forming.' }
  : n <= 14 ? { tier: 'Excellent', msg: 'Exceptional consistency.' }
  : n <= 30 ? { tier: 'Outstanding', msg: 'Major recovery period.' }
  : { tier: 'Elite', msg: 'Sustained protocol mastery.' };

export interface StreakInfo {
  current: number; longest: number; rate: number | null;
  today: Cleanliness | null; isToday: boolean;
}

export function streakInfo(days: DaysMap, dk: string, protocol: Protocol = DEFAULT_PROTOCOL, custom?: CustomTypes): StreakInfo {
  const today = todayKey();
  const cur = dayCleanliness(days, dk, protocol, custom);
  const cursor = dateFromKey(dk);
  if (dk === today && (!cur || !cur.clean)) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  for (;;) {
    const c = dayCleanliness(days, keyOf(cursor), protocol);
    if (!c || !c.clean) break;
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const keys = Object.keys(days).filter((k) => k <= dk).sort();
  let longest = current, run = 0;
  if (keys.length) {
    const end = dateFromKey(dk);
    for (let cd = dateFromKey(keys[0]); cd <= end; cd.setDate(cd.getDate() + 1)) {
      const c = dayCleanliness(days, keyOf(cd), protocol);
      if (c && c.clean) { run++; if (run > longest) longest = run; }
      else run = 0;
    }
  }
  let cleanN = 0, total = 0;
  const e = dateFromKey(dk);
  for (let i = 0; i < 30; i++) {
    const c = dayCleanliness(days, keyOf(new Date(e.getFullYear(), e.getMonth(), e.getDate() - i)), protocol);
    if (c) { total++; if (c.clean) cleanN++; }
  }
  return { current, longest, rate: total ? Math.round((cleanN / total) * 100) : null, today: cur, isToday: dk === today };
}

/**
 * Chronological history for one metric across all days (last `limit`):
 * returns [{ v, date }] oldest -> newest.
 *
 * `upto` is a reading id: history stops at that reading (inclusive), so a
 * summary opened on an older reading charts what was known *then* rather than
 * trailing off into readings taken after it. An id that isn't in `days` (an
 * unsaved live preview) leaves the full history intact.
 *
 * It deliberately does NOT aggregate the way `scoreSet` now does: this is the
 * chart behind a metric, so every reading is a point on it. Combining them here
 * would hide the very variation the sparkline exists to show.
 *
 * `kind` picks the day array to walk. Activities carry metrics of their own
 * (HR @60s rest on a run), and the workout report charts them the same way a
 * reading's summary charts its own; the trusted-HRV filter is a readings rule
 * and does not apply there.
 */
export function metricHistory(
  days: DaysMap, type: string, extractor: (r: Entry) => number | null, limit = 15, upto?: string | null,
  kind: 'readings' | 'activities' = 'readings',
): { v: number; date: string }[] {
  const out: { v: number; date: string }[] = [];
  let cut = -1;
  Object.keys(days).sort().forEach((dk) => {
    const src = (kind === 'activities' ? days[dk].activities : days[dk].readings) || [];
    const list = src.filter((r) => r.type === type && (kind === 'activities' || isTrustedReading(r)));
    list.sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    list.forEach((r) => {
      const v = extractor(r);
      if (v != null && !isNaN(v)) {
        out.push({ v, date: dk });
        if (upto && String(r.id) === upto) cut = out.length;
      }
    });
  });
  return (cut >= 0 ? out.slice(0, cut) : out).slice(-limit);
}

export const numEx = (key: string) => (rr: Entry): number | null => {
  const v = parseFloat(rr[key] as string);
  return isNaN(v) ? null : v;
};
