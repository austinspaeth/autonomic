/**
 * Floating "Waiting for Garmin…" pill — stands in for the sync card while it is
 * put away ("Continue using app"). Tapping it brings the card back.
 *
 * Simpler than WatchSyncPill because the wait is event-driven rather than
 * polled: the reading is pushed to us over the Connect IQ link, and
 * WatchArrivalCards opens the results card when it lands. So this pill has one
 * job — keep the wait visible — and disappears when the wait ends.
 *
 * Mounted once in the root layout, inside SheetProvider (it opens sheets).
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheets } from '../../components/Sheet';
import { GarminSyncSheet } from './GarminSync';
import { getGarminSyncState, restoreGarminSync, subscribeGarminSync } from './garminSyncStore';
import { setPillSlotClaim } from '../../store/pillSlot';

export function GarminSyncPill() {
  const { openSheet } = useSheets();
  const insets = useSafeAreaInsets();
  const st = useSyncExternalStore(subscribeGarminSync, getGarminSyncState);
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);

  const reopen = () => {
    restoreGarminSync();
    openSheet((c) => <GarminSyncSheet controls={c} />, { hideClose: true });
  };

  // Own the floating slot while visible so lower-ranked pills recede rather
  // than overlap. Released on unmount only, for the reason WatchSyncPill gives:
  // a cleanup keyed on `shown` retakes the claim on every transition and
  // bounces the pill behind it mid-spring.
  useEffect(() => { setPillSlotClaim('garminSync', shown); }, [shown]);
  useEffect(() => () => setPillSlotClaim('garminSync', false), []);

  useEffect(() => {
    if (st.waiting && st.minimized) {
      setShown(true);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      // Either the reading landed (the results card is already rising, opened
      // by WatchArrivalCards) or the card was restored. Nothing to hand off.
      setPillSlotClaim('garminSync', false);
      opacity.setValue(0);
      setShown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.waiting, st.minimized]);

  if (!shown) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 88, opacity }]}>
      <Pressable onPress={reopen} accessibilityRole="button" accessibilityLabel="Waiting for Garmin reading, tap to reopen">
        <BlurView intensity={40} tint="dark" style={styles.pill}>
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.label}>Waiting for Garmin…</Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

// Matches WatchSyncPill exactly: same blur, tint, border and layer.
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  pill: {
    borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: 'rgba(6,6,9,0.82)' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
