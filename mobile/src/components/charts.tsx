/**
 * Hand-drawn charts with react-native-svg, matching the PWA's SVG style:
 * Sparkline (grade-zone gradient + draggable readout), ScoreGauge (270° arc),
 * PowerBar (VLF/LF/HF distribution), LineChart (analysis series), Tachogram.
 */
import React, { useState } from 'react';
import { LayoutChangeEvent, Text as RNText, View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText,
} from 'react-native-svg';
import { fmtNum, fmtShort } from '../lib/dates';
import { GRADE_COLORS, radius, usePalette } from '../theme';
import type { Band, ScoreCat } from '../lib/types';
import { BANDS, catFromBands } from '../lib/scoring';

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

/* ---------- Sparkline ---------- */
export function Sparkline({ points, bands, height = 92 }: { points: { v: number; date: string }[]; bands?: Band[] | null; height?: number }) {
  const p = usePalette();
  const [sel, setSel] = useState<number>(points.length - 1);
  const [layoutW, setLayoutW] = useState(0);
  if (!points || points.length < 2) return null;
  const gid = `spk${sparkId++}`;
  const vals = points.map((pt) => pt.v);
  const sc = niceScale(Math.min(...vals), Math.max(...vals), 4);
  const { min, max, step } = sc;
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

  const yticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) yticks.push(t);
  const xy: [number, number][] = points.map((pt, i) => [xAt(i), yAt(pt.v)]);

  const selPt = points[Math.max(0, Math.min(points.length - 1, sel))];
  const selCat = bands ? catFromBands(selPt.v, bands) : null;
  const selColor = selCat && GRADE_COLORS[selCat] ? GRADE_COLORS[selCat] : p.text;

  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    const i = Math.round(((px - padL) / innerW) * (points.length - 1));
    setSel(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <View style={{ marginTop: 16 }}>
      <RNText style={{ fontSize: 12, fontWeight: '700', color: selColor, height: 16, marginBottom: 4, fontVariant: ['tabular-nums'] }}>
        {`${fmtShort(selPt.date)}: ${fmtNum(selPt.v)}`}
      </RNText>
      <View
        onLayout={(e: LayoutChangeEvent) => setLayoutW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => onTouch(e.nativeEvent.locationX)}
        onResponderMove={(e) => onTouch(e.nativeEvent.locationX)}
        style={{ backgroundColor: p.bg, borderRadius: 10, height }}
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

/* ---------- Power spectrum (frequency-axis VLF/LF/HF distribution) ---------- */
/**
 * Distribution of HRV power across the frequency spectrum. The x-axis is
 * frequency starting at 0 Hz; each band (VLF / LF / HF) is drawn at its true
 * frequency width with a height proportional to its power *density* (power ÷
 * bandwidth) so the filled area of each block reflects its share of total power.
 */
export function PowerSpectrum({ vlf, lf, hf }: { vlf: number | null; lf: number | null; hf: number | null }) {
  const p = usePalette();
  const vals: Record<string, number> = { vlf: vlf || 0, lf: lf || 0, hf: hf || 0 };
  const total = vals.vlf + vals.lf + vals.hf;
  if (!total) return null;
  const W = 320, H = 150, padL = 8, padR = 8, padT = 12, padB = 30;
  const fMax = 0.4;
  const innerW = W - padL - padR;
  const xAt = (f: number) => padL + (f / fMax) * innerW;
  // density = power per Hz, so the block area encodes power share
  const density = SPECTRUM_BANDS.map((b) => vals[b.key] / (b.hi - b.lo));
  const dMax = Math.max(...density) || 1;
  const yAt = (d: number) => padT + (1 - d / dMax) * (H - padT - padB);
  const pct = (x: number) => Math.round((x / total) * 100);
  const ticks = [0, 0.04, 0.15, 0.4];
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke={p.border} strokeWidth={1} />
        {SPECTRUM_BANDS.map((b, i) => {
          const x0 = xAt(b.lo), x1 = xAt(b.hi), y = yAt(density[i]);
          const w = Math.max(1, x1 - x0);
          const cx = x0 + w / 2;
          return (
            <G key={b.key}>
              <Path d={`M${x0} ${H - padB} L${x0} ${y} L${x1} ${y} L${x1} ${H - padB} Z`} fill={b.color} opacity={0.85} />
              {w >= 26 ? <SvgText x={cx} y={y - 4} textAnchor="middle" fontSize={10} fontWeight="700" fill={p.text}>{`${pct(vals[b.key])}%`}</SvgText> : null}
              <SvgText x={cx} y={H - padB + 20} textAnchor="middle" fontSize={9} fontWeight="700" fill={b.color}>{b.label}</SvgText>
            </G>
          );
        })}
        {ticks.map((t, i) => <SvgText key={i} x={Math.max(padL + 4, Math.min(W - padR - 4, xAt(t)))} y={H - padB + 10} textAnchor="middle" fontSize={8} fill={p.textDim}>{`${t}`}</SvgText>)}
      </Svg>
      <RNText style={{ fontSize: 12, color: p.textDim, textAlign: 'center' }}>{`Frequency (Hz) · VLF ${pct(vals.vlf)}% · LF ${pct(vals.lf)}% · HF ${pct(vals.hf)}%`}</RNText>
    </View>
  );
}

/* ---------- Line chart (analysis) with grade-zone gradient + drag readout ---------- */
export interface Series { values: (number | null)[]; color: string; label?: string; dashed?: boolean; pointBands?: Band[] | null }
export interface Zone { from: number; to: number; color: string }

let lcId = 0;

export function LineChart({ buckets, series, zones, integer, height = 140, target }: {
  buckets: { label: string }[]; series: Series[]; zones?: Zone[] | null; integer?: boolean; height?: number; target?: { from: number; to: number; color: string };
}) {
  const p = usePalette();
  const [layoutW, setLayoutW] = useState(0);
  const [sel, setSel] = useState<number>(-1);
  const all: number[] = [];
  series.forEach((s) => s.values.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); }));
  if (!all.length) return null;
  let min = Math.min(...all), max = Math.max(...all);
  if (target) { min = Math.min(min, target.from); max = Math.max(max, target.to); }
  if (min === max) { const e = (Math.abs(min) || 1) * 0.1 + 0.5; min -= e; max += e; }
  const padv = (max - min) * 0.12; min -= padv; max += padv;
  const W = 320, H = height, padL = 34, padR = 10, padT = 10, padB = 22;
  const innerW = W - padL - padR, n = buckets.length;
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
    setSel(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1)))));
  };
  const readoutIdx = sel >= 0 ? sel : (() => { for (let i = n - 1; i >= 0; i--) if (series.some((s) => s.values[i] != null)) return i; return -1; })();
  const readout = readoutIdx >= 0
    ? `${buckets[readoutIdx].label}: ${series.filter((s) => s.values[readoutIdx] != null).map((s) => (series.filter((x) => x.label).length > 1 && s.label ? s.label + ' ' : '') + fmtNum(integer ? Math.round(s.values[readoutIdx] as number) : (s.values[readoutIdx] as number))).join(' · ')}`
    : '';

  return (
    <View>
      <RNText style={{ fontSize: 12, fontWeight: '700', color: p.text, height: 16, marginBottom: 4, fontVariant: ['tabular-nums'] }}>{readout}</RNText>
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
              <Line x1={padL} x2={W - padR} y1={yAt(val)} y2={yAt(val)} stroke={p.border} strokeWidth={1} opacity={0.6} />
              <SvgText x={padL - 4} y={yAt(val) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{fmtNum(integer ? Math.round(val) : val)}</SvgText>
            </React.Fragment>
          ))}
          {buckets.map((b, i) => (i % step === 0 || i === n - 1) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={p.textDim}>{b.label}</SvgText> : null)}
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
          {readoutIdx >= 0 && <Line x1={xAt(readoutIdx)} x2={xAt(readoutIdx)} y1={padT} y2={H - padB} stroke={p.text} strokeWidth={1} opacity={0.35} />}
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
  const min = Math.min(...rr), max = Math.max(...rr);
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
  const all: number[] = [];
  sys.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); });
  dia.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); });
  if (!all.length) return null;
  let min = Math.min(...all), max = Math.max(...all);
  const padv = (max - min) * 0.12 + 4; min -= padv; max += padv;
  const W = 320, H = height, padL = 34, padR = 10, padT = 10, padB = 22;
  const innerW = W - padL - padR, n = buckets.length;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const col = (v: number, bands: Band[]) => { const c = catFromBands(v, bands); return (c && GRADE_COLORS[c]) || p.text; };
  const step = Math.max(1, Math.ceil(n / 6));
  const onTouch = (x: number) => {
    if (layoutW <= 0) return;
    const px = (x / layoutW) * W;
    setSel(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1)))));
  };
  const readoutIdx = sel >= 0 ? sel : (() => { for (let i = n - 1; i >= 0; i--) if (sys[i] != null || dia[i] != null) return i; return -1; })();
  const readout = readoutIdx >= 0 ? `${buckets[readoutIdx].label}: ${sys[readoutIdx] != null ? Math.round(sys[readoutIdx] as number) : '-'}/${dia[readoutIdx] != null ? Math.round(dia[readoutIdx] as number) : '-'}` : '';
  return (
    <View>
      <RNText style={{ fontSize: 12, fontWeight: '700', color: p.text, height: 16, marginBottom: 4, fontVariant: ['tabular-nums'] }}>{readout}</RNText>
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
              <SvgText x={padL - 4} y={yAt(val) + 3} textAnchor="end" fontSize={9} fill={p.textDim}>{Math.round(val)}</SvgText>
            </React.Fragment>
          ))}
          {buckets.map((b, i) => (i % step === 0 || i === n - 1) ? <SvgText key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={p.textDim}>{b.label}</SvgText> : null)}
          {buckets.map((_, i) => {
            const s = sys[i], d = dia[i];
            if (s == null || d == null) return null;
            const x = xAt(i);
            return (
              <G key={i}>
                <Line x1={x} x2={x} y1={yAt(s)} y2={yAt(d)} stroke={`url(#bp${gid}_${i})`} strokeWidth={i === readoutIdx ? 5 : 3.4} strokeLinecap="round" />
                <Circle cx={x} cy={yAt(s)} r={i === readoutIdx ? 4.5 : 3.4} fill={col(s, BANDS.sys)} />
                <Circle cx={x} cy={yAt(d)} r={i === readoutIdx ? 4.5 : 3.4} fill={col(d, BANDS.dia)} />
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
