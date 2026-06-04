// MenuItem — legacy .menu-item (docs/index.html). Icon + title + optional sub,
// with a top divider.
import React from 'react';
import { Box, Icon, Pressable, Text, type IconName } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export function MenuItem({
  icon,
  title,
  sub,
  onPress,
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}
    >
      {icon ? (
        <Box style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={22} color={t.textDim} />
        </Box>
      ) : null}
      <Box style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: t.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12.5, color: t.textDim, marginTop: 1 }}>{sub}</Text> : null}
      </Box>
    </Pressable>
  );
}
