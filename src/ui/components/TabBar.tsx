// TabBar — floating glass pill, bottom-right (legacy .tabbar, docs/index.html:517-567).
// A highlight slides between tabs with the same bouncy easing
// (cubic-bezier(0.34, 1.25, 0.5, 1), 460ms). Tab layouts are measured via onLayout.
import React, { useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Icon, Pressable, Text, type IconName } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { GlassSurface } from '@ui/surfaces/GlassSurface';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

export interface TabBarProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

const BOUNCE = Easing.bezier(0.34, 1.25, 0.5, 1);

export function TabBar({ items, active, onChange }: TabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const [ready, setReady] = useState(false);

  const left = useSharedValue(0);
  const width = useSharedValue(0);

  useEffect(() => {
    const l = layouts.current[active];
    if (!l) return;
    const opts = { duration: 460, easing: BOUNCE };
    left.value = withTiming(l.x, opts);
    width.value = withTiming(l.width, opts);
  }, [active, ready, left, width]);

  const onTabLayout = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    layouts.current[key] = { x, width: w };
    if (key === active) {
      // Snap (no animation) on first measure of the active tab.
      if (width.value === 0) {
        left.value = x;
        width.value = w;
      }
    }
    if (Object.keys(layouts.current).length === items.length) setReady(true);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    left: left.value,
    width: width.value,
  }));

  return (
    <GlassSurface
      tint={t.glassBg}
      blur={18}
      style={{
        position: 'absolute',
        bottom: 16 + insets.bottom,
        right: 16,
        flexDirection: 'row',
        gap: 4,
        padding: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: t.glassBorder,
        zIndex: 30,
        // Legacy .tabbar: box-shadow: 0 10px 30px rgba(0,0,0,0.22)
        boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.22)',
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 5,
            bottom: 5,
            borderRadius: 999,
            backgroundColor: t.glassActive,
          },
          indicatorStyle,
        ]}
      />
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            onLayout={onTabLayout(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
            activeOpacity={0.85}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 999,
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Box style={{ width: 22, height: 22 }}>
              <Icon name={item.icon} size={22} color={isActive ? t.text : t.textDim} />
            </Box>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: isActive ? t.text : t.textDim,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </GlassSurface>
  );
}
