// LoggedSection — generic reactive list for readings/activities/meds/symptoms
// (legacy renderLoggedSection, docs/index.html:4286-4314). Lists the day's
// entries; "+ Add" opens the type picker; tapping a row opens its edit form.
import React from 'react';
import type { DateKey, Entry } from '@core/types';
import type { TypeDef } from '@core/domain/fieldSchema';
import { summarizeFields } from '@core/domain/entryHelpers';
import { fmtTime12, periodOf } from '@core/date/dateUtils';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import type { IconName } from '@ui/primitives';
import { Section, AddLink, Muted } from '@ui/components/Section';
import { Row } from '@ui/components/Row';
import { openEntryForm, openTypePicker, type ArrKey } from '@ui/forms/EntryForm';
import { openReadingSummary } from '@ui/screens/summaries/ReadingSummary';

export interface LoggedSectionProps {
  title: string;
  addLabel: string;
  emptyText: string;
  typeMap: Record<string, TypeDef>;
  arrKey: ArrKey;
  dateKey: DateKey;
  showValue?: boolean;
  showTime?: boolean;
  showPeriod?: boolean;
  /** Readings open a read-only summary (with an Edit action) instead of the form. */
  summary?: boolean;
}

export function LoggedSection(props: LoggedSectionProps) {
  const { typeMap, arrKey, dateKey } = props;
  useRepository();
  const entries = useRepoSelector((r) => r.getDay(dateKey)[arrKey]);
  const list = [...entries].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return (
    <Section
      title={props.title}
      action={<AddLink onPress={() => openTypePicker({ title: props.addLabel, typeMap, arrKey, dateKey })} />}
    >
      {list.length === 0 ? (
        <Muted>{props.emptyText}</Muted>
      ) : (
        list.map((m: Entry, i) => {
          const def = typeMap[m.type];
          if (!def) return null;
          const pills: string[] = [];
          if (props.showTime && m.time) pills.push(fmtTime12(m.time));
          if (props.showPeriod && m.time) pills.push(periodOf(m.time));
          const value = props.showValue ? (def.summary ? def.summary(m) : summarizeFields(def, m)) : undefined;
          const openEdit = () => openEntryForm({ typeMap, arrKey, type: m.type, dateKey, existing: m });
          return (
            <Row
              key={m.id}
              first={i === 0}
              icon={def.icon as IconName}
              title={def.label}
              value={value || undefined}
              pills={pills.length ? pills : undefined}
              onPress={
                props.summary ? () => openReadingSummary(m, { dateKey, onEdit: openEdit }) : openEdit
              }
            />
          );
        })
      )}
    </Section>
  );
}
