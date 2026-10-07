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
import { useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setView, useView, VIEWS, type ViewKey } from '../lib/views';
import { C } from '../theme';
import { Sheet } from './Sheet';
import { AlertHistory } from './AlertViews';
import { AddSheet } from '../features/AddSheet';
import { useAlerts } from '../lib/alertsStore';
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

type Rect = { x: number; y: number; w: number; h: number };

export function BottomBar() {
  const insets = useSafeAreaInsets();
  const current = useView();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<ViewKey | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerBox, setPickerBox] = useState({ x: 0, w: 0 });
  const { unread, markRead } = useAlerts();
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

  /** The row under a page point, or null. Rows run top to bottom in VIEWS order. */
  const rowAt = (px: number, py: number): ViewKey | null => {
    const p = picker.current;
    const bottom = p.y - (BOTTOM_CHROME - PICKER_H) / 2 - MENU_GAP;
    const top = bottom - MENU_H;
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

  return (
    <>
      {open ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, s.backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => show(false)} />
        </Animated.View>
      ) : null}
      {open ? (
        <Animated.View
          entering={SlideInDown.springify().damping(22).stiffness(260)}
          exiting={SlideOutDown.duration(160)}
          style={[s.menu, { bottom: menuBottom, left: pickerBox.x, width: pickerBox.w || undefined, height: MENU_H }]}
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
              <Pressable key={v.key} onPress={() => choose(v.key)} style={[s.option, on && s.optionOn, hot && s.optionHot]}>
                <Text style={[s.optionText, (on || hot) && { color: C.text }, on && { fontWeight: '700' }]} numberOfLines={1}>
                  {v.label}
                </Text>
                {on ? <SymbolView name="checkmark" size={14} weight="bold" tintColor={C.accent} /> : null}
              </Pressable>
            );
          })}
        </Animated.View>
      ) : null}

      <View style={[s.wrap, { height: BOTTOM_CHROME + insets.bottom, paddingBottom: insets.bottom }]}>
        {Platform.OS === 'ios' ? (
          <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,14,0.96)' }]} />
        )}
        <View style={s.hairline} />

        <View style={s.bar}>
          {/* Add store data, a sale or churn. Same size and weight as the bell so
              the two strokes match. */}
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
          <View
            {...responder.panHandlers}
            onLayout={(e) => {
              const { x, width, height } = e.nativeEvent.layout;
              picker.current = { ...picker.current, w: width, h: height };
              setPickerBox({ x, w: width });
            }}
            style={[s.squircle, open && s.squircleOpen]}
          >
            {/* Untouchable, so every touch lands on the squircle itself and
                locationX/Y are measured from its corner, which rowAt relies on. */}
            <View pointerEvents="none" style={s.squircleInner}>
              <Text style={s.squircleText} numberOfLines={1}>
                {label}
              </Text>
              <View style={s.chevron}>
                <SymbolView name={open ? 'chevron.down' : 'chevron.up'} size={11} weight="semibold" tintColor={C.dim} />
              </View>
            </View>
          </View>
          {/* Alerts: opens the full history, grouped by day. */}
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
        </View>

        <AddSheet visible={addOpen} onClose={() => setAddOpen(false)} />

        <Sheet visible={bellOpen} onClose={() => setBellOpen(false)} title="Alerts" full>
          {() => <AlertHistory />}
        </Sheet>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.hairline },
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 },
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
  squircleInner: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  squircleOpen: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.18)' },
  chevron: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  icon: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.35)' },
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
