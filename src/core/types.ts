// Shared, framework-agnostic domain types for the Autonomic Journal.
// Mirrors the localStorage state shape used by the legacy app (docs/index.html).
// No react / react-native / expo / DOM imports may appear in src/core.

export type DateKey = string; // "YYYY-MM-DD"
export type ThemeName = 'light' | 'dark';
export type Sex = '' | 'Male' | 'Female';

export interface Profile {
  sex: Sex;
  birthday: string; // "YYYY-MM-DD" or ""
  weight: string; // lbs, stored as string (as entered)
  height: string; // inches, stored as string
}

export interface Settings {
  theme: ThemeName;
}

export interface Meta {
  lastUpdated: string | null; // ISO timestamp
  lastImport: { name: string; at: string } | null;
}

/** A single logged entry (reading / activity / med / symptom). `type` keys into
 *  the relevant *_TYPES registry; remaining fields come from that type's schema. */
export interface Entry {
  id: string;
  type: string;
  time?: string;
  note?: string;
  [field: string]: unknown;
}

export type Reading = Entry;
export type Activity = Entry;
export type Med = Entry;
export type Symptom = Entry;

export interface Sleep {
  bed: string; // "HH:MM"
  wake: string; // "HH:MM"
  quality?: 'good' | 'interrupted';
  hrLow?: string;
  hrHigh?: string;
}

export interface Food {
  water: number;
  calories: number;
  triggers: Record<string, number>;
  meals: Entry[];
}

export interface Digestion {
  movements: Entry[];
}

export interface Day {
  sleep: Sleep;
  readings: Reading[];
  activities: Activity[];
  meds: Med[];
  symptoms: Symptom[];
  food: Food;
  digestion: Digestion;
}

export interface State {
  version: 1;
  settings: Settings;
  meta: Meta;
  profile: Profile;
  days: Record<DateKey, Day>;
}

/** Score category produced by the scoring framework. */
export type ScoreCategory =
  | 'great'
  | 'good'
  | 'ok'
  | 'warning'
  | 'bad'
  | 'crash'
  | 'concerning';
