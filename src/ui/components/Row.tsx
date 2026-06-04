// Row — legacy .row (icon + title/sub + optional value + pills),
// docs/index.html:320-339.
import React from 'react';
import { View } from 'react-native';
import { Box, Icon, Pressable, Text, type IconName } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

export function Pill({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ fontSize: 12.5, color: t.textDim }}>{text}</Text>
    </View>
  );
}

export function Row({
  icon,
  title,
  sub,
  value,
  valueColor,
  scoreColor,
  pills,
  first,
  onPress,
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  value?: string;
  valueColor?: string;
  /** Legacy .score-dot color: a 9px dot left of the value + tints the value text. */
  scoreColor?: string;
  pills?: string[];
  first?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 9,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: t.border,
      }}
    >
      {icon ? (
        <Box style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={21} color={t.textDim} />
        </Box>
      ) : null}
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, color: t.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12.5, color: t.textDim, marginTop: 1 }}>{sub}</Text> : null}
      </Box>
      {value ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {scoreColor ? (
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 9,
                marginRight: 7,
                backgroundColor: scoreColor,
              }}
            />
          ) : null}
          <Text style={{ fontWeight: '600', color: scoreColor ?? valueColor ?? t.text }}>
            {value}
          </Text>
        </View>
      ) : null}
      {pills?.map((p) => <Pill key={p} text={p} />)}
    </Pressable>
  );
}
