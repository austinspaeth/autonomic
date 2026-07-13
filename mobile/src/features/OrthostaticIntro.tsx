/**
 * Intro card for Orthostatic Event — stacked when the type is picked,
 * before the manual form (mirrors the Apple Health import card for BP/RHR).
 * The best capture is the guided stand test in the watch companion app, whose
 * results sync in on their own as `standTest` readings, so this card points
 * the wearer there — with a little watch running the standing screen. Below
 * it, an equivalent in-app capture with a Bluetooth chest strap (see
 * src/features/pots/), and manual entry as the fallback where offered.
 */
import React, { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing, cancelAnimation, useAnimatedProps, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { SheetFooter } from '../components/Sheet';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { radius, usePalette } from '../theme';
import { useAppState } from '../store/store';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Watch-companion design tokens (targets/watch/DesignSystem.swift) — the
// illustration stays a black watch in both app themes.
const WATCH = { accent: '#e03127', accentSoft: '#ef6a60', dim: '#8a8a92', case: '#3a3a40', band: '#2a2a2e', screen: '#0b0b0d' };

/** An Apple Watch mid stand-test: the red STANDING ring slowly filling around
 *  a live-looking HR readout, like the real watch screen. */
function WatchStandTest({ height = 172 }: { height?: number }) {
  const W = 140, H = 172;
  const cx = 70, cy = 98, r = 33;
  const circ = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - progress.value) }));
  return (
    <Svg width={(height / H) * W} height={height} viewBox={`0 0 ${W} ${H}`}>
      {/* band stubs + digital crown behind the case */}
      <Rect x={48} y={2} width={44} height={22} rx={9} fill={WATCH.band} />
      <Rect x={48} y={148} width={44} height={22} rx={9} fill={WATCH.band} />
      <Rect x={119} y={52} width={9} height={20} rx={4.5} fill={WATCH.case} />
      <Rect x={119} y={80} width={7} height={26} rx={3.5} fill={WATCH.case} />
      <Rect x={18} y={16} width={104} height={140} rx={30} fill={WATCH.screen} stroke={WATCH.case} strokeWidth={3} />
      <SvgText x={cx} y={44} textAnchor="middle" fill={WATCH.accent} fontSize={9.5} fontWeight="700" letterSpacing={1.5}>STANDING</SvgText>
      <SvgText x={cx} y={56} textAnchor="middle" fill={WATCH.dim} fontSize={7}>Hold still, don&apos;t move</SvgText>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={6} fill="none" />
      <AnimatedCircle
        cx={cx} cy={cy} r={r} stroke={WATCH.accent} strokeWidth={6} fill="none"
        strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} animatedProps={ringProps}
        rotation={-90} origin={`${cx}, ${cy}`}
      />
      <SvgText x={cx + 4} y={100} textAnchor="end" fill="#ffffff" fontSize={15} fontWeight="800">96</SvgText>
      <SvgText x={cx + 7} y={100} textAnchor="start" fill={WATCH.dim} fontSize={6} fontWeight="700">bpm</SvgText>
      <Rect x={cx - 15} y={105} width={30} height={8} rx={4} fill={WATCH.accent} opacity={0.16} stroke={WATCH.accent} strokeOpacity={0.35} strokeWidth={0.6} />
      <SvgText x={cx} y={110.8} textAnchor="middle" fill={WATCH.accentSoft} fontSize={5} fontWeight="700">Δ +26 bpm</SvgText>
    </Svg>
  );
}

export function OrthostaticIntroSheet({ title, subtitle, onManual, onStrap }: {
  title: string; subtitle: string;
  /** Offer a manual form behind the watch pointer; omitted for watch-only types. */
  onManual?: () => void;
  /** Run the capture right here with a Bluetooth chest strap (pairs first if
   *  none is saved) — the phone twin of the watch flow. */
  onStrap?: () => void;
}) {
  const p = usePalette();
  // Reactive so the paired-strap subtitle updates the moment a device is saved
  // from the pairing sheet stacked on top of this one.
  const savedName = useAppState().settings.lastBleDeviceName;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>{title}</Text>
      {/* Right padding keeps the wrapping subtext clear of the floating ✕ pill. */}
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16, paddingRight: 52 }}>{subtitle}</Text>
      {/* The watch pointer is an iOS-only surface — Android leads with the
          in-app strap capture instead. */}
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'center', padding: 16, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}>
          <WatchStandTest />
          <Text style={{ color: p.text, fontWeight: '700', fontSize: 15, marginTop: 12, textAlign: 'center' }}>Use the Autonomic app on your Apple Watch</Text>
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5 }}>
            Start a POTS test on the watch. It measures your heart rate lying down and standing, and the result syncs to this device automatically.
          </Text>
        </View>
      ) : null}
      {onStrap ? (
        <Pressable onPress={onStrap} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, backgroundColor: p.accentSoft, borderWidth: 1, borderColor: p.accent, marginTop: 10 }, pressed && { opacity: 0.7 }]}>
          <Icon name="bluetooth" size={24} color={p.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.accent, fontWeight: '700', fontSize: 17 }}>Use a Bluetooth Strap</Text>
            <Text style={{ color: p.textDim, fontSize: 13 }}>{savedName ? `Run the guided test with ${savedName}` : 'Pair a chest strap and run the test'}</Text>
          </View>
          <Icon name="chevronRight" size={20} color={p.accent} />
        </Pressable>
      ) : null}
      {onManual ? (
        <SheetFooter>
          <Button title="Enter manually" variant="default" onPress={onManual} />
        </SheetFooter>
      ) : null}
    </View>
  );
}
