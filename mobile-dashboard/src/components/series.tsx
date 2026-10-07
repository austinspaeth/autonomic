/* The multi-series chart forms App usage needs, react-native-svg only, in the
 * same grammar as charts.tsx: thin marks, rounded data-ends on the baseline, a
 * recessive axis, a legend under every chart with more than one series, and
 * a finger-drag scrub whose readout replaces the header instead of a tooltip.
 *
 *  - StackedBars: parts that SUM (a day's actives by store, by tier...).
 *    `percent` draws each bar as shares of its own total.
 *  - OverlayBars: a whole and a part of it (opened vs measured): the whole is
 *    a faint bar, the part a solid one inside it, so the gap IS the reading.
 *  - Lines: curves over an ordinal axis (retention by day N), with an
 *    optional guide rule (the trial boundary).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, num } from '../theme';

export type Key = { key: string; label: string; color: string; dashed?: boolean };

function useScrub(n: number) {
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const pick = (e: GestureResponderEvent) => {
    if (!width || !n) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.nativeEvent.locationX / width) * n)));
    setSel((cur) => {
      if (cur !== i) Haptics.selectionAsync();
      return i;
    });
  };
  const responders = {
    onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width),
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: pick,
    onResponderMove: pick,
    onResponderRelease: () => setSel(null),
    onResponderTerminate: () => setSel(null),
  };
  return { width, sel, responders };
}

function barTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/* The title on its own line and, under it, a full-width line for the summary
   or (while a finger is on the chart) the day being read. Two lines, so a
   long readout wraps instead of being cut off, and the line is always there
   so the chart never jumps when the finger lands. */
function Head({ title, readout }: { title: string; readout: ReactNode }) {
  return (
    <View style={st.head}>
      <Text style={st.title}>{title}</Text>
      <Text style={[st.readout, num]} numberOfLines={2}>
        {readout || ' '}
      </Text>
    </View>
  );
}

/**
 * The legend. With `onToggle`, each entry is a button: tapping one ISOLATES
 * that series in the chart, tapping it again (or the same one) shows them all.
 * The others dim rather than vanish, so it is always clear how to get back.
 */
export function Legend({
  keys,
  values,
  format,
  focus,
  onToggle,
}: {
  keys: Key[];
  values?: Record<string, number>;
  format?: (n: number) => string;
  focus?: string | null;
  onToggle?: (key: string) => void;
}) {
  return (
    <View style={[st.legend, onToggle ? { marginLeft: -8 } : { gap: 14 }]}>
      {keys.map((k) => {
        const dim = !!focus && focus !== k.key;
        const body = (
          <>
            <View style={[k.dashed ? st.dash : st.swatch, { backgroundColor: k.color }]} />
            <Text style={[st.legendText, focus === k.key && { color: C.text }]}>
              {k.label}
              {values && values[k.key] !== undefined ? <Text style={[st.legendNum, num]}> {(format || String)(values[k.key])}</Text> : null}
            </Text>
          </>
        );
        return onToggle ? (
          <Pressable
            key={k.key}
            hitSlop={6}
            onPress={() => {
              Haptics.selectionAsync();
              onToggle(k.key);
            }}
            style={[st.legendItem, st.legendBtn, focus === k.key && st.legendOn, dim && { opacity: 0.4 }]}
          >
            {body}
          </Pressable>
        ) : (
          <View key={k.key} style={st.legendItem}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** Which series is isolated (null = all), toggled by the legend. */
function useFocus() {
  const [focus, setFocus] = useState<string | null>(null);
  return { focus, toggle: (k: string) => setFocus((cur) => (cur === k ? null : k)) };
}

function Axis({ first, last }: { first: string; last: string }) {
  return (
    <View style={st.axis}>
      <Text style={st.axisText}>{first}</Text>
      <Text style={st.axisText}>{last}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ stacked */

export function StackedBars({
  title,
  keys,
  rows,
  xLabel = (x) => x,
  format = (n) => String(Math.round(n)),
  percent,
  height = 140,
  summary,
}: {
  title: string;
  keys: Key[];
  /** One per x; a null row is a gap (no data), not a zero. */
  rows: { x: string; values: Record<string, number> | null }[];
  xLabel?: (x: string) => string;
  format?: (n: number) => string;
  percent?: boolean;
  height?: number;
  summary?: string;
}) {
  const n = rows.length;
  const { width, sel, responders } = useScrub(n);
  const { focus, toggle } = useFocus();
  const shownKeys = focus ? keys.filter((k) => k.key === focus) : keys;
  const totals = rows.map((r) => (r.values ? shownKeys.reduce((t, k) => t + (r.values![k.key] || 0), 0) : 0));
  const max = percent ? 1 : Math.max(1, ...totals);
  const gap = n > 60 ? 1 : 2;
  const bw = n ? Math.max(1, (width - gap * (n - 1)) / n) : 0;
  const active = sel !== null ? rows[sel] : null;
  const pooled: Record<string, number> = {};
  rows.forEach((r) => keys.forEach((k) => (pooled[k.key] = (pooled[k.key] || 0) + (r.values?.[k.key] || 0))));

  return (
    <View>
      <Head
        title={title}
        readout={
          active ? (
            <>
              <Text style={st.when}>{xLabel(active.x)} </Text>
              {active.values
                ? shownKeys
                    .filter((k) => active.values![k.key])
                    .map((k) => {
                      const v = active.values![k.key];
                      const tot = totals[sel!];
                      return `${k.label} ${percent ? `${Math.round((v / (tot || 1)) * 100)}%` : format(v)}`;
                    })
                    .join(' · ') || 'none'
                : 'no data'}
            </>
          ) : (
            summary ?? ''
          )
        }
      />
      <View style={{ height }} {...responders}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {rows.map((r, i) => {
              if (!r.values || !totals[i]) return null;
              const x = i * (bw + gap);
              let y = height;
              const shown = shownKeys.filter((k) => (r.values![k.key] || 0) > 0);
              return shown.map((k, j) => {
                const v = r.values![k.key];
                const h = ((percent ? v / totals[i] : v) / max) * (height - 2);
                y -= h;
                const isTop = j === shown.length - 1;
                // A hairline surface gap between segments keeps the bands distinct.
                const seg = Math.max(0, h - (isTop ? 0 : 1));
                return (
                  <Path
                    key={`${r.x}${k.key}`}
                    d={isTop ? barTop(x, y, bw, seg, Math.min(3, bw / 2)) : `M${x},${y + 1}h${bw}v${seg}h${-bw}Z`}
                    fill={k.color}
                    opacity={sel !== null && sel !== i ? 0.3 : 1}
                  />
                );
              });
            })}
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={C.grid} strokeWidth={1} />
          </Svg>
        )}
      </View>
      {n ? <Axis first={xLabel(rows[0].x)} last={xLabel(rows[n - 1].x)} /> : null}
      <Legend keys={keys.filter((k) => pooled[k.key])} focus={focus} onToggle={keys.filter((k) => pooled[k.key]).length > 1 ? toggle : undefined} />
    </View>
  );
}

/* ------------------------------------------------------------ overlay */

export function OverlayBars({
  title,
  back,
  front,
  rows,
  xLabel = (x) => x,
  format = (n) => String(Math.round(n)),
  height = 140,
  summary,
}: {
  title: string;
  back: Key;
  front: Key;
  rows: { x: string; back: number | null; front: number | null }[];
  xLabel?: (x: string) => string;
  format?: (n: number) => string;
  height?: number;
  summary?: string;
}) {
  const n = rows.length;
  const { width, sel, responders } = useScrub(n);
  const { focus, toggle } = useFocus();
  const showBack = focus !== front.key;
  const showFront = focus !== back.key;
  const max = Math.max(1, ...rows.map((r) => Math.max(showBack ? r.back ?? 0 : 0, showFront ? r.front ?? 0 : 0)));
  const gap = n > 60 ? 1 : 2;
  const bw = n ? Math.max(1, (width - gap * (n - 1)) / n) : 0;
  const active = sel !== null ? rows[sel] : null;
  const share = (r: { back: number | null; front: number | null }) =>
    r.back && r.front !== null ? ` (${Math.round((r.front / r.back) * 100)}%)` : '';

  return (
    <View>
      <Head
        title={title}
        readout={
          active ? (
            <>
              <Text style={st.when}>{xLabel(active.x)} </Text>
              {`${back.label} ${active.back === null ? '–' : format(active.back)} · ${front.label} ${active.front === null ? '–' : format(active.front)}${share(active)}`}
            </>
          ) : (
            summary ?? ''
          )
        }
      />
      <View style={{ height }} {...responders}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {rows.map((r, i) => {
              const x = i * (bw + gap);
              const dim = sel !== null && sel !== i ? 0.3 : 1;
              const hb = showBack && r.back ? (r.back / max) * (height - 2) : 0;
              const hf = showFront && r.front ? (r.front / max) * (height - 2) : 0;
              return (
                <G key={r.x}>
                  {hb > 0 ? <Path d={barTop(x, height - hb, bw, hb, Math.min(3, bw / 2))} fill={back.color} opacity={(focus === back.key ? 1 : 0.32) * dim} /> : null}
                  {hf > 0 ? <Path d={barTop(x, height - hf, bw, hf, Math.min(3, bw / 2))} fill={front.color} opacity={dim} /> : null}
                </G>
              );
            })}
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={C.grid} strokeWidth={1} />
          </Svg>
        )}
      </View>
      {n ? <Axis first={xLabel(rows[0].x)} last={xLabel(rows[n - 1].x)} /> : null}
      <Legend keys={[back, front]} focus={focus} onToggle={toggle} />
    </View>
  );
}

/* --------------------------------------------------------------- lines */

export function Lines({
  title,
  xs,
  series,
  format = (n) => `${n.toFixed(0)}%`,
  yMax,
  guide,
  height = 150,
  summary,
}: {
  title: string;
  /** Labels for the ordinal x positions. */
  xs: string[];
  series: (Key & { values: (number | null)[] })[];
  format?: (n: number) => string;
  /** Fix the top of the axis (100 for a percentage), else the data max. */
  yMax?: number;
  /** A vertical rule at an x index, labelled. */
  guide?: { index: number; label: string };
  height?: number;
  summary?: string;
}) {
  const n = xs.length;
  const { width, sel, responders } = useScrub(n);
  const { focus, toggle } = useFocus();
  const shownSeries = focus ? series.filter((x) => x.key === focus) : series;
  const max = yMax ?? Math.max(1, ...shownSeries.flatMap((x) => x.values.map((v) => v ?? 0)));
  const top = 8;
  const step = n > 1 ? width / (n - 1) : 0;
  const px = (i: number) => (n > 1 ? i * step : width / 2);
  const py = (v: number) => height - (v / max) * (height - top);

  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <View>
      <Head
        title={title}
        readout={
          sel !== null ? (
            <>
              <Text style={st.when}>{xs[sel]} </Text>
              {shownSeries
                .map((s) => `${s.label} ${s.values[sel] === null || s.values[sel] === undefined ? '–' : format(s.values[sel] as number)}`)
                .join(' · ')}
            </>
          ) : (
            summary ?? ''
          )
        }
      />
      <View style={{ height }} {...responders}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={top} y2={top} stroke={C.grid} strokeDasharray="2,4" strokeWidth={1} />
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={C.grid} strokeWidth={1} />
            {guide && guide.index < n ? (
              <>
                <Line x1={px(guide.index)} x2={px(guide.index)} y1={top} y2={height} stroke={C.muted} strokeDasharray="3,3" strokeWidth={1} />
                <SvgText x={px(guide.index) + 4} y={top + 11} fill={C.muted} fontSize={10}>
                  {guide.label}
                </SvgText>
              </>
            ) : null}
            {shownSeries.map((s) => (
              <Path
                key={s.key}
                d={path(s.values)}
                stroke={s.color}
                strokeWidth={2}
                fill="none"
                strokeDasharray={s.dashed ? '5,4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {sel !== null ? (
              <>
                <Line x1={px(sel)} x2={px(sel)} y1={top} y2={height} stroke={C.dim} strokeWidth={1} />
                {shownSeries.map((s) =>
                  s.values[sel] === null || s.values[sel] === undefined ? null : (
                    <Rect
                      key={s.key}
                      x={px(sel) - 4}
                      y={py(s.values[sel] as number) - 4}
                      width={8}
                      height={8}
                      rx={4}
                      fill={s.color}
                      stroke={C.surface}
                      strokeWidth={2}
                    />
                  ),
                )}
              </>
            ) : null}
          </Svg>
        )}
      </View>
      {n ? <Axis first={xs[0]} last={xs[n - 1]} /> : null}
      {series.length > 1 ? <Legend keys={series} focus={focus} onToggle={toggle} /> : null}
    </View>
  );
}

const st = StyleSheet.create({
  head: { marginBottom: 10, gap: 3 },
  title: { color: C.text, fontSize: 16, fontWeight: '600' },
  readout: { color: C.dim, fontSize: 13, fontWeight: '600', minHeight: 18, lineHeight: 18 },
  when: { color: C.muted, fontWeight: '500' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { color: C.muted, fontSize: 11 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 4, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /* Every button carries the same padding whether or not it is chosen, so
     choosing one only adds a tint and nothing in the row moves. */
  legendBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  legendOn: { backgroundColor: 'rgba(255,255,255,0.10)' },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  dash: { width: 14, height: 2.5, borderRadius: 2 },
  legendText: { color: C.dim, fontSize: 13 },
  legendNum: { color: C.text, fontWeight: '600' },
});
