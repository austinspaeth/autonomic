/* The bottom chrome: one frosted band pinned above the home indicator that
   content scrolls underneath. It holds a white plus, the view picker (a
   squircle naming the current view) and a white bell for alerts, the picker
   centred between the two. BlurView on iOS; Android's blur is costly and
   inconsistent, so it gets a near-opaque tint.

   The picker is a press-and-drag menu, not a sheet: touching it slides the
   views up above it, sliding the finger over them highlights one and lifting
   on it picks it. A plain tap leaves the menu open, and a second tap on a
   view picks it (or on the picker, or anywhere else, closes it). The hit test
   is arithmetic over the menu's fixed row sizes, anchored on where the touch
   landed inside the picker, so it never waits on a measurement and cannot be
   thrown off by the menu's own slide-in. */
import { useEffect, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setView, useView, VIEWS, type ViewKey } from '../lib/views';
import { NAV_H, useWide } from '../lib/wide';
import { C } from '../theme';
import { BrandMark } from './BrandMark';
import { Sheet } from './Sheet';
import { AlertHistory } from './AlertViews';
import { AddSheet } from '../features/AddSheet';
import { useAlerts } from '../lib/alertsStore';
import { useData } from '../lib/data';
import { BOTTOM_CHROME } from './ui';

const PICKER_H = 44;
/** Gap between the top of the bar and the bottom of the menu. */
const MENU_GAP = 8;
const MENU_PAD = 6;
const ROW_H = 46;
const ROW_GAP = 4;
const MENU_H = MENU_PAD * 2 + VIEWS.length * ROW_H + (VIEWS.length - 1) * ROW_GAP;
/** How far outside the menu's sides a finger may stray and still hover a row. */
const SIDE_SLOP = 24;

/* The menu is opened by a finger already on its way up to a row, so it has to
   be THERE almost at once: a short rise from just under its resting place
   rather than a slide in from off screen, on a stiff spring damped to within a
   hair of critical (about 1% of overshoot, settled in roughly 120ms). */
const MENU_SPRING = { stiffness: 900, damping: 50, mass: 1 };
const menuIn = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.97 }] },
    animations: {
      opacity: withTiming(1, { duration: 80 }),
      transform: [{ translateY: withSpring(0, MENU_SPRING) }, { scale: withSpring(1, MENU_SPRING) }],
    },
  };
};
/* The same arrival from above, for the picker at the top of a wide screen. */
const menuInDown = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -14 }, { scale: 0.97 }] },
    animations: {
      opacity: withTiming(1, { duration: 80 }),
      transform: [{ translateY: withSpring(0, MENU_SPRING) }, { scale: withSpring(1, MENU_SPRING) }],
    },
  };
};
const menuOut = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, { duration: 100 }), transform: [{ translateY: withTiming(8, { duration: 100 }) }] },
  };
};

type Rect = { x: number; y: number; w: number; h: number };

/* Refresh, on a wide screen (a phone pulls the page down instead). The arrow
   turns for as long as the fetch runs and always finishes the turn it is on,
   so it comes to rest upright rather than stopping mid-spin. */
function RefreshButton() {
  const { loading, refresh } = useData();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (loading) {
      turn.value = turn.value % 360;
      turn.value = withRepeat(withTiming(turn.value + 360, { duration: 850, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(turn);
      const rest = Math.ceil(turn.value / 360) * 360;
      turn.value = withTiming(rest, { duration: Math.max(120, ((rest - turn.value) / 360) * 850), easing: Easing.out(Easing.quad) });
    }
  }, [loading, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Pressable
      hitSlop={10}
      disabled={loading}
      accessibilityLabel="Refresh"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        refresh();
      }}
      style={({ pressed }) => [s.icon, pressed && { opacity: 0.6 }]}
    >
      <Animated.View style={spin}>
        <SymbolView name="arrow.clockwise" size={20} weight="medium" tintColor="#ffffff" />
      </Animated.View>
    </Pressable>
  );
}

export function BottomBar() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const current = useView();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<ViewKey | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerBox, setPickerBox] = useState({ x: 0, w: 0 });
  const { unread, markRead } = useAlerts();
  /* Wide: every view is on the board at once, so the picker does not choose
     a page, it scrolls to a section, and has no "current" one to name. */
  const label = wide ? 'Jump to section' : VIEWS.find((v) => v.key === current)?.label ?? '';

  /* Gesture state lives in refs: the responder is created once. */
  const openRef = useRef(false);
  const hoverRef = useRef<ViewKey | null>(null);
  const openedNow = useRef(false);
  const picker = useRef<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  const show = (on: boolean) => {
    openRef.current = on;
    setOpen(on);
    if (!on) hovered(null);
  };
  const hovered = (key: ViewKey | null) => {
    if (hoverRef.current === key) return;
    hoverRef.current = key;
    setHover(key);
    if (key) Haptics.selectionAsync();
  };
  const choose = (key: ViewKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(key);
    show(false);
  };

  /** The row under a page point, or null. Rows run top to bottom in VIEWS order. */
  const rowAt = (px: number, py: number): ViewKey | null => {
    const p = picker.current;
    // The menu hangs under the picker on a wide screen and rises over it on a phone.
    const top = wideRef.current ? p.y + PICKER_H + (NAV_H - PICKER_H) / 2 + MENU_GAP : p.y - (BOTTOM_CHROME - PICKER_H) / 2 - MENU_GAP - MENU_H;
    const bottom = top + MENU_H;
    if (px < p.x - SIDE_SLOP || px > p.x + p.w + SIDE_SLOP) return null;
    if (py < top || py > bottom) return null;
    const i = Math.floor((py - top - MENU_PAD + ROW_GAP / 2) / (ROW_H + ROW_GAP));
    return VIEWS[Math.max(0, Math.min(VIEWS.length - 1, i))].key;
  };
  const onPicker = (px: number, py: number) => {
    const p = picker.current;
    return px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { pageX, pageY, locationX, locationY } = e.nativeEvent;
        picker.current = { ...picker.current, x: pageX - locationX, y: pageY - locationY };
        openedNow.current = !openRef.current;
        if (!openRef.current) {
          Haptics.selectionAsync();
          show(true);
        }
      },
      onPanResponderMove: (e) => {
        hovered(rowAt(e.nativeEvent.pageX, e.nativeEvent.pageY));
      },
      onPanResponderRelease: (e) => {
        const { pageX, pageY } = e.nativeEvent;
        const key = rowAt(pageX, pageY);
        if (key) choose(key);
        // A tap that opened the menu leaves it open; anything else closes it.
        else if (!(openedNow.current && onPicker(pageX, pageY))) show(false);
        else hovered(null);
      },
      onPanResponderTerminate: () => show(false),
    }),
  ).current;

  const menuBottom = insets.bottom + BOTTOM_CHROME + MENU_GAP;
  const menuTop = insets.top + NAV_H + MENU_GAP;

  /* Add store data, a sale or churn. Same size and weight as the bell so
     the two strokes match. */
  const plusEl = (
    <Pressable
      hitSlop={10}
      onPress={() => {
        Haptics.selectionAsync();
        show(false);
        setAddOpen(true);
      }}
      style={({ pressed }) => [s.icon, pressed && { opacity: 0.6 }]}
    >
      <SymbolView name="plus" size={22} weight="medium" tintColor="#ffffff" />
    </Pressable>
  );
  const pickerEl = (
    <View
      {...responder.panHandlers}
      onLayout={(e) => {
        const { x, width, height } = e.nativeEvent.layout;
        picker.current = { ...picker.current, w: width, h: height };
        setPickerBox({ x, w: width });
      }}
      style={[s.squircle, wide && s.squircleWide, open && s.squircleOpen]}
    >
      {/* Untouchable, so every touch lands on the squircle itself and
          locationX/Y are measured from its corner, which rowAt relies on. */}
      <View pointerEvents="none" style={s.squircleInner}>
        <Text style={s.squircleText} numberOfLines={1}>
          {label}
        </Text>
        <View style={s.chevron}>
          <SymbolView name={open !== wide ? 'chevron.down' : 'chevron.up'} size={11} weight="semibold" tintColor={C.dim} />
        </View>
      </View>
    </View>
  );
  /* Alerts: opens the full history, grouped by day. */
  const bellEl = (
    <Pressable
      hitSlop={10}
      onPress={() => {
        Haptics.selectionAsync();
        show(false);
        setBellOpen(true);
        markRead();
      }}
      style={({ pressed }) => [s.icon, pressed && { opacity: 0.6 }]}
    >
      <SymbolView name="bell" size={22} weight="medium" tintColor="#ffffff" />
      {unread ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <>
      {open ? (
        <Animated.View entering={FadeIn.duration(90)} exiting={FadeOut.duration(110)} style={[StyleSheet.absoluteFill, s.backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => show(false)} />
        </Animated.View>
      ) : null}
      {open ? (
        /* The bar's own centred column, so the menu sits over the picker at any width. */
        <View pointerEvents="box-none" style={[s.menuRail, wide ? { top: menuTop } : { bottom: menuBottom }]}>
          <View pointerEvents="box-none" style={s.menuColumn}>
            <Animated.View
              entering={wide ? menuInDown : menuIn}
              exiting={menuOut}
              style={[s.menu, { bottom: 0, left: pickerBox.x, width: pickerBox.w || undefined, height: MENU_H }]}
            >
              {Platform.OS === 'ios' ? (
                <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,24,27,0.98)' }]} />
              )}
              {VIEWS.map((v) => {
                const on = !wide && v.key === current;
                const hot = v.key === hover;
                return (
                  <Pressable key={v.key} onPress={() => choose(v.key)} style={[s.option, on && s.optionOn, hot && s.optionHot]}>
                    <Text style={[s.optionText, (on || hot) && { color: C.text }, on && { fontWeight: '700' }]} numberOfLines={1}>
                      {v.label}
                    </Text>
                    {on ? <SymbolView name="checkmark" size={14} weight="bold" tintColor="#ffffff" /> : null}
                  </Pressable>
                );
              })}
            </Animated.View>
          </View>
        </View>
      ) : null}

      <View style={[s.wrap, wide ? { top: 0, height: NAV_H + insets.top, paddingTop: insets.top } : { bottom: 0, height: BOTTOM_CHROME + insets.bottom, paddingBottom: insets.bottom }]}>
        {wide ? (
          // Black glass rather than the phone's grey chrome: still see-through.
          <>
            <BlurView tint="dark" intensity={70} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)' }]} />
          </>
        ) : Platform.OS === 'ios' ? (
          <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,14,0.96)' }]} />
        )}
        <View style={[s.hairline, wide ? { bottom: 0 } : { top: 0 }]} />

        {wide ? (
          /* Wide: the mark and the section jump at the left, the actions at
             the far right. The date lives in the filter bar at the bottom. */
          <View style={[s.bar, s.barWide]}>
            <BrandMark size={20} />
            <View style={s.navRule} />
            {pickerEl}
            <View style={{ flex: 1 }} />
            {bellEl}
            <RefreshButton />
            {plusEl}
          </View>
        ) : (
          <View style={s.bar}>
            {plusEl}
            {pickerEl}
            {bellEl}
          </View>
        )}

        <AddSheet visible={addOpen} onClose={() => setAddOpen(false)} />

        <Sheet visible={bellOpen} onClose={() => setBellOpen(false)} title="Alerts" full bleed>
          {() => <AlertHistory />}
        </Sheet>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', zIndex: 202 },
  hairline: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.hairline },
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, width: '100%' },
  squircle: {
    flex: 1,
    height: PICKER_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  barWide: { gap: 16, paddingHorizontal: 24 },
  navRule: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: 'rgba(255,255,255,0.22)' },
  squircleWide: { flex: 0, width: 230 },
  squircleInner: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  squircleOpen: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.18)' },
  chevron: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  icon: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  /* Above the toasts, which carry a zIndex of their own (up to 100): the
     menu is the thing being used, so nothing sits over it. */
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 200 },
  menuRail: { position: 'absolute', left: 0, right: 0, height: MENU_H, alignItems: 'center', zIndex: 201 },
  menuColumn: { width: '100%', height: MENU_H },
  menu: {
    position: 'absolute',
    padding: MENU_PAD,
    gap: ROW_GAP,
    borderRadius: 18,
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  squircleText: { color: C.text, fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16 },
  option: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  optionOn: { backgroundColor: 'rgba(255,255,255,0.06)' },
  optionHot: { backgroundColor: 'rgba(255,255,255,0.16)' },
  optionText: { color: C.dim, fontSize: 16, fontWeight: '500' },
});
