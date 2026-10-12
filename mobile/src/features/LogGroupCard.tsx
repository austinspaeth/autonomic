/**
 * The card that follows a multi-select log: what was just logged together, as
 * one group, over the time and note that belong to all of it.
 *
 * By the time it opens the items are already in the journal (the picker's
 * button is the commit), so closing it loses nothing: it is where a time and a
 * note are added, not a second confirmation. Each item is logged SEPARATELY
 * and the time and note are written to every one of them: a trigger is its own
 * `food.triggerLogs` row and reopens this card for itself alone, a symptom is
 * an ordinary entry and opens its own edit form as before.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { SheetControls, SheetFooter, type SheetOptions } from '../components/Sheet';
import { FieldLabel, TextField, TimeField } from '../components/Field';
import { DaySaveButton, Row } from '../components/ui';
import type { IconName } from '../components/Icon';
import { radius, usePalette } from '../theme';
import { typesFor } from '../lib/typeCatalog';
import { removeTriggerLog } from '../lib/triggerLogs';
import { deleteEntry, ensureDay, save, useAppState } from '../store/store';
import { useDeleteButton } from './EntryForm';

export type LogGroup = { kind: 'triggers'; logIds: string[] } | { kind: 'symptoms'; ids: string[] };

const NOUN = { triggers: ['trigger', 'triggers'], symptoms: ['symptom', 'symptoms'] } as const;

/** A long group needs the scrolling sheet: a `fitContent` card is a plain view
 *  with nothing to scroll, and its footer would be clipped off. */
export const logGroupSheetOptions = (count: number): SheetOptions => ({ fitContent: count <= 6 });

export function LogGroupCard({ dk, group, fresh, controls }: {
  dk: string; group: LogGroup;
  /** Opened by the picker straight after logging, rather than from the Journal. */
  fresh?: boolean;
  controls: SheetControls;
}) {
  const p = usePalette();
  const state = useAppState();
  const typeMap = typesFor(state, group.kind);
  const day = state.days[dk];

  const logs = group.kind === 'triggers' ? (day?.food?.triggerLogs || []).filter((l) => group.logIds.includes(l.id)) : [];
  const log = logs[0];
  const entries = group.kind === 'symptoms' ? (day?.symptoms || []).filter((e) => group.ids.includes(e.id)) : [];
  const types = group.kind === 'triggers' ? logs.flatMap((l) => l.types) : entries.map((e) => e.type);
  const items = types.filter((t) => typeMap[t]).map((t, i) => ({ key: `${t}-${i}`, label: typeMap[t].label, icon: typeMap[t].icon as IconName }));

  const [time, setTime] = useState(() => (group.kind === 'triggers' ? log?.time : entries[0]?.time as string) || '');
  const [note, setNote] = useState(() => (group.kind === 'triggers' ? log?.note : entries[0]?.note as string) || '');

  const n = items.length;
  const [one, many] = NOUN[group.kind];
  const noun = n === 1 ? one : many;

  // No trash on the card that follows a log: it reads as "cancel what I just
  // did" beside a ✕ that keeps it. Delete lives on the card a Journal row opens.
  useDeleteButton(controls, n && !fresh ? {
    title: n === 1 ? `Delete this ${one}?` : `Delete these ${n} ${many}?`,
    onConfirm: () => {
      if (group.kind === 'triggers') { const food = ensureDay(dk).food; group.logIds.forEach((id) => removeTriggerLog(food, id)); save(); }
      else group.ids.forEach((id) => deleteEntry(dk, 'symptoms', id));
      controls.closeAll();
    },
  } : null);

  const commit = () => {
    const d = ensureDay(dk);
    if (group.kind === 'triggers') {
      d.food.triggerLogs = (d.food.triggerLogs || []).map((l) => (group.logIds.includes(l.id) ? { ...l, time, note: note.trim() } : l));
    } else {
      d.symptoms = d.symptoms.map((e) => (group.ids.includes(e.id) ? { ...e, time, note: note.trim() } : e));
    }
    save();
    controls.closeAll();
  };

  if (!n) return null;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, paddingRight: fresh ? 56 : 96, marginBottom: 16 }}>
        {fresh ? `Logged ${n} ${noun}` : noun[0].toUpperCase() + noun.slice(1)}
      </Text>

      {/* the group */}
      <FieldLabel>{n === 1 ? 'Logged' : 'Logged together'}</FieldLabel>
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 12, marginBottom: 18 }}>
        {items.map((it, i) => <Row key={it.key} icon={it.icon} title={it.label} noDivider={i === 0} />)}
      </View>

      {/* what belongs to all of it */}
      <FieldLabel>{n === 1 ? 'Time and note' : `Time and note for all ${n}`}</FieldLabel>
      <View style={{ flexDirection: 'row' }}>
        <TimeField label="Time" value={time} onChange={setTime} />
      </View>
      <TextField label="Notes" value={note} onChange={setNote} multiline style={{ flex: 0 }} />

      <SheetFooter>
        <DaySaveButton dk={dk} title="Save" onPress={commit} />
      </SheetFooter>
    </View>
  );
}
