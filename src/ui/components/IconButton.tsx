// IconButton — the legacy `.icon-btn`: 40x40 round, transparent, inherits text
// color, subtle press feedback.
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '@ui/primitives';

export interface IconButtonProps {
  onPress?: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  size?: number;
}

export function IconButton({
  onPress,
  accessibilityLabel,
  children,
  style,
  size = 40,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
