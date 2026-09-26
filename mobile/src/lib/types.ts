/** Data model — identical shape to the PWA (`autonomic.journal.v1`). */
import type { PressureMap } from './pressure';

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
   *  lowest quality; 'garmin' = raw beat-to-beat delivered by the Connect IQ
   *  watch app; 'health' = imported via Health Connect on Android).
   *  'garmin' is deliberately distinct from 'health': a Garmin reading that
   *  arrived through the health store carries no RR and is an import, whereas
   *  this one carries the real series and is a capture. */
  source?: 'polar' | 'watch' | 'garmin' | 'camera' | 'manual' | 'health';
  /** True when the entry was auto-imported from the platform health store
   *  (welcome backfill / Health sync) rather than captured in-app — drives the
   *  "Apple Watch HRV" / "Imported HRV" label. */
  imported?: boolean;
  /** Bluetooth device name at capture time (source 'polar' only) — shown as the Source detail. */
  sourceName?: string;
  rrRaw?: number[];
  rrClean?: number[];
  /** Indices into rrRaw where camera tracking resumed after losing the pulse.
   *  Beat-to-beat metrics must not step across these. Absent on strap/watch/ECG
   *  readings, which are one continuous take. */
  rrSegments?: number[];
  /** On an in-app capture this is the ELAPSED session, not the usable signal —
   *  `coverageSec` is the usable part. (On an IMPORTED reading it means real RR
   *  coverage instead, which is what `hrvQuality.isTrustedReading` gates on.
   *  The two meanings share a field because the import path has no session to
   *  measure; keep them apart when reasoning about capture quality.) */
  durationSec?: number;
  sampledHr?: { t: number; bpm: number }[];
  /** Rolling SDNN (trailing ~60 s window) sampled through the session. */
  sampledSdnn?: { t: number; sdnn: number }[];

  /* ---- how good the capture was (src/lib/hrv computes these; the results
     card shows them; they are stamped so a reading can still be judged on its
     own quality months later).

     Declared here since the sidecar split, and written since 1.25.3. A reading
     from an earlier build carries none of them, so every consumer must treat
     `undefined` as UNKNOWN rather than as clean — the same rule the reading
     counter's `hrvKnown` follows on the dashboard. Nothing de-weights on them
     yet: they are recorded first so there is something to decide with. */

  /** % of beats the artifact correction had to replace. Capture already
   *  refuses anything over 15% on camera / 30% on strap (lib/hrv), so this is
   *  how marginal a KEPT reading was, not whether it was kept. */
  artifactPct?: number;
  /** Seconds of usable cardiac data actually behind the numbers. Below
   *  `durationSec` whenever the signal dropped out — on a camera reading the
   *  gap between the two is the finger moving. */
  coverageSec?: number;
  /** The results card's own verdict, from coverage + artifacts + segments. */
  confidence?: 'high' | 'fair' | 'low';
  /** Clean beats behind the numbers. Stamped rather than counted off the
   *  waveform sidecar, which can be pruned. */
  beatCount?: number;
  /** Unbroken stretches the record was built from, and how many were thrown
   *  out. Only written when there was more than one / more than none, so their
   *  absence means "one continuous take" on a stamped reading and UNKNOWN on
   *  one from a build before 1.26. */
  segmentsUsed?: number;
  segmentsDropped?: number;
  /**
   * The user chose to keep a reading the app would have refused.
   *
   * A record of the DECISION, not a second quality number — `artifactPct`,
   * `coverageSec` and `confidence` above already say how good the capture was.
   * It exists so the caveat travels with the reading: the journal row and the
   * summary both read it, so somebody meeting this entry a month later meets
   * the mark too, rather than a bare SDNN that looks like every other one.
   *
   * It does NOT de-weight anything. A degraded reading is in the day score,
   * the trends and the insights sweep like any other, because a reading that
   * saves and silently counts for nothing is a worse answer to "I cannot get a
   * reading" than refusing it was. The one behavioural difference is that it
   * is not published to Apple Health / Health Connect, which have nowhere to
   * carry the mark (see `features/hrv/Results.tsx`).
   *
   * Absent on every reading the app filed on its own, which is almost all of
   * them, and on every reading from a build before this shipped.
   */
  degraded?: boolean;
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
  digestion: { movements: Movement[] };
  /** Free-text day notes; only surfaced in AI-insights prompts. */
  notes?: string;
  /** What the health store said this day cost, summarised at read time.
   *  Written by src/store/budget.ts, consumed by src/lib/budget. It lives in
   *  the journal (not the flags store) because it is the user's own health
   *  data and must ride export/import the way `sleep` does. */
  load?: DayLoad;
}

/**
 * A day's passive load, read from Apple Health / Health Connect and summarised
 * before it is stored: the raw all-day heart-rate series never enters the
 * journal, only the thinned curve in the waveform sidecar under `load:<dk>`.
 *
 * Every field is nullable and null means UNKNOWN, never zero. A phone with no
 * watch reports steps and walking minutes and nothing else; a day the watch
 * spent on the charger reports low coverage rather than a restful day.
 */
export interface DayLoad {
  /** Whole-day step count so far, MERGED ACROSS SOURCES. */
  steps: number | null;
  /** Which read produced `steps` (budget/restore.ts `STEP_READ_VERSION`).
   *  Absent means 1: the Android read that SUMMED every app's Steps records
   *  instead of aggregating them, which triple-counted a day for anyone with
   *  a wearable writing to Health Connect alongside the phone. Stored so those
   *  days can be read back once (`misreadStepDays`), and on the DAY rather
   *  than in the flags store for the reason `pricedVersion` is. */
  stepsVersion: number | null;
  /** Minutes holding any steps, merged from the sample timestamps. Works on a
   *  phone with no wearable — every phone counts its own steps. */
  walkingMin: number | null;
  /** Apple Stand Time minutes. iOS with a paired watch only: the phone cannot
   *  know you are standing, and Health Connect has no equivalent record. */
  standMin: number | null;
  /** Minutes standing STILL, inferred from the user's own orthostatic
   *  signature (src/lib/budget/upright.ts). Null without a heart-rate series;
   *  never claimed from steps alone. */
  stillUprightMin: number | null;
  /** The heart rate the standing band's floor sat at for this day, which is
   *  the user's signature floor raised to clear the day's own quiet level.
   *  Stored so the drill-in can state the threshold the estimate used, and so
   *  a later baseline shift cannot silently re-mean a stored count. */
  stillFloorBpm: number | null;
  /** Walking and standing stretches, for the drill-in's shading. */
  uprightSpans: { startMin: number; endMin: number; kind: 'walk' | 'still' }[] | null;
  /** Upright minutes per clock hour (each array 24 long), counted from the
   *  same spans as the totals, for the drill-in's hourly bars. `stand` is
   *  Apple Stand Time, iOS with a watch only. Null on a day read before hours
   *  were kept; a null array inside means that source was not measured. */
  uprightByHour: { walk: number[] | null; still: number[] | null; stand: number[] | null } | null;
  /** `hrBelowMin` per clock hour, 24 long. Null when unknown. */
  hrBelowByHour: number[] | null;
  /** Minutes the heart sat above the user's own exertion line. */
  hrAboveMin: number | null;
  /** Those minutes split by how far above the line they sat (budget/burn.ts
   *  HR_BAND_EDGES), which is what lets the day be priced by intensity. The
   *  curve itself cannot live here, so this is the resolution the journal
   *  keeps. Null means UNKNOWN — a day read before bands existed, charged
   *  flat rather than guessed at; an empty array means "looked, nothing". */
  hrBands: number[] | null;
  /** Minutes the heart sat BELOW the user's own recovery line while awake.
   *  Genuine parasympathetic time, and the budget pays it back. */
  hrBelowMin: number | null;
  /** Minutes the series actually covered, so a charger gap reads as unknown. */
  hrCoverageMin: number | null;
  /** Minutes between this day's heart-rate readings (budget/burn.ts
   *  `typicalGapMin`). A chest strap reads a fiftieth of a minute and a
   *  background wrist reads several, so this is what says WHICH INSTRUMENT
   *  watched the day, and it is what `capacityBaseline` compares before
   *  treating two days' spend as the same measurement. Null on a day read
   *  before it was kept, which is read as unknown and never as fine. */
  hrSampleGapMin: number | null;
  /** Which pricing rules charged this day (budget/reprice.ts `PRICE_VERSION`).
   *  Absent means 1, the rules before the gap tolerance was fitted to the day.
   *  It lives on the DAY rather than in the flags store so an imported journal
   *  is re-priced too, where a device-level "already done" would skip it. */
  pricedVersion: number | null;
  /** Contiguous runs above the line ("in three stretches"). */
  hrStretches: number | null;
  /** The longest such run, minutes past midnight. */
  longestStretch: { startMin: number; endMin: number } | null;
  peakBpm: number | null;
  /** The line the minutes were counted against, so a later baseline shift
   *  cannot silently re-mean a stored count. */
  lineBpm: number | null;
  readAt: string | null;
}

/** User-configurable definition of a "clean day" (the streak protocol). Each
 *  requirement can be toggled on/off; enabled ones become clean-day criteria.
 *  `types` hold registry keys (meds/triggers/activities). See DEFAULT_PROTOCOL
 *  + dayCleanliness in scoring/day.ts. */
export interface Protocol {
  /** Avoid triggers. Empty `types` = avoid ALL triggers; else only these. */
  triggers: { enabled: boolean; types: string[] };
  /** Take at least one HRV reading (training or baseline) that day. */
  hrv: { enabled: boolean };
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

/** The five pacing alerts (src/lib/budget/alerts.ts). */
export type PacingAlertKind = 'ahead' | 'nearly' | 'over' | 'exertion' | 'easy';

export interface AppState {
  version: number;
  settings: {
    theme: ThemeSetting;
    lastBleDeviceId?: string;
    lastBleDeviceName?: string;
    healthEnabled?: boolean;
    /** Signal source of the last live HRV capture — seeds the setup sheet's
     *  default so a deliberate choice (camera / watch) sticks across sessions. */
    lastHrvSource?: 'polar' | 'watch' | 'garmin' | 'camera';
    /** Remembered camera-module layout from the finger (PPG) setup card —
     *  once set, camera readings skip straight to the wait-for-finger step.
     *  "Start over" on that card clears it. */
    cameraLayout?: CameraLayout;
    /** Clean-day protocol; undefined falls back to DEFAULT_PROTOCOL. */
    protocol?: Protocol;
    /** Day key stamped the first time a protocol is saved (never cleared) —
     *  completes the "Getting started" protocol milestone. */
    protocolSetOn?: string;
    /** Daily morning-reading nudge. Source of truth for the OS schedule — see
     *  `syncReminder()` in lib/reminders. `time` survives disabling so
     *  re-enabling can offer it back. */
    reminder?: { enabled: boolean; time: string };
    /** Crash warning: a notification fired when the trailing-week trend flags
     *  a likely crash (detectDownturn), telling the user to rest. `lastFired`
     *  is the day key last notified, so one slide alerts once per day.
     *  Undefined means "never chosen" — first enabling the morning reminder
     *  defaults it on; an explicit off stays off. */
    crashAlert?: { enabled: boolean; lastFired?: string };
    /** Pacing alerts, per kind (src/lib/budget/alerts.ts). A kind that is
     *  undefined is ON: nobody chose against it, and granting notification
     *  permission is the choice. Only an explicit `false` turns one off. What
     *  has fired today lives in the flags MMKV, not here. */
    pacingAlerts?: Partial<Record<PacingAlertKind, boolean>>;
    /** The master switch over all five. Undefined is ON; `false` silences every
     *  kind without touching `pacingAlerts`, so turning it back on restores
     *  the per-kind choices. */
    pacingAlertsEnabled?: boolean;
    /** Record barometric pressure from the phone's own sensor (lib/pressure).
     *  Undefined is ON where no permission stands in the way (Android) and OFF
     *  where one does (iOS asks for Motion & Fitness, so it waits for a tap in
     *  the wizard or Settings). `false` is an explicit off on both. */
    pressureEnabled?: boolean;
    /** The low-pressure notification (lib/reminders `checkPressureAlert`).
     *  Undefined reads as ON: it can only ever fire on a link the Insights
     *  sweep has found in this journal, so there is nothing to opt into until
     *  then. `lastFired` is the day key, one a day. */
    pressureAlert?: { enabled: boolean; lastFired?: string };
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
  /** Barometer samples by day (lib/pressure). Top level, never on a day record:
   *  an automatic reading is not a day the user logged. */
  pressure?: PressureMap;
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
  /** Time fields only: the field may be left empty (no "now" default, and the
   *  picker offers Clear). Used by a symptom's optional end time. */
  optional?: boolean;
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
  /** The entry describes something that lasts, so `entryFields` adds an
   *  optional "Ended" time after the start time (symptoms — stamped by
   *  `typesFor`, so custom symptoms get it too). */
  ends?: boolean;
  /** Default dose for a user-defined medication (e.g. "400mg"); prefills Amount. */
  dosage?: string;
  /** True for user-created types (stored in state.customTypes). */
  userDefined?: boolean;
  /** How much a minute of this costs, for the pacing budget. Built-in
   *  activities never carry it — LOAD_TABLE in src/lib/budget/load.ts is the
   *  source for those, so the weights live in one readable table the way the
   *  scoring thresholds do. It is set only on user-created activities, where
   *  the create-type form asks once (light / moderate / heavy). */
  load?: 'rest' | 'light' | 'moderate' | 'heavy' | 'strenuous';
  summary?: (r: Entry) => string;
  detail?: (r: Entry) => string;
}
