/**
 * The generic add/edit form for a logged entry, and the one delete path for an
 * entry, whether it is opened as a CARD or as a form.
 *
 * These live apart from `./forms` — which re-exports them, so every existing
 * import still works — because `forms.tsx` reaches all the way up to the live
 * capture sheets (HrvSetup, the POTS sessions) to open them from its pickers,
 * and those sheets end in the results cards that need exactly these two things
 * to arm their own edit + delete buttons. Importing them from `./forms` there
 * is a require cycle; importing them from here is not.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { FieldInputs, FieldLabel, useFormState } from '../components/Field';
import { ConfirmDeleteSheet, DaySaveButton, Segmented } from '../components/ui';
import { useToast } from '../components/Toast';
import { usePalette } from '../theme';
import { entryFields, isDivider, isNumberField, READING_TYPES, readingLabel } from '../lib/registry';
import { isWristHrv, kindOf, kindUndecided, withKind, type HrvKind } from '../lib/hrvKind';
import { computeScores, profileCtx } from '../lib/scoring';
import { health, healthAppName } from '../lib/health';
import { deleteEntry, getState, storeWaveform, upsertEntry } from '../store/store';
import { pingLogged } from '../store/ping';
import { splitWaveform } from '../lib/waveforms';
import { ageFromBirthday, defaultTimeFor, uid } from '../lib/dates';
import { defaultPeriod } from '../lib/period';
import type { Entry, TypeDef } from '../lib/types';
import { fieldStored } from '../lib/units';
import { metThresholdFor } from '../lib/pots/live';

export type ArrKey = 'readings' | 'activities' | 'meds' | 'symptoms';
type OpenSheet = ReturnType<typeof useSheets>['openSheet'];

function scoreCtx() {
  const p = getState().profile;
  return profileCtx(p);
}


export function EntryForm({ typeMap, arrKey, dk, type, existing, prefill = null, fromHealth = false, controls, onSaved }: {
  typeMap: Record<string, TypeDef>; arrKey: ArrKey; dk: string; type: string; existing: Entry | null; prefill?: Entry | null; fromHealth?: boolean; controls: SheetControls;
  /** Called after a save (with the saved entry) or a delete (with nothing). */
  onSaved: (saved?: Entry) => void;
}) {
  const p = usePalette();
  const toast = useToast();
  const def = typeMap[type];
  const fields = entryFields(def);
  // An activity's time and notes sit under a rule, apart from its measurements.
  // Done here rather than per type so user-created activities get it too.
  if (arrKey === 'activities') {
    const at = fields.findIndex((f) => f.type === 'time');
    if (at > 0 && !isDivider(fields[at - 1])) fields.splice(at, 0, { divider: true });
  }
  const initial = existing || prefill || { id: uid(), type, time: defaultTimeFor(dk), note: '' };
  // New entries with a Morning/Evening/Other tag auto-detect it the same way
  // live HRV capture does, based on the entry's default time.
  if (!existing && initial.period == null && fields.some((f) => f.type === 'select' && f.key === 'period')) {
    const h = parseInt(String(initial.time || ''), 10);
    initial.period = defaultPeriod(type, dk, Number.isFinite(h) ? h : undefined);
  }
  const [form, set] = useFormState(fields, initial);
  // A wrist reading's kind is the wearer's answer, not something the phone
  // chose before it began, so its form can change it. Undecided shows neither
  // segment chosen, and saving without touching it leaves it undecided.
  const wrist = arrKey === 'readings' && !!existing && isWristHrv(existing);
  const [kind, setKind] = useState<HrvKind | null>(null);
  const shownKind: HrvKind | '' = kind ?? (existing && wrist && !kindUndecided(existing) ? kindOf(existing) : '');
  // A custom type keeps the spelling its owner gave it ("Vitamin C").
  useDeleteButton(controls, existing ? {
    title: `Delete this ${def.userDefined ? def.label : def.label.toLowerCase()}?`,
    onConfirm: () => { deleteEntry(dk, arrKey, existing.id); controls.closeAll(); onSaved(); },
  } : null);

  const save = () => {
    const numFields = fields.filter(isNumberField);
    const anyNum = numFields.some((f) => String(form[f.key!] ?? '').trim() !== '');
    const anyCheck = fields.filter((f) => f.type === 'check').some((f) => !!form[f.key!]);
    if (type === 'bp') {
      if (!String(form.sys || '').trim() && !String(form.dia || '').trim()) return toast('Enter a blood pressure');
    } else if (numFields.length && !anyNum && !anyCheck) {
      return toast('Enter a value');
    }
    let r: Entry = { ...initial };
    fields.forEach((f) => {
      if (isDivider(f) || !f.key) return;
      if (f.type === 'check') r[f.key] = !!form[f.key];
      else r[f.key] = fieldStored(f.unit, String(form[f.key] ?? '').trim());
    });
    // The stand test's flag follows its sustained rise; the form has no
    // checkbox for it, so an edited rise can never disagree with the flag.
    if (arrKey === 'readings' && type === 'standTest') {
      const rise = String(r.sustainedDelta ?? '').trim();
      r.metThreshold = metThresholdFor(rise === '' ? null : Number(rise), ageFromBirthday(getState().profile.birthday));
    }
    if (wrist && kind) r = withKind(r, kind);
    r.scores = computeScores(r, scoreCtx());
    // A prefill may carry inline waveform arrays (an imported workout's HR
    // trace) — those go to the sidecar, never into the journal blob.
    const { entry: stripped, waveform } = splitWaveform(r);
    if (waveform) storeWaveform(stripped.id, waveform);
    r = stripped;
    upsertEntry(dk, arrKey, r);
    // Counted only when the user entered it by hand: an edit or a health-store
    // import is not somebody choosing to log something.
    if (!existing && !prefill && !fromHealth) pingLogged(arrKey, type);
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
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>
        {(existing ? 'Edit ' : '') + (wrist ? (kind ? READING_TYPES[withKind(existing!, kind).type].label : readingLabel(existing!)) : def.label)}
      </Text>
      {wrist ? (
        <View style={{ marginBottom: 16 }}>
          <FieldLabel>Kind of reading</FieldLabel>
          <Segmented
            options={[{ val: 'baseline', label: 'Baseline' }, { val: 'training', label: 'Training' }]}
            value={shownKind as HrvKind}
            onChange={setKind}
          />
        </View>
      ) : null}
      <FieldInputs fields={fields} form={form} set={set} />
      <SheetFooter>
        <DaySaveButton dk={dk} title={arrKey === 'activities' && !existing ? 'Save activity' : 'Save'} onPress={save} />
      </SheetFooter>
    </View>
  );
}

/**
 * Arms the trash button in a FORM's own header pill, the same place an entry
 * card carries it, and routes it through the same one-question confirm card.
 * A form has no red Delete in its footer: the footer is for the save, and
 * delete lives furthest from the ✕ on every sheet that can delete anything.
 *
 * Pass null while there is nothing to delete (a new entry). `onConfirm` decides
 * what happens to the stack, since a form over a manage list closes only
 * itself while a form for an entry takes the whole stack with it.
 */
export function useDeleteButton(
  controls: SheetControls,
  ask: { title: string; message?: string; onConfirm: () => void } | null,
): void {
  const { openSheet } = useSheets();
  const latest = useRef(ask);
  latest.current = ask;
  const armed = !!ask;
  // Layout effect, so the pill is drawn with its trash button on the first
  // frame rather than growing one a frame after the form appears.
  useLayoutEffect(() => {
    if (!armed) return;
    controls.setOptions({
      destructive: { onPress: () => {
        const a = latest.current;
        if (!a) return;
        openSheet((c) => (
          <ConfirmDeleteSheet
            title={a.title}
            message={a.message ?? "It will be removed from your journal. This can't be undone."}
            onConfirm={() => latest.current?.onConfirm()}
            controls={c}
          />
        ), { fitContent: true });
      } },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);
}

/**
 * The one delete path for an entry opened as a CARD (a reading summary, a
 * workout report) — the cards whose own header pill carries the trash button.
 * A form arms the same button through `useDeleteButton` above.
 *
 * Asks first, in a small `fitContent` card, then deletes and closes the whole
 * stack: the card underneath is a view OF that entry, so leaving it up would
 * show the user something that no longer exists (and `deleteEntry` also records
 * the row in the health-import declined list, so it must not be re-offered
 * either).
 */
export function confirmDelete(openSheet: OpenSheet, dk: string, arrKey: 'readings' | 'activities', r: Entry, label: string): void {
  openSheet((c) => (
    <ConfirmDeleteSheet
      title={`Delete this ${label.toLowerCase()}?`}
      message="It will be removed from your journal. This can't be undone."
      onConfirm={() => { deleteEntry(dk, arrKey, r.id); c.closeAll(); }}
      controls={c}
    />
  ), { fitContent: true });
}
