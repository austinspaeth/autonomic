/**
 * Manage-types sheet: stacked over a TypePicker. Top section creates a new
 * user-defined type (name, plus dosage for medications); below it, every
 * available type is listed and any type that has never been logged can be
 * deleted (custom types are removed; built-ins are hidden).
 */
import React, { useState } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { Button, Segmented } from '../components/ui';
import { SheetFooter, useSheets, type SheetControls } from '../components/Sheet';
import { useDeleteButton } from './EntryForm';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { addCustomType, deleteType, editType, typeInUse, typesFor, type TypeKind } from '../lib/typeCatalog';
import { loadOf, type LoadWeight } from '../lib/budget/load';
import { useAppState } from '../store/store';

const COPY: Record<TypeKind, { title: string; nameLabel: string; noun: string; add: string; heading: string }> = {
  activities: { title: 'Activity types', nameLabel: 'Activity name', noun: 'activity', add: 'Add activity type', heading: 'New activity type' },
  meds: { title: 'Medications & supplements', nameLabel: 'Name', noun: 'medication', add: 'Add medication or supplement', heading: 'New medication or supplement' },
  symptoms: { title: 'Symptoms', nameLabel: 'Symptom name', noun: 'symptom', add: 'Add symptom', heading: 'New symptom' },
  triggers: { title: 'Triggers', nameLabel: 'Trigger name', noun: 'trigger', add: 'Add trigger', heading: 'New trigger' },
};

/** Edit card stacked over the manage sheet: rename a type or (for meds) change
 *  its default dose. Deletes from here too, when the type has never been logged. */
function EditTypeSheet({ kind, typeKey, controls }: { kind: TypeKind; typeKey: string; controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const { closeSheet } = useSheets();
  const copy = COPY[kind];
  const def = typesFor(state, kind)[typeKey];
  const [name, setName] = useState(def?.label || '');
  const [dosage, setDosage] = useState(def?.dosage || '');
  const [load, setLoad] = useState<LoadWeight>(() => loadOf(def, typeKey));
  const used = !!def && typeInUse(state, kind, typeKey);
  // Only the edit card goes: the manage list beneath is still a real list.
  useDeleteButton(controls, def && !used ? {
    title: `Delete ${def.label}?`,
    message: `It will be removed from your ${copy.noun} list.`,
    onConfirm: () => { deleteType(kind, typeKey); toast(`Deleted ${def.label}`); controls.close(); },
  } : null);
  if (!def) return null;

  const save = () => {
    if (!editType(kind, typeKey, name, { dosage, load })) {
      toast(name.trim() ? 'That name already exists' : 'Enter a name');
      return;
    }
    toast('Saved');
    closeSheet();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{`Edit ${copy.noun}`}</Text>
      <TextField label={copy.nameLabel} value={name} onChange={setName} />
      {kind === 'meds' && <TextField label="Default dose" value={dosage} onChange={setDosage} placeholder="e.g. 400mg" />}
      {kind === 'activities' && def.userDefined ? <EffortField value={load} onChange={setLoad} /> : null}
      <SheetFooter>
        <Button title="Save" variant="primary" onPress={save} />
      </SheetFooter>
    </View>
  );
}


/**
 * How much a minute of a user-created activity costs the pacing budget.
 *
 * Four words rather than a number, asked once. Nobody can pick 1.4 for
 * gardening, and the weight table only ever needed these buckets — see
 * src/lib/budget/load.ts, which is where the built-in types get theirs. Rest
 * is the one that REFUNDS: a nap or lying down buys minutes back, and every
 * analysis reads it as rest rather than as exercise (`isRestType`).
 */
const EFFORTS: { val: LoadWeight; label: string; desc: string }[] = [
  { val: 'rest', label: 'Rest', desc: 'Rest. Gives minutes back to your pacing budget.' },
  { val: 'light', label: 'Light', desc: 'Light. A small draw on your pacing budget.' },
  { val: 'moderate', label: 'Moderate', desc: 'Moderate. A steady draw on your pacing budget.' },
  { val: 'heavy', label: 'Heavy', desc: 'Heavy. A large draw on your pacing budget.' },
];
const EFFORT_BARS = [7, 11, 15, 19];
/** The list's effort word. Only built-ins can be Strenuous; the picker stops at Heavy. */
const EFFORT_WORD: Record<LoadWeight, string> = { rest: 'Rest', light: 'Light', moderate: 'Moderate', heavy: 'Heavy', strenuous: 'Strenuous' };

export function EffortField({ value, onChange }: { value: LoadWeight; onChange: (v: LoadWeight) => void }) {
  const p = usePalette();
  const level = Math.max(0, EFFORTS.findIndex((e) => e.val === value));
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 4, marginTop: 8, marginBottom: 10 }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>Effort</Text>
        <Text style={{ color: p.textFaint, fontSize: 12.5 }}>Used by pacing</Text>
      </View>
      <Segmented options={EFFORTS} value={value} onChange={onChange} />
      {/* One line saying what the level costs, with a meter that fills a bar per
          step so the four words read as a scale. Rest fills none: it refunds. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.sunk, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 14, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 19 }}>
          {EFFORT_BARS.map((h, i) => (
            <View key={h} style={{ width: 5, height: h, borderRadius: 2.5, backgroundColor: i < level ? p.text : 'rgba(255,255,255,0.12)' }} />
          ))}
        </View>
        <Text style={{ flex: 1, color: p.textDim, fontSize: 14, lineHeight: 19 }}>{EFFORTS[level].desc}</Text>
      </View>
    </View>
  );
}

/** Edit/delete square icon button on a manage-list row (shared with the
 *  meds / symptoms / triggers picker's edit mode). */
export function RowAction({ icon, label, onPress }: {
  icon: 'edit' | 'trash'; label: string; onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, alignItems: 'center', justifyContent: 'center' },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name={icon} size={16} color={p.textDim} />
    </Pressable>
  );
}

/** The all-caps grey label over each part of a manage sheet ("NEW SYMPTOM",
 *  "AVAILABLE SYMPTOMS"). */
export function TypeSectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Text style={[{ fontSize: 14, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: p.textDim, marginBottom: 4 }, style]}>{children}</Text>;
}

/** "Available activity types" — the heading over the list a manage sheet edits. */
export const availableLabel = (kind: TypeKind) => `Available ${COPY[kind].title.toLowerCase()}`;

/**
 * The add form at the top of a manage sheet, set apart from the list under it
 * (the POTS episode card's box, a step lighter). Shared by the Activity types
 * sheet and the meds / symptoms / triggers picker's edit mode, so every list
 * is added to the same way; each kind asks only what it needs.
 */
export function NewTypeBox({ kind }: { kind: TypeKind }) {
  const p = usePalette();
  const toast = useToast();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [load, setLoad] = useState<LoadWeight>('moderate');
  const copy = COPY[kind];

  const add = () => {
    const key = addCustomType(kind, name, { dosage, load });
    if (!key) { toast(name.trim() ? 'That name already exists' : 'Enter a name'); return; }
    setName('');
    setDosage('');
    setLoad('moderate');
    toast(`Added ${copy.noun}`);
  };

  return (
    <View style={{ padding: 14, marginBottom: 20, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}>
      <TypeSectionLabel style={{ marginBottom: 12 }}>{copy.heading}</TypeSectionLabel>
      <TextField label={copy.nameLabel} value={name} onChange={setName} placeholder={`e.g. ${kind === 'meds' ? 'Magnesium Taurate' : kind === 'activities' ? 'Rowing' : kind === 'symptoms' ? 'Brain fog' : 'Spicy food'}`} />
      {kind === 'meds' && <TextField label="Dosage" value={dosage} onChange={setDosage} placeholder="e.g. 400mg" />}
      {kind === 'activities' && <EffortField value={load} onChange={setLoad} />}
      <View style={{ marginTop: 4 }}>
        <Button title={copy.add} variant="primary" onPress={add} />
      </View>
    </View>
  );
}

export function ManageTypesSheet({ kind }: { kind: TypeKind }) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const { openSheet } = useSheets();
  const all = typesFor(state, kind);

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{COPY[kind].title}</Text>
      <NewTypeBox kind={kind} />

      <TypeSectionLabel>{availableLabel(kind)}</TypeSectionLabel>
      {Object.keys(all).filter((k) => !all[k].cycle || !!state.settings.cycle?.enabled || typeInUse(state, kind, k)).map((k, i) => {
        const def = all[k];
        const used = typeInUse(state, kind, k);
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border }}>
            <Icon name={def.icon as never} size={20} color={p.textDim} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: p.text, fontSize: 16 }}>{def.label}</Text>
              {def.dosage ? <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{def.dosage}</Text> : null}
            </View>
            {kind === 'activities' ? <Text style={{ color: p.textDim, fontSize: 13 }}>{EFFORT_WORD[loadOf(def, k)]}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <RowAction icon="edit" label={`Edit ${def.label}`} onPress={() => openSheet((c) => <EditTypeSheet kind={kind} typeKey={k} controls={c} />)} />
              {!used && <RowAction icon="trash" label={`Delete ${def.label}`} onPress={() => { deleteType(kind, k); toast(`Deleted ${def.label}`); }} />}
            </View>
          </View>
        );
      })}
      <View style={{ height: 12 }} />
    </View>
  );
}
