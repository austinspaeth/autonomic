// Sheet — one stacked bottom sheet. Ports the legacy .modal behaviour
// (docs/index.html:585-624, 1894-1958): slide-up with bounce, the sheet beneath
// scales + lifts (.behind), ✕ top-right, optional header action, drag-to-dismiss.
// All motion runs on the UI thread via Reanimated for 60fps.
import React, { useEffect } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { type SheetApi, type SheetEntry, closeSheet, closeAllSheets, removeSheet } from './useSheets';

const SLIDE_IN = Easing.bezier(0.34, 1.25, 0.5, 1); // bouncy (legacy slideup)
const SLIDE_OUT = Easing.bezier(0.4, 0, 1, 1); // legacy slidedown
const BEHIND = Easing.bezier(0.32, 0.72, 0, 1);

export function Sheet({
  entry,
  isTop,
  index,
}: {
  entry: SheetEntry;
  isTop: boolean;
  index: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: H, width: W } = useWindowDimensions();

  const ty = useSharedValue(H); // enter/exit offset
  const drag = useSharedValue(0); // drag-to-dismiss offset
  const lift = useSharedValue(0); // .behind translateY
  const scale = useSharedValue(1); // .behind scale
  const backdrop = useSharedValue(0);

  // Enter on mount.
  useEffect(() => {
    ty.value = withTiming(0, { duration: 420, easing: SLIDE_IN });
    backdrop.value = withTiming(1, { duration: 300 });
  }, [ty, backdrop]);

  // Scale/lift the sheet when it is no longer the top of the stack.
  useEffect(() => {
    const opts = { duration: 360, easing: BEHIND };
    lift.value = withTiming(isTop ? 0 : -10, opts);
    scale.value = withTiming(isTop ? 1 : 0.94, opts);
  }, [isTop, lift, scale]);

  // Exit when marked closing.
  useEffect(() => {
    if (!entry.closing) return;
    backdrop.value = withTiming(0, { duration: 260 });
    ty.value = withTiming(H, { duration: 300, easing: SLIDE_OUT }, (finished) => {
      if (finished) runOnJS(removeSheet)(entry.id);
    });
  }, [entry.closing, entry.id, ty, backdrop, H]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value + lift.value + drag.value }, { scale: scale.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  // Drag-to-dismiss from the header grab area.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 800) {
        drag.value = withTiming(0, { duration: 0 });
        runOnJS(closeSheet)();
      } else {
        drag.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const api: SheetApi = { close: closeSheet, closeAll: closeAllSheets };
  const maxW = t.maxw;
  const cardWidth = Math.min(W, maxW);

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 + index }}
      pointerEvents="box-none"
    >
      {/* Backdrop (tap to close). Only the top sheet's backdrop is interactive. */}
      <Animated.View
        pointerEvents={isTop ? 'auto' : 'none'}
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
          backdropStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={() => closeSheet()} accessibilityLabel="Close" />
      </Animated.View>

      {/* Card */}
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }} pointerEvents="box-none">
        <Animated.View
          style={[
            {
              width: cardWidth,
              height: H * 0.9,
              backgroundColor: t.surface,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 18,
              overflow: 'hidden',
              ...t.shadow,
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.25,
              shadowRadius: 40,
            },
            cardStyle,
          ]}
        >
          {/* Grab area for drag-to-dismiss (sits under the close button). */}
          <GestureDetector gesture={pan}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, zIndex: 1 }} />
          </GestureDetector>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: 20,
              paddingBottom: entry.options?.footer ? 118 : 22 + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
          >
            {entry.render(api)}
          </ScrollView>

          {/* Header action (left of ✕) */}
          {entry.options?.action ? (
            <Pressable
              onPress={entry.options.action.onPress}
              accessibilityLabel={entry.options.action.label ?? 'Action'}
              style={{
                position: 'absolute',
                top: 16,
                right: 54,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
            >
              <Icon name={entry.options.action.icon} size={17} color={t.textDim} />
            </Pressable>
          ) : null}

          {/* Close ✕ */}
          <Pressable
            onPress={() => closeSheet()}
            accessibilityLabel="Close"
            style={{
              position: 'absolute',
              top: 16,
              right: 14,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: t.surface2,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            <Icon name="x" size={19} color={t.textDim} />
          </Pressable>

          {/* Pinned blurred footer */}
          {entry.options?.footer ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
              {entry.options.footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}
