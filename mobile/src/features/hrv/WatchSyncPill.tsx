/**
 * Floating "Waiting for watch…" pill — shows over the app while the watch
 * sync card is minimized ("Continue using app"). Tapping it brings the syncing
 * card back up. When the reading lands while minimized, the pill fades away
 * and the results card rises on its own — unless another sheet is open, in
 * which case it waits for the stack to empty first (the results card's
 * Done closes the whole stack, and it must not take an unrelated
 * half-filled form down with it). Mounted once in the root layout, inside
 * SheetProvider (it opens sheets), floating above the tab bar.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheets } from '../../components/Sheet';
import { WatchSyncSheet } from './WatchSync';
import { getWatchSyncState, restoreWatchSync, subscribeWatchSync } from './watchSyncStore';
import { setPillSlotClaim } from '../../store/pillSlot';

export function WatchSyncPill() {
  const { openSheet, depth } = useSheets();
  const insets = useSafeAreaInsets();
  const st = useSyncExternalStore(subscribeWatchSync, getWatchSyncState);
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  const reopening = useRef(false);

  const reopen = () => {
    if (reopening.current) return;
    reopening.current = true;
    restoreWatchSync();
    openSheet((c) => <WatchSyncSheet controls={c} />, { hideClose: true });
  };

  // A fresh minimize arms the pill for one reopen (tap or auto).
  useEffect(() => { if (st.minimized) reopening.current = false; }, [st.minimized]);

  // Own the floating slot while visible, so the low-priority "What's new" pill
  // recedes behind this one instead of overlapping it (src/store/pillSlot).
  // Release on unmount only: a cleanup keyed on `shown` would drop the claim and
  // retake it on every transition, bouncing the pill behind it mid-spring.
  useEffect(() => { setPillSlotClaim('watchSync', shown); }, [shown]);
  useEffect(() => () => setPillSlotClaim('watchSync', false), []);

  useEffect(() => {
    if (st.minimized && st.status === 'syncing') {
      setShown(true);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (st.minimized && st.status !== 'idle') {
      // The reading landed (or auth resolved against us) while minimized:
      // fade the pill away, then bring the card up showing the result.
      if (depth > 0) return; // hold until the user's open sheets close
      // Release as the fade starts, so the pill behind slides forward with this
      // one rather than 280ms after it (see HealthUpdates' hide()).
      setPillSlotClaim('watchSync', false);
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(({ finished }) => {
        if (finished) { setShown(false); reopen(); }
      });
    } else {
      // Restored by tap, or the sync was cancelled — no fade, the card (or
      // nothing) already owns the screen.
      opacity.setValue(0);
      setShown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.minimized, st.status, depth]);

  if (!shown) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 88, opacity }]}>
      <Pressable onPress={reopen} accessibilityRole="button" accessibilityLabel="Waiting for watch, tap to reopen">
        <BlurView intensity={40} tint="dark" style={styles.pill}>
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.label}>Waiting for watch…</Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

// Styled to match the floating tab bar pill (same blur, tint, border).
const styles = StyleSheet.create({
  // zIndex 2, same layer as the health-import pill: both sit in front of the
  // "What's new" pill, which recedes behind whichever holds the slot.
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  pill: {
    borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: 'rgba(6,6,9,0.82)' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
