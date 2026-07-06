/**
 * Breathing visualizer — concentric hollow rings that glow outward toward the
 * surrounding progress ring on the inhale and drain back to the middle on the
 * exhale, paced to the chosen pattern (e.g. 4/6 = 4s out, 6s back) with an eased
 * sine curve. Driven by Reanimated on the UI thread so it never stutters; a
 * gentle haptic ticks at each phase change and the phase is reported upward so
 * the caller can label it beside the timer.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedProps,
  useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { usePalette } from '../../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RINGS = 6;
const SIZE = 190;
const CENTER = SIZE / 2;
const INNER_R = 14;   // smallest ring
const OUTER_R = 84;   // largest ring — sits just inside the progress ring

export function BreathingViz({ inhaleSec, exhaleSec, running, onPhase }: {
  inhaleSec: number; exhaleSec: number; running: boolean; onPhase?: (p: 'in' | 'out') => void;
}) {
  const p = usePalette();
  // progress: 0 (exhaled, glow at center) -> 1 (inhaled, glow reaching the outer ring)
  const progress = useSharedValue(0);

  const tick = (ph: 'in' | 'out') => {
    onPhase?.(ph);
    Haptics.impactAsync(ph === 'in' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  useEffect(() => {
    if (!running) { cancelAnimation(progress); progress.value = 0; return; }
    const inhale = withTiming(1, { duration: inhaleSec * 1000, easing: Easing.inOut(Easing.sin) }, (fin) => { if (fin) runOnJS(tick)('out'); });
    const exhale = withTiming(0, { duration: exhaleSec * 1000, easing: Easing.inOut(Easing.sin) }, (fin) => { if (fin) runOnJS(tick)('in'); });
    runOnJS(tick)('in');
    progress.value = withRepeat(withSequence(inhale, exhale), -1, false);
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, inhaleSec, exhaleSec]);

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE}>
        {Array.from({ length: RINGS }).map((_, i) => {
          const r = INNER_R + (OUTER_R - INNER_R) * (i / (RINGS - 1));
          return <Ring key={i} index={i} radius={r} progress={progress} accent={p.accent} track={p.border} />;
        })}
      </Svg>
    </View>
  );
}

function Ring({ index, radius, progress, accent, track }: {
  index: number; radius: number; progress: Animated.SharedValue<number>; accent: string; track: string;
}) {
  // Ring i lights as `progress` climbs past its threshold (innermost first), so
  // the glow blooms outward on inhale and retreats inward on exhale.
  const threshold = (index + 1) / RINGS;
  const animatedProps = useAnimatedProps(() => {
    const near = interpolate(progress.value, [threshold - 1 / RINGS, threshold], [0, 1], 'clamp');
    return { opacity: 0.12 + near * 0.88, strokeWidth: 2 + near * 3 };
  });
  return (
    <>
      <Circle cx={CENTER} cy={CENTER} r={radius} stroke={track} strokeWidth={2} fill="none" opacity={0.35} />
      <AnimatedCircle cx={CENTER} cy={CENTER} r={radius} stroke={accent} fill="none" animatedProps={animatedProps} />
    </>
  );
}
