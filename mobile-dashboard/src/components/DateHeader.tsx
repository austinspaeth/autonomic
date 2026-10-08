/* The Journal's date control: ‹ [squircle] ›. The label reads "Today" on
   today; tapping it opens the calendar card. Next is disabled on today and
   previous is disabled at the first day with data. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { addDays, longDate } from '../lib/dates';
import { C } from '../theme';
import { Calendar } from './Calendar';
import { Sheet } from './Sheet';

export function DateHeader({
  dk,
  today,
  earliest,
  intensity,
  onChange,
  bare,
}: {
  /** Inside another control (the wide filter bar): no box of its own, a fixed
   *  width so the bar does not shift as the date changes, tighter arrows. */
  bare?: boolean;
  dk: string;
  today: string;
  earliest?: string | null;
  intensity?: (dk: string) => number;
  onChange: (dk: string, dir: 1 | -1) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const atToday = dk >= today;
  const atStart = !!earliest && dk <= earliest;

  const go = (next: string) => {
    if (next === dk) return;
    const d = next > dk ? 1 : -1;
    setDir(d);
    Haptics.selectionAsync();
    onChange(next, d);
  };

  return (
    <View style={[s.row, bare && s.rowBare]}>
      <Pressable disabled={atStart} onPress={() => go(addDays(dk, -1))} hitSlop={8} style={[s.arrow, bare && s.arrowBare, atStart && { opacity: 0.3 }]}>
        <SymbolView name="chevron.left" size={bare ? 15 : 18} weight="semibold" tintColor={C.text} />
      </Pressable>
      <Pressable onPress={() => setOpen(true)} hitSlop={bare ? 6 : 0} style={({ pressed }) => [bare ? s.plain : s.squircle, pressed && { opacity: bare ? 0.6 : 0.75 }]}>
        <Animated.View key={dk} entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(220)}>
          <Text style={[s.label, bare && s.labelBare]} numberOfLines={1}>
            {atToday ? 'Today' : longDate(dk)}
          </Text>
        </Animated.View>
      </Pressable>
      <Pressable disabled={atToday} onPress={() => go(addDays(dk, 1))} hitSlop={8} style={[s.arrow, bare && s.arrowBare, atToday && { opacity: 0.3 }]}>
        <SymbolView name="chevron.right" size={bare ? 15 : 18} weight="semibold" tintColor={C.text} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Select date">
        {(close) => (
          <Calendar
            current={dk}
            today={today}
            earliest={earliest}
            intensity={intensity}
            onPick={(next) => {
              go(next);
              close();
            }}
          />
        )}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  squircle: {
    flex: 1,
    maxWidth: 280,
    backgroundColor: C.surface,
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    overflow: 'hidden',
    alignItems: 'center',
  },
  label: { color: C.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  rowBare: { gap: 0 },
  arrowBare: { width: 34, height: 40 },
  /* Wide enough for the longest date ("Wed, Sep 30"), so the arrows hold still. */
  plain: { width: 104, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  labelBare: { fontSize: 14 },
});
