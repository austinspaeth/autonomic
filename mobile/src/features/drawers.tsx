/**
 * Water/trigger/bowel drawers — ported from the PWA's waterDrawer,
 * triggerMenu, bowelForm.
 */
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { FieldInputs, TextField, useFormState } from '../components/Field';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { radius, usePalette } from '../theme';
import { BM_FIELDS, TRIGGER_TYPES, bmLabel, isDivider } from '../lib/registry';
import { ensureDay, getState, save } from '../store/store';
import { nowTime, uid } from '../lib/dates';
import type { Movement } from '../lib/types';

export function useDrawers(dk: string) {
  const { openSheet } = useSheets();
  return {
    water: () => openSheet((c) => <WaterDrawer dk={dk} controls={c} />),
    triggers: () => openSheet(() => <TriggerPicker dk={dk} />),
    bowel: (existing: Movement | null) => openSheet((c) => <BowelForm dk={dk} existing={existing} controls={c} />),
  };
}

function WaterDrawer({ dk, controls }: { dk: string; controls: SheetControls }) {
  const p = usePalette();
  const [text, setText] = useState(String(+((getState().days[dk]?.food.water) || 0)));
  const liters = Math.max(0, parseFloat(text) || 0);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Water</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 22 }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const full = liters >= i + 1;
          return (
            <Pressable key={i} onPress={() => setText(String(liters === i + 1 ? i : i + 1))} style={{ flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: full ? p.accent : p.border, backgroundColor: full ? p.accentSoft : p.surface2, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="cup" size={30} color={full ? p.accent : p.textDim} />
            </Pressable>
          );
        })}
      </View>
      <TextField label="Liters" value={text} onChange={setText} keyboardType="decimal-pad" />
      <SheetFooter>
        <Button title="Save" variant="primary" onPress={() => { ensureDay(dk).food.water = liters; save(); controls.closeAll(); }} />
      </SheetFooter>
    </View>
  );
}

function TriggerPicker({ dk }: { dk: string }) {
  const p = usePalette();
  const { closeSheet } = useSheets();
  const [q, setQ] = useState('');
  const types = Object.keys(TRIGGER_TYPES).filter((t) => TRIGGER_TYPES[t].label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Add trigger</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Filter…" placeholderTextColor={p.textDim} style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 17, color: p.text, marginBottom: 8 }} />
      {types.map((t) => (
        <Pressable key={t} onPress={() => { ensureDay(dk).food.triggers[t] = 1; save(); closeSheet(); }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
          <Icon name="alert" size={22} color={p.textDim} />
          <Text style={{ color: p.text, fontSize: 17 }}>{TRIGGER_TYPES[t].label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function BowelForm({ dk, existing, controls }: { dk: string; existing: Movement | null; controls: SheetControls }) {
  const p = usePalette();
  const initial = existing || { id: uid(), time: nowTime() };
  const [form, set] = useFormState(BM_FIELDS, initial as never);
  const save2 = () => {
    const m: Movement = { id: (initial as Movement).id };
    BM_FIELDS.forEach((f) => {
      if (isDivider(f) || !f.key) return;
      if (f.type === 'check') (m as never as Record<string, unknown>)[f.key] = !!form[f.key];
      else (m as never as Record<string, unknown>)[f.key] = String(form[f.key] ?? '').trim();
    });
    const dig = ensureDay(dk).digestion;
    const i = dig.movements.findIndex((x) => x.id === m.id);
    if (i >= 0) dig.movements[i] = m; else dig.movements.push(m);
    save();
    controls.closeAll();
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{(existing ? 'Edit ' : '') + 'Bowel movement'}</Text>
      <FieldInputs fields={BM_FIELDS} form={form} set={set} />
      <SheetFooter>
        {existing ? <Button title="Delete" variant="danger" onPress={() => { const dig = ensureDay(dk).digestion; dig.movements = dig.movements.filter((x) => x.id !== existing.id); save(); controls.closeAll(); }} /> : null}
        <Button title="Save" variant="primary" onPress={save2} />
      </SheetFooter>
    </View>
  );
}

export { bmLabel };
