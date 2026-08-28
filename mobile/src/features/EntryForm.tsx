/**
 * The generic add/edit form for a logged entry, and the one delete path for an
 * entry opened as a CARD.
 *
 * These live apart from `./forms` — which re-exports them, so every existing
 * import still works — because `forms.tsx` reaches all the way up to the live
 * capture sheets (HrvSetup, the POTS sessions) to open them from its pickers,
 * and those sheets end in the results cards that need exactly these two things
 * to arm their own edit + delete buttons. Importing them from `./forms` there
 * is a require cycle; importing them from here is not.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { FieldInputs, useFormState } from '../components/Field';
import { Button, ConfirmDeleteSheet, DaySaveButton } from '../components/ui';
import { useToast } from '../components/Toast';
import { usePalette } from '../theme';
import { entryFields, isDivider, isNumberField } from '../lib/registry';
import { computeScores } from '../lib/scoring';
import { health, healthAppName } from '../lib/health';
import { deleteEntry, getState, storeWaveform, upsertEntry } from '../store/store';
import { splitWaveform } from '../lib/waveforms';
import { defaultTimeFor, uid } from '../lib/dates';
import { defaultPeriod } from '../lib/period';
import type { Entry, TypeDef } from '../lib/types';

export type ArrKey = 'readings' | 'activities' | 'meds' | 'symptoms';
type OpenSheet = ReturnType<typeof useSheets>['openSheet'];

function scoreCtx() {
  const p = getState().profile;
  return { sex: p.sex, height: p.height };
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
    let r: Entry = { ...initial };
    fields.forEach((f) => {
      if (isDivider(f) || !f.key) return;
      if (f.type === 'check') r[f.key] = !!form[f.key];
      else r[f.key] = String(form[f.key] ?? '').trim();
    });
    r.scores = computeScores(r, scoreCtx());
    // A prefill may carry inline waveform arrays (an imported workout's HR
    // trace) — those go to the sidecar, never into the journal blob.
    const { entry: stripped, waveform } = splitWaveform(r);
    if (waveform) storeWaveform(stripped.id, waveform);
    r = stripped;
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
        <DaySaveButton dk={dk} title="Save" onPress={save} />
      </SheetFooter>
    </View>
  );
}

/**
 * The one delete path for an entry opened as a CARD (a reading summary, a
 * workout report) — the cards whose own header pill carries the trash button.
 * A form has its own Delete in the footer and doesn't come through here.
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
