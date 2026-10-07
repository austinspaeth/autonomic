/* Metric cards that open.
 *
 * At rest a card is three things: its title, its number, and the change in
 * green or red. Tap it and it springs open into a full-width square holding
 * what the number is made of: its comparisons, its breakdowns and a minimal
 * bar chart across the range. Tap again (or another card) to close it.
 *
 * The opening is a LAYOUT spring, not a scale: every card in the grid rides
 * the same transition, so the opened card grows from its own slot while its
 * neighbours slide out of the way, and nothing ever jumps. The detail fades in
 * after the card has mostly arrived, so the motion reads as the card making
 * room and then filling it. */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { C, R, num } from '../theme';
import { BarChart, SplitBar, type Part } from './charts';
import type { Series } from '../lib/metrics';

export type Change = {
  value: number;
  base: number | null | undefined;
  /** Grey instead of green/red: a comparison that is not yet fair (a day still filling). */
  neutral?: boolean;
} | null;

export type Comparison = {
  label: string;
  /** A percentage change, drawn as a coloured pill. */
  change?: Change;
  /** Or a plain value. */
  value?: string;
};

export type MetricSpec = {
  key: string;
  label: string;
  value: string;
  change?: Change;
  /** Spans the full width even at rest (the headline card). */
  wide?: boolean;
  /** One line under the number in the opened card. */
  note?: string;
  comparisons?: Comparison[];
  splits?: { title: string; parts: Part[]; format?: (n: number) => string }[];
  chart?: { title: string; series: Series; format?: (n: number) => string; color?: string; unknownBefore?: string | null; unknownAfter?: string | null };
};

/* One spring for everything that moves when a card opens, so the card's
   frame and the type inside it arrive together. */
const SPRING_CFG = { damping: 17, stiffness: 170, mass: 0.9 };
const SPRING = LinearTransition.springify().damping(SPRING_CFG.damping).stiffness(SPRING_CFG.stiffness).mass(SPRING_CFG.mass);

const VALUE_SIZE = { small: 28, big: 44 };
const CHANGE_SIZE = { small: 13, big: 15 };

/** 0 at rest, 1 opened, sprung. Font size is animated directly (not scaled)
 *  so the line's own height grows with it and nothing overlaps mid-flight. */
function useGrow(big: boolean) {
  const t = useSharedValue(big ? 1 : 0);
  useEffect(() => {
    t.value = withSpring(big ? 1 : 0, SPRING_CFG);
  }, [big, t]);
  return t;
}

function GrowingValue({ text, big }: { text: string; big: boolean }) {
  const t = useGrow(big);
  const style = useAnimatedStyle(() => {
    const size = VALUE_SIZE.small + (VALUE_SIZE.big - VALUE_SIZE.small) * t.value;
    return { fontSize: size, lineHeight: size * 1.18, letterSpacing: -0.5 - 0.7 * t.value };
  });
  return (
    <Animated.Text style={[st.value, num, style]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
}

function GrowingChange({ change, big }: { change?: Change; big: boolean }) {
  const t = useGrow(big);
  const style = useAnimatedStyle(() => ({
    fontSize: CHANGE_SIZE.small + (CHANGE_SIZE.big - CHANGE_SIZE.small) * t.value,
  }));
  return <ChangeText change={change} animatedStyle={style} />;
}

function pctOf(change: Change): number | null {
  if (!change || !change.base) return null;
  return ((change.value - change.base) / change.base) * 100;
}

export function ChangeText({ change, size = 13, animatedStyle }: { change?: Change; size?: number; animatedStyle?: object }) {
  // A card that has no comparison at all shows none; `null` means "not available".
  if (change === undefined) return null;
  const p = pctOf(change ?? null);
  if (p === null) return <Animated.Text style={[st.change, { fontSize: size, color: C.muted }, animatedStyle]}>–</Animated.Text>;
  const flat = Math.abs(p) < 0.5;
  const color = change?.neutral || flat ? C.dim : p > 0 ? C.up : C.down;
  return (
    <Animated.Text style={[st.change, num, { fontSize: size, color }, animatedStyle]}>
      {flat ? '' : p > 0 ? '▲ ' : '▼ '}
      {Math.abs(p) >= 1000 ? `${(Math.abs(p) / 1000).toFixed(1)}k` : Math.abs(p).toFixed(0)}%
    </Animated.Text>
  );
}

function ChangePill({ change }: { change?: Change }) {
  const p = pctOf(change ?? null);
  const flat = p === null || Math.abs(p) < 0.5;
  const tone = p === null || change?.neutral || flat ? 'rgba(255,255,255,0.08)' : p > 0 ? 'rgba(48,209,88,0.14)' : 'rgba(255,69,58,0.14)';
  return (
    <View style={[st.pill, { backgroundColor: tone }]}>
      <ChangeText change={change} size={12} />
    </View>
  );
}

export function MetricTiles({ specs }: { specs: MetricSpec[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [gridW, setGridW] = useState(0);

  return (
    <View style={st.grid} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
      {specs.map((m) => {
        const isOpen = open === m.key;
        return (
          <Animated.View
            key={m.key}
            layout={SPRING}
            style={[
              st.tile,
              m.wide || isOpen ? st.full : st.half,
              isOpen && gridW ? { minHeight: gridW } : null,
              isOpen && st.open,
            ]}
          >
            <Pressable
              style={st.press}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setOpen(isOpen ? null : m.key);
              }}
            >
              <View style={st.head}>
                <Text style={st.label} numberOfLines={isOpen ? 2 : 1}>
                  {m.label}
                </Text>
              </View>
              <GrowingValue text={m.value} big={!!m.wide || isOpen} />
              <GrowingChange change={m.change} big={!!m.wide || isOpen} />

              {isOpen ? (
                <Animated.View entering={FadeIn.delay(140).duration(240)} exiting={FadeOut.duration(90)} style={st.detail}>
                  {m.note ? <Text style={st.note}>{m.note}</Text> : null}

                  {m.comparisons?.length ? (
                    <View style={st.rows}>
                      {m.comparisons.map((c) => (
                        <View key={c.label} style={st.row}>
                          <Text style={st.rowLabel}>{c.label}</Text>
                          {c.change !== undefined ? <ChangePill change={c.change} /> : <Text style={[st.rowValue, num]}>{c.value}</Text>}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {m.splits?.map((sp) => (
                    <View key={sp.title} style={{ gap: 8 }}>
                      <Text style={st.section}>{sp.title}</Text>
                      <SplitBar parts={sp.parts} format={sp.format} />
                    </View>
                  ))}

                  {m.chart ? (
                    <View style={{ marginTop: 2 }}>
                      <BarChart
                        title={m.chart.title}
                        series={m.chart.series}
                        summary=""
                        format={m.chart.format}
                        color={m.chart.color}
                        height={84}
                        unknownBefore={m.chart.unknownBefore}
                        unknownAfter={m.chart.unknownAfter}
                        compact
                      />
                    </View>
                  ) : null}
                </Animated.View>
              ) : null}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** A small wrapper for anything that should ride the same layout spring as
 *  the tiles (cards below a grid, so they glide down when a card opens). */
export function Glide({ children }: { children: ReactNode }) {
  return <Animated.View layout={SPRING}>{children}</Animated.View>;
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { backgroundColor: C.surface, borderRadius: R.tile, overflow: 'hidden' },
  half: { width: '47.5%', flexGrow: 1 },
  full: { width: '100%' },
  open: { borderRadius: 24, backgroundColor: '#18181b', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)' },
  press: { padding: 14, gap: 2, flexGrow: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  label: { color: C.dim, fontSize: 13, fontWeight: '500', flexShrink: 1 },
  value: { color: C.text, fontWeight: '700', marginTop: 2 },
  change: { fontWeight: '700' },
  detail: { gap: 16, marginTop: 16 },
  note: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: -8 },
  rows: { gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10 },
  rowLabel: { color: C.dim, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  section: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
});
