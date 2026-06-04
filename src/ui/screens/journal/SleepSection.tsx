// Sleep section — wake/bed time, quality, HR low/high (legacy renderSleep,
// docs/index.html:2896-2944). Writes straight to the day's sleep object.
import React from 'react';
import { View } from 'react-native';
import type { DateKey } from '@core/types';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import { Text } from '@ui/primitives';
import { Section } from '@ui/components/Section';
import { AppInput } from '@ui/forms/Field';
import { TimeField } from '@ui/forms/fields/TimeField';
import { SegmentedControl } from '@ui/forms/SegmentedControl';
import { useTheme } from '@ui/theme/ThemeProvider';

export function SleepSection({ dateKey }: { dateKey: DateKey }) {
  const t = useTheme();
  const repo = useRepository();
  const sleep = useRepoSelector((r) => r.getDay(dateKey).sleep);

  const set = (field: 'bed' | 'wake' | 'hrLow' | 'hrHigh', value: string) =>
    repo.updateDay(dateKey, (d) => {
      d.sleep = { ...d.sleep, [field]: value };
    });
  const setQuality = (q: 'good' | 'interrupted') =>
    repo.updateDay(dateKey, (d) => {
      d.sleep = { ...d.sleep, quality: q };
    });

  const cell = (label: string, value: string, onChange: (v: string) => void, ph: string, numeric?: boolean) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.textDim, marginBottom: 6 }}>{label}</Text>
      <AppInput
        value={value}
        onChangeText={onChange}
        placeholder={ph}
        autoCapitalize="none"
        keyboardType={numeric ? 'decimal-pad' : 'default'}
      />
    </View>
  );

  return (
    <Section title="Sleep">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.textDim, marginBottom: 6 }}>Wake time</Text>
          <TimeField value={sleep.wake || ''} onChange={(v) => set('wake', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.textDim, marginBottom: 6 }}>Bed time</Text>
          <TimeField value={sleep.bed || ''} onChange={(v) => set('bed', v)} />
        </View>
      </View>
      <SegmentedControl<'good' | 'interrupted'>
        options={[
          { value: 'good', label: 'Good sleep' },
          { value: 'interrupted', label: 'Interrupted' },
        ]}
        value={sleep.quality || 'good'}
        onChange={setQuality}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cell('HR low', sleep.hrLow || '', (v) => set('hrLow', v), '', true)}
        {cell('HR high', sleep.hrHigh || '', (v) => set('hrHigh', v), '', true)}
      </View>
    </Section>
  );
}
