// EntryForm — generic add/edit for a typed entry (legacy openEntryForm,
// docs/index.html:3993-4047) + the filterable type picker (logMenu, 4317).
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { DateKey, Entry, Reading } from '@core/types';
import type { TypeDef } from '@core/domain/fieldSchema';
import { isDivider, isNumberField } from '@core/domain/fieldSchema';
import { entryFields } from '@core/domain/entryHelpers';
import { computeScores } from '@core/scoring/computeScores';
import { uid, nowTime } from '@core/date/dateUtils';
import { useRepository } from '@data/RepositoryProvider';
import { Button } from '@ui/components/Button';
import { H2 } from '@ui/components/SheetText';
import { MenuItem } from '@ui/components/MenuItem';
import { AppInput, Field } from '@ui/forms/Field';
import { FieldRenderer, type Values } from '@ui/forms/FieldRenderer';
import { toast } from '@ui/components/Toast';
import { openSheet, type SheetApi } from '@ui/sheets/useSheets';

export type ArrKey = 'readings' | 'activities' | 'meds' | 'symptoms';

interface EntryFormArgs {
  typeMap: Record<string, TypeDef>;
  arrKey: ArrKey;
  type: string;
  dateKey: DateKey;
  existing?: Entry | null;
}

function seedValues(fields: ReturnType<typeof entryFields>, record: Entry): Values {
  const v: Values = {};
  for (const f of fields) {
    if (isDivider(f)) continue;
    const key = (f as { key: string }).key;
    const ft = (f as { type?: string }).type;
    const cur = record[key as keyof Entry] as unknown;
    if (ft === 'check') v[key] = !!cur;
    else if (key === 'time') v[key] = typeof cur === 'string' && cur ? cur : nowTime();
    else v[key] = cur == null ? '' : String(cur);
  }
  return v;
}

function EntryFormBody({ args, api }: { args: EntryFormArgs; api: SheetApi }) {
  const repo = useRepository();
  const def = args.typeMap[args.type];
  const fields = useMemo(() => entryFields(def), [def]);
  const base: Entry = args.existing
    ? { ...args.existing }
    : { id: uid(), type: args.type, time: nowTime(), note: '' };
  const [values, setValues] = useState<Values>(() => seedValues(fields, base));

  const onChange = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    const numFields = fields.filter(isNumberField);
    const anyNum = numFields.some((f) => String(values[(f as { key: string }).key] ?? '').trim() !== '');
    const anyCheck = fields
      .filter((f) => (f as { type?: string }).type === 'check')
      .some((f) => values[(f as { key: string }).key] === true);
    if (args.type === 'bp') {
      if (!String(values.sys ?? '').trim() && !String(values.dia ?? '').trim()) {
        toast('Enter a blood pressure');
        return;
      }
    } else if (numFields.length && !anyNum && !anyCheck) {
      toast('Enter a value');
      return;
    }

    const record: Entry = { id: base.id, type: args.type };
    for (const f of fields) {
      if (isDivider(f)) continue;
      const key = (f as { key: string }).key;
      const ft = (f as { type?: string }).type;
      record[key] = ft === 'check' ? values[key] === true : String(values[key] ?? '').trim();
    }
    record.scores = computeScores(record as Reading, repo.getProfile());

    repo.updateDay(args.dateKey, (d) => {
      const arr = d[args.arrKey];
      const i = arr.findIndex((x) => x.id === record.id);
      if (i >= 0) arr[i] = record;
      else arr.push(record);
    });

    if (def?.onSave) {
      const patch = def.onSave(record);
      if (patch) repo.setProfile(patch);
    }
    api.closeAll();
  };

  const del = () => {
    repo.updateDay(args.dateKey, (d) => {
      d[args.arrKey] = d[args.arrKey].filter((x) => x.id !== base.id);
    });
    api.closeAll();
  };

  return (
    <>
      <H2>{(args.existing ? 'Edit ' : '') + (def?.label ?? '')}</H2>
      <FieldRenderer fields={fields} values={values} onChange={onChange} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        {args.existing ? (
          <View style={{ flex: 1 }}>
            <Button title="Delete" variant="danger" onPress={del} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button title="Save" variant="primary" onPress={save} />
        </View>
      </View>
    </>
  );
}

export function openEntryForm(args: EntryFormArgs) {
  openSheet((api) => <EntryFormBody args={args} api={api} />);
}

// Filterable picker of programmatic types; choosing one stacks its form.
function TypePickerBody({
  title,
  typeMap,
  arrKey,
  dateKey,
}: {
  title: string;
  typeMap: Record<string, TypeDef>;
  arrKey: ArrKey;
  dateKey: DateKey;
}) {
  const [q, setQ] = useState('');
  const types = Object.keys(typeMap);
  const matches = types.filter((t) => typeMap[t].label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <H2>{title}</H2>
      <Field>
        <AppInput value={q} onChangeText={setQ} placeholder="Filter…" autoCapitalize="none" />
      </Field>
      {matches.map((type) => (
        <MenuItem
          key={type}
          title={typeMap[type].label}
          onPress={() => openEntryForm({ typeMap, arrKey, type, dateKey })}
        />
      ))}
    </>
  );
}

export function openTypePicker(args: {
  title: string;
  typeMap: Record<string, TypeDef>;
  arrKey: ArrKey;
  dateKey: DateKey;
}) {
  openSheet(() => (
    <TypePickerBody title={args.title} typeMap={args.typeMap} arrKey={args.arrKey} dateKey={args.dateKey} />
  ));
}
