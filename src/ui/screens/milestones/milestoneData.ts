// milestoneData — pure port of the legacy milestone engine (docs/index.html):
//   acMilestoneDays (5671), msFirst/msConsec/msRollAvg/msNoneIn/msWindowCount/
//   msCleanRate/msFullRecovery (5722-5748), buildMilestoneGroups (5750-5886),
//   plus the acIllnessEpisodes (5567) recovery-phase prepend.
//
// All numeric thresholds / criteria are kept verbatim from the legacy app. The
// per-day metric map is computed over repo.allDays() + profile. Two legacy
// helpers were not present in @core so they are inlined faithfully here:
//   - sleepHours: the ported @core sleepHours(day) reads the SAME day's bed/wake;
//     the legacy version pulls the PREVIOUS day's bed time, which milestones rely
//     on, so sleepHoursFor() reproduces the legacy prev-day logic.
//   - dayCleanliness.clean: not ported to @core, so cleanFor() inlines the same
//     clean-day criteria (no triggers, water >= 2.5, dinner by 5pm, required meds,
//     sleep >= 7h) used by docs/index.html:2171.

import type { Day, DateKey, Profile } from '@core/types';
import { keyOf, dateFromKey } from '@core/date/dateUtils';
import { scoreSet } from '@core/scoring/scoreSet';

export interface MilestoneItem {
  label: string;
  done: boolean;
  date: DateKey | null;
  value: number | string | null;
}
export interface MilestoneGroup {
  title: string;
  items: MilestoneItem[];
}

// ---- low-level value extraction (acReadVals / acTotalPower / isMorning) ----
function acReadVals(d: Day, type: string, key: string, filt?: (r: any) => boolean): number[] {
  const out: number[] = [];
  (d.readings || []).forEach((r: any) => {
    if (r.type !== type) return;
    if (filt && !filt(r)) return;
    const v = parseFloat(r[key]);
    if (!isNaN(v)) out.push(v);
  });
  return out;
}
function acTotalPower(d: Day): number[] {
  return (d.readings || [])
    .filter((r: any) => r.type === 'breathHrv')
    .map((r: any) => {
      const p = ['vlowPower', 'lowPower', 'highPower'].map((k) => parseFloat(r[k]));
      return p.every((x) => !isNaN(x)) ? p[0] + p[1] + p[2] : null;
    })
    .filter((v): v is number => v != null);
}
const acMinOf = (t: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
const isMorning = (r: any): boolean => {
  const mo = acMinOf(r.time);
  if (mo != null) return mo < 720;
  return (r.period || '') === 'Morning';
};

// Legacy sleepHours: previous day's bed + this day's wake.
function sleepHoursFor(days: Record<DateKey, Day>, dk: DateKey): number | null {
  const d = days[dk];
  const wake = d && d.sleep ? d.sleep.wake : '';
  const pd = dateFromKey(dk);
  pd.setDate(pd.getDate() - 1);
  const prev = days[keyOf(pd)];
  const bed = prev && prev.sleep ? prev.sleep.bed : '';
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins < 0) mins += 1440;
  return mins / 60;
}

// Legacy dayCleanliness().clean — inlined (see header note).
function cleanFor(days: Record<DateKey, Day>, dk: DateKey): boolean | null {
  const d = days[dk];
  if (!d) return null;
  const meds = d.meds || [];
  const hasMed = (t: string) => meds.some((m: any) => m.type === t);
  const triggers = (d.food && d.food.triggers) || {};
  const trigCount = Object.keys(triggers).reduce(
    (s, k) => s + ((triggers as any)[k] > 0 ? (triggers as any)[k] : 0),
    0,
  );
  const water = (d.food && d.food.water) || 0;
  const hrs = sleepHoursFor(days, dk);
  const sleepLogged = hrs != null;
  const medReq = ['allegra', 'pepsidAc', 'magGlycinate'];
  const missingMeds = medReq.filter((t) => !hasMed(t));
  const dinners = ((d.food && d.food.meals) || []).filter(
    (m: any) => m.type === 'dinner' && m.time,
  );
  const criteria = [
    { pass: trigCount === 0, pending: false },
    { pass: water >= 2.5, pending: false },
    { pass: dinners.some((m: any) => m.time <= '17:00'), pending: dinners.length === 0 },
    { pass: missingMeds.length === 0, pending: false },
    { pass: sleepLogged && (hrs as number) >= 7, pending: false },
  ];
  return criteria.filter((c) => !c.pending).every((c) => c.pass);
}

// ---- the per-day metric record (acMilestoneDays, 5671) ----
interface MDay {
  dk: DateKey;
  rmssd: number | null;
  pnn50: number | null;
  totalPower: number | null;
  lfPeak: number | null;
  vlf: number | null;
  restHrLay: number | null;
  walkHr: number | null;
  hr60: number | null;
  orthoDelta: number | null;
  hasOrtho: boolean;
  severeOrtho: boolean;
  highBpEvent: boolean;
  bpGood: boolean | null;
  sleepH: number | null;
  sleepGood: boolean;
  sleepLow: number | null;
  bm: number;
  score: number | null;
  clean: boolean;
  hfDom: boolean;
  hfDomMorning: boolean;
  symptomFree: boolean;
  bikeEasy: boolean;
  bikeInterval: boolean;
  core: boolean;
  upper: boolean;
  sessions: number;
  sys: number | null;
  dia: number | null;
  medsSet: Set<string>;
  dinnerBy5: boolean;
  waterGood: boolean;
}
export interface MilestoneDays {
  map: Record<DateKey, MDay>;
  keys: DateKey[];
}

export function buildMilestoneDays(
  days: Record<DateKey, Day>,
  profile: Profile,
): MilestoneDays {
  const keys = Object.keys(days).sort();
  const map: Record<DateKey, MDay> = {};
  keys.forEach((dk) => {
    const d = days[dk];
    const rd = d.readings || [];
    const acts: any[] = d.activities || [];
    const syms: any[] = d.symptoms || [];
    const maxOf = (t: string, k: string, f?: (r: any) => boolean) => {
      const v = acReadVals(d, t, k, f);
      return v.length ? Math.max(...v) : null;
    };
    const minOf = (t: string, k: string, f?: (r: any) => boolean) => {
      const v = acReadVals(d, t, k, f);
      return v.length ? Math.min(...v) : null;
    };
    const rmCand = [maxOf('breathHrv', 'rmssd'), maxOf('hrv', 'rmssd')].filter(
      (v): v is number => v != null,
    );
    const walkHr = acts
      .filter((a) => a.type === 'walk')
      .map((a) => parseFloat(a.avgHr))
      .filter((v) => !isNaN(v));
    const hr60 = acts.map((a) => parseFloat(a.hr60)).filter((v) => !isNaN(v));
    const ortho = (rd as any[])
      .filter((r) => r.type === 'orthostatic')
      .map((r) => {
        const a = parseFloat(r.afterHr),
          b = parseFloat(r.beforeHr);
        return !isNaN(a) && !isNaN(b) ? a - b : null;
      })
      .filter((v): v is number => v != null);
    const tp = acTotalPower(d);
    const bps = (rd as any[]).filter((r) => r.type === 'bp');
    const dinners = ((d.food && d.food.meals) || []).filter(
      (m: any) => m.type === 'dinner' && m.time,
    );
    const medsSet = new Set((d.meds || []).map((m: any) => m.type));
    const sleepH = sleepHoursFor(days, dk);
    const sysVals = acReadVals(d, 'bp', 'sys');
    const diaVals = acReadVals(d, 'bp', 'dia');
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
      severeOrtho:
        (ortho.length > 0 && Math.min(...ortho) >= 30) ||
        syms.some((s) => s.type === 'labileHr'),
      highBpEvent:
        syms.some((s) => s.type === 'highBp') ||
        bps.some((r) => parseFloat(r.sys) >= 140),
      bpGood: bps.length
        ? bps.every((r) => parseFloat(r.sys) < 130 && parseFloat(r.dia) < 85)
        : null,
      sleepH,
      sleepGood: sleepH != null && !(d.sleep && d.sleep.quality === 'interrupted'),
      sleepLow: d.sleep && d.sleep.hrLow != null ? parseFloat(d.sleep.hrLow) : null,
      bm: d.digestion && d.digestion.movements ? d.digestion.movements.length : 0,
      score: scoreSet(d.readings || [], d, profile).score,
      clean: cleanFor(days, dk) || false,
      hfDom: (rd as any[]).some(
        (r) => r.type === 'hrv' && parseFloat(r.highPower) > parseFloat(r.lowPower),
      ),
      hfDomMorning: (rd as any[]).some(
        (r) =>
          r.type === 'hrv' &&
          isMorning(r) &&
          parseFloat(r.highPower) > parseFloat(r.lowPower),
      ),
      symptomFree: syms.length === 0,
      bikeEasy: acts.some((a) => a.type === 'indoorBike' && !a.interval),
      bikeInterval: acts.some((a) => a.type === 'indoorBike' && a.interval),
      core: acts.some((a) => a.type === 'coreWorkout'),
      upper: acts.some((a) => a.type === 'upperBody'),
      sessions: acts.length,
      sys: sysVals.length ? sysVals.reduce((s, x) => s + x, 0) / sysVals.length : null,
      dia: diaVals.length ? diaVals.reduce((s, x) => s + x, 0) / diaVals.length : null,
      medsSet,
      dinnerBy5: dinners.some((m: any) => m.time <= '17:00'),
      waterGood: (d.food && +d.food.water >= 2.5) || false,
    };
  });
  return { map, keys };
}

// ---- milestone primitives (5722-5748) ----
const msFirst = (md: MilestoneDays, fn: (d: MDay) => boolean): DateKey | null => {
  for (const dk of md.keys) if (fn(md.map[dk])) return dk;
  return null;
};
function msConsec(md: MilestoneDays, fn: (d: MDay) => boolean, N: number): DateKey | null {
  if (!md.keys.length) return null;
  const start = dateFromKey(md.keys[0]),
    end = dateFromKey(md.keys[md.keys.length - 1]);
  let run = 0;
  for (let cd = new Date(start); cd <= end; cd.setDate(cd.getDate() + 1)) {
    const day = md.map[keyOf(cd)];
    if (day && fn(day)) {
      run++;
      if (run >= N) return keyOf(cd);
    } else run = 0;
  }
  return null;
}
function msRollAvg(
  md: MilestoneDays,
  valFn: (d: MDay) => number | null | undefined,
  window: number,
  thr: number,
  dir: 'up' | 'down',
): DateKey | null {
  for (const dk of md.keys) {
    const end = dateFromKey(dk),
      vals: number[] = [];
    for (let i = 0; i < window; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const day = md.map[keyOf(d)];
      if (day) {
        const v = valFn(day);
        if (v != null && !isNaN(v)) vals.push(v);
      }
    }
    if (vals.length >= Math.ceil(window * 0.5)) {
      const a = vals.reduce((s, x) => s + x, 0) / vals.length;
      if (dir === 'down' ? a <= thr : a >= thr) return dk;
    }
  }
  return null;
}
function msNoneIn(
  md: MilestoneDays,
  window: number,
  badFn: (d: MDay) => boolean,
  minPts?: number,
): DateKey | null {
  for (const dk of md.keys) {
    const end = dateFromKey(dk);
    let pts = 0,
      bad = false;
    for (let i = 0; i < window; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const day = md.map[keyOf(d)];
      if (day) {
        pts++;
        if (badFn(day)) {
          bad = true;
          break;
        }
      }
    }
    if (!bad && pts >= (minPts || Math.ceil(window * 0.6))) return dk;
  }
  return null;
}
function msWindowCount(
  md: MilestoneDays,
  window: number,
  fn: (d: MDay) => number,
  thr: number,
): DateKey | null {
  for (const dk of md.keys) {
    const end = dateFromKey(dk);
    let c = 0;
    for (let i = 0; i < window; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const day = md.map[keyOf(d)];
      if (day) c += fn(day) || 0;
    }
    if (c >= thr) return dk;
  }
  return null;
}
function msCleanRate(md: MilestoneDays, pct: number): DateKey | null {
  for (const dk of md.keys) {
    const end = dateFromKey(dk);
    let c = 0,
      t = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const day = md.map[keyOf(d)];
      if (day) {
        t++;
        if (day.clean) c++;
      }
    }
    if (t >= 15 && (c / t) * 100 >= pct) return dk;
  }
  return null;
}
function msFullRecovery(md: MilestoneDays): DateKey | null {
  for (const dk of md.keys) {
    const end = dateFromKey(dk);
    const rs: number[] = [];
    let crash = false,
      cleanN = 0,
      tot = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const day = md.map[keyOf(d)];
      if (day) {
        tot++;
        if (day.clean) cleanN++;
        if (day.rmssd != null) rs.push(day.rmssd);
        if (day.score != null && day.score < 25) crash = true;
      }
    }
    if (tot >= 20 && rs.length >= 10) {
      const avg = rs.reduce((s, x) => s + x, 0) / rs.length;
      if (avg >= 30 && !crash && (cleanN / tot) * 100 >= 80) return dk;
    }
  }
  return null;
}

// ---- illness episodes (5567) for the Recovery-phase prepend ----
const acDayDiff = (a: DateKey, b: DateKey): number =>
  Math.round((dateFromKey(b).getTime() - dateFromKey(a).getTime()) / 86400000);

function acIllnessEpisodes(
  days: Record<DateKey, Day>,
): { start: DateKey; end: DateKey }[] {
  const sick = Object.keys(days)
    .filter((dk) => (days[dk].symptoms || []).some((s: any) => s.type === 'sick'))
    .sort();
  if (!sick.length) return [];
  const eps: { start: DateKey; end: DateKey }[] = [];
  let start = sick[0],
    prev = sick[0];
  for (let i = 1; i < sick.length; i++) {
    if (acDayDiff(prev, sick[i]) <= 2) prev = sick[i];
    else {
      eps.push({ start, end: prev });
      start = sick[i];
      prev = sick[i];
    }
  }
  eps.push({ start, end: prev });
  return eps;
}

// ---- buildMilestoneGroups (5750-5886), verbatim defs ----
type MetricVal = DateKey | null | { date: DateKey; value: number | null };
type ItemDef = [string, () => MetricVal];

export function buildMilestoneGroups(
  md: MilestoneDays,
  days: Record<DateKey, Day>,
): MilestoneGroup[] {
  const first = (p: (d: MDay) => boolean) => () => msFirst(md, p);
  const consec = (p: (d: MDay) => boolean, n: number) => () => msConsec(md, p, n);
  // Like `first`, but also surfaces the metric value on the achievement day.
  const firstV =
    (key: keyof MDay, p: (d: MDay) => boolean) =>
    (): MetricVal => {
      const dk = msFirst(md, p);
      return dk ? { date: dk, value: md.map[dk][key] as number | null } : null;
    };

  const defs: [string, ItemDef[]][] = [
    ['HRV · RMSSD', [
      ['First RMSSD 25+ (recovery threshold)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 25)],
      ['First RMSSD 30+ (baseline recovery)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 30)],
      ['First RMSSD 35+ (pre-illness territory)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 35)],
      ['First RMSSD 40+ (exceptional)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 40)],
      ['First RMSSD 50+ (elite)', firstV('rmssd', (d) => d.rmssd != null && d.rmssd >= 50)],
      ['3 consecutive days RMSSD 30+', consec((d) => d.rmssd != null && d.rmssd >= 30, 3)],
      ['7 consecutive days RMSSD 30+', consec((d) => d.rmssd != null && d.rmssd >= 30, 7)],
      ['30-day average RMSSD 30+', () => msRollAvg(md, (d) => d.rmssd, 30, 30, 'up')],
    ]],
    ['HRV · pNN50', [
      ['First pNN50 7%+', firstV('pnn50', (d) => d.pnn50 != null && d.pnn50 >= 7)],
      ['First pNN50 10%+', firstV('pnn50', (d) => d.pnn50 != null && d.pnn50 >= 10)],
      ['First pNN50 15%+', firstV('pnn50', (d) => d.pnn50 != null && d.pnn50 >= 15)],
      ['7 consecutive days pNN50 7%+', consec((d) => d.pnn50 != null && d.pnn50 >= 7, 7)],
      ['30-day average pNN50 7%+', () => msRollAvg(md, (d) => d.pnn50, 30, 7, 'up')],
    ]],
    ['HRV · Power', [
      ['First Total Power 2500+', firstV('totalPower', (d) => d.totalPower != null && d.totalPower >= 2500)],
      ['First Total Power 3500+', firstV('totalPower', (d) => d.totalPower != null && d.totalPower >= 3500)],
      ['First Total Power 5000+', firstV('totalPower', (d) => d.totalPower != null && d.totalPower >= 5000)],
      ['7 consecutive days Total Power 3000+', consec((d) => d.totalPower != null && d.totalPower >= 3000, 7)],
      ['First VLF under 300 (low stress)', firstV('vlf', (d) => d.vlf != null && d.vlf < 300)],
      ['First VLF under 200 (excellent)', firstV('vlf', (d) => d.vlf != null && d.vlf < 200)],
      ['7-day average VLF under 400', () => msRollAvg(md, (d) => d.vlf, 7, 400, 'down')],
    ]],
    ['HRV · LF peak frequency', [
      ['First LF peak at 0.075 Hz', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.075)],
      ['First LF peak at 0.082 Hz', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.082)],
      ['First LF peak at 0.090 Hz (target entry)', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.09)],
      ['First LF peak at 0.100 Hz (optimal)', firstV('lfPeak', (d) => d.lfPeak != null && d.lfPeak >= 0.1)],
      ['3 consecutive readings in target zone', consec((d) => d.lfPeak != null && d.lfPeak >= 0.08 && d.lfPeak <= 0.1, 3)],
      ['30-day average LF peak 0.080+', () => msRollAvg(md, (d) => d.lfPeak, 30, 0.08, 'up')],
    ]],
    ['HRV · HF dominance', [
      ['First HF-dominant unstructured reading', first((d) => d.hfDom)],
      ['3 consecutive HF-dominant mornings', consec((d) => d.hfDomMorning, 3)],
      ['7 consecutive HF-dominant mornings', consec((d) => d.hfDomMorning, 7)],
    ]],
    ['Heart rate', [
      ['First resting lying HR 65 or below', firstV('restHrLay', (d) => d.restHrLay != null && d.restHrLay <= 65)],
      ['First resting lying HR 60 or below', firstV('restHrLay', (d) => d.restHrLay != null && d.restHrLay <= 60)],
      ['First resting lying HR 55 or below', firstV('restHrLay', (d) => d.restHrLay != null && d.restHrLay <= 55)],
      ['7-day average lying HR 65 or below', () => msRollAvg(md, (d) => d.restHrLay, 7, 65, 'down')],
      ['First walking HR in 80s', firstV('walkHr', (d) => d.walkHr != null && d.walkHr < 90)],
      ['First walking HR in 70s', firstV('walkHr', (d) => d.walkHr != null && d.walkHr < 80)],
      ['First walking HR in 60s', firstV('walkHr', (d) => d.walkHr != null && d.walkHr < 70)],
    ]],
    ['Orthostatic & recovery', [
      ['First standing HR delta under 30 bpm', firstV('orthoDelta', (d) => d.orthoDelta != null && d.orthoDelta < 30)],
      ['First standing HR delta under 20 bpm', firstV('orthoDelta', (d) => d.orthoDelta != null && d.orthoDelta < 20)],
      ['7 consecutive days no severe orthostatic event', consec((d) => !d.severeOrtho, 7)],
      ['First 1-min recovery HR under 90', firstV('hr60', (d) => d.hr60 != null && d.hr60 < 90)],
      ['First 1-min recovery HR under 80', firstV('hr60', (d) => d.hr60 != null && d.hr60 < 80)],
      ['First 1-min recovery HR under 75', firstV('hr60', (d) => d.hr60 != null && d.hr60 < 75)],
      ['First 1-min recovery HR under 70', firstV('hr60', (d) => d.hr60 != null && d.hr60 < 70)],
    ]],
    ['Blood pressure', [
      ['7 consecutive days BP under 130/85', consec((d) => d.bpGood === true, 7)],
      ['No high-BP events in 30 days', () => msNoneIn(md, 30, (d) => d.highBpEvent)],
      ['30-day average BP 110–120 / 70–80', () => {
        for (const dk of md.keys) {
          const end = dateFromKey(dk),
            vs: number[] = [],
            vd: number[] = [];
          for (let i = 0; i < 30; i++) {
            const dd = new Date(end);
            dd.setDate(end.getDate() - i);
            const day = md.map[keyOf(dd)];
            if (day) {
              if (day.sys != null) vs.push(day.sys);
              if (day.dia != null) vd.push(day.dia);
            }
          }
          if (vs.length >= 10) {
            const as = vs.reduce((s, x) => s + x, 0) / vs.length,
              ad = vd.length ? vd.reduce((s, x) => s + x, 0) / vd.length : null;
            if (as >= 110 && as <= 120 && (ad == null || (ad >= 70 && ad <= 80))) return dk;
          }
        }
        return null;
      }],
    ]],
    ['Sleep', [
      ['First 8+ hour night', firstV('sleepH', (d) => d.sleepH != null && d.sleepH >= 8)],
      ['7 consecutive 7+ hour nights', consec((d) => d.sleepH != null && d.sleepH >= 7, 7)],
      ['30-day average 7+ hours', () => msRollAvg(md, (d) => d.sleepH, 30, 7, 'up')],
      ['First uninterrupted night', first((d) => d.sleepGood)],
      ['7 consecutive non-disrupted nights', consec((d) => d.sleepGood, 7)],
      ['Sleep low HR under 55', firstV('sleepLow', (d) => d.sleepLow != null && d.sleepLow < 55)],
    ]],
    ['Exercise', [
      ['First easy bike session', first((d) => d.bikeEasy)],
      ['First interval bike session', first((d) => d.bikeInterval)],
      ['First Session A core completed', first((d) => d.core)],
      ['First Session B upper body completed', first((d) => d.upper)],
      ['First week with 3+ exercise sessions', () => msWindowCount(md, 7, (d) => d.sessions, 3)],
      ['First month with 12+ sessions', () => msWindowCount(md, 30, (d) => d.sessions, 12)],
    ]],
    ['Clean days', [
      ['3 consecutive clean days', () => msConsec(md, (d) => d.clean, 3)],
      ['7 consecutive clean days (first week)', () => msConsec(md, (d) => d.clean, 7)],
      ['14 consecutive clean days', () => msConsec(md, (d) => d.clean, 14)],
      ['21 consecutive clean days', () => msConsec(md, (d) => d.clean, 21)],
      ['30 consecutive clean days', () => msConsec(md, (d) => d.clean, 30)],
      ['60 consecutive clean days', () => msConsec(md, (d) => d.clean, 60)],
      ['90 consecutive clean days', () => msConsec(md, (d) => d.clean, 90)],
      ['50% clean days in a month', () => msCleanRate(md, 50)],
      ['70% clean days in a month', () => msCleanRate(md, 70)],
      ['85% clean days in a month', () => msCleanRate(md, 85)],
      ['90%+ clean days in a month', () => msCleanRate(md, 90)],
    ]],
    ['Autonomic score', [
      ['First Autonomic Score 70+', firstV('score', (d) => d.score != null && d.score >= 70)],
      ['First Autonomic Score 80+', firstV('score', (d) => d.score != null && d.score >= 80)],
      ['First Autonomic Score 90+', firstV('score', (d) => d.score != null && d.score >= 90)],
      ['7-day average score 70+', () => msRollAvg(md, (d) => d.score, 7, 70, 'up')],
      ['30-day average score 70+', () => msRollAvg(md, (d) => d.score, 30, 70, 'up')],
      ['7 consecutive Good-or-Great days', consec((d) => d.score != null && d.score >= 70, 7)],
      ['Month without any Bad days', () => msNoneIn(md, 30, (d) => d.score != null && d.score < 40)],
      ['Month without any Crash days', () => msNoneIn(md, 30, (d) => d.score != null && d.score < 25)],
    ]],
    ['Gut & symptoms', [
      ['7 consecutive days with a bowel movement', consec((d) => d.bm >= 1, 7)],
      ['7 days no orthostatic events', consec((d) => !d.hasOrtho, 7)],
      ['7 days symptom-free', consec((d) => d.symptomFree, 7)],
    ]],
    ['Protocol adherence', [
      ['30 days never missing Allegra', consec((d) => d.medsSet.has('allegra'), 30)],
      ['30 days never missing Pepcid', consec((d) => d.medsSet.has('pepsidAc'), 30)],
      ['30 days never missing magnesium', consec((d) => d.medsSet.has('magGlycinate') || d.medsSet.has('magCitrate'), 30)],
      ['90 days full medication adherence', consec((d) => d.medsSet.has('allegra') && d.medsSet.has('pepsidAc') && d.medsSet.has('magGlycinate'), 90)],
      ['30 days dinner before 5pm every day', consec((d) => d.dinnerBy5, 30)],
      ['30 days hydration target hit daily', consec((d) => d.waterGood, 30)],
    ]],
    ['Composite recovery', [
      ['7 consecutive days: RMSSD 27+, lying HR <70, walk <85, no symptoms', consec((d) => d.rmssd != null && d.rmssd >= 27 && (d.restHrLay == null || d.restHrLay < 70) && (d.walkHr == null || d.walkHr < 85) && d.symptomFree, 7)],
      ['Full recovery: 30 days RMSSD 30+ avg, no crash, 80%+ clean', () => msFullRecovery(md)],
    ]],
  ];

  // Recovery-phase time milestones, only if illness logged.
  const eps = acIllnessEpisodes(days);
  if (eps.length) {
    const ep = eps[eps.length - 1],
      sinceEnd = acDayDiff(ep.end, keyOf(new Date()));
    const dateAt = (n: number): DateKey | null => {
      const d = dateFromKey(ep.end);
      d.setDate(d.getDate() + n);
      return sinceEnd >= n ? keyOf(d) : null;
    };
    defs.unshift(['Recovery phase', [
      ['30 days post major illness', () => dateAt(30)],
      ['60 days post major illness', () => dateAt(60)],
      ['90 days post major illness', () => dateAt(90)],
    ]]);
  }

  return defs.map(([title, items]) => ({
    title,
    items: items.map(([label, fn]) => {
      const res = fn();
      const date = res && typeof res === 'object' ? res.date : (res as DateKey | null);
      const value = res && typeof res === 'object' ? res.value : null;
      return { label, done: !!date, date, value };
    }),
  }));
}
