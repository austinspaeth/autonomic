// Stepper — legacy stepperEl (docs/index.html:2592-2599): − value + buttons.
import React from 'react';
import { View } from 'react-native';
import { Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

const round = (x: number) => Math.round(x * 100) / 100;

export function Stepper({
  value,
  step,
  onChange,
  format,
}: {
  value: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const v = +value || 0;
  const btn = (label: string, onPress: () => void, aria: string) => (
    <Pressable
      onPress={onPress}
      accessibilityLabel={aria}
      accessibilityRole="button"
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 20, color: t.text, lineHeight: 22 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn('−', () => onChange(Math.max(0, round(v - step))), 'Decrease')}
      <Text style={{ minWidth: 56, textAlign: 'center', fontWeight: '600', color: t.text }}>
        {format ? format(v) : String(v)}
      </Text>
      {btn('+', () => onChange(round(v + step)), 'Increase')}
    </View>
  );
}
