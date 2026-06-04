// TimeField (native) — text entry of HH:MM with a clock affordance. The web
// variant (TimeField.web.tsx) uses a real <input type="time"> for the native
// picker, matching the legacy app.
import React from 'react';
import { View } from 'react-native';
import { Icon } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { AppInput } from '@ui/forms/Field';

export interface TimeFieldProps {
  value: string;
  onChange: (v: string) => void;
}

export function TimeField({ value, onChange }: TimeFieldProps) {
  const t = useTheme();
  return (
    <View style={{ justifyContent: 'center' }}>
      <AppInput
        value={value}
        onChangeText={onChange}
        placeholder="HH:MM"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        style={{ paddingRight: 40 }}
      />
      <View style={{ position: 'absolute', right: 12 }} pointerEvents="none">
        <Icon name="clock" size={18} color={t.textDim} />
      </View>
    </View>
  );
}
