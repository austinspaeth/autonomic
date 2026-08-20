/**
 * Multi-select logging sheet shared by Medications & Supplements, Symptoms and
 * Triggers, replacing the one-at-a-time TypePicker flows. Two modes:
 *
 *  · Log mode — search box ("Search or add a new one"), checkbox rows, and a
 *    footer button that logs every checked item in one tap. A query that
 *    matches nothing offers to create it (via a small add card) and
 *    auto-selects it. Checking something already logged today shows an orange
 *    caution but still allows it.
 *  · Edit mode — entered via "Edit … list": search and checkboxes drop away,
 *    every row gains edit + delete actions, and an "Add a new item" row
 *    appears at the top. Deletes confirm inline (irreversible, and allowed
 *    even for types with journal history — the Journal skips orphaned rows);
 *    edit/add open a small card for the name (+ default dose for meds).
 *
 * Meds and symptoms log day-array entries; triggers set day.food.triggers[k].
 */
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { TextField } from '../components/Field';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import type { Entry } from '../lib/types';
import { addCustomType, deleteType, editType, typeInUse, typesFor } from '../lib/typeCatalog';
import { ensureDay, getState, save, upsertEntry, useAppState } from '../store/store';
import { defaultTimeFor, uid } from '../lib/dates';

export type LogKind = 'meds' | 'symptoms' | 'triggers';

const COPY: Record<LogKind, {
  logTitle: string; logSub: string; zeroLabel: string; editListLabel: string; editSub: string;
  cardAddTitle: string; cardEditTitle: string; namePlaceholder: string;
}> = {
  meds: {
    logTitle: 'What did you take?',
    logSub: 'Select everything you took, then log it together.',
    zeroLabel: 'Select what you took',
    editListLabel: 'Edit medication list',
    editSub: 'Rename, change a dose, or remove items.',
    cardAddTitle: 'New medication or supplement',
    cardEditTitle: 'Edit medication',
    namePlaceholder: 'e.g. Magnesium Taurate',
  },
  symptoms: {
    logTitle: 'What are you feeling?',
    logSub: 'Select every symptom that applies.',
    zeroLabel: 'Select your symptoms',
    editListLabel: 'Edit symptom list',
    editSub: 'Rename or remove symptoms.',
    cardAddTitle: 'New symptom',
    cardEditTitle: 'Edit symptom',
    namePlaceholder: 'e.g. Brain fog',
  },
  triggers: {
    logTitle: 'Any triggers today?',
    logSub: 'Select everything you were exposed to.',
    zeroLabel: 'Select your triggers',
    editListLabel: 'Edit trigger list',
    editSub: 'Rename or remove triggers.',
    cardAddTitle: 'New trigger',
    cardEditTitle: 'Edit trigger',
    namePlaceholder: 'e.g. Spicy food',
  },
};

/** Orange caution tint (GRADE_COLORS.bad) for the "already logged" note. */
const CAUTION = '#f97316';

const SPRING = LinearTransition.springify().damping(24).stiffness(260);

/** Shared height for the search bar and the edit-mode "Add a new item" row, so
 *  flipping modes swaps them in place without the list shifting. */
const BAR_H = 46;

/** Fixed row height, tall enough for the edit-mode action buttons (38px), so
 *  rows keep the same height in both modes. */
const ROW_H = 58;

/** Small stacked card that adds or edits one type (name, + default dose for
 *  meds). Add mode reports the new key back so log mode can auto-select it. */
function TypeCard({ kind, typeKey, initialName, onAdded }: {
  kind: LogKind; typeKey?: string; initialName?: string; onAdded?: (key: string) => void;
}) {
  const p = usePalette();
  const toast = useToast();
  const { closeSheet } = useSheets();
  const copy = COPY[kind];
  const def = typeKey ? typesFor(getState(), kind)[typeKey] : undefined;
  const [name, setName] = useState(def?.label ?? initialName ?? '');
  const [dosage, setDosage] = useState(def?.dosage || '');

  const save = () => {
    if (typeKey) {
      if (!editType(kind, typeKey, name, { dosage })) {
        toast(name.trim() ? 'That name already exists' : 'Enter a name');
        return;
      }
      toast('Saved');
    } else {
      const key = addCustomType(kind, name, { dosage });
      if (!key) { toast(name.trim() ? 'That name already exists' : 'Enter a name'); return; }
      onAdded?.(key);
    }
    closeSheet();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>
        {typeKey ? copy.cardEditTitle : copy.cardAddTitle}
      </Text>
      <TextField label="Name" value={name} onChange={setName} placeholder={copy.namePlaceholder} />
      {kind === 'meds' && <TextField label="Default dose" value={dosage} onChange={setDosage} placeholder="e.g. 400mg" />}
      <SheetFooter>
        <Button title={typeKey ? 'Save' : 'Add'} variant="primary" onPress={save} />
      </SheetFooter>
    </View>
  );
}

function Checkbox({ on }: { on: boolean }) {
  const p = usePalette();
  return (
    <View style={{
      width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accent : 'transparent',
    }}>
      {on ? <Icon name="check" size={14} color="#fff" /> : null}
    </View>
  );
}

/** Edit/delete circular icon button on an edit-mode row. */
function RowAction({ icon, label, onPress }: {
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

export function LogPickerSheet({ kind, dk, controls }: { kind: LogKind; dk: string; controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const { openSheet } = useSheets();
  const copy = COPY[kind];
  const [mode, setMode] = useState<'log' | 'edit'>('log');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const isEdit = mode === 'edit';
  const typeMap = typesFor(state, kind);
  const q = query.trim();
  const keys = Object.keys(typeMap);
  const results = isEdit || !q ? keys : keys.filter((k) => typeMap[k].label.toLowerCase().includes(q.toLowerCase()));
  const exists = !!q && keys.some((k) => typeMap[k].label.toLowerCase() === q.toLowerCase());
  const count = keys.filter((k) => sel[k]).length;
  const day = state.days[dk];
  const loggedToday = kind === 'triggers'
    ? new Set(Object.keys(day?.food?.triggers || {}).filter((k) => (day?.food?.triggers?.[k] || 0) > 0))
    : new Set((day?.[kind] || []).map((e) => e.type));

  const checkKey = (key: string) => setSel((prev) => ({ ...prev, [key]: true }));

  const openAddCard = (initialName?: string, onAdded?: (key: string) => void) =>
    openSheet(() => <TypeCard kind={kind} initialName={initialName} onAdded={onAdded} />, { fitContent: true });

  const logSelected = () => {
    if (!count) return;
    const picked = keys.filter((k) => sel[k]);
    if (kind === 'triggers') {
      const trigs = ensureDay(dk).food.triggers;
      picked.forEach((k) => { trigs[k] = 1; });
      save();
    } else {
      picked.forEach((k) => {
        const entry: Entry = { id: uid(), type: k, time: defaultTimeFor(dk), note: '' };
        if (kind === 'meds' && typeMap[k].dosage) entry.amount = typeMap[k].dosage;
        upsertEntry(dk, kind, entry);
      });
    }
    toast(count === 1 ? 'Logged 1 item' : `Logged ${count} items`);
    controls.closeAll();
  };

  return (
    <View>
      <Animated.View layout={SPRING}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, paddingRight: 56 }}>
          {isEdit ? 'Edit your list' : copy.logTitle}
        </Text>
        <Text style={{ color: p.textDim, fontSize: 14, marginTop: 2, marginBottom: 14 }}>
          {isEdit ? copy.editSub : copy.logSub}
        </Text>
      </Animated.View>

      {/* search (log mode only) */}
      {!isEdit && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          layout={SPRING}
          style={{ height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.surface2, borderColor: q ? p.accent : p.border, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, marginBottom: 10 }}
        >
          <Icon name="search" size={17} color={p.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search or add a new one"
            placeholderTextColor={p.textDim}
            style={{ flex: 1, paddingVertical: 0, fontSize: 16, color: p.text }}
          />
        </Animated.View>
      )}

      {/* create-and-select row (log mode, no exact match) */}
      {!isEdit && !!q && !exists && (
        <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} layout={SPRING}>
          <Pressable
            onPress={() => openAddCard(q, (key) => { checkKey(key); setQuery(''); })}
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.accentSoft, borderWidth: 1, borderColor: 'rgba(224,49,39,0.4)', borderRadius: radius.card, padding: 12, marginBottom: 10 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(224,49,39,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={18} color={p.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{`Add “${q}”`}</Text>
              <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>Adds it to your list and selects it</Text>
            </View>
          </Pressable>
        </Animated.View>
      )}

      {/* add-a-new-item row (edit mode) — swaps in for the search bar with no
          animation of its own */}
      {isEdit && (
        <View>
          <Pressable
            onPress={() => openAddCard()}
            style={({ pressed }) => [
              { height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(224,49,39,0.55)', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.control, paddingHorizontal: 12, marginBottom: 10 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={15} color={p.accent} />
            </View>
            <Text style={{ flex: 1, color: p.text, fontSize: 15, fontWeight: '600' }}>Add a new item</Text>
          </Pressable>
        </View>
      )}

      {/* rows */}
      {results.map((k, i) => {
        const def = typeMap[k];
        const on = !isEdit && !!sel[k];
        const caution = on && loggedToday.has(k);
        const used = typeInUse(state, kind, k);
        if (isEdit && confirmKey === k) {
          return (
            <Animated.View
              key={k}
              entering={FadeIn.duration(160)}
              layout={SPRING}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.accentSoft, borderWidth: 1, borderColor: 'rgba(224,49,39,0.35)', borderRadius: radius.card, padding: 11, marginVertical: 6 }}
            >
              <Text style={{ flex: 1, color: p.textDim, fontSize: 13.5 }}>
                Delete <Text style={{ color: p.text, fontWeight: '700' }}>{def.label}</Text>?{' '}
                {used ? 'Its past journal logs will be hidden too. Not reversible.' : 'Not reversible.'}
              </Text>
              <Button title="Keep" style={{ flex: 0, paddingVertical: 8, paddingHorizontal: 13 }} onPress={() => setConfirmKey(null)} />
              <Button title="Delete" variant="danger" style={{ flex: 0, paddingVertical: 8, paddingHorizontal: 13 }} onPress={() => {
                deleteType(kind, k);
                setSel((prev) => { const next = { ...prev }; delete next[k]; return next; });
                setConfirmKey(null);
                toast(`Deleted ${def.label}`);
              }} />
            </Animated.View>
          );
        }
        return (
          <Animated.View key={k} layout={SPRING} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            {/* The highlight bleeds outward (negative margin + matching padding)
                so row content never shifts between checked and unchecked. */}
            <View style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border }}>
              <View style={{ marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radius.control, backgroundColor: on ? p.accentSoft : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => { if (!isEdit) setSel((prev) => ({ ...prev, [k]: !prev[k] })); }}
                  disabled={isEdit}
                  accessibilityRole={isEdit ? undefined : 'checkbox'}
                  accessibilityState={isEdit ? undefined : { checked: on }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: ROW_H }}
                >
                  {!isEdit && (
                    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
                      <Checkbox on={on} />
                    </Animated.View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: p.text, fontSize: 16 }}>{def.label}</Text>
                    {def.dosage ? <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{def.dosage}</Text> : null}
                  </View>
                </Pressable>
                {isEdit && (
                  <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ flexDirection: 'row', gap: 8 }}>
                    <RowAction icon="edit" label={`Edit ${def.label}`} onPress={() => openSheet(() => <TypeCard kind={kind} typeKey={k} />, { fitContent: true })} />
                    <RowAction icon="trash" label={`Delete ${def.label}`} onPress={() => setConfirmKey(k)} />
                  </Animated.View>
                )}
              </View>
              {caution && (
                <Animated.View
                  entering={FadeInDown.duration(160)}
                  exiting={FadeOut.duration(120)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 11, paddingLeft: 37 }}
                >
                  <Icon name="alert" size={14} color={CAUTION} />
                  <Text style={{ flex: 1, color: CAUTION, fontSize: 12.5 }}>Heads up: you already logged this today.</Text>
                </Animated.View>
              )}
              </View>
            </View>
          </Animated.View>
        );
      })}

      {!isEdit && results.length === 0 && (
        <Animated.View entering={FadeIn.duration(160)} layout={SPRING}>
          <Text style={{ color: p.textDim, fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>
            Nothing matches. Add it with the button above.
          </Text>
        </Animated.View>
      )}

      <SheetFooter>
        <View style={{ flex: 1, gap: 9 }}>
          {isEdit ? (
            <Button title="Done editing" variant="primary" onPress={() => { setConfirmKey(null); setMode('log'); }} />
          ) : (
            <>
              <Button
                title={count === 0 ? copy.zeroLabel : count === 1 ? 'Log 1 item' : `Log ${count} items`}
                variant="primary"
                disabled={count === 0}
                onPress={logSelected}
              />
              <Button title={copy.editListLabel} onPress={() => { setQuery(''); setMode('edit'); }} />
            </>
          )}
        </View>
      </SheetFooter>
    </View>
  );
}
