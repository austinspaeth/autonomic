/**
 * Reading-summary building blocks (heroCard, sumCard, MetricRow) and the
 * per-type summary screens — ported from the PWA's *Summary functions.
 * Each metric row carries its grade dot, value, explainer and a sparkline
 * with grade-zone bands (Sparkline over metricHistory).
 */
import React from 'react';
import { Text, View } from 'react-native';
import { radius, usePalette } from '../theme';
import type { Band, Entry, ScoreCat } from '../lib/types';
import {
  BANDS, GRADE_LABEL, HRV_EXPLAIN, SCORE_COLORS, bandsFor,
  bpBce, bpKerdo, bpKvas, bpMap, bpPP, bpRobinson, catFromBands, computeScores,
  expectedHf, hrvComposite, numOr, restingHrBands,
  rowScoreCategory, totalPower, type ScoreContext,
} from '../lib/scoring';
import { metricHistory, numEx, type DaysMap } from '../lib/scoring/day';
import { entryFields, isDivider, READING_TYPES } from '../lib/registry';
import { fmtNum } from '../lib/dates';
import { PowerSpectrum, Sparkline, Tachogram } from './charts';
import { ScoreDot } from './ui';

const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function HeroCard({ cat, label, big, den, sub, tip }: {
  cat?: ScoreCat | null; label?: string; big?: string | number; den?: string; sub?: string; tip?: string;
}) {
  const p = usePalette();
  const color = cat && SCORE_COLORS[cat] ? SCORE_COLORS[cat] : '#9aa0a6';
  return (
    <View style={{ borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 16, backgroundColor: hexA(color, 0.15), borderColor: hexA(color, 0.45) }}>
      {cat ? (
        <View style={{ position: 'absolute', top: 14, right: 14, backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{GRADE_LABEL[cat]}</Text>
        </View>
      ) : null}
      {label ? <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 3 }}>
        <Text style={{ fontSize: 42, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'] }}>{big != null && big !== '' ? String(big) : '-'}</Text>
        {den ? <Text style={{ fontSize: 17, fontWeight: '700', color: p.textDim, marginLeft: 3 }}>{den}</Text> : null}
      </View>
      {sub ? <Text style={{ fontSize: 13, color: p.textDim, marginTop: 6 }}>{sub}</Text> : null}
      {tip ? <Text style={{ fontSize: 15, fontWeight: '600', color: p.text, marginTop: 12, lineHeight: 20 }}>{tip}</Text> : null}
    </View>
  );
}

export function SumCard({ title, children }: { title?: string; children: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 12, marginBottom: 16 }}>
      {title ? <Text style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', paddingVertical: 8 }}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function MetricRow({ label, value, cat, explain, spark }: {
  label: string; value?: string | number | null; cat?: ScoreCat | null | false; explain?: string; spark?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {cat === false ? null : <ScoreDot cat={cat || null} />}
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: p.text }}>{label}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: p.text, fontVariant: ['tabular-nums'] }}>{value == null || value === '' ? '-' : String(value)}</Text>
      </View>
      {explain ? <Text style={{ fontSize: 13, color: p.textDim, marginTop: 6, lineHeight: 17 }}>{explain}</Text> : null}
      {spark}
    </View>
  );
}

function TextBlock({ text }: { text: string }) {
  const p = usePalette();
  return <Text style={{ fontSize: 15, color: p.text, lineHeight: 20 }}>{text}</Text>;
}

export interface SummaryProps { r: Entry; days: DaysMap; ctx: ScoreContext }

const spark = (days: DaysMap, type: string, ex: (r: Entry) => number | null, bands: Band[] | null, limit = 15) => {
  const hist = metricHistory(days, type, ex, limit);
  return hist.length >= 2 ? <Sparkline points={hist} bands={bands} /> : null;
};

/* ---------- dispatcher ---------- */
export function ReadingSummary({ r, days, ctx }: SummaryProps) {
  switch (r.type) {
    case 'breathHrv': return <BreathingSummary r={r} days={days} ctx={ctx} />;
    case 'hrv': return <UnstructuredSummary r={r} days={days} ctx={ctx} />;
    case 'bp': return <BpSummary r={r} days={days} ctx={ctx} />;
    case 'restingHr': return <RestingHrSummary r={r} days={days} ctx={ctx} />;
    case 'orthostatic': return <OrthostaticSummary r={r} days={days} ctx={ctx} />;
    default: return <GenericSummary r={r} days={days} ctx={ctx} />;
  }
}

const HRV_VERDICT: Record<string, string> = {
  great: 'Strong parasympathetic reserves today. Fine for your normal protocol or intervals.',
  good: 'Solid recovery state. Easy to normal activity is reasonable.',
  ok: 'Moderate reserves. Keep it easy and avoid pushing.',
  bad: 'Low reserves. Favor rest and gentle activity today.',
  crash: 'Very low reserves. Prioritize rest and recovery.',
};

function PowerSection({ r, days, ctx, type }: { r: Entry; days: DaysMap; ctx: ScoreContext; type: 'breathHrv' | 'hrv' }) {
  const p = usePalette();
  const s = computeScores(r, ctx);
  const n = (k: string) => { const x = parseFloat(r[k] as string); return isNaN(x) ? null : x; };
  const vlf = n('vlowPower'), lf = n('lowPower'), hf = n('highPower');
  const total = [vlf, lf, hf].some((v) => v != null) ? [vlf, lf, hf].reduce((a, b) => a! + (b || 0), 0)! : null;
  const lfhf = lf != null && hf ? lf / hf : null;
  const lfhfEx = (rr: Entry) => { const a = parseFloat(rr.lowPower as string), b = parseFloat(rr.highPower as string); return !isNaN(a) && !isNaN(b) && b !== 0 ? a / b : null; };
  const e = expectedHf(r.style);
  const rrClean = (r.rrClean as number[] | undefined) || (r.rrRaw as number[] | undefined) || null;
  return (
    <SumCard title="Power">
      {(total || (rrClean && rrClean.length >= 16)) ? <View style={{ backgroundColor: p.surface, borderRadius: radius.control, padding: 14, marginBottom: 10 }}><PowerSpectrum rr={rrClean} vlf={vlf} lf={lf} hf={hf} /></View> : null}
      <MetricRow label="Total power" value={total != null ? Math.round(total) : ''} cat={s.totalPower} explain="Total autonomic engagement across all frequencies." spark={spark(days, type, (rr) => totalPower(rr), BANDS.totalPower)} />
      <MetricRow label="LF/HF ratio" value={lfhf != null ? lfhf.toFixed(2) : ''} cat={s.lfhf} explain="Sympathetic vs vagal balance. Balanced or low favors flexibility." spark={spark(days, type, lfhfEx, BANDS.lfhf)} />
      <MetricRow label="VLF power" value={r.vlowPower as string} cat={s.vlf} explain="Slow regulatory processes and stress load. Elevated means system stress." spark={spark(days, type, numEx('vlowPower'), BANDS.vlf)} />
      <MetricRow label="LF power" value={r.lowPower as string} explain="Baroreflex band, your training target." spark={spark(days, type, numEx('lowPower'), null)} />
      <MetricRow label="HF power" value={r.highPower as string} explain="Vagal activity tied to breathing. Higher means better recovery state." spark={spark(days, type, numEx('highPower'), null)} />
      <MetricRow label="LF peak" value={r.lfPeak ? `${r.lfPeak} Hz` : ''} cat={s.lfPeak} explain="Baroreflex frequency. Target 0.08 to 0.10 Hz; shifting toward it is progress." spark={spark(days, type, numEx('lfPeak'), BANDS.lfPeak)} />
      <MetricRow label="HF peak" value={r.hfPeak ? `${r.hfPeak} Hz` : ''} cat={s.hfPeak} explain={e ? `Expected about ${e[0]} to ${e[1]} Hz for ${r.style} breathing; large deviation means the pace drifted.` : 'Respiratory (breathing) peak. A peak inside 0.15–0.40 Hz reflects normal respiratory sinus arrhythmia.'} spark={spark(days, type, numEx('hfPeak'), BANDS.hfPeak)} />
    </SumCard>
  );
}

function MetricsSection({ r, days, ctx, type }: { r: Entry; days: DaysMap; ctx: ScoreContext; type: 'breathHrv' | 'hrv' }) {
  const s = computeScores(r, ctx);
  const rmssdBand = type === 'breathHrv' ? BANDS.rmssdS : BANDS.rmssdU;
  const hrKey = type === 'breathHrv' ? 'hr' : 'avgHr';
  return (
    <SumCard title="Metrics">
      <MetricRow label="RMSSD" value={r.rmssd as string} cat={s.rmssd} explain={HRV_EXPLAIN.rmssd} spark={spark(days, type, numEx('rmssd'), rmssdBand)} />
      <MetricRow label="pNN50" value={r.pnn50 ? `${r.pnn50}%` : ''} cat={s.pnn50} explain={HRV_EXPLAIN.pnn50} spark={spark(days, type, numEx('pnn50'), BANDS.pnn50)} />
      <MetricRow label="SDNN" value={r.sdnn as string} cat={s.sdnn} explain={HRV_EXPLAIN.sdnn} spark={spark(days, type, numEx('sdnn'), BANDS.sdnn)} />
      <MetricRow label={type === 'breathHrv' ? 'HR' : 'Avg HR'} value={r[hrKey] as string} cat={type === 'breathHrv' ? s.hr : s.avgHr} explain={HRV_EXPLAIN.hr} spark={spark(days, type, numEx(hrKey), BANDS.hrBreath)} />
      <MetricRow label="Mean RR" value={r.meanRr as string} cat={s.meanRr} explain={HRV_EXPLAIN.meanRr} spark={spark(days, type, numEx('meanRr'), BANDS.rrMode)} />
      <MetricRow label="MxDMn" value={r.mxdmn as string} cat={s.mxdmn} explain={HRV_EXPLAIN.mxdmn} spark={spark(days, type, numEx('mxdmn'), BANDS.mxdmn)} />
      <MetricRow label="Mode" value={r.mode as string} cat={s.mode} explain={HRV_EXPLAIN.mode} spark={spark(days, type, numEx('mode'), BANDS.rrMode)} />
      <MetricRow label="AMo50" value={r.amo50 as string} cat={s.amo50} explain={HRV_EXPLAIN.amo50} spark={spark(days, type, numEx('amo50'), BANDS.amo50)} />
      <MetricRow label="CV" value={r.cv as string} cat={s.cv} explain={HRV_EXPLAIN.cv} spark={spark(days, type, numEx('cv'), BANDS.cv)} />
    </SumCard>
  );
}

function Notes({ r }: { r: Entry }) {
  if (!r.note) return null;
  return <SumCard title="Notes"><MetricRow label="" value="" cat={false} /><TextBlock text={r.note as string} /></SumCard>;
}

/**
 * Both HRV kinds render the identical set of measurements — the only
 * difference is the breathing-style row (structured only) and which RMSSD/HR
 * grade band applies (handled inside PowerSection/MetricsSection by `type`).
 */
function HrvSummaryBody({ r, days, ctx, type }: SummaryProps & { type: 'breathHrv' | 'hrv' }) {
  const p = usePalette();
  const s = computeScores(r, ctx);
  const { score, overall } = hrvComposite(r, ctx);
  const rr = (r.rrClean as number[] | undefined) || (r.rrRaw as number[] | undefined) || null;
  return (
    <>
      <HeroCard cat={overall} label="Autonomic score" big={score ?? '-'} den={score != null ? '/100' : ''} sub="Composite of vagal tone, power, and baroreflex position." tip={overall ? HRV_VERDICT[overall] : ''} />
      {rr && rr.length > 2 ? (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginBottom: 8 }}>Beat-to-beat intervals</Text>
          <Tachogram rr={rr} />
        </View>
      ) : null}
      <SumCard title="Details">
        {type === 'breathHrv' ? <MetricRow label="Breathing style" value={(r.style as string) || '—'} cat={false} explain="Intended pace for this reading." /> : null}
        {r.period ? <MetricRow label="Reading type" value={r.period as string} cat={false} /> : null}
      </SumCard>
      <SumCard title="Autonomic balance">
        <MetricRow label="PNS index" value={r.pns as string} cat={s.pns} explain="Parasympathetic (rest and recovery) activity. Higher means more vagal dominance." spark={spark(days, type, numEx('pns'), BANDS.pns)} />
        <MetricRow label="SNS index" value={r.sns as string} cat={s.sns} explain="Sympathetic (activation and stress) activity. Lower is calmer." spark={spark(days, type, numEx('sns'), BANDS.sns)} />
        <MetricRow label="Stress index" value={r.stressIndex as string} cat={s.stressIndex} explain="Baevsky stress index. Higher means more sympathetic strain and rigidity." spark={spark(days, type, numEx('stressIndex'), BANDS.stressIndex)} />
      </SumCard>
      <PowerSection r={r} days={days} ctx={ctx} type={type} />
      <MetricsSection r={r} days={days} ctx={ctx} type={type} />
      <Notes r={r} />
    </>
  );
}

export function BreathingSummary(props: SummaryProps) {
  return <HrvSummaryBody {...props} type="breathHrv" />;
}

export function UnstructuredSummary(props: SummaryProps) {
  return <HrvSummaryBody {...props} type="hrv" />;
}

export function BpSummary({ r, days, ctx }: SummaryProps) {
  const s = computeScores(r, ctx);
  const cat = rowScoreCategory(r, ctx);
  const verdict: Record<string, string> = {
    great: 'Pressure is in a healthy range.', good: 'Pressure is reasonable today.',
    ok: 'Slightly outside your ideal range; keep an eye on it.', bad: 'Out of range; note context like salt, fluids, meds, or stress.',
    concerning: 'Well outside range; consider rechecking and noting context.',
  };
  const stat = (label: string, ex: (r: Entry) => number | null, bands: Band[], explain: string) => {
    const v = ex(r);
    const c = v != null ? catFromBands(v, bands) : null;
    return <MetricRow label={label} value={v != null ? fmtNum(v) : ''} cat={c} explain={explain} spark={spark(days, 'bp', ex, bands)} />;
  };
  return (
    <>
      <HeroCard cat={cat} label="Blood pressure" big={r.sys || r.dia ? `${r.sys || '-'}/${r.dia || '-'}` : ''} sub="Systolic / diastolic" tip={cat ? verdict[cat] : ''} />
      <SumCard title="Details">
        <MetricRow label="Systolic" value={r.sys as string} cat={s.sys} explain="Peak arterial pressure during a heartbeat." spark={spark(days, 'bp', numEx('sys'), BANDS.sys)} />
        <MetricRow label="Diastolic" value={r.dia as string} cat={s.dia} explain="Arterial pressure between beats." spark={spark(days, 'bp', numEx('dia'), BANDS.dia)} />
        <MetricRow label="Pulse" value={r.pulse as string} cat={false} explain="Heart rate at the time of the reading." spark={spark(days, 'bp', numEx('pulse'), null)} />
        {r.period ? <MetricRow label="Reading type" value={r.period as string} cat={false} /> : null}
      </SumCard>
      <SumCard title="Pressure statistics">
        {stat('Mean arterial pressure', bpMap, BANDS.map, 'Average pressure perfusing your organs and brain. Low MAP drives lightheadedness in dysautonomia.')}
        {stat('Pulse pressure', bpPP, BANDS.pp, 'Gap between systolic and diastolic. Low (under 30) suggests low stroke volume or dehydration.')}
      </SumCard>
      <SumCard title="Indexes">
        {stat('Kerdo index', bpKerdo, BANDS.kerdo, 'Autonomic balance from pulse and diastolic. Positive means sympathetic dominance.')}
        {stat('Robinson index', bpRobinson, BANDS.robinson, 'Double product: myocardial oxygen demand at rest. Lower is more efficient.')}
        {stat('BCE index', bpBce, BANDS.bce, 'Blood-circulation economy (pulse pressure x pulse). Higher means a more strained circulation.')}
        {stat('Kvas coefficient', bpKvas, BANDS.kvas, 'Coefficient of endurance. Around 16 is typical; higher suggests cardiovascular fatigue.')}
      </SumCard>
      <Notes r={r} />
    </>
  );
}


export function RestingHrSummary({ r, days, ctx }: SummaryProps) {
  const cat = rowScoreCategory(r, ctx);
  const verdict: Record<string, string> = {
    great: 'Resting heart rate is in a strong range.', good: 'Resting heart rate is healthy.',
    ok: 'Slightly elevated for rest.', bad: 'Elevated resting heart rate; note context.', concerning: 'High resting heart rate; consider rechecking and context.',
  };
  const band = restingHrBands(r.position);
  const hrCat = r.hr !== '' && r.hr != null ? catFromBands(+(r.hr as number), band) : null;
  return (
    <>
      <HeroCard cat={cat} label="Resting heart rate" big={(r.hr as string) || ''} den="bpm" sub={(r.position as string) || ''} tip={cat ? verdict[cat] : ''} />
      <SumCard title="Heart rate">
        <MetricRow label="HR" value={r.hr as string} cat={hrCat} explain={`Resting heart rate (${((r.position as string) || 'laying').toLowerCase()}). Lower generally reflects stronger parasympathetic tone.`} spark={spark(days, 'restingHr', numEx('hr'), band)} />
        <MetricRow label="Position" value={r.position as string} cat={false} explain="Body position during the reading; thresholds differ for laying vs sitting." />
      </SumCard>
      <Notes r={r} />
    </>
  );
}

export function OrthostaticSummary({ r, days, ctx }: SummaryProps) {
  const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
  const increase = before != null && after != null ? after - before : null;
  const drop = after != null && min1 != null ? after - min1 : null;
  const incCat = increase != null ? catFromBands(increase, BANDS.orthoIncrease) : null;
  const dropCat = drop != null ? catFromBands(drop, BANDS.orthoRecovery) : null;
  const signed = (v: number) => (v > 0 ? '+' + v : String(v));
  const p = usePalette();
  const verdict: Record<string, string> = {
    great: 'Minimal heart-rate rise on standing - a healthy orthostatic response.',
    good: 'Normal orthostatic rise, within the expected physiologic range.',
    ok: 'Borderline rise at the upper end of normal. Worth keeping an eye on.',
    bad: 'Large rise - at or above the adult ≥30 bpm POTS-range threshold. Note context.',
    concerning: 'Marked rise - at or above the ≥40 bpm threshold. Hydrate, sit or lie down, and log context.',
  };
  const incEx = (rr: Entry) => { const b = numOr(rr.beforeHr), a = numOr(rr.afterHr); return b != null && a != null ? a - b : null; };
  const dropEx = (rr: Entry) => { const a = numOr(rr.afterHr), m = numOr(rr.hr1min); return a != null && m != null ? a - m : null; };
  const stat = (label: string, val: number | null, unit: string) => (
    <View style={{ flex: 1, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 14, alignItems: 'center' }}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: p.textDim, fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: 32, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'] }}>{val != null ? String(val) : '-'}</Text>
      <Text style={{ fontSize: 11, color: p.textDim }}>{unit}</Text>
    </View>
  );
  return (
    <>
      <HeroCard cat={incCat} label={(r.transition as string) || 'Orthostatic event'} big={increase != null ? signed(increase) : ''} den="bpm rise" sub="Rated on the heart-rate increase from baseline to standing." tip={incCat ? verdict[incCat] : 'Enter Before HR and After HR to rate this event.'} />
      <SumCard title="Heart rate">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {stat('Before HR', before, 'bpm · baseline')}
          {stat('After HR', after, 'bpm · standing')}
        </View>
      </SumCard>
      <SumCard title="HR increase">
        <MetricRow label="Standing HR increase" value={increase != null ? `${signed(increase)} bpm` : ''} cat={incCat} explain="After HR minus Before HR. A sustained rise of 30+ bpm (40+ in teens) within 10 minutes of standing is the POTS threshold." spark={spark(days, 'orthostatic', incEx, BANDS.orthoIncrease)} />
      </SumCard>
      <SumCard title="Recovery after 1 minute">
        <MetricRow label="HR after 1 min" value={min1 != null ? `${min1} bpm` : ''} cat={false} explain="Heart rate one minute after standing, as recorded." />
        <MetricRow label="HR drop by 1 min" value={drop != null ? `${drop} bpm` : ''} cat={dropCat} explain="How far HR fell from its standing peak after one minute (Peak − HR@1min). A larger settle-down means stronger baroreflex and vagal recovery." spark={spark(days, 'orthostatic', dropEx, BANDS.orthoRecovery)} />
      </SumCard>
      <Notes r={r} />
    </>
  );
}

export function GenericSummary({ r, days, ctx }: SummaryProps) {
  const p = usePalette();
  const def = READING_TYPES[r.type];
  const s = computeScores(r, ctx);
  return (
    <>
      <HeroCard cat={rowScoreCategory(r, ctx)} big="" label="Result" />
      <SumCard title="Details">
        {entryFields(def).map((f) => {
          if (isDivider(f) || f.type === 'time') return null;
          if (f.type === 'check') return <MetricRow key={f.key} label={f.label!} value={r[f.key!] ? 'Yes' : 'No'} cat={r[f.key!] ? (f.key === 'sinus' ? 'great' : 'bad') : null} />;
          if (f.type === 'textarea') return r[f.key!] ? (<View key={f.key} style={{ marginBottom: 10 }}><Text style={{ fontWeight: '700', color: p.text, marginBottom: 4 }}>{f.label}</Text><TextBlock text={r[f.key!] as string} /></View>) : null;
          const v = r[f.key!];
          if (v == null || v === '') return null;
          return <MetricRow key={f.key} label={f.label!} value={`${v}${f.unit ? ` ${f.unit}` : ''}`} cat={s[f.key!]} spark={spark(days, r.type, numEx(f.key!), bandsFor(r.type, f.key!))} />;
        })}
      </SumCard>
      <Notes r={r} />
    </>
  );
}
