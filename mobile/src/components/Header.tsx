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
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../theme';
import { notifyChartsBlur } from './charts';

// Fixed height of the header content band (below the safe-area top inset), so
// every screen's header bar is identical regardless of the injected node. Tall
// enough to fully contain the Segmented pill (its labels were clipping at 52);
// screens no longer add their own bottom padding — this band owns the spacing.
export const HEADER_CONTENT_HEIGHT = 58;
/** Total header height for a given top safe-area inset (paddingTop + band). */
export const headerHeight = (insetTop: number) => insetTop + 6 + HEADER_CONTENT_HEIGHT;

export function Header({ children, onHeight }: { children?: React.ReactNode; onHeight?: (h: number) => void }) {
  const insets = useSafeAreaInsets();
  const barStyle = { position: 'absolute' as const, top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top + 6 };
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
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  contentPadding?: number;
  bottomPad?: number;
  scrollRef?: React.Ref<ScrollView>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  onHeaderHeight?: (h: number) => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  // Seed the top inset with an estimate so content doesn't flash under the
  // header on first paint; the measured height takes over immediately after.
  const [headerH, setHeaderH] = useState(insets.top + 6);
  // Tab scenes stay mounted, so keep our own handle on the scroll view (merged
  // with any caller-provided ref) and snap back to the top whenever the screen
  // regains focus — switching tabs always starts you at the top.
  const innerRef = useRef<ScrollView | null>(null);
  const setScrollRef = useCallback((node: ScrollView | null) => {
    innerRef.current = node;
    if (typeof scrollRef === 'function') scrollRef(node);
    else if (scrollRef) (scrollRef as React.MutableRefObject<ScrollView | null>).current = node;
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
      <ScrollView
        ref={setScrollRef}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        contentContainerStyle={{ paddingTop: headerH + contentPadding, paddingHorizontal: contentPadding, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
        // No keyboard-inset handling here on purpose: nothing inline needs it
        // (day notes edit in a sheet), and iOS's automaticallyAdjustKeyboardInsets
        // left a keyboard-sized void under the content after on-drag dismissal.
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
      <BottomFade />
      {footer}
      <Header onHeight={(h) => { setHeaderH(h); onHeaderHeight?.(h); }}>{header}</Header>
    </View>
  );
}
