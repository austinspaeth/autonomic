/**
 * Milestones — ported from the PWA's acMilestoneDays + buildMilestoneGroups.
 * Produces per-day derived metrics then evaluates first/consecutive/rolling
 * achievement predicates into grouped, dated milestone rows.
 */
import { addDays, dateFromKey, keyOf, todayKey } from '../dates';
import type { DayRecord, Entry } from '../types';
import { type ScoreContext } from '../scoring';
import { dayCleanliness, scoreSet, sleepHours, type DaysMap } from '../scoring/day';


export interface MDay {
  dk: string;
  rmssd: number | null; pnn50: number | null; totalPower: number | null; lfPeak: number | null; vlf: number | null;
  restHrLay: number | null; walkHr: number | null; hr60: number | null; orthoDelta: number | null;
  hasOrtho: boolean; severeOrtho: boolean; highBpEvent: boolean; bpGood: boolean | null;
  sleepH: number | null; sleepGood: boolean; sleepLow: number | null; bm: number; score: number | null; clean: boolean;
  hfDom: boolean; hfDomMorning: boolean; symptomFree: boolean; bikeEasy: boolean; bikeInterval: boolean;
  core: boolean; upper: boolean; sessions: number; sys: number | null; dia: number | null;
  medsSet: Set<string>; waterGood: boolean;
  hasHrv: boolean; loggedDay: boolean;
}

/** Labels of the "Getting started" onboarding milestones — the journal card's
 *  "Up first" checklist keys its tap actions off these. */
export const STARTERS = {
  hrv: 'Capture your first HRV reading',
  fullDay: 'Log a full day of entries',
  protocol: 'Set up your daily protocol',
} as const;

export interface MilestoneItem { label: string; done: boolean; date: string | null; value: number | string | null }
export interface MilestoneGroup { title: string; items: MilestoneItem[] }

export function buildMilestoneDays(days: DaysMap, ctx: ScoreContext): { map: Record<string, MDay>; keys: string[] } {
  const keys = Object.keys(days).sort();
  const map: Record<string, MDay> = {};
  const readVals = (d: DayRecord, type: string, key: string, filt?: (r: Entry) => boolean) => {
    const out: number[] = [];
    (d.readings || []).forEach((r) => { if (r.type !== type) return; if (filt && !filt(r)) return; const v = parseFloat(r[key] as string); if (!isNaN(v)) out.push(v); });
    return out;
  };
  const isMorning = (r: Entry) => { const m = /^(\d{1,2}):(\d{2})/.exec((r.time as string) || ''); const mo = m ? +m[1] * 60 + +m[2] : null; if (mo != null) return mo < 720; return (r.period || '') === 'Morning'; };
  keys.forEach((dk) => {
    const d = days[dk];
    const rd = d.readings || [], acts = d.activities || [], syms = d.symptoms || [];
    const maxOf = (t: string, k: string, f?: (r: Entry) => boolean) => { const v = readVals(d, t, k, f); return v.length ? Math.max(...v) : null; };
    const minOf = (t: string, k: string, f?: (r: Entry) => boolean) => { const v = readVals(d, t, k, f); return v.length ? Math.min(...v) : null; };
    const rmCand = [maxOf('breathHrv', 'rmssd'), maxOf('hrv', 'rmssd')].filter((v): v is number => v != null);
    const walkHr = acts.filter((a) => a.type === 'walk').map((a) => parseFloat(a.avgHr as string)).filter((v) => !isNaN(v));
    const hr60 = acts.map((a) => parseFloat(a.hr60 as string)).filter((v) => !isNaN(v));
    const ortho = rd.filter((r) => r.type === 'orthostatic').map((r) => { const a = parseFloat(r.afterHr as string), b = parseFloat(r.beforeHr as string); return !isNaN(a) && !isNaN(b) ? a - b : null; }).filter((v): v is number => v != null);
    const tp = readVals(d, 'breathHrv', 'vlowPower').map((_, i) => { const r = rd.filter((x) => x.type === 'breathHrv')[i]; const p = ['vlowPower', 'lowPower', 'highPower'].map((k) => parseFloat(r[k] as string)); return p.every((x) => !isNaN(x)) ? p[0] + p[1] + p[2] : null; }).filter((v): v is number => v != null);
    const bps = rd.filter((r) => r.type === 'bp');
    const cln = dayCleanliness(days, dk, ctx.protocol, ctx.customTypes);
    const bpAvg = (k: string) => { const v = readVals(d, 'bp', k); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    map[dk] = {
      dk,
      rmssd: rmCand.length ? Math.max(...rmCand) : null,
      pnn50: maxOf('breathHrv', 'pnn50'),
      totalPower: tp.length ? Math.max(...tp) : null,
      lfPeak: maxOf('breathHrv', 'lfPeak'),
      vlf: minOf('breathHrv', 'vlowPower'),
      restHrLay: minOf('restingHr', 'hr', (r) => (r.position || '') === 'Laying'),
      walkHr: walkHr.length ? Math.min(...walkHr) : null,
      hr60: hr60.length ? Math.min(...hr60) : null,
      orthoDelta: ortho.length ? Math.min(...ortho) : null,
      hasOrtho: ortho.length > 0 || syms.some((s) => s.type === 'labileHr'),
      severeOrtho: (ortho.length > 0 && Math.min(...ortho) >= 30) || syms.some((s) => s.type === 'labileHr'),
      highBpEvent: syms.some((s) => s.type === 'highBp') || bps.some((r) => parseFloat(r.sys as string) >= 140),
      bpGood: bps.length ? bps.every((r) => parseFloat(r.sys as string) < 130 && parseFloat(r.dia as string) < 85) : null,
      sleepH: sleepHours(days, dk),
      sleepGood: (() => { const h = sleepHours(days, dk); return h != null && !(d.sleep && d.sleep.quality === 'interrupted'); })(),
      sleepLow: d.sleep && d.sleep.hrLow != null ? parseFloat(String(d.sleep.hrLow)) : null,
      bm: d.digestion && d.digestion.movements ? d.digestion.movements.length : 0,
      score: scoreSet(rd, d, dk, days, ctx).score,
      clean: cln ? cln.clean : false,
      hfDom: rd.some((r) => r.type === 'hrv' && parseFloat(r.highPower as string) > parseFloat(r.lowPower as string)),
      hfDomMorning: rd.some((r) => r.type === 'hrv' && isMorning(r) && parseFloat(r.highPower as string) > parseFloat(r.lowPower as string)),
      symptomFree: syms.length === 0,
      bikeEasy: acts.some((a) => a.type === 'indoorBike' && !a.interval),
      bikeInterval: acts.some((a) => a.type === 'indoorBike' && a.interval),
      core: acts.some((a) => a.type === 'coreWorkout'),
      upper: acts.some((a) => a.type === 'strength'),
      sessions: acts.length,
      sys: bpAvg('sys'), dia: bpAvg('dia'),
      medsSet: new Set((d.meds || []).map((m) => m.type)),
      waterGood: (d.food && +d.food.water >= 2.5) || false,
      hasHrv: rd.some((r) => r.type === 'hrv' || r.type === 'breathHrv'),
      loggedDay: (d.food && +d.food.water > 0) || (d.meds || []).length > 0 || syms.length > 0 || acts.length > 0,
    };
  });
  return { map, keys };
}

type MD = { map: Record<string, MDay>; keys: string[] };
const msFirst = (md: MD, fn: (d: MDay) => boolean) => { for (const dk of md.keys) if (fn(md.map[dk])) return dk; return null; };
function msConsec(md: MD, fn: (d: MDay) => boolean, N: number) {
  if (!md.keys.length) return null;
  const start = dateFromKey(md.keys[0]), end = dateFromKey(md.keys[md.keys.length - 1]); let run = 0;
  for (let cd = new Date(start); cd <= end; cd.setDate(cd.getDate() + 1)) { const day = md.map[keyOf(cd)]; if (day && fn(day)) { run++; if (run >= N) return keyOf(cd); } else run = 0; }
  return null;
}
function msRollAvg(md: MD, valFn: (d: MDay) => number | null, window: number, thr: number, dir: 'up' | 'down') {
  for (const dk of md.keys) { const end = dateFromKey(dk), vals: number[] = []; for (let i = 0; i < window; i++) { const dd = new Date(end); dd.setDate(end.getDate() - i); const day = md.map[keyOf(dd)]; if (day) { const v = valFn(day); if (v != null && !isNaN(v)) vals.push(v); } } if (vals.length >= Math.ceil(window * 0.5)) { const a = vals.reduce((s, x) => s + x, 0) / vals.length; if (dir === 'down' ? a <= thr : a >= thr) return dk; } }
  return null;
}
function msNoneIn(md: MD, window: number, badFn: (d: MDay) => boolean, minPts?: number) {
  for (const dk of md.keys) { const end = dateFromKey(dk); let pts = 0, bad = false; for (let i = 0; i < window; i++) { const dd = new Date(end); dd.setDate(end.getDate() - i); const day = md.map[keyOf(dd)]; if (day) { pts++; if (badFn(day)) { bad = true; break; } } } if (!bad && pts >= (minPts || Math.ceil(window * 0.6))) return dk; }
  return null;
}
function msWindowCount(md: MD, window: number, fn: (d: MDay) => number, thr: number) {
  for (const dk of md.keys) { const end = dateFromKey(dk); let c = 0; for (let i = 0; i < window; i++) { const dd = new Date(end); dd.setDate(end.getDate() - i); const day = md.map[keyOf(dd)]; if (day) c += fn(day) || 0; } if (c >= thr) return dk; }
  return null;
}
function msCleanRate(md: MD, pct: number) {
  for (const dk of md.keys) { const end = dateFromKey(dk); let c = 0, t = 0; for (let i = 0; i < 30; i++) { const dd = new Date(end); dd.setDate(end.getDate() - i); const day = md.map[keyOf(dd)]; if (day) { t++; if (day.clean) c++; } } if (t >= 15 && (c / t) * 100 >= pct) return dk; }
  return null;
}

export function buildMilestoneGroups(md: MD, extras?: { protocolSetOn?: string | null }): MilestoneGroup[] {
  const first = (p: (d: MDay) => boolean) => () => msFirst(md, p);
  const consec = (p: (d: MDay) => boolean, n: number) => () => msConsec(md, p, n);
  const firstV = (key: keyof MDay, p: (d: MDay) => boolean) => () => { const dk = msFirst(md, p); return dk ? { date: dk, value: md.map[dk][key] as number } : null; };
  type Res = string | null | { date: string; value: number };
  const today = todayKey();
  const defs: [string, [string, () => Res][]][] = [
    ['Getting started', [
      [STARTERS.hrv, first((d) => d.hasHrv)],
      // A "full day" can only be judged once the day is over: the first past
      // day with core logging completes this the morning after.
      [STARTERS.fullDay, () => { const dk = msFirst(md, (d) => d.loggedDay && d.dk < today); return dk ? addDays(dk, 1) : null; }],
      [STARTERS.protocol, () => extras?.protocolSetOn || null],
    ]],
    ['HRV · RMSSD', [
      ['First RMSSD 25+ (recovery threshold)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 25)],
      ['First RMSSD 30+ (baseline recovery)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 30)],
      ['First RMSSD 35+ (pre-illness territory)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 35)],
      ['First RMSSD 40+ (exceptional)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 40)],
      ['3 consecutive days RMSSD 30+', consec((d) => d.rmssd != null && d.rmssd >= 30, 3)],
      ['7 consecutive days RMSSD 30+', consec((d) => d.rmssd != null && d.rmssd >= 30, 7)],
      ['30-day average RMSSD 30+', () => msRollAvg(md, (d) => d.rmssd, 30, 30, 'up')],
    ]],
    ['HRV · pNN50', [
      ['First pNN50 7%+', firstV('pnn50', (d) => d.pnn50 != null && d.pnn50 >= 7)],
      ['First pNN50 10%+', firstV('pnn50', (d) => d.pnn50 != null && d.pnn50 >= 10)],
      ['7 consecutive days pNN50 7%+', consec((d) => d.pnn50 != null && d.pnn50 >= 7, 7)],
    ]],
    ['HRV · Power', [
      ['First Total Power 2500+', firstV('totalPower', (d) => d.totalPower != null && d.totalPower >= 2500)],
      ['First Total Power 3500+', firstV('totalPower', (d) => d.totalPower != null && d.totalPower >= 3500)],
      ['First VLF under 300 (low stress)', firstV('vlf', (d) => d.vlf != null && d.vlf < 300)],
      ['7-day average VLF under 400', () => msRollAvg(md, (d) => d.vlf, 7, 400, 'down')],
    ]],
    ['HRV · LF peak frequency', [
      ['First LF peak at 0.082 Hz', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.082)],
      ['First LF peak at 0.090 Hz (target entry)', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.09)],
      ['First LF peak at 0.100 Hz (optimal)', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.1)],
      ['30-day average LF peak 0.080+', () => msRollAvg(md, (d) => d.lfPeak, 30, 0.08, 'up')],
    ]],
    ['Heart rate', [
      ['First resting lying HR 65 or below', firstV('restHrLay', (d) => d.restHrLay != null && d.restHrLay <= 65)],
      ['First resting lying HR 60 or below', firstV('restHrLay', (d) => d.restHrLay != null && d.restHrLay <= 60)],
      ['7-day average lying HR 65 or below', () => msRollAvg(md, (d) => d.restHrLay, 7, 65, 'down')],
      ['First walking HR in 70s', firstV('walkHr', (d) => d.walkHr != null && d.walkHr < 80)],
    ]],
    ['Orthostatic & recovery', [
      ['First standing HR delta under 30 bpm', firstV('orthoDelta', (d) => d.orthoDelta != null && d.orthoDelta < 30)],
      ['First standing HR delta under 20 bpm', firstV('orthoDelta', (d) => d.orthoDelta != null && d.orthoDelta < 20)],
      ['7 consecutive days no severe orthostatic event', consec((d) => !d.severeOrtho, 7)],
      ['First 1-min recovery HR under 80', firstV('hr60', (d) => d.hr60 != null && d.hr60 < 80)],
    ]],
    ['Blood pressure', [
      ['7 consecutive days BP under 130/85', consec((d) => d.bpGood === true, 7)],
      ['No high-BP events in 30 days', () => msNoneIn(md, 30, (d) => d.highBpEvent)],
    ]],
    ['Sleep', [
      ['First 8+ hour night', firstV('sleepH', (d) => d.sleepH != null && d.sleepH >= 8)],
      ['7 consecutive 7+ hour nights', consec((d) => d.sleepH != null && d.sleepH >= 7, 7)],
      ['30-day average 7+ hours', () => msRollAvg(md, (d) => d.sleepH, 30, 7, 'up')],
      ['7 consecutive non-disrupted nights', consec((d) => d.sleepGood, 7)],
    ]],
    ['Exercise', [
      ['First easy bike session', first((d) => d.bikeEasy)],
      ['First interval bike session', first((d) => d.bikeInterval)],
      ['First Session A core completed', first((d) => d.core)],
      ['First week with 3+ exercise sessions', () => msWindowCount(md, 7, (d) => d.sessions, 3)],
    ]],
    ['Clean days', [
      ['3 consecutive clean days', () => msConsec(md, (d) => d.clean, 3)],
      ['7 consecutive clean days (first week)', () => msConsec(md, (d) => d.clean, 7)],
      ['14 consecutive clean days', () => msConsec(md, (d) => d.clean, 14)],
      ['30 consecutive clean days', () => msConsec(md, (d) => d.clean, 30)],
      ['70% clean days in a month', () => msCleanRate(md, 70)],
      ['90%+ clean days in a month', () => msCleanRate(md, 90)],
    ]],
    ['Autonomic score', [
      ['First Autonomic Score 70+', firstV('score', (d) => d.score != null && d.score >= 70)],
      ['First Autonomic Score 80+', firstV('score', (d) => d.score != null && d.score >= 80)],
      ['First Autonomic Score 90+', firstV('score', (d) => d.score != null && d.score >= 90)],
      ['7-day average score 70+', () => msRollAvg(md, (d) => d.score, 7, 70, 'up')],
      ['Month without any Crash days', () => msNoneIn(md, 30, (d) => d.score != null && d.score < 25)],
    ]],
    ['Gut & symptoms', [
      ['7 consecutive days with a bowel movement', consec((d) => d.bm >= 1, 7)],
      ['7 days symptom-free', consec((d) => d.symptomFree, 7)],
    ]],
    ['Protocol adherence', [
      ['30 days never missing Allegra', consec((d) => d.medsSet.has('allegra'), 30)],
      ['30 days never missing magnesium', consec((d) => d.medsSet.has('magGlycinate') || d.medsSet.has('magCitrate'), 30)],
      ['30 days hydration target hit daily', consec((d) => d.waterGood, 30)],
    ]],
  ];
  return defs.map(([title, items]) => ({
    title,
    items: items.map(([label, fn]) => {
      const res = fn();
      const date = res && typeof res === 'object' ? res.date : (res as string | null);
      const value = res && typeof res === 'object' ? res.value : null;
      return { label, done: !!date, date, value };
    }),
  }));
}
