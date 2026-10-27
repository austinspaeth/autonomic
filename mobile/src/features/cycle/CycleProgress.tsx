/**
 * "By cycle day" — the cycle-aligned chart on Progress, after design 10b, in a
 * Cycle section of its own. Each recent finished cycle laid out by cycle day
 * (faint), your usual range around a dashed median, and the cycle in progress
 * in white with today's dot, over the phases labelled across the top. Three
 * tiles under it: follicular median, luteal median, today.
 *
 * Built from existing pieces: the HRV section's surface card and uppercase
 * header, the app's `Segmented` control for the metric, the Insights `Tile`,
 * and the cycle-chart grammar shared with Cycle impact (IBM Plex Mono axes,
 * smoothed lines, neutral white). The data is pure and tested in lib/cycle.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { smoothPath } from '../../components/charts';
import { HelpDot, LinkToggle, Toggle } from '../../components/ui';
import { fonts, radius, usePalette } from '../../theme';
import { Tile } from '../insights/Card';
import { LUTEAL_DAYS, OVULATORY_HALF_WIDTH, alignByCycleDay, phaseColumns, type CycleModel } from '../../lib/cycle';
import { todayKey } from '../../lib/dates';
import { CycleRing } from './CycleRing';
import { cycleMetricValue, type CycleRowId } from '../../lib/insights/cycle';
import type { DaysMap } from '../../lib/scoring/day';
import type { ScoreContext } from '../../lib/scoring';
import { useCycleModel } from '../../store/store';

const METRICS: { val: CycleRowId; label: string; unit: string; dp: number }[] = [
  { val: 'baseline', label: 'RMSSD', unit: 'ms', dp: 0 },
  { val: 'restingHr', label: 'Resting HR', unit: 'bpm', dp: 0 },
  // The heart-rate rise of logged POTS episodes (trends `orthoDelta`).
  { val: 'orthoDelta', label: 'POTS episode', unit: 'bpm', dp: 0 },
];

/** Follicular is the one phase drawn DARKER than the card rather than lighter,
 *  so it reads as its own band between the period and ovulation. */
const FOLLICULAR_FILL = 'rgba(0,0,0,0.28)';

const HELP = {
  what: 'Your recent cycles laid side by side by cycle day, where day 1 is the first day of your period. Each faint line is one finished cycle, the shaded band is your usual range with its median dashed, and the white line is the cycle you are in now.',
  why: 'Hormones move HRV, heart rate and symptoms across a cycle, so a dip that arrives at the same point every month is the cycle, not a setback. Seeing where this cycle sits against your usual range is what tells the two apart. It describes your own log, not a diagnosis.',
};

/** Enough finished cycles for the chart to mean anything. */
export function cycleProgressReady(model: CycleModel | null): boolean {
  return !!model && model.mode !== 'contraception' && model.mode !== 'pregnant'
    && model.cycles.filter((c) => c.next && c.plausible).length >= 2;
}

const W = 345, H = 230, PAD_L = 30, PAD_R = 8, TOP = 20, BOTTOM = 206, MAX_DAY = 35;

function ticks(lo: number, hi: number): number[] {
  const raw = Math.max(0.5, (hi - lo) / 2);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  return [start, start + step, start + 2 * step];
}

const smooth = (row: (number | null)[], i: number) => {
  const near = [row[i - 1], row[i], row[i + 1]].filter((v): v is number => v != null);
  return near.length ? near.reduce((a, b) => a + b, 0) / near.length : null;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

export function CycleProgressCard({ days, ctx, valueFor }: {
  days: DaysMap; ctx: ScoreContext;
  /** Overrides where values come from (the dev sample). */
  valueFor?: (id: CycleRowId) => (dk: string) => number | null;
}) {
  const p = usePalette();
  const model = useCycleModel();
  const [metric, setMetric] = useState<CycleRowId>('baseline');
  const def = METRICS.find((m) => m.val === metric)!;

  const data = useMemo(() => {
    if (!cycleProgressReady(model)) return null;
    const value = valueFor ? valueFor(metric) : cycleMetricValue(metric, days, ctx);
    const a = alignByCycleDay(model!, value);
    const cols = phaseColumns(model!, value);
    // The usual range: the middle half of past cycles on each day, smoothed.
    const band = Array.from({ length: Math.min(a.length, MAX_DAY) }, (_, i) => {
      const xs = a.past.map((r) => smooth(r, i)).filter((v): v is number => v != null);
      return xs.length >= 3 ? { lo: quantile(xs, 0.25), hi: quantile(xs, 0.75) } : null;
    });
    return { a, band, fol: cols[1].median, lut: cols[3].median };
  }, [model, metric, days, ctx, valueFor]);
  if (!data || !model) return null;

  const { a, band } = data;
  const all = [...a.past.flat(), ...(a.current || [])].filter((v): v is number => v != null);
  const xAt = (d: number) => PAD_L + ((d - 1) / (MAX_DAY - 1)) * (W - PAD_L - PAD_R);
  const tk = all.length ? ticks(Math.min(...all), Math.max(...all)) : [0, 1, 2];
  const lo = Math.min(tk[0], ...all), hi = Math.max(tk[2], ...all);
  const yAt = (v: number) => BOTTOM - 10 - ((v - lo) / (hi - lo || 1)) * (BOTTOM - TOP - 22);
  const line = (row: (number | null)[]) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < Math.min(row.length, MAX_DAY); i++) {
      const v = row[i] == null ? null : smooth(row, i);
      if (v != null) pts.push([xAt(i + 1), yAt(v)]);
    }
    return pts.length > 1 ? smoothPath(pts) : '';
  };
  // Phase bands across the top, from this person's own cycle.
  const L = Math.round(model.prediction?.cycleLength ?? model.stats.medianLength ?? 28);
  const P = Math.max(3, Math.round(model.stats.medianPeriod ?? 5));
  const ov = L - LUTEAL_DAYS;
  const phases = [
    { label: 'PERIOD', from: 1, to: P, fill: 'rgba(224,49,39,0.14)' },
    { label: 'FOLLICULAR', from: P + 1, to: ov - OVULATORY_HALF_WIDTH - 1, fill: FOLLICULAR_FILL },
    { label: 'OV', from: ov - OVULATORY_HALF_WIDTH, to: ov + OVULATORY_HALF_WIDTH, fill: 'rgba(255,255,255,0.15)' },
    { label: 'LUTEAL', from: ov + OVULATORY_HALF_WIDTH + 1, to: L, fill: 'rgba(255,255,255,0.075)' },
  ];
  const bandPts = band.map((b, i) => (b ? [xAt(i + 1), b] : null)).filter(Boolean) as [number, { lo: number; hi: number }][];
  const polygon = bandPts.length > 1
    ? [...bandPts.map(([x, b]) => `${x.toFixed(1)},${yAt(b.hi).toFixed(1)}`), ...[...bandPts].reverse().map(([x, b]) => `${x.toFixed(1)},${yAt(b.lo).toFixed(1)}`)].join(' ')
    : null;
  const ti = a.todayDay != null ? a.todayDay - 1 : null;
  const todayV = ti != null && a.current && a.current[ti] != null ? smooth(a.current, ti) : null;
  const fmt = (v: number | null) => (v == null ? '–' : v.toFixed(def.dp));

  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>By cycle day</Text>
        <HelpDot title="By cycle day" text={HELP} />
      </View>
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8, marginBottom: 12 }}>
        {`Your last ${a.past.length} cycles lined up by day. This cycle in white.`}
      </Text>
      {/* The HRV cards' text switch (Both / Baseline / Training / Compare). */}
      <View style={{ marginBottom: 14 }}>
        <LinkToggle options={METRICS.map((m) => ({ val: m.val, label: m.label }))} value={metric} onChange={setMetric} />
      </View>
      {all.length ? (
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {phases.map((ph) => ph.to >= ph.from ? (
            <React.Fragment key={ph.label}>
              <Rect x={xAt(ph.from) - 0.5} y={TOP} width={Math.max(1, xAt(ph.to + 1) - xAt(ph.from))} height={BOTTOM - TOP} fill={ph.fill} />
              <SvgText x={(xAt(ph.from) + xAt(ph.to + 1)) / 2} y={TOP - 6} textAnchor="middle" fontFamily={fonts.mono} fontSize={8} letterSpacing={0.5} fill={p.textFaint}>{ph.label}</SvgText>
            </React.Fragment>
          ) : null)}
          {tk.map((t) => (
            <React.Fragment key={t}>
              <Line x1={PAD_L} x2={W - PAD_R} y1={yAt(t)} y2={yAt(t)} stroke="#fff" strokeOpacity={0.06} />
              <SvgText x={PAD_L - 6} y={yAt(t) + 3} textAnchor="end" fontFamily={fonts.mono} fontSize={9} fill={p.textFaint}>{t.toFixed(def.dp)}</SvgText>
            </React.Fragment>
          ))}
          {polygon ? <Polygon points={polygon} fill="#fff" fillOpacity={0.07} /> : null}
          <Path d={line(a.median)} fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={1.3} strokeDasharray="3 3" />
          {a.past.map((row, i) => <Path key={i} d={line(row)} fill="none" stroke="#fff" strokeOpacity={0.17} strokeWidth={1.2} strokeLinejoin="round" />)}
          {ti != null ? <Line x1={xAt(ti + 1)} x2={xAt(ti + 1)} y1={TOP} y2={BOTTOM} stroke="#fff" strokeOpacity={0.22} strokeDasharray="2 3" /> : null}
          {a.current ? <Path d={line(a.current)} fill="none" stroke={p.text} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /> : null}
          {ti != null && todayV != null ? <Circle cx={xAt(ti + 1)} cy={yAt(todayV)} r={4.5} fill={p.text} stroke="#000" strokeWidth={2.5} /> : null}
          {[1, 7, 14, 21, 28, 35].map((d) => <SvgText key={d} x={xAt(d)} y={H - 7} textAnchor="middle" fontFamily={fonts.mono} fontSize={9} fill={p.textFaint}>{String(d)}</SvgText>)}
        </Svg>
      ) : (
        <Text style={{ color: p.textDim, fontSize: 14, paddingVertical: 24, textAlign: 'center' }}>{`No ${def.label === 'RMSSD' ? 'RMSSD readings' : def.label === 'POTS episode' ? 'POTS episodes' : def.label.toLowerCase()} in these cycles yet.`}</Text>
      )}
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 10, marginBottom: 14 }}>
        <Legend label="This cycle"><View style={{ width: 16, height: 2.6, borderRadius: 2, backgroundColor: p.text }} /></Legend>
        <Legend label={`Past ${a.past.length}`}><View style={{ width: 16, height: 1.2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' }} /></Legend>
        <Legend label="Your usual range"><View style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' }} /></Legend>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tile value={fmt(data.fol)} unit={def.unit} label="Follicular median" />
        <Tile value={fmt(data.lut)} unit={def.unit} label="Luteal median" />
        <Tile value={fmt(todayV)} unit={def.unit} label={a.todayDay != null ? `Today, day ${a.todayDay}` : 'Today'} />
      </View>
    </View>
  );
}

function Legend({ label, children }: { label: string; children: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      {children}
      <Text style={{ fontSize: 12, fontWeight: '500', color: p.textDim }}>{label}</Text>
    </View>
  );
}

/* ---------- the cycle overlay on a Progress chart ---------- */

/** Phase fills behind a chart: the period in the accent (the Cycle card's own
 *  red), the rest the design's neutral steps, so the line stays the subject. */
const OVERLAY_FILL: Record<string, string> = {
  menstrual: 'rgba(224,49,39,0.16)',
  follicular: FOLLICULAR_FILL,
  ovulatory: 'rgba(255,255,255,0.15)',
  luteal: 'rgba(255,255,255,0.075)',
  premenstrual: 'rgba(255,255,255,0.075)',
};

/** One fill per bucket, or null when the bucket is not a single day or its
 *  phase is unknown. A week or a month spans phases, so it gets none. */
export function overlayFills(model: CycleModel | null, dayKeys: (string | null)[]): (string | null)[] | null {
  if (!model || !dayKeys.length || dayKeys.some((k) => k == null)) return null;
  const fills = dayKeys.map((k) => {
    const ph = model.phaseOn(k as string)?.phase;
    return ph ? OVERLAY_FILL[ph] : null;
  });
  return fills.some(Boolean) ? fills : null;
}

/** The switch row inside a metric card (design 10a): ring, label, toggle. */
export function CycleOverlayRow({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const p = usePalette();
  const model = useCycleModel();
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.sunk, borderRadius: 12, paddingVertical: 9, paddingLeft: 12, paddingRight: 10, marginBottom: 14 }, pressed && { opacity: 0.7 }]}>
      <CycleRing model={model} dk={todayKey()} size={22} stroke={2.2} periodColor={p.accent} />
      <Text style={{ flex: 1, color: p.text, fontSize: 15, fontWeight: '600' }}>Cycle overlay</Text>
      <Toggle on={on} />
    </Pressable>
  );
}

export function OverlayLegend() {
  const p = usePalette();
  const items: [string, string][] = [['Period', 'rgba(224,49,39,0.5)'], ['Follicular', 'rgba(0,0,0,0.55)'], ['Ovulation', 'rgba(255,255,255,0.4)'], ['Luteal', 'rgba(255,255,255,0.22)']];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
      {items.map(([label, color]) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 10, borderRadius: 3, backgroundColor: color }} />
          <Text style={{ color: p.textDim, fontSize: 12 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
