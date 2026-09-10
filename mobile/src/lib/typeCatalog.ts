/**
 * User-extensible type catalog. The registry maps stay the built-in baseline;
 * users can layer their own types on top (state.customTypes) and delete
 * built-ins they never use (state.hiddenTypes). Everything UI-facing should
 * resolve types through typesFor() so custom types appear everywhere.
 *
 * Custom defs are pure JSON (no summary/detail functions) so they persist
 * through MMKV and export/import untouched.
 */
import type { TypeDef } from './types';
import type { LoadWeight } from './budget/load';
import { getState, save } from '../store/store';
import { BUILTIN, CUSTOM_FIELDS, CUSTOM_ICON, slugify, typesFor, type TypeKind } from './typeResolve';

// The pure half lives in ./typeResolve so the pure libraries (src/lib/budget)
// can resolve types without importing the store. Re-exported so every existing
// `from './typeCatalog'` import keeps working.
export { typesFor, typeInUse } from './typeResolve';
export type { TypeKind } from './typeResolve';


/** Create a user-defined type. Returns its key, or null for a blank/dupe name. */
export function addCustomType(kind: TypeKind, name: string, opts?: { dosage?: string; load?: LoadWeight }): string | null {
  const label = name.trim();
  if (!label) return null;
  const state = getState();
  const existing = typesFor(state, kind);
  if (Object.values(existing).some((t) => t.label.toLowerCase() === label.toLowerCase())) return null;
  let key = `custom-${slugify(label)}`;
  while (existing[key] || BUILTIN[kind][key]) key += '-2';
  const def: TypeDef = { label, icon: CUSTOM_ICON[kind], fields: CUSTOM_FIELDS[kind].slice(), userDefined: true };
  if (kind === 'meds' && opts?.dosage?.trim()) def.dosage = opts.dosage.trim();
  // What a minute of it costs the pacing budget. Asked once, as three plain
  // words rather than a number: nobody can pick 1.4 for gardening, and the
  // table in lib/budget/load.ts only ever needed the three buckets anyway.
  if (kind === 'activities') def.load = opts?.load || 'moderate';
  // Fresh top-level object (not an in-place write) so useMemos keyed on
  // state.customTypes see the change — save() only re-wraps state and days.
  state.customTypes = { ...(state.customTypes || {}), [kind]: { ...(state.customTypes?.[kind] || {}), [key]: def } };
  save();
  return key;
}

/** Rename a type / change its default dose. Works on custom types and on
 *  built-ins (stored as a same-key override that `typesFor` layers on top).
 *  The key never changes, so entries already logged against it keep resolving —
 *  editing is allowed even while the type is in use. Returns false for a blank
 *  or duplicate name (caller distinguishes via `name.trim()`). */
export function editType(kind: TypeKind, key: string, name: string, opts?: { dosage?: string; load?: LoadWeight }): boolean {
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
  if (kind === 'activities' && opts?.load) next.load = opts.load;
  // Fresh top-level object — same identity contract as addCustomType.
  state.customTypes = { ...(state.customTypes || {}), [kind]: { ...(state.customTypes?.[kind] || {}), [key]: next } };
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
    // Fresh top-level objects — same identity contract as addCustomType.
    state.customTypes = { ...state.customTypes, [kind]: next };
  }
  if (BUILTIN[kind][key]) {
    const list = state.hiddenTypes?.[kind] || [];
    if (!list.includes(key)) state.hiddenTypes = { ...(state.hiddenTypes || {}), [kind]: [...list, key] };
  }
  save();
}
