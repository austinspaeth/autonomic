/** Screen scaffold: a dark-glass blur header that content scrolls *behind*, and
 * a bottom fade that darkens content to solid black under the floating nav bar.
 *
 * `Header` is an absolute BlurView pinned to the top (matching the nav bar's
 * glass), so the scroll view sits full-bleed underneath and its content slides
 * up behind the blur. `Screen` wires the two together: it pads the scroll's top
 * inset to the measured header height and lays a `BottomFade` (transparent → 100%
 * black) over the content — z-index below the nav bar, which the Tabs navigator
 * renders in its own layer above every screen. */
import React, { useCallback, useRef, useState } from 'react';
import { Platform, type ScrollViewInstance, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { usePalette } from '../theme';
import { notifyChartsBlur } from './charts';
import { useContentInsets, useHeaderTop, useNavLayout, useTopBar } from '../store/fold';

// Fixed height of the header content band (below the safe-area top inset), so
// every screen's header bar is identical regardless of the injected node. Tall
// enough to fully contain the Segmented pill (its labels were clipping at 52);
// screens no longer add their own bottom padding — this band owns the spacing.
export const HEADER_CONTENT_HEIGHT = 58;
/** Total header height for a given top safe-area inset (paddingTop + band). */
export const headerHeight = (insetTop: number) => insetTop + 6 + HEADER_CONTENT_HEIGHT;

export function Header({ children, onHeight, centered }: {
  children?: React.ReactNode; onHeight?: (h: number) => void;
  /** The band's contents are narrow and centred (the Journal's date picker),
   *  so they stay centred on the open folding iPhone rather than shifting left
   *  to clear the status bar corner they never reach. */
  centered?: boolean;
}) {
  // The safe area's sides (the closed folding iPhone's strip beside the camera,
  // src/lib/fold.ts). The glass runs edge to edge; its contents keep clear.
  const side = useContentInsets();
  // The open folding iPhone in portrait: the band moves up into the status
  // bar's row and leaves the top-right corner to the clock and camera.
  const top = useHeaderTop();
  const topBar = useTopBar();
  const reserve = centered ? 0 : (topBar?.right ?? 0);
  const barStyle = { position: 'absolute' as const, top: 0, left: 0, right: 0, zIndex: 10, paddingTop: top + 6, paddingLeft: side.left, paddingRight: side.right + reserve };
  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => onHeight?.(e.nativeEvent.layout.height);
  const band = <View style={{ height: HEADER_CONTENT_HEIGHT, justifyContent: 'center' }}>{children}</View>;
  // expo-blur has no real blur on Android (it renders plain translucency), so
  // the header is a solid bar there; iOS keeps the dark glass.
  if (Platform.OS === 'android') {
    return <View onLayout={onLayout} style={[barStyle, { backgroundColor: '#040406' }]}>{band}</View>;
  }
  return (
    <BlurView
      intensity={30}
      tint="dark"
      onLayout={onLayout}
      style={[barStyle, { backgroundColor: 'rgba(4,4,6,0.96)' }]}
    >
      {band}
    </BlurView>
  );
}

/** The header's bottom rule — a hairline that's dark grey at center and fades
 *  darker toward both edges. Rendered as *fixed* chrome by the tab layout (not
 *  inside the sliding scene) so it stays put through tab transitions. */
export function HeaderRule() {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <SvgGradient id="headerRule" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#161619" />
          <Stop offset="0.5" stopColor="#3c3c44" />
          <Stop offset="1" stopColor="#161619" />
        </SvgGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#headerRule)" />
    </Svg>
  );
}

/** Transparent → 100% black vertical fade, pinned to the bottom. SVG-based so it
 * needs no extra native dep (react-native-svg is already used app-wide). */
export function BottomFade({ height = 140 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.7" stopColor="#000000" stopOpacity={0.38} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.75} />
          </SvgGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomFade)" />
      </Svg>
    </View>
  );
}

/** Full-screen scaffold shared by the tab views. Renders a scroll view that runs
 * behind the blurred `Header` and fades to black at the bottom behind the nav.
 * `footer` is absolute overlay content (e.g. a floating action button) that sits
 * above the fade. */
export function Screen({
  header,
  footer,
  children,
  contentPadding = 16,
  bottomPad = 120,
  scrollRef,
  onScroll,
  scrollEventThrottle,
  onHeaderHeight,
  headerCentered,
  refreshControl,
  scrollEnabled,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  contentPadding?: number;
  bottomPad?: number;
  scrollRef?: React.Ref<ScrollViewInstance>;
  // Accepts either a plain JS handler or a Reanimated useAnimatedScrollHandler
  // worklet — the scroll view is Animated.ScrollView, which takes both.
  onScroll?: React.ComponentProps<typeof Animated.ScrollView>['onScroll'];
  scrollEventThrottle?: number;
  onHeaderHeight?: (h: number) => void;
  /** See `Header`'s `centered`. */
  headerCentered?: boolean;
  /** Native pull-to-refresh control (Android — iOS screens draw their own
   *  overscroll graphic off `onScroll` instead). */
  refreshControl?: React.ComponentProps<typeof Animated.ScrollView>['refreshControl'];
  /**
   * Lock scrolling. For screens showing a skeleton: a placeholder is a promise
   * about a layout that doesn't exist yet, so letting someone scroll it means
   * scrolling to a position the real content may not have, and being thrown when
   * it arrives. Defaults to enabled.
   */
  scrollEnabled?: boolean;
}) {
  const p = usePalette();
  const side = useContentInsets();
  const headerTop = useHeaderTop();
  // The fade exists to sink content under the floating bottom bar. The folding
  // iPhone's rail and sidebar leave nothing down there to sink it under.
  const bottomBar = useNavLayout().kind === 'bar';
  // Seed the top inset from `headerHeight`, which is the header's EXACT height
  // (its paddingTop plus the fixed band) rather than an estimate — the seed used
  // to omit the band, so every screen's first paint sat HEADER_CONTENT_HEIGHT
  // too high and then dropped by that much when the header's onLayout landed.
  // Held as measured-or-null so the seed keeps tracking a late inset change.
  const [measuredH, setMeasuredH] = useState<number | null>(null);
  const headerH = measuredH ?? headerHeight(headerTop);
  // Tab scenes stay mounted, so keep our own handle on the scroll view (merged
  // with any caller-provided ref) and snap back to the top whenever the screen
  // regains focus — switching tabs always starts you at the top.
  const innerRef = useRef<ScrollViewInstance | null>(null);
  const setScrollRef = useCallback((node: ScrollViewInstance | null) => {
    innerRef.current = node;
    if (typeof scrollRef === 'function') scrollRef(node);
    else if (scrollRef) (scrollRef as React.MutableRefObject<ScrollViewInstance | null>).current = node;
  }, [scrollRef]);
  useFocusEffect(useCallback(() => {
    innerRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  return (
    // Capture-phase touch hook (never claims the responder): any touch on the
    // screen blurs chart selections; a chart that is touched re-selects in the
    // same event, so this only deselects taps *outside* a chart.
    <View
      style={{ flex: 1, backgroundColor: p.bg }}
      onStartShouldSetResponderCapture={() => { notifyChartsBlur(); return false; }}
    >
      <Animated.ScrollView
        scrollEnabled={scrollEnabled !== false}
        // Reanimated forwards the ref to the underlying ScrollView instance,
        // so scrollTo() etc. keep working through the plain ScrollView type.
        ref={setScrollRef as never}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingTop: headerH + contentPadding, paddingLeft: contentPadding + side.left, paddingRight: contentPadding + side.right, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
        // No keyboard-inset handling here on purpose: nothing inline needs it
        // (day notes edit in a sheet), and iOS's automaticallyAdjustKeyboardInsets
        // left a keyboard-sized void under the content after on-drag dismissal.
        keyboardDismissMode="on-drag"
      >
        {children}
      </Animated.ScrollView>
      {bottomBar ? <BottomFade /> : null}
      {footer}
      <Header centered={headerCentered} onHeight={(h) => { setMeasuredH(h); onHeaderHeight?.(h); }}>{header}</Header>
    </View>
  );
}
