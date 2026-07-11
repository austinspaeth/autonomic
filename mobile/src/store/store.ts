/**
 * Single-object app state persisted to MMKV under `autonomic.journal.v1`.
 * Every mutation flows through `save()`, which stamps meta.lastUpdated — never
 * write MMKV directly. A tiny external store + useSyncExternalStore gives React
 * components a synchronous, always-current view.
 */
import { useSyncExternalStore } from 'react';
import { MMKV } from 'react-native-mmkv';
import { addDays, keyOf } from '../lib/dates';
import type { AppState, DayRecord, Entry } from '../lib/types';

const STORAGE_KEY = 'autonomic.journal.v1';
const SCHEMA_VERSION = 1;

let mmkv: MMKV | null = null;
function kv(): MMKV {
  if (!mmkv) mmkv = new MMKV({ id: 'autonomic' });
  return mmkv;
}

function defaultState(): AppState {
  return {
    version: SCHEMA_VERSION,
    settings: { theme: 'system' },
    profile: { sex: '', birthday: '', weight: '', height: '' },
    meta: { lastUpdated: null, lastImport: null },
    days: {},
  };
}

export function blankDay(): DayRecord {
  return {
    sleep: { bed: '', wake: '' },
    readings: [],
    activities: [],
    meds: [],
    symptoms: [],
    food: { water: 0, calories: 0, triggers: {}, meals: [] },
    digestion: { movements: [] },
  };
}

/** Normalize any parsed object into the current shape (import + load path). */
export function migrate(s: unknown): AppState {
  const base = defaultState();
  if (!s || typeof s !== 'object') return base;
  const src = s as Partial<AppState>;
  const out: AppState = {
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...(src.settings || {}) },
    profile: { ...base.profile, ...(src.profile || {}) },
    customTypes: src.customTypes || {},
    hiddenTypes: src.hiddenTypes || {},
    meta: { lastUpdated: null, lastImport: null, ...(src.meta || {}) },
    days: {},
  };
  const days = (src.days || {}) as Record<string, Partial<DayRecord>>;
  // One-time reframing: historically a day stored the bedtime entered that
  // evening (the night *after* its morning). The app now treats a day's sleep as
  // the night that *ended* that morning, so each day's bed becomes the previous
  // day's stored bed (wake and overnight HR stay put). Guarded by a meta flag so
  // it runs exactly once, and travels through export/import.
  const reframeSleep = !(src.meta && src.meta.sleepReframed);
  Object.keys(days).forEach((k) => {
    const d = days[k];
    if (!d) return;
    let sleep = d.sleep || { bed: '', wake: '' };
    if (reframeSleep) {
      const prev = days[addDays(k, -1)];
      sleep = { ...sleep, bed: (prev && prev.sleep && prev.sleep.bed) || '' };
    }
    out.days[k] = {
      sleep,
      readings: Array.isArray(d.readings) ? d.readings : [],
      activities: Array.isArray(d.activities) ? d.activities : [],
      meds: Array.isArray(d.meds) ? d.meds : [],
      symptoms: Array.isArray(d.symptoms) ? d.symptoms : [],
      food: {
        water: (d.food && d.food.water) || 0,
        calories: (d.food && d.food.calories) || 0,
        triggers: (d.food && d.food.triggers) || {},
        meals: (d.food && Array.isArray(d.food.meals) ? d.food.meals : []),
      },
      digestion: { movements: (d.digestion && Array.isArray(d.digestion.movements) ? d.digestion.movements : []) },
      ...(typeof d.notes === 'string' && d.notes ? { notes: d.notes } : {}),
    };
  });
  out.meta.sleepReframed = true;
  return out;
}

function loadState(): AppState {
  try {
    const raw = kv().getString(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const migrated = migrate(parsed);
    // If a one-time migration (e.g. sleep reframing) ran, persist immediately so
    // it can't re-run and double-apply on the next launch.
    if (!(parsed && parsed.meta && parsed.meta.sleepReframed)) {
      try { kv().set(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* keep in memory */ }
    }
    return migrated;
  } catch {
    return defaultState();
  }
}

/* ---------- external store ---------- */
let state: AppState = loadState();
const listeners = new Set<() => void>();
let snapshotVersion = 0;
let cachedSnapshot: { state: AppState; v: number } = { state, v: snapshotVersion };

function emit() {
  snapshotVersion++;
  cachedSnapshot = { state, v: snapshotVersion };
  listeners.forEach((l) => l());
}

/** Centralized persistence — stamps meta.lastUpdated on every call. */
export function save() {
  try {
    state.meta = state.meta || { lastUpdated: null, lastImport: null };
    state.meta.lastUpdated = new Date().toISOString();
    kv().set(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage error — state stays in memory
  }
  emit();
}

/** Apply a mutation to state and persist. */
export function mutate(fn: (s: AppState) => void) {
  fn(state);
  save();
}

export function getState(): AppState {
  return state;
}

/** Replace all state (import). Records lastImport, persists, notifies. */
export function replaceState(parsed: unknown, importName?: string) {
  state = migrate(parsed);
  if (importName) state.meta.lastImport = { name: importName, at: new Date().toISOString() };
  save();
}

/* ---------- day accessors ---------- */
export function getDay(k: string): DayRecord {
  return state.days[k] || blankDay();
}
/** get-or-create a day record (mutating callers pass create=true) */
export function ensureDay(k: string): DayRecord {
  if (!state.days[k]) state.days[k] = blankDay();
  return state.days[k];
}

export function upsertEntry(dk: string, arrKey: 'readings' | 'activities' | 'meds' | 'symptoms', entry: Entry) {
  const d = ensureDay(dk);
  const arr = d[arrKey];
  const i = arr.findIndex((x) => x.id === entry.id);
  if (i >= 0) arr[i] = entry;
  else arr.push(entry);
  save();
}

export function deleteEntry(dk: string, arrKey: 'readings' | 'activities' | 'meds' | 'symptoms', id: string) {
  const d = ensureDay(dk);
  d[arrKey] = d[arrKey].filter((x) => x.id !== id);
  save();
}

/* ---------- React binding ---------- */
export function useStore<T>(selector: (snap: { state: AppState; v: number }) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selector(cachedSnapshot),
    () => selector(cachedSnapshot),
  );
}

/** Convenience: re-render on any state change, return the live state. */
export function useAppState(): AppState {
  return useStore((s) => s.state);
}

export function serializeState(): string {
  return JSON.stringify(state, null, 2);
}

export { STORAGE_KEY, keyOf };
