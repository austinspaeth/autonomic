/* Metric cards that open.
 *
 * At rest a card is compact and outlined, like the web dashboard's: its
 * title, its number, and the change in green or red, two to a row. Tap it and it springs open into a full-width square holding
 * what the number is made of: its comparisons, its breakdowns and a minimal
 * bar chart across the range. Tap again (or another card) to close it.
 *
 * The opening is a LAYOUT spring, not a scale: every card in the grid rides
 * the same transition, so the opened card grows from its own slot while its
 * neighbours slide out of the way, and nothing ever jumps. The detail fades in
 * after the card has mostly arrived, so the motion reads as the card making
 * room and then filling it. */
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { C, num } from '../theme';
import { BoardTitle, NARROW_COLUMN, useBoardWidth } from '../lib/wide';
import { BarChart, SplitBar, type Part } from './charts';
import type { Series } from '../lib/metrics';
import type { PaceModel } from '../lib/pace';
import { Pace } from './Pace';
import { Sheet } from './Sheet';

export type Change = {
  value: number;
  base: number | null | undefined;
  /** Grey instead of green/red: a comparison that is not yet fair (a day still filling). */
  neutral?: boolean;
} | null;

export type Comparison = {
  label: string;
  /** A percentage change, drawn as a coloured pill. The number it is measured
   *  against is printed after the label: "vs the day before (27)". */
  change?: Change;
  /** How that number is written (default: a plain count). */
  format?: (n: number) => string;
  /** Or a plain value. */
  value?: string;
};

export type ChartSpec = {
  title: string;
  series: Series;
  format?: (n: number) => string;
  color?: string;
  unknownBefore?: string | null;
  unknownAfter?: string | null;
  /** How an x key reads, when it is not a day (a weekday, a month, an age band). */
  xLabel?: (key: string) => string;
  /** What the chart comes to, at the right of its title. */
  summary?: string;
};

export type MetricSpec = {
  key: string;
  /** The card takes the whole row at rest, for the one number a view leads with. */
  wide?: boolean;
  label: string;
  value: string;
  /** A second, quieter figure on the number's own line ("/ 55%"). */
  aside?: string;
  change?: Change;
  /** One line under the number in the opened card. */
  note?: string;
  /** A day still filling: is it on track, against yesterday and the range at the same clock time. */
  pace?: { model: PaceModel; color?: string } | null;
  comparisons?: Comparison[];
  splits?: { title: string; parts: Part[]; format?: (n: number) => string }[];
  /** Anything the deep dive holds beyond numbers (a list), drawn above the chart. */
  body?: ReactNode;
  chart?: ChartSpec;
  /** More charts, under the first. */
  charts?: ChartSpec[];
};

/* One spring for everything that moves when a card opens, so the card's
   frame and the type inside it arrive together. */
const SPRING_CFG = { damping: 17, stiffness: 170, mass: 0.9 };
const SPRING = LinearTransition.springify().damping(SPRING_CFG.damping).stiffness(SPRING_CFG.stiffness).mass(SPRING_CFG.mass);

/** At this grid width (an iPad or a Mac window) the cards go four across. */
const WIDE_GRID = 600;

const VALUE_SIZE = { small: 24, big: 44 };
const ASIDE_SIZE = { small: 14, big: 20 };
const CHANGE_SIZE = { small: 12, big: 15 };

/** 0 at rest, 1 opened, sprung. Font size is animated directly (not scaled)
 *  so the line's own height grows with it and nothing overlaps mid-flight. */
function useGrow(big: boolean) {
  const t = useSharedValue(big ? 1 : 0);
  useEffect(() => {
    t.value = withSpring(big ? 1 : 0, SPRING_CFG);
  }, [big, t]);
  return t;
}

function GrowingValue({ text, aside, big }: { text: string; aside?: string; big: boolean }) {
  const t = useGrow(big);
  const style = useAnimatedStyle(() => {
    const size = VALUE_SIZE.small + (VALUE_SIZE.big - VALUE_SIZE.small) * t.value;
    return { fontSize: size, lineHeight: size * 1.18, letterSpacing: -0.5 - 0.7 * t.value };
  });
  const asideStyle = useAnimatedStyle(() => ({ fontSize: ASIDE_SIZE.small + (ASIDE_SIZE.big - ASIDE_SIZE.small) * t.value }));
  return (
    <View style={st.valueRow}>
      <Animated.Text style={[st.value, num, style]} numberOfLines={1}>
        {text}
      </Animated.Text>
      {aside ? (
        <Animated.Text style={[st.aside, num, asideStyle]} numberOfLines={1}>
          {aside}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function GrowingChange({ change, big }: { change?: Change; big: boolean }) {
  const t = useGrow(big);
  const style = useAnimatedStyle(() => ({
    fontSize: CHANGE_SIZE.small + (CHANGE_SIZE.big - CHANGE_SIZE.small) * t.value,
  }));
  return <ChangeText change={change} animatedStyle={style} />;
}

/** A count as it stands: whole when it is whole, one decimal for an average. */
const plain = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

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

/* What an opened card holds under its number: the note, the pace, the
   comparisons, the breakdowns, anything bespoke, and the chart. */
function Detail({ m }: { m: MetricSpec }) {
  return (
    <>
      {m.note ? <Text style={st.note}>{m.note}</Text> : null}

      {m.pace ? <Pace pace={m.pace.model} color={m.pace.color} /> : null}

      {m.comparisons?.length ? (
        <View style={st.rows}>
          {m.comparisons.map((c) => (
            <View key={c.label} style={st.row}>
              <Text style={st.rowLabel}>
                {c.label}
                {c.change && typeof c.change.base === 'number' ? <Text style={[st.rowBase, num]}> ({(c.format ?? plain)(c.change.base)})</Text> : null}
              </Text>
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

      {m.body}

      {[...(m.chart ? [m.chart] : []), ...(m.charts ?? [])].map((c) => (
        <View key={c.title} style={{ marginTop: 2 }}>
          <BarChart
            title={c.title}
            series={c.series}
            summary={c.summary ?? ''}
            format={c.format}
            color={c.color}
            height={84}
            unknownBefore={c.unknownBefore}
            unknownAfter={c.unknownAfter}
            xLabel={c.xLabel}
            compact
          />
        </View>
      ))}
    </>
  );
}

export function MetricTiles({ specs }: { specs: MetricSpec[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [gridW, setGridW] = useState(0);
  const boardW = useBoardWidth();
  const insets = useSafeAreaInsets();
  const boardTitle = useContext(BoardTitle);

  /* On the wide board a card does NOT grow in place. The board is a wrapping
     flow sized to the window, so a card that grew pushed everything after it
     into other columns, and every tile's layout spring chased it there. It
     opens as a side panel instead, like every other long read on that
     screen, and the board under it does not move. */
  if (boardW) {
    const m = specs.find((x) => x.key === open) ?? null;
    /* A narrow column (a phone on its side, three across) cannot hold two
       tiles side by side, and the whole grid as ONE item would stand taller
       than the screen. So each tile is an item of the flow in its own right,
       full width, and the run of them wraps from column to column. */
    const narrow = boardW < NARROW_COLUMN;
    const tile = (x: MetricSpec) => (
      <View key={x.key} style={[st.tile, narrow ? { width: boardW } : x.wide ? st.full : gridW >= WIDE_GRID ? st.quarter : st.half]}>
        <Pressable
          style={({ pressed }) => [st.press, gridW >= WIDE_GRID && st.pressWide, pressed && { opacity: 0.7 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setOpen(x.key);
          }}
        >
          <View style={st.head}>
            <Text style={st.label} numberOfLines={1}>
              {x.label}
            </Text>
          </View>
          <GrowingValue text={x.value} aside={x.aside} big={false} />
          <GrowingChange change={x.change} big={false} />
        </Pressable>
      </View>
    );
    const sheet = (
      <Sheet visible={!!m} onClose={() => setOpen(null)} title={m?.label} full bleed>
        {() =>
          m ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <GrowingValue text={m.value} aside={m.aside} big />
              <GrowingChange change={m.change} big />
              <View style={st.detail}>
                <Detail m={m} />
              </View>
            </ScrollView>
          ) : null
        }
      </Sheet>
    );
    if (narrow) {
      return (
        <>
          {boardTitle ? <Text style={[st.boardTitle, { width: boardW }]}>{boardTitle}</Text> : null}
          {specs.map(tile)}
          {sheet}
        </>
      );
    }
    return (
      <View style={{ width: boardW, gap: 10 }}>
        {boardTitle ? <Text style={st.boardTitle}>{boardTitle}</Text> : null}
        <View style={st.grid} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          {specs.map(tile)}
        </View>
        {sheet}
      </View>
    );
  }

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
              isOpen || m.wide ? st.full : gridW >= WIDE_GRID ? st.quarter : st.half,
              isOpen && gridW ? { minHeight: Math.min(gridW, 420) } : null,
              isOpen && st.open,
            ]}
          >
            <Pressable
              style={[st.press, gridW >= WIDE_GRID && st.pressWide]}
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
              <GrowingValue text={m.value} aside={m.aside} big={isOpen} />
              <GrowingChange change={m.change} big={isOpen} />

              {isOpen ? (
                <Animated.View entering={FadeIn.delay(140).duration(240)} exiting={FadeOut.duration(90)} style={st.detail}>
                  <Detail m={m} />
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
  // On the board the cards are placed by the wrap, and a layout spring would
  // send one gliding across columns every time the flow re-settles.
  const boardW = useBoardWidth();
  if (boardW) return <>{children}</>;
  return <Animated.View layout={SPRING}>{children}</Animated.View>;
}

/* A slightly lighter grey edge on the dark grey card. */
const TILE_BORDER = 'rgba(255,255,255,0.10)';

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  boardTitle: { color: C.dim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, paddingTop: 4 },
  tile: { backgroundColor: C.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: TILE_BORDER },
  half: { width: '47.5%', flexGrow: 1 },
  quarter: { width: '23%', flexGrow: 1 },
  full: { width: '100%' },
  open: { borderRadius: 24, backgroundColor: '#18181b' },
  press: { paddingHorizontal: 12, paddingVertical: 10, gap: 1, flexGrow: 1 },
  pressWide: { paddingHorizontal: 16, paddingVertical: 14, gap: 3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  label: { color: C.dim, fontSize: 12, fontWeight: '500', flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  value: { color: C.text, fontWeight: '700', flexShrink: 1 },
  aside: { color: C.dim, fontWeight: '600' },
  change: { fontWeight: '700' },
  detail: { gap: 16, marginTop: 16 },
  note: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: -8 },
  rows: { gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10 },
  rowLabel: { color: C.dim, fontSize: 14, flexShrink: 1 },
  rowBase: { color: C.muted },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  section: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
});
