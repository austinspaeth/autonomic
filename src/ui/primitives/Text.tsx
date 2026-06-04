// Text — RN Text with the theme's default color and the app's base font/size
// (legacy body: 16px, line-height 1.4, color var(--text)). Callers override via
// the `style` prop, exactly like adding a CSS class.
import React from 'react';
import { Text as RNText, type TextProps, Platform } from 'react-native';
import { useTheme } from '@ui/theme/ThemeProvider';
import { SYSTEM_FONT_STACK } from '@ui/theme/tokens';

const webFont = Platform.OS === 'web' ? { fontFamily: SYSTEM_FONT_STACK } : null;

export const Text = React.forwardRef<RNText, TextProps>(function Text(
  { style, ...rest },
  ref,
) {
  const t = useTheme();
  return (
    <RNText
      ref={ref}
      // Match the web app's fixed px sizing — don't scale with the OS Dynamic
      // Type setting (the original web PWA ignores it).
      allowFontScaling={false}
      style={[{ color: t.text, fontSize: 16 }, webFont, style]}
      {...rest}
    />
  );
});
