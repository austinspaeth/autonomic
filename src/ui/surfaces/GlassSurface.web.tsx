// GlassSurface (web) — pixel-faithful frosted glass using the genuine CSS
// backdrop-filter the legacy app used (docs/index.html:89-90, 528-529).
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { GlassSurfaceProps } from './GlassSurface';

export function GlassSurface({ tint, blur = 18, style, children }: GlassSurfaceProps) {
  const filter = `blur(${blur}px) saturate(170%)`;
  // backdropFilter / WebkitBackdropFilter are web-only style keys not present in
  // RN's ViewStyle type — cast through to apply them via react-native-web.
  const webGlass = {
    backgroundColor: tint,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
  } as unknown as ViewStyle;
  return <View style={[style as StyleProp<ViewStyle>, webGlass]}>{children}</View>;
}
