/* Two hand-rolled chart forms, react-native-svg only.
 *
 * BarChart: one series of daily values. Rounded data-ends anchored to the
 * baseline, a 2px gap between bars, a recessive baseline and one max gridline.
 * Drag across it to scrub: the card header shows the touched day, and every
 * other bar dims so the selection reads without a tooltip box.
 *
 * SplitBar: a proportion strip with a legend underneath, so identity is never
 * colour alone. */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, num } from '../theme';
import { shortDate } from '../lib/dates';
import type { Series } from '../lib/metrics';

function barPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function BarChart({
  series,
  color = C.series,
  height = 140,
  format = (n: number) => String(Math.round(n)),
  title,
  summary,
  unknownBefore,
  unknownAfter,
  compact,
  xLabel = shortDate,
}: {
  series: Series;
  color?: string;
  height?: number;
  format?: (n: number) => string;
  title: string;
  /** What the header shows when nothing is touched (e.g. a total). */
  summary: string;
  /** Days before this have no data at all; drawn as nothing rather than zero. */
  unknownBefore?: string | null;
  /** Days after this have not been reported yet; drawn as nothing rather than zero. */
  unknownAfter?: string | null;
  /** A small caption header and no max label, for charts inside a card's detail. */
  compact?: boolean;
  /** How an x key reads (defaults to a short date). */
  xLabel?: (key: string) => string;
}) {
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  const max = useMemo(() => Math.max(1, ...series.map((p) => p.value)), [series]);
  const n = series.length;
  const gap = n > 60 ? 1 : 2;
  const bw = n ? Math.max(1, (width - gap * (n - 1)) / n) : 0;
  const plotH = height - 4;

  const pick = (e: GestureResponderEvent) => {
    if (!width || !n) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.nativeEvent.locationX / width) * n)));
    if (i !== sel) {
      Haptics.selectionAsync();
      setSel(i);
    }
  };

  const active = sel !== null ? series[sel] : null;

  return (
    <View>
      <View style={[st.head, compact && st.headCompact]}>
        <Text style={compact ? st.titleCompact : st.title}>{title}</Text>
        <Text style={[compact ? st.valueCompact : st.value, num]}>
          {active ? format(active.value) : summary}
          <Text style={st.when}>{active ? `  ${xLabel(active.day)}` : ''}</Text>
        </Text>
      </View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setSel(null)}
        onResponderTerminate={() => setSel(null)}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={0.5} y2={0.5} stroke={C.grid} strokeDasharray="2,4" strokeWidth={1} />
            {series.map((p, i) => {
              if (unknownBefore && p.day < unknownBefore) return null;
              if (unknownAfter && p.day > unknownAfter) return null;
              const h = p.value > 0 ? Math.max(2, (p.value / max) * plotH) : 0;
              const x = i * (bw + gap);
              const dim = sel !== null && sel !== i;
              return (
                <Path
                  key={p.day}
                  d={barPath(x, height - h, bw, h, Math.min(4, bw / 2))}
                  fill={color}
                  opacity={dim ? 0.3 : 1}
                />
              );
            })}
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={C.grid} strokeWidth={1} />
          </Svg>
        )}
      </View>
      <View style={st.axis}>
        <Text style={st.axisText}>{series[0] ? xLabel(series[0].day) : ''}</Text>
        {compact ? null : <Text style={st.axisText}>max {format(max)}</Text>}
        <Text style={st.axisText}>{series[n - 1] ? xLabel(series[n - 1].day) : ''}</Text>
      </View>
    </View>
  );
}

export type Part = { key: string; label: string; value: number; color: string };

export function SplitBar({ parts, format = (n: number) => String(n) }: { parts: Part[]; format?: (n: number) => string }) {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((t, p) => t + p.value, 0);
  if (!total) return <Text style={st.axisText}>Nothing yet</Text>;
  return (
    <View style={{ gap: 10 }}>
      <View style={st.strip}>
        {shown.map((p, i) => {
          /* Read into a local first: Reanimated's Babel plugin warns on any
             inline style that reads a `.value` property, even a plain number. */
          const grow = p.value;
          return (
          <View
            key={p.key}
            style={{
              flex: grow,
              backgroundColor: p.color,
              marginLeft: i ? 2 : 0,
              borderTopLeftRadius: i === 0 ? 5 : 0,
              borderBottomLeftRadius: i === 0 ? 5 : 0,
              borderTopRightRadius: i === shown.length - 1 ? 5 : 0,
              borderBottomRightRadius: i === shown.length - 1 ? 5 : 0,
            }}
          />
          );
        })}
      </View>
      <View style={st.legend}>
        {shown.map((p) => (
          <View key={p.key} style={st.legendItem}>
            <View style={[st.swatch, { backgroundColor: p.color }]} />
            <Text style={st.legendText}>
              {p.label} <Text style={[st.legendNum, num]}>{format(p.value)}</Text>
              <Text style={st.legendPct}> · {Math.round((p.value / total) * 100)}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  title: { color: C.text, fontSize: 16, fontWeight: '600' },
  value: { color: C.text, fontSize: 16, fontWeight: '700' },
  when: { color: C.muted, fontSize: 13, fontWeight: '500' },
  headCompact: { marginBottom: 8, minHeight: 18 },
  titleCompact: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  valueCompact: { color: C.text, fontSize: 13, fontWeight: '700' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisText: { color: C.muted, fontSize: 11 },
  strip: { flexDirection: 'row', height: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: C.dim, fontSize: 13 },
  legendNum: { color: C.text, fontWeight: '600' },
  legendPct: { color: C.muted },
  tickSwatch: { width: 14, height: 2.5, borderRadius: 2, backgroundColor: C.text },
  wdHead: { minHeight: 22, justifyContent: 'center', marginBottom: 10 },
  wdHeadText: { color: C.dim, fontSize: 13 },
  wdHeadDay: { color: C.text, fontWeight: '700' },
  wdRow: { flexDirection: 'row', marginTop: 8 },
  wdCol: { flex: 1, alignItems: 'center', gap: 2 },
  wdLabel: { color: C.dim, fontSize: 12, fontWeight: '600' },
  wdDelta: { fontSize: 11, fontWeight: '600' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.14)' },
  chipText: { color: C.dim, fontSize: 13, fontWeight: '600' },
});

/* ------------------------------------------------------------ weekday */

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export type WeekdayPoint = { avg: number | null; count: number; last: number | null; lastDate: string | null };

/**
 * The web Overview's "By day of week": a bar per weekday for its AVERAGE over
 * the range, and a white tick across it at that weekday's MOST RECENT value,
 * so last Monday reads against a normal Monday at a glance. Under each bar,
 * the most recent value's change against the average. Drag to read a day.
 */
export function WeekdayChart({
  stats,
  color = C.series,
  height = 150,
  format = (n: number) => String(Math.round(n)),
}: {
  stats: WeekdayPoint[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...stats.flatMap((w) => [w.avg ?? 0, w.last ?? 0]));
  const slot = width / 7;
  const bw = Math.min(30, slot * 0.56);
  const top = 6; // room for a tick above the tallest bar
  const plotH = height - top;
  const y = (v: number) => height - (v / max) * plotH;

  const pick = (e: GestureResponderEvent) => {
    if (!width) return;
    const i = Math.max(0, Math.min(6, Math.floor(e.nativeEvent.locationX / slot)));
    if (i !== sel) {
      Haptics.selectionAsync();
      setSel(i);
    }
  };

  const change = (w: WeekdayPoint) => (w.avg && w.last !== null ? ((w.last - w.avg) / w.avg) * 100 : null);
  const active = sel !== null ? stats[sel] : null;
  const activeChange = active ? change(active) : null;

  return (
    <View>
      <View style={st.wdHead}>
        {active ? (
          <Text style={st.wdHeadText}>
            <Text style={st.wdHeadDay}>{WD_LONG[sel!]}</Text>
            {'  '}avg <Text style={[st.legendNum, num]}>{active.avg === null ? '–' : format(active.avg)}</Text>
            {active.lastDate ? (
              <>
                {' · '}
                {shortDate(active.lastDate)} <Text style={[st.legendNum, num]}>{format(active.last ?? 0)}</Text>
                {activeChange !== null ? (
                  <Text style={{ color: activeChange >= 0 ? C.up : C.down }}>
                    {' '}
                    {activeChange >= 0 ? '+' : ''}
                    {activeChange.toFixed(0)}%
                  </Text>
                ) : null}
              </>
            ) : null}
          </Text>
        ) : (
          <View style={st.legend}>
            <View style={st.legendItem}>
              <View style={[st.swatch, { backgroundColor: color }]} />
              <Text style={st.legendText}>Average</Text>
            </View>
            <View style={st.legendItem}>
              <View style={st.tickSwatch} />
              <Text style={st.legendText}>Most recent</Text>
            </View>
          </View>
        )}
      </View>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setSel(null)}
        onResponderTerminate={() => setSel(null)}
      >
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={C.grid} strokeWidth={1} />
            {stats.map((w, i) => {
              const cx = slot * i + slot / 2;
              const dim = sel !== null && sel !== i;
              const h = w.avg ? Math.max(2, height - y(w.avg)) : 0;
              const tickY = w.last !== null && w.lastDate ? Math.min(height - 1.5, y(w.last)) : null;
              return (
                <G key={i} opacity={dim ? 0.3 : 1}>
                  {h > 0 ? <Path d={barPath(cx - bw / 2, height - h, bw, h, 6)} fill={color} /> : null}
                  {tickY !== null ? (
                    <>
                      {/* A 2px surface ring keeps the tick legible where it crosses the bar. */}
                      <Line x1={cx - bw / 2 - 5} x2={cx + bw / 2 + 5} y1={tickY} y2={tickY} stroke={C.surface} strokeWidth={6} strokeLinecap="round" />
                      <Line x1={cx - bw / 2 - 5} x2={cx + bw / 2 + 5} y1={tickY} y2={tickY} stroke={C.text} strokeWidth={2.5} strokeLinecap="round" />
                    </>
                  ) : null}
                </G>
              );
            })}
          </Svg>
        )}
      </View>

      <View style={st.wdRow}>
        {stats.map((w, i) => {
          const c = change(w);
          return (
            <View key={i} style={[st.wdCol, sel !== null && sel !== i && { opacity: 0.4 }]}>
              <Text style={st.wdLabel}>{WD[i]}</Text>
              <Text style={[st.wdDelta, num, { color: c === null ? C.muted : Math.abs(c) < 0.5 ? C.dim : c > 0 ? C.up : C.down }]}>
                {c === null ? '–' : `${c > 0 ? '+' : ''}${c.toFixed(0)}%`}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* A row of pill toggles, horizontally scrollable when they do not fit. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              onChange(o.key);
            }}
            style={[st.chip, on && st.chipOn]}
          >
            <Text style={[st.chipText, on && { color: C.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
