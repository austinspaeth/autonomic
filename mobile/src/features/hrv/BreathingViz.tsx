/**
 * Breathing visualizer — concentric hollow rings that glow outward toward the
 * surrounding progress ring on the inhale and drain back to the middle on the
 * exhale, paced to the chosen pattern with an eased sine curve. Patterns may
 * include holds (box breathing, 4-7-8): while you hold, the rings brighten —
 * the stroke warms toward a hotter red and thickens — then ease back to their
 * resting colour through the following exhale (or inhale, after a bottom
 * hold). Ring position runs on the UI thread via Reanimated; the phase clock
 * is a JS timer that re-targets the shared values at each phase boundary, so
 * a gentle haptic can tick alongside and the phase is reported upward for the
 * label beside the timer.
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing, cancelAnimation, interpolate, interpolateColor, useAnimatedProps,
  useSharedValue, withTiming,
} from 'react-native-reanimated';
import { usePalette } from '../../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RINGS = 6;
const SIZE = 190;
const CENTER = SIZE / 2;
const INNER_R = 14;   // smallest ring
const OUTER_R = 84;   // largest ring — sits just inside the progress ring
const GLOW_ACCENT = '#ff6a55'; // hold-brightened stroke (accent warmed toward white)

export type BreathPhase = 'in' | 'holdIn' | 'out' | 'holdOut';

export interface BreathPattern { inhale: number; holdIn: number; exhale: number; holdOut: number }

/** "4/6" → in/out · "4/7/8" → in/hold/out · "4/4/4/4" → in/hold/out/hold. */
export function parsePattern(style?: string): BreathPattern {
  const parts = (style || '4/6').split('/').map(Number).filter((n) => !isNaN(n) && n > 0);
  if (parts.length >= 4) return { inhale: parts[0], holdIn: parts[1], exhale: parts[2], holdOut: parts[3] };
  if (parts.length === 3) return { inhale: parts[0], holdIn: parts[1], exhale: parts[2], holdOut: 0 };
  return { inhale: parts[0] || 4, holdIn: 0, exhale: parts[1] || 6, holdOut: 0 };
}

const PHASE_HAPTIC: Record<BreathPhase, Haptics.ImpactFeedbackStyle> = {
  in: Haptics.ImpactFeedbackStyle.Medium,
  out: Haptics.ImpactFeedbackStyle.Light,
  holdIn: Haptics.ImpactFeedbackStyle.Soft,
  holdOut: Haptics.ImpactFeedbackStyle.Soft,
};

export function BreathingViz({ pattern, running, onPhase, frozenProgress, frozenGlow = 0 }: {
  pattern: BreathPattern; running: boolean; onPhase?: (p: BreathPhase) => void;
  /** Screenshot/preview mode: render the rings statically at this progress
   *  (0 exhaled → 1 inhale peak) with no animation, ignoring `running`. */
  frozenProgress?: number; frozenGlow?: number;
}) {
  const p = usePalette();
  // progress: 0 (exhaled, glow at center) -> 1 (inhaled, glow reaching the outer ring)
  const progress = useSharedValue(0);
  // glow: 0 (resting colour) -> 1 (hold brightening)
  const glow = useSharedValue(0);
  const onPhaseRef = useRef(onPhase); onPhaseRef.current = onPhase;

  useEffect(() => {
    if (frozenProgress != null) return; // static render — no clock, no animation
    if (!running) {
      cancelAnimation(progress); cancelAnimation(glow);
      progress.value = 0; glow.value = 0;
      return;
    }
    const phases = ([
      { key: 'in', dur: pattern.inhale },
      { key: 'holdIn', dur: pattern.holdIn },
      { key: 'out', dur: pattern.exhale },
      { key: 'holdOut', dur: pattern.holdOut },
    ] as { key: BreathPhase; dur: number }[]).filter((ph) => ph.dur > 0);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let i = 0;
    const step = () => {
      if (!alive) return;
      const ph = phases[i % phases.length];
      i++;
      onPhaseRef.current?.(ph.key);
      Haptics.impactAsync(PHASE_HAPTIC[ph.key]).catch(() => {});
      const ms = ph.dur * 1000;
      if (ph.key === 'in') {
        progress.value = withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) });
        // After a bottom hold the brightening releases through the inhale.
        glow.value = withTiming(0, { duration: ms, easing: Easing.out(Easing.quad) });
      } else if (ph.key === 'out') {
        progress.value = withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) });
        // "...then go back to their original colour as you exhale."
        glow.value = withTiming(0, { duration: ms, easing: Easing.out(Easing.quad) });
      } else {
        // Hold: position stays put while the rings brighten over the hold.
        glow.value = withTiming(1, { duration: ms, easing: Easing.inOut(Easing.quad) });
      }
      timer = setTimeout(step, ms);
    };
    step();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      cancelAnimation(progress); cancelAnimation(glow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, pattern.inhale, pattern.holdIn, pattern.exhale, pattern.holdOut]);

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE}>
        {Array.from({ length: RINGS }).map((_, i) => {
          const r = INNER_R + (OUTER_R - INNER_R) * (i / (RINGS - 1));
          if (frozenProgress != null) return <StaticRing key={i} index={i} radius={r} progress={frozenProgress} glow={frozenGlow} accent={p.accent} track={p.border} />;
          return <Ring key={i} index={i} radius={r} progress={progress} glow={glow} accent={p.accent} track={p.border} />;
        })}
      </Svg>
    </View>
  );
}

/** Two-hex lerp (#rrggbb), for the frozen hold-glow tint. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0'));
  return `#${c.join('')}`;
}

/** Non-animated twin of `Ring` — same opacity/width/colour formula frozen at a
 *  given progress + glow. Used by the screenshot scenes. */
function StaticRing({ index, radius, progress, glow, accent, track }: {
  index: number; radius: number; progress: number; glow: number; accent: string; track: string;
}) {
  const threshold = (index + 1) / RINGS;
  const near = Math.max(0, Math.min(1, (progress - (threshold - 1 / RINGS)) / (1 / RINGS)));
  const opacity = Math.min(1, 0.12 + near * 0.88 + glow * 0.22);
  const strokeWidth = 2 + near * 3 + glow * 1.4;
  const stroke = glow > 0 ? lerpHex(accent, GLOW_ACCENT, glow) : accent;
  return (
    <>
      <Circle cx={CENTER} cy={CENTER} r={radius} stroke={track} strokeWidth={2} fill="none" opacity={0.35} />
      <Circle cx={CENTER} cy={CENTER} r={radius} stroke={stroke} strokeWidth={strokeWidth} fill="none" opacity={opacity} />
    </>
  );
}

function Ring({ index, radius, progress, glow, accent, track }: {
  index: number; radius: number; progress: Animated.SharedValue<number>;
  glow: Animated.SharedValue<number>; accent: string; track: string;
}) {
  // Ring i lights as `progress` climbs past its threshold (innermost first), so
  // the glow blooms outward on inhale and retreats inward on exhale. During a
  // hold, `glow` warms the stroke colour, thickens it, and lifts the base
  // opacity a touch — visible even at the exhaled (bottom-hold) position.
  const threshold = (index + 1) / RINGS;
  const animatedProps = useAnimatedProps(() => {
    const near = interpolate(progress.value, [threshold - 1 / RINGS, threshold], [0, 1], 'clamp');
    return {
      opacity: Math.min(1, 0.12 + near * 0.88 + glow.value * 0.22),
      strokeWidth: 2 + near * 3 + glow.value * 1.4,
      stroke: interpolateColor(glow.value, [0, 1], [accent, GLOW_ACCENT]),
    };
  });
  return (
    <>
      <Circle cx={CENTER} cy={CENTER} r={radius} stroke={track} strokeWidth={2} fill="none" opacity={0.35} />
      <AnimatedCircle cx={CENTER} cy={CENTER} r={radius} stroke={accent} fill="none" animatedProps={animatedProps} />
    </>
  );
}
