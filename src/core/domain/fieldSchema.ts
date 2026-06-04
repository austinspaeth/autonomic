// Typed field-schema used by the *_TYPES registries and the form renderer.
// Ported verbatim from legacy docs/index.html:
//   - isDivider / isNumberField / fieldLabel  (~2977-2979)
//   - field shapes inspected from buildFieldInputs (~3932) and the registry
//     field objects (READING_TYPES/ACTIVITY_TYPES/MED_TYPES/SYMPTOM_TYPES ~1451-1756)

import type { Profile } from '@core/types';

export type FieldType = 'number' | 'select' | 'time' | 'check' | 'text' | 'textarea';

export interface InputField {
  type?: FieldType;
  key: string;
  label: string;
  unit?: string;
  options?: string[];
  signed?: boolean;
  placeholder?: string;
  [k: string]: unknown;
}

export interface DividerField {
  divider: true;
}

export type Field = InputField | DividerField;

export interface TypeDef {
  label: string;
  icon: string;
  fields: Field[];
  custom?: 'bike';
  noTime?: boolean;
  summary?: (e: any) => string;
  detail?: (e: any) => string;
  onSave?: (e: any) => Partial<Profile> | void;
}

// ---- Generic entry schema helpers (legacy ~2977-2979) ----
// Each field has a `type`: "number" (default for legacy {key,label}),
// "select", "time", "check", or a divider ({divider:true}).

export const isDivider = (f: Field): f is DividerField =>
  (f as DividerField).divider === true || (f as InputField).type === ('divider' as FieldType);

export const isNumberField = (f: Field): f is InputField =>
  (f as InputField).type === 'number' ||
  (!(f as InputField).type && !!(f as InputField).key && !(f as DividerField).divider);

export const fieldLabel = (f: InputField): string =>
  f.label + (f.unit ? ` (${f.unit})` : '');
