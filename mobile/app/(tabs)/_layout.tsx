import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, IconName } from '../../src/components/Icon';
import { usePalette } from '../../src/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Journal', icon: 'clipboard' },
  { name: 'analysis', label: 'Analysis', icon: 'chart' },
  { name: 'milestones', label: 'Milestones', icon: 'star' },
  { name: 'insights', label: 'Insights', icon: 'ai' },
];

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
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
