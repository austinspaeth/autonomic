/**
 * The marketing frame: a drawn iPhone bezel + a branded background glow, wrapped
 * into an "App Store slide" (headline on top, framed device below). Because the
 * whole slide is a real RN screen, running it on any simulator device produces a
 * correctly-sized App Store capture — swap devices in the simulator to re-shoot.
 */
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { DESIGN_H, DESIGN_W } from './_screens';
import { Headline } from './_shared';

/** Warm red bloom behind the device, echoing the breathing ring's glow, over a
 *  near-black ground with a faint cool bias. */
function BackgroundGlow({ safeTop }: { safeTop: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="bloom" cx="50%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#e03127" stopOpacity="0.28" />
          <Stop offset="0.5" stopColor="#e03127" stopOpacity="0.06" />
          <Stop offset="1" stopColor="#e03127" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="1" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="#070709" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bloom)" />
      {/* Paint the safe-area top pure black so the device's physical Dynamic
          Island (also black) blends in and disappears, then fade into the glow. */}
      <Rect x="0" y="0" width="100%" height={safeTop} fill="#000000" />
      <Rect x="0" y={safeTop} width="100%" height={30} fill="url(#topfade)" />
    </Svg>
  );
}

/** iPhone-Pro-style bezel around a fixed-design screen scaled to `innerW`. */
function DeviceFrame({ innerW, children }: { innerW: number; children: React.ReactNode }) {
  const bezel = Math.max(9, Math.round(innerW * 0.03));
  const radiusOuter = Math.round(innerW * 0.17);
  const radiusInner = radiusOuter - bezel;
  const innerH = Math.round((innerW * DESIGN_H) / DESIGN_W);
  const scale = innerW / DESIGN_W;
  const islandW = Math.round(innerW * 0.3);
  const islandH = Math.round(innerW * 0.082);

  return (
    <View
      style={{
        borderRadius: radiusOuter,
        backgroundColor: '#131316',
        padding: bezel,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        shadowColor: '#000',
        shadowOpacity: 0.6,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 26 },
        elevation: 18,
      }}
    >
      <View
        style={{
          width: innerW,
          height: innerH,
          borderRadius: radiusInner,
          overflow: 'hidden',
          backgroundColor: '#000',
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.85)',
        }}
      >
        <View style={{ width: DESIGN_W, height: DESIGN_H, transform: [{ scale }], transformOrigin: 'top left' }}>
          {children}
        </View>
        {/* Dynamic Island */}
        <View
          style={{
            position: 'absolute',
            top: Math.round(innerW * 0.03),
            left: (innerW - islandW) / 2,
            width: islandW,
            height: islandH,
            borderRadius: 999,
            backgroundColor: '#000',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        />
      </View>
    </View>
  );
}

/** headline (top) + framed device (below), sized to the current device. */
export function AppStoreSlide({ title, caption, children, titleScale }: { title: string; caption: string; children: React.ReactNode; titleScale?: number }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const topPad = insets.top + 6;
  const bottomPad = insets.bottom + 20;
  const headlineH = Math.round(height * 0.18);
  const gap = Math.round(height * 0.028);
  const availH = height - topPad - headlineH - gap - bottomPad;

  const f = DESIGN_H / DESIGN_W;
  const bez = 0.03;
  const innerW = Math.floor(Math.min(availH / (f + 2 * bez), (width * 0.82) / (1 + 2 * bez)));

  return (
    <View style={{ flex: 1 }}>
      <BackgroundGlow safeTop={insets.top} />
      <View style={{ flex: 1, paddingTop: topPad, paddingBottom: bottomPad }}>
        <View style={{ height: headlineH, justifyContent: 'center', paddingHorizontal: Math.round(width * 0.09) }}>
          <Headline title={title} caption={caption} center titleScale={titleScale} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', marginTop: gap }}>
          <DeviceFrame innerW={innerW}>{children}</DeviceFrame>
        </View>
      </View>
    </View>
  );
}
