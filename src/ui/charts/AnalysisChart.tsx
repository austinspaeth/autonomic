// AnalysisChart — multi-series time-series line chart over buckets.
// Ported verbatim from legacy acChart (docs/index.html:4667-4778). The
// interactive drag/hover scrub (legacy ~4738-4776) is intentionally deferred:
// this pass renders a static chart. The default-latest-bucket readout/marker is
// also omitted (it was part of the scrub UI). All geometry — viewBox 320×H,
// padL/padR/padT/padB, xAt/yAt, the y-pad (0.12), the grade gradient stop logic,
// and number formatting — is preserved exactly.
import React from 'react';
import Svg, {
  Path,
  Line,
  Circle,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { smoothPath } from '@core/date/math';
import { catFromBands, type Bands } from '@core/scoring/bands';
import { SCORE_COLORS } from '@core/scoring/colors';
import { useTheme } from '@ui/theme/ThemeProvider';

// Legacy fmtNum (docs/index.html:3280).
const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

export interface AcZone {
  from: number;
  to: number;
  color: string;
}

export interface AcSeries {
  values: (number | null)[];
  color: string;
  label: string;
  dashed?: boolean;
  pointBands?: Bands;
  pointColorFn?: (v: number) => string | null;
}

export interface AcBucket {
  label: string;
}

export interface AcOpts {
  zones?: AcZone[];
  target?: { from: number; to: number; color?: string };
  height?: number;
  integer?: boolean;
}

export interface AnalysisChartProps {
  buckets: AcBucket[];
  series: AcSeries[];
  opts?: AcOpts;
}

// Stable gradient id counter (legacy used acChart._n).
let _gid = 0;

export function AnalysisChart({ buckets, series, opts = {} }: AnalysisChartProps) {
  const t = useTheme();

  const all: number[] = [];
  series.forEach((s) => s.values.forEach((v) => { if (v != null && !isNaN(v)) all.push(v); }));
  if (!all.length) return null;

  let min = Math.min(...all),
    max = Math.max(...all);
  if (opts.target) {
    min = Math.min(min, opts.target.from);
    max = Math.max(max, opts.target.to);
  }
  if (min === max) {
    const e = (Math.abs(min) || 1) * 0.1 + 0.5;
    min -= e;
    max += e;
  }
  const padv = (max - min) * 0.12;
  min -= padv;
  max += padv;

  const W = 320,
    H = opts.height || 132,
    padL = 34,
    padR = 10,
    padT = 10,
    padB = 22;
  const innerW = W - padL - padR,
    n = buckets.length;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const zones = opts.zones && opts.zones.length ? opts.zones : null;
  const zoneColorAt = (v: number): string | null => {
    if (!zones) return null;
    for (const z of zones) if (v >= z.from && v < z.to) return z.color;
    return zones[zones.length - 1].color;
  };

  // Single-metric charts get the grade gradient on the line; multi-series keep
  // distinct colors so the legend stays meaningful.
  const mainSeries = series.filter((s) => !s.dashed);
  const gradientSeries = zones && mainSeries.length === 1 ? mainSeries[0] : null;
  const dotColor = (s: AcSeries, v: number): string => {
    if (s.pointColorFn) return s.pointColorFn(v) || s.color;
    if (s.pointBands) {
      const c = catFromBands(v, s.pointBands);
      if (c && SCORE_COLORS[c]) return SCORE_COLORS[c];
    }
    if (s === gradientSeries) return zoneColorAt(v) || s.color;
    return s.color;
  };

  // y grid + labels.
  const gridVals = [min, (min + max) / 2, max];

  // x labels.
  const step = Math.max(1, Math.ceil(n / 6));

  // Optional zone-boundary + target dashed guide lines.
  const guides: { v: number; color: string }[] = [];
  if (zones) {
    for (let i = 0; i < zones.length - 1; i++) {
      const bv = zones[i].to;
      if (bv > min && bv < max) guides.push({ v: bv, color: zones[i].color });
    }
  }
  if (opts.target) {
    [opts.target.from, opts.target.to].forEach((bv) => {
      if (bv > min && bv < max) guides.push({ v: bv, color: opts.target!.color || '#3b82f6' });
    });
  }

  // Build per-series render data (path + points + optional gradient).
  type Stop = { offset: number; color: string };
  interface SeriesRender {
    key: number;
    pts: [number, number, number][];
    d: string | null;
    dashed: boolean;
    strokeUrl: string | null; // gradient id reference, else null -> use color
    color: string;
    gradId: string | null;
    gradStops: Stop[];
    dotR: number;
  }
  const rendered: SeriesRender[] = [];
  series.forEach((s, si) => {
    const pts: [number, number, number][] = [];
    s.values.forEach((v, i) => {
      if (v != null && !isNaN(v)) pts.push([xAt(i), yAt(v), v]);
    });
    if (!pts.length) return;

    let gradId: string | null = null;
    let gradStops: Stop[] = [];
    if (s === gradientSeries && zones) {
      gradId = 'acg' + (_gid += 1);
      const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / (max - min)));
      gradStops.push({ offset: 0, color: zoneColorAt(max - 1e-9)! });
      zones
        .map((z) => z.to)
        .filter((m) => m > min && m < max)
        .sort((a, b) => b - a)
        .forEach((bv) => {
          gradStops.push({ offset: offAt(bv), color: zoneColorAt(bv + 1e-9)! });
          gradStops.push({ offset: offAt(bv), color: zoneColorAt(bv - 1e-9)! });
        });
      gradStops.push({ offset: 1, color: zoneColorAt(min + 1e-9)! });
    }

    rendered.push({
      key: si,
      pts,
      d: pts.length >= 2 ? smoothPath(pts.map((p) => ({ x: p[0], y: p[1] }))) : null,
      dashed: !!s.dashed,
      strokeUrl: gradId ? `url(#${gradId})` : null,
      color: s.color,
      gradId,
      gradStops,
      dotR: pts.length > 20 ? 1.8 : 2.6,
    });
  });

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        {rendered
          .filter((r) => r.gradId)
          .map((r) => (
            <LinearGradient
              key={r.gradId!}
              id={r.gradId!}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={padT}
              x2={0}
              y2={H - padB}
            >
              {r.gradStops.map((st, k) => (
                <Stop key={k} offset={st.offset} stopColor={st.color} />
              ))}
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
            <SvgText
              x={padL - 4}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              fill={t.textDim}
            >
              {fmtNum(opts.integer ? Math.round(val) : val)}
            </SvgText>
          </G>
        );
      })}

      {/* x labels */}
      {buckets.map((b, i) => {
        if (i % step !== 0 && i !== n - 1) return null;
        return (
          <SvgText
            key={`x${i}`}
            x={xAt(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill={t.textDim}
          >
            {b.label}
          </SvgText>
        );
      })}

      {/* zone/target guide lines (legacy toggled via "Show zones"; shown by
          default here — TODO: wire a toggle once the scrub UI is ported) */}
      {guides.map((g, k) => (
        <Line
          key={`guide${k}`}
          x1={padL}
          x2={padL + innerW}
          y1={yAt(g.v)}
          y2={yAt(g.v)}
          stroke={g.color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          opacity={0.95}
        />
      ))}

      {/* series lines + points */}
      {rendered.map((r) => (
        <G key={`s${r.key}`}>
          {r.d ? (
            <Path
              d={r.d}
              fill="none"
              stroke={r.strokeUrl || r.color}
              strokeWidth={2.4}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={r.dashed ? '5 4' : undefined}
            />
          ) : null}
          {r.pts.map((p, k) => (
            <Circle key={k} cx={p[0]} cy={p[1]} r={r.dotR} fill={dotColor(series[r.key], p[2])} />
          ))}
        </G>
      ))}

      {/* TODO: interactive scrub (marker line + per-series hover dots + value
          readout) — legacy docs/index.html:4738-4776. */}
    </Svg>
  );
}
