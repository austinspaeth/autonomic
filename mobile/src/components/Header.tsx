/** Screen scaffold: a dark-glass blur header that content scrolls *behind*, and
 * a bottom fade that darkens content to solid black under the floating nav bar.
 *
 * `Header` is an absolute BlurView pinned to the top (matching the nav bar's
 * glass), so the scroll view sits full-bleed underneath and its content slides
 * up behind the blur. `Screen` wires the two together: it pads the scroll's top
 * inset to the measured header height and lays a `BottomFade` (transparent → 100%
 * black) over the content — z-index below the nav bar, which the Tabs navigator
 * renders in its own layer above every screen. */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../theme';

export function Header({ children, onHeight }: { children?: React.ReactNode; onHeight?: (h: number) => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <BlurView
      intensity={40}
      tint="dark"
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: insets.top + 6, backgroundColor: 'rgba(6,6,9,0.6)', borderBottomWidth: 0.5, borderBottomColor: p.border }}
    >
      {children}
    </BlurView>
  );
}

/** Transparent → 100% black vertical fade, pinned to the bottom. SVG-based so it
 * needs no extra native dep (react-native-svg is already used app-wide). */
export function BottomFade({ height = 180 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.55" stopColor="#000000" stopOpacity={0.72} />
            <Stop offset="1" stopColor="#000000" stopOpacity={1} />
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
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  contentPadding?: number;
  bottomPad?: number;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  // Seed the top inset with an estimate so content doesn't flash under the
  // header on first paint; the measured height takes over immediately after.
  const [headerH, setHeaderH] = useState(insets.top + 6);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: headerH + contentPadding, paddingHorizontal: contentPadding, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      <BottomFade />
      {footer}
      <Header onHeight={setHeaderH}>{header}</Header>
    </View>
  );
}
