/**
 * The top bar of a step-by-step card inside a sheet: a back arrow and the
 * welcome wizard's progress pills (the active step stretches from a dot into a
 * pill, completed steps stay dots tinted red). Lifted out of the camera setup
 * card so every walkthrough in a sheet wears the same one.
 *
 * The back arrow wears the same tinted-glass pill as the sheet's floating ✕;
 * the negative margins pull the bar out of the content box onto the sheet's own
 * 14/10 inset so the two circles sit on one line. The bar therefore spans
 * pill-to-pill, and the dots ride an absolute layer across its full width so
 * they center on the card, not in the gap left over between the two buttons.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SheetPill, SheetPillButton } from './Sheet';
import { ACCENT } from '../theme';

/** Sheet content is inset 18/24 (padding/topPad); its floating ✕ pill sits at
 *  14/10 on the sheet itself. Keep in sync with Sheet.tsx's headerPill. */
const BAR_INSET = 18 - 14;
const BAR_LIFT = 24 - 10;
/** Pill height: 36px button + 6px padding + 1px border, both sides. */
const BAR_H = 36 + (6 + 1) * 2;
/** Opacity of the back arrow on step 1, where there's nothing to go back to. */
const BACK_GHOST = 0.22;

export function StepDot({ i, step }: { i: number; step: number }) {
  const target = i === step ? 1 : i < step ? 0.5 : 0;
  const t = useSharedValue(target);
  useEffect(() => { t.value = withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) }); }, [target, t]);
  const style = useAnimatedStyle(() => ({
    width: 6 + 28 * Math.max(0, t.value - 0.5),
    backgroundColor: interpolateColor(t.value, [0, 0.5, 1], ['rgba(255,255,255,0.12)', 'rgba(224,49,39,0.40)', ACCENT]),
  }));
  return <Animated.View style={[{ height: 6, borderRadius: 999 }, style]} />;
}

export function WizardBar({ count, index, onBack }: { count: number; index: number; onBack: () => void }) {
  return (
    <View style={{ height: BAR_H, marginTop: -BAR_LIFT, marginHorizontal: -BAR_INSET, marginBottom: 12, justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }}>
        {Array.from({ length: count }, (_, i) => <StepDot key={i} i={i} step={index} />)}
      </View>
      {/* Ghosted rather than hidden on step 1: nothing to go back to, but the
          bar keeps its shape. */}
      <SheetPill lone style={{ alignSelf: 'flex-start', opacity: index <= 0 ? BACK_GHOST : 1 }}>
        <SheetPillButton icon="chevronLeft" size={18} onPress={onBack} label="Back" disabled={index <= 0} />
      </SheetPill>
    </View>
  );
}
