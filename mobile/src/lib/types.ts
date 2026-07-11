/** Data model — identical shape to the PWA (`autonomic.journal.v1`). */

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface Profile {
  sex: string;
  birthday: string;
  weight: string;
  height: string;
}

/** Per-stage minutes for a night, when the Health source recorded stages
 *  (Apple Watch on watchOS 9+, Oura, etc). Absent for manual entries and
 *  sources that only log a single asleep block. */
export interface SleepStages {
  deep: number;
  rem: number;
  core: number;
  awake: number;
}

export interface SleepRecord {
  bed: string;
  wake: string;
  quality?: 'good' | 'interrupted';
  hrLow?: string | number;
  hrHigh?: string | number;
  stages?: SleepStages;
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
  /** Capture source ('polar' = Bluetooth strap, best; 'camera' = phone PPG, lowest quality). */
  source?: 'polar' | 'watch' | 'camera' | 'manual';
  rrRaw?: number[];
  rrClean?: number[];
  durationSec?: number;
  sampledHr?: { t: number; bpm: number }[];
  /** Rolling SDNN (trailing ~60 s window) sampled through the session. */
  sampledSdnn?: { t: number; sdnn: number }[];
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
  /** Legacy entries stored a boolean; new entries store 'mild' | 'severe' (false/absent = none). */
  straining?: boolean | 'mild' | 'severe';
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
  /** Free-text day notes; only surfaced in AI-insights prompts. */
  notes?: string;
}

/** User-configurable definition of a "clean day" (the streak protocol). Each
 *  requirement can be toggled on/off; enabled ones become clean-day criteria.
 *  `types` hold registry keys (meds/triggers/activities). See DEFAULT_PROTOCOL
 *  + dayCleanliness in scoring/day.ts. */
export interface Protocol {
  /** Avoid triggers. Empty `types` = avoid ALL triggers; else only these. */
  triggers: { enabled: boolean; types: string[] };
  /** Minimum daily water (litres). */
  water: { enabled: boolean; liters: number };
  /** Medications/supplements that must be logged. */
  meds: { enabled: boolean; types: string[] };
  /** Activities that must be logged. */
  activities: { enabled: boolean; types: string[] };
  /** Minimum sleep (hours). */
  sleep: { enabled: boolean; hours: number };
}

export interface AppState {
  version: number;
  settings: {
    theme: ThemeSetting;
    lastBleDeviceId?: string;
    lastBleDeviceName?: string;
    healthEnabled?: boolean;
    /** Clean-day protocol; undefined falls back to DEFAULT_PROTOCOL. */
    protocol?: Protocol;
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
    /** ISO timestamp stamped after the one-time onboarding "import your Apple
     *  Health history" runs. Guards it from ever running again. */
    healthHistoryImported?: string;
    /** Dev-only: day keys the mock seeder claimed (blank days it wrote sleep/food
     *  onto), so flipping SEED_MOCK_DATA off cleans them back out. See devSeed.ts. */
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
