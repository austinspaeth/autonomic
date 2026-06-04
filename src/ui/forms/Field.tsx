// Field — label + control wrapper (legacy .field). Plus a styled TextInput and
// a simple Select built on the sheet system later; here Field + AppInput cover
// the common cases.
import React from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14, minWidth: 0 }}>
      {label ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.textDim, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function AppInput(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.textDim}
      {...props}
      style={[
        {
          width: '100%',
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.border,
          color: t.text,
          borderRadius: t.radiusSm,
          padding: 12,
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
}
