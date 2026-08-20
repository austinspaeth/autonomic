/**
 * Breathing visualizer — concentric hollow rings that glow outward toward the
 * surrounding progress ring on the inhale and drain back to the middle on the
 * exhale, paced to the chosen pattern with an eased sine curve. Patterns may
 * include holds (box breathing, 4/7/8): while you hold, the rings brighten —
 * the stroke warms toward a hotter red and thickens — then ease back to their
 * resting colour through the following exhale (or inhale, after a bottom hold).
 *
 * The rings LIGHT, they do not grow: every ring is a fixed outline and only its
 * brightness and stroke walk outward, so nothing scales and the shape under the
 * timer never moves.
 *
 * What changed when the reading learned to minimize: the pace is no longer this
 * component's own animation loop, it is read from the wall clock via
 * `lib/breathClock` and the session's `breathStartMs`. Mounting halfway through
 * an exhale therefore picks up halfway through that exhale rather than starting
 * a fresh "breathe in", which is what lets the card fold into a pill and come
 * back without disturbing the reading. Ring position still runs on the UI thread
 * via Reanimated; the phase clock is a JS timer that re-targets the shared
 * values at each boundary. The phase HAPTIC and the phase word are the session
 * store's job now, not this view's — they have to keep going while the card is
 * folded away.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing, cancelAnimation, interpolate, interpolateColor, useAnimatedProps,
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { usePalette } from '../../theme';
import { type BreathPattern, glowAt, phaseAt, progressAt } from '../../lib/breathClock';

export { parsePattern } from '../../lib/breathClock';
export type { BreathPattern, BreathPhase } from '../../lib/breathClock';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RINGS = 6;
const SIZE = 190;
const CENTER = SIZE / 2;
const INNER_R = 14;   // smallest ring
const OUTER_R = 84;   // largest ring — sits just inside the progress ring
const GLOW_ACCENT = '#ff6a55'; // hold-brightened stroke (accent warmed toward white)

/**
 * The two shared values every breathing surface animates from: `progress`
 * (0 exhaled → 1 inhaled) and `glow` (0 resting → 1 hold-brightened).
 *
 * Seeded from the clock on every boundary, so the value a view mounts with is
 * the value the reading is actually at. `startMs` is the session's, so the rings
 * in the card and the bars in the pill are the same breath, not two copies of it.
 */
export function useBreathValues(pattern: BreathPattern, startMs: number, running: boolean, frozen?: { progress: number; glow: number }) {
  const progress = useSharedValue(frozen ? frozen.progress : 0);
  const glow = useSharedValue(frozen ? frozen.glow : 0);

  useEffect(() => {
    // Screenshot/preview mode: hold the rings at a fixed point in the breath —
    // no clock, no animation, so a simulator capture is deterministic.
    if (frozen) {
      cancelAnimation(progress); cancelAnimation(glow);
      progress.value = frozen.progress;
      glow.value = frozen.glow;
      return;
    }
    if (!running || !startMs) {
      cancelAnimation(progress); cancelAnimation(glow);
      // Settle rather than snap: the reading has finished and the rings should
      // come to rest, not blink out mid-inhale.
      progress.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
      glow.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) });
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      if (!alive) return;
      const e = Date.now() - startMs;
      const pt = phaseAt(pattern, e);
      // Seed from the clock first: withTiming starts wherever the value is, so
      // this is what makes a mid-phase mount continuous instead of a jump.
      progress.value = progressAt(pattern, e);
      glow.value = glowAt(pattern, e);
      const ms = Math.max(40, pt.remainMs);
      if (pt.phase === 'in') {
        progress.value = withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) });
        // After a bottom hold the brightening releases through the inhale.
        glow.value = withTiming(0, { duration: ms, easing: Easing.out(Easing.quad) });
      } else if (pt.phase === 'out') {
        progress.value = withTiming(0, { duration: ms, easing: Easing.inOut(Easing.sin) });
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
  }, [running, startMs, frozen?.progress, frozen?.glow, pattern.inhale, pattern.holdIn, pattern.exhale, pattern.holdOut]);

  return { progress, glow };
}

/** Memoized: the card re-renders at the sample rate (~2 Hz) and none of that
 *  touches the rings, which animate off shared values on the UI thread. */
export const BreathingViz = React.memo(function BreathingViz({ pattern, startMs = 0, running, size = SIZE, frozenProgress, frozenGlow = 0 }: {
  pattern: BreathPattern; startMs?: number; running: boolean; size?: number;
  /** Screenshot/preview mode: render the rings statically at this progress
   *  (0 exhaled → 1 inhale peak) with no animation, ignoring `running`. */
  frozenProgress?: number; frozenGlow?: number;
}) {
  const p = usePalette();
  const frozen = frozenProgress != null ? { progress: frozenProgress, glow: frozenGlow } : undefined;
  const { progress, glow } = useBreathValues(pattern, startMs, running, frozen);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {Array.from({ length: RINGS }).map((_, i) => {
          const r = INNER_R + (OUTER_R - INNER_R) * (i / (RINGS - 1));
          return <Ring key={i} index={i} radius={r} progress={progress} glow={glow} accent={p.accent} track={p.border} />;
        })}
      </Svg>
    </View>
  );
});

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

/* ---------- the pill's version of the same breath ---------- */

const BAR_COUNT = 5;
const BAR_W = 3;
const BAR_GAP = 3;
/** A plain ramp, short to tall. The arch this replaced peaked in the middle and
 *  came back down, so the light walking outward on the inhale appeared to turn
 *  around halfway through it — the shape argued with the motion. Rising the whole
 *  way, the row grows with the breath. The LIGHT is what travels; the heights
 *  never move. Tight (3pt bars, 3pt gaps) because widely spaced bars at pill
 *  scale read as a loading spinner, which is a different promise entirely. */
const BAR_H = [8, 11, 14, 17, 20];

/**
 * The breathing indicator inside the minimized pill: the same walk as the rings
 * on a row of tight vertical bars. It reads the SAME shared-value pair from the
 * same session clock, so the pill and the card can never show different breaths
 * — and a user watching the pill is being paced correctly, not decorated.
 */
export const BreathBars = React.memo(function BreathBars({ pattern, startMs, running, color }: {
  pattern: BreathPattern; startMs: number; running: boolean; color: string;
}) {
  const { progress, glow } = useBreathValues(pattern, startMs, running);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: BAR_GAP, height: 20 }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <Bar key={i} index={i} progress={progress} glow={glow} color={color} />
      ))}
    </View>
  );
});

function Bar({ index, progress, glow, color }: {
  index: number; progress: Animated.SharedValue<number>;
  glow: Animated.SharedValue<number>; color: string;
}) {
  const threshold = (index + 1) / BAR_COUNT;
  const style = useAnimatedStyle(() => {
    const near = interpolate(progress.value, [threshold - 1 / BAR_COUNT, threshold], [0, 1], 'clamp');
    return { opacity: Math.min(1, 0.18 + near * 0.82 + glow.value * 0.18) };
  });
  return (
    <Animated.View style={[{ width: BAR_W, height: BAR_H[index], borderRadius: 999, backgroundColor: color }, style]} />
  );
}
