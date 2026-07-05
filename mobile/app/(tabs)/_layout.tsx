import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, IconName } from '../../src/components/Icon';
import { useSheets } from '../../src/components/Sheet';
import { MenuSheet } from '../../src/features/Settings';
import { usePalette } from '../../src/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Journal', icon: 'clipboard' },
  { name: 'analysis', label: 'Analysis', icon: 'chart' },
  { name: 'milestones', label: 'Milestones', icon: 'star' },
  { name: 'insights', label: 'Insights', icon: 'ai' },
];

// Solid (filled) cog — hollow center via even-odd fill. Opens the menu sheet.
function SolidCog({ size = 22, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={color}
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.5-.42h-3.84a.48.48 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94 0 .32.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.14.24.42.34.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.17.07.45-.02.59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
      />
    </Svg>
  );
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { openSheet } = useSheets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + 12, left: 0, right: 0, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 2, padding: 5, borderRadius: 999, backgroundColor: p.dark ? 'rgba(28,28,30,0.86)' : 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: p.border, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
        {state.routes.filter((r) => TABS.some((t) => t.name === r.name)).map((route) => {
          const idx = state.routes.indexOf(route);
          const focused = state.index === idx;
          const tab = TABS.find((t) => t.name === route.name)!;
          return (
            <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, alignItems: 'center', backgroundColor: focused ? (p.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)') : 'transparent' }}>
              <Icon name={tab.icon} size={22} color={focused ? p.text : p.textDim} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: focused ? p.text : p.textDim, marginTop: 3 }}>{tab.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Menu"
          onPress={() => openSheet((c) => <MenuSheet controls={c} />)}
          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, alignItems: 'center' }}
        >
          <SolidCog size={22} color={p.textDim} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: p.textDim, marginTop: 3 }}>Menu</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="analysis" />
      <Tabs.Screen name="milestones" />
      <Tabs.Screen name="insights" />
    </Tabs>
  );
}
