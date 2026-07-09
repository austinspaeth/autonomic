/**
 * Manage-types sheet: stacked over a TypePicker. Top section creates a new
 * user-defined type (name, plus dosage for medications); below it, every
 * available type is listed and any type that has never been logged can be
 * deleted (custom types are removed; built-ins are hidden).
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TextField } from '../components/Field';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { addCustomType, deleteType, typeInUse, typesFor, type TypeKind } from '../lib/typeCatalog';
import { useAppState } from '../store/store';

const COPY: Record<TypeKind, { title: string; nameLabel: string; noun: string }> = {
  activities: { title: 'New activity type', nameLabel: 'Activity name', noun: 'activity' },
  meds: { title: 'New medication or supplement', nameLabel: 'Name', noun: 'medication' },
  symptoms: { title: 'New symptom', nameLabel: 'Symptom name', noun: 'symptom' },
  triggers: { title: 'New trigger', nameLabel: 'Trigger name', noun: 'trigger' },
};

export function ManageTypesSheet({ kind }: { kind: TypeKind }) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const copy = COPY[kind];
  const all = typesFor(state, kind);

  const add = () => {
    const key = addCustomType(kind, name, { dosage });
    if (!key) { toast(name.trim() ? 'That name already exists' : 'Enter a name'); return; }
    setName('');
    setDosage('');
    toast(`Added ${copy.noun}`);
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{copy.title}</Text>
      <TextField label={copy.nameLabel} value={name} onChange={setName} placeholder={`e.g. ${kind === 'meds' ? 'Magnesium Taurate' : kind === 'activities' ? 'Rowing' : kind === 'symptoms' ? 'Brain fog' : 'Spicy food'}`} />
      {kind === 'meds' && <TextField label="Dosage" value={dosage} onChange={setDosage} placeholder="e.g. 400mg" />}
      <View style={{ marginTop: 4, marginBottom: 20 }}>
        <Button title="Add" variant="primary" onPress={add} />
      </View>

      <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: p.textDim, marginBottom: 4 }}>Available</Text>
      {Object.keys(all).map((k) => {
        const def = all[k];
        const used = typeInUse(state, kind, k);
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: p.border }}>
            <Icon name={def.icon as never} size={20} color={p.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 16 }}>{def.label}</Text>
              {def.dosage ? <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{def.dosage}</Text> : null}
            </View>
            {!used && (
              <Pressable
                onPress={() => { deleteType(kind, k); toast(`Deleted ${def.label}`); }}
                hitSlop={8}
                accessibilityLabel={`Delete ${def.label}`}
                style={({ pressed }) => [{ width: 32, height: 32, borderRadius: radius.control, backgroundColor: p.surface2, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
              >
                <Icon name="trash" size={16} color={p.textDim} />
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={{ height: 12 }} />
    </View>
  );
}
