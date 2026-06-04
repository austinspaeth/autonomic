// State construction + migration — ported from docs/index.html:1758-1834.
// Pure: the legacy defaultState() read matchMedia() for the initial theme; here
// that becomes an injected `prefersDark` so this module stays DOM-free.
import type { Day, State } from '@core/types';

export const SCHEMA_VERSION = 1 as const;
export const STORAGE_KEY = 'autonomic.journal.v1';

export function defaultState(prefersDark = false): State {
  return {
    version: SCHEMA_VERSION,
    settings: { theme: prefersDark ? 'dark' : 'light' },
    meta: { lastUpdated: null, lastImport: null },
    profile: { sex: '', birthday: '', weight: '', height: '' },
    days: {},
  };
}

export const blankDay = (): Day => ({
  sleep: { bed: '', wake: '' },
  readings: [],
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
});

/** Normalize an arbitrary parsed blob to the current schema (idempotent). */
export function migrate(input: unknown, prefersDark = false): State {
  if (!input || typeof input !== 'object') return defaultState(prefersDark);
  const s = input as Record<string, unknown> & Partial<State>;
  const base = defaultState(prefersDark);
  s.version = SCHEMA_VERSION;
  s.settings = Object.assign({}, base.settings, s.settings);
  s.meta = Object.assign({ lastUpdated: null, lastImport: null }, s.meta);
  s.profile = Object.assign({ sex: '', birthday: '', weight: '', height: '' }, s.profile);
  delete (s as Record<string, unknown>).defs; // legacy catalogs removed
  s.days = s.days || {};
  Object.keys(s.days).forEach((k) => {
    const d = s.days![k] as Partial<Day> | undefined;
    if (!d) return;
    if (!Array.isArray(d.readings)) d.readings = [];
    if (!Array.isArray(d.activities)) d.activities = [];
    if (!Array.isArray(d.meds)) d.meds = [];
    if (!Array.isArray(d.symptoms)) d.symptoms = [];
    if (!d.food) d.food = { water: 0, calories: 0, triggers: {}, meals: [] };
    if (!d.food.triggers) d.food.triggers = {};
    if (!Array.isArray(d.food.meals)) d.food.meals = [];
    if (!d.sleep) d.sleep = { bed: '', wake: '' };
    if (!d.digestion) d.digestion = { movements: [] };
    if (!Array.isArray(d.digestion.movements)) d.digestion.movements = [];
  });
  return s as State;
}
