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
import { Pressable, Text, TextInput, View } from 'react-native';
import { fonts, radius, usePalette } from '../theme';
import type { Band, Entry, ScoreCat } from '../lib/types';
import {
  BANDS, GRADE_LABEL, HRV_EXPLAIN, HRV_HELP, SCORE_COLORS, bandsFor,
  bpBce, bpKerdo, bpKvas, bpMap, bpPP, bpRobinson, catFromBands, computeScores,
  expectedHf, hrvComposite, numOr, orthoDeltaCat, orthoMaxDelta, restingHrBands,
  rowScoreCategory, totalPower, type ScoreContext,
} from '../lib/scoring';
import { metricHistory, numEx, type DaysMap } from '../lib/scoring/day';
import { entryFields, isDivider, READING_TYPES } from '../lib/registry';
import { healthAppName } from '../lib/health';
import { ageFromBirthday, fmtNum, fmtShort, todayKey } from '../lib/dates';
import { estimatedHrMax, hrZones, timeInZones } from '../lib/workoutZones';
import { correctArtifacts, splitSegments } from '../lib/hrv';
import { BREATH_STYLE, styleTitle } from '../lib/breathStyle';
import { buildEventInsightPrompt, buildReadingInsightPrompt, buildWorkoutInsightPrompt } from '../lib/analysis/reports';
import { getState, getWaveform } from '../store/store';
import { useTier } from '../store/tier';
import { usePaywall } from '../features/Paywall';
import { PromptSheet } from '../features/PromptSheet';
import { BalanceChart, OrthoHrChart, PowerSpectrum, Sparkline, StandHrChart, Tachogram, WorkoutHrChart, ZonesToggle, balanceCat } from './charts';
import { Icon } from './Icon';
import { SheetFooter, useSheets, type SheetControls } from './Sheet';
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
// 'health' = imported from the platform health store — named for the store on
// THIS device (Apple Health / Health Connect).
const SOURCE_LABEL: Record<string, string> = { polar: 'Bluetooth device', watch: 'Apple Watch', camera: 'Device camera', manual: 'Manual entry', health: healthAppName() };

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
/**
 * Id of the reading whose summary is on screen. Every metric card's history
 * stops there, so opening an older reading charts the run of readings that led
 * up to it instead of the whole journal (null for unsaved live previews).
 */
const ViewedReadingCtx = React.createContext<string | null>(null);
const useViewedReading = () => React.useContext(ViewedReadingCtx);

function MetricSection({ label, value, suffix, cat, desc, help, days, type, ex, bands, hero }: {
  label: string; value?: string | number | null; suffix?: string; cat?: ScoreCat | null;
  desc?: string; help?: string; days: DaysMap; type: string;
  ex: (r: Entry) => number | null; bands?: Band[] | null;
  /** Hero treatment: grade-tinted container + corner tag instead of the dot. */
  hero?: boolean;
}) {
  const [showZones, setShowZones] = useState(false);
  const [sel, setSel] = useState<{ v: number; date: string } | null>(null);
  const upto = useViewedReading();
  const hist = metricHistory(days, type, ex, 15, upto);
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

/** The entry's free-text note, read-only. Editing lives in the entry's edit
 *  form (and, pre-save, in `NoteDraftCard` on the results step). */
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

/**
 * Note field for the keep-or-discard results step, where the reading only
 * exists in memory: shows the draft note and opens the editor sheet on tap.
 * Once saved, notes are edited through the entry's edit form instead.
 */
export function NoteDraftCard({ note, onChange }: { note: string; onChange: (next: string) => void }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  return (
    <Section>
      <SectionHead
        title="Notes"
        right={<Text style={{ fontSize: 13, fontWeight: '700', color: p.accent }}>{note ? 'Edit' : 'Add'}</Text>}
      />
      <Pressable
        onPress={() => openSheet((c) => <NoteSheet initial={note} onSave={onChange} controls={c} />)}
        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        hitSlop={8}
      >
        <Text style={{ fontSize: 14, color: note ? p.text : p.textDim, lineHeight: 20, marginTop: 10 }}>
          {note || 'Add a note about this reading.'}
        </Text>
      </Pressable>
    </Section>
  );
}

/** Card-modal note editor, matching the journal's day-notes sheet. */
function NoteSheet({ initial, onSave, controls }: {
  initial: string; onSave: (next: string) => void; controls: SheetControls;
}) {
  const p = usePalette();
  const [text, setText] = useState(initial);
  const commit = () => {
    if (text !== initial) onSave(text);
    controls.close();
  };
  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, marginBottom: 16 }}>Notes</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        keyboardAppearance="dark"
        placeholder="Add a note about this reading."
        placeholderTextColor={p.textDim}
        style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 15, lineHeight: 21, color: p.text, minHeight: 180, textAlignVertical: 'top' }}
      />
      <SheetFooter>
        <Pressable onPress={commit} style={({ pressed }) => [{ flex: 1, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.7 }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text>
        </Pressable>
      </SheetFooter>
    </View>
  );
}

export interface SummaryProps { r: Entry; days: DaysMap; ctx: ScoreContext }

/* ---------- dispatcher ---------- */
export function ReadingSummary({ r, days, ctx }: SummaryProps) {
  // The POTS deep dives carry their own bespoke insight buttons.
  const Body = r.type === 'orthostatic' ? OrthostaticSummary
    : r.type === 'standTest' ? StandTestSummary
    : r.type === 'breathHrv' ? BreathingSummary
    : r.type === 'hrv' ? BaselineSummary
    : r.type === 'bp' ? BpSummary
    : r.type === 'restingHr' ? RestingHrSummary
    : GenericSummary;
  const bespoke = r.type === 'orthostatic' || r.type === 'standTest';
  return (
    <ViewedReadingCtx.Provider value={String(r.id)}>
      <Body r={r} days={days} ctx={ctx} />
      {bespoke ? null : <ReadingInsightButton r={r} days={days} ctx={ctx} />}
    </ViewedReadingCtx.Provider>
  );
}

/* ---------- HRV (training + baseline) ---------- */

const HRV_VERDICT: Record<string, string> = {
  great: 'Strong parasympathetic reserves today. Room for your full protocol and a normal day.',
  good: 'Solid recovery state. Enough reserve for a normal day.',
  ok: 'Moderate reserves. Keep it easy and avoid pushing.',
  bad: 'Low reserves. Favor rest and gentle activity today.',
  crash: 'Very low reserves. Prioritize rest and recovery.',
};

/** Cleaned RR series for an HRV reading. Waveforms live in the sidecar store
 *  keyed by reading id — inline fields exist only on pre-save live previews
 *  (and old imports mid-migration). The cleaned series isn't stored at all;
 *  it's re-derived from rrRaw on demand. */
function rrCleanFor(r: Entry): number[] | null {
  const w = getWaveform(String(r.id));
  const clean = (w && w.rrClean) || (r.rrClean as number[] | undefined);
  if (clean && clean.length) return clean;
  const raw = (w && w.rrRaw) || (r.rrRaw as number[] | undefined);
  if (!raw || !raw.length) return null;
  // A camera reading is stitched from separate stretches of tracked pulse;
  // correct each on its own so a seam isn't judged against the wrong baseline.
  const segs = (w && w.rrSegments) || (r.rrSegments as number[] | undefined);
  return splitSegments(raw, segs).flatMap((s) => correctArtifacts(s).clean);
}

/**
 * Both HRV kinds render the identical stack of metric cards — the only
 * difference is which RMSSD/HR grade band applies, plus a breathing-style row
 * on the handful of legacy training readings taken on a retired pattern.
 */
function HrvSummaryBody({ r, days, ctx, type }: SummaryProps & { type: 'breathHrv' | 'hrv' }) {
  const s = computeScores(r, ctx);
  const { score, overall } = hrvComposite(r, ctx);
  const rr = useMemo(() => rrCleanFor(r), [r]);
  const rmssdBand = type === 'breathHrv' ? BANDS.rmssdS : BANDS.rmssdU;
  const hrKey = type === 'breathHrv' ? 'hr' : 'avgHr';
  const n = (k: string) => { const x = parseFloat(r[k] as string); return isNaN(x) ? null : x; };
  const vlf = n('vlowPower'), lf = n('lowPower'), hf = n('highPower');
  const total = [vlf, lf, hf].some((v) => v != null) ? [vlf, lf, hf].reduce((a, b) => a! + (b || 0), 0)! : null;
  const lfhf = lf != null && hf ? lf / hf : null;
  const lfhfEx = (rr2: Entry) => { const a = parseFloat(rr2.lowPower as string), b = parseFloat(rr2.highPower as string); return !isNaN(a) && !isNaN(b) && b !== 0 ? a / b : null; };
  const e = expectedHf(r.style);
  // Each metricHistory scans (and per-day sorts) the whole journal; cache while
  // the sheet re-renders without a data change.
  const upto = useViewedReading();
  const [pnsHist, snsHist] = useMemo(
    () => [metricHistory(days, type, numEx('pns'), 15, upto), metricHistory(days, type, numEx('sns'), 15, upto)],
    [days, type, upto],
  );
  const pnsNum = n('pns'), snsNum = n('sns');
  const balCat = pnsNum != null && snsNum != null ? balanceCat(pnsNum, snsNum) : undefined;
  const sourceLabel = sourceLabelFor(r);
  // Training readings are all 4/6 now, so the style row would just restate the
  // type. It only earns its place on legacy readings taken on a retired pattern.
  const legacyStyle = type === 'breathHrv' && r.style && r.style !== BREATH_STYLE ? styleTitle(r.style as string) : null;
  const hasDetails = !!sourceLabel || !!legacyStyle || !!r.period;
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
            {legacyStyle ? <MetricRow label="Breathing style" value={legacyStyle} cat={false} /> : null}
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

export function BaselineSummary(props: SummaryProps) {
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
  rise: 'The biggest heart-rate change from your pre-episode baseline. A rise of 30 bpm or more (40 in adolescents) is the adult POTS-range criterion; a drop of 30 bpm or more below baseline is flagged in blue. Trends matter more than any single episode. Repeat under similar conditions to compare.',
  hr: 'The raw numbers behind this event: heart rate before the episode, during it, and where it settled one minute after.',
  recovery: 'The change in your heart rate one minute after the episode, relative to the during-episode reading. A negative delta means it settled back down (a larger drop reflects a stronger baroreflex and faster vagal recovery); a positive delta means it was still climbing.',
  curve: 'The heart-rate trace from the capture, sampled every second. Purple through the resting phase before the transition, then POTS-graded once you move. Markers show where the episode begins and where the transition completes; the dashed line is the resting baseline.',
};

/** Waveforms live in the sidecar keyed by reading id — inline `sampledHr`
 *  exists only on pre-save live previews (strap captures reviewing results). */
function hrCurveFor(r: Entry): { t: number; bpm: number }[] | null {
  const stored = getWaveform(String(r.id))?.sampledHr;
  if (stored && stored.length >= 2) return stored;
  const inline = r.sampledHr as { t: number; bpm: number }[] | undefined;
  return Array.isArray(inline) && inline.length >= 2 ? inline : null;
}

/** The entry's day key comes from the days map itself (unsaved live previews
 *  are injected into today's entries, so they resolve too). */
const dayKeyOf = (days: DaysMap, r: Entry, section: 'readings' | 'activities' = 'readings') =>
  Object.keys(days).find((k) => ((days[k] && days[k][section]) || []).some((x) => x.id === r.id)) || todayKey();

/**
 * "Get AI Insights on this ..." footer button on the reading summaries.
 * Builds a single-entry analysis prompt at press time and stacks the shared
 * PromptSheet, wearing the Insights tab's icon to tie the two together.
 * Pro-gated like the Insights reports and the downturn investigation.
 */
function InsightButton({ noun, title, build }: {
  noun: string; title: string; build: () => { prompt: string; rangeText: string };
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const tier = useTier();
  const openPaywall = usePaywall();
  const open = () => {
    if (tier === 'free') { openPaywall(); return; }
    const { prompt, rangeText } = build();
    openSheet((c) => <PromptSheet title={title} rangeText={rangeText} prompt={prompt} controls={c} />);
  };
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderRadius: radius.control, backgroundColor: p.surface2, borderColor: p.border, paddingVertical: 13, marginBottom: 12 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name="ai" size={19} color={p.accent} />
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{`Get AI Insights on this ${noun}`}</Text>
    </Pressable>
  );
}

/** POTS deep dives (orthostatic episode + guided stand test): all recorded
 *  fields + the HR trace + recent orthostatic history. */
function EventInsightButton({ r, days, hrCurve, noun, title }: {
  r: Entry; days: DaysMap; hrCurve: { t: number; bpm: number }[] | null; noun: string; title: string;
}) {
  return (
    <InsightButton
      noun={noun} title={title}
      build={() => buildEventInsightPrompt(days, getState().profile, r, dayKeyOf(days, r), hrCurve)}
    />
  );
}

/** Every other reading type: all recorded fields + app-derived values, the
 *  cleaned RR series for HRV readings, and the recent same-type history. */
function ReadingInsightButton({ r, days, ctx }: SummaryProps) {
  const isHrv = r.type === 'hrv' || r.type === 'breathHrv';
  return (
    <InsightButton
      noun="reading" title="Reading Insights"
      build={() => buildReadingInsightPrompt(days, getState().profile, ctx, r, dayKeyOf(days, r), isHrv ? rrCleanFor(r) : null)}
    />
  );
}

/** Imported workouts: all recorded fields + derived pace, time in zones, the
 *  full HR trace, and the recent activity history for load context. */
function WorkoutInsightButton({ r, days, hrCurve }: { r: Entry; days: DaysMap; hrCurve: { t: number; bpm: number }[] | null }) {
  return (
    <InsightButton
      noun="workout" title="Workout Insights"
      build={() => buildWorkoutInsightPrompt(days, getState().profile, getState().customTypes, r, dayKeyOf(days, r, 'activities'), hrCurve)}
    />
  );
}

export function OrthostaticSummary({ r, days, ctx: _ctx }: SummaryProps) {
  const p = usePalette();
  const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
  const hrCurve = hrCurveFor(r);
  const maxDelta = orthoMaxDelta(r, hrCurve);
  // Signed change one minute after the episode: negative = HR settled back down,
  // positive = still climbing. (min1 - after, so a rise reads +.)
  const delta1 = after != null && min1 != null ? min1 - after : null;
  const maxCat = orthoDeltaCat(maxDelta);
  const deltaCat = delta1 != null ? catFromBands(delta1, BANDS.orthoDelta) : null;
  // "Δ +14" / "Δ -14" for the signed readouts.
  const withSign = (v: number) => (v > 0 ? '+' + v : String(v));
  const deltaStr = (v: number) => 'Δ ' + withSign(v);
  const verdict: Record<string, string> = {
    great: 'Minimal heart-rate change - a healthy orthostatic response.',
    good: 'Normal orthostatic rise, within the expected physiologic range.',
    ok: 'Borderline rise at the upper end of normal. Worth keeping an eye on.',
    bad: 'Large rise - at or above the adult ≥30 bpm POTS-range threshold. Note context.',
    concerning: 'Marked rise - at or above the ≥40 bpm threshold. Hydrate, sit or lie down, and log context.',
    warning: 'HR fell 30 bpm or more below baseline. If you felt lightheaded, log symptoms and context.',
  };
  const maxEx = (rr: Entry) => orthoMaxDelta(rr, hrCurveFor(rr));
  const deltaEx = (rr: Entry) => { const a = numOr(rr.afterHr), m = numOr(rr.hr1min); return a != null && m != null ? m - a : null; };
  const sourceLabel = sourceLabelFor(r);
  const cols: { label: string; val: number | null; unit: string }[] = [
    { label: 'Before', val: before, unit: 'bpm · baseline' },
    { label: 'During', val: after, unit: 'bpm · episode' },
    { label: 'After', val: min1, unit: 'bpm · settled' },
  ];
  return (
    <>
      <MetricSection
        hero label="Max delta after" value={maxDelta != null ? deltaStr(maxDelta) : null} suffix="bpm" cat={maxCat}
        days={days} type="orthostatic" ex={maxEx} bands={BANDS.orthoIncrease}
        desc={maxCat ? verdict[maxCat] : 'Enter Before HR and After HR to rate this event.'}
        help={ORTHO_HELP.rise}
      />
      {hrCurve ? (
        <Section>
          <SectionHead title="Heart rate over time" help={ORTHO_HELP.curve} />
          <View style={{ marginTop: 12 }}>
            <OrthoHrChart samples={hrCurve} baseline={before} transitionAt={numOr(r.transitionAt)} completedAt={numOr(r.completedAt)} />
          </View>
        </Section>
      ) : null}
      <Section>
        <SectionHead title="Heart rate" help={ORTHO_HELP.hr} desc="Baseline, during the episode, and one minute after." />
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
        label="HR Delta after 1 minute" value={delta1 != null ? deltaStr(delta1) : null} suffix="bpm" cat={deltaCat}
        days={days} type="orthostatic" ex={deltaEx} bands={BANDS.orthoDelta}
        desc="Change in heart rate one minute after the episode. Negative means HR settled back down; positive means it was still climbing."
        help={ORTHO_HELP.recovery}
      />
      <Notes r={r} />
      {r.transition || sourceLabel ? (
        <Section>
          <SectionHead title="Details" />
          <View style={{ marginTop: 12 }}>
            {r.transition ? <MetricRow label="Transition" value={r.transition as string} cat={false} /> : null}
            {sourceLabel ? <MetricRow label="Source" value={sourceLabel} cat={false} /> : null}
          </View>
        </Section>
      ) : null}
      <EventInsightButton r={r} days={days} hrCurve={hrCurve} noun="episode" title="Episode Insights" />
    </>
  );
}

/* ---------- Watch stand test (POTS) ---------- */

const STAND_HELP: Record<string, string> = {
  rise: 'The sustained heart-rate rise: the average increase over the final minute of standing, compared against the resting (supine) baseline. A sustained rise of 30 bpm or more (40 in ages 12-19) within 10 minutes of standing is the adult POTS-range criterion. One test is a data point, not a diagnosis; trends across tests under similar conditions matter most.',
  hr: 'The numbers behind this test: the supine baseline (last two minutes of lying down), the standing peak, and the largest single rise above baseline.',
  curve: 'The full heart-rate trace from the test, sampled every second: resting phase, the stand moment (marked), and the standing response. The dashed line is the supine baseline.',
};

const STAND_DISCLAIMER = 'Wellness screening only. This test is HR-based; it does not measure blood pressure, and a POTS assessment also requires ruling out orthostatic hypotension (a BP drop), which this test cannot detect. Not a diagnosis. Discuss results with your doctor.';

export function StandTestSummary({ r, days, ctx: _ctx }: SummaryProps) {
  const p = usePalette();
  const baseline = numOr(r.baselineHr), peak = numOr(r.peakHr);
  const peakDelta = numOr(r.peakDelta), sustained = numOr(r.sustainedDelta);
  const susCat = sustained != null ? catFromBands(sustained, BANDS.standDelta) : null;
  const maxReached = numOr(r.maxHrReached);
  const signed = (v: number) => (v > 0 ? '+' + v : String(v));
  const verdict: Record<string, string> = {
    great: 'Minimal sustained rise on standing - a healthy orthostatic response.',
    good: 'Normal sustained rise, within the expected physiologic range.',
    ok: 'Borderline sustained rise at the upper end of normal. Worth keeping an eye on.',
    bad: 'Sustained rise at or above the adult ≥30 bpm POTS-range threshold. Note context and discuss the trend with your doctor.',
    crash: 'Marked sustained rise of 40 bpm or more. Hydrate, sit or lie down, and log context.',
  };
  const susEx = (rr: Entry) => numOr(rr.sustainedDelta);
  const hrCurve = hrCurveFor(r);
  const cols: { label: string; val: number | null; unit: string }[] = [
    { label: 'Baseline', val: baseline, unit: 'bpm · supine' },
    { label: 'Peak', val: peak, unit: 'bpm · standing' },
    { label: 'Peak Δ', val: peakDelta, unit: 'bpm · rise' },
  ];
  const flags: { label: string; value: string }[] = [];
  flags.push({ label: 'Sustained rise ≥30 bpm', value: r.metThreshold ? 'Yes' : 'No' });
  if (maxReached != null) flags.push({ label: 'Max HR reached', value: String(maxReached) });
  if (r.endedEarly) flags.push({ label: 'Ended early', value: 'Yes' });
  if (r.baselineUnstable) flags.push({ label: 'Short resting phase', value: 'Baseline may be unreliable' });
  return (
    <>
      <MetricSection
        hero label="Sustained HR rise" value={sustained != null ? signed(sustained) : null} suffix="bpm" cat={susCat}
        days={days} type="standTest" ex={susEx} bands={BANDS.standDelta}
        desc={susCat ? verdict[susCat] : 'No sustained figure was captured for this test.'}
        help={STAND_HELP.rise}
      />
      {hrCurve ? (
        <Section>
          <SectionHead title="Heart rate over time" help={STAND_HELP.curve} />
          <View style={{ marginTop: 12 }}>
            <StandHrChart samples={hrCurve} standAt={numOr(r.standAt)} baseline={baseline} />
          </View>
        </Section>
      ) : null}
      <Section>
        <SectionHead title="Heart rate" help={STAND_HELP.hr} desc="Supine baseline, standing peak, and the largest rise." />
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
      <Section>
        <SectionHead title="Details" />
        <View style={{ marginTop: 12 }}>
          {flags.map((f) => <MetricRow key={f.label} label={f.label} value={f.value} cat={false} />)}
          {/* Legacy watch results predate the `source` stamp — default there. */}
          <MetricRow label="Source" value={sourceLabelFor(r) || 'Apple Watch'} cat={false} />
        </View>
      </Section>
      <Notes r={r} />
      <EventInsightButton r={r} days={days} hrCurve={hrCurve} noun="test" title="Stand Test Insights" />
      <Text style={{ fontSize: 12, color: p.textDim, lineHeight: 17, marginBottom: 16, paddingHorizontal: 4 }}>{STAND_DISCLAIMER}</Text>
    </>
  );
}

/* ---------- Imported workout (health-store activity with an HR trace) ---------- */

const WORKOUT_HELP: Record<string, string> = {
  curve: 'Your heart rate across the whole workout, from the samples the source recorded (a watch logs one every few seconds). The trace is coloured by exercise zone; gaps mean the sensor dropped out.',
  zones: 'Exercise zones as a percentage of your estimated max heart rate (208 minus 0.7 times your age): Z1 under 60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90% and up. The estimate comes from your birthday in Settings, so treat the boundaries as approximate.',
  hr: 'Average, lowest and highest heart rate recorded during the workout.',
};

const fmtDur = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
};

/** "10:24 /mi" from duration (min) and distance (mi). */
function paceStr(durationMin: number, distanceMi: number): string | null {
  if (!(durationMin > 0) || !(distanceMi > 0)) return null;
  const secPerMi = (durationMin * 60) / distanceMi;
  if (secPerMi < 120 || secPerMi > 3600) return null; // implausible — bad field entry
  return `${Math.floor(secPerMi / 60)}:${String(Math.round(secPerMi % 60)).padStart(2, '0')} /mi`;
}

/** Whether this activity opens as a workout report (it has a stored HR trace). */
export function workoutCurveFor(r: Entry): { t: number; bpm: number }[] | null {
  return hrCurveFor(r);
}

export function WorkoutSummary({ r, days, ctx: _ctx }: SummaryProps) {
  const p = usePalette();
  const curve = hrCurveFor(r);
  const hrMax = estimatedHrMax(ageFromBirthday(getState().profile.birthday));
  const zones = hrMax != null ? hrZones(hrMax) : null;
  // HR stats prefer the imported fields; a trace with missing fields fills in.
  const fromCurve = (f: (b: number[]) => number) => (curve ? Math.round(f(curve.map((q) => q.bpm))) : null);
  const avg = numOr(r.avgHr) ?? fromCurve((b) => b.reduce((s, v) => s + v, 0) / b.length);
  const lo = numOr(r.minHr) ?? fromCurve((b) => Math.min(...b));
  const hi = numOr(r.maxHr) ?? fromCurve((b) => Math.max(...b));
  const inZones = curve && zones ? timeInZones(curve, zones) : null;
  const zoneTotal = inZones ? inZones.reduce((s, v) => s + v, 0) : 0;
  const duration = numOr(r.duration);
  const distance = numOr(r.distance);
  const pace = duration != null && distance != null ? paceStr(duration, distance) : null;
  const cols = [
    { label: 'Avg', val: avg, unit: 'bpm' },
    { label: 'Min', val: lo, unit: 'bpm' },
    { label: 'Max', val: hi, unit: 'bpm' },
  ];
  const details: { label: string; value: string }[] = [];
  if (duration != null) details.push({ label: 'Duration', value: `${fmtNum(duration)} min` });
  if (distance != null) details.push({ label: 'Distance', value: `${fmtNum(distance)} mi` });
  if (pace) details.push({ label: 'Pace', value: pace });
  const sourceLabel = sourceLabelFor(r);
  if (sourceLabel) details.push({ label: 'Source', value: sourceLabel });
  return (
    <>
      {curve ? (
        <Section>
          <SectionHead title="Heart rate over time" help={WORKOUT_HELP.curve} />
          <View style={{ marginTop: 12 }}>
            <WorkoutHrChart samples={curve} zones={zones} />
          </View>
        </Section>
      ) : null}
      <Section>
        <SectionHead title="Heart rate" help={WORKOUT_HELP.hr} desc="Average, lowest and highest over the workout." />
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
      {inZones && zones && zoneTotal > 0 ? (
        <Section>
          <SectionHead title="Time in zones" help={WORKOUT_HELP.zones} desc={hrMax != null ? `Zones from an estimated max HR of ${hrMax} bpm.` : undefined} />
          <View style={{ marginTop: 12, gap: 10 }}>
            {zones.map((z, i) => {
              const sec = inZones[i];
              const frac = sec / zoneTotal;
              const range = isFinite(z.to) ? `${z.from}–${z.to}` : `${z.from}+`;
              return (
                <View key={z.z}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: z.color }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: p.text }}>{`Z${z.z} · ${z.label}`}</Text>
                    <Text style={{ fontSize: 11, color: p.textDim }}>{`${range} bpm`}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: sec > 0 ? p.text : p.textDim, fontVariant: ['tabular-nums'] }}>{sec > 0 ? fmtDur(sec) : '–'}</Text>
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: p.surface, marginTop: 5, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.max(frac * 100, sec > 0 ? 1.5 : 0)}%`, height: 4, borderRadius: 2, backgroundColor: z.color }} />
                  </View>
                </View>
              );
            })}
          </View>
        </Section>
      ) : null}
      {details.length ? (
        <Section>
          <SectionHead title="Details" />
          <View style={{ marginTop: 12 }}>
            {details.map((d) => <MetricRow key={d.label} label={d.label} value={d.value} cat={false} />)}
          </View>
        </Section>
      ) : null}
      <Notes r={r} />
      <WorkoutInsightButton r={r} days={days} hrCurve={curve} />
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
