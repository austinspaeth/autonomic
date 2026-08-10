/**
 * "See what's new in x.x" pill + the release-notes card behind it.
 *
 * The pill floats in the same slot as the health-import and watch-sync pills
 * (same blur, height and offset), but it is the low-priority tenant: those two
 * are transient and time-sensitive, this one will happily wait days. So when one
 * of them claims the slot (src/store/pillSlot), this pill recedes into the
 * stacked-card look the sheet stack uses — scaled down and lifted just enough to
 * peek out above the pill in front — and springs back into place when the slot
 * frees up.
 *
 * It shows once per x.x release and only for x.x releases: 1.21 → 1.22 offers
 * the card, 1.22.0 → 1.22.1 says nothing (see lib/whatsNew). It stays up until
 * the user opens it or dismisses it, both of which stamp the version as seen
 * (lib/whatsNewSeen, outside the journal so it can't ride an import). A fresh
 * install is stamped without ever showing the pill, since a first-run user has
 * nothing to catch up on.
 *
 * The card itself is always reachable from Settings → What's new, which ignores
 * the seen-memory and lists every release, newest first.
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetControls, useSheets } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { radius, usePalette } from '../theme';
import { useStore } from '../store/store';
import { pillSlotTaken, subscribePillSlot } from '../store/pillSlot';
import { RELEASES, fmtReleaseDate, minorOf, releaseFor, shouldOfferWhatsNew } from '../lib/whatsNew';
import { getWhatsNewSeen, markWhatsNewSeen } from '../lib/whatsNewSeen';

/** Same fixed height, border and offset as the health-import pill, so the two
 *  read as one family and stack cleanly. */
const PILL_H = 46;
const BORDER = 1;

/** How long after launch the pill fades in. Long enough that it never competes
 *  with the splash handoff or a health check that fires immediately. */
const APPEAR_DELAY_MS = 1600;

/** The receded state, mirroring the sheet stack's card treatment at pill scale:
 *  shrink, then lift by enough to clear the front pill's top edge and show a
 *  sliver of this one behind it. */
const RECEDE_SCALE = 0.9;
const RECEDE_LIFT = 13;
const RECEDE_SPRING = { damping: 21, stiffness: 210, mass: 0.9 } as const;

export const appVersion = (): string => Constants.expoConfig?.version ?? '1.0.0';

/** Open the release-notes card and stop the pill offering this version again. */
export function openWhatsNew(openSheet: (b: (c: SheetControls) => React.ReactNode) => void): void {
  markWhatsNewSeen(minorOf(appVersion()));
  openSheet((c) => <WhatsNewSheet controls={c} />);
}

export function WhatsNewPill() {
  const { openSheet } = useSheets();
  const insets = useSafeAreaInsets();
  const p = usePalette();
  // The wizard stamps meta.onboarded; journals from before that field existed
  // are recognised by having been written at all (same test Onboarding uses).
  const onboarded = useStore((s) => !!(s.state.meta.onboarded || s.state.meta.lastUpdated));
  const taken = useSyncExternalStore(subscribePillSlot, pillSlotTaken, pillSlotTaken);
  const version = appVersion();
  const minor = minorOf(version);
  const [offer, setOffer] = useState(() => shouldOfferWhatsNew(version, getWhatsNewSeen(), onboarded));
  const [mounted, setMounted] = useState(false);
  const opacity = useSharedValue(0);
  const recede = useSharedValue(pillSlotTaken() ? 1 : 0);

  // A first-run install is stamped silently, so the very first launch after the
  // wizard doesn't open with a "what's new" the user has no baseline for.
  useEffect(() => {
    if (!onboarded) { markWhatsNewSeen(minor); return; }
    setOffer(shouldOfferWhatsNew(version, getWhatsNewSeen(), true));
  }, [onboarded, version, minor]);

  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(() => setMounted(true), APPEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [offer]);

  useEffect(() => {
    if (mounted) opacity.value = withTiming(1, { duration: 260 });
  }, [mounted, opacity]);

  useEffect(() => {
    recede.value = withSpring(taken ? 1 : 0, RECEDE_SPRING);
  }, [taken, recede]);

  const dismiss = () => {
    markWhatsNewSeen(minor);
    opacity.value = withTiming(0, { duration: 220 });
    setTimeout(() => { setOffer(false); setMounted(false); }, 240);
  };

  const style = useAnimatedStyle(() => {
    const scale = 1 - (1 - RECEDE_SCALE) * recede.value;
    return {
      opacity: opacity.value * (1 - 0.2 * recede.value),
      transform: [{ translateY: -RECEDE_LIFT * recede.value }, { scale }],
    };
  });

  if (!offer || !mounted) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 88 }, style]}>
      <Animated.View style={styles.pill}>
        <Pressable
          // While receded the pill is decoration behind the pill that owns the
          // slot; tapping the sliver would be a mis-tap, not an intent.
          onPress={taken ? undefined : () => { openWhatsNew(openSheet); setOffer(false); setMounted(false); }}
          accessibilityRole="button"
          accessibilityLabel={`What's new in version ${minor}`}
        >
          <Blurred>
            <View style={styles.row}>
              <PulsingHeart size={17} color={p.accent} />
              <Text numberOfLines={1} style={styles.label}>{`What's new in ${minor}`}</Text>
              <Pressable
                onPress={taken ? undefined : dismiss}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                style={styles.dismiss}
              >
                <Icon name="x" size={13} color="#9a9aa0" />
              </Pressable>
            </View>
          </Blurred>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/* ---------- the beating heart ---------- */

/** The `heart` glyph from components/Icon, filled rather than stroked. Icon.tsx
 *  is deliberately an outline-only set ported from the web app, so the fill
 *  lives here instead of bending that contract. */
const HEART_D = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';

/** Ripple period. Two ripples run half a cycle apart. */
const RIPPLE_MS = 1800;
/** How far a ripple grows before it's gone. Kept under the pill's inner height
 *  so `overflow: hidden` never clips one mid-flight. */
const RIPPLE_SCALE = 2.2;

function FilledHeart({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={HEART_D} fill={color} />
    </Svg>
  );
}

/**
 * A still red heart shedding hearts that expand and fade. The glyph itself does
 * not animate — the motion is entirely in what leaves it. The ripples are
 * absolutely positioned so they grow from its center without taking layout
 * space (the pill's width must not breathe with them).
 */
function PulsingHeart({ size, color }: { size: number; color: string }) {
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);

  useEffect(() => {
    const ripple = withRepeat(withTiming(1, { duration: RIPPLE_MS, easing: Easing.out(Easing.quad) }), -1, false);
    r1.value = ripple;
    r2.value = withDelay(RIPPLE_MS / 2, ripple);
  }, [r1, r2]);

  const ring1 = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - r1.value),
    transform: [{ scale: 1 + (RIPPLE_SCALE - 1) * r1.value }],
  }));
  const ring2 = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - r2.value),
    transform: [{ scale: 1 + (RIPPLE_SCALE - 1) * r2.value }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, ring1]} pointerEvents="none">
        <FilledHeart size={size} color={color} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, ring2]} pointerEvents="none">
        <FilledHeart size={size} color={color} />
      </Animated.View>
      <FilledHeart size={size} color={color} />
    </View>
  );
}

/** iOS blurs the pill like the tab bar; Android gets the flat near-black fill
 *  (BlurView there is expensive and reads as a grey slab). */
function Blurred({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'android') return <View style={[styles.stack, { backgroundColor: '#0a0a0e' }]}>{children}</View>;
  return <BlurView intensity={40} tint="dark" style={styles.stack}>{children}</BlurView>;
}

// Matched to HealthUpdates' pill (same blur, tint, border, shadow).
const styles = StyleSheet.create({
  // zIndex 1 against the priority pills' 2: this one is always the layer behind.
  // Mount order alone would do it on iOS, but Android resolves overlap by
  // elevation first and both pills share elevation 8, so say it explicitly.
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  pill: {
    height: PILL_H, borderRadius: 999, overflow: 'hidden', borderWidth: BORDER, borderColor: '#34343b',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  stack: { backgroundColor: 'rgba(6,6,9,0.82)' },
  // Asymmetric on purpose: the ✕ carries its own visual padding as a filled
  // circle, so matching the left inset would leave it adrift from the edge.
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: PILL_H - BORDER * 2, paddingLeft: 16, paddingRight: 8, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
  dismiss: { width: 24, height: 24, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
});

/* ---------- the release-notes card ---------- */

/**
 * Every release, newest first. The sheet supplies the scrolling, so this is a
 * plain View (house style, see LogPicker).
 */
export function WhatsNewSheet(_props: { controls?: SheetControls }) {
  const p = usePalette();
  const version = appVersion();
  const current = releaseFor(version);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>What&apos;s new</Text>
      <Text style={{ fontSize: 13.5, color: p.textDim, marginTop: 4, marginBottom: 18 }}>
        {`You’re on Autonomic ${version}`}
      </Text>
      {RELEASES.map((r) => {
        const isCurrent = !!current && r.version === current.version;
        return (
          <View key={r.version} style={{ marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: p.text }}>{r.version}</Text>
              <Text style={{ fontSize: 13, color: p.textDim }}>{fmtReleaseDate(r.date)}</Text>
              {isCurrent ? (
                <View style={{ backgroundColor: p.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: p.accent }}>This version</Text>
                </View>
              ) : null}
            </View>
            {/* `sunk`, not `surface`: the sheet itself is already surface, so a
                surface card would read as flat text with mysterious indents. */}
            <View style={{ backgroundColor: p.sunk, borderRadius: radius.card, borderWidth: 1, borderColor: p.border, padding: 14, gap: 10 }}>
              {r.notes.map((n, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: p.textDim, marginTop: 7 }} />
                  <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: p.text }}>{n}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
