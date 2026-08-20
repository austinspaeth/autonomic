/**
 * The three live cards under the timer: heart rate, SDNN, and the beat-to-beat
 * trace.
 *
 * They exist because a reading is five minutes of sitting still, and the one
 * question the user has the whole time is "is this actually working?". A number
 * alone does not answer it — 64 bpm looks identical whether the strap is
 * streaming or froze thirty seconds ago. A LINE answers it: the beat-to-beat
 * trace draws the respiratory wave as it forms, which is simultaneously the
 * proof the signal is live and (on a paced reading) the thing the breathing is
 * trying to produce. That is why the signal-quality dot lives on that card
 * rather than anywhere else.
 *
 * Three rules hold them together:
 *
 * - **They are readouts, not buttons.** The design they came from gave each tile
 *   a chevron and a full-screen chart behind it. There is no such screen, and a
 *   card that looks tappable mid-reading and does nothing is worse than a card
 *   that looks like what it is.
 * - **Smoothed, never invented.** HR and SDNN are drawn through a light EMA so a
 *   single artifact beat does not spike the sparkline into a claim the reading
 *   does not support; the RR trace is drawn RAW, because its wobble IS the
 *   measurement. Neither line carries an axis — these are shapes, and the number
 *   above them is the value.
 * - **Cheap.** Samples land at ~1 Hz for five minutes. The series are already
 *   windowed by the store (see HR_TRACE / RR_TRACE), the paths are plain strings
 *   rebuilt from at most ~70 points, and nothing here animates: the redraw IS
 *   the animation.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { GRADE_COLORS, fonts, usePalette } from '../../theme';

/* ---------- path helpers ---------- */

/**
 * Catmull-Rom through the points, emitted as cubic beziers. A polyline through
 * 1 Hz samples is visibly faceted at this size; this rounds it without moving
 * any sample off its own value (the curve passes THROUGH every point).
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x} ${pts[0].y}` : '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Light exponential smoothing. Enough to settle 1 Hz jitter, not enough to hide
 *  a real move — the number above the chart is unsmoothed either way. */
function ema(vals: number[], alpha = 0.35): number[] {
  const out: number[] = [];
  let acc = vals[0];
  for (const v of vals) { acc = alpha * v + (1 - alpha) * acc; out.push(acc); }
  return out;
}

/** Map a series into a fixed box, padding a flat series so it draws mid-height
 *  instead of collapsing onto the floor. */
function project(vals: number[], w: number, h: number, pad = 3) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const n = vals.length;
  return vals.map((v, i) => ({
    x: n === 1 ? w : (i / (n - 1)) * w,
    y: pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2),
  }));
}

/* ---------- the tiles ---------- */

const SPARK_W = 150, SPARK_H = 24;

function Spark({ vals, color }: { vals: number[]; color: string }) {
  // Under three points there is no shape yet, and a two-point series projects to
  // a dead-flat rule that reads as a divider rather than as a chart.
  if (vals.length < 3) return <View style={{ height: SPARK_H }} />;
  const pts = project(ema(vals), SPARK_W, SPARK_H);
  const head = pts[pts.length - 1];
  return (
    <Svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
      <Path d={smoothPath(pts)} stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <Circle cx={head.x} cy={head.y} r={2.2} fill={color} />
    </Svg>
  );
}

function StatTile({ label, value, unit, vals, color, pulse }: {
  label: string; value: number | null; unit: string; vals: number[]; color: string; pulse?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.sunk, borderRadius: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 }}>
      <Text style={{ color: p.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 5 }}>
        {/* No value yet reads as a dimmed "00" rather than a dash, the way the
            watch's own rings do: the slot keeps its numeric shape, so the tile
            does not reflow or change character the moment a beat lands, and the
            colour alone carries "not yet" → "live". */}
        <Text style={{
          color: value == null ? p.textDim : pulse ? color : p.text, fontSize: 29, fontWeight: '800',
          fontFamily: fonts.numBold, fontVariant: ['tabular-nums'] as const,
        }}>{value ?? '00'}</Text>
        <Text style={{ color: p.textDim, fontSize: 12 }}>{unit}</Text>
      </View>
      <View style={{ marginTop: 7 }}><Spark vals={vals} color={color} /></View>
    </View>
  );
}

/* ---------- the beat-to-beat trace ---------- */

// Tall enough that the respiratory wave has somewhere to go: at 58pt a paced
// breath flattened into a ripple, and the one chart that proves the signal is
// live has to actually show the swing.
const RR_W = 320, RR_H = 88;

/**
 * RR intervals, drawn raw and left to right with a live head dot. On a paced
 * reading this is the respiratory wave: the intervals lengthen through the
 * exhale and shorten through the inhale, so a user following the rings can watch
 * the guide land in the signal. The tail fades so the eye goes to the newest
 * beats without the older ones being thrown away.
 *
 * No baseline rule under it. A dashed median looked like an axis and invited the
 * reading that beats above it are "good", which is not what an RR interval means
 * — the shape is the whole message, and a reference line it does not have a
 * reference for only muddies it.
 */
function RrTrace({ vals, color }: { vals: number[]; color: string }) {
  const p = usePalette();
  // Empty until there is a shape to draw. The card's own dot and "No beats yet"
  // line already say what is happening one row above; a second sentence in the
  // middle of the chart said it twice and then vanished, which reads as the
  // chart replacing itself rather than filling in.
  if (vals.length < 3) return <View style={{ height: RR_H }} />;
  const pts = project(vals, RR_W, RR_H, 5);
  const head = pts[pts.length - 1];
  return (
    <Svg width="100%" height={RR_H} viewBox={`0 0 ${RR_W} ${RR_H}`} preserveAspectRatio="none">
      <Defs>
        {/* Oldest beats sit back, the newest are full strength. */}
        <LinearGradient id="rrFade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <Stop offset="45%" stopColor={color} stopOpacity={0.65} />
          <Stop offset="100%" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Path d={smoothPath(pts)} stroke="url(#rrFade)" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={head.x} cy={head.y} r={3.2} fill={color} stroke={p.sunk} strokeWidth={2} />
    </Svg>
  );
}

/* ---------- the block ---------- */

export function LiveStats({ hr, sdnn, beats, hrTrace, sdnnTrace, rrTrace, artifact }: {
  hr: number | null; sdnn: number | null; beats: number;
  hrTrace: number[]; sdnnTrace: number[]; rrTrace: number[]; artifact: boolean;
}) {
  const p = usePalette();
  const clean = !artifact;
  return (
    <View style={{ width: '100%', gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile label="Heart rate" value={hr} unit="bpm" vals={hrTrace} color={p.accent} pulse />
        <StatTile label="SDNN" value={sdnn} unit="ms" vals={sdnnTrace} color={p.textDim} />
      </View>
      <View style={{ backgroundColor: p.sunk, borderRadius: 18, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ color: p.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Beat to beat
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Neutral until beats actually arrive: a green "clean signal" dot
                over an empty chart is a claim about a signal that isn't there. */}
            <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: !beats ? p.border : clean ? GRADE_COLORS.good : GRADE_COLORS.bad }} />
            <Text style={{ color: p.textDim, fontSize: 11.5 }}>
              {beats ? `${clean ? 'Clean' : 'Noisy'} · ${beats} beats` : 'No beats yet'}
            </Text>
          </View>
        </View>
        <RrTrace vals={rrTrace} color={p.accent} />
      </View>
    </View>
  );
}
