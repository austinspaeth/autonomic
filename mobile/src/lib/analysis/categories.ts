/**
 * Analysis categories → structured card data (no UI). The Analysis screen
 * renders these generically with LineChart / Bars / stat tiles. Simplified from
 * the PWA: a few good charts + stat tiles per category, grade-zone shaded.
 */
import type { Entry } from '../types';
import { SCORE_COLORS } from '../scoring';
import { scoreCat, scoreSet, sleepHours, streakInfo, streakTier, type DaysMap } from '../scoring/day';
import { ACTIVITY_TYPES, MED_TYPES, TRIGGER_TYPES } from '../registry';
import {
  BANDS, Mode, acBandZones, acBuckets, acMean, acPresent, acRangeLabel,
  acReadVals, acScoreZones, acToDec, acTotalPower, avgRound, isEvening, isMorning, makeAgg,
  type ScoreContext,
} from './buckets';
import type { Series, Zone } from '../../components/charts';

export interface Chart { label: string; series: Series[]; zones?: Zone[] | null; target?: { from: number; to: number; color: string }; integer?: boolean; legend?: [string, string][]; dumbbell?: { sys: (number | null)[]; dia: (number | null)[] } }
export interface Stat { label: string; value: number | string | null; sub?: string; color?: string }
export interface Insight { text: string; strength?: 'strong' | 'mod' | null }
export interface BarGroup { label: string; rows: { name: string; count: number; color?: string }[]; fmt?: (c: number) => string }
export interface AnalysisCard {
  title: string;
  sub?: string;
  /** One-line description shown under the section header (design-comp style). */
  desc?: string;
  /** Longer copy for the "?" help sheet next to the title. */
  help?: string;
  charts?: Chart[]; stats?: Stat[]; insights?: Insight[]; bars?: BarGroup[];
}
export interface Category { id: string; icon: string; title: string; desc: string; buckets: { label: string }[]; build: () => AnalysisCard[] }

export function buildCategories(days: DaysMap, mode: Mode, ctx: ScoreContext): Category[] {
  const buckets = acBuckets(days, mode);
  const { acDayScore, acAgg, acAggSum } = makeAgg(days, ctx);
  const range = acRangeLabel(mode);
  const nonEmpty = (cards: (AnalysisCard | null)[]) => cards.filter((c): c is AnalysisCard => !!c && !!((c.charts && c.charts.length) || (c.stats && c.stats.length) || (c.insights && c.insights.length) || (c.bars && c.bars.length)));

  const series = (vals: (number | null)[], color: string, label?: string, extra?: Partial<Series>): Series => ({ values: vals, color, label, ...extra });

  const outlook = (): AnalysisCard[] => {
    const vals = acAgg(buckets, (d, dk) => acDayScore(d, dk));
    if (!acPresent(vals).length) return [];
    const win = mode === 'day' ? 7 : 3;
    const roll = vals.map((_, i) => { const seg = acPresent(vals.slice(Math.max(0, i - win + 1), i + 1)); return seg.length ? seg.reduce((s, x) => s + x, 0) / seg.length : null; });
    const daily: { dk: string; sc: number }[] = [];
    buckets.forEach((b) => b.days.forEach((dk) => { const sc = acDayScore(days[dk], dk); if (sc != null) daily.push({ dk, sc }); }));
    const best = daily.reduce((a, b) => (b.sc > a.sc ? b : a), daily[0]);
    const worst = daily.reduce((a, b) => (b.sc < a.sc ? b : a), daily[0]);
    const avg = acMean(vals)!;
    const cards: AnalysisCard[] = [{
      title: 'Autonomic Outlook', sub: range,
      desc: 'Your daily autonomic score over the range, with a rolling average to smooth the noise.',
      help: 'Each day is scored 0–100 from everything you logged that day — HRV readings, vitals, symptoms and sleep — using the recovery framework\'s thresholds. The dashed line is a rolling average, which is usually the better trend to watch: single days swing, the rolling line tells the story.',
      charts: [{ label: 'Daily score', series: [series(vals, SCORE_COLORS.great, 'Score', { pointBands: null }), series(roll, '#9a9aa0', `${win}-pt avg`, { dashed: true })], zones: acScoreZones(), integer: true }],
      stats: [
        { label: 'Average', value: Math.round(avg), color: scoreCat(avg).color },
        best ? { label: `Best day · ${best.dk.slice(5)}`, value: best.sc, color: scoreCat(best.sc).color } : null,
        worst ? { label: `Worst day · ${worst.dk.slice(5)}`, value: worst.sc, color: scoreCat(worst.sc).color } : null,
      ].filter(Boolean) as Stat[],
    }];
    // correlations
    const corr = correlations(days, ctx);
    if (corr.length) cards.push({
      title: 'Correlation Insights',
      desc: 'Patterns between your habits and your autonomic score.',
      help: 'Pearson correlations between paired daily values (sleep vs next-morning RMSSD, water vs score, and so on), reported only with at least 14 days of overlap and |r| ≥ 0.3. Correlation is not causation — treat these as leads worth testing, not conclusions.',
      insights: corr,
    });
    return cards;
  };

  const heat = (): AnalysisCard | null => {
    const streak = streakInfo(days, new Date().toISOString().slice(0, 10));
    const tier = streakTier(streak.current);
    return {
      title: 'Clean Days',
      desc: 'Days in a row without breaking your protocol.',
      help: 'A "clean" day is one with no logged trigger foods. The streak counts consecutive clean days ending today; the 30-day rate shows what share of the last month stayed clean. Streaks build tolerance slowly — a broken streak is data, not failure.',
      stats: [
        { label: 'Current streak', value: streak.current, sub: 'days', color: SCORE_COLORS.great },
        { label: 'Longest', value: streak.longest, sub: 'days' },
        { label: '30-day clean', value: streak.rate, sub: streak.rate != null ? '%' : '' },
      ],
      insights: [{ text: `${tier.tier}. ${tier.msg}` }],
    };
  };

  const hrv = (): AnalysisCard[] => {
    const rmssdS = acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'rmssd'));
    const rmssdU = acAgg(buckets, (d) => acReadVals(d, 'hrv', 'rmssd'));
    const tp = acAgg(buckets, (d) => acTotalPower(d));
    if (!acPresent(rmssdS).length && !acPresent(rmssdU).length) return [];
    return [{
      title: 'HRV Readings', sub: range,
      charts: [
        { label: 'RMSSD (structured vs unstructured)', series: [series(rmssdS, '#4ade80', 'Structured'), series(rmssdU, '#38bdf8', 'Unstructured')], zones: acBandZones('rmssdS'), legend: [['Structured', '#4ade80'], ['Unstructured', '#38bdf8']] },
        { label: 'pNN50', series: [series(acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'pnn50')), '#4ade80')], zones: acBandZones('pnn50') },
        { label: 'Total power', series: [series(tp, '#a78bfa')], zones: acBandZones('totalPower'), integer: true },
        { label: 'LF peak frequency', series: [series(acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'lfPeak')), '#38bdf8')], zones: acBandZones('lfPeak'), target: { from: 0.08, to: 0.1, color: '#16a34a' } },
      ],
      stats: [
        { label: 'Avg RMSSD', value: avgRound(rmssdS) },
        { label: 'Avg total power', value: avgRound(tp) },
      ],
    }];
  };

  const vitals = (): AnalysisCard[] => {
    const sys = acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys'));
    const dia = acAgg(buckets, (d) => acReadVals(d, 'bp', 'dia'));
    const laying = acAgg(buckets, (d) => acReadVals(d, 'restingHr', 'hr', (r) => (r.position || '') === 'Laying'));
    const cards: AnalysisCard[] = [];
    if (acPresent(sys).length) cards.push({
      title: 'Blood Pressure', sub: range,
      desc: 'Each reading as a systolic-to-diastolic span, coloured by grade at each end.',
      help: 'Every bar connects a reading\'s diastolic (bottom) to its systolic (top), tinted by how each value grades against the framework thresholds. Watch for the spread as well as the level — a narrowing pulse pressure on standing is a common dysautonomia pattern worth showing your doctor.',
      charts: [
        // One connected systolic↕diastolic segment per reading, grade-gradient coloured.
        { label: 'Systolic / diastolic', series: [], dumbbell: { sys, dia } },
      ],
      stats: [{ label: 'Avg sys morning', value: avgRound(acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys', isMorning))) }, { label: 'Avg sys evening', value: avgRound(acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys', isEvening))) }],
    });
    if (acPresent(laying).length) cards.push({
      title: 'Resting Heart Rate', sub: range,
      desc: 'Laying heart rate over the range.',
      help: 'Heart rate measured while laying down — the cleanest resting baseline. A gradually falling laying HR usually accompanies improving autonomic recovery; a sustained unexplained rise is worth noting alongside symptoms and sleep.',
      charts: [{ label: 'Laying HR', series: [series(laying, SCORE_COLORS.bad)] }],
      stats: [{ label: 'Avg laying HR', value: avgRound(laying) }],
    });
    return cards;
  };

  const pots = (): AnalysisCard[] => {
    const incOf = (r: Entry) => { const a = parseFloat(r.afterHr as string), b = parseFloat(r.beforeHr as string); return !isNaN(a) && !isNaN(b) ? a - b : null; };
    const inc = acAgg(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic').map(incOf).filter((v): v is number => v != null));
    if (!acPresent(inc).length) return [];
    let potsN = 0;
    Object.keys(days).forEach((dk) => (days[dk].readings || []).forEach((r) => { if (r.type === 'orthostatic') { const v = incOf(r); if (v != null && v >= 30) potsN++; } }));
    return [{
      title: 'Orthostatic Events', sub: range,
      desc: 'How much your heart rate rises when you stand.',
      help: 'The heart-rate increase from resting to standing for each logged orthostatic event. A sustained rise of 30 bpm or more (40 in adolescents) within 10 minutes of standing is the adult POTS-range criterion — the zones shade that threshold. Trends matter more than any single stand.',
      charts: [{ label: 'HR increase on standing', series: [series(inc, '#f97316', undefined, { pointBands: BANDS.orthoIncrease })], zones: acBandZones('orthoIncrease'), integer: true }],
      insights: potsN ? [{ text: `${potsN} event${potsN === 1 ? '' : 's'} reached a ≥30 bpm standing rise (the adult POTS-range threshold).`, strength: 'mod' }] : [],
    }];
  };

  const sleep = (): AnalysisCard[] => {
    const dur = acAgg(buckets, (d, dk) => sleepHours(days, dk));
    if (!acPresent(dur).length) return [];
    return [{
      title: 'Sleep', sub: range,
      desc: 'How long you slept and when, night by night.',
      help: 'Duration is the night that ended that morning; the dashed band marks the 7–9 hour target. The timing chart plots bedtime and wake time on a 24-hour scale — consistency of timing often moves HRV as much as raw duration does.',
      charts: [
        { label: 'Duration (hours)', series: [series(dur, '#38bdf8')], target: { from: 7, to: 9, color: '#16a34a' } },
        { label: 'Bedtime vs wake (24h)', series: [series(acAgg(buckets, (d) => { const t = acToDec(d.sleep?.bed); return t == null ? null : t < 12 ? t + 24 : t; }), '#a78bfa', 'Bed'), series(acAgg(buckets, (d) => acToDec(d.sleep?.wake)), '#f97316', 'Wake')], legend: [['Bed', '#a78bfa'], ['Wake', '#f97316']] },
      ],
      stats: [{ label: 'Avg sleep', value: avgRound(dur, 1), sub: 'h' }],
    }];
  };

  const activity = (): AnalysisCard[] => {
    const mins = acAggSum(buckets, (d) => (d.activities || []).reduce((s, a) => s + (parseFloat(a.duration as string) || 0), 0) || null);
    const typeCounts: Record<string, number> = {};
    let activeDays = 0, restDays = 0;
    buckets.forEach((b) => b.days.forEach((dk) => { const acts = days[dk].activities || []; if (acts.length) { activeDays++; acts.forEach((a) => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; }); } else restDays++; }));
    const rows = Object.entries(typeCounts).map(([t, c]) => ({ name: ACTIVITY_TYPES[t]?.label || t, count: c })).sort((a, b) => b.count - a.count);
    if (!rows.length) return [];
    return [{
      title: 'Activity', sub: range,
      desc: 'Exercise minutes over the range and what kinds of sessions they were.',
      help: 'Total logged exercise minutes per bucket, plus a breakdown of session types and the balance of active versus rest days. In autonomic recovery, consistency at a tolerable dose beats intensity — watch how your score and symptoms respond in the day or two after harder sessions.',
      charts: [{ label: 'Total exercise minutes', series: [series(mins, SCORE_COLORS.bad)], integer: true }],
      bars: [{ label: 'Activity types', rows }],
      stats: [{ label: 'Active days', value: activeDays || null }, { label: 'Rest days', value: restDays || null }],
    }];
  };

  const triggers = (): AnalysisCard[] => {
    const water = acAgg(buckets, (d) => (d.food && +d.food.water > 0 ? +d.food.water : null));
    const trig: Record<string, number> = {};
    buckets.forEach((b) => b.days.forEach((dk) => { const f = days[dk].food; if (!f) return; Object.keys(f.triggers || {}).forEach((k) => { if (f.triggers[k] > 0 && TRIGGER_TYPES[k]) trig[k] = (trig[k] || 0) + f.triggers[k]; }); }));
    const trigRows = Object.entries(trig).map(([k, c]) => ({ name: TRIGGER_TYPES[k].label, count: c })).sort((a, b) => b.count - a.count);
    if (!acPresent(water).length && !trigRows.length) return [];
    const cards: AnalysisCard[] = [];
    if (trigRows.length) cards.push({
      title: 'Triggers',
      desc: 'How often each trigger food showed up in this range.',
      help: 'Counts of every logged trigger (histamine foods, caffeine, alcohol and the rest). Pair this with the Outlook correlations: if a trigger keeps landing before bad days, that\'s a pattern worth testing with an elimination window.',
      bars: [{ label: 'All triggers', rows: trigRows }],
    });
    if (acPresent(water).length) cards.push({
      title: 'Hydration', sub: range,
      desc: 'Daily water intake against the target band.',
      help: 'Litres of water per day; the dashed band marks the 2.5–3.5 L range commonly recommended alongside electrolytes for orthostatic conditions. Fluid only holds where salt allows — if you chase volume, discuss electrolyte targets with your doctor.',
      charts: [{ label: 'Water (L/day)', series: [series(water, '#38bdf8')], target: { from: 2.5, to: 3.5, color: '#16a34a' } }],
      stats: [{ label: 'Avg water', value: avgRound(water, 1), sub: 'L' }],
    });
    return cards;
  };

  const supps = (): AnalysisCard[] => {
    const counts: Record<string, number> = {}; let anyMeds = false;
    buckets.forEach((b) => b.days.forEach((dk) => { const meds = days[dk].meds || []; if (meds.length) anyMeds = true; new Set(meds.map((m) => m.type)).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); }));
    if (!anyMeds) return [];
    const rows = Object.entries(counts).map(([t, c]) => ({ name: MED_TYPES[t]?.label || t, count: c })).sort((a, b) => b.count - a.count);
    return [{
      title: 'Medications & Supplements',
      desc: 'How many days each was taken in this range.',
      help: 'Days-taken counts for every medication and supplement you logged. Consistent daily bars make it easy to spot missed stretches — and to line adherence up against score changes when you and your doctor adjust the protocol.',
      bars: [{ label: '', rows, fmt: (c) => `${c} d` }],
    }];
  };

  const bl = buckets.map((b) => ({ label: b.label }));
  return [
    { id: 'outlook', icon: 'gauge', title: 'Outlook', desc: 'Recovery score & trends', buckets: bl, build: () => nonEmpty([...outlook(), heat()]) },
    { id: 'hrv', icon: 'heartPulse', title: 'HRV', desc: 'Heart-rate variability', buckets: bl, build: () => nonEmpty(hrv()) },
    { id: 'vitals', icon: 'heart', title: 'Vitals', desc: 'Blood pressure & heart rate', buckets: bl, build: () => nonEmpty(vitals()) },
    { id: 'pots', icon: 'standing', title: 'POTS', desc: 'Orthostatic events', buckets: bl, build: () => nonEmpty(pots()) },
    { id: 'sleep', icon: 'moon', title: 'Sleep', desc: 'Duration & timing', buckets: bl, build: () => nonEmpty(sleep()) },
    { id: 'activity', icon: 'bike', title: 'Activity', desc: 'Workouts & exercise', buckets: bl, build: () => nonEmpty(activity()) },
    { id: 'triggers', icon: 'triangle', title: 'Triggers', desc: 'Triggers & hydration', buckets: bl, build: () => nonEmpty(triggers()) },
    { id: 'supps', icon: 'pill', title: 'Supplements', desc: 'Meds & supplements', buckets: bl, build: () => nonEmpty(supps()) },
  ];
}

/* ---------- correlations (ported acCorrelations, simplified) ---------- */
function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length; if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  pairs.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; });
  const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

function correlations(days: DaysMap, ctx: ScoreContext): Insight[] {
  const rows = Object.keys(days).sort().map((dk) => {
    const d = days[dk];
    const avg = (type: string, key: string, filt?: (r: Entry) => boolean) => { const v = acReadVals(d, type, key, filt); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    return {
      score: scoreSet(d.readings || [], d, dk, days, ctx).score as number | null,
      mornRmssd: avg('breathHrv', 'rmssd', isMorning),
      restHr: avg('restingHr', 'hr', (r) => (r.position || '') === 'Laying'),
      sleepH: sleepHours(days, dk) as number | null,
      water: d.food && +d.food.water > 0 ? +d.food.water : null,
      triggers: d.food && d.food.triggers ? Object.values(d.food.triggers).reduce((s, c) => s + (c > 0 ? c : 0), 0) : 0,
      actMin: (d.activities || []).reduce((s, a) => s + (parseFloat(a.duration as string) || 0), 0) || null,
    };
  });
  const dir = (r: number) => (r > 0 ? 'higher' : 'lower');
  const defs: { x: string; y: string; txt: (r: number, n: number) => string }[] = [
    { x: 'sleepH', y: 'mornRmssd', txt: (r, n) => `On nights you slept longer, next-morning structured RMSSD ran ${dir(r)} (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'sleepH', y: 'score', txt: (r, n) => `More sleep tracked with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'water', y: 'score', txt: (r, n) => `Days you drank more water showed a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'triggers', y: 'score', txt: (r, n) => `More trigger foods correlated with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'restHr', y: 'score', txt: (r, n) => `Higher morning lying HR went with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'actMin', y: 'score', txt: (r, n) => `More activity minutes tracked with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
  ];
  const found: Insight[] = [];
  defs.forEach((def) => {
    const pairs: [number, number][] = [];
    rows.forEach((r) => { const x = (r as never as Record<string, number | null>)[def.x], y = (r as never as Record<string, number | null>)[def.y]; if (x != null && !isNaN(x) && y != null && !isNaN(y)) pairs.push([x, y]); });
    const rr = pearson(pairs);
    if (rr != null && pairs.length >= 14 && Math.abs(rr) >= 0.3) found.push({ text: def.txt(rr, pairs.length), strength: Math.abs(rr) >= 0.6 ? 'strong' : Math.abs(rr) >= 0.45 ? 'mod' : null });
  });
  return found.slice(0, 8);
}
