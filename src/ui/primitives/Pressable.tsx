// Pressable — RN Pressable with the legacy `:active { opacity: 0.7 }` feel by
// default. Pass `activeOpacity` to tune, or override via the function `style`.
import React from 'react';
import {
  Pressable as RNPressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export interface AppPressableProps extends PressableProps {
  activeOpacity?: number;
  style?: StyleProp<ViewStyle>;
}

export const Pressable = React.forwardRef<
  React.ElementRef<typeof RNPressable>,
  AppPressableProps
>(function Pressable({ activeOpacity = 0.7, style, ...rest }, ref) {
  return (
    <RNPressable
      ref={ref}
      style={({ pressed }) => [style as ViewStyle, pressed && { opacity: activeOpacity }]}
      {...rest}
    />
  );
});
