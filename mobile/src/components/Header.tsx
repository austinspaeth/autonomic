/** Top safe-area bar. Journal passes the date stepper (with an inline brand
 * mark) as children; other tabs use it as a bare notch spacer. The menu now
 * lives on the cog in the bottom nav, so there's no hamburger here. */
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../theme';

export function Header({ children }: { children?: React.ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 6, backgroundColor: p.bg, borderBottomWidth: 0.5, borderBottomColor: p.border }}>
      {children}
    </View>
  );
}
