// acHelpers — shared analysis UI widgets + value helpers.
// Ported from legacy docs/index.html: acCard (4892), acBlock (4886),
// acStats (4897), acInsight (4904), acBars (4905), acStackBars (5524),
// acScatter (5536), acBandZones (4651), acScoreZones (4657), acDelta (4922),
// avgRound (5522), acPearson (5512), acDailyMetrics (5487), plus the inline
// time/period filters (isMorning/isEvening, acMinOf/acToDec, ~4612-4615).
//
// DOM/innerHTML construction is replaced with JSX; legacy var(--x) -> t.* tokens.
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';
import { Box, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { BANDS } from '@core/scoring/bands';
import { SCORE_COLORS, SCORE_CATS } from '@core/scoring/colors';
import type { AcZone } from '@ui/charts/AnalysisChart';
import { acDayScore, acReadVals } from '@core/analytics/aggregate';
import { sleepHours } from '@core/scoring/scoreSet';
import { scoreCat } from '@core/scoring/colors';
import { keyOf, dateFromKey } from '@core/date/dateUtils';
import { dayCleanliness } from '@core/analytics/cleanliness';
import type { Day, Profile, Reading } from '@core/types';
import { TrendChip } from '@ui/charts/TrendChip';

// ----- number formatting (legacy fmtNum, docs/index.html:3280) -----
export const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

// ----- time/period filters (legacy ~4612-4615) -----
export const acMinOf = (t: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
export const acToDec = (t: string | undefined): number | null => {
  const mo = acMinOf(t);
  return mo == null ? null : mo / 60;
};
export const isMorning = (r: Reading): boolean => {
  const mo = acMinOf(r.time);
  if (mo != null) return mo < 720;
  return ((r as any).period || '') === 'Morning';
};
export const isEvening = (r: Reading): boolean => {
  const mo = acMinOf(r.time);
  if (mo != null) return mo >= 1080;
  return ((r as any).period || '') === 'Evening';
};

// ----- present / mean / delta / avgRound -----
export const acPresent = (vals: (number | null)[]): number[] =>
  vals.filter((v): v is number => v != null && !isNaN(v));
export const acMean = (vals: (number | null)[]): number | null => {
  const p = acPresent(vals);
  return p.length ? p.reduce((s, x) => s + x, 0) / p.length : null;
};
// first vs last present bucket value (legacy acDelta 4922).
export const acDelta = (vals: (number | null)[]): number | null => {
  const idx = vals.map((v, i) => (v != null && !isNaN(v) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return null;
  return (vals[idx[idx.length - 1]] as number) - (vals[idx[0]] as number);
};
export const avgRound = (vals: (number | null)[], dp?: number): number | null => {
  const m = acMean(vals);
  if (m == null) return null;
  const f = Math.pow(10, dp || 0);
  return Math.round(m * f) / f;
};
// legacy roundTo (docs/index.html:5559).
export const roundTo = (v: number | null, dp?: number): number | null => {
  if (v == null) return null;
  const f = Math.pow(10, dp || 0);
  return Math.round(v * f) / f;
};

// ----- grade zones (legacy acBandZones 4651 / acScoreZones 4657) -----
export function acBandZones(bandName: string): AcZone[] | null {
  const b = BANDS[bandName];
  if (!b) return null;
  const out: AcZone[] = [];
  let prev = -1e9;
  b.forEach((seg) => {
    const to = seg.max === Infinity ? 1e9 : seg.max;
    out.push({ from: prev, to, color: SCORE_COLORS[seg.cat] || '#888' });
    prev = seg.max;
  });
  return out;
}
export function acScoreZones(): AcZone[] {
  const cats = [...SCORE_CATS].sort((a, b) => a.min - b.min);
  return cats.map((c, i) => ({ from: c.min, to: i < cats.length - 1 ? cats[i + 1].min : 100, color: c.color }));
}

// ----- Pearson + per-day metric table (legacy 5512 / 5487) -----
export function acPearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  pairs.forEach(([x, y]) => { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; });
  const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

export interface DailyMetricRow {
  score: number | null;
  structRmssd: number | null;
  mornRmssd: number | null;
  coherence: number | null;
  lfPeak: number | null;
  readiness: number | null;
  restHr: number | null;
  sys: number | null;
  sleepH: number | null;
  water: number | null;
  calories: number | null;
  triggers: number;
  bm: number;
  actMin: number | null;
  lastMealMin: number | null;
}
export function acDailyMetrics(days: Record<string, Day>, profile: Profile): DailyMetricRow[] {
  return Object.keys(days).sort().map((dk) => {
    const d = days[dk];
    const avg = (type: string, key: string, filt?: (r: Reading) => boolean): number | null => {
      const v = acReadVals(d, type, key, filt);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    };
    const meals = (d.food && d.food.meals) || [];
    const mealTimes = meals.map((m) => acMinOf(m.time)).filter((v): v is number => v != null);
    return {
      score: acDayScore(d, dk, profile),
      structRmssd: avg('breathHrv', 'rmssd'),
      mornRmssd: avg('breathHrv', 'rmssd', isMorning),
      coherence: avg('breathHrv', 'coherence'),
      lfPeak: avg('breathHrv', 'lfPeak'),
      readiness: avg('hrv', 'readiness'),
      restHr: avg('restingHr', 'hr', (r) => ((r as any).position || '') === 'Laying'),
      sys: avg('bp', 'sys'),
      sleepH: sleepHours(d),
      water: d.food && +d.food.water > 0 ? +d.food.water : null,
      calories: meals.reduce((s, m) => s + (parseInt((m as any).calories, 10) || 0), 0) || null,
      triggers: d.food && d.food.triggers ? Object.values(d.food.triggers).reduce((s: number, c) => s + ((c as number) > 0 ? (c as number) : 0), 0) : 0,
      bm: d.digestion && d.digestion.movements ? d.digestion.movements.length : 0,
      actMin: (d.activities || []).reduce((s, a) => s + (parseFloat((a as any).duration) || 0), 0) || null,
      lastMealMin: mealTimes.length ? Math.max(...mealTimes) : null,
    };
  });
}

// =================== UI widgets ===================

// acBlock — a labeled chart block. The chart itself is passed in as `children`
// (the card builders create the <AnalysisChart>/<BpBars> and any legend).
export function AcBlock({ label, children }: { label?: string | null; children: React.ReactNode }) {
  const t = useTheme();
  // legacy .ac-block { margin-bottom: 16px } + .ac-block-label { font-size:12;
  // font-weight:600; color: var(--text); margin-bottom:6px }.
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? (
        <Text style={{ fontSize: 12, fontWeight: '600', color: t.text, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

// acCard — titled chart card (legacy .chart-card.ac-card). Returns null when no
// children render (matches legacy which dropped empty cards).
export function AcCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string | null;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const kids = React.Children.toArray(children).filter(Boolean);
  if (!kids.length) return null;
  return (
    <Box
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius,
        marginBottom: t.gap,
        padding: 14,
        overflow: 'hidden',
        ...t.shadow,
      }}
    >
      {/* legacy .chart-card h3 */}
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.05 * 13,
          color: t.textDim,
          marginBottom: sub ? 0 : 10,
        }}
      >
        {title}
      </Text>
      {/* legacy .ac-sub { margin: -4px 0 12px } */}
      {sub ? (
        <Text
          style={{
            fontSize: 11,
            color: t.textDim,
            fontWeight: '600',
            letterSpacing: 0.02 * 11,
            marginTop: -4,
            marginBottom: 12,
          }}
        >
          {sub}
        </Text>
      ) : null}
      {kids}
    </Box>
  );
}

export interface StatItem {
  label: string;
  value: number | string | null;
  sub?: string | null;
  color?: string | null;
}
export function AcStats({ items }: { items: (StatItem | null | undefined | false)[] }) {
  const t = useTheme();
  const f = items.filter(Boolean) as StatItem[];
  if (!f.length) return null;
  // legacy .stat-grid { grid-template-columns: repeat(2,1fr); gap: var(--gap) }
  // inside .ac-card -> { margin-top: 4px; margin-bottom: 0 }.
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.gap, marginTop: 4 }}>
      {f.map((it, i) => (
        <View
          key={i}
          style={{
            // 2-col grid: two cells per row with a t.gap (14) gutter.
            flexGrow: 1,
            flexBasis: '47%',
            backgroundColor: t.surface, // legacy .stat { background: var(--surface) }
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: t.radius,
            padding: 14,
            ...t.shadow,
          }}
        >
          {/* .stat-label { font-size:12; color: var(--text-dim); font-weight:600 } */}
          <Text style={{ fontSize: 12, color: t.textDim, fontWeight: '600' }}>{it.label}</Text>
          {/* .stat-value { font-size:26; font-weight:700; margin-top:4 } */}
          <Text style={{ fontSize: 26, fontWeight: '700', marginTop: 4, color: it.color || t.text }}>
            {it.value == null ? '-' : String(it.value)}
            {/* .stat-value small { font-size:13; color: var(--text-dim); font-weight:600 } */}
            {it.sub ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.textDim }}>{' ' + it.sub}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AcInsight({ text, strength }: { text: string; strength?: string | null }) {
  const t = useTheme();
  // legacy: .ac-insight-bar default var(--accent); .s-strong -> #16a34a; .s-mod -> #eab308.
  const barColor = strength === 'strong' ? '#16a34a' : strength === 'mod' ? '#eab308' : t.accent;
  // legacy .ac-insight { display:flex; gap:10px; align-items:stretch;
  // background:var(--surface-2); border-radius:var(--radius-sm);
  // padding:10px 12px; margin-top:10px; font-size:13; line-height:1.4 }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 10,
        marginTop: 10,
        backgroundColor: t.surface2,
        borderRadius: t.radiusSm,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      {/* .ac-insight-bar { width:3px; border-radius:2px } */}
      <View style={{ width: 3, borderRadius: 2, backgroundColor: barColor }} />
      <Text style={{ flex: 1, fontSize: 13, color: t.text, lineHeight: 13 * 1.4 }}>{text}</Text>
    </View>
  );
}

export interface BarRow {
  name: string;
  count: number;
  color?: string;
}
export function AcBars({ rows, fmt }: { rows: BarRow[]; fmt?: (c: number) => string }) {
  const t = useTheme();
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.count)) || 1;
  // legacy .ac-bars { margin-top:4px } wrapping .freq-row items.
  return (
    <View style={{ marginTop: 4 }}>
      {rows.map((r, i) => (
        // .freq-row { display:flex; align-items:center; gap:10px; padding:8px 0;
        //   border-top:1px solid var(--border) }  (first-child: no border-top)
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 8,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: t.border,
          }}
        >
          {/* .freq-name { width:38%; font-size:14 } */}
          <Text style={{ width: '38%', fontSize: 14, color: t.text }} numberOfLines={1}>
            {r.name}
          </Text>
          {/* .freq-bar-wrap { flex:1; height:8px; background:surface-2; border-radius:999px } */}
          <View style={{ flex: 1, height: 8, backgroundColor: t.surface2, borderRadius: 999, overflow: 'hidden' }}>
            {/* .freq-bar { height:100%; background:accent; border-radius:999px } */}
            <View
              style={{
                width: `${(r.count / max) * 100}%`,
                height: '100%',
                backgroundColor: r.color || t.accent,
                borderRadius: 999,
              }}
            />
          </View>
          {/* .freq-count { width:28px; text-align:right; font-weight:600; font-size:14 } */}
          <Text style={{ width: 28, textAlign: 'right', fontSize: 14, fontWeight: '600', color: t.text }}>
            {fmt ? fmt(r.count) : String(r.count)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// acStackBars — stacked VLF/LF/HF power-distribution columns (legacy 5524).
export function AcStackBars({
  cols,
  colors,
  height = 110,
}: {
  cols: ({ vlf: number; lf: number; hf: number } | null)[];
  colors: { vlf: string; lf: string; hf: string };
  height?: number;
}) {
  const t = useTheme();
  if (!cols.some(Boolean)) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
        height,
        backgroundColor: t.surface2,
        borderRadius: t.radiusSm,
        padding: 4,
      }}
    >
      {cols.map((c, i) => (
        <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', borderRadius: 2, overflow: 'hidden' }}>
          {c
            ? (() => {
                const tot = c.vlf + c.lf + c.hf || 1;
                return (['vlf', 'lf', 'hf'] as const).map((k) => (
                  <View key={k} style={{ height: `${(c[k] / tot) * 100}%`, backgroundColor: colors[k] }} />
                ));
              })()
            : null}
        </View>
      ))}
    </View>
  );
}

// acScatter — scatter + simple regression line (legacy 5536).
export interface ScatterPoint {
  x: number;
  y: number;
}
export function AcScatter({ points, xlabel, ylabel }: { points: ScatterPoint[]; xlabel?: string; ylabel?: string }) {
  const t = useTheme();
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (xmin === xmax) { xmin -= 1; xmax += 1; }
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const W = 320, H = 150, padL = 34, padR = 10, padT = 10, padB = 24;
  const xAt = (v: number) => padL + ((v - xmin) / (xmax - xmin)) * (W - padL - padR);
  const yAt = (v: number) => padT + (1 - (v - ymin) / (ymax - ymin)) * (H - padT - padB);
  const gridVals = [ymin, (ymin + ymax) / 2, ymax];
  const r = acPearson(points.map((p) => [p.x, p.y] as [number, number]));
  let regLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (r != null) {
    const n = points.length;
    const sx = xs.reduce((s, x) => s + x, 0), sy = ys.reduce((s, x) => s + x, 0);
    const sxx = xs.reduce((s, x) => s + x * x, 0);
    const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    regLine = { x1: xAt(xmin), y1: yAt(a + b * xmin), x2: xAt(xmax), y2: yAt(a + b * xmax) };
  }
  const legend = [xlabel ? `x: ${xlabel}` : '', ylabel ? `y: ${ylabel}` : '', r != null ? `r = ${r.toFixed(2)}` : '']
    .filter(Boolean);
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {gridVals.map((v, k) => {
          const y = yAt(v);
          return (
            <React.Fragment key={k}>
              <Line x1={padL} x2={W - padR} y1={y} y2={y} stroke={t.border} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />
              <SvgText x={padL - 4} y={y + 3} textAnchor="end" fontSize={9} fill={t.textDim}>
                {fmtNum(Math.round(v))}
              </SvgText>
            </React.Fragment>
          );
        })}
        {points.map((p, k) => (
          <Circle key={k} cx={xAt(p.x)} cy={yAt(p.y)} r={3} fill={t.accent} opacity={0.7} />
        ))}
        {regLine ? (
          <Line {...regLine} stroke={t.textDim} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        ) : null}
      </Svg>
      {legend.length ? (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
          {legend.map((l, i) => (
            <Text key={i} style={{ fontSize: 11, color: t.textDim }}>{l}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// acStackBars legend (legacy .ac-legend/.ac-leg/.ac-dot, CSS 1065-1067).
export function AcStackLegend({ items }: { items: { label: string; color: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: it.color }} />
          <Text style={{ fontSize: 11, color: t.textDim }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

// =================== Comparison rows (legacy .ac-cmp/.ac-cmp-row, CSS 1130-1135) ===================
export interface CmpRow {
  name: string;
  prevText: string; // e.g. "12.3 → "
  curText: string; // e.g. "14.5 (best 18.2)"
  delta: number | null;
  goodUp?: boolean;
  eps?: number;
}
export function AcCmp({ rows }: { rows: CmpRow[] }) {
  const t = useTheme();
  return (
    <View>
      {rows.map((r, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: t.border,
          }}
        >
          {/* .ac-cmp-name { font-size:13 } — 1fr */}
          <Text style={{ flex: 1, fontSize: 13, color: t.text }}>{r.name}</Text>
          {/* .ac-cmp-vals { font-weight:600; font-size:13; text-align:right } — auto */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.text, textAlign: 'right' }}>
            <Text style={{ color: t.textDim, fontWeight: '500' }}>{r.prevText}</Text>
            {r.curText}
          </Text>
          {/* .ac-trend — auto */}
          {r.delta != null ? (
            <TrendChip delta={r.delta} opts={{ goodUp: r.goodUp !== false, eps: r.eps }} />
          ) : (
            <View />
          )}
        </View>
      ))}
    </View>
  );
}

// =================== Calendar heat map (legacy acHeatMapCard, .ac-heat*, CSS 1139-1145) ===================
export interface HeatDay {
  dk: string;
  score: number | null;
  color: string | null;
  short: string | null;
  clean: boolean;
}
export function AcHeatMap({
  days,
  profile,
  nDays,
  fmtShort,
}: {
  days: Record<string, Day>;
  profile: Profile;
  nDays: number;
  fmtShort: (dk: string) => string;
}) {
  const t = useTheme();
  const [sel, setSel] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (nDays - 1));
  start.setDate(start.getDate() - start.getDay());

  const cells: HeatDay[] = [];
  let any = false;
  for (let dt = new Date(start); dt <= today; dt.setDate(dt.getDate() + 1)) {
    const dk = keyOf(dt);
    const d = days[dk];
    let sc: number | null = null;
    let color: string | null = null;
    let short: string | null = null;
    let clean = false;
    if (d) {
      sc = acDayScore(d, dk, profile);
      if (sc != null) { const cat = scoreCat(sc); color = cat.color; short = cat.short; any = true; }
      const cl = dayCleanliness(days, dk);
      if (cl && cl.clean) clean = true;
    }
    cells.push({ dk, score: sc, color, short, clean });
  }
  if (!any) return null;

  const swatches = [...SCORE_CATS].sort((a, b) => a.min - b.min);
  const selCell = sel ? cells.find((c) => c.dk === sel) : null;

  return (
    <View>
      {/* .ac-heat { grid 7 cols, gap 4 } */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {cells.map((c) => {
          const isSel = c.dk === sel;
          return (
            <View key={c.dk} style={{ width: `${100 / 7}%`, padding: 2 }}>
              <Pressable
                onPress={() => setSel(c.dk)}
                accessibilityRole="button"
                accessibilityLabel={c.short ? `${c.dk}: ${c.score} ${c.short}` : c.dk}
                style={{
                  aspectRatio: 1,
                  borderRadius: 4,
                  backgroundColor: c.color || t.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: isSel ? 2 : 0,
                  borderColor: t.text,
                }}
              >
                {/* .ac-heat-cell.clean::after — centered ring */}
                {c.clean ? (
                  <View
                    style={{
                      width: '40%',
                      height: '40%',
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: 'rgba(255,255,255,0.85)',
                    }}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      {/* .ac-heat-readout */}
      <Text style={{ marginTop: 9, textAlign: 'right', fontSize: 13, fontWeight: '700', minHeight: 18 }}>
        {selCell == null ? (
          <Text style={{ color: t.textDim, fontWeight: '600' }}>Tap a day for its score</Text>
        ) : selCell.score == null ? (
          <Text style={{ color: t.text }}>
            {fmtShort(selCell.dk)} · <Text style={{ color: t.textDim, fontWeight: '600' }}>no score</Text>
          </Text>
        ) : (
          <Text style={{ color: t.text }}>
            {fmtShort(selCell.dk)} · <Text style={{ color: selCell.color || t.text }}>{`${selCell.score} ${selCell.short}`}</Text>
          </Text>
        )}
      </Text>
      {/* .ac-heat-legend: Crash [swatches] Excellent */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
        <Text style={{ fontSize: 11, color: t.textDim }}>Crash</Text>
        {swatches.map((c) => (
          <View key={c.short} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: c.color }} />
        ))}
        <Text style={{ fontSize: 11, color: t.textDim }}>Excellent</Text>
      </View>
      {/* ring legend */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
        <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '40%', height: '40%', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }} />
        </View>
        <Text style={{ fontSize: 11, color: t.textDim }}>ring = clean day</Text>
      </View>
    </View>
  );
}

// =================== Extreme event log (legacy .ac-events/.ac-event*, CSS 1164-1169) ===================
export interface EventRow {
  dk: string;
  tag: string;
  color: string;
  body: string;
}
export function AcEvents({ events, fmtShort }: { events: EventRow[]; fmtShort: (dk: string) => string }) {
  const t = useTheme();
  return (
    <View>
      {events.map((e, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: t.border,
            alignItems: 'baseline',
          }}
        >
          {/* .ac-event-date */}
          <Text style={{ fontSize: 12, color: t.textDim }}>{fmtShort(e.dk)}</Text>
          {/* .ac-event-body */}
          <Text style={{ flex: 1, fontSize: 13, color: t.text }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: '#fff',
                backgroundColor: e.color,
                borderRadius: 999,
                overflow: 'hidden',
                paddingHorizontal: 7,
                paddingVertical: 1,
              }}
            >
              {e.tag}
            </Text>
            {'  ' + e.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

// =================== Streak hero + grade chips (legacy .ac-streak-big / .ac-grades) ===================
export function AcStreakBig({ num, cap, tier }: { num: number; cap: string; tier: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 6 }}>
      <Text style={{ fontSize: 56, fontWeight: '800', lineHeight: 56, color: t.accent }}>{String(num)}</Text>
      <Text style={{ fontSize: 13, color: t.textDim, marginTop: 4, fontWeight: '600' }}>{cap}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', marginTop: 8, color: t.text }}>{tier}</Text>
    </View>
  );
}

// .ac-grades row of inset-bordered chips (used by Recovery Phase post-illness markers).
export function AcGradeChips({ chips }: { chips: { text: string; active: boolean }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {chips.map((c, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 3,
            paddingRight: 9,
            paddingLeft: 7,
            borderRadius: 7,
            backgroundColor: t.surface2,
            borderLeftWidth: 3,
            borderLeftColor: c.active ? '#16a34a' : t.border,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.text }}>{(c.active ? '✓ ' : '') + c.text}</Text>
        </View>
      ))}
    </View>
  );
}
