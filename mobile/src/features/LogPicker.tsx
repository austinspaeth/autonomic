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
 *    every row gains edit + delete actions, and the Activity types sheet's
 *    "New …" add box appears at the top. Deletes confirm inline (irreversible, and allowed
 *    even for types with journal history — the Journal skips orphaned rows);
 *    edit (and log mode's create-and-select) open a small card for the name
 *    (+ default dose for meds).
 *
 * Meds and symptoms log day-array entries; triggers set day.food.triggers[k]
 * and one log per trigger (lib/triggerLogs). Triggers and symptoms then open
 * `LogGroupCard` for the group's time and note.
 */
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { TextField } from '../components/Field';
import { Button, Checkbox, DaySaveButton } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import type { Entry } from '../lib/types';
import { addCustomType, deleteType, editType, typeInUse, typesFor } from '../lib/typeCatalog';
import { loadOf, type LoadWeight } from '../lib/budget/load';
import { ensureDay, getState, save, upsertEntry, useAppState } from '../store/store';
import { pingLogged } from '../store/ping';
import { defaultTimeFor, isPastDay, uid } from '../lib/dates';
import { logTriggers } from '../lib/triggerLogs';
import { LogGroupCard, logGroupSheetOptions, type LogGroup } from './LogGroupCard';
import { availableLabel, NewTypeBox, RowAction, TypeSectionLabel } from './TypeManager';

export type LogKind = 'meds' | 'symptoms' | 'triggers';

const COPY: Record<LogKind, {
  logTitle: string; logTitlePast: string; logSub: string; zeroLabel: string; editListLabel: string; editSub: string;
  cardAddTitle: string; cardEditTitle: string; namePlaceholder: string;
}> = {
  meds: {
    logTitle: 'What did you take?',
    logTitlePast: 'What did you take that day?',
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
    logTitlePast: 'What were you feeling?',
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
    logTitlePast: 'Any triggers that day?',
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

/** Height of the log-mode search bar. */
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
  // LogPicker only ever creates meds/symptoms/triggers, so there is no effort
  // question here; the weight is carried so an edit cannot drop it.
  const [load] = useState<LoadWeight>(() => loadOf(def, typeKey || ''));

  const save = () => {
    if (typeKey) {
      if (!editType(kind, typeKey, name, { dosage, load })) {
        toast(name.trim() ? 'That name already exists' : 'Enter a name');
        return;
      }
      toast('Saved');
    } else {
      const key = addCustomType(kind, name, { dosage, load });
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

export function LogPickerSheet({ kind, dk, controls }: { kind: LogKind; dk: string; controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const { openSheet } = useSheets();
  const copy = COPY[kind];
  const [mode, setMode] = useState<'log' | 'edit'>('log');
  const [query, setQuery] = useState('');
  const searchRef = React.useRef<TextInput>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const isEdit = mode === 'edit';
  // Back-dated day: the copy can't say "today", and the footer commits in gold.
  const past = isPastDay(dk);
  const typeMap = typesFor(state, kind);
  const q = query.trim();
  // Cycle symptoms are offered only while cycle-aware tracking is on, unless
  // one is already logged on this day (it must stay reachable to edit).
  const cycleOn = !!state.settings.cycle?.enabled;
  const dayTypes = new Set((state.days[dk]?.[kind === 'triggers' ? 'symptoms' : kind] || []).map((e) => e.type));
  const keys = Object.keys(typeMap).filter((k) => cycleOn || !typeMap[k].cycle || dayTypes.has(k));
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
    // Triggers and symptoms are followed by the group card: what went in
    // together, over a time and a note for all of it. It stacks on this picker
    // and takes the whole stack with it when it closes, since the picker
    // underneath is finished with.
    const openGroup = (group: LogGroup) => openSheet(
      (c) => <LogGroupCard dk={dk} group={group} fresh controls={c} />,
      { ...logGroupSheetOptions(picked.length), dismissAll: true },
    );
    if (kind === 'triggers') {
      const logs = logTriggers(ensureDay(dk).food, picked, defaultTimeFor(dk));
      save();
      openGroup({ kind, logIds: logs.map((l) => l.id) });
      return;
    }
    const ids = picked.map((k) => {
      const entry: Entry = { id: uid(), type: k, time: defaultTimeFor(dk), note: '' };
      if (kind === 'meds' && typeMap[k].dosage) entry.amount = typeMap[k].dosage;
      upsertEntry(dk, kind, entry);
      return entry.id;
    });
    pingLogged(kind);
    if (kind === 'symptoms') { openGroup({ kind, ids }); return; }
    toast(count === 1 ? 'Logged 1 item' : `Logged ${count} items`);
    controls.closeAll();
  };

  return (
    <View>
      <Animated.View layout={SPRING}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, paddingRight: 56 }}>
          {isEdit ? 'Edit your list' : past ? copy.logTitlePast : copy.logTitle}
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
          style={{ height: BAR_H, backgroundColor: p.surface2, borderColor: q ? p.accent : p.border, borderWidth: 1, borderRadius: radius.control, marginBottom: 10 }}
        >
          {/* The whole bar focuses the field: the input is one line tall inside
           *  a 46pt box, so the icon and the space around the text used to be
           *  dead. The input stretches, and this catches what is left. */}
          <Pressable
            onPress={() => searchRef.current?.focus()}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }}
          >
            <Icon name="search" size={17} color={p.textDim} />
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search or add a new one"
              placeholderTextColor={p.textDim}
              style={{ flex: 1, alignSelf: 'stretch', paddingVertical: 0, fontSize: 16, color: p.text }}
            />
          </Pressable>
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

      {/* add form + list heading (edit mode): the Activity types sheet's own
          box, so every list in the app is added to the same way. */}
      {isEdit && (
        <Animated.View entering={FadeIn.duration(160)} layout={SPRING}>
          <NewTypeBox kind={kind} />
          <TypeSectionLabel>{availableLabel(kind)}</TypeSectionLabel>
        </Animated.View>
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
                  <Text style={{ flex: 1, color: CAUTION, fontSize: 12.5 }}>{`Heads up: you already logged this ${past ? 'day' : 'today'}.`}</Text>
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
              {/* Nothing selected: the button is a prompt, not an action, so
                  it stays neutral rather than announcing a day it won't write
                  to. Once something IS selected it becomes a commit, and on a
                  back-dated day it says which day it commits to. */}
              {count === 0 ? (
                <Button title={copy.zeroLabel} variant="primary" disabled onPress={logSelected} />
              ) : (
                <DaySaveButton
                  dk={dk}
                  title={count === 1 ? 'Log 1 item' : `Log ${count} items`}
                  onPress={logSelected}
                />
              )}
              <Button title={copy.editListLabel} onPress={() => { setQuery(''); setMode('edit'); }} />
            </>
          )}
        </View>
      </SheetFooter>
    </View>
  );
}
