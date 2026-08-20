/**
 * The night's composition as one stacked bar plus its legend.
 *
 * Shared, not copied: the Journal's "Last night" card and the sleep report's
 * "Through the night" card show the same night, so a legend colour or a
 * minutes format that drifted between them would read as two different nights.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { usePalette } from '../theme';
import type { SleepStages } from '../lib/types';
import { STAGE_COLORS, STAGE_LABEL, STAGE_ORDER, fmtMin } from '../lib/sleep/stages';

export function StageBar({ stages, style }: { stages: SleepStages; style?: { marginTop?: number } }) {
  const p = usePalette();
  const total = STAGE_ORDER.reduce((s, k) => s + stages[k], 0);
  if (!total) return null;
  return (
    <View style={{ marginTop: style?.marginTop ?? 12 }}>
      <View style={{ flexDirection: 'row', height: 10, gap: 2 }}>
        {STAGE_ORDER.filter((k) => stages[k] > 0).map((k) => (
          <View key={k} style={{ flexGrow: stages[k], flexBasis: 0, backgroundColor: STAGE_COLORS[k], borderRadius: 3 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 10 }}>
        {STAGE_ORDER.map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: STAGE_COLORS[k] }} />
            <Text style={{ fontSize: 13, color: p.text, fontWeight: '500' }}>{`${STAGE_LABEL[k]} ${fmtMin(stages[k])}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
