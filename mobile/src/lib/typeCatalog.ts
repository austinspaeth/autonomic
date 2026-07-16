/**
 * User-extensible type catalog. The registry maps stay the built-in baseline;
 * users can layer their own types on top (state.customTypes) and delete
 * built-ins they never use (state.hiddenTypes). Everything UI-facing should
 * resolve types through typesFor() so custom types appear everywhere.
 *
 * Custom defs are pure JSON (no summary/detail functions) so they persist
 * through MMKV and export/import untouched.
 */
import { ACTIVITY_TYPES, MED_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES } from './registry';
import type { AppState, TypeDef } from './types';
import { getState, save } from '../store/store';

export type TypeKind = 'activities' | 'meds' | 'symptoms' | 'triggers';

const BUILTIN: Record<TypeKind, Record<string, TypeDef>> = {
  activities: ACTIVITY_TYPES,
  meds: MED_TYPES,
  symptoms: SYMPTOM_TYPES,
  triggers: TRIGGER_TYPES,
};

/** Default field schema for a user-created type of each kind. Custom activities
 *  capture the metrics the analysis cares about: duration and min/max HR. */
const CUSTOM_FIELDS: Record<TypeKind, TypeDef['fields']> = {
  activities: [
    { key: 'duration', label: 'Duration', unit: 'min' },
    { key: 'minHr', label: 'Min HR' },
    { key: 'maxHr', label: 'Max HR' },
  ],
  meds: [
    { type: 'time', key: 'time', label: 'Time' },
    { type: 'number', key: 'amount', label: 'Amount' },
  ],
  symptoms: [],
  triggers: [],
};

const CUSTOM_ICON: Record<TypeKind, string> = {
  activities: 'activity', meds: 'pill', symptoms: 'alert', triggers: 'alert',
};

/** Registry + user-defined types, minus deleted built-ins. Alphabetical by
 *  label so user-created types slot in among the built-ins; "Other …"
 *  catch-alls sink to the bottom. */
export function typesFor(state: AppState, kind: TypeKind): Record<string, TypeDef> {
  const hidden = new Set(state.hiddenTypes?.[kind] || []);
  const merged: Record<string, TypeDef> = {};
  Object.keys(BUILTIN[kind]).forEach((k) => { if (!hidden.has(k)) merged[k] = BUILTIN[kind][k]; });
  Object.assign(merged, state.customTypes?.[kind] || {});
  const isOther = (t: TypeDef) => /^other\b/i.test(t.label);
  const out: Record<string, TypeDef> = {};
  Object.keys(merged)
    .sort((a, b) => {
      if (isOther(merged[a]) !== isOther(merged[b])) return isOther(merged[a]) ? 1 : -1;
      return merged[a].label.localeCompare(merged[b].label, undefined, { sensitivity: 'base' });
    })
    .forEach((k) => { out[k] = merged[k]; });
  return out;
}

/** True when any day references the type (blocks deletion). */
export function typeInUse(state: AppState, kind: TypeKind, key: string): boolean {
  const days = state.days || {};
  for (const dk of Object.keys(days)) {
    const d = days[dk];
    if (!d) continue;
    if (kind === 'triggers') {
      if ((d.food?.triggers?.[key] || 0) > 0) return true;
    } else if ((d[kind] || []).some((e) => e.type === key)) {
      return true;
    }
  }
  return false;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Create a user-defined type. Returns its key, or null for a blank/dupe name. */
export function addCustomType(kind: TypeKind, name: string, opts?: { dosage?: string }): string | null {
  const label = name.trim();
  if (!label) return null;
  const state = getState();
  const existing = typesFor(state, kind);
  if (Object.values(existing).some((t) => t.label.toLowerCase() === label.toLowerCase())) return null;
  let key = `custom-${slugify(label)}`;
  while (existing[key] || BUILTIN[kind][key]) key += '-2';
  const def: TypeDef = { label, icon: CUSTOM_ICON[kind], fields: CUSTOM_FIELDS[kind].slice(), userDefined: true };
  if (kind === 'meds' && opts?.dosage?.trim()) def.dosage = opts.dosage.trim();
  state.customTypes = state.customTypes || {};
  state.customTypes[kind] = { ...(state.customTypes[kind] || {}), [key]: def };
  save();
  return key;
}

/** Rename a type / change its default dose. Works on custom types and on
 *  built-ins (stored as a same-key override that `typesFor` layers on top).
 *  The key never changes, so entries already logged against it keep resolving —
 *  editing is allowed even while the type is in use. Returns false for a blank
 *  or duplicate name (caller distinguishes via `name.trim()`). */
export function editType(kind: TypeKind, key: string, name: string, opts?: { dosage?: string }): boolean {
  const label = name.trim();
  if (!label) return false;
  const state = getState();
  const existing = typesFor(state, kind);
  const cur = existing[key];
  if (!cur) return false;
  if (Object.keys(existing).some((k) => k !== key && existing[k].label.toLowerCase() === label.toLowerCase())) return false;
  // Strip any registry-only functions so the override stays pure JSON.
  const { summary, detail, ...json } = cur;
  void summary; void detail;
  const next: TypeDef = { ...json, label };
  if (kind === 'meds') {
    const dosage = opts?.dosage?.trim();
    if (dosage) next.dosage = dosage;
    else delete next.dosage;
  }
  state.customTypes = state.customTypes || {};
  state.customTypes[kind] = { ...(state.customTypes[kind] || {}), [key]: next };
  save();
  return true;
}

/** Delete a type (custom → removed; built-in → hidden). Caller checks typeInUse.
 *  An edited built-in has both a same-key override and a built-in behind it, so
 *  drop the override *and* hide the built-in — otherwise the override would keep
 *  the row visible past the hide. */
export function deleteType(kind: TypeKind, key: string) {
  const state = getState();
  if (state.customTypes?.[kind]?.[key]) {
    const next = { ...state.customTypes[kind] };
    delete next[key];
    state.customTypes[kind] = next;
  }
  if (BUILTIN[kind][key]) {
    state.hiddenTypes = state.hiddenTypes || {};
    const list = state.hiddenTypes[kind] || [];
    if (!list.includes(key)) state.hiddenTypes[kind] = [...list, key];
  }
  save();
}
