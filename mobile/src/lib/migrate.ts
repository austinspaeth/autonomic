/**
 * Pure state normalization for the import + load path. `migrate()` accepts
 * ANY parsed JSON (imports are user-picked files) and always returns a state
 * object every render can trust: valid YYYY-MM-DD day keys only, entry arrays
 * of plain objects with string id/type/time, object-shaped sleep/food records.
 * Anything malformed is dropped or coerced — never persisted, since a bad
 * value written to MMKV would crash every subsequent launch.
 *
 * Day keys are validated against DATE_KEY_RE before being copied. Besides
 * rejecting junk keys, this closes a prototype-pollution hole: JSON.parse
 * creates "__proto__" as an own key, and assigning `out.days["__proto__"] =
 * {...}` would silently REPLACE the prototype of the days map instead of
 * adding a day.
 */
import { addDays, todayKey, uid } from './dates';
import { MED_TYPES } from './registry';
import type {
  AppState,
  DayRecord,
  Entry,
  FoodRecord,
  Meal,
  Movement,
  Protocol,
  SleepRecord,
  ThemeSetting,
  TypeDef,
} from './types';

/** Shape of a valid day key (and ISO date generally). */
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SCHEMA_VERSION = 1;
const TYPE_SECTIONS = ['activities', 'meds', 'symptoms', 'triggers'] as const;

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Finite number from a number or numeric string; anything else -> 0. */
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : 0;
};

export function defaultState(): AppState {
  return {
    version: SCHEMA_VERSION,
    settings: { theme: 'system' },
    profile: { sex: '', birthday: '', weight: '', height: '' },
    // Fresh installs start with an empty medication catalog — the built-in med
    // types exist only so long-standing journals keep their labels. New users
    // add their own meds; imported journals keep whatever they had visible.
    hiddenTypes: { meds: Object.keys(MED_TYPES) },
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

/** Logged-entry arrays: keep plain objects with a string type (renders key
 *  registry lookups off it); guarantee string id/time/note. Extra template
 *  fields pass through untouched — legacy HRV readings arrive with embedded
 *  arrays (rrRaw, sampledHr), which MUST survive migrate(): the store strips
 *  them into the waveform sidecar right after (src/lib/waveforms.ts). */
function cleanEntries(v: unknown): Entry[] {
  if (!Array.isArray(v)) return [];
  const out: Entry[] = [];
  for (const e of v) {
    if (!isPlainObject(e) || typeof e.type !== 'string' || !e.type) continue;
    const entry = { ...e, id: typeof e.id === 'string' && e.id ? e.id : uid() } as Entry;
    if (entry.time !== undefined && typeof entry.time !== 'string') delete entry.time;
    if (entry.note !== undefined && typeof entry.note !== 'string') delete entry.note;
    // The period tag's third option was renamed Random → Other; retag old data.
    if (entry.period === 'Random') entry.period = 'Other';
    // Apple Health imports predate the `imported` flag; recognize them by their
    // stamped note so readingLabel can tell them from watch-captured readings.
    if (entry.source === 'watch' && entry.imported === undefined &&
        typeof entry.note === 'string' && entry.note.startsWith('From Apple Health')) {
      entry.imported = true;
    }
    out.push(entry);
  }
  return out;
}

function cleanMovements(v: unknown): Movement[] {
  if (!Array.isArray(v)) return [];
  const out: Movement[] = [];
  for (const m of v) {
    if (!isPlainObject(m)) continue;
    const mv = { ...m, id: typeof m.id === 'string' && m.id ? m.id : uid() } as Movement;
    if (mv.time !== undefined && typeof mv.time !== 'string') delete mv.time;
    out.push(mv);
  }
  return out;
}

function cleanSleep(v: unknown): SleepRecord {
  if (!isPlainObject(v)) return { bed: '', wake: '' };
  const s = { ...v, bed: str(v.bed), wake: str(v.wake) } as SleepRecord;
  if (s.quality !== undefined && s.quality !== 'good' && s.quality !== 'interrupted') delete s.quality;
  if (s.hrLow !== undefined && typeof s.hrLow !== 'string' && typeof s.hrLow !== 'number') delete s.hrLow;
  if (s.hrHigh !== undefined && typeof s.hrHigh !== 'string' && typeof s.hrHigh !== 'number') delete s.hrHigh;
  if (s.stages !== undefined) {
    if (isPlainObject(v.stages)) {
      const st = v.stages;
      s.stages = { deep: num(st.deep), rem: num(st.rem), core: num(st.core), awake: num(st.awake) };
    } else {
      delete s.stages;
    }
  }
  return s;
}

function cleanFood(v: unknown): FoodRecord {
  const f: Record<string, unknown> = isPlainObject(v) ? v : {};
  const triggers: Record<string, number> = {};
  if (isPlainObject(f.triggers)) {
    for (const k of Object.keys(f.triggers)) {
      const n = num(f.triggers[k]);
      if (n > 0 && k !== '__proto__') triggers[k] = n;
    }
  }
  return {
    water: num(f.water),
    calories: num(f.calories),
    triggers,
    meals: cleanEntries(f.meals) as Meal[],
  };
}

/** A structurally-broken protocol crashes clean-day scoring; if any section is
 *  off-shape, drop the whole thing so the app falls back to its default. */
function cleanProtocol(v: unknown): Protocol | undefined {
  if (!isPlainObject(v)) return undefined;
  const listSection = (s: unknown) =>
    isPlainObject(s) && Array.isArray(s.types) && s.types.every((t) => typeof t === 'string');
  const numSection = (s: unknown, key: 'liters' | 'hours') =>
    isPlainObject(s) && typeof s[key] === 'number' && isFinite(s[key] as number);
  if (
    listSection(v.triggers) && listSection(v.meds) && listSection(v.activities) &&
    numSection(v.water, 'liters') && numSection(v.sleep, 'hours')
  ) {
    return v as unknown as Protocol;
  }
  return undefined;
}

/** Custom type defs feed straight into forms (`def.fields.map`) — keep only
 *  defs with string label/icon and an array of plain-object fields. */
function cleanCustomTypes(v: unknown): AppState['customTypes'] {
  const out: AppState['customTypes'] = {};
  if (!isPlainObject(v)) return out;
  for (const section of TYPE_SECTIONS) {
    const defs = v[section];
    if (!isPlainObject(defs)) continue;
    const kept: Record<string, TypeDef> = {};
    for (const key of Object.keys(defs)) {
      const d = defs[key];
      if (key === '__proto__' || !isPlainObject(d)) continue;
      if (typeof d.label !== 'string' || typeof d.icon !== 'string' || !Array.isArray(d.fields)) continue;
      kept[key] = { ...d, fields: d.fields.filter(isPlainObject) } as unknown as TypeDef;
    }
    if (Object.keys(kept).length) out[section] = kept;
  }
  return out;
}

function cleanHiddenTypes(v: unknown): AppState['hiddenTypes'] {
  const out: AppState['hiddenTypes'] = {};
  if (!isPlainObject(v)) return out;
  for (const section of TYPE_SECTIONS) {
    const list = v[section];
    if (Array.isArray(list)) out[section] = list.filter((t): t is string => typeof t === 'string');
  }
  return out;
}

/** Import guard: migrate() normalizes into THIS build's shape, so a file
 *  stamped with a newer schema version would have its unknown fields silently
 *  stripped. Refuse it up front instead — the load path never sees newer
 *  versions (iOS can't downgrade an app in place), so only imports check. */
export function assertImportVersion(s: unknown): void {
  if (!isPlainObject(s)) return;
  if (typeof s.version === 'number' && s.version > SCHEMA_VERSION) {
    throw new Error('This file is from a newer version of Autonomic. Update the app, then import again.');
  }
}

/** Normalize any parsed object into the current shape (import + load path). */
export function migrate(s: unknown): AppState {
  const base = defaultState();
  if (!isPlainObject(s)) return base;
  const src = s as Partial<AppState> & Record<string, unknown>;

  const rawSettings: Record<string, unknown> = isPlainObject(src.settings) ? src.settings : {};
  const theme: ThemeSetting =
    rawSettings.theme === 'light' || rawSettings.theme === 'dark' || rawSettings.theme === 'system'
      ? rawSettings.theme
      : 'system';
  const protocol = cleanProtocol(rawSettings.protocol);
  const settings: AppState['settings'] = { ...rawSettings, theme } as AppState['settings'];
  if (protocol) settings.protocol = protocol;
  else delete settings.protocol;
  if (settings.lastBleDeviceId !== undefined && typeof settings.lastBleDeviceId !== 'string') delete settings.lastBleDeviceId;
  if (settings.lastBleDeviceName !== undefined && typeof settings.lastBleDeviceName !== 'string') delete settings.lastBleDeviceName;
  if (settings.healthEnabled !== undefined) settings.healthEnabled = !!settings.healthEnabled;
  if (settings.lastHrvSource !== undefined && !['polar', 'watch', 'camera'].includes(settings.lastHrvSource as string)) delete settings.lastHrvSource;
  // A reminder only ever schedules from a real HH:MM; anything else is dropped
  // rather than defaulted, so an odd import can't silently arm a notification.
  const rem = settings.reminder as unknown;
  if (rem !== undefined) {
    if (isPlainObject(rem) && typeof rem.time === 'string' && HHMM_RE.test(rem.time)) settings.reminder = { enabled: !!rem.enabled, time: rem.time };
    else delete settings.reminder;
  }

  const profile: Record<string, unknown> = isPlainObject(src.profile) ? src.profile : {};
  const meta: Record<string, unknown> = isPlainObject(src.meta) ? src.meta : {};

  // Day the protocol was first saved (feeds the "Getting started" milestone).
  // Keep only a valid day key; journals that saved a protocol before this stamp
  // existed backfill from their last-updated date so the milestone stays done.
  if (settings.protocolSetOn !== undefined && (typeof settings.protocolSetOn !== 'string' || !DATE_KEY_RE.test(settings.protocolSetOn))) delete settings.protocolSetOn;
  if (settings.protocol && !settings.protocolSetOn) {
    const lu = typeof meta.lastUpdated === 'string' ? meta.lastUpdated.slice(0, 10) : '';
    settings.protocolSetOn = DATE_KEY_RE.test(lu) ? lu : todayKey();
  }

  const out: AppState = {
    version: SCHEMA_VERSION,
    settings,
    profile: {
      sex: str(profile.sex),
      birthday: str(profile.birthday),
      weight: str(profile.weight),
      height: str(profile.height),
    },
    customTypes: cleanCustomTypes(src.customTypes),
    hiddenTypes: cleanHiddenTypes(src.hiddenTypes),
    meta: {
      lastUpdated: typeof meta.lastUpdated === 'string' ? meta.lastUpdated : null,
      lastImport:
        isPlainObject(meta.lastImport) &&
        typeof meta.lastImport.name === 'string' &&
        typeof meta.lastImport.at === 'string'
          ? { name: meta.lastImport.name, at: meta.lastImport.at }
          : null,
      ...(typeof meta.onboarded === 'string' ? { onboarded: meta.onboarded } : {}),
      ...(typeof meta.healthHistoryImported === 'string'
        ? { healthHistoryImported: meta.healthHistoryImported }
        : {}),
    },
    days: {},
  };

  const days = isPlainObject(src.days) ? (src.days as Record<string, unknown>) : {};
  // One-time reframing: historically a day stored the bedtime entered that
  // evening (the night *after* its morning). The app now treats a day's sleep as
  // the night that *ended* that morning, so each day's bed becomes the previous
  // day's stored bed (wake and overnight HR stay put). Guarded by a meta flag so
  // it runs exactly once, and travels through export/import.
  const reframeSleep = !meta.sleepReframed;
  Object.keys(days).forEach((k) => {
    if (!DATE_KEY_RE.test(k)) return;
    const d = days[k];
    if (!isPlainObject(d)) return;
    let sleep = cleanSleep(d.sleep);
    if (reframeSleep) {
      const prev = days[addDays(k, -1)];
      const prevBed = isPlainObject(prev) && isPlainObject(prev.sleep) ? str(prev.sleep.bed) : '';
      sleep = { ...sleep, bed: prevBed };
    }
    out.days[k] = {
      sleep,
      readings: cleanEntries(d.readings),
      activities: cleanEntries(d.activities),
      meds: cleanEntries(d.meds),
      symptoms: cleanEntries(d.symptoms),
      food: cleanFood(d.food),
      digestion: { movements: cleanMovements(isPlainObject(d.digestion) ? d.digestion.movements : undefined) },
      ...(typeof d.notes === 'string' && d.notes ? { notes: d.notes } : {}),
    };
  });
  out.meta.sleepReframed = true;
  return out;
}
