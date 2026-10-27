/** Small pieces every cycle surface shares. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../../components/Icon';
import { fonts, usePalette } from '../../theme';
import { TYPICAL_MAX, TYPICAL_MIN } from '../../lib/cycle/model';
import type { CycleFlow } from '../../lib/types';

/** The line every cycle sheet ends on. Worded about what AUTONOMIC does, which
 *  is the claim it can make: the health store is the user's own, and what it
 *  syncs is between them and Apple or Google. */
export function PrivacyLine() {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 }}>
      <Icon name="lock" size={13} color={p.textFaint} />
      <Text style={{ fontSize: 12.5, color: p.textFaint }}>Autonomic never sends your cycle data anywhere.</Text>
    </View>
  );
}

const DROP = 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z';
const FLOW_LEVEL: Record<CycleFlow, number> = { spotting: 1, light: 2, medium: 3, heavy: 4 };

/** Four drops, filled up to the day's level (spotting 1 … heavy 4), the rest
 *  outlined, so every flow reads on one scale. Neutral by default: a heavy day
 *  is not a grade. */
export function FlowGlyph({ flow, color, size = 12 }: { flow: CycleFlow; color: string; size?: number }) {
  const n = FLOW_LEVEL[flow];
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[0, 1, 2, 3].map((i) => (
        <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
          <Path d={DROP} fill={i < n ? color : 'none'} stroke={color} strokeOpacity={i < n ? 1 : 0.45} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      ))}
    </View>
  );
}

/**
 * "Typical cycle length · optional": the Claude Design field — the number in
 * Manrope with "days" dimmed, two square − / + buttons on the right, and the
 * hint under it. Untouched, it shows 28 dimmed and saves nothing; the first
 * tap starts from 28 and makes it the user's number.
 */
export function TypicalLengthField({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const p = usePalette();
  const shown = value ?? 28;
  const step = (d: number) => onChange(Math.min(TYPICAL_MAX, Math.max(TYPICAL_MIN, shown + (value == null ? 0 : d))));
  const btn = (label: string, d: number, disabled: boolean) => (
    <Pressable onPress={() => step(d)} disabled={disabled} hitSlop={4} accessibilityLabel={d < 0 ? 'Shorter' : 'Longer'}
      style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.surface2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: p.text, fontSize: 20, lineHeight: 22 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: p.textDim, marginHorizontal: 4, marginBottom: 8 }}>
        Typical cycle length <Text style={{ color: p.textFaint, fontWeight: '500' }}>· optional</Text>
      </Text>
      <View style={{ height: 56, borderRadius: 14, backgroundColor: p.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 17 }}>
          <Text style={{ fontFamily: fonts.numHeavy, color: value == null ? p.textFaint : p.text }}>{shown}</Text>
          <Text style={{ color: p.textDim }}> days</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {btn('−', -1, value != null && value <= TYPICAL_MIN)}
          {btn('+', 1, value != null && value >= TYPICAL_MAX)}
        </View>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '500', lineHeight: 17, color: p.textFaint, marginHorizontal: 4, marginTop: 8 }}>
        Leave this and Autonomic learns it from what you log.
      </Text>
    </View>
  );
}
