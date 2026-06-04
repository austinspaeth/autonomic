// Screen — a scrollable view body. Wires scroll position into a shared value so
// the Topbar divider can fade in (legacy: window scroll drove .topbar.scrolled).
// Content is centered to maxw and padded at the bottom to clear the floating tab bar.
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@ui/theme/ThemeProvider';

export interface ScreenProps {
  scrollY: SharedValue<number>;
  children?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ scrollY, children, contentStyle }: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[
        {
          width: '100%',
          maxWidth: t.maxw,
          alignSelf: 'center',
          paddingHorizontal: 16,
          paddingBottom: 96 + insets.bottom,
        },
        contentStyle,
      ]}
    >
      {children}
    </Animated.ScrollView>
  );
}
