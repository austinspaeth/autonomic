// Legend — colored-dot + label row for a multi-series chart. Ported from legacy
// acLegend (docs/index.html:4882-4885): only renders when ≥2 labeled series.
import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { AcSeries } from './AnalysisChart';

export interface LegendProps {
  series: AcSeries[];
}

export function Legend({ series }: LegendProps) {
  const t = useTheme();
  const s = series.filter((x) => x.label);
  if (s.length < 2) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        marginTop: 6,
      }}
    >
      {s.map((x, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.color }}
          />
          <Text style={{ fontSize: 11, color: t.textDim }}>{x.label}</Text>
        </View>
      ))}
    </View>
  );
}
