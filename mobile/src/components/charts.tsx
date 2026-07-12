/**
 * Hand-drawn charts with react-native-svg, matching the PWA's SVG style:
 * Sparkline (grade-zone gradient + draggable readout), ScoreGauge (270° arc),
 * PowerBar (VLF/LF/HF distribution), LineChart (analysis series), Tachogram.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text as RNText, View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { fmtNum, fmtShort } from '../lib/dates';
import { GRADE_COLORS, fonts, radius, usePalette } from '../theme';
import type { Band, ScoreCat } from '../lib/types';
import { BANDS, catFromBands } from '../lib/scoring';
import { psdCurve } from '../lib/hrv';

/* HRV frequency bands (Hz) — kept local to the chart so it has no lib/hrv dep. */
const SPECTRUM_BANDS = [
  { key: 'vlf', label: 'VLF', lo: 0.0033, hi: 0.04, color: '#f59e0b' },
  { key: 'lf', label: 'LF', lo: 0.04, hi: 0.15, color: '#6366f1' },
  { key: 'hf', label: 'HF', lo: 0.15, hi: 0.4, color: '#22c55e' },
] as const;

/* ---------- math shared with the PWA ---------- */
const niceNum = (x: number, round: boolean) => {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * Math.pow(10, exp);
};
export function niceScale(dataMin: number, dataMax: number, ticks: number) {
  let min = dataMin, max = dataMax;
  if (min === max) { const d = Math.abs(min) || 1; min -= d; max += d; }
  const pad = (max - min) * 0.5; min -= pad; max += pad;
  const step = niceNum(niceNum(max - min, false) / (ticks - 1), true);
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const t = 0.16;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

let sparkId = 0;

/* ---------- tap-away deselect ----------
 * Hosts (the Screen scaffold, the sheet stack) call notifyChartsBlur() from a
 * capture-phase touch handler, so every touch anywhere fires it before any
 * child responds. Each mounted chart clears its selection back to the default
 * readout (average / latest); a touch that lands on a chart re-selects in the
 * same event via its own responder grant, so charts never flicker — the net
 * effect is that tapping anywhere *outside* a chart blurs its selection. */
const chartBlurListeners = new Set<() => void>();
export function notifyChartsBlur() { chartBlurListeners.forEach((fn) => fn()); }
function useChartsBlur(onBlur: () => void) {
  useEffect(() => {
    chartBlurListeners.add(onBlur);
    return () => { chartBlurListeners.delete(onBlur); };
  }, [onBlur]);
}

/** A right-aligned "Show zones / Hide zones" toggle link. */
export function ZonesToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
      <RNText style={{ fontSize: 12, fontWeight: '700', color: p.accent }}>{on ? 'Hide zones' : 'Show zones'}</RNText>
    </Pressable>
  );
}

/** Grade-zone boundary lines within [min,max]: {v, color, label}. */
function zoneBoundaries(bands: Band[], min: number, max: number) {
  const out: { v: number; color: string; label: ScoreCat }[] = [];
  bands.forEach((b) => {
    if (b.max > min && b.max < max && isFinite(b.max)) out.push({ v: b.max, color: GRADE_COLORS[b.cat] || '#888', label: b.cat });
  });
  return out;
}

/* ---------- Sparkline ---------- */
export function Sparkline({ points, bands, height = 92, onSelect, showReadout = true, hideHeader, zonesOn }: {
  points: { v: number; date: string }[]; bands?: Band[] | null; height?: number;
  /** Reports drag/tap selection (null when a tap elsewhere blurs it). */
  onSelect?: (pt: { v: number; date: string } | null) => void; showReadout?: boolean;
  /** Hide the readout/zones-toggle row entirely — the host renders its own header. */
  hideHeader?: boolean;
  /** Controlled zones visibility (pairs with hideHeader); overrides the internal toggle. */
  zonesOn?: boolean;
}) {
  const p = usePalette();
  const [sel, setSel] = useState<number>(points.length - 1);
  const [layoutW, setLayoutW] = useState(0);
  const [showZonesState, setShowZonesState] = useState(false);
  const showZones = zonesOn ?? showZonesState;
  useChartsBlur(useCallback(() => { setSel(points.length - 1); onSelect?.(null); }, [points.length, onSelect]));
  if (!points || points.length < 2) return null;
  const gid = `spk${sparkId++}`;
  const vals = points.map((pt) => pt.v);
  // Scale to the data's own min/max plus a 5% cushion on each side, so the trace
  // fills the chart and its extremes match the readings (not a padded nice scale).
  const dataMin = Math.min(...vals), dataMax = Math.max(...vals);
  const span = dataMax - dataMin || Math.abs(dataMax) || 1;
  const min = dataMin - span * 0.05, max = dataMax + span * 0.05;
  const W = 320, H = 90, padL = 30, padR = 10, padT = 10, padB = 18;
  const innerW = W - padL - padR;
  const xAt = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / (max - min)));
  const colAt = (v: number) => (bands ? GRADE_COLORS[catFromBands(v, bands) as ScoreCat] || '#888' : p.text);

  const stops: { o: number; c: string }[] = [];
  if (bands) {
    stops.push({ o: 0, c: colAt(max - 1e-9) });
    bands.map((b) => b.max).filter((m) => m > min && m < max).sort((a, b) => b - a).forEach((bv) => {
      stops.push({ o: offAt(bv), c: colAt(bv + 1e-9) });
      stops.push({ o: offAt(bv), c: colAt(bv - 1e-9) });
    });
    stops.push({ o: 1, c: colAt(min + 1e-9) });
  }

  const yticks = [min, (min + max) / 2, max];
  const zones = bands && showZones ? zoneBoundaries(bands, min, max) : [];
  const xy: [number, number][] = points.map((pt, i) => [xAt(i), yAt(pt.v)]);

  const selPt = points[Math.max(0, Math.min(points.length - 1, sel))];
  const selCat = bands ? catFromBands(selPt.v, bands) : null;
  const selColor = selCat && GRADE_COLORS[selCat] ? GRADE_COLORS[selCat] : p.text;

  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((px - padL) / innerW) * (points.length - 1))));
    setSel(i);
    onSelect?.(points[i]);
  };

  return (
    <View style={{ marginTop: 16 }}>
      {!hideHeader ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 16, marginBottom: 4 }}>
          {showReadout ? (
            <RNText style={{ fontSize: 12, fontWeight: '700', color: selColor, fontVariant: ['tabular-nums'] }}>
              {`${fmtShort(selPt.date)}: ${fmtNum(selPt.v)}`}
            </RNText>
          ) : <View />}
          {bands ? <ZonesToggle on={showZones} onPress={() => setShowZonesState((v) => !v)} /> : null}
        </View>
      ) : null}
      <View
        onLayout={(e: LayoutChangeEvent) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        style={{ height }}
      >
        <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {bands && (
            <Defs>
              <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
                {stops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
              </LinearGradient>
            </Defs>
          )}
          {yticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={padL + innerW} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} opacity={0.5} />
              <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{fmtNum(t)}</SvgText>
            </React.Fragment>
          ))}
          {zones.map((z, i) => (
            <React.Fragment key={`z${i}`}>
              <Line x1={padL} x2={padL + innerW} y1={yAt(z.v)} y2={yAt(z.v)} stroke={z.color} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.9} />
              <SvgText x={padL + innerW} y={yAt(z.v) - 2} textAnchor="end" fontSize={8} fontWeight="700" fill={z.color}>{fmtNum(z.v)}</SvgText>
            </React.Fragment>
          ))}
          <Path d={smoothPath(xy)} fill="none" stroke={bands ? `url(#${gid})` : p.text} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((pt, i) => {
            const c = bands ? catFromBands(pt.v, bands) : null;
            return <Circle key={i} cx={xAt(i)} cy={yAt(pt.v)} r={2.6} fill={c && GRADE_COLORS[c] ? GRADE_COLORS[c] : p.text} />;
          })}
          <Line x1={xAt(sel)} x2={xAt(sel)} y1={padT} y2={H - padB} stroke={p.text} strokeWidth={1} opacity={0.35} />
          <Circle cx={xAt(sel)} cy={yAt(selPt.v)} r={3.6} fill={selColor} />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
        <RNText style={{ fontSize: 10, color: p.textDim }}>{fmtShort(points[0].date)}</RNText>
        <RNText style={{ fontSize: 10, color: p.textDim }}>{fmtShort(points[points.length - 1].date)}</RNText>
      </View>
    </View>
  );
}

/* ---------- Score gauge (270° arc) ---------- */
export function ScoreGauge({ score, color, size = 176, children }: { score: number; color: string; size?: number; children?: React.ReactNode }) {
  const p = usePalette();
  const cx = size / 2, cy = size / 2, r = 74, sw = 12;
  const START = 135, SWEEP = 270;
  const pol = (deg: number): [number, number] => { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const arc = (frac: number) => {
    const a1 = START + SWEEP * Math.max(0.0001, frac);
    const [x0, y0] = pol(START), [x1, y1] = pol(a1);
    const large = SWEEP * frac > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const frac = Math.max(0, Math.min(1, (score || 0) / 100));
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path d={arc(1)} fill="none" stroke={p.gaugeTrack} strokeWidth={sw} strokeLinecap="round" />
        <Path d={arc(frac)} fill="none" stroke={color} strokeWidth={sw + 7} strokeLinecap="round" opacity={0.16} />
        <Path d={arc(frac)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

/* ---------- Power bar (VLF / LF / HF) ---------- */
export function PowerBar({ vlf, lf, hf }: { vlf: number | null; lf: number | null; hf: number | null }) {
  const p = usePalette();
  const total = [vlf, lf, hf].some((v) => v != null) ? [vlf, lf, hf].reduce((a, b) => a! + (b || 0), 0)! : null;
  if (!total) return null;
  const pct = (x: number | null) => Math.round(((x || 0) / total) * 100);
  const seg = (v: number | null, color: string, lab: string) => {
    if (v == null) return null;
    const w = pct(v);
    return (
      <View key={lab} style={{ width: `${w}%`, backgroundColor: color, alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
        {w >= 12 ? <RNText style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{`${lab} ${w}%`}</RNText> : null}
      </View>
    );
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 24, borderRadius: 6, overflow: 'hidden', backgroundColor: p.surface, marginVertical: 6 }}>
        {seg(vlf, '#f59e0b', 'VLF')}
        {seg(lf, '#6366f1', 'LF')}
        {seg(hf, '#22c55e', 'HF')}
      </View>
      <RNText style={{ fontSize: 12, color: p.textDim }}>{`VLF ${pct(vlf)}% · LF ${pct(lf)}% · HF ${pct(hf)}%`}</RNText>
    </View>
  );
}

/* ---------- Power spectrum (frequency-axis PSD distribution) ---------- */
/**
 * Distribution of HRV power across the frequency spectrum, Welltory-style: a
 * continuous curve with sharp, well-defined peaks, band-coloured by frequency,
 * with adjacent bands butting against each other (segments share their exact
 * band-edge point so there is no gap between fills). With beat-to-beat `rr`
 * the true power spectral density is drawn (linearly interpolated onto a fine
 * grid, then lightly smoothed so the peaks keep their shape but their tips
 * round off instead of reading as polygon vertices). Without RR (a typed-in reading)
 * we reconstruct one peak per band at its typical frequency, scaled to the
 * band's power. The x-axis runs 0 → 0.5 Hz; below it, the power readouts.
 */
export function PowerSpectrum({ rr, vlf, lf, hf }: { rr?: number[] | null; vlf: number | null; lf: number | null; hf: number | null }) {
  const p = usePalette();
  const curve = React.useMemo(() => (rr && rr.length >= 16 ? psdCurve(rr) : null), [rr]);
  const vals = { vlf: vlf || 0, lf: lf || 0, hf: hf || 0 };
  const total = vals.vlf + vals.lf + vals.hf;
  if (!total && !curve) return null;
  const pct = (x: number) => (total ? Math.round((x / total) * 100) : 0);

  const W = 320, H = 150, padL = 8, padR = 6, padT = 10, padB = 26;
  const fMax = 0.5;
  const innerW = W - padL - padR;
  const xAt = (f: number) => padL + (Math.min(f, fMax) / fMax) * innerW;

  // Density at any frequency: linear interpolation of the real PSD, or a
  // reconstructed sum of one peak per band (centred at the band's typical
  // frequency, height ∝ band power / bandwidth) when only totals are known.
  let densAt: (f: number) => number;
  if (curve) {
    const fs = curve.freqs, ps = curve.psd;
    densAt = (f: number) => {
      if (!fs.length) return 0;
      if (f <= fs[0]) return ps[0];
      if (f >= fs[fs.length - 1]) return ps[ps.length - 1];
      let i = 0;
      while (i < fs.length - 2 && fs[i + 1] < f) i++;
      const t = (f - fs[i]) / (fs[i + 1] - fs[i] || 1);
      return ps[i] + t * (ps[i + 1] - ps[i]);
    };
  } else {
    const peaks = [
      { c: 0.015, s: 0.011, v: vals.vlf / 0.0367 },
      { c: 0.1, s: 0.028, v: vals.lf / 0.11 },
      { c: 0.25, s: 0.06, v: vals.hf / 0.25 },
    ];
    densAt = (f: number) => peaks.reduce((s, pk) => s + pk.v * Math.exp(-((f - pk.c) ** 2) / (2 * pk.s * pk.s)), 0);
  }

  // Sample each band on its own sub-grid, endpoints exactly on the band edges —
  // adjacent bands share the edge sample, so their fills touch with no gap.
  const bandPts = SPECTRUM_BANDS.map((b) => {
    const lo = b.lo, hi = Math.min(b.hi, fMax);
    const M = Math.max(8, Math.round(((hi - lo) / fMax) * 110));
    const seg: { f: number; d: number }[] = [];
    for (let i = 0; i <= M; i++) { const f = lo + ((hi - lo) * i) / M; seg.push({ f, d: densAt(f) }); }
    // Two light binomial passes (endpoints pinned) round the tips of the peaks
    // so the trace reads as a curve, not a polygon — the shape stays put.
    for (let pass = 0; pass < 2; pass++) {
      const s = seg.map((q) => q.d);
      for (let i = 1; i < seg.length - 1; i++) seg[i].d = 0.25 * s[i - 1] + 0.5 * s[i] + 0.25 * s[i + 1];
    }
    return seg;
  });

  const dMax = Math.max(...bandPts.flat().map((q) => q.d)) || 1;
  const yAt = (d: number) => padT + (1 - d / dMax) * (H - padT - padB);
  const baseY = H - padB;

  // One filled sub-path per band; a soft curve along the top edge keeps the
  // peaks defined but rounds their tips.
  const segs: { color: string; d: string }[] = [];
  SPECTRUM_BANDS.forEach((b, bi) => {
    const seg = bandPts[bi];
    if (seg.length < 2) return;
    const xy: [number, number][] = seg.map((q) => [xAt(q.f), Math.min(baseY, yAt(q.d))]);
    const top = smoothPath(xy); // "Mx y Cx1 y1 …"
    const area = `M${xy[0][0].toFixed(2)} ${baseY} L${top.slice(1)} L${xy[xy.length - 1][0].toFixed(2)} ${baseY} Z`;
    segs.push({ color: b.color, d: area });
  });

  const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  const legend: { label: string; color: string; power: number }[] = [
    { label: 'Very low', color: SPECTRUM_BANDS[0].color, power: vals.vlf },
    { label: 'Low', color: SPECTRUM_BANDS[1].color, power: vals.lf },
    { label: 'High', color: SPECTRUM_BANDS[2].color, power: vals.hf },
  ];

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={padL} x2={W - padR} y1={baseY} y2={baseY} stroke={p.border} strokeWidth={1} />
        {segs.map((s, i) => <Path key={i} d={s.d} fill={s.color} opacity={0.9} />)}
        {ticks.map((t, i) => (
          <SvgText key={i} x={xAt(t)} y={baseY + 14} textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'} fontSize={9} fill={p.textDim}>{t.toFixed(1)}</SvgText>
        ))}
        <SvgText x={padL} y={baseY + 24} textAnchor="start" fontSize={9} fill={p.textDim}>Frequency (Hz)</SvgText>
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10 }}>
        {legend.map((l) => (
          <View key={l.label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
              <RNText style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{l.label}</RNText>
            </View>
            <RNText style={{ fontSize: 17, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], marginTop: 3 }}>{Math.round(l.power)}</RNText>
            <RNText style={{ fontSize: 11, color: p.textDim }}>{`ms² · ${pct(l.power)}%`}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---------- Line chart (analysis) with grade-zone gradient + drag readout ---------- */
export interface Series { values: (number | null)[]; color: string; label?: string; dashed?: boolean; pointBands?: Band[] | null }
export interface Zone { from: number; to: number; color: string }

let lcId = 0;

export function LineChart({ buckets, series, zones, integer, height = 140, target, zonesOn, hideHeader, onSelect }: {
  buckets: { label: string }[]; series: Series[]; zones?: Zone[] | null; integer?: boolean; height?: number; target?: { from: number; to: number; color: string };
  /** Controlled "show zones" — when provided, the internal toggle link is hidden
   *  and the caller owns the state (used by card headers that host the link). */
  zonesOn?: boolean;
  /** Hide the readout/toggle row above the plot (caller renders its own header). */
  hideHeader?: boolean;
  /** Reports drag/tap selection so a card header can mirror the value
   *  (null when a tap elsewhere blurs the selection). */
  onSelect?: (idx: number | null) => void;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  const [showZonesInt, setShowZonesInt] = useState(false);
  const showZones = zonesOn ?? showZonesInt;
  useChartsBlur(useCallback(() => { setSel(-1); onSelect?.(null); }, [onSelect]));
  const all: number[] = [];
  series.forEach((s) => s.values.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); }));
  if (!all.length) return null;
  let min = Math.min(...all), max = Math.max(...all);
  if (target) { min = Math.min(min, target.from); max = Math.max(max, target.to); }
  if (min === max) { const e = (Math.abs(min) || 1) * 0.1 + 0.5; min -= e; max += e; }
  // 5% cushion each side so the series fills the chart and its extremes track the data.
  const padv = (max - min) * 0.05; min -= padv; max += padv;
  const W = 320, H = height, padL = 34, padR = 10, padT = 10, padB = 22;
  const innerW = W - padL - padR, n = buckets.length;
  // Selection can outlive its dataset: switching Day→Week shrinks `buckets`
  // while this component instance (and its `sel`) is reused, so treat any
  // out-of-range index as "no selection" instead of indexing past the end.
  const selIdx = sel < n ? sel : -1;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const zoneColorAt = (v: number) => { if (!zones) return null; for (const z of zones) if (v >= z.from && v < z.to) return z.color; return zones[zones.length - 1].color; };
  const mainSeries = series.filter((s) => !s.dashed);
  const gradientSeries = zones && mainSeries.length === 1 ? mainSeries[0] : null;
  const gid = `lc${lcId++}`;
  const gStops: { o: number; c: string }[] = [];
  if (gradientSeries && zones) {
    const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / (max - min)));
    gStops.push({ o: 0, c: zoneColorAt(max - 1e-9)! });
    zones.map((z) => z.to).filter((m) => m > min && m < max).sort((a, b) => b - a).forEach((bv) => {
      gStops.push({ o: offAt(bv), c: zoneColorAt(bv + 1e-9)! });
      gStops.push({ o: offAt(bv), c: zoneColorAt(bv - 1e-9)! });
    });
    gStops.push({ o: 1, c: zoneColorAt(min + 1e-9)! });
  }
  const dotColor = (s: Series, v: number) => {
    if (s.pointBands) { const c = catFromBands(v, s.pointBands); if (c && GRADE_COLORS[c]) return GRADE_COLORS[c]; }
    if (s === gradientSeries) return zoneColorAt(v) || s.color;
    return s.color;
  };
  const step = Math.max(1, Math.ceil(n / 6));
  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1))));
    // Only data-bearing buckets are selectable — a touch over an empty bucket
    // leaves the current selection (and the header readout) untouched.
    if (!series.some((s) => { const v = s.values[i]; return v != null && !isNaN(v); })) return;
    setSel(i);
    onSelect?.(i);
  };
  const readoutIdx = selIdx >= 0 ? selIdx : (() => { for (let i = n - 1; i >= 0; i--) if (series.some((s) => s.values[i] != null)) return i; return -1; })();
  const readout = readoutIdx >= 0
    ? `${buckets[readoutIdx]?.label ?? ''}: ${series.filter((s) => s.values[readoutIdx] != null).map((s) => (series.filter((x) => x.label).length > 1 && s.label ? s.label + ' ' : '') + fmtNum(integer ? Math.round(s.values[readoutIdx] as number) : (s.values[readoutIdx] as number))).join(' · ')}`
    : '';

  // Grade-zone boundaries within range (the interior `.from` edges), for the overlay.
  const zoneLines = zones && showZones
    ? zones.map((z) => z.from).filter((v) => v > min && v < max).map((v, i) => ({ v, color: (zones.find((z) => z.from === v) || zones[0]).color, key: i }))
    : [];

  return (
    <View>
      {!hideHeader ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 16, marginBottom: 4 }}>
          <RNText style={{ flex: 1, fontSize: 12, fontWeight: '700', color: p.text, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{readout}</RNText>
          {zones && zonesOn === undefined ? <ZonesToggle on={showZones} onPress={() => setShowZonesInt((v) => !v)} /> : null}
        </View>
      ) : null}
      <View
        onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {gradientSeries && (
            <Defs>
              <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
                {gStops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
              </LinearGradient>
            </Defs>
          )}
          {[min, (min + max) / 2, max].map((val, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={W - padR} y1={yAt(val)} y2={yAt(val)} stroke={p.border} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
              <SvgText x={padL - 4} y={yAt(val) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{fmtNum(integer ? Math.round(val) : val)}</SvgText>
            </React.Fragment>
          ))}
          {buckets.map((b, i) => (i % step === 0 || i === n - 1) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{b.label}</SvgText> : null)}
          {zoneLines.map((z) => (
            <React.Fragment key={`z${z.key}`}>
              <Line x1={padL} x2={padL + innerW} y1={yAt(z.v)} y2={yAt(z.v)} stroke={z.color} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
              <SvgText x={padL + innerW} y={yAt(z.v) - 2} textAnchor="end" fontSize={8} fontWeight="700" fill={z.color}>{fmtNum(integer ? Math.round(z.v) : z.v)}</SvgText>
            </React.Fragment>
          ))}
          {target && [target.from, target.to].map((bv, i) => (bv > min && bv < max) ? <Line key={i} x1={padL} x2={padL + innerW} y1={yAt(bv)} y2={yAt(bv)} stroke={target.color} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.6} /> : null)}
          {series.map((s, si) => {
            const pts: [number, number, number][] = [];
            s.values.forEach((v, i) => { if (v != null && !isNaN(v)) pts.push([xAt(i), yAt(v), v]); });
            if (!pts.length) return null;
            const stroke = s === gradientSeries ? `url(#${gid})` : s.color;
            return (
              <G key={si}>
                {pts.length >= 2 && <Path d={smoothPath(pts.map((pt) => [pt[0], pt[1]]))} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />}
                {pts.map((pt, i) => <Circle key={i} cx={pt[0]} cy={pt[1]} r={pts.length > 20 ? 1.8 : 2.6} fill={dotColor(s, pt[2])} />)}
              </G>
            );
          })}
          {/* Selection cursor only once the user has actually touched the chart —
              nothing is highlighted in the initial view. */}
          {selIdx >= 0 && <Line x1={xAt(selIdx)} x2={xAt(selIdx)} y1={padT} y2={H - padB} stroke={p.text} strokeWidth={1} opacity={0.35} />}
        </Svg>
      </View>
    </View>
  );
}

/* ---------- Tachogram / HR-over-time waveform ---------- */
export function Waveform({ data, color, height = 120, label }: { data: number[]; color?: string; height?: number; label?: string }) {
  const p = usePalette();
  if (!data || data.length < 2) return null;
  const c = color || p.accent;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 320, H = height, padT = 8, padB = 8;
  const xAt = (i: number) => (i / (data.length - 1)) * W;
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const pts: [number, number][] = data.map((v, i) => [xAt(i), yAt(v)]);
  return (
    <View style={{ backgroundColor: p.bg, borderRadius: radius.control, padding: 6 }}>
      {label ? <RNText style={{ fontSize: 11, color: p.textDim, marginBottom: 4 }}>{label}</RNText> : null}
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path d={smoothPath(pts)} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText style={{ fontSize: 10, color: p.textDim }}>{Math.round(min)}</RNText>
        <RNText style={{ fontSize: 10, color: p.textDim }}>{Math.round(max)}</RNText>
      </View>
    </View>
  );
}

/* ---------- Tachogram (beat-to-beat RR intervals) ---------- */
/**
 * Plots the RR intervals (ms) beat-by-beat with straight segments so the true
 * ups and downs are crisp — unlike a per-second BPM waveform, which quantizes
 * to whole beats and reads as a staircase. A faint area fill under the trace
 * makes the swing easy to read.
 */
export function Tachogram({ rr, height = 132 }: { rr: number[]; height?: number }) {
  const p = usePalette();
  if (!rr || rr.length < 2) return null;
  const dMin = Math.min(...rr), dMax = Math.max(...rr);
  const span = dMax - dMin || 1;
  const min = dMin - span * 0.05, max = dMax + span * 0.05;
  const range = max - min || 1;
  const W = 320, H = height, padL = 34, padR = 8, padT = 12, padB = 20;
  const innerW = W - padL - padR;
  const xAt = (i: number) => padL + (i / (rr.length - 1)) * innerW;
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const line = rr.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
  const area = `${line} L${xAt(rr.length - 1).toFixed(1)} ${H - padB} L${padL} ${H - padB} Z`;
  const ticks = [min, (min + max) / 2, max];
  return (
    <View style={{ backgroundColor: p.bg, borderRadius: radius.control, padding: 8 }}>
      <RNText style={{ fontSize: 11, color: p.textDim, marginBottom: 4 }}>{`Beat-to-beat interval (ms) · ${rr.length} beats`}</RNText>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} opacity={0.4} />
            <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{Math.round(t)}</SvgText>
          </React.Fragment>
        ))}
        <Path d={area} fill={p.accent} opacity={0.12} />
        <Path d={line} fill="none" stroke={p.accent} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/* ---------- Autonomic balance (PNS vs SNS with balance-coloured fill) ---------- */
/**
 * PNS and SNS index across the reading history as two smoothed lines, with the
 * area between them filled by a horizontal gradient that encodes autonomic
 * balance along the time axis: green where PNS sits well above SNS (recovered),
 * amber at the neutral crossing, red where SNS climbs above PNS (stressed). The
 * fill colour at each moment is that sample's signed gap (pns − sns) graded
 * through BALANCE_BANDS, so balance drift reads left→right at a glance. The
 * closed band pinches to a point at a crossover and reopens on the far side,
 * passing through the neutral amber band exactly at the crossing.
 */
// gap g = pns − sns, higher is better (the mirror of BANDS.sns's direction).
const BALANCE_BANDS: Band[] = [
  { max: -1.5, cat: 'concerning' },
  { max: -0.5, cat: 'bad' },
  { max: 0.5, cat: 'ok' },
  { max: 1.5, cat: 'good' },
  { max: Infinity, cat: 'great' },
];
const PNS_LINE = '#60a5fa'; // blue — parasympathetic (matches the app's HRV chart blue)
const SNS_LINE = '#a855f7'; // purple — sympathetic
/** Grade the autonomic balance gap (pns − sns); higher is better. Shared so a
 *  card header can show the matching grade dot beside the "Balance" title. */
export const balanceCat = (pns: number, sns: number): ScoreCat | null =>
  catFromBands(pns - sns, BALANCE_BANDS) as ScoreCat | null;
let balId = 0;
export function BalanceChart({ pns, sns, height = 168, values, desc, defaultLabel }: {
  pns: { v: number; date: string }[];  // aligned index-for-index with sns
  sns: { v: number; date: string }[];
  height?: number;
  /** Default PNS/SNS readouts for the header numbers (this reading's value in a
   *  summary, the range average in Progress). A drag selection overrides them
   *  with the touched point's values. */
  values?: { pns?: string | number | null; sns?: string | number | null };
  /** Explainer paragraph, rendered below the PNS/SNS numbers like other cards. */
  desc?: string;
  /** Label shown after the SNS number when nothing is selected (e.g. "avg" in
   *  Progress; omitted in the reading summary, which shows this reading). A drag
   *  selection replaces it with the touched point's date. */
  defaultLabel?: string;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  useChartsBlur(useCallback(() => setSel(-1), []));
  // metricHistory returns pns/sns in the same day/time order, so equal indices
  // align. A reading that logs one index but not the other makes the lengths
  // differ, so pair index-for-index up to the shorter of the two.
  const n = Math.min(pns.length, sns.length);
  const gid = `bal${balId++}`;
  const fmtV = (v?: string | number | null) =>
    v == null || v === '' ? '–' : typeof v === 'number' ? fmtNum(Number(v.toFixed(1))) : v;
  // Bucket labels arrive pre-formatted from Progress; ISO dates come from the
  // reading summary and get shortened. Detect and only format the latter.
  const xLabel = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? fmtShort(d) : d);

  const pv = pns.slice(0, n).map((d) => d.v);
  const sv = sns.slice(0, n).map((d) => d.v);
  const selIdx = sel >= 0 && sel < n ? sel : -1;

  let chart: React.ReactNode = null;
  if (n >= 2) {
    // Domain spans both series and always includes 0 (the neutral axis) plus a
    // 5% cushion, so the dashed zero line stays on-chart.
    const dataMin = Math.min(0, ...pv, ...sv), dataMax = Math.max(0, ...pv, ...sv);
    const span = dataMax - dataMin || 1;
    const min = dataMin - span * 0.05, max = dataMax + span * 0.05;
    const W = 320, H = height, padL = 32, padR = 10, padT = 12, padB = 22;
    const innerW = W - padL - padR;
    const xAt = (i: number) => padL + (i / (n - 1)) * innerW;
    const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    const pnsXY = pv.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
    const snsXY = sv.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
    const pnsPath = smoothPath(pnsXY);
    const snsPath = smoothPath(snsXY);
    // Closed band: trace PNS left→right, then SNS right→left (its smooth path
    // reversed, leading "M" swapped for "L" so it continues the same subpath), Z.
    const fill = `${pnsPath} ${smoothPath(snsXY.slice().reverse()).replace(/^M/, 'L')} Z`;
    // One stop per sample: a horizontal gradient colours purely by x, so each
    // moment gets its own balance colour and the transitions interpolate free.
    const stops = pv.map((v, i) => ({
      o: i / (n - 1),
      c: GRADE_COLORS[catFromBands(v - sv[i], BALANCE_BANDS) as ScoreCat] || '#888',
    }));
    const zeroY = yAt(0);
    const step = Math.max(1, Math.ceil(n / 6));
    const onTouch = (x: number) => {
      if (layoutW <= 0) return;
      const px = (x / layoutW) * W;
      setSel(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1)))));
    };
    chart = (
      <View
        onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gid} x1={padL} y1={0} x2={W - padR} y2={0} gradientUnits="userSpaceOnUse">
              {stops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
            </LinearGradient>
          </Defs>
          {/* Y grid + value labels (min/mid/max). */}
          {[min, (min + max) / 2, max].map((val, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={W - padR} y1={yAt(val)} y2={yAt(val)} stroke={p.border} strokeWidth={1} strokeDasharray="3 4" opacity={0.5} />
              <SvgText x={padL - 4} y={yAt(val) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{fmtNum(Number(val.toFixed(1)))}</SvgText>
            </React.Fragment>
          ))}
          {/* Zero line — the neutral axis. */}
          {min < 0 && max > 0 ? (
            <Line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke={p.textDim} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
          ) : null}
          {/* X date labels. */}
          {pns.slice(0, n).map((d, i) => (i % step === 0 || i === n - 1) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{xLabel(d.date)}</SvgText> : null)}
          {/* Balance fill, then the two lines on top. */}
          <Path d={fill} fill={`url(#${gid})`} opacity={0.42} />
          <Path d={pnsPath} fill="none" stroke={PNS_LINE} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
          <Path d={snsPath} fill="none" stroke={SNS_LINE} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
          {/* Point dots. */}
          {pnsXY.map((pt, i) => <Circle key={`p${i}`} cx={pt[0]} cy={pt[1]} r={n > 20 ? 1.8 : 2.6} fill={PNS_LINE} />)}
          {snsXY.map((pt, i) => <Circle key={`s${i}`} cx={pt[0]} cy={pt[1]} r={n > 20 ? 1.8 : 2.6} fill={SNS_LINE} />)}
          {/* Selection: cursor line + emphasized rings on the touched points. */}
          {selIdx >= 0 ? (
            <G>
              <Line x1={xAt(selIdx)} x2={xAt(selIdx)} y1={padT} y2={H - padB} stroke={p.text} strokeWidth={1} opacity={0.35} />
              <Circle cx={pnsXY[selIdx][0]} cy={pnsXY[selIdx][1]} r={4} fill={PNS_LINE} stroke={p.surface2} strokeWidth={1.5} />
              <Circle cx={snsXY[selIdx][0]} cy={snsXY[selIdx][1]} r={4} fill={SNS_LINE} stroke={p.surface2} strokeWidth={1.5} />
            </G>
          ) : null}
        </Svg>
      </View>
    );
  }

  const readouts = values ?? {};
  // The numbers reflect the selected point when dragging, else the defaults.
  const pnsShown = selIdx >= 0 ? pv[selIdx] : readouts.pns;
  const snsShown = selIdx >= 0 ? sv[selIdx] : readouts.sns;
  // Suffix after the SNS number: the touched point's date in parentheses when
  // selected (matching other cards), else the caller's default ("avg" in
  // Progress, nothing in the reading summary).
  const suffixLabel = selIdx >= 0 ? `(${xLabel(pns[selIdx].date)})` : defaultLabel;
  return (
    <View>
      {/* PNS/SNS legend + big numbers (main-metric size), then the date/label. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 28 }}>
          {([['PNS', PNS_LINE, pnsShown], ['SNS', SNS_LINE, snsShown]] as const).map(([label, color, val]) => (
            <View key={label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                <RNText style={{ fontSize: 12, color: p.textDim, fontWeight: '700', letterSpacing: 0.5 }}>{label}</RNText>
              </View>
              <RNText style={{ fontSize: 27, fontFamily: fonts.numHeavy, color, fontVariant: ['tabular-nums'], marginTop: 4 }}>{fmtV(val)}</RNText>
            </View>
          ))}
        </View>
        {suffixLabel ? <RNText style={{ fontSize: 13, fontWeight: '600', color: p.textDim, marginBottom: 5 }}>{suffixLabel}</RNText> : null}
      </View>
      {/* Explainer below the numbers, like other cards. */}
      {desc ? <RNText style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{desc}</RNText> : null}
      <View style={{ marginTop: 12 }}>
        {chart ?? <RNText style={{ fontSize: 12, color: p.textDim }}>Not enough history yet to chart.</RNText>}
      </View>
    </View>
  );
}

/* ---------- Blood-pressure dumbbell (systolic↕diastolic per reading) ---------- */
/**
 * One vertical segment per reading connecting its diastolic (bottom) to its
 * systolic (top), with a dot at each. The segment is a vertical gradient from
 * the systolic grade colour at the top to the diastolic grade colour at the
 * bottom (blue = healthy → red = out of range), so a reading that is good on
 * top and bad on the bottom gradients between the two.
 */
let bpId = 0;
export function BpDumbbell({ buckets, sys, dia, height = 180 }: {
  buckets: { label: string }[]; sys: (number | null)[]; dia: (number | null)[]; height?: number;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  const [gid] = useState(() => bpId++);
  useChartsBlur(useCallback(() => setSel(-1), []));
  const all: number[] = [];
  sys.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); });
  dia.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); });
  if (!all.length) return null;
  let min = Math.min(...all), max = Math.max(...all);
  const padv = (max - min) * 0.12 + 4; min -= padv; max += padv;
  const W = 320, H = height, padL = 22, padR = 10, padT = 10, padB = 22;
  const innerW = W - padL - padR, n = buckets.length;
  // Same stale-selection guard as LineChart: `sel` survives a range change
  // that shrinks `buckets`, so an out-of-range index means "no selection".
  const selIdx = sel < n ? sel : -1;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const col = (v: number, bands: Band[]) => { const c = catFromBands(v, bands); return (c && GRADE_COLORS[c]) || p.text; };
  const step = Math.max(1, Math.ceil(n / 6));
  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1))));
    // Only buckets with a drawn segment (both values) are selectable.
    const s = sys[i], d = dia[i];
    if (s == null || isNaN(s) || d == null || isNaN(d)) return;
    setSel(i);
  };
  // Readout mirrors the metric cards: the range average by default, then the
  // dragged bucket's reading with its date in parentheses.
  const avgOf = (arr: (number | null)[]) => { const v = arr.filter((x): x is number => x != null && !isNaN(x)); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  const fmt = (v: number | null | undefined) => (v != null && !isNaN(v) ? Math.round(v) : '–');
  const rSys = selIdx >= 0 ? sys[selIdx] : avgOf(sys);
  const rDia = selIdx >= 0 ? dia[selIdx] : avgOf(dia);
  const suffix = selIdx >= 0 ? `(${buckets[selIdx]?.label ?? ''})` : 'avg';
  return (
    <View>
      <RNText style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: p.text, marginBottom: 6, fontVariant: ['tabular-nums'] }}>
        {`${fmt(rSys)}/${fmt(rDia)}`}
        <RNText style={{ fontSize: 13, fontWeight: '600', fontFamily: undefined, color: p.textDim }}>{`  ${suffix}`}</RNText>
      </RNText>
      <View
        onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Defs>
            {buckets.map((_, i) => {
              const s = sys[i], d = dia[i];
              if (s == null || d == null) return null;
              return (
                <LinearGradient key={i} id={`bp${gid}_${i}`} x1="0" y1={yAt(s)} x2="0" y2={yAt(d)} gradientUnits="userSpaceOnUse">
                  <Stop offset={0} stopColor={col(s, BANDS.sys)} />
                  <Stop offset={1} stopColor={col(d, BANDS.dia)} />
                </LinearGradient>
              );
            })}
          </Defs>
          {[min, (min + max) / 2, max].map((val, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={W - padR} y1={yAt(val)} y2={yAt(val)} stroke={p.border} strokeWidth={1} opacity={0.5} />
              <SvgText x={padL - 4} y={yAt(val) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{Math.round(val)}</SvgText>
            </React.Fragment>
          ))}
          {buckets.map((b, i) => (i % step === 0 || i === n - 1) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{b.label}</SvgText> : null)}
          {buckets.map((_, i) => {
            const s = sys[i], d = dia[i];
            if (s == null || d == null) return null;
            const x = xAt(i);
            return (
              <G key={i}>
                <Line x1={x} x2={x} y1={yAt(s)} y2={yAt(d)} stroke={`url(#bp${gid}_${i})`} strokeWidth={i === selIdx ? 5 : 3.4} strokeLinecap="round" />
                <Circle cx={x} cy={yAt(s)} r={i === selIdx ? 4.5 : 3.4} fill={col(s, BANDS.sys)} />
                <Circle cx={x} cy={yAt(d)} r={i === selIdx ? 4.5 : 3.4} fill={col(d, BANDS.dia)} />
              </G>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

/* ---------- Stacked bars (per-bucket power distribution) ---------- */
/**
 * One vertical stacked bar per bucket, each split into coloured segments
 * (e.g. VLF / LF / HF) whose combined height is the total. Tapping a bar shows
 * its total and per-segment breakdown. Bars scale to the tallest total.
 */
export function StackedBars({ buckets, segments, height = 160, unit, hideHeader, onSelect }: {
  buckets: { label: string }[];
  segments: { label: string; color: string; values: (number | null)[] }[];
  height?: number; unit?: string;
  /** Hide the readout row (caller renders its own header + legend values). */
  hideHeader?: boolean;
  /** Reports drag/tap selection so a card header can mirror the totals
   *  (null when a tap elsewhere blurs the selection). */
  onSelect?: (idx: number | null) => void;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  useChartsBlur(useCallback(() => { setSel(-1); onSelect?.(null); }, [onSelect]));
  const n = buckets.length;
  // Same stale-selection guard as LineChart: `sel` survives a range change
  // that shrinks `buckets`, so an out-of-range index means "no selection".
  const selIdx = sel < n ? sel : -1;
  const totals = buckets.map((_, i) => segments.reduce((s, seg) => s + (seg.values[i] || 0), 0));
  const max = Math.max(...totals, 0);
  if (max <= 0) return null;
  const W = 320, H = height, padL = 34, padR = 8, padT = 10, padB = 22;
  const innerW = W - padL - padR;
  const bandW = innerW / n;
  const barW = Math.min(16, bandW * 0.62);
  const SEG_GAP = 2;         // vertical gap between stacked segments (mock look)
  const xCenter = (i: number) => padL + bandW * (i + 0.5);
  const yAt = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const step = Math.max(1, Math.ceil(n / 6));
  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / bandW)));
    // Only buckets with a drawn bar are selectable — touching an empty band
    // leaves the current selection (and the header totals) untouched.
    if (!(totals[i] > 0)) return;
    setSel(i);
    onSelect?.(i);
  };
  const readoutIdx = selIdx >= 0 ? selIdx : (() => { for (let i = n - 1; i >= 0; i--) if (totals[i] > 0) return i; return -1; })();
  const readout = readoutIdx >= 0
    ? `${buckets[readoutIdx]?.label ?? ''}: ${Math.round(totals[readoutIdx])}${unit ? ' ' + unit : ''} · ${segments.map((s) => `${s.label} ${Math.round(s.values[readoutIdx] || 0)}`).join(' · ')}`
    : '';
  const yticks = [0, max / 2, max];
  return (
    <View>
      {!hideHeader ? (
        <RNText style={{ fontSize: 12, fontWeight: '700', color: p.text, height: 16, marginBottom: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{readout}</RNText>
      ) : null}
      <View
        onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {yticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
              <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{Math.round(t)}</SvgText>
            </React.Fragment>
          ))}
          {buckets.map((b, i) => {
            let acc = 0;
            const x = xCenter(i) - barW / 2;
            return (
              <G key={i}>
                {segments.map((seg, si) => {
                  const v = seg.values[i] || 0;
                  if (v <= 0) return null;
                  const y0 = yAt(acc);
                  const y1 = yAt(acc + v);
                  acc += v;
                  // Rounded segment with a small gap to the one below it. Bars
                  // render uniformly until the user selects one by touch.
                  const h = Math.max(1.5, y0 - y1 - SEG_GAP);
                  const op = selIdx >= 0 ? (i === selIdx ? 1 : 0.55) : 0.9;
                  return <Rect key={si} x={x} y={y1} width={barW} height={h} rx={Math.min(3, h / 2)} fill={seg.color} opacity={op} />;
                })}
                {(i % step === 0 || i === n - 1) ? <SvgText x={xCenter(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{b.label}</SvgText> : null}
              </G>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

/* ---------- Horizontal bars (analysis) ---------- */
export function Bars({ rows, fmt }: { rows: { name: string; count: number; color?: string }[]; fmt?: (c: number) => string }) {
  const p = usePalette();
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.count)) || 1;
  return (
    <View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <RNText style={{ width: '38%', fontSize: 15, color: p.text }}>{r.name}</RNText>
          <View style={{ flex: 1, height: 8, backgroundColor: p.surface2, borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${(r.count / max) * 100}%`, backgroundColor: r.color || p.accent, borderRadius: 999 }} />
          </View>
          <RNText style={{ width: 40, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '600', fontSize: 15, color: p.text }}>{fmt ? fmt(r.count) : String(r.count)}</RNText>
        </View>
      ))}
    </View>
  );
}
