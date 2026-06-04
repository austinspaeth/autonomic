// Section — legacy .section card with a .section-head (uppercase title +
// optional action, e.g. "+ Add") and a .section-body (docs/index.html:285-306).
import React from 'react';
import { View } from 'react-native';
import { Box, Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Box
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius,
        marginBottom: t.gap,
        overflow: 'hidden',
        ...t.shadow,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.78,
            color: t.textDim,
          }}
        >
          {title}
        </Text>
        {action ?? null}
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>{children}</View>
    </Box>
  );
}

export function AddLink({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }}
    >
      <Text style={{ color: t.accent, fontSize: 14, fontWeight: '600' }}>+ Add</Text>
    </Pressable>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.textDim, fontSize: 14, paddingVertical: 6 }}>{children}</Text>;
}
