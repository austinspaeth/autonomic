// Button — legacy .btn and variants (docs/index.html:495-515).
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'dashed';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'default', style }: ButtonProps) {
  const t = useTheme();

  const bg =
    variant === 'primary'
      ? t.accent
      : variant === 'danger'
        ? '#d63b3b'
        : variant === 'ghost' || variant === 'dashed'
          ? 'transparent'
          : t.surface2;
  const border =
    variant === 'primary' ? t.accent : variant === 'danger' ? '#d63b3b' : t.border;
  const color = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'dashed' ? t.accent : t.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        {
          borderWidth: variant === 'dashed' ? 1.5 : 1,
          borderColor: border,
          borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
          backgroundColor: bg,
          borderRadius: t.radiusSm,
          paddingVertical: 11,
          paddingHorizontal: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 15, fontWeight: '600', color }}>{title}</Text>
    </Pressable>
  );
}
