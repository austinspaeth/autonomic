/**
 * Entry add/edit forms + type pickers, ported from the PWA's openEntryForm /
 * readingMenu / activityMenu / logMenu / bikeForm. Uses the sheet stack:
 * a picker opens a form on top; Save closes the whole stack and refreshes.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { FieldInputs, TextField, TimeField, useFormState } from '../components/Field';
import { Button, Muted } from '../components/ui';
import { Icon } from '../components/Icon';
import { ReadingSummary } from '../components/summary';
import { radius, usePalette } from '../theme';
import type { Entry, TypeDef } from '../lib/types';
import {
  ACTIVITY_TYPES, entryFields, isDivider, isNumberField,
  READING_TYPES, readingLabel,
} from '../lib/registry';
import { typesFor, type TypeKind } from '../lib/typeCatalog';
import { ManageTypesSheet } from './TypeManager';
import { computeScores } from '../lib/scoring';
import { health, healthAppName } from '../lib/health';
import { healthSourceFor, workoutCandidates, type HealthCandidate, type HealthSource, type WorkoutCandidate } from '../lib/health/sources';
import { deleteEntry, getState, upsertEntry, useAppState } from '../store/store';
import { defaultTimeFor, fmtTime12, todayKey, uid } from '../lib/dates';
import { getTier } from '../store/tier';
import { requestExpandProtocol, scrollJournalToSection } from '../store/nav';
import { canCaptureHrv, hrvCaptureUsedToday } from '../lib/gating';
import { usePaywall } from './Paywall';
import { defaultPeriod } from '../lib/period';
import { useToast } from '../components/Toast';
import { HrvSetup } from './hrv/Setup';
import { OrthostaticIntroSheet } from './OrthostaticIntro';
import { DevicesScreen } from './Devices';
import { StandTestSession } from './pots/StandTestSession';
import { OrthostaticSession } from './pots/OrthostaticSession';

type ArrKey = 'readings' | 'activities' | 'meds' | 'symptoms';

function scoreCtx() {
  const p = getState().profile;
  return { sex: p.sex, height: p.height };
}

/** Filterable picker of catalog types; choosing one stacks its form. A fixed
 *  footer lets the user create/manage their own types for this kind. */
export function TypePicker({ title, kind, onPick, manageLabel }: { title: string; kind: TypeKind; onPick: (type: string) => void; manageLabel: string }) {
  const p = usePalette();
  const state = useAppState();
  const { openSheet } = useSheets();
  const [q, setQ] = useState('');
  const typeMap = typesFor(state, kind);
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
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.text, fontSize: 17 }}>{typeMap[t].label}</Text>
            {typeMap[t].dosage ? <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{typeMap[t].dosage}</Text> : null}
          </View>
        </Pressable>
      ))}
      <SheetFooter>
        <View style={{ flex: 1 }}>
          <Button title={manageLabel} variant="default" onPress={() => openSheet(() => <ManageTypesSheet kind={kind} />)} />
        </View>
      </SheetFooter>
    </View>
  );
}

/** Build a brand-new reading entry prefilled from an Apple Health candidate. */
function healthPrefill(type: string, c: HealthCandidate): Entry {
  return { id: uid(), type, time: c.time, note: '', source: 'health', ...c.entry } as Entry;
}

/** On-demand Apple Health import card. Lists the selected day's samples for one
 *  reading type; tap one to review-and-save, or enter one manually. Opened only
 *  for types Apple Health can supply (BP / Resting HR). */
function ReadingImportSheet({ type, dk, source, onManual, onPick }: {
  type: string; dk: string; source: HealthSource; onManual: () => void; onPick: (c: HealthCandidate) => void;
}) {
  const p = usePalette();
  const def = READING_TYPES[type];
  const [loading, setLoading] = useState(true);
  const [cands, setCands] = useState<HealthCandidate[]>([]);
  React.useEffect(() => {
    let alive = true;
    source.fetch(dk)
      .then((c) => { if (alive) setCands(c); })
      .catch(() => { /* graceful — falls through to the empty state */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [source, dk]);
  const lower = def.label.toLowerCase();
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>{`Add ${def.label}`}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>{`Import from ${healthAppName()}, or enter manually.`}</Text>
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, gap: 12 }}>
          <ActivityIndicator color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14 }}>{`Getting ${lower} from ${healthAppName()}…`}</Text>
        </View>
      ) : cands.length === 0 ? (
        <Muted>{`No ${lower} in ${healthAppName()} for this day. Enter one manually below.`}</Muted>
      ) : (
        cands.map((c, i) => (
          <Pressable key={c.key} onPress={() => onPick(c)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
            <Icon name={def.icon as never} size={22} color={p.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>{c.label}</Text>
              <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>{c.sub}</Text>
            </View>
            <Icon name="chevronRight" size={20} color={p.textDim} />
          </Pressable>
        ))
      )}
      <SheetFooter>
        <Button title="Enter manually" variant="default" onPress={onManual} />
      </SheetFooter>
    </View>
  );
}

/** On-demand workout import card. Lists the selected day's workouts from the
 *  health store (Apple Workout sessions / Health Connect exercise); tap one to
 *  review-and-save as an activity, or fall through to the manual type picker. */
function ActivityImportSheet({ dk, onManual, onPick }: {
  dk: string; onManual: () => void; onPick: (c: WorkoutCandidate) => void;
}) {
  const p = usePalette();
  const [loading, setLoading] = useState(true);
  const [cands, setCands] = useState<WorkoutCandidate[]>([]);
  React.useEffect(() => {
    let alive = true;
    workoutCandidates(dk, getState().days[dk]?.activities || [])
      .then((c) => { if (alive) setCands(c); })
      .catch(() => { /* graceful — falls through to the empty state */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dk]);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>Add activity</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>{`Import a workout from ${healthAppName()}, or enter one manually.`}</Text>
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, gap: 12 }}>
          <ActivityIndicator color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14 }}>{`Getting workouts from ${healthAppName()}…`}</Text>
        </View>
      ) : cands.length === 0 ? (
        <Muted>{`No workouts in ${healthAppName()} for this day. Enter an activity manually below.`}</Muted>
      ) : (
        cands.map((c, i) => (
          <Pressable key={c.key} onPress={() => onPick(c)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
            <Icon name={ACTIVITY_TYPES[c.type].icon as never} size={22} color={p.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>{c.label}</Text>
              <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>{c.sub}</Text>
            </View>
            <Icon name="chevronRight" size={20} color={p.textDim} />
          </Pressable>
        ))
      )}
      <SheetFooter>
        <Button title="Enter manually" variant="default" onPress={onManual} />
      </SheetFooter>
    </View>
  );
}

/** Add-reading picker labels: the stand test reads more descriptively here
 *  than the registry label the journal rows and summaries use. */
const PICKER_LABELS: Record<string, string> = { standTest: 'POTS Standing Test' };
const pickerLabel = (t: string) => PICKER_LABELS[t] || READING_TYPES[t].label;

/** Watch companion tints for the two POTS captures, matched to the watch home
 *  screen (DS.blue / DS.purple) so the phone and watch read as one product. */
const POTS_BLUE = '#4aa3f0';
const POTS_PURPLE = '#9d6bf5';
const BP_GOLD = '#e0a030'; // watch DS.amber — the goldish-orange blood-pressure tint

/** A 6-digit hex tint → its semi-transparent chip fill (the faded square the
 *  solid icon sits on, matching the milestone cards' icon treatment). */
function softTint(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.15)`;
}

/** Reading picker styled after the watch home screen: a stack of grey card
 *  buttons, each with a tinted icon chip (semi-transparent square + solid icon,
 *  as on the milestone cards). HRV is the live-capture call-to-action; the two
 *  POTS captures carry their watch tints (blue / purple), the plain readings a
 *  neutral grey. HRV kinds are live-capture only, so the manual list starts at
 *  Blood Pressure. On a past day the live-only captures (HRV, stand test)
 *  disappear — a live reading can only belong to the day it happens. */
function ReadingPicker({ isToday, hrvLocked, potsLocked, onLocked, onLive, onPick }: {
  isToday: boolean; hrvLocked?: boolean; potsLocked?: boolean; onLocked?: () => void;
  onLive: () => void; onPick: (type: string) => void;
}) {
  const p = usePalette();
  const tintFor = (t: string) => (t === 'standTest' ? POTS_BLUE : t === 'orthostatic' ? POTS_PURPLE : t === 'bp' ? BP_GOLD : p.textDim);
  const subFor: Record<string, string> = {
    bp: 'Systolic, diastolic, pulse',
    restingHr: 'At rest, laying or sitting',
    standTest: 'Lie and stand test',
    orthostatic: 'Stairs or other events',
  };
  // The two POTS captures lead the manual list (the stand test is live-only but
  // stays in, pointing at the watch app); BP and resting HR follow.
  const manual = isToday ? ['standTest', 'orthostatic', 'bp', 'restingHr'] : ['orthostatic', 'bp', 'restingHr'];
  // Freemium locks: the HRV row once today's free capture is used, and the
  // live-only stand test on the free tier (the episode row stays — its manual
  // entry path is free). Locked rows dim, swap the chevron for a lock, and
  // raise the paywall.
  const lockFor = (t: string) => (t === 'hrv' ? !!hrvLocked : t === 'standTest' ? !!potsLocked : false);
  const readingRow = (t: string) => ({ key: t, title: pickerLabel(t), sub: subFor[t] || '', icon: READING_TYPES[t].icon as string, tint: lockFor(t) ? p.textDim : tintFor(t), locked: lockFor(t), onPress: () => (lockFor(t) ? onLocked?.() : onPick(t)) });
  const rows: { key: string; title: string; sub: string; icon: string; tint: string; locked?: boolean; onPress: () => void }[] = [
    ...(isToday ? [{ key: 'hrv', title: 'HRV Reading', sub: hrvLocked ? 'Free plan: 1 capture per day used' : Platform.OS === 'ios' ? 'From a chest strap, Apple Watch or camera' : 'From a chest strap or your camera', icon: 'heartPulse', tint: hrvLocked ? p.textDim : p.accent, locked: !!hrvLocked, onPress: onLive }] : []),
    ...manual.map(readingRow),
  ];
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Add reading</Text>
      <View style={{ gap: 10 }}>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            onPress={r.onPress}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 12, borderRadius: radius.card, backgroundColor: p.surface2 }, pressed && { opacity: 0.6 }]}
          >
            <View style={{ width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: softTint(r.tint) }}>
              <Icon name={r.icon as never} size={21} color={r.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{r.title}</Text>
              {r.sub ? <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 1 }}>{r.sub}</Text> : null}
            </View>
            <Icon name={r.locked ? 'lock' : 'chevronRight'} size={18} color={p.textDim} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** The add/edit form for a typed entry.
 *  `prefill` seeds a brand-new entry (e.g. a reading imported from Apple Health)
 *  that is reviewed then saved as new — it is not treated as an edit (no Delete)
 *  and, when `fromHealth`, is not re-published back to Health. */
export function EntryForm({ typeMap, arrKey, dk, type, existing, prefill = null, fromHealth = false, controls, onSaved }: {
  typeMap: Record<string, TypeDef>; arrKey: ArrKey; dk: string; type: string; existing: Entry | null; prefill?: Entry | null; fromHealth?: boolean; controls: SheetControls;
  /** Called after a save (with the saved entry) or a delete (with nothing). */
  onSaved: (saved?: Entry) => void;
}) {
  const p = usePalette();
  const toast = useToast();
  const def = typeMap[type];
  const fields = entryFields(def);
  const initial = existing || prefill || { id: uid(), type, time: defaultTimeFor(dk), note: '' };
  // New entries with a Morning/Evening/Other tag auto-detect it the same way
  // live HRV capture does, based on the entry's default time.
  if (!existing && initial.period == null && fields.some((f) => f.type === 'select' && f.key === 'period')) {
    const h = parseInt(String(initial.time || ''), 10);
    initial.period = defaultPeriod(type, dk, Number.isFinite(h) ? h : undefined);
  }
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
    upsertEntry(dk, arrKey, r);
    // Auto-publish freshly-logged readings to the health store (fire-and-forget).
    // Only new *manual* entries — never re-publish edits or Health-sourced rows.
    if (arrKey === 'readings' && !existing && !fromHealth && r.note !== 'From Apple Health' && r.note !== 'From Health Connect' && getState().settings.healthEnabled) {
      const api = health();
      if (api.available) {
        api.publishReading(r, dk)
          .then((n) => { if (n > 0) toast(`Saved to ${healthAppName()}`); })
          .catch(() => { /* graceful */ });
      }
    }
    controls.closeAll();
    onSaved(r);
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

/** Indoor-bike bespoke form (conditional Resistance vs interval list).
 *  `prefill` seeds a brand-new entry (a workout imported from the health
 *  store), mirroring EntryForm — reviewed then saved as new, never an edit. */
export function BikeForm({ dk, existing, prefill = null, controls, onSaved }: { dk: string; existing: Entry | null; prefill?: Entry | null; controls: SheetControls; onSaved: () => void }) {
  const p = usePalette();
  const blank: Entry = { id: uid(), type: 'indoorBike', time: defaultTimeFor(dk), note: '', interval: false, intervals: [] as unknown[] };
  const init = existing ? (JSON.parse(JSON.stringify(existing)) as Entry) : prefill ? { ...blank, ...prefill } : blank;
  const [time, setTime] = useState((init.time as string) || defaultTimeFor(dk));
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

/** Home-screen widget deep links (the URL points at the Journal tab so
 *  expo-router never sees an unmatched path; repeated taps re-fire because each
 *  is a fresh openURL event):
 *   · autonomic://?capture=hrv     — open HRV capture setup (freemium-gated),
 *     exactly like the Readings picker's Live HRV action.
 *   · autonomic://?open=protocol   — scroll to the Progress streak card and
 *     open it expanded (the Protocol widget). */
export function useCaptureDeepLink() {
  const { openSheet } = useSheets();
  const openPaywall = usePaywall();
  React.useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const q = ExpoLinking.parse(url).queryParams;
      if (q?.open === 'protocol') {
        requestExpandProtocol();
        // Let the card mount/expand before scrolling (cold start lays out late).
        setTimeout(() => scrollJournalToSection('protocol'), 350);
        return;
      }
      if (q?.capture !== 'hrv') return;
      if (!canCaptureHrv(getTier(), hrvCaptureUsedToday(getState().days[todayKey()]))) { openPaywall(); return; }
      openSheet((c) => <HrvSetup controls={c} />);
    };
    void ExpoLinking.getInitialURL().then(handle);
    const sub = ExpoLinking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useEntryForms(dk: string) {
  const { openSheet } = useSheets();
  const openPaywall = usePaywall();
  const refresh = () => { /* store change triggers re-render */ };

  // Freemium: free tier gets one live HRV capture per day; live POTS captures
  // are Pro. Checked at action time (not render) so the answer is current, and
  // guarded here — the single choke point — rather than at each button.
  const hrvCaptureLocked = () =>
    !canCaptureHrv(getTier(), hrvCaptureUsedToday(getState().days[todayKey()]));
  const potsCaptureLocked = () => getTier() === 'free';

  const openReadingForm = (type: string, existing: Entry | null, prefill: Entry | null = null) =>
    openSheet((c) => (
      <EntryForm
        typeMap={READING_TYPES} arrKey="readings" dk={dk} type={type} existing={existing} prefill={prefill} fromHealth={!!prefill} controls={c}
        onSaved={(saved) => {
          refresh();
          // A freshly logged orthostatic event pops its results card, so the
          // rise/recovery grades are seen right after entry.
          if (saved && !existing && type === 'orthostatic') openReadingSummary(saved);
        }}
      />
    ));

  // The in-app live POTS captures (Bluetooth strap): same stacked-card modal
  // treatment as a live HRV session. With no strap saved yet, the pairing
  // sheet opens first; saving a device there flows straight into the session.
  const startPotsLive = (type: string) => {
    if (potsCaptureLocked()) { openPaywall(); return; }
    const open = () => openSheet(
      (c) => (type === 'standTest' ? <StandTestSession controls={c} /> : <OrthostaticSession controls={c} />),
      { hideClose: true },
    );
    if (!getState().settings.lastBleDeviceId) {
      openSheet((c) => (
        <DevicesScreen controls={{
          close: () => { c.close(); if (getState().settings.lastBleDeviceId) open(); },
          closeAll: c.closeAll,
        }} />
      ));
      return;
    }
    open();
  };

  // Tapping a reading type: if Apple Health can supply it (and is connected),
  // open the import card (pick a sample or enter manually); otherwise go straight
  // to the blank manual form. Orthostatic gets its own card pointing at the
  // watch app's guided stand test (which syncs in by itself) — plus an in-app
  // strap capture — before manual entry.
  const pickReadingSource = (type: string) => {
    // On a past day the live captures don't apply (a live reading belongs to
    // the day it happens) — an episode goes straight to the manual form.
    if (type === 'orthostatic' && dk !== todayKey()) { openReadingForm(type, null); return; }
    // Both POTS types share the watch-pointer card, each with a live strap
    // capture behind it. The episode keeps a manual form too; the stand test
    // is live-only, so no manual fallback.
    if (type === 'orthostatic' || type === 'standTest') {
      openSheet(() => (
        <OrthostaticIntroSheet
          title={`Add ${pickerLabel(type)}`}
          subtitle={type === 'orthostatic'
            ? (Platform.OS === 'ios'
              ? 'Capture live from your watch or a chest strap, or enter an event manually.'
              : 'Capture live from a chest strap, or enter an event manually.')
            : (Platform.OS === 'ios'
              ? 'Run the guided test from your Apple Watch or with a Bluetooth chest strap.'
              : 'Run the guided test with a Bluetooth chest strap.')}
          onManual={type === 'orthostatic' ? () => openReadingForm(type, null) : undefined}
          onStrap={() => startPotsLive(type)}
        />
      ), { fitContent: true });
      return;
    }
    const source = healthSourceFor(type);
    if (!source || !health().available || !getState().settings.healthEnabled) { openReadingForm(type, null); return; }
    openSheet(() => (
      <ReadingImportSheet
        type={type}
        dk={dk}
        source={source}
        onManual={() => openReadingForm(type, null)}
        onPick={(cand) => openReadingForm(type, null, healthPrefill(type, cand))}
      />
    ), { fitContent: true });
  };

  const openActivityForm = (type: string, existing: Entry | null) => {
    if (ACTIVITY_TYPES[type]?.custom === 'bike') openSheet((c) => <BikeForm dk={dk} existing={existing} controls={c} onSaved={refresh} />);
    else openSheet((c) => <EntryForm typeMap={typesFor(getState(), 'activities')} arrKey="activities" dk={dk} type={type} existing={existing} controls={c} onSaved={refresh} />);
  };

  const openReadingSummary = (r: Entry) =>
    openSheet(
      () => <ReadingSummarySheet r={r} dk={dk} />,
      { action: { icon: 'edit', onPress: () => openReadingForm(r.type, r) } },
    );

  const captureHrv = () => {
    if (hrvCaptureLocked()) { openPaywall(); return; }
    openSheet((c) => <HrvSetup controls={c} />);
  };
  const pickReading = () => openSheet(() => (
    <ReadingPicker
      isToday={dk === todayKey()}
      hrvLocked={hrvCaptureLocked()}
      potsLocked={potsCaptureLocked()}
      onLocked={openPaywall}
      onLive={captureHrv}
      onPick={(t) => pickReadingSource(t)}
    />
  ));
  // "+ Add activity": with the health store connected, a workout import card
  // comes first (the day's Apple Workout / exercise sessions, tap to review);
  // "Enter manually" stacks the normal type picker. Without it, straight to
  // the picker.
  const pickActivityManual = () => openSheet(() => <TypePicker title="Add activity" kind="activities" manageLabel="Add new activity type" onPick={(t) => openActivityForm(t, null)} />);
  const openWorkoutImport = (c: WorkoutCandidate) => {
    const prefill = { id: uid(), type: c.type, time: c.time, note: '', source: 'health', imported: true, ...c.entry } as Entry;
    if (c.type === 'indoorBike') openSheet((sc) => <BikeForm dk={dk} existing={null} prefill={prefill} controls={sc} onSaved={refresh} />);
    else openSheet((sc) => <EntryForm typeMap={typesFor(getState(), 'activities')} arrKey="activities" dk={dk} type={c.type} existing={null} prefill={prefill} controls={sc} onSaved={refresh} />);
  };
  const pickActivity = () => {
    if (!health().available || !getState().settings.healthEnabled) { pickActivityManual(); return; }
    openSheet(() => <ActivityImportSheet dk={dk} onManual={pickActivityManual} onPick={openWorkoutImport} />, { fitContent: true });
  };
  const pickMed = () => openSheet(() => <TypePicker title="Add medication or supplement" kind="meds" manageLabel="Add another medication" onPick={(t) => {
    // A user-defined med with a saved dosage prefills the Amount field.
    const def = typesFor(getState(), 'meds')[t];
    const prefill = def?.dosage ? ({ id: uid(), type: t, time: defaultTimeFor(dk), note: '', amount: def.dosage } as Entry) : null;
    openSheet((c) => <EntryForm typeMap={typesFor(getState(), 'meds')} arrKey="meds" dk={dk} type={t} existing={null} prefill={prefill} controls={c} onSaved={refresh} />);
  }} />);
  const pickSymptom = () => openSheet(() => <TypePicker title="Add symptom" kind="symptoms" manageLabel="Add another symptom" onPick={(t) => openSheet((c) => <EntryForm typeMap={typesFor(getState(), 'symptoms')} arrKey="symptoms" dk={dk} type={t} existing={null} controls={c} onSaved={refresh} />)} />);

  const openMed = (r: Entry) => openSheet((c) => <EntryForm typeMap={typesFor(getState(), 'meds')} arrKey="meds" dk={dk} type={r.type} existing={r} controls={c} onSaved={refresh} />);
  const openSymptom = (r: Entry) => openSheet((c) => <EntryForm typeMap={typesFor(getState(), 'symptoms')} arrKey="symptoms" dk={dk} type={r.type} existing={r} controls={c} onSaved={refresh} />);

  return { openReadingForm, openActivityForm, openReadingSummary, captureHrv, pickReading, pickActivity, pickMed, pickSymptom, openMed, openSymptom };
}

export function ReadingSummarySheet({ r, dk }: { r: Entry; dk: string }) {
  const p = usePalette();
  useAppState(); // re-render on edits
  const state = getState();
  const live = (state.days[dk]?.readings || []).find((x) => x.id === r.id) || r;
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* The edit + close pill floats top-right — keep the header text clear of it. */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, paddingRight: 100 }}>{readingLabel(live)}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 2, marginBottom: 14, paddingRight: 100 }}>{live.time ? fmtTime12(live.time as string) : ''}</Text>
      <ReadingSummary r={live} days={state.days} ctx={ctx} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
