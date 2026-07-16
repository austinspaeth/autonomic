import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Screen } from '../../src/components/Header';
import { useSheets } from '../../src/components/Sheet';
import { DaySummary } from '../../src/features/DaySummary';
import { JournalSections } from '../../src/features/JournalSections';
import { Calendar } from '../../src/features/Calendar';
import { usePalette } from '../../src/theme';
import { fmtDateLong, todayKey } from '../../src/lib/dates';
import { getCurrentKey, registerJournalScroller, setCurrentKey, shiftCurrent, useCurrentKey } from '../../src/store/nav';

// Date changes echo the tab-switch motion (TAB_TRANSITION in _layout.tsx) but
// run it strictly in sequence so the two days never overlap: the current day
// fades while sliding fully off toward the direction you left (forward in
// time = leftward, like moving to a tab on the right); only once it's gone
// does the content swap; and the new day slides in from the opposite side
// only after its tree has mounted and laid out (so the slide-in is never
// fighting a heavy render).
const SHIFT = Math.round(Dimensions.get('window').width * 0.32);
const TIMING = { duration: 190, easing: Easing.out(Easing.cubic) };

const DayContent = React.memo(function DayContent({ dk }: { dk: string }) {
  return (
    <>
      <DaySummary dk={dk} />
      <JournalSections dk={dk} />
    </>
  );
});

export default function JournalScreen() {
  const p = usePalette();
  const dk = useCurrentKey();
  const { openSheet } = useSheets();
  const isToday = dk === todayKey();

  // Content renders `shownDk`, which trails `dk` by one out-animation.
  const [shownDk, setShownDk] = useState(dk);
  const scrollRef = useRef<ScrollView>(null);
  const tx = useSharedValue(0);
  const fade = useSharedValue(1);
  // True between the swap commit and the new day's first layout; the
  // in-animation waits on it so it never starts while the tree is mounting.
  const pendingIn = useRef(false);

  // Section y-coords are relative to the day content, which sits 16px into the
  // scroll content below the header inset the header also overlays — so the
  // section lands just under the header with a small breathing gap.
  useEffect(() => {
    registerJournalScroller((y) => scrollRef.current?.scrollTo({ y: y + 4, animated: true }));
    return () => registerJournalScroller(null);
  }, []);

  // Phase 2 — runs when the out-animation completes: swap the content while
  // it's invisible, pre-positioned on the incoming side.
  const swap = useCallback((next: string, dir: number) => {
    tx.value = dir * SHIFT;
    fade.value = 0;
    pendingIn.current = true;
    setShownDk(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [tx, fade]);

  // Phase 3 — the swapped-in day's first layout (keyed by dk, so it always
  // remounts): the new tree is rendered and sized, slide it in now.
  const onIncomingLayout = useCallback(() => {
    if (!pendingIn.current) return;
    pendingIn.current = false;
    tx.value = withTiming(0, TIMING);
    fade.value = withTiming(1, TIMING);
  }, [tx, fade]);

  // Phase 1 — a date change starts the out-animation.
  useEffect(() => {
    // Android (often slower hardware): skip the slide choreography entirely
    // and swap the day in a single commit — the animation frames cost more
    // than they're worth there. iOS keeps the full sequence.
    if (Platform.OS === 'android') {
      if (dk !== shownDk) {
        setShownDk(dk);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      return;
    }
    if (dk === shownDk) {
      // Rapid taps landed back on the day already shown mid-flight: if it's
      // not waiting on a fresh mount, just animate it back into place.
      if (!pendingIn.current) {
        tx.value = withTiming(0, TIMING);
        fade.value = withTiming(1, TIMING);
      }
      return;
    }
    const dir = dk > shownDk ? 1 : -1;
    tx.value = withTiming(-dir * SHIFT, TIMING);
    // A restart mid-flight cancels this callback (finished=false), so only
    // the final out-animation performs the swap.
    fade.value = withTiming(0, TIMING, (finished) => {
      if (finished) runOnJS(swap)(dk, dir);
    });
  }, [dk, shownDk, swap, tx, fade]);

  const slideStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: tx.value }],
  }));
  // The date label rides the same shared values as the content — identical
  // phases and timing, just a much smaller travel so it reads inside the
  // button — and renders `shownDk`, so the text swaps when the content does.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: tx.value * (24 / SHIFT) }],
  }));

  return (
    <Screen
      scrollRef={scrollRef}
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 }}>
          <Pressable onPress={() => shiftCurrent(-1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.text, fontSize: 25 }}>‹</Text>
          </Pressable>
          <Pressable onPress={() => openSheet((c) => <Calendar current={getCurrentKey()} onPick={setCurrentKey} controls={c} />, { fitContent: true })} style={{ flex: 1, maxWidth: 280, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, overflow: 'hidden' }}>
            <Animated.View style={labelStyle}>
              <Text style={{ color: shownDk === todayKey() ? p.accent : p.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{fmtDateLong(shownDk)}</Text>
            </Animated.View>
          </Pressable>
          <Pressable disabled={isToday} onPress={() => shiftCurrent(1)} hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: isToday ? 0.3 : 1 }}>
            <Text style={{ color: p.text, fontSize: 25 }}>›</Text>
          </Pressable>
        </View>
      }
    >
      <Animated.View key={shownDk} onLayout={onIncomingLayout} style={slideStyle}>
        <DayContent dk={shownDk} />
      </Animated.View>
    </Screen>
  );
}
