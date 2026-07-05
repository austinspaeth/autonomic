/**
 * Breathing visualizer — a vertical "volume-bar with lines" that fills upward on
 * inhale and drains on exhale, paced to the chosen pattern (e.g. 4/6 = 4s up,
 * 6s down) with an eased curve. An accent bloom behind it intensifies on inhale.
 * Driven by Reanimated on the UI thread so it never stutters; a gentle haptic
 * ticks at each phase change and "Breathe in / out" tracks the phase.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedStyle,
  useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { ACCENT } from '../../theme';

const SEGMENTS = 16;

export function BreathingViz({ inhaleSec, exhaleSec, running }: { inhaleSec: number; exhaleSec: number; running: boolean }) {
  // progress: 0 (empty, exhaled) -> 1 (full, inhaled)
  const progress = useSharedValue(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  const tick = (p: 'in' | 'out') => {
    setPhase(p);
    Haptics.impactAsync(p === 'in' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  useEffect(() => {
    if (!running) { cancelAnimation(progress); return; }
    const inhale = withTiming(1, { duration: inhaleSec * 1000, easing: Easing.inOut(Easing.sin) }, (fin) => { if (fin) runOnJS(tick)('out'); });
    const exhale = withTiming(0, { duration: exhaleSec * 1000, easing: Easing.inOut(Easing.sin) }, (fin) => { if (fin) runOnJS(tick)('in'); });
    runOnJS(tick)('in');
    progress.value = withRepeat(withSequence(inhale, exhale), -1, false);
    return () => cancelAnimation(progress);
  }, [running, inhaleSec, exhaleSec, progress]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.12, 0.55]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.7, 1.25]) }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
      <View style={styles.bar}>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <Segment key={i} index={i} total={SEGMENTS} progress={progress} />
        ))}
      </View>
      <Text style={styles.phaseText}>{phase === 'in' ? 'Breathe in' : 'Breathe out'}</Text>
    </View>
  );
}

function Segment({ index, total, progress }: { index: number; total: number; progress: Animated.SharedValue<number> }) {
  // Segment i (0 = bottom) lights when progress passes its threshold.
  const threshold = (index + 1) / total;
  const style = useAnimatedStyle(() => {
    const on = progress.value >= threshold - 1e-3;
    const near = interpolate(progress.value, [threshold - 1 / total, threshold], [0, 1], 'clamp');
    return {
      opacity: on ? 1 : 0.12 + near * 0.4,
      backgroundColor: ACCENT,
      transform: [{ scaleX: on ? 1 : 0.82 + near * 0.18 }],
    };
  });
  return <Animated.View style={[styles.segment, style]} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', height: 360 },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: ACCENT },
  bar: { height: 300, width: 96, flexDirection: 'column-reverse', justifyContent: 'flex-start', gap: 4 },
  segment: { height: 14, borderRadius: 4 },
  phaseText: { marginTop: 20, color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 0.3 },
});
