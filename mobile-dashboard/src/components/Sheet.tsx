/* A modal CARD that rises from the bottom of the device, in the main app's
   sheet pattern (mobile/src/components/Sheet.tsx): full width, flush with the
   bottom edge, only its top corners rounded, sized to its content (or, `full`,
   as tall as the main app's sheets: 92% of the screen, never under the status
   bar). Tap the backdrop or the ✕ to close.

   The card is dark GLASS: a blur under a near-black tint, darker than the
   bottom bar but still letting a little of the screen through. The backdrop
   dims only lightly so the blur has something to show. Android gets a
   near-opaque tint, since its blur is costly and inconsistent.

   Closing animates out first and only then tells the parent, because an RN
   Modal unmounts instantly and would cut the exit off. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { C } from '../theme';

export function Sheet({
  visible,
  onClose,
  title,
  full,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fill the screen down from just under the status bar; the content gets `flex: 1` to scroll in. */
  full?: boolean;
  /** Receives `close`, which animates the card out before `onClose` runs. */
  children: (close: () => void) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState(600);
  const t = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      t.value = withSpring(1, { damping: 22, stiffness: 220, mass: 0.9 });
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

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value) * 0.35 }));
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - t.value) * (height + 40) }] }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <View style={s.anchor} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[
            s.card,
            { paddingBottom: 24 + insets.bottom },
            full ? { height: Math.min(winH * 0.92, winH - insets.top - 8) } : { maxHeight: Math.min(winH * 0.92, winH - insets.top - 8) },
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
          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            <Pressable onPress={close} hitSlop={10} style={s.close}>
              <SymbolView name="xmark" size={14} weight="bold" tintColor={C.dim} />
            </Pressable>
          </View>
          {full ? <View style={{ flex: 1 }}>{children(close)}</View> : children(close)}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* Over the blur: dark enough to read as darker than the bottom bar's chrome
   material, light enough that the screen behind still shows through. */
const GLASS_TINT = 'rgba(8,8,10,0.72)';

const s = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  card: {
    overflow: 'hidden',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
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
