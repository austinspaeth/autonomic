/**
 * Water/trigger/bowel drawers — ported from the PWA's waterDrawer,
 * triggerMenu, bowelForm.
 */
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { FieldLabel, TimeField, onlyNumeric } from '../components/Field';
import { Button, DaySaveButton, ProgressBar, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { GRADE_COLORS, WATER_BLUE, WATER_BLUE_SOFT, fonts, radius, usePalette } from '../theme';
import { resolveProtocol, waterGoalL } from '../lib/scoring/day';
import { BM_KINDS, BM_VOLUMES, bmLabel } from '../lib/registry';
import { LogPickerSheet } from './LogPicker';
import { ensureDay, getState, save, useStore } from '../store/store';
import { defaultTimeFor, uid } from '../lib/dates';
import type { Movement } from '../lib/types';

export function useDrawers(dk: string) {
  const { openSheet } = useSheets();
  return {
    water: () => openSheet((c) => <WaterDrawer dk={dk} controls={c} />),
    triggers: () => openSheet((c) => <LogPickerSheet kind="triggers" dk={dk} controls={c} />),
    bowel: (existing: Movement | null) => openSheet((c) => <BowelForm dk={dk} existing={existing} controls={c} />),
  };
}

/** One glass ≈ 250 ml, so the ten-glass grid fills the default 2.5 L goal. */
const CUP_L = 0.25;
const roundL = (n: number) => Math.round(n * 100) / 100;

function WaterDrawer({ dk, controls }: { dk: string; controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  // Subscribed, not read once — the goal card stacks on top of this drawer and
  // the progress bar has to follow the new goal the moment it saves.
  const goal = useStore((s) => waterGoalL(s.state.settings.protocol));
  const [text, setText] = useState(String(+((getState().days[dk]?.food.water) || 0)));
  const liters = Math.max(0, parseFloat(text) || 0);
  const cups = Math.round(liters / CUP_L);
  const pct = Math.min(1, liters / goal);
  const step = (dir: 1 | -1) => setText(String(roundL(Math.max(0, liters + dir * CUP_L))));
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Water</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 16, paddingRight: 58 }}>
        Tap how many glasses of water you drank, or enter the total liters manually below.
      </Text>
      {/* Progress summary — total vs the daily goal (protocol amount or 2.5 L). */}
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontFamily: fonts.numHeavy, fontSize: 38, color: WATER_BLUE, fontVariant: ['tabular-nums'] }}>{+liters.toFixed(2)}</Text>
            <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>L</Text>
          </View>
          <Text style={{ color: p.textDim, fontSize: 15, fontWeight: '600', marginBottom: 7 }}>{`${cups} cup${cups === 1 ? '' : 's'}`}</Text>
        </View>
        <ProgressBar pct={pct} color={WATER_BLUE} track={p.gaugeTrack} style={{ marginTop: 10 }} />
        <Text style={{ color: p.textDim, fontSize: 13, marginTop: 10 }}>{`Goal · ${goal} L / day`}</Text>
      </View>
      {/* Rows of glasses, each = one cup (0.25 L). Tapping the last full glass
          takes that cup back off. Three rows to start; once every visible row
          is full a fresh empty row appears, so the grid never runs out. */}
      <View style={{ gap: 8, marginBottom: 22 }}>
        {Array.from({ length: Math.max(3, Math.floor(cups / 5) + 1) }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            {[0, 1, 2, 3, 4].map((col) => {
              const i = row * 5 + col;
              const v = roundL((i + 1) * CUP_L);
              const full = liters >= v - 0.001;
              return (
                <Pressable key={i} onPress={() => setText(String(roundL(Math.abs(liters - v) < 0.001 ? i * CUP_L : v)))} style={{ flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: full ? WATER_BLUE : p.border, backgroundColor: full ? WATER_BLUE_SOFT : p.surface2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="cup" size={26} color={full ? WATER_BLUE : p.textDim} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <FieldLabel>OR ENTER LITERS</FieldLabel>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12 }}>
          <TextInput
            value={text}
            onChangeText={(t) => setText(onlyNumeric(t))}
            keyboardType="decimal-pad"
            keyboardAppearance="dark"
            placeholder="0"
            placeholderTextColor={p.textDim}
            style={{ flex: 1, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: p.text }}
          />
          <Text style={{ color: p.textDim, fontSize: 15, fontWeight: '600' }}>L</Text>
        </View>
        <Pressable onPress={() => step(-1)} style={({ pressed }) => [{ width: 52, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
          <Text style={{ color: p.text, fontSize: 22, fontWeight: '600', lineHeight: 26 }}>−</Text>
        </Pressable>
        <Pressable onPress={() => step(1)} style={({ pressed }) => [{ width: 52, borderWidth: 1, borderColor: WATER_BLUE, backgroundColor: WATER_BLUE_SOFT, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
          <Text style={{ color: WATER_BLUE, fontSize: 22, fontWeight: '600', lineHeight: 26 }}>+</Text>
        </Pressable>
      </View>
      <Text style={{ color: p.textDim, fontSize: 13, marginTop: 10 }}>1 cup ≈ 250 ml. Steps adjust by one cup.</Text>
      <Button
        title="Change water goal"
        style={{ marginTop: 20 }}
        onPress={() => openSheet((c) => <WaterGoalCard controls={c} />, { fitContent: true })}
      />
      <SheetFooter>
        <DaySaveButton dk={dk} title="Save" onPress={() => { ensureDay(dk).food.water = roundL(liters); save(); controls.closeAll(); }} />
      </SheetFooter>
    </View>
  );
}

/**
 * Daily water goal, edited from the water drawer. A `fitContent` card so the
 * whole thing rides up on the keyboard (see Sheet.tsx) instead of the input
 * disappearing behind it. Saving writes the clean-day protocol's water amount,
 * which is the one place the goal lives (`waterGoalL`) — so changing it here
 * changes the protocol requirement too. Whether water is an enabled requirement
 * is left exactly as the user set it in the protocol editor.
 */
function WaterGoalCard({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const inProtocol = useStore((s) => resolveProtocol(s.state.settings.protocol).water.enabled);
  const [text, setText] = useState(() => String(waterGoalL(getState().settings.protocol)));
  const liters = Math.max(0, parseFloat(text) || 0);
  const step = (dir: 1 | -1) => setText(String(roundL(Math.max(0, liters + dir * CUP_L))));
  const onSave = () => {
    const s = getState();
    const proto = resolveProtocol(s.settings.protocol);
    // Settings-only write: no ensureDay/mutate, so the O(history) memos keyed on
    // `days` don't recompute for a goal change.
    s.settings.protocol = { ...proto, water: { ...proto.water, liters: roundL(liters) } };
    save();
    controls.close();
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: 56 }}>Water goal</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18 }}>
        {inProtocol
          ? 'How much water you aim to drink each day. Water is part of your clean-day protocol, so this is the amount a clean day needs too.'
          : 'How much water you aim to drink each day. It also sets the amount your clean-day protocol would use if you turn its water requirement on.'}
      </Text>
      <FieldLabel>LITERS PER DAY</FieldLabel>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12 }}>
          <TextInput
            value={text}
            onChangeText={(t) => setText(onlyNumeric(t))}
            keyboardType="decimal-pad"
            keyboardAppearance="dark"
            placeholder="2.5"
            placeholderTextColor={p.textDim}
            selectTextOnFocus
            style={{ flex: 1, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: p.text }}
          />
          <Text style={{ color: p.textDim, fontSize: 15, fontWeight: '600' }}>L</Text>
        </View>
        <Pressable onPress={() => step(-1)} style={({ pressed }) => [{ width: 52, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
          <Text style={{ color: p.text, fontSize: 22, fontWeight: '600', lineHeight: 26 }}>−</Text>
        </Pressable>
        <Pressable onPress={() => step(1)} style={({ pressed }) => [{ width: 52, borderWidth: 1, borderColor: WATER_BLUE, backgroundColor: WATER_BLUE_SOFT, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
          <Text style={{ color: WATER_BLUE, fontSize: 22, fontWeight: '600', lineHeight: 26 }}>+</Text>
        </Pressable>
      </View>
      <Text style={{ color: p.textDim, fontSize: 13, marginTop: 10 }}>Steps adjust by 0.25 L (one cup).</Text>
      <SheetFooter>
        <Button title="Save goal" variant="primary" onPress={onSave} disabled={liters <= 0} />
      </SheetFooter>
    </View>
  );
}

/** Small visual for each stool type card — matches the Bristol range. */
function KindGlyph({ kind }: { kind: string }) {
  const dot = (size: number, color: string) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: color });
  switch (kind) {
    case 'Loose':
      return <View style={{ flexDirection: 'row', gap: 3 }}><View style={dot(9, GRADE_COLORS.bad)} /><View style={dot(9, GRADE_COLORS.bad)} /></View>;
    case 'Formed':
      return <View style={{ width: 22, height: 9, borderRadius: 5, backgroundColor: GRADE_COLORS.good }} />;
    case 'Hard':
      return <View style={{ flexDirection: 'row', gap: 3 }}><View style={dot(6, GRADE_COLORS.ok)} /><View style={dot(6, GRADE_COLORS.ok)} /></View>;
    default: // Diarrhea
      return (
        <Svg width={24} height={12} viewBox="0 0 24 12">
          <Path d="M1 6 C3.5 1.5, 6.5 1.5, 9 6 C11.5 10.5, 14.5 10.5, 17 6 C19 2.5, 21 2.5, 23 6" stroke={GRADE_COLORS.crash} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </Svg>
      );
  }
}

function BowelForm({ dk, existing, controls }: { dk: string; existing: Movement | null; controls: SheetControls }) {
  const p = usePalette();
  const [time, setTime] = useState(existing?.time || defaultTimeFor(dk));
  const [kind, setKind] = useState(existing?.kind || 'Loose');
  const [volume, setVolume] = useState(existing?.volume || 'Small pieces');
  const [strain, setStrain] = useState<'none' | 'mild' | 'severe'>(
    existing?.straining === 'severe' ? 'severe' : existing?.straining ? 'mild' : 'none',
  );
  const save2 = () => {
    const m: Movement = { ...existing, id: existing?.id || uid(), time, kind, volume, straining: strain === 'none' ? false : strain };
    const dig = ensureDay(dk).digestion;
    const i = dig.movements.findIndex((x) => x.id === m.id);
    if (i >= 0) dig.movements[i] = m; else dig.movements.push(m);
    save();
    controls.closeAll();
  };
  const card = (active: boolean) => ({
    borderWidth: 1, borderRadius: radius.control, padding: 13,
    borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2,
  });
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{(existing ? 'Edit ' : '') + 'Bowel movement'}</Text>
      <TimeField label="Time" value={time} onChange={setTime} />
      <FieldLabel>Type</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {BM_KINDS.map((k) => {
          const active = k.val === kind;
          return (
            <Pressable key={k.val} onPress={() => setKind(k.val)} style={[card(active), { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <View style={{ width: 26, alignItems: 'center' }}><KindGlyph kind={k.val} /></View>
              <View>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: active ? '700' : '600' }}>{k.val}</Text>
                <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>{k.bristol}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <FieldLabel>Volume</FieldLabel>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {BM_VOLUMES.map((v) => {
          const active = v.val === volume;
          return (
            <Pressable key={v.val} onPress={() => setVolume(v.val)} style={[card(active), { flex: 1, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 12 }]}>
              <View style={{ height: 28, justifyContent: 'center' }}>
                <View style={{ width: v.dot, height: v.dot, borderRadius: v.dot / 2, backgroundColor: active ? p.accent : p.textDim, opacity: active ? 1 : 0.55 }} />
              </View>
              <Text style={{ color: active ? p.text : p.textDim, fontSize: 13, fontWeight: active ? '700' : '500', textAlign: 'center', marginTop: 4 }}>{v.val}</Text>
            </Pressable>
          );
        })}
      </View>
      <FieldLabel>Straining</FieldLabel>
      <Segmented
        options={[{ val: 'none', label: 'None' }, { val: 'mild', label: 'Mild' }, { val: 'severe', label: 'Severe' }]}
        value={strain}
        onChange={setStrain}
      />
      <SheetFooter>
        {existing ? <Button title="Delete" variant="danger" onPress={() => { const dig = ensureDay(dk).digestion; dig.movements = dig.movements.filter((x) => x.id !== existing.id); save(); controls.closeAll(); }} /> : null}
        <DaySaveButton dk={dk} title="Save" onPress={save2} />
      </SheetFooter>
    </View>
  );
}

export { bmLabel };
