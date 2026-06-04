// useChartScrub — drag-readout scrubbing for charts.
// Ports the legacy pointer interaction in buildSpark (docs/index.html:3420-3435):
// idxFromEvent mapped a clientX (relative to the SVG's getBoundingClientRect)
// into a point index via `((px - padL) / innerW) * (n - 1)`, rounded. Here we
// avoid getBoundingClientRect (not available on native): onLayout captures the
// rendered width, the Pan gesture supplies an x in 0..layoutWidth, and we map
// that local x into the same chart-space index math. Works on web + native.
import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export interface ChartScrub {
  /** Attach to the chart wrapper to capture its rendered width. */
  onLayout: (e: LayoutChangeEvent) => void;
  /** Pan gesture to wrap the chart in a <GestureDetector>. */
  gesture: ReturnType<typeof Gesture.Pan>;
  /** Index of the actively scrubbed point, or null when not scrubbing. */
  activeIndex: number | null;
}

export interface ChartScrubOpts {
  /** Number of data points. */
  count: number;
  /** Chart viewBox width (the legacy W). */
  viewW: number;
  /** Left padding in viewBox units (legacy padL). */
  padL: number;
  /** Inner plot width in viewBox units (legacy innerW). */
  innerW: number;
}

/**
 * Maps a horizontal drag position to a data-point index using the legacy
 * idxFromEvent math, exposing the active index as React state.
 */
export function useChartScrub({ count, viewW, padL, innerW }: ChartScrubOpts): ChartScrub {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const widthRef = useRef<number>(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  // Local x (0..layoutWidth) -> chart-space px -> rounded point index.
  // Mirrors: px = (x / width) * W; round(((px - padL) / innerW) * (n - 1)).
  const idxAt = useCallback(
    (x: number): number => {
      if (count < 1) return 0;
      const w = widthRef.current || 1;
      const px = (x / w) * viewW;
      const i = Math.round(((px - padL) / innerW) * (count - 1));
      return Math.max(0, Math.min(count - 1, i));
    },
    [count, viewW, padL, innerW],
  );

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(setActiveIndex)(idxAt(e.x));
    })
    .onUpdate((e) => {
      runOnJS(setActiveIndex)(idxAt(e.x));
    })
    .onFinalize(() => {
      runOnJS(setActiveIndex)(null);
    });

  return { onLayout, gesture, activeIndex };
}
