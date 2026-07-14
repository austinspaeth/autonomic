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

/** Extra fields carried by a live-captured HRV reading.
 *
 *  The array fields (rrRaw, rrClean, sampledHr, sampledSdnn) are NOT persisted
 *  on the entry — they live in the waveform sidecar store keyed by reading id
 *  (src/lib/waveforms.ts) so the journal blob stays small. Inline they exist
 *  only on a pre-save live preview or in a not-yet-migrated import; the store
 *  strips them on load, and persisting one trips a dev warning. */
export interface LiveHrvExtras {
  /** Capture source ('polar' = Bluetooth strap, best; 'camera' = phone PPG,
   *  lowest quality; 'health' = imported via Health Connect on Android). */
  source?: 'polar' | 'watch' | 'camera' | 'manual' | 'health';
  /** True when the entry was auto-imported from the platform health store
   *  (welcome backfill / Health sync) rather than captured in-app — drives the
   *  "Apple Watch HRV" / "Imported HRV" label. */
  imported?: boolean;
  /** Bluetooth device name at capture time (source 'polar' only) — shown as the Source detail. */
  sourceName?: string;
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

/** User-defined type defs per kind (state.customTypes shape). */
export type CustomTypes = Partial<Record<'activities' | 'meds' | 'symptoms' | 'triggers', Record<string, TypeDef>>>;

/** The rear camera-module shape the user picked in the finger-reading setup. */
export type CameraModuleShape = 'tall' | 'wide' | 'square' | 'single';
/** Shape + which spot the flash occupies (keys are per-shape: top/middle/
 *  bottom, left/middle/right, tl/tr/bl/br, or right/below for a single lens). */
export interface CameraLayout { shape: CameraModuleShape; flash: string }

export interface AppState {
  version: number;
  settings: {
    theme: ThemeSetting;
    lastBleDeviceId?: string;
    lastBleDeviceName?: string;
    healthEnabled?: boolean;
    /** Signal source of the last live HRV capture — seeds the setup sheet's
     *  default so a deliberate choice (camera / watch) sticks across sessions. */
    lastHrvSource?: 'polar' | 'watch' | 'camera';
    /** Remembered camera-module layout from the finger (PPG) setup card —
     *  once set, camera readings skip straight to the wait-for-finger step.
     *  "Start over" on that card clears it. */
    cameraLayout?: CameraLayout;
    /** Clean-day protocol; undefined falls back to DEFAULT_PROTOCOL. */
    protocol?: Protocol;
  };
  profile: Profile;
  /** User-defined types layered on top of the registry maps (pure JSON defs). */
  customTypes?: CustomTypes;
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
  /** Number fields only: when typing makes this true, focus jumps to the next
   *  number field in the form (e.g. BP systolic → diastolic → pulse). */
  autoNext?: (v: string) => boolean;
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
