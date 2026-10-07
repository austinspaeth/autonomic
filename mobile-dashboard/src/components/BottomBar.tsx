/* The bottom chrome: one frosted band pinned above the home indicator that
   content scrolls underneath. It holds the white brand mark, the view picker
   (a squircle naming the current view, which opens a card listing them), a
   white bell for alerts and a white plus. BlurView on iOS; Android's blur is costly and
   inconsistent, so it gets a near-opaque tint. */
import { useState } from 'react';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setView, useView, VIEWS } from '../lib/views';
import { C } from '../theme';
import { BrandMark } from './BrandMark';
import { Sheet } from './Sheet';
import { AlertHistory } from './AlertViews';
import { AddSheet } from '../features/AddSheet';
import { useAlerts } from '../lib/alertsStore';
import { BOTTOM_CHROME } from './ui';

export function BottomBar() {
  const insets = useSafeAreaInsets();
  const current = useView();
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { unread, markRead } = useAlerts();
  const label = VIEWS.find((v) => v.key === current)?.label ?? '';

  return (
    <View style={[s.wrap, { height: BOTTOM_CHROME + insets.bottom, paddingBottom: insets.bottom }]}>
      {Platform.OS === 'ios' ? (
        <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,14,0.96)' }]} />
      )}
      <View style={s.hairline} />

      <View style={s.bar}>
        <BrandMark size={20} color="#ffffff" />
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setOpen(true);
          }}
          style={({ pressed }) => [s.squircle, pressed && { opacity: 0.75 }]}
        >
          <Text style={s.squircleText} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
        {/* Alerts: opens the full history, grouped by day. */}
        <Pressable
          hitSlop={10}
          onPress={() => {
            Haptics.selectionAsync();
            setBellOpen(true);
            markRead();
          }}
          style={({ pressed }) => [s.bell, pressed && { opacity: 0.6 }]}
        >
          <SymbolView name="bell" size={22} weight="medium" tintColor="#ffffff" />
          {unread ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        {/* Add store data, a sale or churn. Same size and weight as the bell so
            the two strokes match. */}
        <Pressable
          hitSlop={10}
          onPress={() => {
            Haptics.selectionAsync();
            setAddOpen(true);
          }}
          style={({ pressed }) => [s.bell, pressed && { opacity: 0.6 }]}
        >
          <SymbolView name="plus" size={22} weight="medium" tintColor="#ffffff" />
        </Pressable>
      </View>

      <AddSheet visible={addOpen} onClose={() => setAddOpen(false)} />

      <Sheet visible={bellOpen} onClose={() => setBellOpen(false)} title="Alerts" full>
        {() => <AlertHistory />}
      </Sheet>

      <Sheet visible={open} onClose={() => setOpen(false)} title="View">
        {(close) => (
          <View style={{ gap: 6 }}>
            {VIEWS.map((v) => {
              const on = v.key === current;
              return (
                <Pressable
                  key={v.key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setView(v.key);
                    close();
                  }}
                  style={({ pressed }) => [s.option, on && s.optionOn, pressed && { opacity: 0.75 }]}
                >
                  <Text style={[s.optionText, on && { color: C.text, fontWeight: '700' }]}>{v.label}</Text>
                  {on ? <SymbolView name="checkmark" size={15} weight="bold" tintColor={C.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.hairline },
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 },
  squircle: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  bell: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  squircleText: { color: C.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  optionOn: { borderWidth: 1, borderColor: 'rgba(224,49,39,0.5)' },
  optionText: { color: C.dim, fontSize: 16, fontWeight: '500' },
});
