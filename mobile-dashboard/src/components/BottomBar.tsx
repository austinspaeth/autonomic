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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openPanel, PANELS, setView, usePanel, useView, VIEWS, type ViewKey } from '../lib/views';
import { NAV_H, useLandscape, useWide } from '../lib/wide';
import { C } from '../theme';
import { BrandMark } from './BrandMark';
import { Sheet } from './Sheet';
import { AlertHistory } from './AlertViews';
import { AddSheet } from '../features/AddSheet';
import { useAlerts } from '../lib/alertsStore';
import { useData } from '../lib/data';
import { ago } from '../lib/dates';
import { stepZoom, useZoom, ZOOM_MAX, ZOOM_MIN } from '../lib/zoom';
import { BOTTOM_CHROME } from './ui';

const PICKER_H = 44;
/** Gap between the top of the bar and the bottom of the menu. */
const MENU_GAP = 8;
const MENU_PAD = 6;
const ROW_H = 46;
const ROW_GAP = 4;
const MENU_H = MENU_PAD * 2 + VIEWS.length * ROW_H + (VIEWS.length - 1) * ROW_GAP;
/* On a phone on its side the one-column menu is taller than the screen, so
   it is two columns, filled down the first and then the second. */
const SIDE_ROWS = Math.ceil(VIEWS.length / 2);
const SIDE_COL_W = 190;
const SIDE_MENU_W = MENU_PAD * 2 + SIDE_COL_W * 2 + ROW_GAP;
/** The menu there: as wide as the picker, which fills the bar, but never narrower than two columns need. */
const sideMenuW = (pickerW: number) => Math.max(SIDE_MENU_W, pickerW);
const sideColW = (pickerW: number) => (sideMenuW(pickerW) - MENU_PAD * 2 - ROW_GAP) / 2;
const SIDE_MENU_H = MENU_PAD * 2 + SIDE_ROWS * ROW_H + (SIDE_ROWS - 1) * ROW_GAP;
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

/* A text link in the wide top bar: light grey, white under the pointer and
   while its panel is open. */
function NavLink({ view }: { view: ViewKey }) {
  const [hover, setHover] = useState(false);
  const on = usePanel() === view;
  return (
    <Pressable
      hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onPress={() => {
        Haptics.selectionAsync();
        openPanel(view);
      }}
    >
      {({ pressed }) => <Text style={[s.navLink, (hover || on || pressed) && { color: '#ffffff' }]}>{VIEWS.find((v) => v.key === view)?.label}</Text>}
    </Pressable>
  );
}

/* Zoom the board out and in (the content only: this bar and the filter bar
   are controls and keep their size). The percentage between the two is the
   state, so the buttons are never guessed at. */
function ZoomButtons() {
  const zoom = useZoom();
  const btn = (dir: 1 | -1, name: 'minus.magnifyingglass' | 'plus.magnifyingglass', off: boolean) => (
    <Pressable
      hitSlop={8}
      disabled={off}
      accessibilityLabel={dir > 0 ? 'Zoom in' : 'Zoom out'}
      onPress={() => {
        Haptics.selectionAsync();
        stepZoom(dir);
      }}
      style={({ pressed }) => [s.icon, (pressed || off) && { opacity: off ? 0.3 : 0.6 }]}
    >
      <SymbolView name={name} size={20} weight="medium" tintColor="#ffffff" />
    </Pressable>
  );
  return (
    <View style={s.zoom}>
      {btn(-1, 'minus.magnifyingglass', zoom <= ZOOM_MIN)}
      <Text style={s.zoomText}>{Math.round(zoom * 100)}%</Text>
      {btn(1, 'plus.magnifyingglass', zoom >= ZOOM_MAX)}
    </View>
  );
}

/* How fresh the numbers are, beside the refresh button it belongs to. On a
   phone this is a row at the top of the page; here that row would cost the
   board a line of height. */
function Updated() {
  const { snap, loading } = useData();
  return <Text style={s.updated}>{loading ? 'Updating…' : snap ? `Updated ${ago(snap.at)}` : 'Loading…'}</Text>;
}

export function BottomBar({
  date,
  filter,
}: {
  /** A phone on its side: the date control, at the left end of the bar. */
  date?: ReactNode;
  /** A phone on its side: the filter bar, at the right end. */
  filter?: ReactNode;
} = {}) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const landscape = useLandscape();
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const sideRef = useRef(landscape);
  sideRef.current = landscape;
  const current = useView();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<ViewKey | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerBox, setPickerBox] = useState({ x: 0, w: 0 });
  const { markRead } = useAlerts();
  const label = VIEWS.find((v) => v.key === current)?.label ?? '';

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

  /** The row under a page point, or null. Rows run top to bottom in VIEWS
   *  order (down the first column and then the second, on a phone on its side). */
  const rowAt = (px: number, py: number): ViewKey | null => {
    const p = picker.current;
    const side = sideRef.current;
    const menuH = side ? SIDE_MENU_H : MENU_H;
    const menuW = side ? sideMenuW(p.w) : p.w;
    const rows = side ? SIDE_ROWS : VIEWS.length;
    // The menu hangs under the picker on a wide screen and rises over it on a phone.
    const top = wideRef.current ? p.y + PICKER_H + (NAV_H - PICKER_H) / 2 + MENU_GAP : p.y - (BOTTOM_CHROME - PICKER_H) / 2 - MENU_GAP - menuH;
    const bottom = top + menuH;
    if (px < p.x - SIDE_SLOP || px > p.x + menuW + SIDE_SLOP) return null;
    if (py < top || py > bottom) return null;
    const row = Math.max(0, Math.min(rows - 1, Math.floor((py - top - MENU_PAD + ROW_GAP / 2) / (ROW_H + ROW_GAP))));
    const col = side && px > p.x + MENU_PAD + sideColW(p.w) + ROW_GAP / 2 ? 1 : 0;
    return VIEWS[Math.min(VIEWS.length - 1, col * rows + row)].key;
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
      style={[s.squircle, wide && s.squircleWide, landscape && s.squircleSide, open && s.squircleOpen]}
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
      {/* No count on it: the history behind it is the record, and a number
          that only ever grows is not information. */}
      <SymbolView name="bell" size={22} weight="medium" tintColor="#ffffff" />
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
        <View pointerEvents="box-none" style={[s.menuRail, wide ? { top: menuTop } : { bottom: menuBottom }, landscape && { height: SIDE_MENU_H }]}>
          <View pointerEvents="box-none" style={[s.menuColumn, landscape && { height: SIDE_MENU_H }]}>
            <Animated.View
              entering={wide ? menuInDown : menuIn}
              exiting={menuOut}
              style={[
                s.menu,
                landscape
                  ? [s.menuSide, { bottom: 0, left: pickerBox.x, width: sideMenuW(pickerBox.w), height: SIDE_MENU_H }]
                  : { bottom: 0, left: pickerBox.x, width: pickerBox.w || undefined, height: MENU_H },
              ]}
            >
              {Platform.OS === 'ios' ? (
                <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,24,27,0.98)' }]} />
              )}
              {VIEWS.map((v) => {
                const on = v.key === current;
                const hot = v.key === hover;
                return (
                  <Pressable key={v.key} onPress={() => choose(v.key)} style={[s.option, landscape && { width: sideColW(pickerBox.w) }, on && s.optionOn, hot && s.optionHot]}>
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
          /* Wide: the mark, then a text link for each view that opens as a
             side panel (everything else is on the board), and the actions at
             the far right. The date lives in the filter bar at the bottom. */
          <View style={[s.bar, s.barWide]}>
            <BrandMark size={20} />
            <View style={s.navRule} />
            {PANELS.map((key) => (
              <NavLink key={key} view={key} />
            ))}
            <View style={{ flex: 1 }} />
            <Updated />
            <ZoomButtons />
            <View style={s.navRule} />
            {bellEl}
            <RefreshButton />
            {plusEl}
          </View>
        ) : landscape ? (
          /* On its side: the view and what it is filtered to, side by side
             from the left, in one band. The alerts are always on screen in their own
             panel (`AlertsPanel`), so the bell has nothing to open, and
             adding data is a portrait job. */
          <View style={[s.bar, { paddingLeft: 18 + insets.left, paddingRight: 18 + insets.right }]}>
            {date}
            {pickerEl}
            {filter}
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
  navLink: { color: C.dim, fontSize: 15, fontWeight: '600', marginHorizontal: 4 },
  zoom: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  zoomText: { color: C.dim, fontSize: 12, fontWeight: '600', width: 40, textAlign: 'center', fontVariant: ['tabular-nums'] },
  updated: { color: C.muted, fontSize: 12, marginRight: 4 },
  navRule: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: 'rgba(255,255,255,0.22)' },
  squircleWide: { flex: 0, width: 230 },
  /* Room for the longest view name beside its chevron, with the filter straight after it. */
  squircleSide: { flex: 0, width: 220 },
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
  /* Two columns, filled down the first: a column-direction wrap. */
  menuSide: { flexDirection: 'column', flexWrap: 'wrap', columnGap: ROW_GAP },
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
