/**
 * Day-level scoring — ported from the PWA: scoreSet (weighted Autonomic
 * Score), sleepGrade, activityGrade, sleepHours, dayCleanliness,
 * streakInfo/streakTier, blueZone, readingPeriod, scoreCat.
 * Pure: operates on a days map + score context, no store imports.
 */
import { dateFromKey, keyOf, todayKey } from '../dates';
import { ACTIVITY_TYPES, MED_TYPES, TRIGGER_TYPES } from '../registry';
import type { Band, DayRecord, Entry, Protocol, ScoreCat } from '../types';
import {
  BANDS, GRADE_PTS, computeScores, numOr, restingHrBands, totalPower,
  type ScoreContext,
} from './index';

export type DaysMap = Record<string, DayRecord>;

/* ---------- final-score bands ---------- */
export interface DayCat { min: number; label: string; short: string; color: string }
export const SCORE_CATS: DayCat[] = [
  { min: 85, label: 'Excellent Autonomic Day', short: 'Excellent', color: '#16a34a' },
  { min: 70, label: 'Good Autonomic Day', short: 'Good', color: '#22c55e' },
  { min: 55, label: 'Moderate Autonomic Day', short: 'Moderate', color: '#eab308' },
  { min: 40, label: 'Compromised Day', short: 'Compromised', color: '#f97316' },
  { min: 25, label: 'Bad Day', short: 'Bad', color: '#ef4444' },
  { min: 0, label: 'Crash Day', short: 'Crash', color: '#b91c1c' },
];
export const scoreCat = (s: number): DayCat => SCORE_CATS.find((c) => s >= c.min) || SCORE_CATS[SCORE_CATS.length - 1];

export const OUTLOOK_GUIDE: Record<string, string> = {
  Excellent: "Strong autonomic baseline. Good for the full protocol, including intervals, core, and strength. Capitalize on the capacity; don't push past the plan.",
  Good: "Solid baseline. Easy cycling, strength, normal activities. Hold off on intervals unless you've trended up across several days.",
  Moderate: 'Reduced reserves. Walking, gentle activity, light core only. Skip cycling and intervals, and lean on hydration and rest.',
  Compromised: 'Significantly reduced reserves. Rest, gentle stretching, basic ADLs. Avoid structured exercise and late dinners. This is a recovery day.',
  Bad: 'System is stressed. Complete rest and gentle breathing only. Look at what’s driving it: sleep, food, illness, or accumulated load.',
  Crash: 'System in a crash state. Full rest, Liquid IV, magnesium, all meds. Check for illness or stacked triggers; seek care if symptoms warrant.',
};
export const TOMORROW: Record<string, string> = {
  Excellent: 'Tomorrow likely Good to Excellent.',
  Good: 'Tomorrow likely Good.',
  Moderate: 'Tomorrow likely Moderate, so skip intervals.',
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

/** Sleep recovery grade for the night before `dk`. */
export function sleepGrade(days: DaysMap, dk: string): ScoreCat | null {
  const dur = sleepHours(days, dk);
  if (dur == null) return null;
  const d = days[dk];
  const good = !(d && d.sleep && d.sleep.quality === 'interrupted');
  if (dur >= 8 && good) return 'great';
  if (dur >= 7) return good ? 'good' : 'ok';
  if (dur >= 6) return good ? 'ok' : 'bad';
  if (dur >= 5) return 'bad';
  return 'crash';
}

/** Behaviour grade from logged activity load (lightly weighted). */
export function activityGrade(acts?: Entry[]): ScoreCat | null {
  if (!acts || !acts.length) return null;
  const heavy = acts.filter((a) => ['stressfulWork', 'upperBody', 'coreWorkout', 'indoorBike', 'carWash'].includes(a.type));
  if (acts.some((a) => a.type === 'strenuousWork') || heavy.length >= 3) return 'bad';
  if (heavy.length === 2) return 'ok';
  return 'good';
}

export interface CompDetailMetric { label: string; raw: number; bands: Band[] | null; unit?: string; lowerBetter?: boolean }
export interface CompDetail { value: string; metrics: CompDetailMetric[]; note?: string; maxCat?: ScoreCat }
export interface ScoreComp { w: number; p: number; label: string; detail: CompDetail }
export interface ScoreSetResult {
  score: number | null;
  confidence: number;
  hasStruct: boolean;
  hasUnstruct: boolean;
  comps: ScoreComp[];
}

/**
 * Weighted Autonomic Score from a subset of readings + the day record.
 * Missing components drop out and the weight is redistributed (confidence).
 */
export function scoreSet(readings: Entry[], d: DayRecord, dk: string, days: DaysMap, ctx: ScoreContext = {}): ScoreSetResult {
  const last = <T,>(a: T[]): T | undefined => a[a.length - 1];
  const pts = (cat: ScoreCat | null | undefined): number | null => (cat ? GRADE_PTS[cat] : null);
  const structured = readings.filter((r) => r.type === 'breathHrv');
  const unstructured = readings.filter((r) => r.type === 'hrv');
  const sStruct = structured.length ? computeScores(last(structured)!, ctx) : null;
  const sUn = unstructured.length ? computeScores(last(unstructured)!, ctx) : null;

  let hrvPts: number | null = null;
  if (sStruct && sStruct.rmssd && sUn && sUn.rmssd) hrvPts = 0.7 * pts(sStruct.rmssd)! + 0.3 * pts(sUn.rmssd)!;
  else if (sStruct && sStruct.rmssd) hrvPts = pts(sStruct.rmssd);
  else if (sUn && sUn.rmssd) hrvPts = pts(sUn.rmssd);

  const bp = last(readings.filter((r) => r.type === 'bp'));
  const bpPts = bp ? pts(computeScores(bp, ctx).bp) : null;

  const rhr = last(readings.filter((r) => r.type === 'restingHr'));
  let rhrPts = rhr ? pts(computeScores(rhr, ctx).hr) : null;
  if (rhrPts == null && sStruct) rhrPts = pts(sStruct.hr);
  if (rhrPts == null && sUn) rhrPts = pts(sUn.avgHr);

  // ---- Per-component detail (raw values + bands) for the score-explain sheet ----
  const bs = last(structured), bu = last(unstructured);
  const nv = (x: unknown): number | null => { const v = parseFloat(x as string); return isNaN(v) ? null : v; };
  const rmS = bs ? nv(bs.rmssd) : null, rmU = bu ? nv(bu.rmssd) : null;
  const hrvMetrics: CompDetailMetric[] = [];
  if (rmS != null) hrvMetrics.push({ label: 'RMSSD (structured)', raw: rmS, bands: BANDS.rmssdS, unit: 'ms' });
  if (rmU != null) hrvMetrics.push({ label: 'RMSSD (unstructured)', raw: rmU, bands: BANDS.rmssdU, unit: 'ms' });
  const hrvDetail: CompDetail = {
    value: rmS != null && rmU != null ? `${rmS}/${rmU} ms` : rmS != null ? `${rmS} ms` : rmU != null ? `${rmU} ms` : '',
    metrics: hrvMetrics,
  };

  const tpV = bs ? totalPower(bs) : null;
  const tpR = tpV != null ? Math.round(tpV) : null;
  const tpDetail: CompDetail = { value: tpR != null ? `${tpR} ms²` : '', metrics: tpR != null ? [{ label: 'Total power', raw: tpR, bands: BANDS.totalPower, unit: 'ms²' }] : [] };
  const pnV = bs ? nv(bs.pnn50) : null;
  const pnDetail: CompDetail = { value: pnV != null ? `${pnV}%` : '', metrics: pnV != null ? [{ label: 'pNN50', raw: pnV, bands: BANDS.pnn50, unit: '%' }] : [] };
  const vlfV = bs ? nv(bs.vlowPower) : null;
  const vlfDetail: CompDetail = { value: vlfV != null ? `${vlfV} ms²` : '', metrics: vlfV != null ? [{ label: 'VLF power', raw: vlfV, bands: BANDS.vlf, unit: 'ms²', lowerBetter: true }] : [] };
  const lfV = bs ? nv(bs.lfPeak) : null;
  const lfDetail: CompDetail = { value: lfV != null ? `${lfV} Hz` : '', metrics: lfV != null ? [{ label: 'LF peak', raw: lfV, bands: BANDS.lfPeak, unit: 'Hz' }] : [] };

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
  } else if (bs) { rhrV = nv(bs.hr); rhrBands = BANDS.hrBreath; rhrLabel = 'HR (from breathing HRV)'; }
  else if (bu) { rhrV = nv(bu.avgHr); rhrBands = BANDS.hrBreath; rhrLabel = 'Avg HR (from HRV)'; }
  const rhrDetail: CompDetail = { value: rhrV != null ? `${rhrV} bpm` : '', metrics: rhrV != null ? [{ label: rhrLabel, raw: rhrV, bands: rhrBands, unit: 'bpm', lowerBetter: true }] : [] };

  const slH = sleepHours(days, dk);
  const slInt = !!(d && d.sleep && d.sleep.quality === 'interrupted');
  const sleepDetail: CompDetail = {
    value: slH != null ? `${slH.toFixed(1)} h${slInt ? ', interrupted' : ''}` : 'not logged',
    metrics: [],
    note: 'Targets 7h or more for a good grade; 8h+ and uninterrupted scores best. An earlier, consistent bedtime is usually the single biggest lever.',
  };

  const actDetail: CompDetail = {
    value: (d.activities || []).length ? String((d.activities || []).length) + ' logged' : 'none logged',
    metrics: [],
    maxCat: 'good',
    note: 'Graded on pacing, not volume: a gentle or normal day scores good (the ceiling here); two heavy sessions drop it to ok, and strenuous work or three or more heavy sessions to bad. Match activity to today’s capacity to avoid a later setback.',
  };

  const comps = ([
    { w: 25, p: hrvPts, label: 'HRV (RMSSD)', detail: hrvDetail },
    { w: 15, p: sStruct ? pts(sStruct.totalPower) : null, label: 'Total power', detail: tpDetail },
    { w: 10, p: sStruct ? pts(sStruct.pnn50) : null, label: 'pNN50', detail: pnDetail },
    { w: 10, p: sStruct ? pts(sStruct.vlf) : null, label: 'VLF power', detail: vlfDetail },
    { w: 10, p: sStruct ? pts(sStruct.lfPeak) : null, label: 'LF peak', detail: lfDetail },
    { w: 8, p: bpPts, label: 'Blood pressure', detail: bpDetail },
    { w: 7, p: rhrPts, label: 'Resting HR', detail: rhrDetail },
    { w: 8, p: pts(sleepGrade(days, dk)), label: 'Sleep', detail: sleepDetail },
    { w: 2, p: pts(activityGrade(d.activities)), label: 'Activity', detail: actDetail },
  ] as { w: number; p: number | null; label: string; detail: CompDetail }[]).filter((c) => c.p != null) as ScoreComp[];

  if (!comps.length) return { score: null, confidence: 0, hasStruct: !!sStruct, hasUnstruct: !!unstructured.length, comps: [] };
  const avail = comps.reduce((s, c) => s + c.w, 0);
  const sum = comps.reduce((s, c) => s + c.p * c.w, 0);
  return { score: Math.round(sum / avail), confidence: Math.round(avail), hasStruct: !!sStruct, hasUnstruct: !!unstructured.length, comps };
}

/** Blue-zone flag: high unstructured readiness masking a fragile structured RMSSD. */
export function blueZone(readings: Entry[], ctx: ScoreContext = {}): boolean {
  const u = readings.find((r) => r.type === 'hrv' && numOr(r.readiness) != null);
  const s = readings.find((r) => r.type === 'breathHrv');
  if (!u || !s) return false;
  const rmssd = computeScores(s, ctx).rmssd;
  return numOr(u.readiness)! >= 90 && (['ok', 'bad', 'crash'] as ScoreCat[]).includes(rmssd);
}

/* ---------- Clean Day Streak ---------- */
export interface Criterion {
  key: string; label: string; pass: boolean;
  hard?: boolean; broken?: boolean; pending?: boolean; need?: string;
}
export interface Cleanliness { clean: boolean; criteria: Criterion[] }

/** Baseline protocol a user gets before ever opening the editor: 8h sleep,
 *  2.5 L water, no triggers. Meds/activities start off (types kept so they
 *  prefill if the user turns meds on later). */
export const DEFAULT_PROTOCOL: Protocol = {
  triggers: { enabled: true, types: [] },
  water: { enabled: true, liters: 2.5 },
  meds: { enabled: false, types: ['allegra', 'pepsidAc', 'magGlycinate'] },
  activities: { enabled: false, types: [] },
  sleep: { enabled: true, hours: 8 },
};

/** Fill a (possibly partial/absent) stored protocol with defaults. */
export function resolveProtocol(p?: Partial<Protocol> | null): Protocol {
  if (!p) return DEFAULT_PROTOCOL;
  return {
    triggers: { ...DEFAULT_PROTOCOL.triggers, ...p.triggers },
    water: { ...DEFAULT_PROTOCOL.water, ...p.water },
    meds: { ...DEFAULT_PROTOCOL.meds, ...p.meds },
    activities: { ...DEFAULT_PROTOCOL.activities, ...p.activities },
    sleep: { ...DEFAULT_PROTOCOL.sleep, ...p.sleep },
  };
}

const typeLabel = (map: Record<string, { label: string }>, k: string) => map[k]?.label || k;
const joinLabels = (map: Record<string, { label: string }>, keys: string[]) => keys.map((k) => typeLabel(map, k)).join(', ');

export function dayCleanliness(days: DaysMap, dk: string, protocol: Protocol = DEFAULT_PROTOCOL): Cleanliness | null {
  const d = days[dk];
  if (!d) return null;
  const criteria: Criterion[] = [];

  // Triggers (hard — logging one can't be undone for the day). Empty selection
  // means "avoid all triggers"; a selection narrows it to those specific ones.
  if (protocol.triggers.enabled) {
    const triggers = (d.food && d.food.triggers) || {};
    const count = (k: string) => (triggers[k] > 0 ? triggers[k] : 0);
    const sel = protocol.triggers.types;
    const logged = (sel.length ? sel : Object.keys(triggers)).reduce((s, k) => s + count(k), 0);
    const label = sel.length ? `No ${joinLabels(TRIGGER_TYPES, sel)}` : 'No triggers';
    criteria.push({ key: 'triggers', label, pass: logged === 0, hard: true, broken: logged > 0 });
  }

  if (protocol.water.enabled) {
    const water = (d.food && d.food.water) || 0;
    criteria.push({ key: 'water', label: `Water (${protocol.water.liters} L)`, pass: water >= protocol.water.liters });
  }

  // Each required medication/activity is its own criterion (own checkmark).
  if (protocol.meds.enabled) {
    const meds = d.meds || [];
    protocol.meds.types.forEach((t) => {
      const label = typeLabel(MED_TYPES, t);
      criteria.push({ key: `meds:${t}`, label, pass: meds.some((m) => m.type === t) });
    });
  }

  if (protocol.activities.enabled) {
    const acts = d.activities || [];
    protocol.activities.types.forEach((t) => {
      const label = typeLabel(ACTIVITY_TYPES, t);
      criteria.push({ key: `activities:${t}`, label, pass: acts.some((a) => a.type === t) });
    });
  }

  if (protocol.sleep.enabled) {
    const hrs = sleepHours(days, dk);
    const sleepLogged = hrs != null;
    criteria.push({ key: 'sleep', label: `Sleep ${protocol.sleep.hours}h or more`, pass: sleepLogged && hrs! >= protocol.sleep.hours, hard: true, broken: sleepLogged && hrs! < protocol.sleep.hours });
  }

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

export function streakInfo(days: DaysMap, dk: string, protocol: Protocol = DEFAULT_PROTOCOL): StreakInfo {
  const today = todayKey();
  const cur = dayCleanliness(days, dk, protocol);
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
 */
export function metricHistory(days: DaysMap, type: string, extractor: (r: Entry) => number | null, limit = 15): { v: number; date: string }[] {
  const out: { v: number; date: string }[] = [];
  Object.keys(days).sort().forEach((dk) => {
    const list = (days[dk].readings || []).filter((r) => r.type === type);
    list.sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    list.forEach((r) => {
      const v = extractor(r);
      if (v != null && !isNaN(v)) out.push({ v, date: dk });
    });
  });
  return out.slice(-limit);
}

export const numEx = (key: string) => (rr: Entry): number | null => {
  const v = parseFloat(rr[key] as string);
  return isNaN(v) ? null : v;
};
