/**
 * The Pro gate over a whole view's worth of content.
 *
 * Claude Design "Locked Progress". Lifted out of app/(tabs)/analysis.tsx, where
 * it was private, so Progress and Insights share one gate rather than two that
 * drift apart — they are the same promise made about two screens, and a user who
 * sees different copy, blur or card treatment on each learns that one of them is
 * a mistake.
 *
 * The approach is deliberate in three ways:
 *
 * 1. THE REAL DOCUMENT IS BUILT AND LAID OUT, then masked. Showing the actual
 *    shape of what is behind the gate is the honest version of a paywall, and it
 *    also means nothing has to be conditionally rendered upstream.
 * 2. IT IS NOT A SHEET. An RN Modal would cover the header, and on Progress the
 *    header holds the range control that raised the gate — leaving the way out
 *    live is the point. `top` is where the host's header ends.
 * 3. THE SCRIM EATS EVERY TOUCH beneath it, so the masked document can't be
 *    scrolled or tapped. There is nothing readable down there to scroll to.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { Easing as REasing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { usePalette } from '../theme';
import { MONTHLY_SKU, YEARLY_SKU, priceOf, useIap } from '../store/iap';

const ENTER_SPRING = { damping: 23, stiffness: 200, mass: 0.9 } as const;
const EXIT = { duration: 220, easing: REasing.in(REasing.cubic) };

export function LockedOverlay({ visible, top, title, body, onUpgrade }: {
  visible: boolean;
  /** Where the host's header ends — the overlay covers everything below it. */
  top: number;
  /** "Month trends are locked" / "Insights are locked". */
  title: string;
  body: string;
  onUpgrade: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { products } = useIap();
  // Kept mounted through the exit so the card can play it out, and holding the
  // last title so it doesn't change wording on the way out.
  const [alive, setAlive] = useState(visible);
  const label = useRef(title);
  if (visible) label.current = title;
  const show = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    if (visible) {
      setAlive(true);
      show.value = withSpring(1, ENTER_SPRING);
    } else {
      show.value = withTiming(0, EXIT, (fin) => { if (fin) runOnJS(setAlive)(false); });
    }
  }, [visible, show]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: show.value }));
  // Zooms in and out on the spot rather than sliding up past the tab bar: the
  // card isn't arriving from anywhere, it's the mask resolving into its reason.
  const cardStyle = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ scale: 0.9 + 0.1 * show.value }],
  }));

  if (!alive) return null;
  const mPrice = priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU);
  const yPrice = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, bottom: 0 }}>
      {/* Blur where the platform has one, plus a scrim heavy enough to carry the
          mask on its OWN — expo-blur on Android is plain translucency unless the
          experimental Dimezis path is opted into, so Android leans on the tint
          instead and gets a correspondingly darker one. */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, scrimStyle]}>
        <BlurView intensity={44} tint="dark" style={{ flex: 1, backgroundColor: Platform.OS === 'ios' ? 'rgba(6,6,9,0.72)' : 'rgba(6,6,9,0.84)' }} />
      </Animated.View>
      <Animated.View
        style={[{
          position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 88,
          backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: 18, padding: 18,
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
        }, cardStyle]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <Icon name="lock" size={13} color={p.textDim} strokeWidth={2.4} />
          <Text style={{ color: p.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' }}>Autonomic Pro</Text>
        </View>
        <Text style={{ color: p.text, fontSize: 17.5, fontWeight: '800', letterSpacing: -0.2 }}>{label.current}</Text>
        <Text style={{ color: p.textDim, fontSize: 13.5, lineHeight: 20, marginTop: 7, marginBottom: 15 }}>{body}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Button title="Upgrade to Pro" variant="primary" onPress={onUpgrade} />
        </View>
        <Text style={{ color: p.textDim, fontSize: 12, textAlign: 'center', marginTop: 10 }}>{`${mPrice}/mo · ${yPrice}/yr · cancel anytime`}</Text>
      </Animated.View>
    </View>
  );
}
