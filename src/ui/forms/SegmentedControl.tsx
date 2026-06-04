// SegmentedControl — legacy .segmented (docs/index.html:461-493, segmented()
// at 2947). Equal-width options with an accent pill that slides with the same
// bouncy easing.
import React, { useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Box, Pressable, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

const BOUNCE = Easing.bezier(0.34, 1.25, 0.5, 1);

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const n = options.length;
  const pad = 4;
  const optWidth = width > 0 ? (width - pad * 2) / n : 0;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  React.useEffect(() => {
    if (optWidth > 0) x.value = withTiming(activeIndex * optWidth, { duration: 400, easing: BOUNCE });
  }, [activeIndex, optWidth, x]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: optWidth,
  }));

  return (
    <Box
      onLayout={onLayout}
      style={{
        position: 'relative',
        flexDirection: 'row',
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 999,
        padding: pad,
        marginTop: 12,
        marginBottom: t.gap,
      }}
    >
      {optWidth > 0 ? (
        <Animated.View
          style={[
            { position: 'absolute', top: pad, bottom: pad, left: pad, backgroundColor: t.accent, borderRadius: 999 },
            pillStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 999 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: active ? '#fff' : t.textDim }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </Box>
  );
}
