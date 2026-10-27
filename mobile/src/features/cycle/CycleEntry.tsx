/**
 * Logging a day of the cycle: flow, the cycle symptoms, a note.
 *
 * Flow is the bowel-movement form's 2×2 grid of large targets (the same
 * `card(active)` treatment), because a day's flow is one choice among four and
 * the targets have to be easy to hit on a bad day. The symptoms are quick
 * toggles over the ordinary symptom entries for that day — a cramp logged here
 * IS a Symptoms entry, listed there, counted by the strain detector and the
 * Insights sweep like any other — never a second, cycle-only kind of symptom.
 *
 * Saving follows the Journal's rules: a back-dated day saves in gold, the
 * header pill carries the trash for an existing day, and the trash asks once.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SheetFooter, type SheetControls } from '../../components/Sheet';
import { DaySaveButton } from '../../components/ui';
import { FieldLabel, TextField } from '../../components/Field';
import { radius, usePalette } from '../../theme';
import { CYCLE_SYMPTOMS } from '../../lib/registry';
import { typesFor } from '../../lib/typeCatalog';
import { FLOWS, FLOW_LABEL, shortDay } from '../../lib/cycle/copy';
import { defaultTimeFor, todayKey, uid } from '../../lib/dates';
import type { CycleFlow } from '../../lib/types';
import { ensureDay, getState, save } from '../../store/store';
import { logFlow, mirrorCycleSymptoms } from '../../store/cycle';
import { pingLogged } from '../../store/ping';
import { useDeleteButton } from '../EntryForm';
import { FlowGlyph } from './parts';

export function CycleEntrySheet({ dk, controls }: { dk: string; controls: SheetControls }) {
  const p = usePalette();
  const state = getState();
  const existing = state.days[dk]?.cycle;
  const symptomTypes = typesFor(state, 'symptoms');
  const loggedTypes = new Set((state.days[dk]?.symptoms || []).map((e) => e.type));
  const [flow, setFlow] = useState<CycleFlow | null>(existing?.flow ?? null);
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CYCLE_SYMPTOMS.map((k) => [k, loggedTypes.has(k)])));
  const [note, setNote] = useState(existing?.note || '');
  const editing = !!existing;

  const card = (active: boolean) => ({
    borderWidth: 1, borderRadius: radius.control, padding: 13,
    borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2,
  });

  const commit = () => {
    // Flow first: logFlow owns the declines and the Health mirror.
    if (flow !== (existing?.flow ?? null)) logFlow(dk, flow);
    const d = ensureDay(dk);
    if (d.cycle) {
      if (note.trim()) d.cycle.note = note.trim();
      else delete d.cycle.note;
    }
    // Symptoms: add the newly picked, remove the unpicked ones this card shows.
    let added = 0;
    for (const k of CYCLE_SYMPTOMS) {
      if (!symptomTypes[k]) continue;
      const had = loggedTypes.has(k);
      if (picked[k] && !had) {
        d.symptoms.push({ id: uid(), type: k, time: defaultTimeFor(dk), note: '' });
        added++;
      } else if (!picked[k] && had) {
        d.symptoms = d.symptoms.filter((e) => e.type !== k);
      }
    }
    save();
    if (added) pingLogged('symptoms');
    if (CYCLE_SYMPTOMS.some((k) => !!picked[k] !== loggedTypes.has(k))) mirrorCycleSymptoms(dk);
    controls.close();
  };

  useDeleteButton(controls, editing ? {
    title: 'Delete this day’s flow?',
    message: 'The flow for this day is removed. Symptoms you logged stay in your journal.',
    onConfirm: () => { logFlow(dk, null); controls.closeAll(); },
  } : null);

  const changed = flow !== (existing?.flow ?? null)
    || note.trim() !== (existing?.note || '')
    || CYCLE_SYMPTOMS.some((k) => !!picked[k] !== loggedTypes.has(k));

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16, paddingRight: 56 }}>
        {dk === todayKey() ? 'Cycle' : `Cycle · ${shortDay(dk)}`}
      </Text>
      <FieldLabel>Flow</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {FLOWS.map((f) => {
          const active = f === flow;
          return (
            // Tapping the chosen one again clears it, the Profile sex
            // control's rule: "no flow" is a real answer with no target.
            <Pressable key={f} onPress={() => setFlow(active ? null : f)} style={[card(active), { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <View style={{ width: 58, alignItems: 'center' }}><FlowGlyph flow={f} color={active ? p.accent : p.textDim} /></View>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: active ? '700' : '600' }}>{FLOW_LABEL[f]}</Text>
            </Pressable>
          );
        })}
      </View>
      <FieldLabel>Symptoms</FieldLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {CYCLE_SYMPTOMS.filter((k) => symptomTypes[k]).map((k) => {
          const on = !!picked[k];
          return (
            <Pressable key={k} onPress={() => setPicked((s) => ({ ...s, [k]: !on }))} style={({ pressed }) => [
              { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8,
                borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accentSoft : p.surface2 },
              pressed && { opacity: 0.7 },
            ]}>
              <Text style={{ color: on ? p.text : p.textDim, fontSize: 14, fontWeight: on ? '700' : '500' }}>{symptomTypes[k].label}</Text>
            </Pressable>
          );
        })}
      </View>
      {flow ? (
        <TextField label="Note" value={note} onChange={setNote} placeholder="Anything worth remembering" multiline />
      ) : null}
      <SheetFooter>
        <DaySaveButton dk={dk} title={editing ? 'Save changes' : 'Save'} onPress={commit} disabled={!changed} />
      </SheetFooter>
    </View>
  );
}
