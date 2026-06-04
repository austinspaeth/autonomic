// DateBar — journal date navigator (legacy .datebar, docs/index.html:149-169).
// Prev / center label (opens calendar) / next. Next is disabled at "today"
// (the legacy shiftDay guard forbids future dates).
import React from 'react';
import { keyOf, fmtDateLong } from '@core/date/dateUtils';
import type { DateKey } from '@core/types';
import { Box, Icon, Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton } from './IconButton';

export interface DateBarProps {
  dateKey: DateKey;
  onPrev: () => void;
  onNext: () => void;
  onPickDate?: () => void;
}

export function DateBar({ dateKey, onPrev, onNext, onPickDate }: DateBarProps) {
  const t = useTheme();
  const isToday = dateKey === keyOf(new Date());

  return (
    <Box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingTop: 4,
        paddingBottom: 12,
      }}
    >
      <IconButton accessibilityLabel="Previous day" onPress={onPrev}>
        <Text style={{ fontSize: 24, color: t.text, lineHeight: 26 }}>‹</Text>
      </IconButton>
      <Pressable
        onPress={onPickDate}
        accessibilityRole="button"
        accessibilityLabel="Pick a date"
        style={{
          flex: 1,
          maxWidth: 280,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: t.radius,
          paddingVertical: 10,
          paddingHorizontal: 14,
          ...t.shadow,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            textAlign: 'center',
            color: isToday ? t.accent : t.text,
          }}
        >
          {fmtDateLong(dateKey)}
        </Text>
      </Pressable>
      <IconButton
        accessibilityLabel="Next day"
        onPress={isToday ? undefined : onNext}
        style={{ opacity: isToday ? 0.3 : 1 }}
      >
        <Text style={{ fontSize: 24, color: t.text, lineHeight: 26 }}>›</Text>
      </IconButton>
    </Box>
  );
}
