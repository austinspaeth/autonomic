// analysisCards — the analysis report-builder functions, ported from legacy
// docs/index.html (the ac* container functions, ~4926-5668). Each returns a JSX
// card element (or null when there's no data). Numeric thresholds/logic are kept
// verbatim; DOM/innerHTML is replaced with the JSX widgets in acHelpers.tsx and
// the ported charts (AnalysisChart / BpBars).
//
// Threading: legacy read globals state.days / analysisMode / currentKey. Here we
// take an explicit `ctx` (days, profile, mode, buckets, todayKey). acDayScore is
// passed profile (scoreSet signature is scoreSet(readings, day, profile)).
//
// DEFERRED (logged as TODO, low priority): acStructuredHrv, acUnstructuredHrv,
// acMorning, acEvening, acComparison, acHeatMapCard, acWeekPattern, acExtreme-
// Events, acExerciseProgression, acMeds(streak/clean/adherence), acRecoveryPhase,
// acInterventionImpact. The prioritized cards below are all ported.
import React from 'react';
import { View } from 'react-native';
import { Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { AnalysisChart } from '@ui/charts/AnalysisChart';
import { BpBars } from '@ui/charts/BpBars';
import { Legend } from '@ui/charts/Legend';
import { TrendChip } from '@ui/charts/TrendChip';
import { BANDS } from '@core/scoring/bands';
import { SCORE_COLORS, SCORE_CATS, scoreCat } from '@core/scoring/colors';
import { acAgg, acAggSum, acReadVals, acTotalPower, acDayScore } from '@core/analytics/aggregate';
import { sleepHours, blueZone } from '@core/scoring/scoreSet';
import { acRangeLabel, type AcBucket, type AnalysisMode } from '@core/analytics/buckets';
import { dateFromKey } from '@core/date/dateUtils';
import { ACTIVITY_TYPES } from '@core/domain/activityTypes';
import { MED_TYPES, TRIGGER_TYPES } from '@core/domain/otherTypes';
import type { Day, Profile, Reading } from '@core/types';
import {
  AcCard,
  AcBlock,
  AcStats,
  AcInsight,
  AcBars,
  AcScatter,
  acBandZones,
  acScoreZones,
  acMean,
  acPresent,
  acDelta,
  avgRound,
  acPearson,
  acDailyMetrics,
  type DailyMetricRow,
  isMorning,
  isEvening,
  acToDec,
  acMinOf,
  fmtNum,
  type BarRow,
} from './acHelpers';

export interface CardCtx {
  days: Record<string, Day>;
  profile: Profile;
  mode: AnalysisMode;
  buckets: AcBucket[];
  todayKey: string;
}

// fmtShort — legacy short date (e.g. "Jun 3").
const fmtShort = (k: string): string =>
  dateFromKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function DimNote({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>{text}</Text>;
}

// ===================== Autonomic Outlook =====================
export function acAutonomicOutlook(ctx: CardCtx): React.ReactElement | null {
  const { days, profile, mode, buckets } = ctx;
  const vals = acAgg(buckets, (d, dk) => acDayScore(d, dk, profile), days);
  if (!acPresent(vals).length) return null;
  const win = mode === 'day' ? 7 : 3;
  const roll = vals.map((_, i) => {
    const seg = vals.slice(Math.max(0, i - win + 1), i + 1).filter((v): v is number => v != null && !isNaN(v));
    return seg.length ? seg.reduce((s, x) => s + x, 0) / seg.length : null;
  });

  const daily: { dk: string; sc: number }[] = [];
  buckets.forEach((b) => b.days.forEach((dk) => {
    const sc = acDayScore(days[dk], dk, profile);
    if (sc != null) daily.push({ dk, sc });
  }));
  const best = daily.reduce((a, b) => (b.sc > a.sc ? b : a), daily[0]);
  const worst = daily.reduce((a, b) => (b.sc < a.sc ? b : a), daily[0]);
  const counts: Record<string, number> = {};
  daily.forEach((x) => { const c = scoreCat(x.sc).short; counts[c] = (counts[c] || 0) + 1; });
  const order = SCORE_CATS.map((c) => c.short);
  const gMax = Math.max(1, ...order.filter((s) => counts[s]).map((s) => counts[s]));
  const delta = acDelta(roll.some((v) => v != null) ? roll : vals);
  const meanVal = acMean(vals);

  return (
    <AcCard title="Autonomic Outlook" sub={acRangeLabel(mode)}>
      <AcBlock>
        <AnalysisChart
          buckets={buckets}
          series={[
            { values: vals, color: '#e03127', pointColorFn: (v) => scoreCat(v).color, label: 'Score' },
            { values: roll, color: '#9a9aa0', dashed: true, label: `${win}-pt avg` },
          ]}
          opts={{ zones: acScoreZones(), height: 152, integer: true }}
        />
        <Legend
          series={[
            { values: vals, color: '#e03127', label: 'Score' },
            { values: roll, color: '#9a9aa0', label: `${win}-pt avg`, dashed: true },
          ]}
        />
      </AcBlock>
      <AcStats
        items={[
          meanVal != null ? { label: 'Average', value: Math.round(meanVal), color: scoreCat(meanVal).color } : null,
          best ? { label: 'Best day', value: best.sc, sub: fmtShort(best.dk), color: scoreCat(best.sc).color } : null,
          worst ? { label: 'Worst day', value: worst.sc, sub: fmtShort(worst.dk), color: scoreCat(worst.sc).color } : null,
        ]}
      />
      <DirectionRow delta={delta} />
      {daily.length ? <GradeBars order={order} counts={counts} gMax={gMax} /> : null}
    </AcCard>
  );
}

function DirectionRow({ delta }: { delta: number | null }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        backgroundColor: t.surface2,
        borderRadius: t.radiusSm,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: 11, color: t.textDim }}>Direction</Text>
      {delta != null ? <TrendChip delta={delta} opts={{ goodUp: true }} /> : <Text style={{ color: t.textDim }}>-</Text>}
    </View>
  );
}

function GradeBars({ order, counts, gMax }: { order: string[]; counts: Record<string, number>; gMax: number }) {
  const t = useTheme();
  return (
    <AcBlock label="Days in each grade">
      <View style={{ gap: 6 }}>
        {order.filter((s) => counts[s]).map((s) => {
          const cat = SCORE_CATS.find((c) => c.short === s)!;
          const n = counts[s];
          return (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, height: 8, backgroundColor: t.surface2, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round((n / gMax) * 100)}%`, height: 8, backgroundColor: cat.color, borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 12, color: t.text, width: 130 }}>
                <Text style={{ fontWeight: '700', color: t.text }}>{String(n)}</Text>
                {` ${s.toLowerCase()} day${n === 1 ? '' : 's'}`}
              </Text>
            </View>
          );
        })}
      </View>
    </AcBlock>
  );
}

// ===================== All HRV =====================
export function acAllHrv(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const lfTargetDays = Object.keys(days).reduce(
    (s, dk) => s + acReadVals(days[dk], 'breathHrv', 'lfPeak').filter((v) => v >= 0.08 && v <= 0.1).length,
    0,
  );
  const rmssdS = acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'rmssd'), days);
  const tp = acAgg(buckets, (d) => acTotalPower(d), days);
  const rmssdU = acAgg(buckets, (d) => acReadVals(d, 'hrv', 'rmssd'), days);

  return (
    <AcCard title="All HRV Readings" sub={acRangeLabel(mode)}>
      <AcBlock label="RMSSD (structured vs unstructured)">
        <AnalysisChart
          buckets={buckets}
          series={[
            { values: rmssdS, color: '#4ade80', label: 'Structured' },
            { values: rmssdU, color: '#38bdf8', label: 'Unstructured' },
          ]}
          opts={{ zones: acBandZones('rmssdS') || undefined }}
        />
        <Legend series={[{ values: rmssdS, color: '#4ade80', label: 'Structured' }, { values: rmssdU, color: '#38bdf8', label: 'Unstructured' }]} />
      </AcBlock>
      <AcBlock label="pNN50">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'pnn50'), days), color: '#4ade80', label: '' }]} opts={{ zones: acBandZones('pnn50') || undefined }} />
      </AcBlock>
      <AcBlock label="Total power">
        <AnalysisChart buckets={buckets} series={[{ values: tp, color: '#a78bfa', label: '' }]} opts={{ zones: acBandZones('totalPower') || undefined, integer: true }} />
      </AcBlock>
      <AcBlock label="LF peak frequency">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'lfPeak'), days), color: '#38bdf8', label: '' }]} opts={{ zones: acBandZones('lfPeak') || undefined, target: { from: 0.08, to: 0.1, color: '#16a34a' } }} />
      </AcBlock>
      <AcBlock label="HF power">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'highPower'), days), color: '#4ade80', label: '' }]} opts={{ integer: true }} />
      </AcBlock>
      <AcBlock label="VLF power">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'vlowPower'), days), color: '#a78bfa', label: '' }]} opts={{ zones: acBandZones('vlf') || undefined, integer: true }} />
      </AcBlock>
      <AcStats
        items={[
          { label: 'Avg RMSSD', value: acMean(rmssdS) != null ? Math.round(acMean(rmssdS) as number) : null },
          { label: 'Avg total power', value: acMean(tp) != null ? Math.round(acMean(tp) as number) : null },
          { label: 'LF peak in target', value: lfTargetDays || null, sub: 'readings 0.08–0.10 Hz' },
        ]}
      />
    </AcCard>
  );
}

// ===================== Unstructured HRV =====================
export function acUnstructuredHrv(ctx: CardCtx): React.ReactElement | null {
  const { days, profile, buckets } = ctx;
  let blueDays = 0;
  Object.keys(days).forEach((dk) => { if (blueZone(days[dk].readings || [], profile)) blueDays++; });
  const readiness = acAgg(buckets, (d) => acReadVals(d, 'hrv', 'readiness'), days);
  if (!acPresent(readiness).length && !blueDays) return null;
  const rmU = acAgg(buckets, (d) => acReadVals(d, 'hrv', 'rmssd'), days);
  const rmS = acAgg(buckets, (d) => acReadVals(d, 'breathHrv', 'rmssd'), days);
  return (
    <AcCard title="Unstructured HRV" sub="Reality check vs structured readings">
      <AcBlock label="Readiness">
        <AnalysisChart buckets={buckets} series={[{ values: readiness, color: '#38bdf8', label: '', pointBands: BANDS.readiness }]} opts={{ zones: acBandZones('readiness') || undefined }} />
      </AcBlock>
      <AcBlock label="RMSSD overlay (unstructured vs structured)">
        <AnalysisChart buckets={buckets} series={[{ values: rmU, color: '#38bdf8', label: 'Unstructured' }, { values: rmS, color: '#4ade80', label: 'Structured' }]} opts={{ zones: acBandZones('rmssdU') || undefined }} />
        <Legend series={[{ values: rmU, color: '#38bdf8', label: 'Unstructured' }, { values: rmS, color: '#4ade80', label: 'Structured' }]} />
      </AcBlock>
      {blueDays ? <AcInsight strength="mod" text={`${blueDays} blue-zone day${blueDays === 1 ? '' : 's'}: high unstructured readiness (≥90%) masking a fragile structured RMSSD.`} /> : null}
    </AcCard>
  );
}

// ===================== Blood Pressure =====================
export function acBloodPressure(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const sys = acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys'), days);
  if (!acPresent(sys).length) return null;
  const dia = acAgg(buckets, (d) => acReadVals(d, 'bp', 'dia'), days);
  const pp = acAgg(
    buckets,
    (d) => (d.readings || []).filter((r) => r.type === 'bp').map((r) => {
      const s = parseFloat((r as any).sys), di = parseFloat((r as any).dia);
      return !isNaN(s) && !isNaN(di) ? s - di : null;
    }).filter((v): v is number => v != null),
    days,
  );
  let high = 0;
  const allSys: number[] = [];
  Object.keys(days).forEach((dk) => (days[dk].readings || []).forEach((r) => {
    if (r.type !== 'bp') return;
    const s = parseFloat((r as any).sys), di = parseFloat((r as any).dia);
    if (!isNaN(s)) { allSys.push(s); if (s >= 136 || di >= 88) high++; }
  }));
  const mean = allSys.reduce((s, x) => s + x, 0) / (allSys.length || 1);
  const variance = allSys.length ? Math.sqrt(allSys.reduce((s, x) => s + (x - mean) * (x - mean), 0) / allSys.length) : null;

  return (
    <AcCard title="Blood Pressure" sub={acRangeLabel(mode)}>
      <AcBlock label="Systolic / diastolic spread">
        <BpBars buckets={buckets} sys={sys} dia={dia} />
        <DimNote text="Top of each bar = systolic, bottom = diastolic; color shows each one's zone." />
      </AcBlock>
      <AcBlock label="Pulse pressure (sys − dia)">
        <AnalysisChart buckets={buckets} series={[{ values: pp, color: '#a78bfa', label: '', pointBands: BANDS.pp }]} opts={{ zones: acBandZones('pp') || undefined }} />
      </AcBlock>
      <AcStats
        items={[
          { label: 'Avg morning', value: avgRound(acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys', isMorning), days)), sub: 'sys' },
          { label: 'Avg evening', value: avgRound(acAgg(buckets, (d) => acReadVals(d, 'bp', 'sys', isEvening), days)), sub: 'sys' },
          { label: 'High BP days', value: high || null, sub: '≥136/88' },
          { label: 'Variability', value: variance != null ? Math.round(variance) : null, sub: 'σ sys' },
        ]}
      />
    </AcCard>
  );
}

// ===================== Resting HR =====================
export function acRestingHr(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const laying = acAgg(buckets, (d) => acReadVals(d, 'restingHr', 'hr', (r) => ((r as any).position || '') === 'Laying'), days);
  const sitting = acAgg(buckets, (d) => acReadVals(d, 'restingHr', 'hr', (r) => ((r as any).position || '') === 'Sitting'), days);
  const lowHr = acAgg(buckets, (d) => (d.sleep && (d.sleep as any).hrLow != null ? parseFloat((d.sleep as any).hrLow) : null), days);
  const highHr = acAgg(buckets, (d) => (d.sleep && (d.sleep as any).hrHigh != null ? parseFloat((d.sleep as any).hrHigh) : null), days);
  const ortho = acAgg(
    buckets,
    (d) => (d.readings || []).filter((r) => r.type === 'orthostatic').map((r) => {
      const a = parseFloat((r as any).afterHr), bb = parseFloat((r as any).beforeHr);
      return !isNaN(a) && !isNaN(bb) ? a - bb : null;
    }).filter((v): v is number => v != null),
    days,
  );
  const layAvg = acMean(laying);
  const hasAny = [laying, sitting, lowHr, highHr, ortho].some((v) => acPresent(v).length);
  if (!hasAny) return null;

  return (
    <AcCard title="Resting Heart Rate" sub={acRangeLabel(mode)}>
      <AcBlock label="Laying vs sitting HR">
        <AnalysisChart buckets={buckets} series={[{ values: laying, color: '#e03127', label: 'Laying' }, { values: sitting, color: '#f97316', label: 'Sitting' }]} />
        <Legend series={[{ values: laying, color: '#e03127', label: 'Laying' }, { values: sitting, color: '#f97316', label: 'Sitting' }]} />
      </AcBlock>
      <AcBlock label="Sleep low vs high HR">
        <AnalysisChart buckets={buckets} series={[{ values: lowHr, color: '#38bdf8', label: 'Low' }, { values: highHr, color: '#e03127', label: 'High' }]} />
        <Legend series={[{ values: lowHr, color: '#38bdf8', label: 'Low' }, { values: highHr, color: '#e03127', label: 'High' }]} />
      </AcBlock>
      <AcBlock label="Orthostatic delta (standing − resting)">
        <AnalysisChart buckets={buckets} series={[{ values: ortho, color: '#a78bfa', label: '' }]} />
      </AcBlock>
      {layAvg != null ? (
        <AcInsight strength={layAvg <= 67 ? 'strong' : null} text={`Morning lying HR averages ${Math.round(layAvg)} - pre-illness baseline was trending toward 60–65.`} />
      ) : null}
    </AcCard>
  );
}

// ===================== Blood Oxygen =====================
export function acBloodOxygen(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const spo2 = acAgg(buckets, (d) => acReadVals(d, 'bloodO2', 'value'), days);
  if (!acPresent(spo2).length) return null;
  let lowN = 0;
  Object.keys(days).forEach((dk) => acReadVals(days[dk], 'bloodO2', 'value').forEach((v) => { if (v < 94) lowN++; }));
  return (
    <AcCard title="Blood Oxygen" sub={acRangeLabel(mode)}>
      <AcBlock label="SpO₂">
        <AnalysisChart buckets={buckets} series={[{ values: spo2, color: '#16a34a', label: '', pointBands: BANDS.spo2 }]} opts={{ zones: acBandZones('spo2') || undefined }} />
      </AcBlock>
      <AcBlock label="Perfusion index">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'bloodO2', 'perfusion'), days), color: '#38bdf8', label: '' }]} />
      </AcBlock>
      {lowN ? <AcInsight strength="mod" text={`${lowN} reading${lowN === 1 ? '' : 's'} dropped below 94% SpO₂.`} /> : null}
    </AcCard>
  );
}

// ===================== ECG =====================
export function acEcg(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const qtc = acAgg(buckets, (d) => acReadVals(d, 'ecg', 'qtc'), days);
  const hasEcg = Object.keys(days).some((dk) => (days[dk].readings || []).some((r) => r.type === 'ecg'));
  if (!acPresent(qtc).length && !hasEcg) return null;
  let sinus = 0, svt = 0, other = 0, abnDays = 0;
  Object.keys(days).forEach((dk) => {
    let abn = false;
    (days[dk].readings || []).forEach((r) => {
      if (r.type !== 'ecg') return;
      if ((r as any).sinus) sinus++;
      if ((r as any).svt) { svt++; abn = true; }
      if ((r as any).otherArrhythmia) { other++; abn = true; }
    });
    if (abn) abnDays++;
  });
  const rhythmRows: BarRow[] = [
    sinus ? { name: 'Sinus', count: sinus, color: SCORE_COLORS.great } : null,
    svt ? { name: 'SVT', count: svt, color: SCORE_COLORS.concerning } : null,
    other ? { name: 'Other arrhythmia', count: other, color: SCORE_COLORS.bad } : null,
  ].filter(Boolean) as BarRow[];

  return (
    <AcCard title="ECG" sub={acRangeLabel(mode)}>
      <AcBlock label="QTc">
        <AnalysisChart buckets={buckets} series={[{ values: qtc, color: '#e03127', label: '', pointBands: BANDS.qtc }]} opts={{ zones: acBandZones('qtc') || undefined, integer: true }} />
      </AcBlock>
      <AcBlock label="QRS duration">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'ecg', 'qrs'), days), color: '#38bdf8', label: '', pointBands: BANDS.qrs }]} opts={{ zones: acBandZones('qrs') || undefined, integer: true }} />
      </AcBlock>
      <AcBlock label="PR interval">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'ecg', 'pr'), days), color: '#a78bfa', label: '', pointBands: BANDS.pr }]} opts={{ zones: acBandZones('pr') || undefined, integer: true }} />
      </AcBlock>
      <AcBlock label="Ectopic beats">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'ecg', 'ectopic'), days), color: '#f97316', label: '', pointBands: BANDS.ectopic }]} opts={{ zones: acBandZones('ectopic') || undefined, integer: true }} />
      </AcBlock>
      {rhythmRows.length ? <AcBlock label="Rhythm classification"><AcBars rows={rhythmRows} /></AcBlock> : null}
      {abnDays ? <AcInsight strength="mod" text={`${abnDays} day${abnDays === 1 ? '' : 's'} recorded a rhythm abnormality (SVT or other).`} /> : null}
    </AcCard>
  );
}

// ===================== Orthostatic Events =====================
export function acOrthostatic(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const has = Object.keys(days).some((dk) => (days[dk].readings || []).some((r) => r.type === 'orthostatic'));
  if (!has) return null;
  const incOf = (r: Reading) => { const a = parseFloat((r as any).afterHr), b = parseFloat((r as any).beforeHr); return !isNaN(a) && !isNaN(b) ? a - b : null; };
  const dropOf = (r: Reading) => { const a = parseFloat((r as any).afterHr), m = parseFloat((r as any).hr1min); return !isNaN(a) && !isNaN(m) ? a - m : null; };
  const transitions: Record<string, number> = {};
  let potsN = 0;
  Object.keys(days).forEach((dk) => (days[dk].readings || []).forEach((r) => {
    if (r.type !== 'orthostatic') return;
    if ((r as any).transition) transitions[(r as any).transition] = (transitions[(r as any).transition] || 0) + 1;
    const inc = incOf(r);
    if (inc != null && inc >= 30) potsN++;
  }));
  const incVals = acAgg(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic').map(incOf).filter((v): v is number => v != null), days);
  const dropVals = acAgg(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic').map(dropOf).filter((v): v is number => v != null), days);
  const transRows: BarRow[] = Object.entries(transitions).map(([k, c]) => ({ name: k, count: c })).sort((a, b) => b.count - a.count);

  return (
    <AcCard title="Orthostatic Events" sub={acRangeLabel(mode)}>
      <AcBlock label="Events per period">
        <AnalysisChart buckets={buckets} series={[{ values: acAggSum(buckets, (d) => (d.readings || []).filter((r) => r.type === 'orthostatic').length || null, days), color: '#e03127', label: '' }]} opts={{ integer: true }} />
      </AcBlock>
      <AcBlock label="HR increase on standing (after − before)">
        <AnalysisChart buckets={buckets} series={[{ values: incVals, color: '#f97316', label: '', pointBands: BANDS.orthoIncrease }]} opts={{ zones: acBandZones('orthoIncrease') || undefined, integer: true }} />
      </AcBlock>
      <AcBlock label="HR drop by 1 min (peak − 1 min)">
        <AnalysisChart buckets={buckets} series={[{ values: dropVals, color: '#38bdf8', label: '', pointBands: BANDS.orthoRecovery }]} opts={{ zones: acBandZones('orthoRecovery') || undefined, integer: true }} />
      </AcBlock>
      <AcBlock label="HR after 1 min">
        <AnalysisChart buckets={buckets} series={[{ values: acAgg(buckets, (d) => acReadVals(d, 'orthostatic', 'hr1min'), days), color: '#a78bfa', label: '' }]} opts={{ integer: true }} />
      </AcBlock>
      {transRows.length ? <AcBlock label="Transition types"><AcBars rows={transRows} /></AcBlock> : null}
      {potsN ? <AcInsight strength="mod" text={`${potsN} event${potsN === 1 ? '' : 's'} reached a ≥30 bpm standing rise (the adult POTS-range threshold).`} /> : null}
    </AcCard>
  );
}

// ===================== Sleep =====================
export function acSleep(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const dur = acAgg(buckets, (d) => sleepHours(d), days);
  if (!acPresent(dur).length) return null;
  const bed = acAgg(buckets, (d) => { const t = acToDec(d.sleep && d.sleep.bed); return t == null ? null : t < 12 ? t + 24 : t; }, days);
  const wake = acAgg(buckets, (d) => acToDec(d.sleep && d.sleep.wake), days);
  const interruptions = acAggSum(buckets, (d) => (d.sleep && d.sleep.quality === 'interrupted') ? 1 : null, days);
  const lowHr = acAgg(buckets, (d) => (d.sleep && (d.sleep as any).hrLow != null ? parseFloat((d.sleep as any).hrLow) : null), days);
  const highHr = acAgg(buckets, (d) => (d.sleep && (d.sleep as any).hrHigh != null ? parseFloat((d.sleep as any).hrHigh) : null), days);
  // scatter: sleep hours vs morning structured RMSSD
  const pts: { x: number; y: number }[] = [];
  Object.keys(days).forEach((dk) => {
    const h = sleepHours(days[dk]);
    const rm = acReadVals(days[dk], 'breathHrv', 'rmssd', isMorning);
    if (h != null && rm.length) pts.push({ x: h, y: rm.reduce((s, v) => s + v, 0) / rm.length });
  });

  return (
    <AcCard title="Sleep" sub={acRangeLabel(mode)}>
      <AcBlock label="Duration (hours)">
        <AnalysisChart buckets={buckets} series={[{ values: dur, color: '#38bdf8', label: '' }]} opts={{ target: { from: 7, to: 9, color: '#16a34a' } }} />
      </AcBlock>
      <AcBlock label="Bedtime vs wake (24h clock)">
        <AnalysisChart buckets={buckets} series={[{ values: bed, color: '#a78bfa', label: 'Bed' }, { values: wake, color: '#f97316', label: 'Wake' }]} />
        <Legend series={[{ values: bed, color: '#a78bfa', label: 'Bed' }, { values: wake, color: '#f97316', label: 'Wake' }]} />
      </AcBlock>
      <AcBlock label="Sleep low vs high HR">
        <AnalysisChart buckets={buckets} series={[{ values: lowHr, color: '#38bdf8', label: 'Low' }, { values: highHr, color: '#e03127', label: 'High' }]} />
        <Legend series={[{ values: lowHr, color: '#38bdf8', label: 'Low' }, { values: highHr, color: '#e03127', label: 'High' }]} />
      </AcBlock>
      {pts.length >= 4 ? <AcBlock label="Sleep duration vs morning RMSSD"><AcScatter points={pts} xlabel="hours" ylabel="RMSSD" /></AcBlock> : null}
      <AcStats
        items={[
          { label: 'Avg sleep', value: avgRound(dur, 1), sub: 'h' },
          { label: 'Interrupted', value: interruptions.reduce((s: number, x) => s + (x || 0), 0) || null, sub: 'nights' },
        ]}
      />
    </AcCard>
  );
}

// ===================== Activity =====================
export function acActivity(ctx: CardCtx): React.ReactElement | null {
  const { days, profile, mode, buckets } = ctx;
  const mins = acAggSum(buckets, (d) => (d.activities || []).reduce((s, a) => s + (parseFloat((a as any).duration) || 0), 0) || null, days);
  const typeCounts: Record<string, number> = {};
  let activeDays = 0, restDays = 0;
  buckets.forEach((b) => b.days.forEach((dk) => {
    const acts = days[dk].activities || [];
    if (acts.length) { activeDays++; acts.forEach((a) => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; }); } else restDays++;
  }));
  const rows: BarRow[] = Object.entries(typeCounts).map(([ty, c]) => ({ name: ACTIVITY_TYPES[ty] ? ACTIVITY_TYPES[ty].label : ty, count: c })).sort((a, b) => b.count - a.count);
  if (!rows.length) return null;
  const strenuous = typeCounts.strenuousWork || 0, stressful = typeCounts.stressfulWork || 0;
  const actScores: number[] = [], restScores: number[] = [];
  Object.keys(days).forEach((dk) => {
    const d = days[dk];
    const sc = acDayScore(d, dk, profile);
    if (sc == null) return;
    ((d.activities || []).length ? actScores : restScores).push(sc);
  });
  const am = actScores.length ? Math.round(actScores.reduce((s, x) => s + x, 0) / actScores.length) : null;
  const rm = restScores.length ? Math.round(restScores.reduce((s, x) => s + x, 0) / restScores.length) : null;

  return (
    <AcCard title="Activity" sub={acRangeLabel(mode)}>
      <AcBlock label="Total exercise minutes">
        <AnalysisChart buckets={buckets} series={[{ values: mins, color: '#e03127', label: '' }]} opts={{ integer: true }} />
      </AcBlock>
      <AcBlock label="Activity types"><AcBars rows={rows} /></AcBlock>
      <AcStats
        items={[
          { label: 'Active days', value: activeDays || null },
          { label: 'Rest days', value: restDays || null },
          { label: 'Strenuous', value: strenuous || null, sub: 'events' },
          { label: 'Stressful work', value: stressful || null, sub: 'events' },
        ]}
      />
      {am != null && rm != null ? (
        <AcInsight strength={Math.abs(am - rm) >= 8 ? 'mod' : null} text={`Active days average ${am} autonomic score vs ${rm} on rest days.`} />
      ) : null}
    </AcCard>
  );
}

// ===================== Hydration =====================
export function acHydration(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const water = acAgg(buckets, (d) => (d.food && +d.food.water > 0 ? +d.food.water : null), days);
  const hasElec = Object.keys(days).some((dk) => (days[dk].meds || []).some((m) => m.type === 'liquidIv' || m.type === 'lmnt'));
  if (!acPresent(water).length && !hasElec) return null;
  const elec = acAggSum(buckets, (d) => (d.meds || []).filter((m) => m.type === 'liquidIv' || m.type === 'lmnt').length || null, days);
  return (
    <AcCard title="Hydration" sub={acRangeLabel(mode)}>
      <AcBlock label="Water (L/day)">
        <AnalysisChart buckets={buckets} series={[{ values: water, color: '#38bdf8', label: '' }]} opts={{ target: { from: 2.5, to: 3.5, color: '#16a34a' } }} />
      </AcBlock>
      <AcBlock label="Electrolyte packets (Liquid IV / LMNT)">
        <AnalysisChart buckets={buckets} series={[{ values: elec, color: '#a78bfa', label: '' }]} opts={{ integer: true }} />
      </AcBlock>
      <AcStats items={[{ label: 'Avg water', value: avgRound(water, 1), sub: 'L' }]} />
    </AcCard>
  );
}

// ===================== Calories & Nutrition =====================
export function acNutrition(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const cal = acAgg(buckets, (d) => { const t = ((d.food && d.food.meals) || []).reduce((s, m) => s + (parseInt((m as any).calories, 10) || 0), 0); return t > 0 ? t : null; }, days);
  const lastMeal = acAgg(buckets, (d) => { const times = ((d.food && d.food.meals) || []).map((m) => acMinOf(m.time)).filter((v): v is number => v != null); return times.length ? Math.max(...times) / 60 : null; }, days);
  const trig: Record<string, number> = {};
  let dinnerBy5 = 0;
  buckets.forEach((b) => b.days.forEach((dk) => {
    const f = days[dk].food;
    if (!f) return;
    Object.keys(f.triggers || {}).forEach((k) => { if ((f.triggers as any)[k] > 0 && TRIGGER_TYPES[k]) trig[k] = (trig[k] || 0) + (f.triggers as any)[k]; });
    if ((f.meals || []).some((m) => m.type === 'dinner' && m.time && m.time <= '17:00')) dinnerBy5++;
  }));
  const trigRows: BarRow[] = Object.entries(trig).map(([k, c]) => ({ name: TRIGGER_TYPES[k].label, count: c })).sort((a, b) => b.count - a.count);
  if (!acPresent(cal).length && !trigRows.length) return null;
  return (
    <AcCard title="Calories & Nutrition" sub={acRangeLabel(mode)}>
      <AcBlock label="Calories">
        <AnalysisChart buckets={buckets} series={[{ values: cal, color: '#e03127', label: '' }]} opts={{ integer: true }} />
      </AcBlock>
      <AcBlock label="Last meal time (24h)">
        <AnalysisChart buckets={buckets} series={[{ values: lastMeal, color: '#f97316', label: '' }]} />
      </AcBlock>
      {trigRows.length ? <AcBlock label="Trigger foods"><AcBars rows={trigRows} /></AcBlock> : null}
      <AcStats items={[{ label: 'Dinner by 5pm', value: dinnerBy5 || null, sub: 'days' }]} />
    </AcCard>
  );
}

// ===================== Bowel Movements =====================
export function acBowel(ctx: CardCtx): React.ReactElement | null {
  const { days, mode, buckets } = ctx;
  const has = Object.keys(days).some((dk) => days[dk].digestion && (days[dk].digestion.movements || []).length);
  if (!has) return null;
  const freq = acAgg(buckets, (d) => (d.digestion && d.digestion.movements ? d.digestion.movements.length : null), days);
  let without = 0;
  buckets.forEach((b) => b.days.forEach((dk) => { const dg = days[dk].digestion; if (dg && (dg.movements || []).length === 0) without++; }));
  return (
    <AcCard title="Bowel Movements" sub={acRangeLabel(mode)}>
      <AcBlock label="Movements per day">
        <AnalysisChart buckets={buckets} series={[{ values: freq, color: '#a78bfa', label: '' }]} />
      </AcBlock>
      <AcStats items={[{ label: 'Days without', value: without || null }, { label: 'Avg / day', value: avgRound(freq, 1) }]} />
    </AcCard>
  );
}

// ===================== Medications & Supplements =====================
export function acMeds(ctx: CardCtx): React.ReactElement | null {
  const { days, buckets } = ctx;
  const counts: Record<string, number> = {};
  let proto = 0, anyMeds = false;
  buckets.forEach((b) => b.days.forEach((dk) => {
    const meds = days[dk].meds || [];
    if (meds.length) anyMeds = true;
    const taken = new Set(meds.map((m) => m.type));
    taken.forEach((tp) => { counts[tp] = (counts[tp] || 0) + 1; });
    if (taken.has('allegra') && taken.has('pepsidAc') && taken.has('magGlycinate')) proto++;
  }));
  if (!anyMeds) return null;
  const rows: BarRow[] = Object.entries(counts).map(([tp, c]) => ({ name: MED_TYPES[tp] ? MED_TYPES[tp].label : tp, count: c })).sort((a, b) => b.count - a.count);
  return (
    <AcCard title="Medications & Supplements" sub="Days taken in range">
      <AcBars rows={rows} fmt={(c) => c + ' d'} />
      <AcStats items={[{ label: 'Core protocol days', value: proto || null, sub: 'Allegra+Pepcid+Mag' }]} />
    </AcCard>
  );
}

// ===================== Trigger Food Impact =====================
export function acTriggerImpact(ctx: CardCtx): React.ReactElement | null {
  const { days } = ctx;
  const rmByDay: Record<string, number> = {};
  const all: number[] = [];
  Object.keys(days).forEach((dk) => {
    const v = acReadVals(days[dk], 'breathHrv', 'rmssd');
    if (v.length) { rmByDay[dk] = v.reduce((s, x) => s + x, 0) / v.length; all.push(rmByDay[dk]); }
  });
  if (all.length < 5) return null;
  const baseline = all.reduce((s, x) => s + x, 0) / all.length;
  const keyOfDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows: { name: string; freq: number; cost: number | null; recovery: number | null }[] = [];
  Object.keys(TRIGGER_TYPES).forEach((tp) => {
    const tdays = Object.keys(days).filter((dk) => { const f = days[dk].food; return f && f.triggers && (f.triggers as any)[tp] > 0; });
    if (!tdays.length) return;
    const costs: number[] = [];
    let recoverySum = 0, recoveryN = 0;
    tdays.forEach((dk) => {
      const d0 = dateFromKey(dk);
      const samples: number[] = [];
      for (let k = 0; k <= 1; k++) { const ndk = keyOfDate(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k)); if (rmByDay[ndk] != null) samples.push(rmByDay[ndk]); }
      if (samples.length) costs.push(samples.reduce((s, x) => s + x, 0) / samples.length - baseline);
      for (let k = 1; k <= 5; k++) {
        const ndk = keyOfDate(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k));
        if (rmByDay[ndk] != null) { if (rmByDay[ndk] >= baseline) { recoverySum += k; recoveryN++; break; } if (k === 5) { recoverySum += 5; recoveryN++; } }
      }
    });
    const cost = costs.length ? costs.reduce((s, x) => s + x, 0) / costs.length : null;
    rows.push({ name: TRIGGER_TYPES[tp].label, freq: tdays.length, cost, recovery: recoveryN ? recoverySum / recoveryN : null });
  });
  if (!rows.length) return null;
  rows.sort((a, b) => (a.cost == null ? 1 : b.cost == null ? -1 : a.cost - b.cost));
  const costRows: BarRow[] = rows.filter((r) => r.cost != null && r.cost < 0).map((r) => ({ name: r.name, count: Math.round(-(r.cost as number) * 10) / 10, color: SCORE_COLORS.bad }));

  return (
    <AcCard title="Trigger Food Impact" sub="RMSSD cost = avg drop vs your baseline over trigger day + next day">
      <TriggerTable rows={rows} />
      {costRows.length ? <AcBlock label="RMSSD cost by trigger"><AcBars rows={costRows} /></AcBlock> : null}
    </AcCard>
  );
}

function TriggerTable({ rows }: { rows: { name: string; freq: number; cost: number | null; recovery: number | null }[] }) {
  const t = useTheme();
  const head = ['Trigger', 'Times', 'RMSSD cost', 'Recovery'];
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: t.border, paddingBottom: 6 }}>
        {head.map((h, i) => (
          <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontSize: 11, fontWeight: '700', color: t.textDim, textAlign: i === 0 ? 'left' : 'right' }}>{h}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: t.border }}>
          <Text style={{ flex: 2, fontSize: 13, color: t.text }} numberOfLines={1}>{r.name}</Text>
          <Text style={{ flex: 1, fontSize: 13, color: t.text, textAlign: 'right' }}>{String(r.freq)}</Text>
          <Text style={{ flex: 1, fontSize: 13, color: r.cost != null && r.cost < 0 ? SCORE_COLORS.bad : t.text, textAlign: 'right' }}>
            {r.cost == null ? '–' : (r.cost <= 0 ? '' : '+') + fmtNum(Math.round(r.cost * 10) / 10)}
          </Text>
          <Text style={{ flex: 1, fontSize: 13, color: t.text, textAlign: 'right' }}>
            {r.recovery == null ? '–' : `${fmtNum(Math.round(r.recovery * 10) / 10)} d`}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ===================== Subjective vs Objective =====================
const MOOD_LEVELS: Record<string, number> = { 'Feeling amazing': 4, 'Feeling normal': 3, 'Feeling bad': 2, 'Feeling like a crash': 1 };
export function acSubjective(ctx: CardCtx): React.ReactElement | null {
  const { days, profile, buckets } = ctx;
  const moodVals = (d: Day): number[] | null => {
    const ms = (d.readings || []).filter((r) => r.type === 'mood' && MOOD_LEVELS[(r as any).mood]).map((r) => MOOD_LEVELS[(r as any).mood]);
    return ms.length ? ms : null;
  };
  const moodSeries = acAgg(buckets, (d) => moodVals(d), days);
  if (!acPresent(moodSeries).length) return null;
  const objLevel = (sc: number) => (sc >= 80 ? 4 : sc >= 63 ? 3 : sc >= 45 ? 2 : 1);
  const objSeries = acAgg(buckets, (d, dk) => { const sc = acDayScore(d, dk, profile); return sc == null ? null : objLevel(sc); }, days);
  let worse = 0, better = 0, aligned = 0;
  Object.keys(days).forEach((dk) => {
    const d = days[dk], mv = moodVals(d), sc = acDayScore(d, dk, profile);
    if (mv && sc != null) {
      const m = mv.reduce((s, x) => s + x, 0) / mv.length, o = objLevel(sc);
      if (m < o - 0.5) worse++;
      else if (m > o + 0.5) better++;
      else aligned++;
    }
  });
  return (
    <AcCard title="Subjective vs Objective" sub="Reported mood vs measured autonomic state (1 = crash · 4 = amazing)">
      <AcBlock label="Mood vs measured level">
        <AnalysisChart buckets={buckets} series={[{ values: moodSeries, color: '#a78bfa', label: 'Reported mood' }, { values: objSeries, color: '#e03127', label: 'Measured', dashed: true }]} opts={{ integer: true }} />
        <Legend series={[{ values: moodSeries, color: '#a78bfa', label: 'Reported mood' }, { values: objSeries, color: '#e03127', label: 'Measured', dashed: true }]} />
      </AcBlock>
      <AcStats
        items={[
          { label: 'Felt worse than data', value: worse || null, sub: 'days' },
          { label: 'Felt better than data', value: better || null, sub: 'days' },
          { label: 'Aligned', value: aligned || null, sub: 'days' },
        ]}
      />
      {worse >= 3 && worse > better ? <AcInsight strength="mod" text={`You felt worse than your measurements on ${worse} days - possible anxiety amplification when the data was actually okay.`} /> : null}
      {better >= 3 && better > worse ? <AcInsight strength="mod" text={`You felt better than your measurements on ${better} days - watch for early illness the data may catch before you feel it.`} /> : null}
    </AcCard>
  );
}

// ===================== Correlation Insights =====================
export function acCorrelations(ctx: CardCtx): React.ReactElement | null {
  const { days, profile } = ctx;
  const rows = acDailyMetrics(days, profile);
  type MKey = keyof DailyMetricRow;
  const pearsonOf = (xKey: MKey, yKey: MKey, lag?: boolean) => {
    const pairs: [number, number][] = [];
    rows.forEach((r, i) => {
      const x = r[xKey] as number | null;
      let y = r[yKey] as number | null;
      if (lag) { const nx = rows[i + 1]; y = nx ? (nx[yKey] as number | null) : null; }
      if (x != null && !isNaN(x) && y != null && !isNaN(y)) pairs.push([x, y]);
    });
    const rr = acPearson(pairs);
    return rr == null ? null : { r: rr, n: pairs.length };
  };
  const dir = (r: number) => (r > 0 ? 'higher' : 'lower');
  const defs: { x: MKey; y: MKey; lag?: boolean; txt: (r: number, n: number) => string }[] = [
    { x: 'sleepH', y: 'mornRmssd', txt: (r, n) => `On nights you slept longer, next-morning structured RMSSD ran ${dir(r)} (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'sleepH', y: 'score', txt: (r, n) => `More sleep tracked with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'water', y: 'score', txt: (r, n) => `Days you drank more water showed a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'triggers', y: 'score', txt: (r, n) => `More trigger foods correlated with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'triggers', y: 'structRmssd', lag: true, txt: (r, n) => `Trigger foods one day tracked with ${dir(r)} structured RMSSD the next (r ${r.toFixed(2)}, ${n} day-pairs).` },
    { x: 'restHr', y: 'score', txt: (r, n) => `Higher morning lying HR went with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'actMin', y: 'score', txt: (r, n) => `More activity minutes tracked with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'bm', y: 'score', txt: (r, n) => `Bowel-movement count correlated with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'calories', y: 'score', txt: (r, n) => `Higher daily calories went with a ${dir(r)} autonomic score (r ${r.toFixed(2)}, ${n} days).` },
    { x: 'lastMealMin', y: 'mornRmssd', lag: true, txt: (r, n) => `Later last-meal time tracked with ${dir(r)} next-morning RMSSD (r ${r.toFixed(2)}, ${n} day-pairs).` },
  ];
  const found: { r: number; n: number; txt: string; strength: string | null }[] = [];
  defs.forEach((d) => {
    const res = pearsonOf(d.x, d.y, d.lag);
    if (res && res.n >= 14 && Math.abs(res.r) >= 0.3) {
      found.push({ ...res, txt: d.txt(res.r, res.n), strength: Math.abs(res.r) >= 0.6 ? 'strong' : Math.abs(res.r) >= 0.45 ? 'mod' : null });
    }
  });
  if (!found.length) return null;
  found.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return (
    <AcCard title="Correlation Insights" sub="Pearson correlations · 14+ days, |r| ≥ 0.3">
      {found.slice(0, 10).map((f, i) => <AcInsight key={i} text={f.txt} strength={f.strength} />)}
    </AcCard>
  );
}
