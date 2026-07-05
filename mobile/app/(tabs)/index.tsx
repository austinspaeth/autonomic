import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Header } from '../../src/components/Header';
import { BrandMark } from '../../src/components/Icon';
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
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
          <BrandMark size={24} />
          <Pressable onPress={() => shiftCurrent(-1)} hitSlop={8} style={{ width: 32, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.text, fontSize: 25 }}>‹</Text>
          </Pressable>
          <Pressable onPress={() => openSheet((c) => <Calendar current={getCurrentKey()} onPick={setCurrentKey} controls={c} />)} style={{ flex: 1, maxWidth: 280, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ color: isToday ? p.accent : p.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{fmtDateLong(dk)}</Text>
          </Pressable>
          <Pressable disabled={isToday} onPress={() => shiftCurrent(1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: isToday ? 0.3 : 1 }}>
            <Text style={{ color: p.text, fontSize: 25 }}>›</Text>
          </Pressable>
        </View>
      </Header>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <DaySummary dk={dk} />
        <JournalSections dk={dk} />
      </ScrollView>
    </View>
  );
}
