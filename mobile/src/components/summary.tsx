/**
 * Reading-summary building blocks and the per-type summary screens, styled
 * after the Progress view's metric cards: each stat is a surface card with a
 * grade dot + uppercase title + "?" help dot, a big value with a dim unit
 * suffix, a one-line description, then the recent-readings sparkline with a
 * "Show zones" link. Dragging a sparkline mirrors that reading in the big
 * value (value + date) and its grade dot, like the Progress charts.
 *
 * HeroCard / SumCard / MetricRow further down are the older row primitives,
 * kept for the day-score breakdown (DaySummary).
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { fonts, radius, usePalette } from '../theme';
import type { Band, Entry, ScoreCat } from '../lib/types';
import {
  BANDS, GRADE_LABEL, HRV_EXPLAIN, HRV_HELP, SCORE_COLORS, bandsFor,
  bpBce, bpKerdo, bpKvas, bpMap, bpPP, bpRobinson, catFromBands, computeScores,
  expectedHf, hrvComposite, numOr, restingHrBands,
  rowScoreCategory, totalPower, type ScoreContext,
} from '../lib/scoring';
import { metricHistory, numEx, type DaysMap } from '../lib/scoring/day';
import { entryFields, isDivider, READING_TYPES } from '../lib/registry';
import { fmtNum, fmtShort } from '../lib/dates';
import { correctArtifacts } from '../lib/hrv';
import { getWaveform } from '../store/store';
import { BalanceChart, PowerSpectrum, Sparkline, Tachogram, ZonesToggle, balanceCat } from './charts';
import { HelpDot, ScoreDot } from './ui';

const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Map a reading's capture source to a human label for the Details card.
 *  Bluetooth ('polar') readings prefer the stamped device name (`sourceName`);
 *  this map is the fallback for readings captured before names were stamped. */
const SOURCE_LABEL: Record<string, string> = { polar: 'Bluetooth device', watch: 'Apple Watch', camera: 'Device camera', manual: 'Manual entry' };

function sourceLabelFor(r: Entry): string | undefined {
  if (r.source === 'polar' && r.sourceName) return String(r.sourceName);
  return r.source ? SOURCE_LABEL[r.source as string] : undefined;
}

/* ---------- legacy primitives (still used by DaySummary) ---------- */

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

export function MetricRow({ label, value, cat, explain, spark, bare }: {
  label: string; value?: string | number | null; cat?: ScoreCat | null | false; explain?: string; spark?: React.ReactNode;
  /** Drop the dark card chrome so the row sits directly on the parent surface. */
  bare?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={bare
      ? { paddingVertical: 12 }
      : { backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {cat === false ? null : <ScoreDot cat={cat || null} />}
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: p.text }}>{label}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 16, fontWeight: '700', color: p.text, fontVariant: ['tabular-nums'], maxWidth: '70%' }}>{value == null || value === '' ? '-' : String(value)}</Text>
      </View>
      {explain ? <Text style={{ fontSize: 13, color: p.textDim, marginTop: 6, lineHeight: 17 }}>{explain}</Text> : null}
      {spark}
    </View>
  );
}

/* ---------- Progress-card-style building blocks ---------- */

/** Card container matching the Progress view's metric cards. It sits on the
 *  sheet's `surface` backdrop, so the card is one step lighter (surface2).
 *  With `cat` it becomes the hero treatment: tinted with the grade colour and
 *  wearing the grade tag in the top-right corner (like the old HeroCard). */
function Section({ children, cat }: { children: React.ReactNode; cat?: ScoreCat | null }) {
  const p = usePalette();
  const color = cat && SCORE_COLORS[cat] ? SCORE_COLORS[cat] : null;
  return (
    <View
      style={{
        backgroundColor: color ? hexA(color, 0.15) : p.surface2,
        borderColor: color ? hexA(color, 0.45) : p.border,
        borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12,
      }}
    >
      {color && cat ? (
        <View style={{ position: 'absolute', top: 14, right: 14, zIndex: 1, backgroundColor: color, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{GRADE_LABEL[cat]}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Section header per the Progress comp: grade dot + uppercase title + "?"
 *  help dot (left), optional action (right); beneath it the big value with its
 *  dim suffix, then a one-line description. */
function SectionHead({ title, help, cat, value, suffix, desc, right }: {
  title: string; help?: string; cat?: ScoreCat | null;
  value?: string | null; suffix?: string; desc?: string; right?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cat ? <View style={{ marginRight: 7 }}><ScoreDot cat={cat} size={10} /></View> : null}
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>{title}</Text>
        {help ? <HelpDot title={title} text={help} /> : null}
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {value != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 6 }}>
          <Text style={{ fontSize: 27, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
          {suffix ? <Text style={{ fontSize: 13, fontWeight: '600', color: p.textDim }}>{suffix}</Text> : null}
        </View>
      ) : null}
      {desc ? <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{desc}</Text> : null}
    </View>
  );
}

/** Small label/value line for non-scored details inside a Section. */
/**
 * One metric as a Progress-style card. The big value is this reading's value
 * by default; dragging the history sparkline mirrors that reading instead
 * (value + date, dot re-graded for that point). Hidden entirely when there is
 * neither a value nor any history to chart.
 */
function MetricSection({ label, value, suffix, cat, desc, help, days, type, ex, bands, hero }: {
  label: string; value?: string | number | null; suffix?: string; cat?: ScoreCat | null;
  desc?: string; help?: string; days: DaysMap; type: string;
  ex: (r: Entry) => number | null; bands?: Band[] | null;
  /** Hero treatment: grade-tinted container + corner tag instead of the dot. */
  hero?: boolean;
}) {
  const [showZones, setShowZones] = useState(false);
  const [sel, setSel] = useState<{ v: number; date: string } | null>(null);
  const hist = metricHistory(days, type, ex, 15);
  const hasSpark = hist.length >= 2;
  const hasValue = value != null && value !== '';
  if (!hasValue && !hasSpark) return null;
  const shown = sel ? fmtNum(sel.v) : hasValue ? String(value) : '–';
  const shownCat = sel ? (bands ? catFromBands(sel.v, bands) : null) : cat ?? null;
  const shownSuffix = sel ? [suffix, `(${fmtShort(sel.date)})`].filter(Boolean).join(' · ') : suffix;
  return (
    <Section cat={hero ? cat : undefined}>
      <SectionHead
        title={label} help={help} cat={hero ? undefined : shownCat}
        value={shown} suffix={shownSuffix} desc={desc}
        right={!hero && hasSpark && bands ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : undefined}
      />
      {/* Hero cards wear the grade tag in the header's corner, so the zones
          link moves down to the sparkline's own header row instead. */}
      {hasSpark ? (
        <Sparkline
          points={hist} bands={bands} onSelect={setSel}
          hideHeader={!(hero && bands)} showReadout={false}
          zonesOn={hero ? undefined : showZones}
        />
      ) : null}
    </Section>
  );
}

function Notes({ r }: { r: Entry }) {
  const p = usePalette();
  if (!r.note) return null;
  return (
    <Section>
      <SectionHead title="Notes" />
      <Text style={{ fontSize: 14, color: p.text, lineHeight: 20, marginTop: 10 }}>{r.note as string}</Text>
    </Section>
  );
}

export interface SummaryProps { r: Entry; days: DaysMap; ctx: ScoreContext }

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

/* ---------- HRV (structured + unstructured) ---------- */

const HRV_VERDICT: Record<string, string> = {
  great: 'Strong parasympathetic reserves today. Fine for your normal protocol or intervals.',
  good: 'Solid recovery state. Easy to normal activity is reasonable.',
  ok: 'Moderate reserves. Keep it easy and avoid pushing.',
  bad: 'Low reserves. Favor rest and gentle activity today.',
  crash: 'Very low reserves. Prioritize rest and recovery.',
};

/**
 * Both HRV kinds render the identical stack of metric cards — the only
 * difference is the breathing-style detail (structured only) and which
 * RMSSD/HR grade band applies.
 */
function HrvSummaryBody({ r, days, ctx, type }: SummaryProps & { type: 'breathHrv' | 'hrv' }) {
  const s = computeScores(r, ctx);
  const { score, overall } = hrvComposite(r, ctx);
  // Waveforms live in the sidecar store keyed by reading id — inline fields
  // exist only on pre-save live previews (and old imports mid-migration). The
  // cleaned series isn't stored at all; it's re-derived from rrRaw on demand.
  const rr = useMemo(() => {
    const w = getWaveform(String(r.id));
    const clean = (w && w.rrClean) || (r.rrClean as number[] | undefined);
    if (clean && clean.length) return clean;
    const raw = (w && w.rrRaw) || (r.rrRaw as number[] | undefined);
    return raw && raw.length ? correctArtifacts(raw).clean : null;
  }, [r]);
  const rmssdBand = type === 'breathHrv' ? BANDS.rmssdS : BANDS.rmssdU;
  const hrKey = type === 'breathHrv' ? 'hr' : 'avgHr';
  const n = (k: string) => { const x = parseFloat(r[k] as string); return isNaN(x) ? null : x; };
  const vlf = n('vlowPower'), lf = n('lowPower'), hf = n('highPower');
  const total = [vlf, lf, hf].some((v) => v != null) ? [vlf, lf, hf].reduce((a, b) => a! + (b || 0), 0)! : null;
  const lfhf = lf != null && hf ? lf / hf : null;
  const lfhfEx = (rr2: Entry) => { const a = parseFloat(rr2.lowPower as string), b = parseFloat(rr2.highPower as string); return !isNaN(a) && !isNaN(b) && b !== 0 ? a / b : null; };
  const e = expectedHf(r.style);
  const pnsHist = metricHistory(days, type, numEx('pns'));
  const snsHist = metricHistory(days, type, numEx('sns'));
  const pnsNum = n('pns'), snsNum = n('sns');
  const balCat = pnsNum != null && snsNum != null ? balanceCat(pnsNum, snsNum) : undefined;
  const sourceLabel = sourceLabelFor(r);
  const hasDetails = !!sourceLabel || type === 'breathHrv' || !!r.period;
  return (
    <>
      <Section cat={overall}>
        <SectionHead
          title="Autonomic score" help={HRV_HELP.score}
          value={score != null ? String(score) : '–'} suffix="/100"
          desc={overall ? HRV_VERDICT[overall] : 'Composite of vagal tone, power, and baroreflex position.'}
        />
      </Section>

      {hasDetails ? (
        <Section>
          <SectionHead title="Details" />
          <View style={{ marginTop: 12 }}>
            {sourceLabel ? <MetricRow label="Source" value={sourceLabel} cat={false} /> : null}
            {type === 'breathHrv' ? <MetricRow label="Breathing style" value={(r.style as string) || '—'} cat={false} /> : null}
            {r.period ? <MetricRow label="Reading type" value={r.period as string} cat={false} /> : null}
          </View>
        </Section>
      ) : null}

      {rr && rr.length > 2 ? (
        <Section>
          <SectionHead
            title="Beat-to-beat intervals" help={HRV_HELP.tachogram}
            desc="Every RR interval in the reading; healthy traces look like rolling waves."
          />
          <View style={{ marginTop: 12 }}><Tachogram rr={rr} /></View>
        </Section>
      ) : null}

      <MetricSection
        label="SDNN" value={r.sdnn as string} suffix="ms" cat={s.sdnn} days={days} type={type} ex={numEx('sdnn')} bands={BANDS.sdnn}
        desc={HRV_EXPLAIN.sdnn} help={HRV_HELP.sdnn}
      />
      <MetricSection
        label="RMSSD" value={r.rmssd as string} suffix="ms" cat={s.rmssd} days={days} type={type} ex={numEx('rmssd')} bands={rmssdBand}
        desc={HRV_EXPLAIN.rmssd} help={HRV_HELP.rmssd}
      />
      <MetricSection
        label="pNN50" value={r.pnn50 as string} suffix="%" cat={s.pnn50} days={days} type={type} ex={numEx('pnn50')} bands={BANDS.pnn50}
        desc={HRV_EXPLAIN.pnn50} help={HRV_HELP.pnn50}
      />
      <MetricSection
        label={type === 'breathHrv' ? 'HR' : 'Avg HR'} value={r[hrKey] as string} suffix="bpm" cat={type === 'breathHrv' ? s.hr : s.avgHr}
        days={days} type={type} ex={numEx(hrKey)} bands={BANDS.hrBreath}
        desc={HRV_EXPLAIN.hr} help={HRV_HELP.hr}
      />
      <MetricSection
        label="Mean RR" value={r.meanRr as string} suffix="ms" cat={s.meanRr} days={days} type={type} ex={numEx('meanRr')} bands={BANDS.rrMode}
        desc={HRV_EXPLAIN.meanRr} help={HRV_HELP.meanRr}
      />
      <MetricSection
        label="MxDMn" value={r.mxdmn as string} suffix="ms" cat={s.mxdmn} days={days} type={type} ex={numEx('mxdmn')} bands={BANDS.mxdmn}
        desc={HRV_EXPLAIN.mxdmn} help={HRV_HELP.mxdmn}
      />
      <MetricSection
        label="Mode" value={r.mode as string} suffix="ms" cat={s.mode} days={days} type={type} ex={numEx('mode')} bands={BANDS.rrMode}
        desc={HRV_EXPLAIN.mode} help={HRV_HELP.mode}
      />
      <MetricSection
        label="AMo50" value={r.amo50 as string} suffix="%" cat={s.amo50} days={days} type={type} ex={numEx('amo50')} bands={BANDS.amo50}
        desc={HRV_EXPLAIN.amo50} help={HRV_HELP.amo50}
      />
      <MetricSection
        label="CV" value={r.cv as string} suffix="%" cat={s.cv} days={days} type={type} ex={numEx('cv')} bands={BANDS.cv}
        desc={HRV_EXPLAIN.cv} help={HRV_HELP.cv}
      />

      {total != null || (rr && rr.length >= 16) ? (
        <Section>
          <SectionHead
            title="Power distribution" help={HRV_HELP.power}
            desc="Total HRV power split across the VLF, LF and HF frequency bands."
          />
          <View style={{ marginTop: 12 }}><PowerSpectrum rr={rr} vlf={vlf} lf={lf} hf={hf} /></View>
        </Section>
      ) : null}

      <MetricSection
        label="Total power" value={total != null ? String(Math.round(total)) : null} suffix="ms²" cat={s.totalPower}
        days={days} type={type} ex={totalPower} bands={BANDS.totalPower}
        desc="Total autonomic engagement across all frequencies." help={HRV_HELP.power}
      />
      <MetricSection
        label="LF/HF ratio" value={lfhf != null ? lfhf.toFixed(2) : null} cat={s.lfhf} days={days} type={type} ex={lfhfEx} bands={BANDS.lfhf}
        desc="Sympathetic vs vagal balance. Balanced or low favors flexibility." help={HRV_HELP.lfhf}
      />
      <MetricSection
        label="VLF power" value={r.vlowPower as string} suffix="ms²" cat={s.vlf} days={days} type={type} ex={numEx('vlowPower')} bands={BANDS.vlf}
        desc="Slow regulatory waves (below 0.04 Hz) tied to thermoregulation, hormones and vascular tone. Elevated means system stress." help={HRV_HELP.vlf}
      />
      <MetricSection
        label="LF power" value={r.lowPower as string} suffix="ms²" days={days} type={type} ex={numEx('lowPower')} bands={null}
        desc="Baroreflex band (0.04–0.15 Hz) around blood-pressure regulation. Leans sympathetic; paced breathing inflates it." help={HRV_HELP.lf}
      />
      <MetricSection
        label="HF power" value={r.highPower as string} suffix="ms²" days={days} type={type} ex={numEx('highPower')} bands={null}
        desc="Breath-linked band (0.15–0.4 Hz) driven by vagal tone. Higher means a better recovery state." help={HRV_HELP.hf}
      />
      <MetricSection
        label="LF peak" value={r.lfPeak as string} suffix="Hz" cat={s.lfPeak} days={days} type={type} ex={numEx('lfPeak')} bands={BANDS.lfPeak}
        desc="Baroreflex frequency, your training target, 0.08 to 0.10 Hz." help={HRV_HELP.lfPeak}
      />
      <MetricSection
        label="HF peak" value={r.hfPeak as string} suffix="Hz" cat={s.hfPeak} days={days} type={type} ex={numEx('hfPeak')} bands={BANDS.hfPeak}
        desc={e ? `Expected about ${e[0]} to ${e[1]} Hz for ${r.style} breathing; large deviation means the pace drifted.` : 'Respiratory peak, usually sits at your natural breathing rate.'}
        help={HRV_HELP.hfPeak}
      />
      {pnsNum != null || snsNum != null || (pnsHist.length >= 2 && snsHist.length >= 2) ? (
        <Section>
          <SectionHead title="Balance" help={HRV_HELP.balance} cat={balCat} />
          <View style={{ marginTop: 16 }}>
            <BalanceChart
              pns={pnsHist} sns={snsHist}
              values={{ pns: r.pns as string, sns: r.sns as string }}
              desc="PNS and SNS index over recent readings. The fill turns green when you are recovered and red when stress takes over."
            />
          </View>
        </Section>
      ) : null}

      <MetricSection
        label="Stress index" value={r.stressIndex as string} cat={s.stressIndex} days={days} type={type}
        ex={numEx('stressIndex')} bands={BANDS.stressIndex}
        desc={HRV_EXPLAIN.stressIndex} help={HRV_HELP.stressIndex}
      />
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

/* ---------- Blood pressure ---------- */

const BP_HELP: Record<string, string> = {
  bp: 'Systolic (peak) over diastolic (between-beats) arterial pressure, graded against the framework thresholds. In dysautonomia the pattern across positions and times of day often says more than any single reading. Log context and watch the trend.',
  sys: 'The peak arterial pressure each heartbeat produces. Persistent changes matter more than one-off readings; pair unusual values with context like salt, fluids, meds, or stress.',
  dia: 'The arterial pressure between beats, while the heart refills. Together with systolic it sets the mean arterial pressure and pulse pressure below.',
  pulse: 'The heart rate your monitor recorded with this reading. It feeds the circulation indexes below (Kerdo, Robinson, BCE, Kvas).',
  map: 'Mean arterial pressure, diastolic plus a third of the pulse pressure, approximates the average pressure actually perfusing your organs and brain. Low MAP is a common driver of lightheadedness in dysautonomia.',
  pp: 'Pulse pressure = systolic − diastolic. Under about 30 mmHg suggests low stroke volume or dehydration; a narrowing pulse pressure on standing is a classic dysautonomia pattern worth showing your doctor.',
  kerdo: 'Kerdo vegetative index, computed from pulse and diastolic pressure. Positive values suggest sympathetic dominance, negative parasympathetic; near zero is balanced.',
  robinson: 'Robinson index (double product): systolic × pulse ÷ 100, a proxy for the heart\'s oxygen demand at rest. Lower generally means a more efficient circulation.',
  bce: 'Blood-circulation economy: pulse pressure × pulse. Higher values mean the circulation is working harder to move the same blood, a strain marker.',
  kvas: 'Coefficient of endurance: pulse × 10 ÷ pulse pressure. Around 16 is typical; sustained higher values suggest cardiovascular fatigue.',
};

export function BpSummary({ r, days, ctx }: SummaryProps) {
  const s = computeScores(r, ctx);
  const cat = rowScoreCategory(r, ctx);
  const verdict: Record<string, string> = {
    great: 'Pressure is in a healthy range.', good: 'Pressure is reasonable today.',
    ok: 'Slightly outside your ideal range; keep an eye on it.', bad: 'Out of range; note context like salt, fluids, meds, or stress.',
    concerning: 'Well outside range; consider rechecking and noting context.',
  };
  const derived = (label: string, ex: (rr: Entry) => number | null, bands: Band[], desc: string, help: string) => {
    const v = ex(r);
    return (
      <MetricSection
        label={label} value={v != null ? fmtNum(v) : null} cat={v != null ? catFromBands(v, bands) : null}
        days={days} type="bp" ex={ex} bands={bands} desc={desc} help={help}
      />
    );
  };
  return (
    <>
      <Section cat={cat}>
        <SectionHead
          title="Blood pressure" help={BP_HELP.bp}
          value={r.sys || r.dia ? `${r.sys || '–'}/${r.dia || '–'}` : '–'} suffix="mmHg"
          desc={cat ? verdict[cat] : 'Systolic over diastolic pressure.'}
        />
      </Section>
      {r.period ? (
        <Section>
          <SectionHead title="Details" />
          <View style={{ marginTop: 12 }}>
            <MetricRow label="Reading type" value={r.period as string} cat={false} />
          </View>
        </Section>
      ) : null}
      <MetricSection
        label="Systolic" value={r.sys as string} suffix="mmHg" cat={s.sys} days={days} type="bp" ex={numEx('sys')} bands={BANDS.sys}
        desc="Peak arterial pressure during a heartbeat." help={BP_HELP.sys}
      />
      <MetricSection
        label="Diastolic" value={r.dia as string} suffix="mmHg" cat={s.dia} days={days} type="bp" ex={numEx('dia')} bands={BANDS.dia}
        desc="Arterial pressure between beats." help={BP_HELP.dia}
      />
      <MetricSection
        label="Pulse" value={r.pulse as string} suffix="bpm" days={days} type="bp" ex={numEx('pulse')}
        desc="Heart rate at the time of the reading." help={BP_HELP.pulse}
      />
      {derived('Arterial pressure', bpMap, BANDS.map, 'Average pressure perfusing your organs and brain. Low MAP drives lightheadedness in dysautonomia.', BP_HELP.map)}
      {derived('Pulse pressure', bpPP, BANDS.pp, 'Gap between systolic and diastolic. Low (under 30) suggests low stroke volume or dehydration.', BP_HELP.pp)}
      {derived('Kerdo index', bpKerdo, BANDS.kerdo, 'Autonomic balance from pulse and diastolic. Positive means sympathetic dominance.', BP_HELP.kerdo)}
      {derived('Robinson index', bpRobinson, BANDS.robinson, 'Double product: myocardial oxygen demand at rest. Lower is more efficient.', BP_HELP.robinson)}
      {derived('BCE index', bpBce, BANDS.bce, 'Blood-circulation economy (pulse pressure x pulse). Higher means a more strained circulation.', BP_HELP.bce)}
      {derived('Kvas coefficient', bpKvas, BANDS.kvas, 'Coefficient of endurance. Around 16 is typical; higher suggests cardiovascular fatigue.', BP_HELP.kvas)}
      <Notes r={r} />
    </>
  );
}

/* ---------- Resting heart rate ---------- */

const RESTING_HELP = 'Heart rate at rest, graded with position-specific thresholds (laying reads lower than sitting). A gradually falling resting HR usually accompanies improving autonomic recovery; a sustained unexplained rise is worth noting alongside symptoms and sleep. Drag the chart to revisit past readings.';

export function RestingHrSummary({ r, days, ctx }: SummaryProps) {
  const verdict: Record<string, string> = {
    great: 'Resting heart rate is in a strong range.', good: 'Resting heart rate is healthy.',
    ok: 'Slightly elevated for rest.', bad: 'Elevated resting heart rate; note context.', concerning: 'High resting heart rate; consider rechecking and context.',
  };
  const band = restingHrBands(r.position);
  const hrCat = r.hr !== '' && r.hr != null ? catFromBands(+(r.hr as number), band) : null;
  const posLine = `Measured ${((r.position as string) || 'laying').toLowerCase()}; thresholds differ for laying vs sitting.`;
  return (
    <>
      <MetricSection
        hero label="Resting heart rate" value={r.hr as string} suffix="bpm" cat={hrCat}
        days={days} type="restingHr" ex={numEx('hr')} bands={band}
        desc={hrCat ? `${verdict[hrCat]} ${posLine}` : posLine}
        help={RESTING_HELP}
      />
      <Section>
        <SectionHead title="Details" />
        <View style={{ marginTop: 12 }}>
          <MetricRow label="Position" value={(r.position as string) || 'Laying'} cat={false} />
        </View>
      </Section>
      <Notes r={r} />
    </>
  );
}

/* ---------- Orthostatic events ---------- */

const ORTHO_HELP: Record<string, string> = {
  rise: 'The heart-rate increase from resting baseline to standing. A sustained rise of 30 bpm or more (40 in adolescents) within 10 minutes of standing is the adult POTS-range criterion. Trends matter more than any single stand. Repeat under similar conditions to compare.',
  hr: 'The raw numbers behind this event: heart rate before standing, the standing peak, and where it settled one minute later.',
  recovery: 'How far your heart rate fell back from its standing peak within the first minute. A larger settle-down reflects a stronger baroreflex and faster vagal recovery.',
};

export function OrthostaticSummary({ r, days, ctx: _ctx }: SummaryProps) {
  const p = usePalette();
  const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
  const increase = before != null && after != null ? after - before : null;
  const drop = after != null && min1 != null ? after - min1 : null;
  const incCat = increase != null ? catFromBands(increase, BANDS.orthoIncrease) : null;
  const dropCat = drop != null ? catFromBands(drop, BANDS.orthoRecovery) : null;
  const signed = (v: number) => (v > 0 ? '+' + v : String(v));
  const verdict: Record<string, string> = {
    great: 'Minimal heart-rate rise on standing - a healthy orthostatic response.',
    good: 'Normal orthostatic rise, within the expected physiologic range.',
    ok: 'Borderline rise at the upper end of normal. Worth keeping an eye on.',
    bad: 'Large rise - at or above the adult ≥30 bpm POTS-range threshold. Note context.',
    concerning: 'Marked rise - at or above the ≥40 bpm threshold. Hydrate, sit or lie down, and log context.',
  };
  const incEx = (rr: Entry) => { const b = numOr(rr.beforeHr), a = numOr(rr.afterHr); return b != null && a != null ? a - b : null; };
  const dropEx = (rr: Entry) => { const a = numOr(rr.afterHr), m = numOr(rr.hr1min); return a != null && m != null ? a - m : null; };
  const cols: { label: string; val: number | null; unit: string }[] = [
    { label: 'Before', val: before, unit: 'bpm · baseline' },
    { label: 'After', val: after, unit: 'bpm · standing' },
    { label: '1 min', val: min1, unit: 'bpm · settled' },
  ];
  return (
    <>
      <MetricSection
        hero label="Standing HR rise" value={increase != null ? signed(increase) : null} suffix="bpm" cat={incCat}
        days={days} type="orthostatic" ex={incEx} bands={BANDS.orthoIncrease}
        desc={incCat ? verdict[incCat] : 'Enter Before HR and After HR to rate this event.'}
        help={ORTHO_HELP.rise}
      />
      {r.transition ? (
        <Section>
          <SectionHead title="Details" />
          <View style={{ marginTop: 12 }}>
            <MetricRow label="Transition" value={r.transition as string} cat={false} />
          </View>
        </Section>
      ) : null}
      <Section>
        <SectionHead title="Heart rate" help={ORTHO_HELP.hr} desc="Baseline, standing peak, and one minute after standing." />
        <View style={{ flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
          {cols.map((c) => (
            <View key={c.label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{c.label}</Text>
              <Text style={{ fontSize: 20, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'], marginTop: 3 }}>{c.val != null ? String(c.val) : '–'}</Text>
              <Text style={{ fontSize: 11, color: p.textDim }}>{c.unit}</Text>
            </View>
          ))}
        </View>
      </Section>
      <MetricSection
        label="HR drop by 1 min" value={drop != null ? String(drop) : null} suffix="bpm" cat={dropCat}
        days={days} type="orthostatic" ex={dropEx} bands={BANDS.orthoRecovery}
        desc="How far HR fell from its standing peak after one minute. A larger settle-down means stronger baroreflex and vagal recovery."
        help={ORTHO_HELP.recovery}
      />
      <Notes r={r} />
    </>
  );
}

/* ---------- generic fallback ---------- */

export function GenericSummary({ r, days, ctx }: SummaryProps) {
  const p = usePalette();
  const def = READING_TYPES[r.type];
  const s = computeScores(r, ctx);
  const fields = entryFields(def).filter((f) => !isDivider(f) && f.type !== 'time');
  const checks = fields.filter((f) => f.type === 'check');
  return (
    <>
      {fields.map((f) => {
        if (f.type === 'check') return null;
        if (f.type === 'textarea') {
          return r[f.key!] ? (
            <Section key={f.key}>
              <SectionHead title={f.label!} />
              <Text style={{ fontSize: 14, color: p.text, lineHeight: 20, marginTop: 10 }}>{r[f.key!] as string}</Text>
            </Section>
          ) : null;
        }
        const v = r[f.key!];
        if (v == null || v === '') return null;
        return (
          <MetricSection
            key={f.key} label={f.label!} value={String(v)} suffix={f.unit} cat={s[f.key!]}
            days={days} type={r.type} ex={numEx(f.key!)} bands={bandsFor(r.type, f.key!)}
          />
        );
      })}
      {checks.length ? (
        <Section>
          <SectionHead title="Details" />
          <View style={{ marginTop: 12 }}>
            {checks.map((f) => <MetricRow key={f.key} label={f.label!} value={r[f.key!] ? 'Yes' : 'No'} cat={false} />)}
          </View>
        </Section>
      ) : null}
      <Notes r={r} />
    </>
  );
}
