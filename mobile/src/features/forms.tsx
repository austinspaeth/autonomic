/**
 * Entry add/edit forms + type pickers, ported from the PWA's openEntryForm /
 * readingMenu / activityMenu / logMenu / bikeForm. Uses the sheet stack:
 * a picker opens a form on top; Save closes the whole stack and refreshes.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { FieldInputs, TextField, TimeField, useFormState } from '../components/Field';
import { Button, Muted } from '../components/ui';
import { Icon } from '../components/Icon';
import { ReadingSummary } from '../components/summary';
import { radius, usePalette } from '../theme';
import type { Entry, TypeDef } from '../lib/types';
import {
  ACTIVITY_TYPES, entryFields, isDivider, isNumberField, MED_TYPES, READING_TYPES,
  SYMPTOM_TYPES,
} from '../lib/registry';
import { computeScores } from '../lib/scoring';
import { health } from '../lib/health';
import { deleteEntry, getState, upsertEntry, useAppState } from '../store/store';
import { fmtTime12, nowTime, uid } from '../lib/dates';
import { useToast } from '../components/Toast';
import { HrvSetup } from './hrv/Setup';

type ArrKey = 'readings' | 'activities' | 'meds' | 'symptoms';

function scoreCtx() {
  const p = getState().profile;
  return { sex: p.sex, height: p.height };
}

/** Filterable picker of programmatic types; choosing one stacks its form. */
export function TypePicker({ title, typeMap, onPick }: { title: string; typeMap: Record<string, TypeDef>; onPick: (type: string) => void }) {
  const p = usePalette();
  const [q, setQ] = useState('');
  const types = Object.keys(typeMap).filter((t) => typeMap[t].label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{title}</Text>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Filter…"
        placeholderTextColor={p.textDim}
        style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, fontSize: 17, color: p.text, marginBottom: 8 }}
      />
      {types.length === 0 ? <Muted>No matches.</Muted> : types.map((t) => (
        <Pressable key={t} onPress={() => onPick(t)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
          <Icon name={typeMap[t].icon as never} size={22} color={p.textDim} />
          <Text style={{ color: p.text, fontSize: 17 }}>{typeMap[t].label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Reading picker with a live-capture call-to-action above the manual list. */
function ReadingPicker({ onLive, onPick }: { onLive: () => void; onPick: (type: string) => void }) {
  const p = usePalette();
  const types = Object.keys(READING_TYPES);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Add reading</Text>
      <Pressable onPress={onLive} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, backgroundColor: p.accentSoft, borderWidth: 1, borderColor: p.accent, marginBottom: 8 }, pressed && { opacity: 0.7 }]}>
        <Icon name="heartPulse" size={24} color={p.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.accent, fontWeight: '700', fontSize: 17 }}>Live HRV reading</Text>
          <Text style={{ color: p.textDim, fontSize: 13 }}>Capture 5 min from a strap or Apple Watch</Text>
        </View>
        <Icon name="chevronRight" size={20} color={p.accent} />
      </Pressable>
      {types.map((t, i) => (
        <Pressable key={t} onPress={() => onPick(t)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
          <Icon name={READING_TYPES[t].icon as never} size={22} color={p.textDim} />
          <Text style={{ color: p.text, fontSize: 17 }}>{READING_TYPES[t].label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The add/edit form for a typed entry. */
export function EntryForm({ typeMap, arrKey, dk, type, existing, controls, onSaved }: {
  typeMap: Record<string, TypeDef>; arrKey: ArrKey; dk: string; type: string; existing: Entry | null; controls: SheetControls; onSaved: () => void;
}) {
  const p = usePalette();
  const toast = useToast();
  const def = typeMap[type];
  const fields = entryFields(def);
  const initial = existing || { id: uid(), type, time: nowTime(), note: '' };
  const [form, set] = useFormState(fields, initial);

  const save = () => {
    const numFields = fields.filter(isNumberField);
    const anyNum = numFields.some((f) => String(form[f.key!] ?? '').trim() !== '');
    const anyCheck = fields.filter((f) => f.type === 'check').some((f) => !!form[f.key!]);
    if (type === 'bp') {
      if (!String(form.sys || '').trim() && !String(form.dia || '').trim()) return toast('Enter a blood pressure');
    } else if (numFields.length && !anyNum && !anyCheck) {
      return toast('Enter a value');
    }
    const r: Entry = { ...initial };
    fields.forEach((f) => {
      if (isDivider(f) || !f.key) return;
      if (f.type === 'check') r[f.key] = !!form[f.key];
      else r[f.key] = String(form[f.key] ?? '').trim();
    });
    r.scores = computeScores(r, scoreCtx());
    if (type === 'weight' && r.weight !== '' && r.weight != null) {
      const st = getState();
      st.profile = { ...st.profile, weight: String(r.weight).trim() };
    }
    upsertEntry(dk, arrKey, r);
    // Auto-publish freshly-logged readings to Apple Health (fire-and-forget).
    // Only new manual entries — never re-publish edits or Health-sourced rows.
    if (arrKey === 'readings' && !existing && r.note !== 'From Apple Health' && getState().settings.healthEnabled) {
      const api = health();
      if (api.available) {
        api.publishReading(r, dk)
          .then((n) => { if (n > 0) toast('Saved to Apple Health'); })
          .catch(() => { /* graceful */ });
      }
    }
    controls.closeAll();
    onSaved();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{(existing ? 'Edit ' : '') + def.label}</Text>
      <FieldInputs fields={fields} form={form} set={set} />
      <SheetFooter>
        {existing ? <Button title="Delete" variant="danger" onPress={() => { deleteEntry(dk, arrKey, existing.id); controls.closeAll(); onSaved(); }} /> : null}
        <Button title="Save" variant="primary" onPress={save} />
      </SheetFooter>
    </View>
  );
}

/** Indoor-bike bespoke form (conditional Resistance vs interval list). */
export function BikeForm({ dk, existing, controls, onSaved }: { dk: string; existing: Entry | null; controls: SheetControls; onSaved: () => void }) {
  const p = usePalette();
  const init = existing ? (JSON.parse(JSON.stringify(existing)) as Entry) : { id: uid(), type: 'indoorBike', time: nowTime(), note: '', interval: false, intervals: [] as unknown[] };
  const [time, setTime] = useState((init.time as string) || nowTime());
  const [num, setNum] = useState<Record<string, string>>({
    duration: (init.duration as string) || '', distance: (init.distance as string) || '', avgHr: (init.avgHr as string) || '',
    maxHr: (init.maxHr as string) || '', minHr: (init.minHr as string) || '', resistance: (init.resistance as string) || '', hr60: (init.hr60 as string) || '',
  });
  const [interval, setInterval] = useState(!!init.interval);
  const [intervals, setIntervals] = useState<Record<string, string>[]>(() => ((init.intervals as Record<string, string>[]) || []).map((iv) => ({ length: iv.length || '', resistance: iv.resistance || '', avgHr: iv.avgHr || '', maxHr: iv.maxHr || '' })));
  const [note, setNote] = useState((init.note as string) || '');
  const setN = (k: string, v: string) => setNum((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    const r: Entry = { ...init, time };
    ['duration', 'distance', 'avgHr', 'maxHr', 'minHr'].forEach((k) => { r[k] = num[k].trim(); });
    r.interval = interval;
    if (interval) { r.intervals = intervals.map((iv) => ({ length: iv.length.trim(), resistance: iv.resistance.trim(), avgHr: iv.avgHr.trim(), maxHr: iv.maxHr.trim() })); r.resistance = ''; }
    else { r.resistance = num.resistance.trim(); r.intervals = []; }
    r.hr60 = num.hr60.trim();
    r.note = note.trim();
    upsertEntry(dk, 'activities', r);
    controls.closeAll();
    onSaved();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>{(existing ? 'Edit ' : '') + 'Indoor bike'}</Text>
      <TimeField label="Time" value={time} onChange={setTime} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[['duration', 'Duration (min)'], ['distance', 'Distance (mi)'], ['avgHr', 'Avg HR'], ['maxHr', 'Max HR'], ['minHr', 'Min HR']].map(([k, lbl]) => (
          <View key={k} style={{ width: '47%' }}><TextField label={lbl} value={num[k]} onChange={(v) => setN(k, v)} keyboardType="decimal-pad" /></View>
        ))}
      </View>
      <Pressable onPress={() => setInterval((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 8 }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: interval ? p.accent : p.border, backgroundColor: interval ? p.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {interval ? <Icon name="check" size={14} color="#fff" /> : null}
        </View>
        <Text style={{ color: p.text, fontSize: 16 }}>Interval training</Text>
      </Pressable>
      {interval ? (
        <View>
          {intervals.map((iv, i) => (
            <View key={i} style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.control, padding: 12, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: p.textDim }}>{`Interval ${i + 1}`}</Text>
                <Pressable onPress={() => setIntervals((prev) => prev.filter((_, j) => j !== i))}><Icon name="x" size={16} color={p.textDim} /></Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[['length', 'Length (min)'], ['resistance', 'Resistance'], ['avgHr', 'Avg HR'], ['maxHr', 'Max HR']].map(([k, lbl]) => (
                  <View key={k} style={{ width: '47%' }}><TextField label={lbl} value={iv[k]} onChange={(v) => setIntervals((prev) => prev.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} keyboardType="decimal-pad" /></View>
                ))}
              </View>
            </View>
          ))}
          <Button title="+ Add interval" variant="dashed" onPress={() => setIntervals((prev) => [...prev, { length: '', resistance: '', avgHr: '', maxHr: '' }])} />
        </View>
      ) : (
        <TextField label="Resistance" value={num.resistance} onChange={(v) => setN('resistance', v)} keyboardType="decimal-pad" />
      )}
      <View style={{ height: 12 }} />
      <TextField label="HR after 60 seconds" value={num.hr60} onChange={(v) => setN('hr60', v)} keyboardType="decimal-pad" />
      <TextField label="Notes" value={note} onChange={setNote} placeholder="Optional note" multiline />
      <SheetFooter>
        {existing ? <Button title="Delete" variant="danger" onPress={() => { deleteEntry(dk, 'activities', existing.id); controls.closeAll(); onSaved(); }} /> : null}
        <Button title="Save" variant="primary" onPress={save} />
      </SheetFooter>
    </View>
  );
}

/* ---------- hooks that wire the sheet stack ---------- */
export function useEntryForms(dk: string) {
  const { openSheet } = useSheets();
  const refresh = () => { /* store change triggers re-render */ };

  const openReadingForm = (type: string, existing: Entry | null) =>
    openSheet((c) => <EntryForm typeMap={READING_TYPES} arrKey="readings" dk={dk} type={type} existing={existing} controls={c} onSaved={refresh} />);

  const openActivityForm = (type: string, existing: Entry | null) => {
    if (ACTIVITY_TYPES[type]?.custom === 'bike') openSheet((c) => <BikeForm dk={dk} existing={existing} controls={c} onSaved={refresh} />);
    else openSheet((c) => <EntryForm typeMap={ACTIVITY_TYPES} arrKey="activities" dk={dk} type={type} existing={existing} controls={c} onSaved={refresh} />);
  };

  const openReadingSummary = (r: Entry) =>
    openSheet(
      (c) => <ReadingSummarySheet r={r} dk={dk} controls={c} onEdit={() => openReadingForm(r.type, r)} />,
      { action: { icon: 'edit', onPress: () => openReadingForm(r.type, r) } },
    );

  const pickReading = () => openSheet(() => (
    <ReadingPicker
      onLive={() => openSheet((c) => <HrvSetup controls={c} />)}
      onPick={(t) => openReadingForm(t, null)}
    />
  ));
  const pickActivity = () => openSheet(() => <TypePicker title="Add activity" typeMap={ACTIVITY_TYPES} onPick={(t) => openActivityForm(t, null)} />);
  const pickMed = () => openSheet(() => <TypePicker title="Add medication or supplement" typeMap={MED_TYPES} onPick={(t) => openSheet((c) => <EntryForm typeMap={MED_TYPES} arrKey="meds" dk={dk} type={t} existing={null} controls={c} onSaved={refresh} />)} />);
  const pickSymptom = () => openSheet(() => <TypePicker title="Add symptom" typeMap={SYMPTOM_TYPES} onPick={(t) => openSheet((c) => <EntryForm typeMap={SYMPTOM_TYPES} arrKey="symptoms" dk={dk} type={t} existing={null} controls={c} onSaved={refresh} />)} />);

  const openMed = (r: Entry) => openSheet((c) => <EntryForm typeMap={MED_TYPES} arrKey="meds" dk={dk} type={r.type} existing={r} controls={c} onSaved={refresh} />);
  const openSymptom = (r: Entry) => openSheet((c) => <EntryForm typeMap={SYMPTOM_TYPES} arrKey="symptoms" dk={dk} type={r.type} existing={r} controls={c} onSaved={refresh} />);

  return { openReadingForm, openActivityForm, openReadingSummary, pickReading, pickActivity, pickMed, pickSymptom, openMed, openSymptom };
}

function ReadingSummarySheet({ r, dk, controls, onEdit }: { r: Entry; dk: string; controls: SheetControls; onEdit: () => void }) {
  const p = usePalette();
  useAppState(); // re-render on edits
  const state = getState();
  const def = READING_TYPES[r.type];
  const live = (state.days[dk]?.readings || []).find((x) => x.id === r.id) || r;
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>{def.label}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 2, marginBottom: 14 }}>{live.time ? fmtTime12(live.time as string) : ''}</Text>
      <ReadingSummary r={live} days={state.days} ctx={ctx} />
      <View style={{ height: 8 }} />
      <Button title="Edit" variant="default" onPress={onEdit} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
