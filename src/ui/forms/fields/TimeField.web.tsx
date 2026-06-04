// TimeField (web) — a real <input type="time"> so the browser's native time
// picker + clock icon appear, matching the legacy app (docs/index.html used
// <input type="time">). Styled to match AppInput.
import React from 'react';
import { useThemeContext } from '@ui/theme/ThemeProvider';
import { SYSTEM_FONT_STACK } from '@ui/theme/tokens';
import type { TimeFieldProps } from './TimeField';

export function TimeField({ value, onChange }: TimeFieldProps) {
  const { name, theme: t } = useThemeContext();
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 47,
        backgroundColor: t.surface2,
        border: `1px solid ${t.border}`,
        color: t.text,
        borderRadius: t.radiusSm,
        padding: 12,
        fontSize: 16,
        fontFamily: SYSTEM_FONT_STACK,
        // Let the native control theme its clock icon to match.
        colorScheme: name === 'dark' ? 'dark' : 'light',
      }}
    />
  );
}
