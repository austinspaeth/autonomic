import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useView } from '../lib/views';
import { BOARD_GUTTER, BoardWidth, NAV_H, useBoardWidth, useWide } from '../lib/wide';
import { C, R, num } from '../theme';

/* Every vertical scroller takes these: dragging the list puts the keyboard
   away, and a tap on a control still lands while it is up.

   It does NOT inset itself by the keyboard. React Native works that inset out
   as "my bottom edge minus the keyboard's top", for every scroller that asks,
   whether or not the field is inside it, and only undoes it on the next
   keyboard notification. A keyboard frame that arrives empty (a hardware
   keyboard, the Mac window) reads as a keyboard as tall as the scroller, and
   a card closed with the keyboard up never sends the undo, so the page was
   left with a screen of nothing under its last card. Only a scroller that
   HOLDS a form asks for it (`FORM_SCROLL`), and those are unmounted with
   their card. */
export const KEYBOARD_SCROLL = {
  keyboardDismissMode: 'on-drag',
  keyboardShouldPersistTaps: 'handled',
} as const;

/** A scroller with fields in it: also clears the focused field of the keyboard. */
export const FORM_SCROLL = { ...KEYBOARD_SCROLL, automaticallyAdjustKeyboardInsets: true } as const;

const NO_INSET = { top: 0, left: 0, bottom: 0, right: 0 };

/* The bottom chrome: the logo + view picker band, frosted, pinned above the
   home indicator. Screens pad their content by it. */
export const BOTTOM_CHROME = 64;

/* The sticky top bar's band below the status bar (date header, range control). */
export const TOP_BAR_HEIGHT = 56;

export function Screen({
  title,
  subtitle,
  right,
  topBar,
  bottomExtra = 0,
  refreshing,
  onRefresh,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** Sticky control pinned under the status bar on a frosted band. */
  topBar?: ReactNode;
  /** Extra room under the content for floating controls above the bottom bar. */
  bottomExtra?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  /* Wide: the navigation bar is at the top (and draws its own glass), so the
     content clears that instead of the bottom chrome. */
  const wide = useWide();
  const top = insets.top + (wide ? NAV_H : topBar ? TOP_BAR_HEIGHT : 0);
  const bottom = insets.bottom + (wide ? 0 : BOTTOM_CHROME) + bottomExtra;
  const scroll = useRef<ScrollView>(null);
  /* The scroll view outlives a change of view, so a new view would open
     wherever the last one was left. Every view starts at its top. */
  const view = useView();
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [view]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Plain top padding (never contentInset): iOS resets an inset scroll to
          zero after a reload or a pull-to-refresh, which slid the content up
          under the sticky bar and clipped it. Padding cannot be reset. */}
      <ScrollView
        ref={scroll}
        {...KEYBOARD_SCROLL}
        automaticallyAdjustKeyboardInsets={false}
        contentInset={NO_INSET}
        style={{ flex: 1, backgroundColor: C.bg }}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: top + 12,
          paddingBottom: bottom + 24,
          paddingHorizontal: wide ? BOARD_GUTTER : 16,
          gap: wide ? 16 : 12,
          width: '100%',
        }}
        scrollIndicatorInsets={{ top: topBar ? TOP_BAR_HEIGHT : 0, bottom: BOTTOM_CHROME + bottomExtra }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.dim} progressViewOffset={top} />
          ) : undefined
        }
      >
        {title ? (
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{title}</Text>
              {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {/* Frosted band under the status bar (plus the sticky bar, when there is
          one), so content scrolling up reads as passing under glass, matching
          the bottom chrome. */}
      <View pointerEvents="box-none" style={[s.topBand, { height: top, paddingTop: insets.top }, wide && { display: 'none' }]}>
        {Platform.OS === 'ios' ? (
          <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,14,0.96)' }]} />
        )}
        {topBar ? (
          <>
            <View style={s.topBar}>{topBar}</View>
            <View style={s.topRule} />
          </>
        ) : null}
      </View>
    </View>
  );
}

export function Card({ title, right, children, style }: { title?: string; right?: ReactNode; children: ReactNode; style?: ViewStyle }) {
  const boardW = useBoardWidth();
  return (
    <View style={[s.card, boardW ? { width: boardW } : null, style]}>
      {title ? (
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {/* Whatever is inside is laid out by this card, not by the board. */}
      {boardW ? <BoardWidth.Provider value={null}>{children}</BoardWidth.Provider> : children}
    </View>
  );
}

export function Delta({ value, base, suffix }: { value: number; base: number; suffix?: string }) {
  if (!base) return <Text style={s.deltaFlat}>{suffix ? `no ${suffix}` : '—'}</Text>;
  const pct = ((value - base) / base) * 100;
  const flat = Math.abs(pct) < 0.5;
  const color = flat ? C.dim : pct > 0 ? C.up : C.down;
  const arrow = flat ? '' : pct > 0 ? '▲ ' : '▼ ';
  return (
    <Text style={[s.delta, num, { color }]}>
      {arrow}
      {Math.abs(pct).toFixed(0)}%{suffix ? <Text style={s.deltaFlat}> vs {suffix}</Text> : null}
    </Text>
  );
}

export function Tile({ label, value, sub, onPress }: { label: string; value: string; sub?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
    >
      <Text style={s.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.tileValue, num]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <View style={{ marginTop: 2 }}>{typeof sub === 'string' ? <Text style={s.tileSub}>{sub}</Text> : sub}</View> : null}
    </Pressable>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={s.grid}>{children}</View>;
}

/**
 * Two or more options in one container, with a single pill that SLIDES to the
 * chosen one on a spring rather than reappearing under it. The labels sit
 * above the pill, so the pill is the only thing that moves.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** A smaller control for a card's corner. */
  compact?: boolean;
}) {
  return (
    <View style={s.seg}>
      <SlidingPill count={options.length} index={Math.max(0, options.findIndex((o) => o.key === value))} inset={3} style={s.segPill} />
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              onChange(o.key);
            }}
            style={[s.segItem, compact && s.segItemCompact]}
          >
            <Text style={[s.segText, compact && s.segTextCompact, on && { color: C.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PILL_SPRING = { damping: 20, stiffness: 240, mass: 0.8 };

/**
 * The moving highlight behind `count` equal-width slots. Render it as the
 * FIRST child of a row whose slots are `flex: 1`, with `inset` matching that
 * row's padding; it measures the slots and springs to slot `index`. It is placed by transform only, so moving it never
 * reflows the labels.
 */
export function SlidingPill({ count, index, inset = 0, style }: { count: number; index: number; inset?: number; style?: ViewStyle }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const seen = useRef(false);
  const slot = count ? w / count : 0;
  useEffect(() => {
    if (!slot) return;
    // Land in place on first measure; spring on every change after.
    x.value = seen.current ? withSpring(index * slot, PILL_SPRING) : index * slot;
    seen.current = true;
  }, [index, slot, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: inset, left: inset, right: inset, bottom: inset }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {slot ? <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: slot }, style, anim]} /> : null}
    </View>
  );
}

export function Row({ left, title, sub, right, rightSub }: { left?: ReactNode; title: string; sub?: string; right?: string; rightSub?: string }) {
  return (
    <View style={s.row}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={s.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.rowRight, num]}>{right}</Text>
          {rightSub ? <Text style={s.rowSub}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.hairline, marginVertical: 2 }} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

export function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

export function Pill({ label, color = C.dim }: { label: string; color?: string }) {
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  topBand: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  topBar: { height: TOP_BAR_HEIGHT, justifyContent: 'center', paddingHorizontal: 16 },
  topRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.hairline },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, gap: 12 },
  title: { color: C.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: C.dim, fontSize: 15, marginTop: 2 },
  card: { backgroundColor: C.surface, borderRadius: R.card, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: C.dim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { backgroundColor: C.surface, borderRadius: R.tile, padding: 14, flexBasis: '47%', flexGrow: 1, minHeight: 92 },
  tileLabel: { color: C.dim, fontSize: 13, fontWeight: '500' },
  tileValue: { color: C.text, fontSize: 28, fontWeight: '700', marginTop: 4, letterSpacing: -0.5 },
  tileSub: { color: C.muted, fontSize: 12 },
  delta: { fontSize: 12, fontWeight: '600' },
  deltaFlat: { color: C.muted, fontSize: 12, fontWeight: '500' },
  /* The container is a tint, not a surface, so it reads as a container both
     on the page and inside a card. The inner row is inset by 3 on every side;
     the pill fills exactly one slot of it. */
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segItemCompact: { paddingVertical: 5 },
  segTextCompact: { fontSize: 12 },
  segPill: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 9 },
  segText: { color: C.dim, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '500' },
  rowSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  rowRight: { color: C.text, fontSize: 15, fontWeight: '600' },
  empty: { color: C.muted, fontSize: 14, paddingVertical: 4 },
  pill: { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '700' },
});
