// Topbar — frosted sticky header (legacy .topbar, docs/index.html:84-122).
// Brand mark + title on the left; theme toggle + menu on the right. The faint
// divider fades in once the active view is scrolled (legacy .topbar.scrolled::after).
import React from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Icon, Text } from '@ui/primitives';
import { useTheme, useThemeContext } from '@ui/theme/ThemeProvider';
import { GlassSurface } from '@ui/surfaces/GlassSurface';
import { IconButton } from './IconButton';

export interface TopbarProps {
  scrollY: SharedValue<number>;
  onMenu?: () => void;
}

export function Topbar({ scrollY, onMenu }: TopbarProps) {
  const t = useTheme();
  const { name, toggleTheme } = useThemeContext();
  const insets = useSafeAreaInsets();

  const dividerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(scrollY.value > 0 ? 1 : 0, { duration: 250 }),
  }));

  return (
    <GlassSurface tint={t.headerGlass} blur={18} style={{ zIndex: 20, paddingTop: insets.top }}>
      <Box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="brand" size={26} color={t.accent} />
          <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.2, color: t.text }}>
            Autonomic
          </Text>
        </Box>
        <Box style={{ flexDirection: 'row', gap: 6 }}>
          <IconButton accessibilityLabel="Toggle theme" onPress={toggleTheme}>
            <Icon name={name === 'dark' ? 'sun' : 'moon'} size={20} color={t.text} />
          </IconButton>
          <IconButton accessibilityLabel="Menu" onPress={onMenu}>
            <Icon name="menu" size={20} color={t.text} />
          </IconButton>
        </Box>
      </Box>
      {/* Faint divider, centered radial fade. RN has no radial-gradient on a 1px
          line; a centered translucent rule reads the same at this scale. */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 }, dividerStyle]}
      >
        <Svg width="100%" height={1}>
          <Defs>
            <LinearGradient id="topbarLine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={t.headerLine} stopOpacity={0} />
              <Stop offset="0.5" stopColor={t.headerLine} stopOpacity={1} />
              <Stop offset="1" stopColor={t.headerLine} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={1} fill="url(#topbarLine)" />
        </Svg>
      </Animated.View>
    </GlassSurface>
  );
}
