/**
 * "Healthy 38 year old men: 21-39 ms" as an inset bubble closing an HRV metric
 * card, on the reading summary and on Progress alike. A reference beside the
 * user's own figure, never a grade (see `lib/hrvNorms.ts`), so it wears no
 * colour at all. Renders nothing without a birthday, or outside ages 18-54.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { radius, usePalette } from '../theme';
import { ageFromBirthday } from '../lib/dates';
import { hrvNorm, type NormMetric } from '../lib/hrvNorms';
import { useStore } from '../store/store';

export function HrvNormNote({ metric, unit }: { metric: NormMetric; unit: string }) {
  const p = usePalette();
  // Primitive selectors, so a journal write does not re-render every card.
  const birthday = useStore((s) => s.state.profile?.birthday || '');
  const sex = useStore((s) => s.state.profile?.sex || '');
  const norm = hrvNorm(metric, ageFromBirthday(birthday), sex);
  if (!norm) return null;
  const u = unit === '%' ? '%' : ` ${unit}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: p.sunk, borderRadius: radius.control, paddingVertical: 14, paddingHorizontal: 16, marginTop: 14 }}>
      <Text style={{ flex: 1, fontSize: 13, color: p.textDim }}>{norm.label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: p.textDim, fontVariant: ['tabular-nums'] }}>{`${norm.low}-${norm.high}${u}`}</Text>
    </View>
  );
}
