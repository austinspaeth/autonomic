/**
 * Analysis categories → structured card data (no UI). The Analysis screen
 * renders these generically with LineChart / Bars / stat tiles. Simplified from
 * the PWA: a few good charts + stat tiles per category, grade-zone shaded.
 */
import type { Band, Entry, ScoreCat } from '../types';
import { todayKey } from '../dates';
import { SCORE_COLORS, orthoMaxDelta, restingHrBands, sBP } from '../scoring';
import { scoreCat, sleepHours, streakInfo, type DaysMap } from '../scoring/day';
import { ACTIVITY_TYPES, MED_TYPES, TRIGGER_TYPES } from '../registry';
import {
  BANDS, Mode, acBandZones, acBandsToZones, acBuckets, acLatestIdx, acMean, acPresent, acRangeLabel,
  acReadVals, acScoreZones, avgRound, bucketViews, bucketWhen, catFromBands, isEvening, isMorning,
  makeAgg, onDay, type BucketView, type ScoreContext,
} from './buckets';
import type { Series, Zone } from '../../components/charts';

export interface Chart { label: string; series: Series[]; zones?: Zone[] | null; target?: { from: number; to: number; color: string }; integer?: boolean; legend?: [string, string][]; dumbbell?: { sys: (number | null)[]; dia: (number | null)[] };
  /** Hide the chart's own readout and instead drive the card's first stat:
   *  average by default, the dragged bucket's value with its date on select. */
  selectStat?: boolean; }
/** Balance-style readout rendered just below the card description: each metric
 *  is a legend dot + name on the first row with the value below it coloured to
 *  match (a metric without a `color` is dot-less, e.g. an "Events" count).
 *  `regrade` re-derives that colour from the selected bucket's value when a
 *  chart point is tapped (so the dot/value track that day's grade, not the
 *  latest one). `sub` is the metric's unit; `prefix` sits immediately before the
 *  number (e.g. "Δ"). `when` is the phrase for the bucket/day the readout belongs
 *  to ("on 7/27", "in July"), rendered right after the last metric's unit.
 *  When `zones` is set the card's "Show zones" link appears top-right. */
export interface MetricsRow { metrics: { label: string; value: number | string | null; prefix?: string; sub?: string; color?: string; regrade?: (v: number) => string }[]; when?: string | null; zones?: boolean }
/** Which readings a blood-pressure card is filtered to. */
export type BpPeriod = 'all' | 'morning' | 'evening';
/** `curSys`/`curDia`/`curLabel` are the latest bucket with a reading (the
 *  current week/month/year when it has data) — the card's default readout. */
export interface BpSeries { sys: (number | null)[]; dia: (number | null)[]; cat?: ScoreCat | null; curSys: number | null; curDia: number | null; curLabel?: string;
  /** Range averages — what the card's two tiles report. */
  avgSys: number | null; avgDia: number | null }
/** Which transition an Orthostatic Events card is filtered to. */
export type OrthoTransition = 'all' | 'lay' | 'sit' | 'stairs';
/** One transition-filter variant of the Orthostatic Events card: the view swaps
 *  charts/stats/insights/grade wholesale when the filter changes. `counts` is
 *  events per bucket, so a selected chart point can report that day's count. */
export interface OrthoVariant { cat: ScoreCat | null; charts: Chart[]; stats: Stat[]; insights: Insight[]; counts: (number | null)[]; metricsRow?: MetricsRow }
/** `sub` is the unit shown after the value; `when` (when set) follows it as a
 *  phrase for the period, so a tile reads "56 bpm on 7/27" or "56 bpm in July". */
export interface Stat { label: string; value: number | string | null; sub?: string; when?: string | null; color?: string }
export interface Insight { text: string; strength?: 'strong' | 'mod' | null }
export interface BarGroup { label: string; rows: { name: string; count: number; color?: string; key?: string }[]; fmt?: (c: number) => string }
/** Per-bucket counts behind a bars card: `totals` draws a bucket chart above
 *  the horizontal bars, and tapping a row (matched by its `key`) narrows the
 *  chart to that row's own counts until a tap elsewhere resets it. */
export interface BarBuckets { totals: (number | null)[]; byKey: Record<string, (number | null)[]> }
export interface AnalysisCard {
  title: string;
  sub?: string;
  /** One-line description shown under the section header (design-comp style). */
  desc?: string;
  /** Longer copy for the "?" help sheet next to the title. */
  help?: string;
  charts?: Chart[]; stats?: Stat[]; insights?: Insight[]; bars?: BarGroup[];
  /** Per-bucket counts charted above the first bars group (see BarBuckets). */
  barBuckets?: BarBuckets;
  /** Balance-style metric readout under the description (ortho cards carry one
   *  per transition variant instead, on `OrthoVariant`). */
  metricsRow?: MetricsRow;
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
export interface Category {
  id: string; icon: string; title: string; desc: string; buckets: BucketView[]; build: () => AnalysisCard[];
  /** Categories that render their own charts rather than cards report presence here —
   *  an empty `build()` is not proof the range holds nothing. */
  hasData?: () => boolean;
}

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
    // Readout follows the most recent bucket with a score (like the POTS cards):
    // the score in its grade colour, the rolling average beside it, the date after.
    let li = -1; vals.forEach((v, i) => { if (v != null) li = i; });
    const cur = li >= 0 ? vals[li] : null;
    const curRoll = li >= 0 ? roll[li] : null;
    const avgLabel = `${win} ${mode === 'day' ? 'day' : mode === 'week' ? 'week' : mode === 'month' ? 'month' : 'year'} avg`;
    const cards: AnalysisCard[] = [{
      title: 'Autonomic Outlook', sub: range,
      desc: 'Your daily autonomic score over the range, with a rolling average to smooth the noise.',
      help: 'Each day is scored 0–100 from everything you logged that day (HRV readings, vitals, symptoms and sleep) using the recovery framework\'s thresholds. The dashed line is a rolling average, which is usually the better trend to watch: single days swing, the rolling line tells the story.',
      metricsRow: {
        metrics: [
          cur != null ? { label: 'Score', value: Math.round(cur), color: scoreCat(cur).color, regrade: (v: number) => scoreCat(v).color } : null,
          curRoll != null ? { label: avgLabel, value: Math.round(curRoll), color: '#9a9aa0' } : null,
        ].filter(Boolean) as MetricsRow['metrics'],
        when: bucketWhen(mode, buckets[li]),
        zones: true,
      },
      charts: [{ label: '', series: [series(vals, SCORE_COLORS.great, 'Score', { pointBands: null }), series(roll, '#9a9aa0', avgLabel, { dashed: true })], zones: acScoreZones(), integer: true }],
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

  // The HRV section draws itself through <HrvProgress/>, so it builds no cards.
  // This reports only whether the range holds an HRV reading at all — the signal
  // the Analysis view needs to tell "no data yet" from "data, drawn elsewhere".
  const hasHrv = (): boolean => {
    const rmssdS = acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'rmssd'));
    const rmssdU = acAgg(buckets, (d) => acReadVals(d, 'hrv', 'rmssd'));
    return acPresent(rmssdS).length > 0 || acPresent(rmssdU).length > 0;
  };

  const vitals = (): AnalysisCard[] => {
    // Systolic/diastolic per bucket, sliced by time of day so the card's
    // All/Morning/Evening toggle can swap which readings it draws.
    const bpSpan = (f?: (r: Entry) => boolean): BpSeries => {
      const sys = acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys', f));
      const dia = acAgg(buckets, (d) => acReadVals(d, 'bp', 'dia', f));
      // Readout + grade dot follow the latest bucket with a reading (the current
      // week/month/year when it has data), not the range average.
      const li = acLatestIdx(sys, dia);
      const curSys = li >= 0 && sys[li] != null ? Math.round(sys[li]!) : null;
      const curDia = li >= 0 && dia[li] != null ? Math.round(dia[li]!) : null;
      return { sys, dia, cat: sBP(curSys, curDia), curSys, curDia, curLabel: li >= 0 ? buckets[li].label : undefined, avgSys: avgRound(sys), avgDia: avgRound(dia) };
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
        // Tiles are the range averages; the dumbbell readout above them is
        // where the latest (or dragged) reading with its date lives.
        { label: 'Avg systolic', value: bpFilter.all.avgSys, sub: 'mmHg' },
        { label: 'Avg diastolic', value: bpFilter.all.avgDia, sub: 'mmHg' },
      ],
      bpFilter,
    });
    // Readout + grade follow the latest bucket with a reading; dragging the
    // chart swaps in other buckets and a blur returns here.
    const layingLi = acLatestIdx(laying);
    const layingCur = layingLi >= 0 ? laying[layingLi] : null;
    if (acPresent(laying).length) cards.push({
      title: 'Resting Heart Rate', sub: range,
      cat: layingCur != null ? catFromBands(layingCur, restingHrBands('Laying')) : null,
      catBands: restingHrBands('Laying'),
      desc: 'Laying heart rate over the range.',
      help: 'Heart rate measured while laying down, the cleanest resting baseline. A gradually falling laying HR usually accompanies improving autonomic recovery; a sustained unexplained rise is worth noting alongside symptoms and sleep.',
      charts: [{ label: '', series: [series(laying, SCORE_COLORS.bad)], zones: acBandsToZones(restingHrBands('Laying')), integer: true, selectStat: true }],
      stats: [{ label: 'Laying HR', value: layingCur != null ? Math.round(layingCur) : null, sub: 'bpm', when: bucketWhen(mode, buckets[layingLi]) }],
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
    const peakSeq = tests.map((t) => num(t.r.peakDelta)).filter((v): v is number => v != null);
    // Grade dot follows the latest test, not the range average: this is a
    // progress card, and a bad month shouldn't drag on a recovered one.
    const latestSus = susSeq.length ? susSeq[susSeq.length - 1] : null;
    const latestPeak = peakSeq.length ? peakSeq[peakSeq.length - 1] : null;
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
      metricsRow: {
        metrics: [
          { label: 'Sustained', value: latestSus != null ? Math.round(latestSus) : null, sub: 'bpm', color: '#60a5fa' },
          { label: 'Peak', value: latestPeak != null ? Math.round(latestPeak) : null, sub: 'bpm', color: '#a855f7' },
        ],
        when: onDay(tests.length ? `${+tests[tests.length - 1].dk.slice(5, 7)}/${+tests[tests.length - 1].dk.slice(8, 10)}` : null),
        zones: true,
      },
      charts: [{
        label: '',
        series: [series(sus, '#60a5fa', 'Sustained'), series(peak, '#a855f7', 'Peak')],
        zones: acBandZones('standDelta'), integer: true,
      }],
      insights,
    }];
  };

  /** Three zones for the episode max delta, coarser than BANDS.orthoIncrease:
   *  the card carries a single line, so it reads as one traffic light against
   *  the ≥30 bpm POTS-range criterion with an amber warning lane below it. */
  const EPISODE_BANDS: Band[] = [{ max: 20, cat: 'good' }, { max: 30, cat: 'ok' }, { max: Infinity, cat: 'crash' }];

  /** Everyday orthostatic events (stairs, sit to stand, lay to stand). These
   *  are noisy, context-dependent samples, so the card filters by transition:
   *  stairs always spike, and a trend only means something like for like. */
  const ortho = (): AnalysisCard[] => {
    // The card charts one number per event: the biggest excursion from the
    // pre-episode baseline across the whole capture (same `orthoMaxDelta` the
    // journal row and the episode summary grade on), not the endpoint rise.
    // Without a stored curve it falls back to afterHr − beforeHr.
    const maxOf = (r: Entry) => orthoMaxDelta(r, ctx.hrCurve ? ctx.hrCurve(String(r.id)) : null);
    const TRANSITIONS: Record<OrthoTransition, (r: Entry) => boolean> = {
      all: () => true,
      lay: (r) => r.transition === 'Laying to standing',
      sit: (r) => r.transition === 'Sitting to standing',
      stairs: (r) => r.transition === 'Climbing stairs',
    };
    const variant = (filt: OrthoTransition): OrthoVariant => {
      const f = TRANSITIONS[filt];
      const max = acAgg(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic' && f(r)).map(maxOf).filter((v): v is number => v != null));
      const counts = acAggSum(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic' && f(r) && maxOf(r) != null).length || null);
      let n = 0, potsN = 0;
      // Readout follows the most recent event (like the POTS Test card), not the
      // range average: buckets/days/readings are chronological, so the last
      // valid hit wins.
      let lastMax: number | null = null, lastDk: string | null = null;
      buckets.forEach((b) => b.days.forEach((dk) => (days[dk].readings || []).forEach((r) => {
        if (r.type !== 'orthostatic' || !f(r)) return;
        const v = maxOf(r); if (v == null) return;
        n++; if (v >= 30) potsN++;
        lastMax = v; lastDk = dk;
      })));
      const maxAvg = acMean(max);
      const lastDate = lastDk ? `${+(lastDk as string).slice(5, 7)}/${+(lastDk as string).slice(8, 10)}` : undefined;
      // Every transition (stairs included) shades and colours on the same
      // zones, so the line never reads as a plain blue trace. The ≥30 bpm POTS
      // *criterion* is about standing up, so only that claim is withheld from
      // the stairs view — climbing a flight is expected to clear 30.
      const gradeColor = (v: number) => { const c = catFromBands(v, EPISODE_BANDS); return c ? SCORE_COLORS[c] : '#60a5fa'; };
      return {
        cat: maxAvg != null ? catFromBands(maxAvg, EPISODE_BANDS) : null,
        counts,
        charts: [{
          label: '',
          series: [series(max, '#60a5fa', 'Max delta')],
          zones: acBandsToZones(EPISODE_BANDS), integer: true,
        }],
        metricsRow: {
          metrics: [
            {
              // The number is a rise off the pre-episode baseline, so it reads
              // as a delta ("Δ16 bpm"), like the episode summary's own readout.
              label: 'Max delta', value: lastMax != null ? Math.round(lastMax) : null, prefix: 'Δ', sub: 'bpm',
              color: lastMax != null ? gradeColor(lastMax) : '#60a5fa',
              regrade: gradeColor,
            },
          ],
          when: onDay(lastDate),
          zones: true,
        },
        stats: [],
        insights: potsN && filt !== 'stairs' ? [{ text: `${potsN} of ${n} event${n === 1 ? '' : 's'} reached a ≥30 bpm rise (the adult POTS-range threshold).`, strength: 'mod' }] : [],
      };
    };
    const orthoFilter: Record<OrthoTransition, OrthoVariant> = { all: variant('all'), lay: variant('lay'), sit: variant('sit'), stairs: variant('stairs') };
    const all = orthoFilter.all;
    if (!all.charts.some((c) => c.series.some((s) => acPresent(s.values).length))) return [];
    return [{
      title: 'POTS Episodes', sub: range,
      cat: all.cat,
      desc: 'How far your heart rate climbs above its resting baseline on everyday position changes.',
      help: 'Max delta is the biggest change from your pre-episode baseline across the whole capture, so it catches the peak rather than wherever the heart rate happened to sit when the transition ended. The zones shade it: under 20 bpm green, 20 to 30 amber, 30 and above red, the ≥30 mark being the adult POTS-range criterion for standing up. Stairs are shaded the same way for readability, but a flight of stairs is expected to clear 30, so read that view as a trend rather than against the criterion. Use the transition links to compare like with like.',
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
    // Readout follows the most recent bucket with a night logged (like the
    // Outlook/POTS cards); tapping the chart swaps it for that bucket.
    let li = -1; dur.forEach((v, i) => { if (v != null) li = i; });
    const cur = li >= 0 ? dur[li] : null;
    const durColor = (v: number) => { const c = catFromBands(v, BANDS.sleepDur); return c ? SCORE_COLORS[c] : '#38bdf8'; };
    const cards: AnalysisCard[] = [{
      title: 'Duration', sub: range,
      cat: durAvg != null ? catFromBands(durAvg, BANDS.sleepDur) : null,
      desc: 'How long you slept and when, night by night.',
      help: 'Duration is the night that ended that morning, coloured by grade the same way each night is scored: 8h+ reads as great, 7h good, 6h ok, and it falls off below that. Tap "Show zones" for the grade thresholds. Consistency of timing often moves HRV as much as raw duration does.',
      metricsRow: {
        metrics: cur != null
          ? [{ label: 'Duration', value: Math.round(cur * 10) / 10, sub: 'hours', color: durColor(cur), regrade: durColor }]
          : [],
        when: bucketWhen(mode, buckets[li]),
        zones: true,
      },
      charts: [
        { label: '', series: [series(dur, '#38bdf8')], zones: acBandZones('sleepDur') },
      ],
    }];
    const num = (v: string | number | undefined) => { const n = parseFloat(v as string); return isNaN(n) ? null : n; };
    const hrLow = acAgg(buckets, (d) => num(d.sleep?.hrLow));
    const hrHigh = acAgg(buckets, (d) => num(d.sleep?.hrHigh));
    if (acPresent(hrLow).length || acPresent(hrHigh).length) {
      // Readout follows the most recent night with data (like the POTS cards),
      // not the range average.
      let lastLow: number | null = null, lastHigh: number | null = null, lastDk: string | null = null;
      buckets.forEach((b) => b.days.forEach((dk) => {
        const lo = num(days[dk].sleep?.hrLow), hi = num(days[dk].sleep?.hrHigh);
        if (lo != null || hi != null) { lastLow = lo; lastHigh = hi; lastDk = dk; }
      }));
      const lastDate = lastDk ? `${+(lastDk as string).slice(5, 7)}/${+(lastDk as string).slice(8, 10)}` : undefined;
      cards.push({
        title: 'Sleeping HR', sub: range,
        desc: 'Your lowest and highest heart rate through the night.',
        help: 'The low and high heart rate recorded during sleep. The overnight low is one of the cleanest resting-HR readings you get; the high reflects arousals and dreams. A gradually falling overnight low usually tracks improving autonomic recovery.',
        metricsRow: {
          metrics: [
            { label: 'Low', value: lastLow != null ? Math.round(lastLow) : null, sub: 'bpm', color: '#60a5fa' },
            { label: 'High', value: lastHigh != null ? Math.round(lastHigh) : null, sub: 'bpm', color: '#a855f7' },
          ],
          when: onDay(lastDate),
        },
        charts: [
          { label: '', integer: true, series: [series(hrLow, '#60a5fa', 'Low'), series(hrHigh, '#a855f7', 'High')] },
        ],
      });
    }
    return cards;
  };

  const activity = (): AnalysisCard[] => {
    const mins = acAggSum(buckets, (d) => (d.activities || []).reduce((s, a) => s + (parseFloat(a.duration as string) || 0), 0) || null);
    const typeCounts: Record<string, number> = {};
    let sessions = 0, totalMins = 0;
    buckets.forEach((b) => b.days.forEach((dk) => { const acts = days[dk].activities || []; acts.forEach((a) => { sessions++; totalMins += parseFloat(a.duration as string) || 0; typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; }); }));
    const rows = Object.entries(typeCounts).map(([t, c]) => ({ name: ctx.customTypes?.activities?.[t]?.label || ACTIVITY_TYPES[t]?.label || t, count: c })).sort((a, b) => b.count - a.count);
    if (!rows.length) return [];
    return [{
      title: 'Activity', sub: range,
      desc: 'Exercise sessions and minutes over the range, and what kinds they were.',
      help: 'How many sessions you logged, the total exercise minutes per bucket, and a breakdown of session types. In autonomic recovery, consistency at a tolerable dose beats intensity. Watch how your score and symptoms respond in the day or two after harder sessions.',
      charts: [{ label: 'Total exercise minutes', series: [series(mins, SCORE_COLORS.bad)], integer: true }],
      bars: [{ label: 'Activity types', rows }],
      stats: [{ label: 'Sessions', value: sessions || null, sub: 'times' }, { label: 'Total', value: totalMins ? Math.round(totalMins) : null, sub: 'mins' }],
    }];
  };

  const triggers = (): AnalysisCard[] => {
    const water = acAgg(buckets, (d) => (d.food && +d.food.water > 0 ? +d.food.water : null));
    const trig: Record<string, number> = {};
    // Per-bucket counts per trigger, for the chart above the bars: totals by
    // default, one trigger's own counts while its row is selected.
    const byKey: Record<string, (number | null)[]> = {};
    const trigLabel = (k: string) => ctx.customTypes?.triggers?.[k]?.label || TRIGGER_TYPES[k]?.label;
    buckets.forEach((b, bi) => b.days.forEach((dk) => { const f = days[dk].food; if (!f) return; Object.keys(f.triggers || {}).forEach((k) => {
      if (!(f.triggers[k] > 0) || !trigLabel(k)) return;
      trig[k] = (trig[k] || 0) + f.triggers[k];
      if (!byKey[k]) byKey[k] = buckets.map(() => 0);
      byKey[k][bi] = (byKey[k][bi] || 0) + f.triggers[k];
    }); }));
    const trigRows = Object.entries(trig).map(([k, c]) => ({ key: k, name: trigLabel(k)!, count: c })).sort((a, b) => b.count - a.count);
    if (!acPresent(water).length && !trigRows.length) return [];
    const cards: AnalysisCard[] = [];
    if (trigRows.length) cards.push({
      title: 'Triggers',
      desc: 'How often each trigger showed up in this range.',
      help: 'Counts of every logged trigger (histamine foods, caffeine, alcohol and the rest). The chart totals them per day/week/month; tap a trigger below to see just its own pattern, and tap anywhere else to reset. Pair this with the Outlook correlations: if a trigger keeps landing before bad days, that\'s a pattern worth testing with an elimination window.',
      bars: [{ label: '', rows: trigRows }],
      barBuckets: { totals: buckets.map((_, bi) => trigRows.reduce((s, r) => s + (byKey[r.key][bi] || 0), 0)), byKey },
    });
    // Readout follows the latest bucket with water logged, like the other cards.
    const waterLi = acLatestIdx(water);
    const waterCur = waterLi >= 0 && water[waterLi] != null ? Math.round(water[waterLi]! * 10) / 10 : null;
    if (acPresent(water).length) cards.push({
      title: 'Hydration', sub: range,
      desc: 'Daily water intake over the range.',
      help: 'Litres of water per day. 2.5–3.5 L is commonly recommended alongside electrolytes for orthostatic conditions. Fluid only holds where salt allows. If you chase volume, discuss electrolyte targets with your doctor.',
      charts: [{ label: '', series: [series(water, '#38bdf8')], selectStat: true }],
      stats: [{ label: 'Water', value: waterCur, sub: 'litres', when: bucketWhen(mode, buckets[waterLi]) }],
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

  const bl = bucketViews(buckets, mode);
  return [
    { id: 'outlook', icon: 'gauge', title: 'Outlook', desc: 'Recovery score & trends', buckets: bl, build: () => nonEmpty([...outlook(), heat()]) },
    { id: 'hrv', icon: 'heartPulse', title: 'HRV', desc: 'Heart-rate variability', buckets: bl, build: () => [], hasData: hasHrv },
    { id: 'vitals', icon: 'heart', title: 'Vitals', desc: 'Blood pressure & heart rate', buckets: bl, build: () => nonEmpty(vitals()) },
    { id: 'pots', icon: 'standing', title: 'POTS', desc: 'Stand tests & events', buckets: bl, build: () => nonEmpty([...standTest(), ...ortho()]) },
    { id: 'sleep', icon: 'moon', title: 'Sleep', desc: 'Duration & timing', buckets: bl, build: () => nonEmpty(sleep()) },
    { id: 'activity', icon: 'bike', title: 'Activity', desc: 'Workouts & exercise', buckets: bl, build: () => nonEmpty(activity()) },
    { id: 'triggers', icon: 'triangle', title: 'Triggers', desc: 'Triggers & hydration', buckets: bl, build: () => nonEmpty(triggers()) },
    { id: 'supps', icon: 'pill', title: 'Meds', desc: 'Meds & supplements', buckets: bl, build: () => nonEmpty(supps()) },
  ];
}

