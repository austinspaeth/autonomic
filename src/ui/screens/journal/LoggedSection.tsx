// LoggedSection — generic reactive list for readings/activities/meds/symptoms
// (legacy renderLoggedSection, docs/index.html:4286-4314). Lists the day's
// entries; "+ Add" opens the type picker; tapping a row opens its edit form.
import React from 'react';
import type { DateKey, Entry, Reading } from '@core/types';
import type { TypeDef } from '@core/domain/fieldSchema';
import { summarizeFields } from '@core/domain/entryHelpers';
import { fmtTime12, periodOf } from '@core/date/dateUtils';
import { computeScores } from '@core/scoring/computeScores';
import { SCORE_COLORS } from '@core/scoring/colors';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import type { IconName } from '@ui/primitives';
import { Section, AddLink, Muted } from '@ui/components/Section';
import { Row } from '@ui/components/Row';
import { openEntryForm, openTypePicker, type ArrKey } from '@ui/forms/EntryForm';
import { openReadingSummary } from '@ui/screens/summaries/ReadingSummary';

// Category used to tint the single value shown on a reading row
// (legacy rowScoreCategory, docs/index.html:3161-3175). Picks the per-type
// score key out of computeScores.
function rowScoreCategory(r: Reading, scores: Record<string, string>): string | null {
  switch (r.type) {
    case 'hrv':
      return scores.sdnn ?? null;
    case 'breathHrv':
      return scores.overall || scores.sdnn || null;
    case 'bp':
      return scores.bp ?? null;
    case 'bloodO2':
      return scores.value ?? null;
    case 'restingHr':
      return scores.hr ?? null;
    case 'ecg':
      return scores.overall ?? null;
    case 'mood':
      return scores.mood ?? null;
    case 'weight':
      return scores.weight ?? null;
    case 'orthostatic':
      return scores.overall || scores.increase || null;
    default:
      return null;
  }
}

// Headline value shown on the right of a reading row (legacy readingRowValue,
// docs/index.html:3178-3190). Special-cased per type; falls back to the type's
// generic field summary.
const ecgPattern = (r: Reading): string =>
  r.svt ? 'SVT' : r.otherArrhythmia ? 'Other' : r.sinus ? 'Sinus' : '-';

function readingRowValue(r: Reading, def: TypeDef): string {
  const has = (v: unknown): boolean => v != null && v !== '';
  switch (r.type) {
    case 'hrv':
    case 'breathHrv':
      return has(r.sdnn) ? `${r.sdnn} SDNN` : '';
    case 'bp':
      return r.sys || r.dia ? `${r.sys || '-'}/${r.dia || '-'}` : '';
    case 'bloodO2':
      return r.value ? `${r.value}%` : '';
    case 'restingHr':
      return has(r.hr) ? `${r.hr} hr` : '';
    case 'ecg':
      return ecgPattern(r);
    case 'mood': {
      const map: Record<string, string> = {
        'Feeling amazing': 'Amazing',
        'Feeling normal': 'Normal',
        'Feeling bad': 'Bad',
        'Feeling like a crash': 'Crash',
      };
      const m = r.mood as string | undefined;
      return (m ? map[m] : '') || m || '';
    }
    default:
      return def.summary ? def.summary(r) : summarizeFields(def, r);
  }
}

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
  const repo = useRepository();
  const entries = useRepoSelector((r) => r.getDay(dateKey)[arrKey]);
  const profile = repo.getProfile();
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
          let value: string | undefined;
          let scoreColor: string | undefined;
          if (props.summary) {
            // Reading rows: legacy headline value + worst-category score dot/tint.
            value = readingRowValue(m, def);
            if (value) {
              const cat = rowScoreCategory(m, computeScores(m, profile));
              if (cat && SCORE_COLORS[cat as keyof typeof SCORE_COLORS]) {
                scoreColor = SCORE_COLORS[cat as keyof typeof SCORE_COLORS];
              }
            }
          } else if (props.showValue) {
            value = def.summary ? def.summary(m) : summarizeFields(def, m);
          }
          const openEdit = () => openEntryForm({ typeMap, arrKey, type: m.type, dateKey, existing: m });
          return (
            <Row
              key={m.id}
              first={i === 0}
              icon={def.icon as IconName}
              title={def.label}
              value={value || undefined}
              scoreColor={scoreColor}
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
