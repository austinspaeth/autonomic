// BpBars — blood-pressure "spread" chart: one vertical bar per bucket spanning
// diastolic→systolic, a 2-stop (top=sys color, bottom=dia color) gradient, and a
// dot at each endpoint. Ported verbatim from legacy acBpBars
// (docs/index.html:4784-4880): same viewBox 320×H, padding constants, xAt/yAt,
// the 0.12 y-pad, bar-width math, and the per-value zone tint via BANDS. The
// interactive drag/hover scrub (legacy ~4851-4878) is ported too: a draggable
// marker line + a readout above the chart showing the bucket's sys/dia, defaulting
// to the latest bucket with data. The dashed grade-band boundary lines are
// rendered statically (legacy "Show zones" toggle still TODO).
import React from 'react';
import { Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, {
  Line,
  Circle,
  Rect,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { catFromBands, BANDS } from '@core/scoring/bands';
import { SCORE_COLORS } from '@core/scoring/colors';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { AcBucket } from './AnalysisChart';
import { useChartScrub } from './useChartScrub';

let _gid = 0;

// Fixed viewBox geometry (legacy constants); module scope so the scrub hook can
// reuse the exact xAt math via padL/innerW.
const W = 320;
const padL = 34;
const padR = 10;
const padT = 10;
const padB = 22;
const innerW = W - padL - padR;

export interface BpBarsProps {
  buckets: AcBucket[];
  sys: (number | null)[];
  dia: (number | null)[];
  sysColor?: string;
  diaColor?: string;
  height?: number;
}

export function BpBars({ buckets, sys, dia, sysColor, diaColor, height }: BpBarsProps) {
  const t = useTheme();
  const n = buckets.length;

  const { onLayout, gesture, activeIndex } = useChartScrub({
    count: n,
    viewW: W,
    padL,
    innerW,
  });

  const all: number[] = [];
  sys.concat(dia).forEach((v) => { if (v != null && !isNaN(v)) all.push(v); });
  if (!all.length) return null;

  let min = Math.min(...all),
    max = Math.max(...all);
  if (min === max) {
    const e = (Math.abs(min) || 1) * 0.1 + 0.5;
    min -= e;
    max += e;
  }
  const padv = (max - min) * 0.12;
  min -= padv;
  max += padv;

  const H = height || 132;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const sysC = sysColor || t.accent;
  const diaC = diaColor || '#3b82f6';

  const gridVals = [min, (min + max) / 2, max];
  const step = Math.max(1, Math.ceil(n / 6));

  // Bar width in viewBox units — ~25% of the old width so the dots stay the
  // primary mark; still scaled to the bucket spacing.
  const gap = n > 1 ? innerW / (n - 1) : innerW;
  const barW = Math.max(1.5, Math.min(9, gap * 0.42) * 0.25);

  interface BarRender {
    i: number;
    x: number;
    yS: number;
    yD: number;
    sCol: string;
    dCol: string;
    gid: string;
  }
  const bars: BarRender[] = [];
  buckets.forEach((_b, i) => {
    const s = sys[i],
      dv = dia[i];
    if (s == null || isNaN(s) || dv == null || isNaN(dv)) return;
    const x = xAt(i),
      yS = yAt(s),
      yD = yAt(dv);
    const sCat = catFromBands(s, BANDS.sys);
    const dCat = catFromBands(dv, BANDS.dia);
    const sCol = (sCat && SCORE_COLORS[sCat]) || sysC;
    const dCol = (dCat && SCORE_COLORS[dCat]) || diaC;
    bars.push({ i, x, yS, yD, sCol, dCol, gid: 'bpg' + (_gid += 1) });
  });

  // "Show zones": dashed grade-band boundaries for systolic (S) / diastolic (D),
  // each colored by the zone below it. Shown statically here (legacy toggled).
  const zoneLines: { v: number; color: string; label: string }[] = [];
  const addZoneLines = (band: typeof BANDS.sys, label: string) =>
    band.forEach((seg) => {
      const bv = seg.max;
      if (bv !== Infinity && bv > min && bv < max)
        zoneLines.push({ v: bv, color: SCORE_COLORS[seg.cat] || '#888', label });
    });
  addZoneLines(BANDS.sys, 'S');
  addZoneLines(BANDS.dia, 'D');

  // Scrub readout: default to the latest bucket with both sys+dia (legacy
  // lastIdx), override with the actively scrubbed index. Marker only while
  // scrubbing (legacy marker opacity 0 → 0.35).
  let lastIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    const s = sys[i],
      dv = dia[i];
    if (s != null && !isNaN(s) && dv != null && !isNaN(dv)) {
      lastIdx = i;
      break;
    }
  }
  const readoutIdx = activeIndex != null ? activeIndex : lastIdx;
  let readoutText = '';
  if (readoutIdx >= 0) {
    const s = sys[readoutIdx],
      dv = dia[readoutIdx];
    readoutText =
      s != null && !isNaN(s) && dv != null && !isNaN(dv)
        ? `${buckets[readoutIdx].label}: ${Math.round(s)}/${Math.round(dv)}`
        : buckets[readoutIdx].label;
  }
  const markerX = readoutIdx >= 0 ? xAt(readoutIdx) : 0;

  return (
    <View>
      {/* Readout (legacy .spark-readout); shows the latest bucket when idle. */}
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.text, minHeight: 16 }}>
        {readoutText}
      </Text>

      <GestureDetector gesture={gesture}>
        <View onLayout={onLayout}>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <Defs>
              {bars.map((b) => (
                <LinearGradient key={b.gid} id={b.gid} x1={0} y1={0} x2={0} y2={1}>
                  <Stop offset={0} stopColor={b.sCol} />
                  <Stop offset={0.5} stopColor={b.sCol} />
                  <Stop offset={0.5} stopColor={b.dCol} />
                  <Stop offset={1} stopColor={b.dCol} />
                </LinearGradient>
              ))}
            </Defs>

            {/* y grid + labels */}
            {gridVals.map((val, k) => {
              const y = yAt(val);
              return (
                <G key={`g${k}`}>
                  <Line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke={t.border}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.6}
                  />
                  <SvgText x={padL - 4} y={y + 3} textAnchor="end" fontSize={9} fill={t.textDim}>
                    {String(Math.round(val))}
                  </SvgText>
                </G>
              );
            })}

            {/* x labels */}
            {buckets.map((b, i) => {
              if (i % step !== 0 && i !== n - 1) return null;
              return (
                <SvgText key={`x${i}`} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={t.textDim}>
                  {b.label}
                </SvgText>
              );
            })}

            {/* per-bucket bars + endpoint dots */}
            {bars.map((b) => (
              <G key={`b${b.i}`}>
                <Rect
                  x={b.x - barW / 2}
                  y={Math.min(b.yS, b.yD)}
                  width={barW}
                  height={Math.max(1.5, Math.abs(b.yD - b.yS))}
                  rx={barW / 2}
                  fill={`url(#${b.gid})`}
                  opacity={0.95}
                />
                <Circle cx={b.x} cy={b.yS} r={2.4} fill={b.sCol} />
                <Circle cx={b.x} cy={b.yD} r={2.4} fill={b.dCol} />
              </G>
            ))}

            {/* grade-band boundary guides */}
            {zoneLines.map((g, k) => (
              <G key={`z${k}`}>
                <Line
                  x1={padL}
                  x2={W - padR}
                  y1={yAt(g.v)}
                  y2={yAt(g.v)}
                  stroke={g.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
                <SvgText x={W - padR - 1} y={yAt(g.v) - 2} textAnchor="end" fontSize={9} fill={t.textDim}>
                  {g.label}
                </SvgText>
              </G>
            ))}

            {/* scrub marker line (active only) */}
            {activeIndex != null && readoutIdx >= 0 && (
              <Line
                x1={markerX}
                x2={markerX}
                y1={padT}
                y2={H - padB}
                stroke={t.text}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={0.35}
              />
            )}
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}
