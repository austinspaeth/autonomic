// Entry field helpers — ported verbatim from docs/index.html:2983-3020. Pure.
import type { Entry } from '@core/types';
import { type Field, type TypeDef, isDivider, isNumberField } from './fieldSchema';

/** Fields to render: auto-adds a Time input (before any free-text field) and a
 *  trailing Notes textarea when the type's schema doesn't define them. */
export function entryFields(def: TypeDef | undefined): Field[] {
  const fields: Field[] = (def && def.fields ? def.fields : []).slice();
  if (!(def && def.noTime) && !fields.some((f) => (f as { type?: string }).type === 'time')) {
    const firstText = fields.findIndex((f) => (f as { type?: string }).type === 'textarea');
    const timeField: Field = { type: 'time', key: 'time', label: 'Time' };
    if (firstText >= 0) fields.splice(firstText, 0, timeField);
    else fields.push(timeField);
  }
  if (!fields.some((f) => (f as { key?: string }).key === 'note')) {
    fields.push({ type: 'textarea', key: 'note', label: 'Notes', placeholder: 'Optional note' });
  }
  return fields;
}

/** Headline value = first filled number field (legacy summarizeFields). */
export function summarizeFields(def: TypeDef | undefined, r: Entry): string {
  for (const f of entryFields(def)) {
    if (!isNumberField(f)) continue;
    const v = r[f.key as keyof Entry] as unknown;
    if (v != null && v !== '') return String(v) + ((f as { unit?: string }).unit || '');
  }
  return '';
}

/** Secondary line = remaining filled fields + checked flags (legacy detailFields). */
export function detailFields(def: TypeDef | undefined, r: Entry): string {
  if (!def) return '';
  const parts: string[] = [];
  let headlineSkipped = false;
  for (const f of entryFields(def)) {
    const ft = f as { type?: string; key?: string; label?: string; unit?: string };
    if (isDivider(f) || ft.type === 'time' || ft.type === 'textarea') continue;
    if (ft.type === 'check') {
      if (r[ft.key as keyof Entry]) parts.push(ft.label || '');
      continue;
    }
    const v = r[ft.key as keyof Entry] as unknown;
    if (v == null || v === '') continue;
    if (isNumberField(f) && !headlineSkipped) {
      headlineSkipped = true;
      continue;
    }
    parts.push(`${ft.label} ${v}${ft.unit || ''}`);
  }
  return parts.join(' · ');
}
