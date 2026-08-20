import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, headerHeight } from '../../src/components/Header';
import { BrandMark, brandMarkWidth } from '../../src/components/Icon';
import { useSheets } from '../../src/components/Sheet';
import { DaySummary } from '../../src/features/DaySummary';
import { JournalSections } from '../../src/features/JournalSections';
import { useCaptureDeepLink } from '../../src/features/forms';
import { Calendar } from '../../src/features/Calendar';
import { requestHealthUpdateCheck } from '../../src/features/HealthUpdates';
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

// Pull-to-check: dragging this far past the top asks the health-update pill
// to run a check (it ignores the request while it or its card is showing).
const PULL_TRIGGER = 90;
// The pull graphic — the brand heartbeat squiggle, whose red fill sweeps
// left → right with the pull and completes exactly when the check arms.
const MARK_H = 26;
const MARK_W = brandMarkWidth(MARK_H);
// Content top padding inside Screen (its `contentPadding` default) — the pull
// gap at drag distance d spans from the header bottom to `PULL_PAD + d` below.
const PULL_PAD = 16;

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
  // Home-screen widgets' Start HRV buttons land here (autonomic://?capture=hrv).
  useCaptureDeepLink();

  // Content renders `shownDk`, which trails `dk` by one out-animation.
  const [shownDk, setShownDk] = useState(dk);
  const scrollRef = useRef<ScrollView>(null);

  // ---- pull-to-check (health updates) ----
  // iOS: ride the native bounce — the brand mark fades/scales in under the
  // header as you pull, and releasing past the threshold fires the check.
  // Android: no negative overscroll, so a plain RefreshControl (accent-tinted)
  // does the gesture; the pill takes over as the real progress UI.
  // Seeded to the header's exact height rather than 0: the pull graphic is
  // anchored to it and Android's RefreshControl offsets by it, both of which
  // would sit under the header on the first gesture after launch.
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(() => headerHeight(insets.top));
  const pullY = useSharedValue(0);
  const pullScroll = useAnimatedScrollHandler({
    onScroll: (e) => { pullY.value = e.contentOffset.y; },
    onEndDrag: (e) => {
      if (e.contentOffset.y <= -PULL_TRIGGER) runOnJS(requestHealthUpdateCheck)();
    },
  });
  // The graphic is anchored at the header's bottom edge and counter-translated
  // so it stays vertically centered in the gap the pull opens — always BELOW
  // the fixed header, never hidden behind it.
  const pullWrapStyle = useAnimatedStyle(() => {
    const d = Math.max(0, -pullY.value);
    const inGap = Math.max(2, (PULL_PAD + d - MARK_H) / 2);
    return {
      opacity: interpolate(d, [8, 44], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: inGap - d },
        // A small pop the moment the pull is far enough to arm the check.
        { scale: interpolate(d, [PULL_TRIGGER - 1, PULL_TRIGGER + 24], [1, 1.12], Extrapolation.CLAMP) },
      ],
    };
  });
  // Red fill sweeping across the squiggle: a clipped copy of the mark whose
  // width tracks the pull, reaching the squiggle's end exactly at the trigger.
  const pullFillStyle = useAnimatedStyle(() => {
    const d = Math.max(0, -pullY.value);
    return { width: interpolate(d, [8, PULL_TRIGGER], [0, MARK_W], Extrapolation.CLAMP) };
  });
  const [refreshing, setRefreshing] = useState(false);
  const androidRefresh = () => {
    setRefreshing(true);
    requestHealthUpdateCheck();
    // The spinner only acknowledges the gesture — the pill shows real progress.
    setTimeout(() => setRefreshing(false), 700);
  };
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
      onScroll={Platform.OS === 'ios' ? pullScroll : undefined}
      onHeaderHeight={setHeaderH}
      refreshControl={Platform.OS === 'android'
        ? <RefreshControl refreshing={refreshing} onRefresh={androidRefresh} colors={[p.accent]} progressBackgroundColor={p.surface} progressViewOffset={headerH} />
        : undefined}
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
      {Platform.OS === 'ios' ? (
        // The pull graphic: a dim brand squiggle that the accent red fills
        // left → right as you pull (an overflow-hidden copy on top whose
        // width rides the drag); fully red = far enough to trigger the check.
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: headerH, left: 0, right: 0, alignItems: 'center' }, pullWrapStyle]}>
          <View style={{ width: MARK_W, height: MARK_H }}>
            <BrandMark size={MARK_H} color={p.border} />
            <Animated.View style={[{ position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' }, pullFillStyle]}>
              <BrandMark size={MARK_H} color={p.accent} />
            </Animated.View>
          </View>
        </Animated.View>
      ) : null}
      <Animated.View key={shownDk} onLayout={onIncomingLayout} style={slideStyle}>
        <DayContent dk={shownDk} />
      </Animated.View>
    </Screen>
  );
}
