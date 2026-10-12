/**
 * Type resolution, with no store attached.
 *
 * `typesFor` was always pure — it takes the state it reads — but it lived in
 * ./typeCatalog beside `addCustomType`/`deleteType`, which import the store.
 * That made "what types does this user have" unreachable from the pure
 * libraries: src/lib/budget resolves an activity's load weight through it and
 * must not pull MMKV and react-native into a unit test. So the pure half lives
 * here and ./typeCatalog re-exports it, leaving every existing import working.
 */
import { ACTIVITY_TYPES, MED_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES } from './registry';
import type { AppState, Protocol, TypeDef } from './types';

export type TypeKind = 'activities' | 'meds' | 'symptoms' | 'triggers';

export const BUILTIN: Record<TypeKind, Record<string, TypeDef>> = {
  activities: ACTIVITY_TYPES,
  meds: MED_TYPES,
  symptoms: SYMPTOM_TYPES,
  triggers: TRIGGER_TYPES,
};

/** Default field schema for a user-created type of each kind. Custom activities
 *  capture the metrics the analysis cares about: duration and min/max HR. */
export const CUSTOM_FIELDS: Record<TypeKind, TypeDef['fields']> = {
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

export const CUSTOM_ICON: Record<TypeKind, string> = {
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
    .forEach((k) => {
      // A symptom lasts, so its form offers an optional end time. Stamped here
      // rather than on each registry def so user-created symptoms — including
      // ones saved before this shipped — get it with no migration.
      const t = merged[k];
      out[k] = kind === 'symptoms' && !t.ends && !t.noTime ? { ...t, ends: true } : t;
    });
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

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Point the clean-day protocol's med / activity requirements at types the
 * user can actually SEE.
 *
 * The protocol stores type keys, and the editor lists `typesFor` — so a key
 * that is no longer in the catalog (a built-in deleted from the picker, which
 * is allowed while it is in use, or a custom type that was removed) is a
 * requirement the user can neither see nor untick, labelled with a name they
 * deleted, and failing every day. Each stale key is MOVED to the visible type
 * of the same name when there is one (the thing was deleted and added back,
 * which comes back as `custom-…`), and dropped otherwise: deleting the type
 * was the user's answer. Trigger requirements are left alone — an empty list
 * there means "no triggers at all", so pruning the last key would widen the
 * rule rather than narrow it, and a stale trigger key can only ever pass.
 *
 * Returns the SAME object when nothing changes, so a caller can compare by
 * identity and memos keyed on the protocol are not disturbed.
 */
export function reconcileProtocol(protocol: Protocol, state: AppState): Protocol {
  let out = protocol;
  (['meds', 'activities'] as const).forEach((kind) => {
    const sec = protocol[kind];
    if (!sec || !Array.isArray(sec.types) || !sec.types.length) return;
    const visible = typesFor(state, kind);
    const byName = new Map<string, string>();
    Object.keys(visible).forEach((k) => byName.set(visible[k].label.toLowerCase(), k));
    const next: string[] = [];
    sec.types.forEach((k) => {
      let key: string | undefined = visible[k] ? k : undefined;
      if (!key) {
        const label = BUILTIN[kind][k]?.label;
        if (label) key = byName.get(label.toLowerCase());
      }
      if (key && !next.includes(key)) next.push(key);
    });
    const same = next.length === sec.types.length && next.every((k, i) => k === sec.types[i]);
    if (!same) out = { ...out, [kind]: { ...sec, types: next } };
  });
  return out;
}

