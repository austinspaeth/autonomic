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
import { GRADE_COLORS, TAIL_STYLE, fonts, radius, readoutTail, usePalette } from '../theme';
import type { Band, ScoreCat } from '../lib/types';
import { BANDS, catFromBands } from '../lib/scoring';
import { onDay, type BucketView } from '../lib/analysis/buckets';
import { psdCurve } from '../lib/hrv';
import { zoneFor, type HrZone } from '../lib/workoutZones';
import { STAGE_COLORS } from '../lib/sleep/stages';

/**
 * Which x positions carry a date label: every `step`th tick, plus the last one
 * so the range always states where it ends. The second clause is what keeps
 * those two from colliding — with 14 buckets at a step of 3 the regular tick
 * lands one slot short of the end, and "8/19" and "8/20" printed on top of each
 * other. A regular tick inside half a step of the end yields to the end.
 */
function labelTick(i: number, n: number, step: number) {
  if (i === n - 1) return true;
  if (i % step !== 0) return false;
  return n - 1 - i >= Math.ceil(step / 2);
}

/* HRV frequency bands (Hz) — kept local to the chart so it has no lib/hrv dep. */
/* Sleep bars share the stage palette's core blue, so a night reads the same
 * colour everywhere it appears. */
const SLEEP_BLUE = STAGE_COLORS.core;

const SPECTRUM_BANDS = [
  { key: 'vlf', label: 'VLF', lo: 0.0033, hi: 0.04, color: '#f59e0b' },
  { key: 'lf', label: 'LF', lo: 0.04, hi: 0.15, color: '#6366f1' },
  { key: 'hf', label: 'HF', lo: 0.15, hi: 0.4, color: '#22c55e' },
] as const;

/* ---------- math shared with the PWA ---------- */
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
export function useChartsBlur(onBlur: () => void) {
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
  // Back to the latest point / default readout — shared by tap-away blur and
  // responder termination (a scroll that started on the chart and got stolen
  // by the scroll view mid-gesture, which would otherwise strand a stale
  // historical selection in the card header).
  const reset = useCallback(() => { setSel(points.length - 1); onSelect?.(null); }, [points.length, onSelect]);
  useChartsBlur(reset);
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
        onResponderTerminate={reset}
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
// `track` overrides the ring behind the score arc. The default reads as a well
// on a status-tinted card; the unscored card has no tint, so it passes a grey.
export function ScoreGauge({ score, color, size = 176, track, marker, children }: {
  score: number;
  color: string;
  size?: number;
  track?: string;
  /**
   * A tick across the ring at `score`. Used by the Insights day-one explainer to show
   * where the comparison started, so the arc carries both numbers instead of the sheet
   * needing a second chart.
   *
   * Tick only, deliberately: a label anchored outside the ring needs the label's own
   * width of clear space beyond `r + sw/2`, which no sensible `size` leaves, so it
   * clipped against the viewBox. The figure it stood for belongs in the gauge's
   * children, where there is room for it.
   */
  marker?: { score: number };
  children?: React.ReactNode;
}) {
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
  // The marker's tick spans the ring's width plus a little either side.
  const mFrac = marker ? Math.max(0, Math.min(1, (marker.score || 0) / 100)) : 0;
  const mDeg = START + SWEEP * mFrac;
  const mAt = (rad: number): [number, number] => { const a = (mDeg * Math.PI) / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
  const [mx0, my0] = mAt(r - sw / 2 - 3);
  const [mx1, my1] = mAt(r + sw / 2 + 3);
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path d={arc(1)} fill="none" stroke={track || p.gaugeTrack} strokeWidth={sw} strokeLinecap="round" />
        {frac > 0 ? (
          <>
            <Path d={arc(frac)} fill="none" stroke={color} strokeWidth={sw + 7} strokeLinecap="round" opacity={0.16} />
            <Path d={arc(frac)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          </>
        ) : null}
        {marker ? (
          <Line x1={mx0} y1={my0} x2={mx1} y2={my1} stroke={p.text} strokeWidth={3} strokeLinecap="round" />
        ) : null}
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
  // A band whose power the HRV engine withheld (record too short to resolve it)
  // still has real energy in the drawn PSD, so the curve shows it. Dim that
  // band's fill and read out "–" rather than a confident 0 next to a visible hump.
  const held = { vlf: vlf == null, lf: lf == null, hf: hf == null };

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
  const segs: { color: string; d: string; dim: boolean }[] = [];
  SPECTRUM_BANDS.forEach((b, bi) => {
    const seg = bandPts[bi];
    if (seg.length < 2) return;
    const xy: [number, number][] = seg.map((q) => [xAt(q.f), Math.min(baseY, yAt(q.d))]);
    const top = smoothPath(xy); // "Mx y Cx1 y1 …"
    const area = `M${xy[0][0].toFixed(2)} ${baseY} L${top.slice(1)} L${xy[xy.length - 1][0].toFixed(2)} ${baseY} Z`;
    segs.push({ color: b.color, d: area, dim: held[b.key as keyof typeof held] });
  });

  const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
  const legend: { label: string; color: string; power: number | null }[] = [
    { label: 'Very low', color: SPECTRUM_BANDS[0].color, power: vlf },
    { label: 'Low', color: SPECTRUM_BANDS[1].color, power: lf },
    { label: 'High', color: SPECTRUM_BANDS[2].color, power: hf },
  ];

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={padL} x2={W - padR} y1={baseY} y2={baseY} stroke={p.border} strokeWidth={1} />
        {segs.map((s, i) => <Path key={i} d={s.d} fill={s.color} opacity={s.dim ? 0.28 : 0.9} />)}
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
            <RNText style={{ fontSize: 17, fontWeight: '800', color: l.power == null ? p.textDim : p.text, fontVariant: ['tabular-nums'], marginTop: 3 }}>{l.power == null ? '–' : Math.round(l.power)}</RNText>
            <RNText style={{ fontSize: 11, color: p.textDim }}>{l.power == null ? 'reading too short' : `ms² · ${pct(l.power)}%`}</RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---------- Line chart (analysis) with grade-zone gradient + drag readout ---------- */
export interface Series {
  values: (number | null)[];
  color: string;
  label?: string;
  dashed?: boolean;
  pointBands?: Band[] | null;
}
export interface Zone { from: number; to: number; color: string }

let lcId = 0;

export function LineChart({ buckets, series, zones, integer, height = 140, target, zonesOn, hideHeader, onSelect, marks, markColor, divider, trendLine }: {
  buckets: { label: string }[]; series: Series[]; zones?: Zone[] | null; integer?: boolean; height?: number; target?: { from: number; to: number; color: string };
  /**
   * Per-bucket highlight painted BEHIND the plot: > 0 shades that bucket, 0 leaves
   * it clear, and **null leaves it clear too but means something different** — the
   * day carries no information (see insights/detail). Consecutive shaded buckets
   * are merged into one block, so "took it every day for three weeks" reads as a
   * period rather than as twenty stripes.
   */
  marks?: (number | null)[];
  markColor?: string;
  /** A dashed vertical rule at a bucket index: where a before/after split sits. */
  divider?: number | null;
  /**
   * A least-squares fit through the FIRST series' present values, drawn as a
   * straight line in this colour: "which way is this heading over the whole
   * range", which is the one thing a day-by-day trace of a noisy metric cannot
   * be read for. Gaps are skipped rather than interpolated (a missing day is not
   * a value), and the line is clipped to the plot so a steep fit cannot escape it.
   */
  trendLine?: string;
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
  // Shared by tap-away blur and responder termination (scroll stole the touch).
  const reset = useCallback(() => { setSel(-1); onSelect?.(null); }, [onSelect]);
  useChartsBlur(reset);
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

  // Contiguous runs of shaded buckets, as [xFrom, xTo] in viewBox units. Half a
  // bucket of bleed each side so a single marked day is still a visible block and
  // a run reads as covering the days it names.
  const half = n > 1 ? innerW / (n - 1) / 2 : innerW / 2;
  const markRuns: [number, number][] = [];
  if (marks) {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && marks[i] != null && (marks[i] as number) > 0;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        markRuns.push([Math.max(padL, xAt(start) - half), Math.min(padL + innerW, xAt(i - 1) + half)]);
        start = -1;
      }
    }
  }

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
        onResponderTerminate={reset}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {gradientSeries && (
            <Defs>
              <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
                {gStops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
              </LinearGradient>
            </Defs>
          )}
          {/* First, so gridlines, the trace and every label sit on top of it. */}
          {markRuns.map(([x0, x1], i) => (
            <Rect key={`mk${i}`} x={x0} y={padT} width={Math.max(1.5, x1 - x0)} height={H - padT - padB} fill={markColor || p.accent} opacity={0.14} />
          ))}
          {divider != null && divider >= 0 && divider < n ? (
            <Line x1={xAt(divider)} x2={xAt(divider)} y1={padT} y2={H - padB} stroke={p.textDim} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.8} />
          ) : null}
          {[min, (min + max) / 2, max].map((val, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={W - padR} y1={yAt(val)} y2={yAt(val)} stroke={p.border} strokeWidth={1} strokeDasharray="3 4" opacity={0.55} />
              <SvgText x={padL - 4} y={yAt(val) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{fmtNum(integer ? Math.round(val) : val)}</SvgText>
            </React.Fragment>
          ))}
          {buckets.map((b, i) => labelTick(i, n, step) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{b.label}</SvgText> : null)}
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
          {trendLine ? (() => {
            const pts: [number, number][] = [];
            series[0]?.values.forEach((v, i) => { if (v != null && !isNaN(v)) pts.push([i, v]); });
            if (pts.length < 3) return null;
            const mx = pts.reduce((s2, q) => s2 + q[0], 0) / pts.length;
            const my = pts.reduce((s2, q) => s2 + q[1], 0) / pts.length;
            let num = 0, den = 0;
            pts.forEach(([qx, qy]) => { num += (qx - mx) * (qy - my); den += (qx - mx) ** 2; });
            if (!den) return null;
            const slope = num / den;
            const at = (i: number) => Math.max(min, Math.min(max, my + slope * (i - mx)));
            const i0 = pts[0][0], i1 = pts[pts.length - 1][0];
            return (
              <Line
                x1={xAt(i0)} y1={yAt(at(i0))} x2={xAt(i1)} y2={yAt(at(i1))}
                stroke={trendLine} strokeWidth={1.6} strokeDasharray="6 4" opacity={0.75} strokeLinecap="round"
              />
            );
          })() : null}
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

/* ---------- Stand-test HR curve (1 Hz heart rate vs elapsed time) ---------- */
/**
 * The watch stand test's full HR trace: resting phase, the stand moment
 * (vertical marker with the standing side faintly tinted), and the standing
 * response. The trace is lightly rounded (strided + two binomial passes, then
 * the shared smooth curve) so the integer 1 Hz samples don't read as a
 * staircase, and it is split at the stand: the resting side draws purple, the
 * standing side takes a vertical gradient through the POTS grade colours
 * (each height's colour is its rise above baseline graded via standDelta), so
 * what happened after standing reads with what it means. A "Show zones" link
 * marks the grade boundaries above baseline. Dashed line = supine baseline;
 * sensor-dropout gaps still break the path rather than interpolating.
 */
const STAND_PURPLE = '#a78bfa';
let standId = 0;
export function StandHrChart({ samples, standAt, baseline, height = 150 }: {
  samples: { t: number; bpm: number }[];
  /** Seconds from test start when standing began (the stand cue). */
  standAt?: number | null;
  baseline?: number | null;
  height?: number;
}) {
  const p = usePalette();
  const [showZones, setShowZones] = useState(false);
  const [gid] = useState(() => `sh${standId++}`);
  if (!samples || samples.length < 2) return null;
  // Stride long traces down (~300 pts), split into continuous runs at dropout
  // gaps, then round each run: two light binomial passes (endpoints pinned).
  const stride = Math.max(1, Math.ceil(samples.length / 300));
  const kept = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);
  const runs: { t: number; bpm: number }[][] = [];
  kept.forEach((s, i) => {
    if (i === 0 || s.t - kept[i - 1].t > 3 * stride + 1) runs.push([]);
    runs[runs.length - 1].push({ t: s.t, bpm: s.bpm });
  });
  runs.forEach((run) => {
    for (let pass = 0; pass < 2; pass++) {
      const src = run.map((q) => q.bpm);
      for (let i = 1; i < run.length - 1; i++) run[i].bpm = 0.25 * src[i - 1] + 0.5 * src[i] + 0.25 * src[i + 1];
    }
  });
  const bpms = runs.flat().map((q) => q.bpm);
  const dMin = Math.min(...bpms, baseline ?? Infinity), dMax = Math.max(...bpms, baseline ?? -Infinity);
  const span = dMax - dMin || 1;
  const min = dMin - span * 0.08, max = dMax + span * 0.08;
  const range = max - min || 1;
  const t0 = kept[0].t, t1 = kept[kept.length - 1].t;
  const tSpan = t1 - t0 || 1;
  const W = 320, H = height, padL = 34, padR = 8, padT = 12, padB = 20;
  const innerW = W - padL - padR;
  const xAt = (t: number) => padL + ((t - t0) / tSpan) * innerW;
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const ticks = [min, (min + max) / 2, max];
  const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const standX = standAt != null && standAt > t0 && standAt < t1 ? xAt(standAt) : null;
  // Cut each run at the stand, sharing an interpolated point so the purple
  // resting trace and the graded standing trace meet exactly at the marker.
  // Without a baseline the grade gradient is meaningless, so it all stays purple.
  const split = standX != null && baseline != null;
  const pre: { t: number; bpm: number }[][] = [], post: { t: number; bpm: number }[][] = [];
  runs.forEach((run) => {
    if (!split) { pre.push(run); return; }
    const a = run.filter((q) => q.t <= standAt!), b = run.filter((q) => q.t >= standAt!);
    if (a.length && b.length && a[a.length - 1].t !== b[0].t) {
      const q0 = a[a.length - 1], q1 = b[0];
      const f = (standAt! - q0.t) / (q1.t - q0.t || 1);
      const mid = { t: standAt!, bpm: q0.bpm + f * (q1.bpm - q0.bpm) };
      a.push(mid); b.unshift(mid);
    }
    if (a.length >= 2) pre.push(a);
    if (b.length >= 2) post.push(b);
  });
  const pathOf = (segs: { t: number; bpm: number }[][]) =>
    segs.map((run) => smoothPath(run.map((q) => [xAt(q.t), yAt(q.bpm)] as [number, number]))).join(' ');
  // Standing-side gradient: colour purely by height, banded at baseline+standDelta.
  const colAt = (v: number) => (baseline != null && GRADE_COLORS[catFromBands(v - baseline, BANDS.standDelta) as ScoreCat]) || STAND_PURPLE;
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / range));
  const stops: { o: number; c: string }[] = [];
  if (split) {
    stops.push({ o: 0, c: colAt(max - 1e-9) });
    BANDS.standDelta.map((b) => baseline! + b.max).filter((v) => isFinite(v) && v > min && v < max).sort((a, b) => b - a).forEach((v) => {
      stops.push({ o: offAt(v), c: colAt(v + 1e-9) });
      stops.push({ o: offAt(v), c: colAt(v - 1e-9) });
    });
    stops.push({ o: 1, c: colAt(min + 1e-9) });
  }
  const zones = baseline != null && showZones
    ? BANDS.standDelta.filter((b) => isFinite(b.max)).map((b) => ({ v: baseline + b.max, d: b.max, color: GRADE_COLORS[b.cat as ScoreCat] || '#888' })).filter((z) => z.v > min && z.v < max)
    : [];
  return (
    <View style={{ backgroundColor: p.bg, borderRadius: radius.control, padding: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <RNText style={{ fontSize: 11, color: p.textDim }}>{`Heart rate (bpm) · ${fmtT(tSpan)} test`}</RNText>
        {baseline != null ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : null}
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {split ? (
          <Defs>
            <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
              {stops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
            </LinearGradient>
          </Defs>
        ) : null}
        {standX != null ? (
          <Rect x={standX} y={padT} width={W - padR - standX} height={H - padT - padB} fill={STAND_PURPLE} opacity={0.06} />
        ) : null}
        {ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} opacity={0.4} />
            <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{Math.round(t)}</SvgText>
          </React.Fragment>
        ))}
        {zones.map((z, i) => (
          <React.Fragment key={`z${i}`}>
            <Line x1={padL} x2={W - padR} y1={yAt(z.v)} y2={yAt(z.v)} stroke={z.color} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
            <SvgText x={W - padR} y={yAt(z.v) - 2} textAnchor="end" fontSize={8} fontWeight="700" fill={z.color}>{`+${z.d}`}</SvgText>
          </React.Fragment>
        ))}
        {baseline != null ? (
          <Line x1={padL} x2={W - padR} y1={yAt(baseline)} y2={yAt(baseline)} stroke={p.textDim} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
        ) : null}
        {standX != null ? (
          <Line x1={standX} x2={standX} y1={padT} y2={H - padB} stroke={STAND_PURPLE} strokeWidth={1.4} strokeDasharray="2 3" opacity={0.9} />
        ) : null}
        {pre.length ? <Path d={pathOf(pre)} fill="none" stroke={STAND_PURPLE} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {post.length ? <Path d={pathOf(post)} fill="none" stroke={`url(#${gid})`} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /> : null}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText style={{ fontSize: 10, color: p.textDim }}>0:00</RNText>
        {standX != null ? <RNText style={{ fontSize: 10, color: p.textDim }}>stood {fmtT(standAt! - t0)}</RNText> : null}
        <RNText style={{ fontSize: 10, color: p.textDim }}>{fmtT(t1 - t0)}</RNText>
      </View>
    </View>
  );
}

let orthoId = 0;
/**
 * HR-over-time trace for a POTS episode. Purple through the resting "before"
 * phase, then a POTS-graded gradient from the moment the transition begins.
 * Two vertical markers: where the episode begins ("during") and where the
 * transition completes ("after"). Dashed line is the resting baseline.
 */
export function OrthoHrChart({ samples, baseline, transitionAt, completedAt, height = 150 }: {
  samples: { t: number; bpm: number }[];
  baseline?: number | null;
  /** Seconds from start when the transition began (before → during). */
  transitionAt?: number | null;
  /** Seconds from start when the transition completed (during → recovery). */
  completedAt?: number | null;
  height?: number;
}) {
  const p = usePalette();
  const [showZones, setShowZones] = useState(false);
  const [gid] = useState(() => `oh${orthoId++}`);
  if (!samples || samples.length < 2) return null;
  const stride = Math.max(1, Math.ceil(samples.length / 300));
  const kept = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);
  const runs: { t: number; bpm: number }[][] = [];
  kept.forEach((s, i) => {
    if (i === 0 || s.t - kept[i - 1].t > 3 * stride + 1) runs.push([]);
    runs[runs.length - 1].push({ t: s.t, bpm: s.bpm });
  });
  runs.forEach((run) => {
    for (let pass = 0; pass < 2; pass++) {
      const src = run.map((q) => q.bpm);
      for (let i = 1; i < run.length - 1; i++) run[i].bpm = 0.25 * src[i - 1] + 0.5 * src[i] + 0.25 * src[i + 1];
    }
  });
  const bpms = runs.flat().map((q) => q.bpm);
  const dMin = Math.min(...bpms, baseline ?? Infinity), dMax = Math.max(...bpms, baseline ?? -Infinity);
  const span = dMax - dMin || 1;
  const min = dMin - span * 0.08, max = dMax + span * 0.08;
  const range = max - min || 1;
  const t0 = kept[0].t, t1 = kept[kept.length - 1].t;
  const tSpan = t1 - t0 || 1;
  const W = 320, H = height, padL = 34, padR = 8, padT = 12, padB = 20;
  const innerW = W - padL - padR;
  const xAt = (t: number) => padL + ((t - t0) / tSpan) * innerW;
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const ticks = [min, (min + max) / 2, max];
  const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const inRange = (t?: number | null) => (t != null && t > t0 && t < t1 ? xAt(t) : null);
  const splitX = inRange(transitionAt);
  const split = splitX != null && baseline != null;
  // Cut each run at the transition so the purple "before" trace and the graded
  // trace meet exactly at the marker. Without a baseline the grade is undefined.
  const pre: { t: number; bpm: number }[][] = [], post: { t: number; bpm: number }[][] = [];
  runs.forEach((run) => {
    if (!split) { pre.push(run); return; }
    const a = run.filter((q) => q.t <= transitionAt!), b = run.filter((q) => q.t >= transitionAt!);
    if (a.length && b.length && a[a.length - 1].t !== b[0].t) {
      const q0 = a[a.length - 1], q1 = b[0];
      const f = (transitionAt! - q0.t) / (q1.t - q0.t || 1);
      const mid = { t: transitionAt!, bpm: q0.bpm + f * (q1.bpm - q0.bpm) };
      a.push(mid); b.unshift(mid);
    }
    if (a.length >= 2) pre.push(a);
    if (b.length >= 2) post.push(b);
  });
  const pathOf = (segs: { t: number; bpm: number }[][]) =>
    segs.map((run) => smoothPath(run.map((q) => [xAt(q.t), yAt(q.bpm)] as [number, number]))).join(' ');
  const colAt = (v: number) => (baseline != null && GRADE_COLORS[catFromBands(v - baseline, BANDS.orthoIncrease) as ScoreCat]) || STAND_PURPLE;
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / range));
  const stops: { o: number; c: string }[] = [];
  if (split) {
    stops.push({ o: 0, c: colAt(max - 1e-9) });
    BANDS.orthoIncrease.map((b) => baseline! + b.max).filter((v) => isFinite(v) && v > min && v < max).sort((a, b) => b - a).forEach((v) => {
      stops.push({ o: offAt(v), c: colAt(v + 1e-9) });
      stops.push({ o: offAt(v), c: colAt(v - 1e-9) });
    });
    stops.push({ o: 1, c: colAt(min + 1e-9) });
  }
  const zones = baseline != null && showZones
    ? BANDS.orthoIncrease.filter((b) => isFinite(b.max)).map((b) => ({ v: baseline + b.max, d: b.max, color: GRADE_COLORS[b.cat as ScoreCat] || '#888' })).filter((z) => z.v > min && z.v < max)
    : [];
  // Vertical phase markers: where the episode begins (during) and where the
  // transition completes (after). Completion may sit on the right edge, so it
  // allows t == t1, unlike the purple→gradient split.
  const markerX = (t?: number | null) => (t != null && t > t0 && t <= t1 ? xAt(t) : null);
  const markers = [
    { x: splitX, label: 'during', color: STAND_PURPLE, strong: true },
    { x: markerX(completedAt), label: 'after', color: p.textDim, strong: false },
  ].filter((m) => m.x != null) as { x: number; label: string; color: string; strong: boolean }[];
  return (
    <View style={{ backgroundColor: p.bg, borderRadius: radius.control, padding: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <RNText style={{ fontSize: 11, color: p.textDim }}>{`Heart rate (bpm) · ${fmtT(tSpan)} event`}</RNText>
        {baseline != null ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : null}
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {split ? (
          <Defs>
            <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
              {stops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
            </LinearGradient>
          </Defs>
        ) : null}
        {splitX != null ? (
          <Rect x={splitX} y={padT} width={W - padR - splitX} height={H - padT - padB} fill={STAND_PURPLE} opacity={0.06} />
        ) : null}
        {ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} opacity={0.4} />
            <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{Math.round(t)}</SvgText>
          </React.Fragment>
        ))}
        {zones.map((z, i) => (
          <React.Fragment key={`z${i}`}>
            <Line x1={padL} x2={W - padR} y1={yAt(z.v)} y2={yAt(z.v)} stroke={z.color} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
            <SvgText x={W - padR} y={yAt(z.v) - 2} textAnchor="end" fontSize={8} fontWeight="700" fill={z.color}>{`+${z.d}`}</SvgText>
          </React.Fragment>
        ))}
        {baseline != null ? (
          <Line x1={padL} x2={W - padR} y1={yAt(baseline)} y2={yAt(baseline)} stroke={p.textDim} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
        ) : null}
        {markers.map((m, i) => (
          <React.Fragment key={`m${i}`}>
            <Line x1={m.x} x2={m.x} y1={padT} y2={H - padB} stroke={m.color} strokeWidth={m.strong ? 1.4 : 1} strokeDasharray="2 3" opacity={m.strong ? 0.9 : 0.6} />
            <SvgText x={m.x} y={padT - 3} textAnchor="middle" fontSize={8} fontWeight="700" fill={m.color}>{m.label}</SvgText>
          </React.Fragment>
        ))}
        {pre.length ? <Path d={pathOf(pre)} fill="none" stroke={STAND_PURPLE} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /> : null}
        {post.length ? <Path d={pathOf(post)} fill="none" stroke={`url(#${gid})`} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /> : null}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText style={{ fontSize: 10, color: p.textDim }}>0:00</RNText>
        <RNText style={{ fontSize: 10, color: p.textDim }}>{fmtT(t1 - t0)}</RNText>
      </View>
    </View>
  );
}

/* ---------- Imported-workout HR curve (samples vs elapsed time, zone-graded) ---------- */
/**
 * The HR trace of a workout imported from the health store, presented like the
 * POTS captures' curves: strided, smoothed runs (dropout gaps break the path)
 * with a vertical gradient — here coloured by exercise zone (%-of-max bands
 * from lib/workoutZones) instead of POTS grades. "Show zones" marks the zone
 * floors. Without an age-estimated max HR there are no zones, so the trace
 * draws in the accent colour and the toggle disappears.
 */
let workoutId = 0;
export function WorkoutHrChart({ samples, zones, height = 150 }: {
  samples: { t: number; bpm: number }[];
  zones: HrZone[] | null;
  height?: number;
}) {
  const p = usePalette();
  const [showZones, setShowZones] = useState(false);
  const [gid] = useState(() => `wh${workoutId++}`);
  if (!samples || samples.length < 2) return null;
  const stride = Math.max(1, Math.ceil(samples.length / 300));
  const kept = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);
  // Sample cadence varies by source (watch ~5 s, straps ~1 s) — size the
  // dropout threshold from the median gap rather than assuming 1 Hz.
  const gaps = kept.slice(1).map((s, i) => s.t - kept[i].t).sort((a, b) => a - b);
  const medGap = gaps[Math.floor(gaps.length / 2)] || 1;
  const runs: { t: number; bpm: number }[][] = [];
  kept.forEach((s, i) => {
    if (i === 0 || s.t - kept[i - 1].t > 4 * medGap) runs.push([]);
    runs[runs.length - 1].push({ t: s.t, bpm: s.bpm });
  });
  runs.forEach((run) => {
    for (let pass = 0; pass < 2; pass++) {
      const src = run.map((q) => q.bpm);
      for (let i = 1; i < run.length - 1; i++) run[i].bpm = 0.25 * src[i - 1] + 0.5 * src[i] + 0.25 * src[i + 1];
    }
  });
  const bpms = runs.flat().map((q) => q.bpm);
  if (bpms.length < 2) return null;
  const dMin = Math.min(...bpms), dMax = Math.max(...bpms);
  const span = dMax - dMin || 1;
  const min = dMin - span * 0.08, max = dMax + span * 0.08;
  const range = max - min || 1;
  const t0 = kept[0].t, t1 = kept[kept.length - 1].t;
  const tSpan = t1 - t0 || 1;
  const W = 320, H = height, padL = 34, padR = 8, padT = 12, padB = 20;
  const innerW = W - padL - padR;
  const xAt = (t: number) => padL + ((t - t0) / tSpan) * innerW;
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const ticks = [min, (min + max) / 2, max];
  const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const pathOf = (segs: { t: number; bpm: number }[][]) =>
    segs.map((run) => smoothPath(run.map((q) => [xAt(q.t), yAt(q.bpm)] as [number, number]))).join(' ');
  // Vertical gradient banded at the zone floors, same trick as the POTS charts.
  const colAt = (v: number) => (zones ? zoneFor(v, zones).color : p.accent);
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / range));
  const stops: { o: number; c: string }[] = [];
  if (zones) {
    stops.push({ o: 0, c: colAt(max - 1e-9) });
    zones.map((z) => z.from).filter((v) => v > min && v < max).sort((a, b) => b - a).forEach((v) => {
      stops.push({ o: offAt(v), c: colAt(v + 1e-9) });
      stops.push({ o: offAt(v), c: colAt(v - 1e-9) });
    });
    stops.push({ o: 1, c: colAt(min + 1e-9) });
  }
  const zoneLines = zones && showZones
    ? zones.filter((z) => z.z > 1 && z.from > min && z.from < max)
    : [];
  return (
    <View style={{ backgroundColor: p.bg, borderRadius: radius.control, padding: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <RNText style={{ fontSize: 11, color: p.textDim }}>{`Heart rate (bpm) · ${fmtT(tSpan)} workout`}</RNText>
        {zones ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : null}
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {zones ? (
          <Defs>
            <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
              {stops.map((s, i) => <Stop key={i} offset={s.o} stopColor={s.c} />)}
            </LinearGradient>
          </Defs>
        ) : null}
        {ticks.map((t, i) => (
          <React.Fragment key={i}>
            <Line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} opacity={0.4} />
            <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{Math.round(t)}</SvgText>
          </React.Fragment>
        ))}
        {zoneLines.map((z) => (
          <React.Fragment key={`z${z.z}`}>
            <Line x1={padL} x2={W - padR} y1={yAt(z.from)} y2={yAt(z.from)} stroke={z.color} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
            <SvgText x={W - padR} y={yAt(z.from) - 2} textAnchor="end" fontSize={8} fontWeight="700" fill={z.color}>{`Z${z.z}`}</SvgText>
          </React.Fragment>
        ))}
        <Path d={pathOf(runs)} fill="none" stroke={zones ? `url(#${gid})` : p.accent} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <RNText style={{ fontSize: 10, color: p.textDim }}>0:00</RNText>
        <RNText style={{ fontSize: 10, color: p.textDim }}>{fmtT(t1 - t0)}</RNText>
      </View>
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
export function BalanceChart({ pns, sns, height = 168, values, desc, defaultWhen }: {
  /** `date` is the x-axis label; `when` (Progress) is the readout phrase for
   *  that bucket ("in July"). Without one the point reads as a plain day. */
  pns: { v: number; date: string; when?: string | null }[];  // aligned index-for-index with sns
  sns: { v: number; date: string }[];
  height?: number;
  /** Default PNS/SNS readouts for the header numbers (this reading's value in a
   *  summary, the latest point in Progress). A drag selection overrides them
   *  with the touched point's values. */
  values?: { pns?: string | number | null; sns?: string | number | null };
  /** Explainer paragraph, rendered below the PNS/SNS numbers like other cards. */
  desc?: string;
  /** Phrase shown after the SNS number when nothing is selected (the latest
   *  bucket's in Progress; omitted in the reading summary, which shows this
   *  reading). A drag selection replaces it with the touched point's. */
  defaultWhen?: string | null;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  // Shared by tap-away blur and responder termination (scroll stole the touch).
  const reset = useCallback(() => setSel(-1), []);
  useChartsBlur(reset);
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
        onResponderTerminate={reset}
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
          {pns.slice(0, n).map((d, i) => labelTick(i, n, step) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{xLabel(d.date)}</SvgText> : null)}
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
  // Trails the SNS number: the touched point's period when selected (matching
  // the other cards), else the caller's default (the latest bucket in Progress,
  // nothing in the reading summary). PNS/SNS are unitless indices.
  const suffixLabel = readoutTail(null, selIdx >= 0
    ? (pns[selIdx].when ?? onDay(xLabel(pns[selIdx].date)))
    : defaultWhen);
  return (
    <View>
      {/* PNS/SNS legend + big numbers (main-metric size); the date trails the
          second number, as on the other Progress readouts. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 28 }}>
          {([['PNS', PNS_LINE, pnsShown], ['SNS', SNS_LINE, snsShown]] as const).map(([label, color, val], i) => (
            <View key={label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                <RNText style={{ fontSize: 12, color: p.textDim, fontWeight: '700', letterSpacing: 0.5 }}>{label}</RNText>
              </View>
              <RNText style={{ fontSize: 27, fontFamily: fonts.numHeavy, color, fontVariant: ['tabular-nums'], marginTop: 4 }}>
                {fmtV(val)}
                {suffixLabel && i === 1 ? <RNText style={TAIL_STYLE(p)}>{suffixLabel}</RNText> : null}
              </RNText>
            </View>
          ))}
        </View>
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
  buckets: BucketView[]; sys: (number | null)[]; dia: (number | null)[]; height?: number;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  const [gid] = useState(() => bpId++);
  // Shared by tap-away blur and responder termination (scroll stole the touch).
  const reset = useCallback(() => setSel(-1), []);
  useChartsBlur(reset);
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
  // Readout mirrors the metric cards: the latest reading by default (with its
  // date in parentheses), then the dragged bucket's reading. Tap-away returns
  // to the latest.
  const latestIdx = (() => {
    for (let i = n - 1; i >= 0; i--) { const s = sys[i], d = dia[i]; if (s != null && !isNaN(s) && d != null && !isNaN(d)) return i; }
    return -1;
  })();
  const showIdx = selIdx >= 0 ? selIdx : latestIdx;
  const fmt = (v: number | null | undefined) => (v != null && !isNaN(v) ? Math.round(v) : '–');
  const rSys = showIdx >= 0 ? sys[showIdx] : null;
  const rDia = showIdx >= 0 ? dia[showIdx] : null;
  const suffix = readoutTail('mmHg', showIdx >= 0 ? buckets[showIdx]?.when : null);
  return (
    <View>
      <RNText style={{ fontSize: 25, fontFamily: fonts.numHeavy, color: p.text, marginBottom: 6, fontVariant: ['tabular-nums'] }}>
        {`${fmt(rSys)}/${fmt(rDia)}`}
        <RNText style={TAIL_STYLE(p)}>{suffix}</RNText>
      </RNText>
      <View
        onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderTerminate={reset}
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
          {buckets.map((b, i) => labelTick(i, n, step) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{b.label}</SvgText> : null)}
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
  // Shared by tap-away blur and responder termination (scroll stole the touch).
  const reset = useCallback(() => { setSel(-1); onSelect?.(null); }, [onSelect]);
  useChartsBlur(reset);
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
  // A single segment's breakdown would just repeat the total, so it is omitted.
  const readout = readoutIdx >= 0
    ? `${buckets[readoutIdx]?.label ?? ''}: ${Math.round(totals[readoutIdx])}${unit ? ' ' + unit : ''}${segments.length > 1 ? ` · ${segments.map((s) => `${s.label} ${Math.round(s.values[readoutIdx] || 0)}`).join(' · ')}` : ''}`
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
        onResponderTerminate={reset}
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
                {labelTick(i, n, step) ? <SvgText x={xCenter(i)} y={H - 6} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{b.label}</SvgText> : null}
              </G>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

/* ---------- Horizontal bars (analysis) ---------- */
export function Bars({ rows, fmt, selected, onRowPress }: {
  rows: { name: string; count: number; color?: string; key?: string }[]; fmt?: (c: number) => string;
  /** Selected row key — the other rows dim while one is selected. */
  selected?: string | null;
  /** Makes keyed rows tappable; selection state is owned by the host. */
  onRowPress?: (key: string) => void;
}) {
  const p = usePalette();
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.count)) || 1;
  return (
    <View>
      {rows.map((r, i) => {
        const dim = selected != null && r.key !== selected;
        const row = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: dim ? 0.4 : 1 }}>
            <RNText style={{ width: '38%', fontSize: 15, color: p.text }}>{r.name}</RNText>
            <View style={{ flex: 1, height: 8, backgroundColor: p.surface2, borderRadius: 999, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${(r.count / max) * 100}%`, backgroundColor: r.color || p.accent, borderRadius: 999 }} />
            </View>
            <RNText style={{ width: 40, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '600', fontSize: 15, color: p.text }}>{fmt ? fmt(r.count) : String(r.count)}</RNText>
          </View>
        );
        return onRowPress && r.key != null
          ? <Pressable key={r.key} onPress={() => onRowPress(r.key!)}>{row}</Pressable>
          : <View key={i}>{row}</View>;
      })}
    </View>
  );
}

/* ---------- sleep report ---------- */

/**
 * One vertical bar per night, running from bedtime at the top to wake at the
 * bottom, over the rolling week the user was keeping at the time.
 *
 * Time runs DOWNWARD — earlier at the top — because that is the direction a
 * night runs, and it puts bedtime and wake where the eye expects them. Each
 * bar is graded on how long the night was, which is also its length, so the
 * colour and the picture say the same thing instead of two different ones.
 *
 * Drift is left to read off the bars themselves. `avgBedAt` / `avgWakeAt` are
 * still carried on each night for whatever wants them, but nothing is drawn
 * behind the bars: a shaded band competed with the dumbbells for the eye and
 * made the chart busier without answering a question the bars did not.
 */
export function SleepScheduleChart({ nights, height = 200, onSelect }: {
  nights: {
    dk: string;
    bedAt: number | null; wakeAt: number | null;
    cat: ScoreCat | null;
  }[];
  height?: number;
  onSelect?: (idx: number | null) => void;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  const reset = useCallback(() => { setSel(-1); onSelect?.(null); }, [onSelect]);
  useChartsBlur(reset);

  const all: number[] = [];
  nights.forEach((n) => { if (n.bedAt != null) all.push(n.bedAt); if (n.wakeAt != null) all.push(n.wakeAt); });
  if (all.length < 4) return null;
  let min = Math.min(...all), max = Math.max(...all);
  const padv = (max - min) * 0.1 + 15; min -= padv; max += padv;
  const W = 320, H = height, padL = 26, padR = 8, padT = 10, padB = 20;
  const innerW = W - padL - padR, n = nights.length;
  const selIdx = sel < n ? sel : -1;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  // Earlier at the top: time flows down the chart, the way a night does.
  const yAt = (v: number) => padT + ((v - min) / (max - min)) * (H - padT - padB);
  const col = (c: ScoreCat | null) => (c && GRADE_COLORS[c]) || p.text;
  const slot = innerW / Math.max(1, n - 1);
  // Dumbbell proportions: the ends keep the bar's full width (they are the two
  // times you actually read off the chart) while the body between them is
  // narrower, so a run of nights reads as a row of endpoints rather than a
  // picket fence. Same shape as the blood-pressure chart.
  const capW = Math.max(4, Math.min(13, slot * 0.5));
  const bodyW = Math.max(2, capW * 0.42);

  // Hour gridlines, at whatever spacing keeps them to a handful.
  const hourStep = (max - min) > 480 ? 180 : (max - min) > 240 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / hourStep) * hourStep; t <= max; t += hourStep) ticks.push(t);

  const step = Math.max(1, Math.ceil(n / 6));
  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1))));
    if (nights[i]?.bedAt == null) return;   // nothing drawn there to select
    setSel(i);
    onSelect?.(i);
  };

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setLayoutW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
      onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      onResponderTerminate={reset}
    >
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {ticks.map((t) => (
          <React.Fragment key={t}>
            <Line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke={p.border} strokeWidth={1} opacity={0.45} />
            <SvgText x={padL - 4} y={yAt(t) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{shortClock(t)}</SvgText>
          </React.Fragment>
        ))}
        {nights.map((q, i) => labelTick(i, n, step)
          ? <SvgText key={`x${i}`} x={xAt(i)} y={H - 5} textAnchor="middle" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{fmtShort(q.dk)}</SvgText>
          : null)}
        {nights.map((q, i) => {
          if (q.bedAt == null || q.wakeAt == null) return null;
          const on = i === selIdx;
          const c = col(q.cat);
          const x = xAt(i), r = (on ? capW + 2 : capW) / 2;
          return (
            <G key={q.dk} opacity={selIdx >= 0 && !on ? 0.5 : 1}>
              <Line
                x1={x} x2={x} y1={yAt(q.bedAt)} y2={yAt(q.wakeAt)}
                stroke={c} strokeWidth={on ? bodyW + 1.5 : bodyW} strokeLinecap="round"
              />
              <Circle cx={x} cy={yAt(q.bedAt)} r={r} fill={c} />
              <Circle cx={x} cy={yAt(q.wakeAt)} r={r} fill={c} />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/** "9p" / "12a" / "6a" for a minutes-past-noon value on the schedule axis. */
function shortClock(m: number): string {
  const mins = ((Math.round(m) + 720) % 1440 + 1440) % 1440;
  const h24 = Math.floor(mins / 60);
  const h = h24 % 12 || 12;
  return `${h}${h24 >= 12 ? 'p' : 'a'}`;
}

/** Nights under target — the same purple the Progress charts use for their
 *  second series (SNS_LINE below, baseline HRV in HrvProgress). Deliberately
 *  OUTSIDE the grade scale: amber there means "moderate", and these bars are
 *  not graded — a night under your own target is a fact about the night, not a
 *  mark against it. */
const SHORT_NIGHT = '#a855f7';

/**
 * Nightly sleep against the user's own target.
 *
 * Just the bars and the target line. A cumulative running-total line used to
 * sit over them on its own hidden scale, which read as a second metric nobody
 * asked for — and "sleep debt" is exactly the framing this card is supposed to
 * avoid. The total is still in the header, as a number.
 */
export function SleepBalanceChart({ hours, target, height = 120 }: {
  hours: number[]; target: number; height?: number;
}) {
  if (hours.length < 2) return null;
  const W = 320, H = height, padL = 20, padR = 6, padT = 12, padB = 16;
  const lo = Math.min(4, Math.floor(Math.min(...hours) - 0.5));
  const hi = Math.max(9, Math.ceil(Math.max(...hours, target) + 0.5));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const slot = (W - padL - padR) / hours.length;
  const bw = Math.max(2, slot - 4);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke={GRADE_COLORS.good} strokeWidth={1.4} strokeDasharray="5 4" />
      <SvgText x={0} y={y(target) + 3.5} fontSize={9} fontWeight="700" fill={GRADE_COLORS.good}>{`${fmtNum(target)}h`}</SvgText>
      {hours.map((h, i) => (
        <Rect
          key={i} x={padL + i * slot + 2} y={y(h)} width={bw} height={Math.max(2, y(lo) - y(h))} rx={2.5}
          fill={h < target ? SHORT_NIGHT : SLEEP_BLUE} opacity={i === hours.length - 1 ? 1 : 0.7}
        />
      ))}
    </Svg>
  );
}

/**
 * The last N nights' nocturnal dip as bars above and below zero, with the
 * normal-dip guide across them. Nights with no dip leave a gap rather than
 * closing up, so the run reads as nights and not as samples.
 *
 * Tapping or dragging a bar selects that night, the same gesture the Progress
 * sparklines use, and reports it so the card's headline can read that night's
 * value and date. A touch anywhere else blurs back to the latest night
 * (`useChartsBlur`), so a selection is never left stranded.
 */
export function DipTrendChart({ points, colorFor, onSelect, height = 96 }: {
  points: { dk: string; pct: number | null }[];
  colorFor: (pct: number) => string;
  /** Reports the selected night (null when a tap elsewhere blurs it). */
  onSelect?: (pt: { dk: string; pct: number } | null) => void;
  height?: number;
}) {
  const p = usePalette();
  const lastWithValue = (() => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].pct != null) return i;
    return -1;
  })();
  const [sel, setSel] = useState(lastWithValue);
  const [layoutW, setLayoutW] = useState(0);
  const reset = useCallback(() => { setSel(lastWithValue); onSelect?.(null); }, [lastWithValue, onSelect]);
  useChartsBlur(reset);
  const vals = points.map((q) => q.pct).filter((v): v is number => v != null);
  const W = 320, H = height, padL = 4, padR = 4, padT = 10, padB = 16;
  const slot = (W - padL - padR) / (points.length || 1);
  const bw = Math.max(2, slot - 5);
  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.max(0, Math.min(points.length - 1, Math.floor((px - padL) / slot)));
    // A night with no overnight low has nothing to select; hold the last one.
    if (points[i]?.pct == null) return;
    setSel(i);
    onSelect?.({ dk: points[i].dk, pct: points[i].pct as number });
  };
  if (vals.length < 2) return null;
  const hi = Math.max(...vals, 5);
  const lo = Math.min(0, ...vals);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setLayoutW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
      onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      onResponderTerminate={reset}
      style={{ height: H }}
    >
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={p.border} strokeWidth={1} />
        {points.map((q, i) => {
          if (q.pct == null) return null;
          const top = q.pct >= 0 ? y(q.pct) : y(0);
          return (
            <Rect
              key={q.dk} x={padL + i * slot + 2.5} y={top} width={bw} height={Math.max(2, Math.abs(y(q.pct) - y(0)))} rx={2}
              fill={colorFor(q.pct)} opacity={i === sel ? 1 : 0.45}
            />
          );
        })}
        <SvgText x={padL} y={H - 3} fontSize={9} fill={p.textDim}>{`${points.length} nights ago`}</SvgText>
        <SvgText x={W - padR} y={H - 3} textAnchor="end" fontSize={9} fontWeight="700" fill={p.text}>last night</SvgText>
      </Svg>
    </View>
  );
}

/* ---------- within-night series ---------- */

/** Clock label for `sec` seconds after a bedtime given in minutes past noon. */
function nightClock(bedAt: number, sec: number): string {
  const mins = ((Math.round(bedAt + sec / 60) + 720) % 1440 + 1440) % 1440;
  const h24 = Math.floor(mins / 60), m = mins % 60;
  const h = h24 % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${h24 >= 12 ? 'p' : 'a'}` : `${h}${h24 >= 12 ? 'p' : 'a'}`;
}

let nightId = 0;

/**
 * One night's curve on a clock axis — the overnight heart rate, or the
 * respiratory rate over the same window.
 *
 * `scatter` draws one dot per sample graded through `bands`, with a smoothed
 * line through them: an overnight trace is noisy enough that a single line
 * hides the spikes, and the spikes are the whole reason someone opens this.
 * Without it the series is drawn as a plain line in `color`.
 *
 * The x-axis is real clock time, because "when did that happen" is the only
 * question this chart exists to answer.
 */
export function NightSeriesChart({ points, bedAt, color, bands, scatter, refLine, right, height = 150, onSelect }: {
  points: { t: number; v: number }[];
  /** Bedtime in minutes past noon, for the clock labels. */
  bedAt: number;
  color: string;
  /** Grades each sample's colour (scatter mode). */
  bands?: Band[] | null;
  scatter?: boolean;
  /** A dashed reference line with its own label, e.g. the user's typical low. */
  refLine?: { v: number; label: string; color: string } | null;
  /**
   * A second series on its OWN right-hand axis. Two overnight measures rarely
   * share a range (breaths per minute against beats per minute is 15 vs 60),
   * so a shared axis would flatten one of them into a straight line. Each gets
   * its own scale and its axis labels take its colour, which is the only thing
   * saying which number belongs to which line.
   */
  right?: { points: { t: number; v: number }[]; color: string } | null;
  height?: number;
  onSelect?: (sel: { t: number; v: number; rv: number | null } | null) => void;
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  const [gid] = useState(() => `ns${nightId++}`);
  const reset = useCallback(() => { setSel(-1); onSelect?.(null); }, [onSelect]);
  useChartsBlur(reset);
  if (!points || points.length < 3) return null;

  const scaleOf = (vals: number[], extra?: number | null) => {
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (extra != null) { lo = Math.min(lo, extra); hi = Math.max(hi, extra); }
    const span = hi - lo || 1;
    return { lo: lo - span * 0.12, hi: hi + span * 0.12 };
  };
  const L = scaleOf(points.map((q) => q.v), refLine ? refLine.v : null);
  const R = right && right.points.length >= 2 ? scaleOf(right.points.map((q) => q.v)) : null;

  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const tSpan = t1 - t0 || 1;
  const W = 320, H = height, padL = 28, padR = R ? 28 : 10, padT = 12, padB = 20;
  const innerW = W - padL - padR;
  const xAt = (t: number) => padL + ((t - t0) / tSpan) * innerW;
  const plotY = (v: number, s: { lo: number; hi: number }) =>
    padT + (1 - (v - s.lo) / (s.hi - s.lo)) * (H - padT - padB);
  const yAt = (v: number) => plotY(v, L);
  const yR = (v: number) => plotY(v, R!);
  const colAt = (v: number) => {
    if (!bands) return color;
    const c = catFromBands(v, bands);
    return (c && GRADE_COLORS[c]) || color;
  };
  const selIdx = sel >= 0 && sel < points.length ? sel : -1;

  const nearest = (rows: { t: number; v: number }[], t: number) => {
    let best = 0;
    for (let i = 1; i < rows.length; i++) if (Math.abs(rows[i].t - t) < Math.abs(rows[best].t - t)) best = i;
    return rows[best];
  };

  /**
   * The scatter's trend line is a moving average — the line the eye is trying
   * to draw for itself. A plain line chart draws the SAMPLES, smoothed only by
   * the usual spline: a moving-averaged path with the readout dot placed on
   * the raw value puts the dot visibly off the line it is supposed to sit on.
   */
  const win = Math.max(2, Math.round(points.length / 24));
  const linePts: [number, number][] = scatter
    ? points.map((q, i) => {
      const from = Math.max(0, i - win), to = Math.min(points.length - 1, i + win);
      let sum = 0;
      for (let j = from; j <= to; j++) sum += points[j].v;
      return [xAt(q.t), yAt(sum / (to - from + 1))];
    })
    : points.map((q) => [xAt(q.t), yAt(q.v)]);

  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const t = t0 + ((px - padL) / innerW) * tSpan;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    }
    setSel(best);
    const rv = right && right.points.length ? nearest(right.points, points[best].t).v : null;
    onSelect?.({ t: points[best].t, v: points[best].v, rv });
  };

  // Three clock ticks: start, middle, end of the night.
  const ticks = [t0, t0 + tSpan / 2, t1];
  const axisVals = (s: { lo: number; hi: number }) =>
    [s.lo + (s.hi - s.lo) * 0.12, (s.lo + s.hi) / 2, s.hi - (s.hi - s.lo) * 0.12];
  const selR = selIdx >= 0 && right && right.points.length ? nearest(right.points, points[selIdx].t) : null;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setLayoutW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
      onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
      onResponderTerminate={reset}
    >
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gid} x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={colAt(L.hi)} />
            <Stop offset={1} stopColor={colAt(L.lo)} />
          </LinearGradient>
        </Defs>
        {axisVals(L).map((v, i) => (
          <React.Fragment key={i}>
            <Line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} stroke={p.border} strokeWidth={1} opacity={0.45} />
            <SvgText x={padL - 4} y={yAt(v) + 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={R ? color : p.textDim}>{Math.round(v)}</SvgText>
          </React.Fragment>
        ))}
        {R ? axisVals(R).map((v, i) => (
          <SvgText key={`r${i}`} x={W - padR + 4} y={yR(v) + 3} fontSize={9} fontFamily={fonts.mono} fill={right!.color}>{Math.round(v)}</SvgText>
        )) : null}
        {refLine && refLine.v > L.lo && refLine.v < L.hi ? (
          <>
            <Line x1={padL} x2={W - padR} y1={yAt(refLine.v)} y2={yAt(refLine.v)} stroke={refLine.color} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.85} />
            <SvgText x={W - padR} y={yAt(refLine.v) - 4} textAnchor="end" fontSize={9} fontWeight="700" fill={refLine.color}>{refLine.label}</SvgText>
          </>
        ) : null}
        {R ? (
          <Path
            d={smoothPath(right!.points.map((q) => [xAt(q.t), yR(q.v)] as [number, number]))}
            fill="none" stroke={right!.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9}
          />
        ) : null}
        {scatter
          ? points.map((q, i) => <Circle key={i} cx={xAt(q.t)} cy={yAt(q.v)} r={1.7} fill={colAt(q.v)} opacity={0.9} />)
          : null}
        <Path
          d={smoothPath(linePts)} fill="none"
          stroke={scatter ? (p.dark ? '#c9c9d0' : '#52525b') : (bands ? `url(#${gid})` : color)}
          strokeWidth={scatter ? 1.8 : 2.2} strokeLinecap="round" strokeLinejoin="round"
          opacity={scatter ? 0.85 : 1}
        />
        {selIdx >= 0 ? (
          <G>
            <Line x1={xAt(points[selIdx].t)} x2={xAt(points[selIdx].t)} y1={padT} y2={H - padB} stroke={p.text} strokeWidth={1} opacity={0.35} />
            {selR ? <Circle cx={xAt(points[selIdx].t)} cy={yR(selR.v)} r={4} fill={right!.color} stroke={p.surface2} strokeWidth={1.5} /> : null}
            <Circle cx={xAt(points[selIdx].t)} cy={yAt(points[selIdx].v)} r={4} fill={bands ? colAt(points[selIdx].v) : color} stroke={p.surface2} strokeWidth={1.5} />
          </G>
        ) : null}
        {ticks.map((t, i) => (
          <SvgText
            key={i} x={xAt(t)} y={H - 5} fontSize={9} fontFamily={fonts.mono} fill={p.textDim}
            textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
          >{nightClock(bedAt, t)}</SvgText>
        ))}
      </Svg>
    </View>
  );
}

/**
 * The hypnogram: one row per stage, one block per span, across the night.
 *
 * This is the picture the report could not draw before — stage TOTALS cannot
 * say whether the deep sleep came in one early block or in scraps all night,
 * and they cannot put an awake block next to the moment the heart rate rose.
 */
export function Hypnogram({ spans, bedAt, colors, labels, rows, height = 118 }: {
  spans: { s: number; d: number; v: string }[];
  bedAt: number;
  colors: Record<string, string>;
  labels: Record<string, string>;
  /** Row order, top to bottom. */
  rows: string[];
  height?: number;
}) {
  const p = usePalette();
  if (!spans.length) return null;
  const total = spans.reduce((m, q) => Math.max(m, q.s + q.d), 0) || 1;
  const W = 320, H = height, padL = 34, padR = 6, padT = 6, padB = 14;
  const rowH = (H - padT - padB) / rows.length;
  const xAt = (sec: number) => padL + (sec / total) * (W - padL - padR);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {rows.map((r, i) => (
        <React.Fragment key={r}>
          <SvgText x={0} y={padT + i * rowH + rowH / 2 + 3} fontSize={9.5} fontWeight="600" fill={p.textDim}>{labels[r]}</SvgText>
          <Line x1={padL} x2={W - padR} y1={padT + i * rowH + rowH / 2 + 1} y2={padT + i * rowH + rowH / 2 + 1} stroke={p.border} strokeWidth={1} opacity={0.4} />
        </React.Fragment>
      ))}
      {spans.map((q, i) => {
        const row = rows.indexOf(q.v);
        if (row < 0) return null;
        const w = Math.max(1.5, xAt(q.s + q.d) - xAt(q.s));
        return (
          <Rect
            key={i} x={xAt(q.s)} y={padT + row * rowH + rowH / 2 - 5.5}
            width={w} height={11} rx={2.5} fill={colors[q.v]}
          />
        );
      })}
      <SvgText x={padL} y={H - 3} fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{nightClock(bedAt, 0)}</SvgText>
      <SvgText x={W - padR} y={H - 3} textAnchor="end" fontSize={9} fontFamily={fonts.mono} fill={p.textDim}>{nightClock(bedAt, total)}</SvgText>
    </Svg>
  );
}
