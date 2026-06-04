// Bowel Movements — entries under day.digestion.movements (legacy
// renderDigestion/bowelForm, docs/index.html:2807-2894).
import React, { useState } from 'react';
import { View } from 'react-native';
import type { DateKey, Entry } from '@core/types';
import type { Field as FieldDef } from '@core/domain/fieldSchema';
import { uid, nowTime, fmtTime12 } from '@core/date/dateUtils';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import { Section, AddLink, Muted } from '@ui/components/Section';
import { Row } from '@ui/components/Row';
import { Button } from '@ui/components/Button';
import { H2 } from '@ui/components/SheetText';
import { FieldRenderer, type Values } from '@ui/forms/FieldRenderer';
import { openSheet, type SheetApi } from '@ui/sheets/useSheets';

const BM_FIELDS: FieldDef[] = [
  { type: 'time', key: 'time', label: 'Time' },
  { type: 'select', key: 'kind', label: 'Type', options: ['Loose', 'Formed', 'Hard', 'Diarrhea'] },
  { type: 'check', key: 'straining', label: 'Straining' },
  { type: 'select', key: 'volume', label: 'Volume', options: ['Small pieces', 'Small', 'Medium', 'Large'] },
];

function bmLabel(m: Entry): string {
  const parts: string[] = [];
  if (m.kind) parts.push(String(m.kind));
  if (m.volume) parts.push(`${m.volume} Volume`);
  let s = parts.join(' + ');
  if (m.straining) s += (s ? ' · ' : '') + 'Straining';
  return s || 'Bowel movement';
}

export function DigestionSection({ dateKey }: { dateKey: DateKey }) {
  const movements = useRepoSelector((r) => r.getDay(dateKey).digestion.movements);
  const list = [...movements].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return (
    <Section title="Bowel Movements" action={<AddLink onPress={() => openBowelForm(dateKey)} />}>
      {list.length === 0 ? (
        <Muted>No bowel movements logged.</Muted>
      ) : (
        list.map((m, i) => (
          <Row
            key={m.id}
            first={i === 0}
            icon="poop"
            title={bmLabel(m)}
            pills={m.time ? [fmtTime12(String(m.time))] : undefined}
            onPress={() => openBowelForm(dateKey, m)}
          />
        ))
      )}
    </Section>
  );
}

function BowelFormBody({ dateKey, existing, api }: { dateKey: DateKey; existing?: Entry; api: SheetApi }) {
  const repo = useRepository();
  const base: Entry = existing ? { ...existing } : { id: uid(), type: 'bm', time: nowTime() };
  const [values, setValues] = useState<Values>(() => ({
    time: String(base.time ?? nowTime()),
    kind: String(base.kind ?? 'Loose'),
    straining: !!base.straining,
    volume: String(base.volume ?? 'Small pieces'),
  }));
  const onChange = (k: string, v: string | boolean) => setValues((p) => ({ ...p, [k]: v }));

  const save = () => {
    const rec: Entry = { id: base.id, type: 'bm' };
    for (const f of BM_FIELDS) {
      const key = (f as { key: string }).key;
      const ft = (f as { type?: string }).type;
      rec[key] = ft === 'check' ? values[key] === true : String(values[key] ?? '').trim();
    }
    repo.updateDay(dateKey, (d) => {
      const arr = d.digestion.movements || [];
      const idx = arr.findIndex((x) => x.id === rec.id);
      if (idx >= 0) arr[idx] = rec;
      else arr.push(rec);
      d.digestion = { ...d.digestion, movements: arr };
    });
    api.close();
  };
  const del = () => {
    repo.updateDay(dateKey, (d) => {
      d.digestion = { ...d.digestion, movements: (d.digestion.movements || []).filter((x) => x.id !== base.id) };
    });
    api.close();
  };

  return (
    <>
      <H2>{existing ? 'Edit bowel movement' : 'Bowel movement'}</H2>
      <FieldRenderer fields={BM_FIELDS} values={values} onChange={onChange} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        {existing ? (
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
function openBowelForm(dateKey: DateKey, existing?: Entry) {
  openSheet((api) => <BowelFormBody dateKey={dateKey} existing={existing} api={api} />);
}
