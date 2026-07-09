/** Data model — identical shape to the PWA (`autonomic.journal.v1`). */

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface Profile {
  sex: string;
  birthday: string;
  weight: string;
  height: string;
}

export interface SleepRecord {
  bed: string;
  wake: string;
  quality?: 'good' | 'interrupted';
  hrLow?: string | number;
  hrHigh?: string | number;
}

/**
 * A logged entry (reading / activity / med / symptom). Field values are kept
 * loosely typed — the PWA stores trimmed strings and reparses with parseFloat;
 * the native app may store numbers. Scoring is tolerant of both.
 */
export interface Entry {
  id: string;
  type: string;
  time?: string;
  note?: string;
  scores?: Record<string, ScoreCat>;
  [key: string]: unknown;
}

/** Extra fields carried by a live-captured HRV reading. */
export interface LiveHrvExtras {
  source?: 'polar' | 'watch' | 'manual';
  rrRaw?: number[];
  rrClean?: number[];
  durationSec?: number;
  sampledHr?: { t: number; bpm: number }[];
  artifactPct?: number;
}

export interface Meal {
  id: string;
  type: string;
  time?: string;
  /** Free-text "what was eaten" (previously used for optional notes). */
  note?: string;
}

export interface Movement {
  id: string;
  time?: string;
  kind?: string;
  straining?: boolean;
  volume?: string;
  note?: string;
}

export interface FoodRecord {
  water: number;
  calories: number;
  triggers: Record<string, number>;
  meals: Meal[];
}

export interface DayRecord {
  sleep: SleepRecord;
  readings: Entry[];
  activities: Entry[];
  meds: Entry[];
  symptoms: Entry[];
  food: FoodRecord;
  digestion: { movements: Movement[]; bm?: number };
}

export interface AppState {
  version: number;
  settings: {
    theme: ThemeSetting;
    lastBleDeviceId?: string;
    lastBleDeviceName?: string;
    healthEnabled?: boolean;
  };
  profile: Profile;
  /** User-defined types layered on top of the registry maps (pure JSON defs). */
  customTypes?: Partial<Record<'activities' | 'meds' | 'symptoms' | 'triggers', Record<string, TypeDef>>>;
  /** Built-in registry types the user deleted (only allowed while unused). */
  hiddenTypes?: Partial<Record<'activities' | 'meds' | 'symptoms' | 'triggers', string[]>>;
  meta: {
    lastUpdated: string | null;
    lastImport: { name: string; at: string } | null;
    /** Set once the sleep "bed = last night" reframing migration has run. */
    sleepReframed?: boolean;
    /** ISO timestamp stamped when the first-run welcome flow completes. */
    onboarded?: string;
    /** TEMPORARY (src/lib/devSeed.ts): day keys whose sleep/food were mock-seeded. */
    mockSeeded?: string[];
  };
  days: Record<string, DayRecord>;
}

export type ScoreCat = 'great' | 'good' | 'ok' | 'bad' | 'crash' | 'concerning' | 'warning';

export interface Band {
  max: number;
  cat: ScoreCat;
}

/** Ordered, typed field schema (drives forms + summaries), same as the PWA. */
export interface FieldDef {
  type?: 'number' | 'select' | 'time' | 'check' | 'text' | 'textarea' | 'divider';
  key?: string;
  label?: string;
  unit?: string;
  options?: string[];
  placeholder?: string;
  signed?: boolean;
  divider?: boolean;
}

export interface TypeDef {
  label: string;
  icon: string; // key into the icon registry
  fields: FieldDef[];
  custom?: string;
  noTime?: boolean;
  /** Default dose for a user-defined medication (e.g. "400mg"); prefills Amount. */
  dosage?: string;
  /** True for user-created types (stored in state.customTypes). */
  userDefined?: boolean;
  summary?: (r: Entry) => string;
  detail?: (r: Entry) => string;
}
