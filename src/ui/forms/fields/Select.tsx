// Select — a dropdown rendered as a button that opens a small option sheet
// (RN has no native <select>; this keeps it native-feeling on all platforms and
// matches the legacy styled select visually).
import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { openSheet } from '@ui/sheets/useSheets';
import { H2 } from '@ui/components/SheetText';
import { MenuItem } from '@ui/components/MenuItem';

export function Select({
  value,
  options,
  label,
  onChange,
}: {
  value: string;
  options: string[];
  label?: string;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  const open = () => {
    openSheet((api) => (
      <>
        <H2>{label || 'Select'}</H2>
        {options.map((o) => (
          <MenuItem
            key={o}
            title={o}
            onPress={() => {
              onChange(o);
              api.close();
            }}
          />
        ))}
      </>
    ));
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radiusSm,
        padding: 12,
      }}
    >
      <Text style={{ flex: 1, fontSize: 16, color: t.text }}>{value}</Text>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d="m6 9 6 6 6-6" fill="none" stroke={t.textDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}
