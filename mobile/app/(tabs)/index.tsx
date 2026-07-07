import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '../../src/components/Header';
import { useSheets } from '../../src/components/Sheet';
import { DaySummary } from '../../src/features/DaySummary';
import { JournalSections } from '../../src/features/JournalSections';
import { Calendar } from '../../src/features/Calendar';
import { usePalette } from '../../src/theme';
import { fmtDateLong, todayKey } from '../../src/lib/dates';
import { getCurrentKey, setCurrentKey, shiftCurrent, useCurrentKey } from '../../src/store/nav';

export default function JournalScreen() {
  const p = usePalette();
  const dk = useCurrentKey();
  const { openSheet } = useSheets();
  const isToday = dk === todayKey();

  return (
    <Screen
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 }}>
          <Pressable onPress={() => shiftCurrent(-1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.text, fontSize: 25 }}>‹</Text>
          </Pressable>
          <Pressable onPress={() => openSheet((c) => <Calendar current={getCurrentKey()} onPick={setCurrentKey} controls={c} />, { fitContent: true })} style={{ flex: 1, maxWidth: 280, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ color: isToday ? p.accent : p.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{fmtDateLong(dk)}</Text>
          </Pressable>
          <Pressable disabled={isToday} onPress={() => shiftCurrent(1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: isToday ? 0.3 : 1 }}>
            <Text style={{ color: p.text, fontSize: 25 }}>›</Text>
          </Pressable>
        </View>
      }
    >
      <DaySummary dk={dk} />
      <JournalSections dk={dk} />
    </Screen>
  );
}
