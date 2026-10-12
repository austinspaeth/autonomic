/* A modal CARD that rises from the bottom of the device, in the main app's
   sheet pattern (mobile/src/components/Sheet.tsx): full width, flush with the
   bottom edge, only its top corners rounded, sized to its content (or, `full`,
   as tall as the main app's sheets: 92% of the screen, never under the status
   bar). Tap the backdrop or the ✕ to close.

   The card is dark GLASS: a blur under a near-black tint, darker than the
   bottom bar but still letting a little of the screen through. The backdrop
   dims only lightly so the blur has something to show. Android gets a
   near-opaque tint, since its blur is costly and inconsistent.

   The keyboard: a card sized to its content sits exactly where the keyboard
   comes up, so it is LIFTED above it (and shrunk to the room left), its
   content scrolls, and the focused field is scrolled clear of the keyboard's
   edge. A `full` card brings its own scroll view, which insets itself.

   Closing animates out first and only then tells the parent, because an RN
   Modal unmounts instantly and would cut the exit off. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type KeyboardEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { BoardWidth, PANEL_W, WIDE_FROM } from '../lib/wide';
import { C } from '../theme';

export function Sheet({
  visible,
  onClose,
  title,
  full,
  bleed,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fill the screen down from just under the status bar; the content gets `flex: 1` to scroll in. */
  full?: boolean;
  /** The content runs to the bottom edge of the device and pads its own home-indicator inset, so a list scrolls under it instead of stopping short. */
  bleed?: boolean;
  /** Receives `close`, which animates the card out before `onClose` runs. */
  children: (close: () => void) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  /* Wide (iPad, Mac): the same sheet is a panel that slides in from the right
     over a darkened screen, on a plain ease with no bounce. */
  const wide = winW >= WIDE_FROM;
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(600);
  const t = useSharedValue(0);

  /* The keyboard's height while it is up, and the content's scroll view. */
  const [kb, setKb] = useState(0);
  const body = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  useEffect(() => {
    if (!mounted || full) return;
    const rise = (e: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(e);
      setKb(e.endCoordinates.height);
    };
    const fall = (e: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(e);
      setKb(0);
    };
    /* Fires again each time focus moves to another field, so this also
       follows the cursor down a form. */
    const reveal = (e: KeyboardEvent) => {
      const input = TextInput.State.currentlyFocusedInput();
      input?.measureInWindow((_x, y, _w, h) => {
        const over = y + h + 16 - e.endCoordinates.screenY;
        if (over > 0) body.current?.scrollTo({ y: scrollY.current + over, animated: true });
      });
    };
    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', rise),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', fall),
      Keyboard.addListener('keyboardDidShow', reveal),
    ];
    return () => {
      subs.forEach((x) => x.remove());
      setKb(0);
    };
  }, [mounted, full]);
  /* A content-sized card's children, scrollable: it only scrolls once the
     card has hit its ceiling (a long form, or the keyboard taking the room). */
  const scrolling = (node: ReactNode, fill?: boolean) => (
    <ScrollView
      ref={body}
      style={fill ? { flex: 1 } : { flexGrow: 0, flexShrink: 1 }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets={fill}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={32}
      onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
    >
      {node}
    </ScrollView>
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      t.value = wideRef.current ? withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }) : withSpring(1, { damping: 22, stiffness: 220, mass: 0.9 });
    }
  }, [visible, t]);

  /* The latest onClose, always: `close` is handed to the card's children and
     can be called from a render that predates the parent's newest state. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const finish = () => {
    setMounted(false);
    onCloseRef.current();
  };
  const close = () => {
    t.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }, (done) => {
      if (done) runOnJS(finish)();
    });
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value) * (wide ? 0.55 : 0.35) }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - t.value) * (PANEL_W + 40) }] }));
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - t.value) * (height + 40) }] }));

  if (!mounted) return null;
  if (wide) {
    return (
      <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>
        <View style={s.side} pointerEvents="box-none">
          <Animated.View style={[s.panel, { width: Math.min(PANEL_W, winW), paddingTop: insets.top + 18, paddingBottom: bleed ? 0 : 24 + insets.bottom }, panel]}>
            <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
            <View pointerEvents="none" style={s.panelEdge} />
            <View style={s.head}>
              <Text style={s.title}>{title}</Text>
              <Pressable onPress={close} hitSlop={10} style={s.close}>
                <SymbolView name="xmark" size={14} weight="bold" tintColor={C.dim} />
              </Pressable>
            </View>
            {/* The panel is full height either way, so a content-sized card's
                form scrolls in it and insets itself by the keyboard. */}
            <BoardWidth.Provider value={null}>
              <View style={{ flex: 1 }}>{full ? children(close) : scrolling(children(close), true)}</View>
            </BoardWidth.Provider>
          </Animated.View>
        </View>
      </Modal>
    );
  }
  const ceiling = Math.min(winH * 0.92, winH - insets.top - 8);
  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <View style={[s.anchor, { paddingBottom: kb }]} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[
            s.card,
            { paddingBottom: bleed ? 0 : kb ? 16 : 24 + insets.bottom },
            full ? { height: ceiling } : { maxHeight: Math.max(160, Math.min(ceiling, winH - insets.top - 8 - kb)) },
            card,
          ]}
        >
          {Platform.OS === 'ios' ? (
            <>
              <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,14,16,0.97)' }]} />
          )}
          <View pointerEvents="none" style={s.edge} />
          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={close} hitSlop={10} style={s.close}>
              <SymbolView name="xmark" size={14} weight="bold" tintColor={C.dim} />
            </Pressable>
          </View>
          {full ? <View style={{ flex: 1 }}>{children(close)}</View> : scrolling(children(close))}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* Over the blur: dark enough to read as darker than the bottom bar's chrome
   material, light enough that the screen behind still shows through. */
const GLASS_TINT = 'rgba(8,8,10,0.72)';

const s = StyleSheet.create({
  side: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  panel: { height: '100%', overflow: 'hidden', paddingHorizontal: 18 },
  panelEdge: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  /* Faint, but there: the edge is what says this is a card and not the page.
     Drawn as its own layer OVER the blur, because a border on the clipping
     view is painted under the blur fill and vanishes around the rounded
     corners. It runs past the bottom edge so only the top and sides show. */
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -2,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: C.text, fontSize: 21, fontWeight: '700' },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
