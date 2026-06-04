// Weighted Autonomic Score + grade helpers.
// Ported verbatim from legacy docs/index.html:
//   sleepGrade   (~2037-2047)
//   activityGrade(~2050-2056)
//   scoreSet     (~2062-2138)
//   blueZone     (~2141-2147)
//   sleepHours   (~2156-2166)
//
// Decouplings from the legacy globals (state.days lookups removed):
//   - sleepGrade(day: Day) / sleepHours(day: Day): take the Day object instead
//     of a date key. Legacy sleepHours read the *previous* day's bedtime
//     (state.days[dk-1].sleep.bed) plus this day's wake; with only one Day in
//     hand both bed and wake are read from `day.sleep`. The cross-day prior-day
//     bedtime lookup is intentionally dropped.
//   - scoreSet(readings, day, profile): uses `day` for sleep/activity and
//     threads `profile` through to computeScores (was a global). The legacy
//     `dk` param is no longer needed (sleep now reads from `day`).
//   - blueZone(readings, profile): gains a `profile` param so it can call
//     computeScores (which now requires profile); was a global in legacy.
//
// ecgPattern (legacy ~3178) is inlined as a local pure helper (single line,
// used only to label the ECG component) to keep this module self-contained.

import type { Day, Profile, Reading, ScoreCategory } from '@core/types';
import { computeScores } from '@core/scoring/computeScores';
import { totalPower } from '@core/scoring/scorers';
import { GRADE_PTS, numOr } from '@core/scoring/colors';
import { BANDS, restingHrBands } from '@core/scoring/bands';
import { ACTIVITY_TYPES } from '@core/domain/activityTypes';

type ScoreMap = Partial<Record<string, ScoreCategory>>;

const ecgPattern = (r: Reading): string =>
  r.svt ? 'SVT' : r.otherArrhythmia ? 'Other' : r.sinus ? 'Sinus' : '-';

export function sleepGrade(day: Day): ScoreCategory | null {
  const dur = sleepHours(day);
  if (dur == null) return null;
  const good = !(day && day.sleep && day.sleep.quality === 'interrupted');
  if (dur >= 8 && good) return 'great';
  if (dur >= 7) return good ? 'good' : 'ok';
  if (dur >= 6) return good ? 'ok' : 'bad';
  if (dur >= 5) return 'bad';
  return 'crash';
}

// Behaviour grade from logged activity load (lightly weighted).
export function activityGrade(acts: Reading[] | undefined): ScoreCategory | null {
  if (!acts || !acts.length) return null;
  const heavy = acts.filter((a) =>
    ['stressfulWork', 'upperBody', 'coreWorkout', 'indoorBike', 'carWash'].includes(a.type)
  );
  if (acts.some((a) => a.type === 'strenuousWork') || heavy.length >= 3) return 'bad';
  if (heavy.length === 2) return 'ok';
  return 'good';
}

export interface ScoreComp {
  w: number;
  p: number;
  label: string;
  detail: unknown;
}

export interface ScoreResult {
  score: number | null;
  confidence: number;
  hasStruct: boolean;
  hasUnstruct: boolean;
  comps: ScoreComp[];
}

// Weighted Autonomic Score from a subset of readings + the day record.
// Missing components drop out and the weight is redistributed (confidence).
// The latest reading of each type is used (so an evening reading drives
// reflectance); structured HRV outranks unstructured (70/30) when both exist.
export function scoreSet(readings: Reading[], day: Day, profile: Profile): ScoreResult {
  const last = <T>(a: T[]): T => a[a.length - 1];
  const pts = (cat: ScoreCategory | null | undefined): number | null =>
    cat ? GRADE_PTS[cat] : null;
  const structured = readings.filter((r) => r.type === 'breathHrv');
  const unstructured = readings.filter((r) => r.type === 'hrv');
  const sStruct: ScoreMap | null = structured.length ? computeScores(last(structured), profile) : null;
  const sUn: ScoreMap | null = unstructured.length ? computeScores(last(unstructured), profile) : null;

  let hrvPts: number | null = null;
  if (sStruct && sStruct.rmssd && sUn && sUn.rmssd)
    hrvPts = 0.7 * pts(sStruct.rmssd)! + 0.3 * pts(sUn.rmssd)!;
  else if (sStruct && sStruct.rmssd) hrvPts = pts(sStruct.rmssd);
  else if (sUn && sUn.rmssd) hrvPts = pts(sUn.rmssd);

  const bp = last(readings.filter((r) => r.type === 'bp'));
  const bpPts = bp ? pts(computeScores(bp, profile).bp) : null;

  const rhr = last(readings.filter((r) => r.type === 'restingHr'));
  let rhrPts = rhr ? pts(computeScores(rhr, profile).hr) : null;
  if (rhrPts == null && sStruct) rhrPts = pts(sStruct.hr);
  if (rhrPts == null && sUn) rhrPts = pts(sUn.avgHr);

  const ecg = last(readings.filter((r) => r.type === 'ecg'));
  const ecgPts = ecg
    ? pts(computeScores(ecg, profile).rhythm || computeScores(ecg, profile).overall)
    : null;

  // ---- Per-component detail (raw values + bands) for the score-explain drawer ----
  const bs = last(structured), bu = last(unstructured);
  const nv = (x: unknown): number | null => { const v = parseFloat(x as string); return isNaN(v) ? null : v; };
  const rmS = bs ? nv(bs.rmssd) : null, rmU = bu ? nv(bu.rmssd) : null;
  const hrvMetrics: unknown[] = [];
  if (rmS != null) hrvMetrics.push({ label: 'RMSSD (structured)', raw: rmS, bands: BANDS.rmssdS, unit: 'ms' });
  if (rmU != null) hrvMetrics.push({ label: 'RMSSD (unstructured)', raw: rmU, bands: BANDS.rmssdU, unit: 'ms' });
  const hrvDetail = { value: (rmS != null && rmU != null) ? `${rmS}/${rmU} ms` : (rmS != null ? `${rmS} ms` : rmU != null ? `${rmU} ms` : ''), metrics: hrvMetrics };

  const tpV = bs ? totalPower(bs) : null, tpR = tpV != null ? Math.round(tpV) : null;
  const tpDetail = { value: tpR != null ? `${tpR} ms²` : '', metrics: tpR != null ? [{ label: 'Total power', raw: tpR, bands: BANDS.totalPower, unit: 'ms²' }] : [] };
  const pnV = bs ? nv(bs.pnn50) : null;
  const pnDetail = { value: pnV != null ? `${pnV}%` : '', metrics: pnV != null ? [{ label: 'pNN50', raw: pnV, bands: BANDS.pnn50, unit: '%' }] : [] };
  const vlfV = bs ? nv(bs.vlowPower) : null;
  const vlfDetail = { value: vlfV != null ? `${vlfV} ms²` : '', metrics: vlfV != null ? [{ label: 'VLF power', raw: vlfV, bands: BANDS.vlf, unit: 'ms²', lowerBetter: true }] : [] };
  const lfV = bs ? nv(bs.lfPeak) : null;
  const lfDetail = { value: lfV != null ? `${lfV} Hz` : '', metrics: lfV != null ? [{ label: 'LF peak', raw: lfV, bands: BANDS.lfPeak, unit: 'Hz' }] : [] };

  const sysV = bp ? nv(bp.sys) : null, diaV = bp ? nv(bp.dia) : null;
  const bpDetail = { value: bp ? `${sysV != null ? sysV : '-'}/${diaV != null ? diaV : '-'} mmHg` : '', metrics: [sysV != null ? { label: 'Systolic', raw: sysV, bands: BANDS.sys, unit: 'mmHg' } : null, diaV != null ? { label: 'Diastolic', raw: diaV, bands: BANDS.dia, unit: 'mmHg' } : null].filter(Boolean) };

  let rhrV: number | null = null, rhrBands = null as ReturnType<typeof restingHrBands> | null, rhrLabel = 'Resting HR';
  if (rhr) { rhrV = nv(rhr.hr); rhrBands = restingHrBands(rhr.position as string | undefined); if (rhr.position) rhrLabel = `Resting HR (${rhr.position})`; }
  else if (bs) { rhrV = nv(bs.hr); rhrBands = BANDS.hrBreath; rhrLabel = 'HR (from breathing HRV)'; }
  else if (bu) { rhrV = nv(bu.avgHr); rhrBands = BANDS.hrBreath; rhrLabel = 'Avg HR (from HRV)'; }
  const rhrDetail = { value: rhrV != null ? `${rhrV} bpm` : '', metrics: rhrV != null ? [{ label: rhrLabel, raw: rhrV, bands: rhrBands, unit: 'bpm', lowerBetter: true }] : [] };

  const slH = sleepHours(day), slInt = !!(day && day.sleep && day.sleep.quality === 'interrupted');
  const sleepDetail = { value: slH != null ? `${slH.toFixed(1)} h${slInt ? ', interrupted' : ''}` : 'not logged', metrics: [], note: 'Targets 7h or more for a good grade; 8h+ and uninterrupted scores best. An earlier, consistent bedtime is usually the single biggest lever.' };

  const rhy = ecg ? ecgPattern(ecg) : null;
  const ecgDetail = { value: rhy || '', metrics: [], note: 'Looking for normal sinus rhythm. SVT or other irregularities lower this and are worth flagging to your clinician; reducing stimulants and stress helps in the meantime.' };

  const actList = (day.activities || []).map((a) => (ACTIVITY_TYPES[a.type] && ACTIVITY_TYPES[a.type].label) || a.type);
  const actDetail = { value: actList.length ? actList.join(', ') : 'none logged', metrics: [], maxCat: 'good', note: 'Graded on pacing, not volume: a gentle or normal day scores good (the ceiling here); two heavy sessions drop it to ok, and strenuous work or three or more heavy sessions to bad. Match activity to today\'s capacity to avoid a later setback.' };

  const comps = ([
    { w: 25, p: hrvPts, label: 'HRV (RMSSD)', detail: hrvDetail },
    { w: 15, p: sStruct ? pts(sStruct.totalPower) : null, label: 'Total power', detail: tpDetail },
    { w: 10, p: sStruct ? pts(sStruct.pnn50) : null, label: 'pNN50', detail: pnDetail },
    { w: 10, p: sStruct ? pts(sStruct.vlf) : null, label: 'VLF power', detail: vlfDetail },
    { w: 10, p: sStruct ? pts(sStruct.lfPeak) : null, label: 'LF peak', detail: lfDetail },
    { w: 8, p: bpPts, label: 'Blood pressure', detail: bpDetail },
    { w: 7, p: rhrPts, label: 'Resting HR', detail: rhrDetail },
    { w: 8, p: pts(sleepGrade(day)), label: 'Sleep', detail: sleepDetail },
    { w: 5, p: ecgPts, label: 'ECG rhythm', detail: ecgDetail },
    { w: 2, p: pts(activityGrade(day.activities)), label: 'Activity', detail: actDetail },
  ] as { w: number; p: number | null; label: string; detail: unknown }[]).filter(
    (c): c is ScoreComp => c.p != null
  );
  if (!comps.length) return { score: null, confidence: 0, hasStruct: !!sStruct, hasUnstruct: !!unstructured.length, comps: [] };
  const avail = comps.reduce((s, c) => s + c.w, 0);
  const sum = comps.reduce((s, c) => s + c.p * c.w, 0);
  return { score: Math.round(sum / avail), confidence: Math.round(avail), hasStruct: !!sStruct, hasUnstruct: !!unstructured.length, comps };
}

// Blue-zone flag: high unstructured readiness masking a fragile structured RMSSD.
// `profile` is threaded through to computeScores (was a global in legacy).
export function blueZone(readings: Reading[], profile: Profile): boolean {
  const u = readings.find((r) => r.type === 'hrv' && numOr(r.readiness) != null);
  const s = readings.find((r) => r.type === 'breathHrv');
  if (!u || !s) return false;
  const rmssd = computeScores(s, profile).rmssd;
  return numOr(u.readiness)! >= 90 && ['ok', 'bad', 'crash'].includes(rmssd as string);
}

// Hours slept for the night recorded on this day. Legacy used the *previous*
// day's bedtime; here both endpoints come from `day.sleep` (see decoupling note).
// The wake time is taken as the first clock occurrence at or after the bedtime,
// so a late AM bedtime yields a short night. Returns null when either endpoint
// is missing - no defaults.
export function sleepHours(day: Day): number | null {
  const wake = day && day.sleep ? day.sleep.wake : '';
  const bed = day && day.sleep ? day.sleep.bed : '';
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm); if (mins < 0) mins += 1440;
  return mins / 60;
}
