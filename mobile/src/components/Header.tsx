/** Top bar: brand, optional flags icon, theme toggle, menu. Journal adds a date stepper. */
import React from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, Icon } from './Icon';
import { useSheets } from './Sheet';
import { usePalette } from '../theme';
import { getState, save, useAppState } from '../store/store';
import { MenuSheet } from '../features/Settings';

export function Header({ children }: { children?: React.ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { openSheet } = useSheets();
  const state = useAppState();
  const system = useColorScheme();
  const resolvedDark = state.settings.theme === 'system' ? system === 'dark' : state.settings.theme === 'dark';

  const toggleTheme = () => {
    getState().settings.theme = resolvedDark ? 'light' : 'dark';
    save();
  };

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: p.bg, borderBottomWidth: 0.5, borderBottomColor: p.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BrandMark size={26} />
          <Text style={{ fontSize: 19, fontWeight: '700', color: p.text, letterSpacing: -0.2 }}>Autonomic</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={toggleTheme} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={resolvedDark ? 'sun' : 'moon'} size={20} color={p.text} />
          </Pressable>
          <Pressable onPress={() => openSheet((c) => <MenuSheet controls={c} />)} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.text, fontSize: 22 }}>☰</Text>
          </Pressable>
        </View>
      </View>
      {children}
    </View>
  );
}
