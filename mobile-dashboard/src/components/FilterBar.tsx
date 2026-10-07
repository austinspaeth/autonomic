/* The floating filter bar for At a glance, fixed just above the bottom bar:
   one fully rounded pill of dark glass holding

     ( 🍎 🤖 │ 7D  30D  90D  All )

   two round platform toggles and the range control. A platform toggle lights
   in its store's colour (iOS blue, Android green) and narrows the view to
   that store. Only one is ever on: tapping the other switches to it, tapping
   the lit one clears the filter. */
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { StoreFilter } from '../lib/store';
import { C } from '../theme';
import { BOTTOM_CHROME, SlidingPill } from './ui';

/** Height of the floating row, plus its gap above the bottom bar. Screens
 *  that show it pad their content by this much more. */
export const FILTER_BAR_HEIGHT = 56;
export const FILTER_BAR_GAP = 10;

/* Android's robot head (Material Icons "android"), on a 24-unit box. */
const ANDROID_D =
  'M17.6,9.48l1.84-3.18c0.16-0.31,0.04-0.69-0.26-0.85c-0.29-0.15-0.65-0.06-0.83,0.22l-1.88,3.24c-2.86-1.21-6.08-1.21-8.94,0L5.65,5.67c-0.19-0.29-0.58-0.38-0.87-0.2C4.5,5.65,4.41,6.01,4.56,6.3L6.4,9.48C3.3,11.25,1.28,14.44,1,18h22C22.72,14.44,20.7,11.25,17.6,9.48z M7,15.25c-0.69,0-1.25-0.56-1.25-1.25c0-0.69,0.56-1.25,1.25-1.25S8.25,13.31,8.25,14C8.25,14.69,7.69,15.25,7,15.25z M17,15.25c-0.69,0-1.25-0.56-1.25-1.25c0-0.69,0.56-1.25,1.25-1.25s1.25,0.56,1.25,1.25C18.25,14.69,17.69,15.25,17,15.25z';

function Glass({ style, children }: { style?: object; children: ReactNode }) {
  return (
    <View style={[s.glass, style]}>
      {Platform.OS === 'ios' ? (
        // The bottom bar's own material, so the two read as one family of glass.
        <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,12,14,0.96)' }]} />
      )}
      {children}
    </View>
  );
}

export function FilterBar<R extends string>({
  platform,
  onPlatform,
  ranges,
  range,
  onRange,
}: {
  platform: StoreFilter;
  onPlatform: (p: StoreFilter) => void;
  ranges: { key: R; label: string }[];
  range: R;
  onRange: (r: R) => void;
}) {
  const insets = useSafeAreaInsets();
  const toggle = (p: 'ios' | 'android') => {
    Haptics.selectionAsync();
    onPlatform(platform === p ? 'all' : p);
  };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: insets.bottom + BOTTOM_CHROME + FILTER_BAR_GAP }]}>
      <Glass style={s.bar}>
        <Pressable
          onPress={() => toggle('ios')}
          accessibilityLabel="Filter to iOS"
          accessibilityState={{ selected: platform === 'ios' }}
          style={[s.round, platform === 'ios' && { backgroundColor: C.ios }]}
        >
          <SymbolView name="apple.logo" size={18} weight="medium" tintColor="#ffffff" style={{ marginTop: -2 }} />
        </Pressable>
        <Pressable
          onPress={() => toggle('android')}
          accessibilityLabel="Filter to Android"
          accessibilityState={{ selected: platform === 'android' }}
          style={[s.round, platform === 'android' && { backgroundColor: C.android }]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d={ANDROID_D} fill="#ffffff" />
          </Svg>
        </Pressable>
        <View style={s.divider} />
        <View style={s.ranges}>
          <SlidingPill count={ranges.length} index={Math.max(0, ranges.findIndex((o) => o.key === range))} style={s.segPill} />
          {ranges.map((o) => {
            const on = o.key === range;
            return (
              <Pressable
                key={o.key}
                onPress={() => {
                  if (!on) Haptics.selectionAsync();
                  onRange(o.key);
                }}
                style={s.seg}
              >
                <Text style={[s.segText, on && { color: C.text }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

/* Inner controls sit inside an even 8pt inset on every side. */
const PAD = 8;
const INNER = FILTER_BAR_HEIGHT - PAD * 2;

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, height: FILTER_BAR_HEIGHT },
  glass: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  bar: { flex: 1, borderRadius: FILTER_BAR_HEIGHT / 2, flexDirection: 'row', alignItems: 'center', padding: PAD, gap: 4 },
  round: { width: INNER, height: INNER, borderRadius: INNER / 2, alignItems: 'center', justifyContent: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: INNER - 16, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 6 },
  seg: { flex: 1, height: INNER, alignItems: 'center', justifyContent: 'center' },
  ranges: { flex: 1, flexDirection: 'row', alignSelf: 'stretch' },
  segPill: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: INNER / 2 },
  segText: { color: C.dim, fontSize: 14, fontWeight: '600' },
});
