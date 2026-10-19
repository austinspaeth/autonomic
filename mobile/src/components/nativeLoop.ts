/**
 * A forever animation that never touches the shadow tree.
 *
 * Reanimated 3 under the New Architecture applies EVERY animated frame as a
 * full shadow-tree commit (`performOperations` in ReanimatedModuleProxy), with
 * no fast path even for opacity or a transform. A one-shot tween can afford
 * that. A loop that never ends cannot: on Android each of those commits is
 * mounted on the UI thread, and a ScrollView flinging on the same thread
 * stutters in step with it, speeding up and slowing down through every
 * scroll, on every tab and under every sheet, because the Journal stays
 * mounted beneath all of them. The giveaway ribbon's bloom alone did that for
 * the whole of October, collapsed or not.
 *
 * React Native's own Animated with `useNativeDriver` sets the view's prop on
 * the UI thread directly, with no commit and no JS per frame. So every ambient
 * loop on a screen that stays mounted goes through here, and the rule is: an
 * animation that RUNS FOREVER is native-driven, opacity or transform only.
 * Reanimated stays the tool for everything that finishes.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, type EasingFunction } from 'react-native';

export interface NativeLoopOpts {
  from: number;
  to: number;
  /** One leg, from → to. A `yoyo` cycle is two of these. */
  duration: number;
  /** Hoist it to a module constant: `Easing.inOut(...)` builds a new function
   *  each call, and a new easing restarts the loop on every render. */
  easing?: EasingFunction;
  /** from → to → from, rather than from → to and jump back. */
  yoyo?: boolean;
  /** Held at `from` this long before the first leg (staggered placeholders). */
  delay?: number;
  /** Where the value sits while the loop is off. Defaults to `from`. */
  rest?: number;
}

export function useNativeLoop(active: boolean, opts: NativeLoopOpts): Animated.Value {
  const { from, to, duration, easing = Easing.linear, yoyo = false, delay = 0, rest = from } = opts;
  const v = useRef(new Animated.Value(active ? from : rest)).current;
  useEffect(() => {
    if (!active) { v.setValue(rest); return undefined; }
    v.setValue(from);
    const leg = (toValue: number) => Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });
    const loop = Animated.loop(yoyo ? Animated.sequence([leg(to), leg(from)]) : leg(to));
    const timer = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(timer); loop.stop(); };
  }, [v, active, from, to, duration, easing, yoyo, delay, rest]);
  return v;
}
