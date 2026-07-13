/**
 * Analysis categories → structured card data (no UI). The Analysis screen
 * renders these generically with LineChart / Bars / stat tiles. Simplified from
 * the PWA: a few good charts + stat tiles per category, grade-zone shaded.
 */
import type { Band, Entry, ScoreCat } from '../types';
import { todayKey } from '../dates';
import { SCORE_COLORS, restingHrBands, sBP, worstCat } from '../scoring';
import { scoreCat, sleepHours, streakInfo, type DaysMap } from '../scoring/day';
import { ACTIVITY_TYPES, MED_TYPES, TRIGGER_TYPES } from '../registry';
import {
  BANDS, Mode, acBandZones, acBandsToZones, acBuckets, acMean, acPresent, acRangeLabel,
  acReadVals, acScoreZones, acTotalPower, avgRound, catFromBands, isEvening, isMorning, makeAgg,
  type ScoreContext,
} from './buckets';
import type { Series, Zone } from '../../components/charts';

export interface Chart { label: string; series: Series[]; zones?: Zone[] | null; target?: { from: number; to: number; color: string }; integer?: boolean; legend?: [string, string][]; dumbbell?: { sys: (number | null)[]; dia: (number | null)[] };
  /** Hide the chart's own readout and instead drive the card's first stat:
   *  average by default, the dragged bucket's value with its date on select. */
  selectStat?: boolean; }
/** Which readings a blood-pressure card is filtered to. */
export type BpPeriod = 'all' | 'morning' | 'evening';
export interface BpSeries { sys: (number | null)[]; dia: (number | null)[]; cat?: ScoreCat | null }
/** Which transition an Orthostatic Events card is filtered to. */
export type OrthoTransition = 'all' | 'lay' | 'sit' | 'stairs';
/** One transition-filter variant of the Orthostatic Events card: the view swaps
 *  charts/stats/insights/grade wholesale when the filter changes. `counts` is
 *  events per bucket, so a selected chart point can report that day's count. */
export interface OrthoVariant { cat: ScoreCat | null; charts: Chart[]; stats: Stat[]; insights: Insight[]; counts: (number | null)[] }
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
  /** Render stats as darker rounded tiles (squircles) instead of a flat row. */
  tiles?: boolean;
  /** Blood-pressure period variants. When set, the card shows an
   *  All/Morning/Evening link toggle that swaps the dumbbell + avg stats. */
  bpFilter?: Record<BpPeriod, BpSeries>;
  /** Orthostatic-event transition variants. When set, the card shows an
   *  All/Lay/Sit/Stairs link toggle that swaps charts, stats and the grade. */
  orthoFilter?: Record<OrthoTransition, OrthoVariant>;
  /** Grade dot beside the title, like the HRV Progress sections. Cards with
   *  several graded values (e.g. BP's systolic + diastolic) take the worst. */
  cat?: ScoreCat | null;
  /** Bands for re-grading the dot when a `selectStat` chart is dragged. */
  catBands?: Band[] | null;
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
    const mdy = (dk: string) => `${+dk.slice(5, 7)}/${+dk.slice(8, 10)}`; // "2026-07-30" → "7/30"
    const cards: AnalysisCard[] = [{
      title: 'Autonomic Outlook', sub: range,
      desc: 'Your daily autonomic score over the range, with a rolling average to smooth the noise.',
      help: 'Each day is scored 0–100 from everything you logged that day (HRV readings, vitals, symptoms and sleep) using the recovery framework\'s thresholds. The dashed line is a rolling average, which is usually the better trend to watch: single days swing, the rolling line tells the story.',
      charts: [{ label: 'Daily score', series: [series(vals, SCORE_COLORS.great, 'Score', { pointBands: null }), series(roll, '#9a9aa0', `${win}-pt avg`, { dashed: true })], zones: acScoreZones(), integer: true }],
      tiles: true,
      stats: [
        { label: 'Average', value: Math.round(avg), color: scoreCat(avg).color },
        best ? { label: `Best · ${mdy(best.dk)}`, value: best.sc, color: scoreCat(best.sc).color } : null,
        worst ? { label: `Worst · ${mdy(worst.dk)}`, value: worst.sc, color: scoreCat(worst.sc).color } : null,
      ].filter(Boolean) as Stat[],
    }];
    return cards;
  };

  const heat = (): AnalysisCard | null => {
    const streak = streakInfo(days, todayKey(), ctx.protocol, ctx.customTypes);
    return {
      title: 'Clean Days',
      desc: 'Days in a row without breaking your protocol.',
      help: 'A "clean" day is one that meets your protocol. The streak counts consecutive clean days ending today; the 30-day rate shows what share of the last month stayed clean. Streaks build tolerance slowly; a broken streak is data, not failure.',
      tiles: true,
      stats: [
        { label: 'Current streak', value: streak.current, sub: 'days', color: SCORE_COLORS.great },
        { label: 'Longest', value: streak.longest, sub: 'days' },
        { label: '30-day clean', value: streak.rate, sub: streak.rate != null ? '%' : '' },
      ],
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
    // Systolic/diastolic per bucket, sliced by time of day so the card's
    // All/Morning/Evening toggle can swap which readings it draws.
    const bpSpan = (f?: (r: Entry) => boolean): BpSeries => {
      const sys = acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys', f));
      const dia = acAgg(buckets, (d) => acReadVals(d, 'bp', 'dia', f));
      // Grade dot for the period: the worse of the systolic/diastolic averages.
      return { sys, dia, cat: sBP(avgRound(sys), avgRound(dia)) };
    };
    const bpFilter: Record<BpPeriod, BpSeries> = { all: bpSpan(), morning: bpSpan(isMorning), evening: bpSpan(isEvening) };
    const { sys, dia } = bpFilter.all;
    const laying = acAgg(buckets, (d) => acReadVals(d, 'restingHr', 'hr', (r) => (r.position || '') === 'Laying'));
    const cards: AnalysisCard[] = [];
    if (acPresent(sys).length) cards.push({
      title: 'Blood Pressure', sub: range,
      cat: bpFilter.all.cat,
      desc: 'Each reading as a systolic-to-diastolic span, coloured by grade at each end.',
      help: 'Every bar connects a reading\'s diastolic (bottom) to its systolic (top), tinted by how each value grades against the framework thresholds. Watch for the spread as well as the level; a narrowing pulse pressure on standing is a common dysautonomia pattern worth showing your doctor. The All/Morning/Evening toggle limits the chart to readings from that time of day.',
      tiles: true,
      charts: [
        // One connected systolic↕diastolic segment per reading, grade-gradient coloured.
        { label: '', series: [], dumbbell: { sys, dia } },
      ],
      stats: [
        { label: 'Avg systolic', value: avgRound(sys) },
        { label: 'Avg diastolic', value: avgRound(dia) },
      ],
      bpFilter,
    });
    const layingAvg = acMean(laying);
    if (acPresent(laying).length) cards.push({
      title: 'Resting Heart Rate', sub: range,
      cat: layingAvg != null ? catFromBands(layingAvg, restingHrBands('Laying')) : null,
      catBands: restingHrBands('Laying'),
      desc: 'Laying heart rate over the range.',
      help: 'Heart rate measured while laying down, the cleanest resting baseline. A gradually falling laying HR usually accompanies improving autonomic recovery; a sustained unexplained rise is worth noting alongside symptoms and sleep.',
      charts: [{ label: '', series: [series(laying, SCORE_COLORS.bad)], zones: acBandsToZones(restingHrBands('Laying')), integer: true, selectStat: true }],
      stats: [{ label: 'Avg laying HR', value: avgRound(laying) }],
    });
    return cards;
  };

  /** The controlled watch stand test: same protocol every time, so tests are
   *  directly comparable test to test. This is the "is my physiology actually
   *  improving" card; everyday events answer "is daily life getting easier". */
  const standTest = (): AnalysisCard[] => {
    const num = (v: unknown) => { const n = parseFloat(v as string); return isNaN(n) ? null : n; };
    const sus = acAgg(buckets, (d) => acReadVals(d, 'standTest', 'sustainedDelta'));
    const peak = acAgg(buckets, (d) => acReadVals(d, 'standTest', 'peakDelta'));
    const base = acAgg(buckets, (d) => acReadVals(d, 'standTest', 'baselineHr'));
    if (!acPresent(sus).length && !acPresent(peak).length) return [];
    // Every test in range, oldest → newest (bucket days are already sorted).
    const tests: { dk: string; r: Entry }[] = [];
    buckets.forEach((b) => b.days.forEach((dk) => (days[dk].readings || []).forEach((r) => { if (r.type === 'standTest') tests.push({ dk, r }); })));
    const susSeq = tests.map((t) => num(t.r.sustainedDelta)).filter((v): v is number => v != null);
    // Grade dot follows the latest test, not the range average: this is a
    // progress card, and a bad month shouldn't drag on a recovered one.
    const latestSus = susSeq.length ? susSeq[susSeq.length - 1] : null;
    const latestCat = latestSus != null ? catFromBands(latestSus, BANDS.standDelta) : null;
    const met = tests.filter((t) => t.r.metThreshold === true).length;
    const insights: Insight[] = [];
    if (susSeq.length >= 2) {
      const d = Math.round(susSeq[susSeq.length - 1] - susSeq[0]);
      if (Math.abs(d) >= 3) insights.push({
        text: d < 0
          ? `Sustained rise improved ${Math.abs(d)} bpm across ${susSeq.length} tests in this range.`
          : `Sustained rise is up ${d} bpm across ${susSeq.length} tests in this range.`,
        strength: d < 0 ? 'strong' : 'mod',
      });
    }
    return [{
      title: 'POTS Test', sub: range,
      cat: latestCat,
      desc: 'Your guided lay-to-stand tests. Same protocol every time, so these are directly comparable.',
      help: 'Each point is one watch stand test. Sustained is the average rise over the final minute of standing versus the supine baseline; a sustained rise of 30 bpm or more (40 in ages 12-19) is the adult POTS-range criterion, and the zones shade it. Peak is the largest single rise. The grade dot follows your latest test.',
      tiles: true,
      stats: [
        { label: 'Last sustained rise', value: latestSus != null ? Math.round(latestSus) : null, sub: 'bpm', color: latestCat ? SCORE_COLORS[latestCat] : undefined },
        { label: 'Avg baseline', value: avgRound(base), sub: 'bpm' },
        { label: 'Met POTS threshold', value: tests.length ? `${met} of ${tests.length}` : null },
      ],
      charts: [{
        label: 'Sustained vs peak rise (bpm)',
        series: [series(sus, '#f97316', 'Sustained', { pointBands: BANDS.standDelta }), series(peak, '#a78bfa', 'Peak')],
        zones: acBandZones('standDelta'), integer: true,
        legend: [['Sustained', '#f97316'], ['Peak', '#a78bfa']],
      }],
      insights,
    }];
  };

  /** Everyday orthostatic events (stairs, sit to stand, lay to stand). These
   *  are noisy, context-dependent samples, so the card filters by transition:
   *  stairs always spike, and a trend only means something like for like. */
  const ortho = (): AnalysisCard[] => {
    const incOf = (r: Entry) => { const a = parseFloat(r.afterHr as string), b = parseFloat(r.beforeHr as string); return !isNaN(a) && !isNaN(b) ? a - b : null; };
    const recOf = (r: Entry) => { const a = parseFloat(r.afterHr as string), m = parseFloat(r.hr1min as string); return !isNaN(a) && !isNaN(m) ? a - m : null; };
    const TRANSITIONS: Record<OrthoTransition, (r: Entry) => boolean> = {
      all: () => true,
      lay: (r) => r.transition === 'Laying to standing',
      sit: (r) => r.transition === 'Sitting to standing',
      stairs: (r) => r.transition === 'Climbing stairs',
    };
    const variant = (filt: OrthoTransition): OrthoVariant => {
      const f = TRANSITIONS[filt];
      const inc = acAgg(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic' && f(r)).map(incOf).filter((v): v is number => v != null));
      const rec = acAgg(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic' && f(r)).map(recOf).filter((v): v is number => v != null));
      const counts = acAggSum(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic' && f(r) && incOf(r) != null).length || null);
      let n = 0, potsN = 0;
      buckets.forEach((b) => b.days.forEach((dk) => (days[dk].readings || []).forEach((r) => {
        if (r.type !== 'orthostatic' || !f(r)) return;
        const v = incOf(r); if (v == null) return;
        n++; if (v >= 30) potsN++;
      })));
      const incAvg = acMean(inc), recAvg = acMean(rec);
      // The ≥30 bpm POTS criterion only applies to standing up, so the rise
      // series drops its zones and grading on the stairs view.
      const graded = filt !== 'stairs';
      return {
        cat: worstCat([
          incAvg != null && graded ? catFromBands(incAvg, BANDS.orthoIncrease) : null,
          recAvg != null ? catFromBands(recAvg, BANDS.orthoRecovery) : null,
        ]),
        counts,
        charts: [{
          label: '',
          series: [
            series(inc, '#38bdf8', 'Rise', { pointBands: graded ? BANDS.orthoIncrease : null }),
            series(rec, '#a78bfa', '1 min drop', { pointBands: BANDS.orthoRecovery }),
          ],
          zones: graded ? acBandZones('orthoIncrease') : null, integer: true,
          legend: [['Rise', '#38bdf8'], ['1 min drop', '#a78bfa']],
          selectStat: true,
        }],
        stats: [
          { label: 'Rise', value: avgRound(inc), sub: 'bpm' },
          { label: '1 min drop', value: avgRound(rec), sub: 'bpm' },
          { label: 'Events', value: n || null },
        ],
        insights: potsN && graded ? [{ text: `${potsN} of ${n} event${n === 1 ? '' : 's'} reached a ≥30 bpm rise (the adult POTS-range threshold).`, strength: 'mod' }] : [],
      };
    };
    const orthoFilter: Record<OrthoTransition, OrthoVariant> = { all: variant('all'), lay: variant('lay'), sit: variant('sit'), stairs: variant('stairs') };
    const all = orthoFilter.all;
    if (!all.charts.some((c) => c.series.some((s) => acPresent(s.values).length))) return [];
    return [{
      title: 'POTS Episodes', sub: range,
      cat: all.cat,
      desc: 'How your heart rate reacts to everyday position changes, and how fast it settles.',
      help: 'Each event logs your HR before and after a transition, plus one minute in. Rise is the jump on the change; for the stand-up transitions the zones shade the ≥30 bpm adult POTS-range criterion (stairs always spike, so they are not graded). The 1 min drop shows how quickly HR settles back from its peak; a bigger drop means faster vagal recovery, and for everyday events it is often the cleaner progress signal. Tap a point on the chart to see that day\'s numbers, and use the transition links to compare like with like.',
      charts: all.charts,
      stats: all.stats,
      insights: all.insights,
      orthoFilter,
    }];
  };

  const sleep = (): AnalysisCard[] => {
    const dur = acAgg(buckets, (d, dk) => sleepHours(days, dk));
    if (!acPresent(dur).length) return [];
    const durAvg = acMean(dur);
    const cards: AnalysisCard[] = [{
      title: 'Duration', sub: range,
      cat: durAvg != null ? catFromBands(durAvg, BANDS.sleepDur) : null,
      desc: 'How long you slept and when, night by night.',
      help: 'Duration is the night that ended that morning, coloured by grade the same way each night is scored: 8h+ reads as great, 7h good, 6h ok, and it falls off below that. Tap "Show zones" for the grade thresholds. Consistency of timing often moves HRV as much as raw duration does.',
      charts: [
        { label: '', series: [series(dur, '#38bdf8')], zones: acBandZones('sleepDur') },
      ],
      stats: [{ label: 'Avg sleep', value: avgRound(dur, 1), sub: 'h' }],
    }];
    const num = (v: string | number | undefined) => { const n = parseFloat(v as string); return isNaN(n) ? null : n; };
    const hrLow = acAgg(buckets, (d) => num(d.sleep?.hrLow));
    const hrHigh = acAgg(buckets, (d) => num(d.sleep?.hrHigh));
    if (acPresent(hrLow).length || acPresent(hrHigh).length) cards.push({
      title: 'Sleeping HR', sub: range,
      desc: 'Your lowest and highest heart rate through the night.',
      help: 'The low and high heart rate recorded during sleep. The overnight low is one of the cleanest resting-HR readings you get; the high reflects arousals and dreams. A gradually falling overnight low usually tracks improving autonomic recovery.',
      charts: [
        { label: '', integer: true, series: [series(hrLow, '#38bdf8', 'Low'), series(hrHigh, '#f97316', 'High')], legend: [['Low', '#38bdf8'], ['High', '#f97316']] },
      ],
      stats: [
        { label: 'Avg low', value: avgRound(hrLow) },
        { label: 'Avg high', value: avgRound(hrHigh) },
      ],
    });
    return cards;
  };

  const activity = (): AnalysisCard[] => {
    const mins = acAggSum(buckets, (d) => (d.activities || []).reduce((s, a) => s + (parseFloat(a.duration as string) || 0), 0) || null);
    const typeCounts: Record<string, number> = {};
    let activeDays = 0, restDays = 0;
    buckets.forEach((b) => b.days.forEach((dk) => { const acts = days[dk].activities || []; if (acts.length) { activeDays++; acts.forEach((a) => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; }); } else restDays++; }));
    const rows = Object.entries(typeCounts).map(([t, c]) => ({ name: ctx.customTypes?.activities?.[t]?.label || ACTIVITY_TYPES[t]?.label || t, count: c })).sort((a, b) => b.count - a.count);
    if (!rows.length) return [];
    return [{
      title: 'Activity', sub: range,
      desc: 'Exercise minutes over the range and what kinds of sessions they were.',
      help: 'Total logged exercise minutes per bucket, plus a breakdown of session types and the balance of active versus rest days. In autonomic recovery, consistency at a tolerable dose beats intensity. Watch how your score and symptoms respond in the day or two after harder sessions.',
      charts: [{ label: 'Total exercise minutes', series: [series(mins, SCORE_COLORS.bad)], integer: true }],
      bars: [{ label: 'Activity types', rows }],
      stats: [{ label: 'Active days', value: activeDays || null }, { label: 'Rest days', value: restDays || null }],
    }];
  };

  const triggers = (): AnalysisCard[] => {
    const water = acAgg(buckets, (d) => (d.food && +d.food.water > 0 ? +d.food.water : null));
    const trig: Record<string, number> = {};
    const trigLabel = (k: string) => ctx.customTypes?.triggers?.[k]?.label || TRIGGER_TYPES[k]?.label;
    buckets.forEach((b) => b.days.forEach((dk) => { const f = days[dk].food; if (!f) return; Object.keys(f.triggers || {}).forEach((k) => { if (f.triggers[k] > 0 && trigLabel(k)) trig[k] = (trig[k] || 0) + f.triggers[k]; }); }));
    const trigRows = Object.entries(trig).map(([k, c]) => ({ name: trigLabel(k)!, count: c })).sort((a, b) => b.count - a.count);
    if (!acPresent(water).length && !trigRows.length) return [];
    const cards: AnalysisCard[] = [];
    if (trigRows.length) cards.push({
      title: 'Triggers',
      desc: 'How often each trigger showed up in this range.',
      help: 'Counts of every logged trigger (histamine foods, caffeine, alcohol and the rest). Pair this with the Outlook correlations: if a trigger keeps landing before bad days, that\'s a pattern worth testing with an elimination window.',
      bars: [{ label: 'All triggers', rows: trigRows }],
    });
    if (acPresent(water).length) cards.push({
      title: 'Hydration', sub: range,
      desc: 'Daily water intake against the target band.',
      help: 'Litres of water per day; the dashed band marks the 2.5–3.5 L range commonly recommended alongside electrolytes for orthostatic conditions. Fluid only holds where salt allows. If you chase volume, discuss electrolyte targets with your doctor.',
      charts: [{ label: 'Water (L/day)', series: [series(water, '#38bdf8')], target: { from: 2.5, to: 3.5, color: '#16a34a' } }],
      stats: [{ label: 'Avg water', value: avgRound(water, 1), sub: 'L' }],
    });
    return cards;
  };

  const supps = (): AnalysisCard[] => {
    const counts: Record<string, number> = {}; let anyMeds = false;
    buckets.forEach((b) => b.days.forEach((dk) => { const meds = days[dk].meds || []; if (meds.length) anyMeds = true; new Set(meds.map((m) => m.type)).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }); }));
    if (!anyMeds) return [];
    const rows = Object.entries(counts).map(([t, c]) => ({ name: ctx.customTypes?.meds?.[t]?.label || MED_TYPES[t]?.label || t, count: c })).sort((a, b) => b.count - a.count);
    return [{
      title: 'Medications & Supplements',
      desc: 'How many days each was taken in this range.',
      help: 'Days-taken counts for every medication and supplement you logged. Consistent daily bars make it easy to spot missed stretches, and to line adherence up against score changes when you and your doctor adjust the protocol.',
      bars: [{ label: '', rows, fmt: (c) => `${c} d` }],
    }];
  };

  const bl = buckets.map((b) => ({ label: b.label }));
  return [
    { id: 'outlook', icon: 'gauge', title: 'Outlook', desc: 'Recovery score & trends', buckets: bl, build: () => nonEmpty([...outlook(), heat()]) },
    { id: 'hrv', icon: 'heartPulse', title: 'HRV', desc: 'Heart-rate variability', buckets: bl, build: () => nonEmpty(hrv()) },
    { id: 'vitals', icon: 'heart', title: 'Vitals', desc: 'Blood pressure & heart rate', buckets: bl, build: () => nonEmpty(vitals()) },
    { id: 'pots', icon: 'standing', title: 'POTS', desc: 'Stand tests & events', buckets: bl, build: () => nonEmpty([...standTest(), ...ortho()]) },
    { id: 'sleep', icon: 'moon', title: 'Sleep', desc: 'Duration & timing', buckets: bl, build: () => nonEmpty(sleep()) },
    { id: 'activity', icon: 'bike', title: 'Activity', desc: 'Workouts & exercise', buckets: bl, build: () => nonEmpty(activity()) },
    { id: 'triggers', icon: 'triangle', title: 'Triggers', desc: 'Triggers & hydration', buckets: bl, build: () => nonEmpty(triggers()) },
    { id: 'supps', icon: 'pill', title: 'Meds', desc: 'Meds & supplements', buckets: bl, build: () => nonEmpty(supps()) },
  ];
}

