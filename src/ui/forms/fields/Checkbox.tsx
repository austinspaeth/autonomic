// Checkbox — legacy .field-check (a checkbox + label row).
import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export function Checkbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: value ? 0 : 1.5,
          borderColor: t.border,
          backgroundColor: value ? t.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value ? (
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M5 12l4 4 10-10"
              fill="none"
              stroke="#fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
      <Text style={{ fontSize: 15, color: t.text }}>{label}</Text>
    </Pressable>
  );
}
