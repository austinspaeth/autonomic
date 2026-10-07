/* How an alert looks: the toast stack over the screen, and the history the
 * bell opens. Both draw the same event the same way: a tinted icon for its
 * kind, the sentence, and (opened) one chip row per install behind the count,
 * because "2 sales" from a 9-day-old iOS trial and a 17-day-old Android free
 * install is the same number and none of the news. */
import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PLAN_CHIP, SENSOR_CHIP, STORE_CHIP, TIER, type AlertEvent, type AlertRow } from '../lib/alerts';
import { useAlerts } from '../lib/alertsStore';
import { longDate } from '../lib/dates';
import { C, num } from '../theme';
import { BOTTOM_CHROME } from './ui';

export const KIND_STYLE: Record<AlertEvent['kind'], { icon: SFSymbol; color: string; label: string }> = {
  record: { icon: 'trophy.fill', color: '#FFC93C', label: 'All-time high' },
  sale: { icon: 'dollarsign', color: '#FFC93C', label: 'Sale' },
  download: { icon: 'arrow.down', color: '#dbe7ff', label: 'New install' },
  reading: { icon: 'heart.fill', color: '#ff375f', label: 'Reading' },
  visitor: { icon: 'person.2.fill', color: '#5ac8fa', label: 'Returning' },
  restore: { icon: 'arrow.clockwise', color: '#34c759', label: 'Restored' },
  lapse: { icon: 'arrow.down.right', color: '#8a8a90', label: 'Lapsed' },
  crash: { icon: 'exclamationmark.triangle.fill', color: '#ff453a', label: 'Crash' },
};

/* Rows opening and closing: a short ease-out, no spring. These are lists
   read quickly, and a bounce on every tap reads as lag. */
const ROW_EASE = LinearTransition.duration(200).easing(Easing.out(Easing.cubic));

function timeOf(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 50) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return timeOf(ms);
}

function Icon({ kind, size = 34 }: { kind: AlertEvent['kind']; size?: number }) {
  const k = KIND_STYLE[kind];
  return (
    <View style={[st.icon, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${k.color}26` }]}>
      <SymbolView name={k.icon} size={size * 0.48} weight="bold" tintColor={k.color} />
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone?: string }) {
  return (
    <View style={[st.chip, tone ? { backgroundColor: `${tone}22` } : null]}>
      <Text style={[st.chipText, tone ? { color: tone } : null]}>{label}</Text>
    </View>
  );
}

export function InstallRows({ event }: { event: AlertEvent }) {
  if (!event.rows.length) return null;
  const slotName = (r: AlertRow) =>
    event.kind === 'reading' ? SENSOR_CHIP[r.slot] : event.kind === 'sale' || event.kind === 'restore' || event.kind === 'lapse' ? PLAN_CHIP[r.slot] || 'Plan unknown' : null;
  return (
    <View style={st.rows}>
      {event.rows.map((r, i) => (
        <View key={i} style={st.row}>
          <Text style={[st.rowN, num]}>{r.n}×</Text>
          <View style={st.chips}>
            <Chip label={STORE_CHIP[r.platform] || 'Unknown store'} tone={r.platform === 'I' ? C.ios : r.platform === 'A' ? C.android : undefined} />
            <Chip label={TIER[r.tier] || 'Tier unknown'} tone={r.tier === 'P' ? '#c98500' : r.tier === 'T' ? '#199e70' : undefined} />
            {slotName(r) ? <Chip label={slotName(r)!} /> : null}
            {r.version ? <Chip label={`v${r.version}`} /> : null}
            <Chip label={r.age === 0 ? 'Installed today' : `Day ${r.age}`} />
            {r.first ? <Chip label="First ever" tone="#ff375f" /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- toasts */

/* The live toasts are a DECK, like the stacked modal cards: the most
   important sits in front (TOAST_PRIORITY, newest first within a kind), and
   every card behind it is a little smaller and a little higher, peeking over
   its top edge. Tapping, swiping or ✕ dismisses the front card and the next
   one comes forward; the details are in the bell's history. Nothing bounces:
   a card DESCENDS onto the deck (it fades in while settling down from
   slightly larger and higher to its place) and the others ease into theirs. */

/** Front to back. A kind not listed goes behind all of these. */
const TOAST_PRIORITY: AlertEvent['kind'][] = ['crash', 'sale', 'record', 'download', 'visitor', 'reading'];
const rank = (k: AlertEvent['kind']) => {
  const i = TOAST_PRIORITY.indexOf(k);
  return i < 0 ? TOAST_PRIORITY.length : i;
};

const TOAST_H = 86;
/** How much of each card behind shows above the one in front of it. */
const PEEK = 10;
/** How much smaller each step back is. */
const SHRINK = 0.055;
/** Cards past this depth are hidden (the count says how many). */
const MAX_DEPTH = 3;
const EASE = { duration: 280, easing: Easing.out(Easing.cubic) };
const BLUR = 95;
/* The entrance: one 0→1 value drives the fade, the zoom (from APPEAR_SCALE
   down to full size) and the descent (from APPEAR_LIFT above its place).
   It is part of the card's own animated style rather than a layout
   `entering` animation, because the two fought over `transform` (the deck
   position lives there too) and the card stuttered on its way in. */
const APPEAR = { duration: 420, easing: Easing.out(Easing.cubic) };
const APPEAR_SCALE = 0.08;
const APPEAR_LIFT = 18;

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

function liftOut() {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: 200 }),
      transform: [{ scale: withTiming(0.94, { duration: 220 }) }, { translateY: withTiming(14, { duration: 220 }) }],
    },
  };
}

/** The toast's one line: the first two facts of the sentence, nothing more. */
const short = (body: string) => body.split(' · ').slice(0, 2).join(' · ');

const SWIPE_OUT = 90;

function Toast({
  event,
  depth,
  onClose,
  onHeight,
}: {
  event: AlertEvent;
  depth: number;
  onClose: () => void;
  onHeight?: (h: number) => void;
}) {
  const [swiped, setSwiped] = useState(false);
  const d = useSharedValue(depth);
  const tx = useSharedValue(0);
  const appear = useSharedValue(0);
  useEffect(() => {
    d.value = withTiming(depth, EASE);
  }, [depth, d]);
  useEffect(() => {
    appear.value = withTiming(1, APPEAR);
  }, [appear]);

  const gone = (dir: number) => {
    setSwiped(true);
    setTimeout(onClose, 0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return dir;
  };

  /* Swipe left or right to dismiss: past SWIPE_OUT (or flicked) it slides off
     and fades; short of it, it eases back. Vertical drags pass through. */
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          tx.value = g.dx;
        },
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) > SWIPE_OUT || Math.abs(g.vx) > 0.8) {
            const dir = g.dx > 0 ? 1 : -1;
            tx.value = withTiming(dir * 520, { duration: 200, easing: Easing.out(Easing.quad) }, (done) => {
              if (done) runOnJS(gone)(dir);
            });
          } else {
            tx.value = withTiming(0, EASE);
          }
        },
        onPanResponderTerminate: () => {
          tx.value = withTiming(0, EASE);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* The fade is NOT the wrapper's opacity: a blur view under a parent with
     opacity below 1 renders broken on iOS and pops in at the end, which is
     the jagged entrance this replaced. The wrapper's border, the content and
     the blur's own intensity fade instead. */
  const style = useAnimatedStyle(() => ({
    opacity: (d.value > MAX_DEPTH - 0.01 ? 0 : 1) * (1 - Math.min(1, Math.abs(tx.value) / 360)),
    borderColor: `rgba(255,255,255,${0.16 * appear.value})`,
    transform: [
      { translateY: -PEEK * d.value - APPEAR_LIFT * (1 - appear.value) },
      { translateX: tx.value },
      { scale: (1 - SHRINK * d.value) * (1 + APPEAR_SCALE * (1 - appear.value)) },
    ],
  }));
  const fade = useAnimatedStyle(() => ({ opacity: appear.value }));
  const blur = useAnimatedProps(() => ({ intensity: BLUR * appear.value }));
  const k = KIND_STYLE[event.kind];
  const front = depth === 0;
  return (
    <Animated.View
      exiting={swiped ? undefined : liftOut}
      pointerEvents={front ? 'auto' : 'none'}
      onLayout={front ? (e) => onHeight?.(e.nativeEvent.layout.height) : undefined}
      style={[st.toastWrap, { zIndex: 100 - depth, transformOrigin: 'bottom' }, style]}
      {...(front ? pan.panHandlers : {})}
    >
      <AnimatedBlur tint="systemChromeMaterialDark" animatedProps={blur} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: `${k.color}12` }, fade]} />
      {/* Tapping a toast closes it; the details live in the alerts history. */}
      <Animated.View style={[st.toastFill, fade]}>
        <Pressable onPress={() => gone(0)} style={st.toast}>
          <View style={st.toastHead}>
            <Icon kind={event.kind} size={40} />
            <View style={{ flex: 1, minWidth: 0, paddingRight: 26 }}>
              <Text style={st.title} numberOfLines={1}>
                {event.title}
              </Text>
              <Text style={st.body} numberOfLines={1}>
                {short(event.body)}
              </Text>
            </View>
          </View>
          <Pressable hitSlop={12} onPress={() => gone(0)} style={st.x}>
            <SymbolView name="xmark" size={10} weight="bold" tintColor={C.dim} />
          </Pressable>
          <Text style={st.timeCorner}>{ago(event.at)}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/** The live deck, anchored just above the bottom bar (and filter bar). */
export function ToastStack({ raisedBy = 0 }: { raisedBy?: number }) {
  const insets = useSafeAreaInsets();
  const { history, live, dismiss, dismissAll } = useAlerts();
  const [frontH, setFrontH] = useState(TOAST_H);
  // Most important first, newest first within a kind (`live` is in arrival
  // order, and the sort is stable).
  const shown = [...live]
    .reverse()
    .map((id) => history.find((e) => e.id === id))
    .filter((e): e is AlertEvent => !!e)
    .sort((a, b) => rank(a.kind) - rank(b.kind));
  if (!shown.length) return null;
  const bottom = insets.bottom + BOTTOM_CHROME + raisedBy + 10;
  const behind = Math.min(shown.length - 1, MAX_DEPTH - 1);
  const front = Math.max(TOAST_H, frontH);
  return (
    <View pointerEvents="box-none" style={[st.deck, { bottom, height: front + PEEK * behind + (shown.length > 1 ? 44 : 0) }]}>
      {shown.length > 1 ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={st.closeAllWrap}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              dismissAll();
            }}
            style={({ pressed }) => [st.closeAll, pressed && { opacity: 0.7 }]}
          >
            <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
            <SymbolView name="xmark" size={10} weight="bold" tintColor={C.text} />
            <Text style={st.closeAllText}>Close all · {shown.length}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
      {shown.slice(0, MAX_DEPTH + 1).map((e, i) => (
        <Toast key={e.id} event={e} depth={i} onClose={() => dismiss(e.id)} onHeight={i === 0 ? setFrontH : undefined} />
      ))}
    </View>
  );
}

/* --------------------------------------------------------------- history */

export function AlertHistory() {
  const { history, clearHistory } = useAlerts();
  const [open, setOpen] = useState<string | null>(null);
  const groups = new Map<string, AlertEvent[]>();
  history.forEach((e) => {
    const d = new Date(e.at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    (groups.get(k) || groups.set(k, []).get(k)!).push(e);
  });
  const today = new Date();
  const label = (k: string) => {
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const y = new Date(today.getTime() - 864e5);
    const yk = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    return k === t ? 'Today' : k === yk ? 'Yesterday' : longDate(k);
  };

  if (!history.length) {
    return (
      <View style={st.empty}>
        <SymbolView name="bell.slash" size={30} tintColor={C.muted} />
        <Text style={st.emptyText}>Nothing yet. New installs, sales, returns and records land here as they happen.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      {[...groups.entries()].map(([k, list]) => (
        <View key={k} style={{ marginBottom: 18 }}>
          <View style={st.dayHead}>
            <Text style={st.dayLabel}>{label(k)}</Text>
            <Text style={st.dayCount}>{list.length}</Text>
          </View>
          <View style={st.dayCard}>
            {list.map((e, i) => {
              const isOpen = open === e.id;
              return (
                <Animated.View key={e.id} layout={ROW_EASE}>
                  {i ? <View style={st.sep} /> : null}
                  <Pressable onPress={() => setOpen(isOpen ? null : e.id)} style={st.hItem}>
                    <View style={st.toastHead}>
                      <Icon kind={e.kind} size={30} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.title}>{e.title}</Text>
                        <Text style={st.body} numberOfLines={isOpen ? undefined : 1}>
                          {e.body}
                        </Text>
                      </View>
                      <Text style={st.time}>{timeOf(e.at)}</Text>
                    </View>
                    {isOpen ? (
                      <Animated.View entering={FadeIn.duration(200)}>
                        <InstallRows event={e} />
                      </Animated.View>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </View>
      ))}
      <Pressable onPress={clearHistory} style={({ pressed }) => [st.clear, pressed && { opacity: 0.6 }]}>
        <Text style={st.clearText}>Clear history</Text>
      </Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  deck: { position: 'absolute', left: 12, right: 12 },
  closeAllWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  closeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  closeAllText: { color: C.text, fontSize: 13, fontWeight: '600' },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TOAST_H,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  toastFill: { flex: 1 },
  toast: { flex: 1, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  timeCorner: { position: 'absolute', right: 14, bottom: 10, color: C.muted, fontSize: 11 },
  toastHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  body: { color: C.dim, fontSize: 13, marginTop: 1, lineHeight: 17 },
  time: { color: C.muted, fontSize: 12 },
  x: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  rows: { gap: 8, marginTop: 12, marginLeft: 52 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowN: { color: C.text, fontSize: 13, fontWeight: '700', width: 26, marginTop: 3 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  chipText: { color: C.dim, fontSize: 11, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 30 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingHorizontal: 4 },
  dayLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  dayCount: { color: C.muted, fontSize: 12 },
  dayCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, paddingHorizontal: 12 },
  hItem: { paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.hairline },
  clear: { alignItems: 'center', paddingVertical: 12 },
  clearText: { color: C.down, fontSize: 14, fontWeight: '600' },
});

export { KIND_STYLE as ALERT_KINDS };
