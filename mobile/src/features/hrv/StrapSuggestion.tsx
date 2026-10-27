/**
 * Open it `fitContent`: it is one short card, and it fits at 360pt wide.
 *
 * "A chest strap would fix this" — the card raised after repeated failed
 * readings with the camera or a Garmin watch.
 *
 * When it may open is `lib/strapSuggest.ts` (never a first failure, twice ever,
 * never to somebody with a strap saved); this file is only what it says. It
 * explains the method's limit without blaming the user or the app, names one
 * strap known to send beat-to-beat intervals, and opens the affiliate link in
 * the phone's own browser. The disclosure sits under the buttons, in words.
 *
 * It is stacked OVER whatever the failure raised (the tips card, the refusal
 * card, the Garmin sync card), so its ✕ returns there rather than ending the
 * stack: the tips are still the right answer for somebody not buying anything.
 */
import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { fonts, radius, usePalette } from '../../theme';
import { STRAP_AMAZON_URL, type WeakSensor } from '../../lib/strapSuggest';
import { noteStrapTapped } from '../../store/strapSuggest';

const COPY: Record<WeakSensor, { title: string; body: string; label: string; traits: string; retry: string }> = {
  camera: {
    title: 'Your camera is doing its best',
    body: "A fingertip reading guesses each heartbeat from tiny color changes in your skin. Cold hands, pressing too hard or a small movement can blur it. A chest strap reads the heart's electrical signal directly, so none of that matters.",
    label: 'Camera',
    traits: 'Struggles with cold, pressure and movement, and the flash gets hot',
    retry: 'Try again with camera',
  },
  garmin: {
    title: 'Your watch is the issue',
    body: "Garmin's wrist sensor reads your pulse with light, and it often loses individual beats, which is exactly what HRV is made of. Some Garmin models do not share the sensor data Autonomic needs at all. A chest strap reads the heart's electrical signal directly and works alongside your watch.",
    label: 'Watch',
    traits: 'Often misses single beats, and Garmin support is limited',
    retry: 'Try again with watch',
  },
};

export function StrapSuggestionSheet({ sensor, onRetry, controls }: {
  sensor: WeakSensor;
  /** What the secondary button does. Absent: it simply closes this card. */
  onRetry?: () => void;
  controls: SheetControls;
}) {
  const p = usePalette();
  const c = COPY[sensor];
  const open = () => {
    noteStrapTapped();
    Linking.openURL(STRAP_AMAZON_URL).catch(() => {});
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Right padding keeps a two-line title clear of the sheet's ✕ pill. */}
      <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.2, lineHeight: 25, color: p.text, paddingRight: 44 }}>
        {c.title}
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: p.textDim, marginTop: -4 }}>{c.body}</Text>

      <View style={{ backgroundColor: p.sunk, borderRadius: radius.control, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Text style={{ width: 82, fontSize: 14, fontWeight: '600', color: p.textDim }}>{c.label}</Text>
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: p.textDim }}>{c.traits}</Text>
        </View>
        <View style={{ height: 1, backgroundColor: p.hairline }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Text style={{ width: 82, fontSize: 14, fontWeight: '700', color: p.accent }}>Chest strap</Text>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500', color: p.text }}>Every beat, captured electrically</Text>
        </View>
      </View>

      {/* The product is a link too, to the same place and counted the same way. */}
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel="Coospo 808S HRV strap on Amazon"
        style={({ pressed }) => [{
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, paddingLeft: 12,
          backgroundColor: p.accentSoft, borderWidth: 1, borderColor: 'rgba(224,49,39,0.28)',
          borderRadius: radius.card, borderCurve: 'continuous',
        }, pressed && { opacity: 0.7 }]}
      >
        <StrapDrawing width={116} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: p.textDim }}>We recommend</Text>
          <Text style={{ fontSize: 15.5, fontWeight: '700', color: p.text, marginTop: 2 }}>Coospo 808S HRV strap</Text>
          <Text style={{ fontSize: 15, color: p.textDim, marginTop: 4 }}>
            {'About '}
            <Text style={{ fontFamily: fonts.numHeavy, fontSize: 17, color: p.text }}>$30</Text>
            {' on Amazon'}
          </Text>
          <Text style={{ fontSize: 12.5, color: p.textFaint, marginTop: 3 }}>Tested with Autonomic</Text>
        </View>
      </Pressable>

      <View style={{ gap: 8, marginTop: 2 }}>
        <View style={{ flexDirection: 'row' }}>
          <Button title="View on Amazon" variant="primary" iconAfter="external" onPress={open} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          {/* The ghost button's outline with a quieter label: the way back,
              a step below the recommendation. */}
          <Pressable
            onPress={onRetry ?? (() => controls.close())}
            style={({ pressed }) => [{
              flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13,
              borderRadius: radius.control, borderWidth: 1, borderColor: p.border,
            }, pressed && { opacity: 0.7 }]}
          >
            <Text style={{ color: p.textDim, fontSize: 16, fontWeight: '600' }}>{c.retry}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={{ fontSize: 11.5, lineHeight: 16, color: p.textFaint, textAlign: 'center', marginTop: -4 }}>
        Affiliate link. The app earns a small commission at no cost to you.
      </Text>
    </View>
  );
}

/**
 * The Coospo H808S, drawn: a doubled elastic band behind a chamfered pod with
 * the wordmark and its green status ring. Fixed dark colours, since it is a
 * picture of a black object rather than a piece of the interface, and the
 * green is the device's own LED, not a grade. The design's blur filters are
 * approximated with a soft wide stroke and a radial shadow, which render the
 * same on both platforms.
 */
export function StrapDrawing({ width }: { width: number }) {
  return (
    <Svg width={width} height={(width * 110) / 200} viewBox="0 0 200 110">
      <Defs>
        <LinearGradient id="strapBand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#232326" />
          <Stop offset="0.5" stopColor="#151517" />
          <Stop offset="1" stopColor="#0a0a0b" />
        </LinearGradient>
        <LinearGradient id="strapBack" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#18181a" />
          <Stop offset="1" stopColor="#0c0c0d" />
        </LinearGradient>
        <LinearGradient id="strapPod" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2f3033" />
          <Stop offset="0.55" stopColor="#1d1e20" />
          <Stop offset="1" stopColor="#101011" />
        </LinearGradient>
        <LinearGradient id="strapTop" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4a4b50" />
          <Stop offset="0.45" stopColor="#313236" />
          <Stop offset="1" stopColor="#232427" />
        </LinearGradient>
        <LinearGradient id="strapWrap" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0.55} />
          <Stop offset="0.12" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.88" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.55} />
        </LinearGradient>
        <RadialGradient id="strapShadow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#000" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={12} y={26} width={178} height={52} rx={7} fill="url(#strapBack)" />
      <Path d="M186 34 q8 2 8 9 M190 32 q9 3 8 12" fill="none" stroke="#3a3a3e" strokeWidth={1.6} strokeLinecap="round" />
      <Rect x={4} y={32} width={190} height={52} rx={7} fill="url(#strapBand)" />
      <Rect x={4} y={32} width={190} height={52} rx={7} fill="url(#strapWrap)" />
      <Path d="M10 33.5 H188" stroke="#ffffff" strokeOpacity={0.1} strokeWidth={1} />
      <Path d="M10 37 H188 M10 79 H188" stroke="#000" strokeOpacity={0.5} strokeWidth={0.8} strokeDasharray="1.2 1.6" />
      <Ellipse cx={100} cy={94} rx={70} ry={9} fill="url(#strapShadow)" />
      <Path d={POD} fill="url(#strapPod)" />
      <Path d="M58 18 L142 18 Q151 18 156 25 L166 42 Q160 47 150 47 L50 47 Q40 47 34 42 L44 25 Q49 18 58 18 Z" fill="url(#strapTop)" />
      <Path d="M36 70 L164 70" stroke="#000" strokeOpacity={0.45} strokeWidth={1} />
      <Path d="M37 71 L163 71" stroke="#ffffff" strokeOpacity={0.05} strokeWidth={1} />
      <Path d="M58 18.6 L142 18.6 Q150 18.6 155 25" fill="none" stroke="#ffffff" strokeOpacity={0.28} strokeWidth={1} />
      <Path d={POD} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={1} />
      <SvgText x={94} y={61.8} textAnchor="middle" fontFamily={fonts.numHeavy} fontSize={15} letterSpacing={1.6} fill="#ffffff" fillOpacity={0.07}>COOSPO</SvgText>
      <SvgText x={94} y={61} textAnchor="middle" fontFamily={fonts.numHeavy} fontSize={15} letterSpacing={1.6} fill="#0c0c0d">COOSPO</SvgText>
      <Circle cx={141} cy={55.5} r={7.2} fill="none" stroke="#38f46a" strokeOpacity={0.22} strokeWidth={5.5} />
      <Circle cx={141} cy={55.5} r={7.2} fill="none" stroke="#5dff86" strokeWidth={1.8} />
    </Svg>
  );
}

const POD = 'M58 18 L142 18 Q151 18 156 25 L168 45 Q171 51 168 57 L156 79 Q151 88 142 88 L58 88 Q49 88 44 79 L32 57 Q29 51 32 45 L44 25 Q49 18 58 18 Z';
