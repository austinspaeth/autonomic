// Spark — a sparkline over a metric's recent points with grade-zone band
// coloring. Ported verbatim from legacy buildSpark (docs/index.html:3345-3437):
// same viewBox (W=320, H=90), padding (padL/padR/padT/padB), xAt/yAt formulas,
// niceScale axis, the vertical line gradient with hard zone-boundary stops,
// y-grid lines + axis labels, smoothed line path, per-point circles colored by
// catFromBands, and the drag-readout marker. Chart MATH is reused from
// @core/* (niceScale, smoothPath, catFromBands, SCORE_COLORS). Legacy injected
// var(--border)/var(--text-dim)/var(--text); those become t.* from useTheme().
import React from 'react';
import { Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { niceScale, smoothPath, type Point } from '@core/date/math';
import { catFromBands, type Bands } from '@core/scoring/bands';
import { SCORE_COLORS } from '@core/scoring/colors';
import type { MetricPoint } from '@core/analytics/metricHistory';
import { dateFromKey } from '@core/date/dateUtils';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useChartScrub } from './useChartScrub';

// Legacy fmtShort / fmtNum (docs/index.html:3279-3280).
const fmtShort = (dk: string): string =>
  dateFromKey(dk).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

// Fixed viewBox; the SVG scales to fill the card width (preserveAspectRatio none).
const W = 320;
const H = 90;
const padL = 30;
const padR = 10;
const padT = 10;
const padB = 18;
const innerW = W - padL - padR;

let gradSeq = 0; // legacy buildSpark._n — unique gradient id per instance

export interface SparkProps {
  points: MetricPoint[];
  bands?: Bands | null;
  height?: number;
}

export function Spark({ points, bands, height = 92 }: SparkProps): React.ReactElement | null {
  const t = useTheme();
  // Stable gradient id for this mounted instance.
  const gidRef = React.useRef<string | null>(null);
  if (gidRef.current == null) gidRef.current = 'spk' + (gradSeq = gradSeq + 1);
  const gid = gidRef.current;

  const { onLayout, gesture, activeIndex } = useChartScrub({
    count: points?.length ?? 0,
    viewW: W,
    padL,
    innerW,
  });

  if (!points || points.length < 2) return null;

  const vals = points.map((p) => p.v);
  const sc = niceScale(Math.min(...vals), Math.max(...vals), 4);
  const min = sc.min;
  const max = sc.max;

  const xAt = (i: number): number =>
    padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number): number => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  // Line is colored by a vertical gradient with hard stops at each zone
  // boundary, so the line takes on the grade color at its current height.
  const offAt = (v: number): number => Math.max(0, Math.min(1, 1 - (v - min) / (max - min)));
  const colAt = (v: number): string => SCORE_COLORS[catFromBands(v, bands) ?? 'great'] || '#888';

  let stops: { offset: number; color: string }[] | null = null;
  if (bands) {
    const arr: { offset: number; color: string }[] = [];
    arr.push({ offset: 0, color: colAt(max - 1e-9) }); // top (highest value)
    bands
      .map((b) => b.max)
      .filter((m) => m > min && m < max)
      .sort((a, b) => b - a)
      .forEach((bv) => {
        arr.push({ offset: offAt(bv), color: colAt(bv + 1e-9) }); // color above the boundary
        arr.push({ offset: offAt(bv), color: colAt(bv - 1e-9) }); // color below the boundary
      });
    arr.push({ offset: 1, color: colAt(min + 1e-9) }); // bottom (lowest value)
    stops = arr;
  }
  const stroke = bands ? `url(#${gid})` : t.text;

  // y ticks + labels
  const yTicks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += sc.step) yTicks.push(v);

  const pts: Point[] = points.map((p, i) => ({ x: xAt(i), y: yAt(p.v) }));
  const linePath = smoothPath(pts);

  const active = activeIndex != null ? points[activeIndex] : null;
  const activeCat = active ? catFromBands(active.v, bands) : null;
  const activeColor = active ? (activeCat && SCORE_COLORS[activeCat] ? SCORE_COLORS[activeCat] : t.text) : t.text;
  const activeX = activeIndex != null ? xAt(activeIndex) : 0;
  const activeY = active ? yAt(active.v) : 0;

  return (
    <View>
      {/* Readout (legacy .spark-readout); shows the last point when idle. */}
      <Text style={{ fontSize: 12, fontWeight: '600', color: activeColor, minHeight: 16 }}>
        {active
          ? `${fmtShort(active.date)}: ${fmtNum(active.v)}`
          : `${fmtShort(points[points.length - 1].date)}: ${fmtNum(points[points.length - 1].v)}`}
      </Text>

      <GestureDetector gesture={gesture}>
        <View onLayout={onLayout}>
          <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {stops && (
              <Defs>
                <LinearGradient id={gid} gradientUnits="userSpaceOnUse" x1={0} y1={padT} x2={0} y2={H - padB}>
                  {stops.map((s, i) => (
                    <Stop key={i} offset={s.offset} stopColor={s.color} />
                  ))}
                </LinearGradient>
              </Defs>
            )}

            {/* y grid lines + labels */}
            {yTicks.map((v, i) => {
              const yy = yAt(v);
              return (
                <React.Fragment key={`y${i}`}>
                  <Line
                    x1={padL}
                    x2={padL + innerW}
                    y1={yy}
                    y2={yy}
                    stroke={t.border}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.5}
                  />
                  <SvgText x={padL - 4} y={yy + 3} textAnchor="end" fontSize={9} fill={t.textDim}>
                    {fmtNum(v)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {/* x ticks */}
            {points.map((p, i) => (
              <Line
                key={`x${i}`}
                x1={xAt(i)}
                x2={xAt(i)}
                y1={H - padB}
                y2={H - padB + 4}
                stroke={t.textDim}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={0.6}
              />
            ))}

            {/* smoothed line */}
            <Path
              d={linePath}
              fill="none"
              stroke={stroke}
              strokeWidth={3.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* data points */}
            {points.map((p, i) => {
              const cat = catFromBands(p.v, bands);
              return (
                <Circle
                  key={`c${i}`}
                  cx={xAt(i)}
                  cy={yAt(p.v)}
                  r={2.6}
                  fill={cat && SCORE_COLORS[cat] ? SCORE_COLORS[cat] : t.text}
                />
              );
            })}

            {/* scrub marker + active dot */}
            {active && (
              <>
                <Line
                  x1={activeX}
                  x2={activeX}
                  y1={padT}
                  y2={H - padB}
                  stroke={t.text}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  opacity={0.35}
                />
                <Circle cx={activeX} cy={activeY} r={3.6} fill={activeColor} />
              </>
            )}
          </Svg>
        </View>
      </GestureDetector>

      {/* Date endpoints (legacy .spark-dates) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 10, color: t.textDim }}>{fmtShort(points[0].date)}</Text>
        <Text style={{ fontSize: 10, color: t.textDim }}>{fmtShort(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

export default Spark;
