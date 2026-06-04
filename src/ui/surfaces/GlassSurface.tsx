// GlassSurface (native) — frosted glass via expo-blur, tinted to match the
// legacy `background: var(--glass-bg)` + `backdrop-filter: blur(18px) saturate(170%)`.
// The web override (GlassSurface.web.tsx) uses real CSS backdrop-filter instead.
import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useThemeContext } from '@ui/theme/ThemeProvider';

export interface GlassSurfaceProps {
  /** Tint color layered over the blur (e.g. theme.headerGlass / theme.glassBg). */
  tint?: string;
  /** Blur radius hint (maps to expo-blur intensity on native). */
  blur?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function GlassSurface({ tint, blur = 18, style, children }: GlassSurfaceProps) {
  const { name } = useThemeContext();
  // expo-blur intensity is 0-100; the legacy blur(18px) reads roughly like a
  // medium-strong blur — scale and clamp.
  const intensity = Math.min(100, Math.max(0, blur * 3));
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <BlurView
        intensity={intensity}
        tint={name === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      {children}
    </View>
  );
}
