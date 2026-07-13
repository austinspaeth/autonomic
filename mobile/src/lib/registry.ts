/**
 * Programmatic entry-type registries — ported from the PWA. Order matters:
 * it is the order shown in the "+ Add" pickers. `icon` keys into the icon set
 * in src/components/Icon.tsx.
 *
 * These maps are only the built-in baseline: users can create their own
 * activity/med/symptom/trigger types and delete unused built-ins, layered on
 * via src/lib/typeCatalog.ts (state.customTypes / state.hiddenTypes). UI code
 * should resolve types through typesFor(), not read these maps directly.
 */
import type { Entry, FieldDef, TypeDef } from './types';
import { orthoMaxDelta } from './scoring';

/** Blood-pressure auto-advance: a value starting with 1 (or, for systolic, 2)
 *  is a 3-digit number; anything else is complete at 2 digits. Exact match so
 *  edits to an already-full field don't re-trigger the jump. */
const bpDigitsDone = (leads: string[]) => (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === (leads.includes(d[0]) ? 3 : 2);
};

export const READING_TYPES: Record<string, TypeDef> = {
  hrv: {
    label: 'Unstructured HRV',
    icon: 'heartPulse',
    fields: [
      { key: 'pns', label: 'PNS index', signed: true },
      { key: 'sns', label: 'SNS index', signed: true },
      { key: 'stressIndex', label: 'Stress index' },
      { divider: true },
      { type: 'number', key: 'sdnn', label: 'SDNN' },
      { type: 'number', key: 'avgHr', label: 'Avg HR' },
      { type: 'number', key: 'meanRr', label: 'Mean RR' },
      { type: 'number', key: 'rmssd', label: 'RMSSD' },
      { type: 'number', key: 'pnn50', label: 'pNN50' },
      { type: 'number', key: 'mxdmn', label: 'MxDMn', unit: 's' },
      { type: 'number', key: 'mode', label: 'Mode' },
      { type: 'number', key: 'amo50', label: 'AMo50' },
      { type: 'number', key: 'cv', label: 'CV' },
      { type: 'number', key: 'vlowPower', label: 'Very low power' },
      { type: 'number', key: 'lowPower', label: 'Low power' },
      { type: 'number', key: 'highPower', label: 'High power' },
      { type: 'number', key: 'lfPeak', label: 'LF peak', unit: 'Hz' },
      { type: 'number', key: 'hfPeak', label: 'HF peak', unit: 'Hz' },
      { divider: true },
      { type: 'time', key: 'time', label: 'Time' },
      { type: 'select', key: 'period', label: 'Reading type', options: ['Morning', 'Evening', 'Other'] },
    ],
  },
  breathHrv: {
    label: 'Structured HRV',
    icon: 'wind',
    fields: [
      { type: 'select', key: 'style', label: 'Breathing style', options: ['4/6', '4/4/4/4', '4/7/8'] },
      { key: 'pns', label: 'PNS index', signed: true },
      { key: 'sns', label: 'SNS index', signed: true },
      { key: 'stressIndex', label: 'Stress index' },
      { divider: true },
      { type: 'number', key: 'sdnn', label: 'SDNN' },
      { type: 'number', key: 'hr', label: 'HR' },
      { type: 'number', key: 'meanRr', label: 'Mean RR' },
      { type: 'number', key: 'rmssd', label: 'RMSSD' },
      { type: 'number', key: 'pnn50', label: 'pNN50' },
      { type: 'number', key: 'mxdmn', label: 'MxDMn', unit: 's' },
      { type: 'number', key: 'mode', label: 'Mode' },
      { type: 'number', key: 'amo50', label: 'AMo50' },
      { type: 'number', key: 'cv', label: 'CV' },
      { type: 'number', key: 'vlowPower', label: 'Very low power' },
      { type: 'number', key: 'lowPower', label: 'Low power' },
      { type: 'number', key: 'highPower', label: 'High power' },
      { type: 'number', key: 'lfPeak', label: 'LF peak', unit: 'Hz' },
      { type: 'number', key: 'hfPeak', label: 'HF peak', unit: 'Hz' },
      { divider: true },
      { type: 'time', key: 'time', label: 'Time' },
      { type: 'select', key: 'period', label: 'Reading type', options: ['Morning', 'Evening', 'Other'] },
    ],
  },
  bp: {
    label: 'Blood Pressure',
    icon: 'droplet',
    fields: [
      { type: 'number', key: 'sys', label: 'Systolic', autoNext: bpDigitsDone(['1', '2']) },
      { type: 'number', key: 'dia', label: 'Diastolic', autoNext: bpDigitsDone(['1']) },
      { type: 'number', key: 'pulse', label: 'Pulse' },
      { type: 'select', key: 'period', label: 'Reading type', options: ['Morning', 'Evening', 'Other'] },
    ],
  },
  restingHr: {
    label: 'Resting Heart Rate',
    icon: 'heart',
    fields: [
      { type: 'number', key: 'hr', label: 'HR' },
      { type: 'time', key: 'time', label: 'Time' },
      { type: 'select', key: 'position', label: 'Position', options: ['Laying', 'Sitting'] },
    ],
  },
  standTest: {
    label: 'POTS Test',
    icon: 'standing',
    fields: [
      { type: 'number', key: 'baselineHr', label: 'Baseline HR' },
      { type: 'number', key: 'peakHr', label: 'Peak HR' },
      { type: 'number', key: 'peakDelta', label: 'Peak Δ', signed: true },
      { type: 'number', key: 'sustainedDelta', label: 'Sustained Δ', signed: true },
      { type: 'check', key: 'metThreshold', label: 'Sustained rise ≥30 bpm' },
      { divider: true },
      { type: 'number', key: 'maxHrReached', label: 'Max HR reached' },
      { type: 'time', key: 'time', label: 'Time' },
    ],
  },
  orthostatic: {
    label: 'POTS Episode',
    icon: 'stairs',
    fields: [
      { type: 'select', key: 'transition', label: 'Transition', options: ['Laying to standing', 'Sitting to standing', 'Climbing stairs', 'Other'] },
      { type: 'number', key: 'beforeHr', label: 'Before HR' },
      { type: 'number', key: 'afterHr', label: 'After HR' },
      { type: 'number', key: 'hr1min', label: 'HR after 1 min' },
    ],
  },
};

/**
 * Reading types that can only be produced by a live capture (or an Apple
 * Watch ECG sync) — hidden from the manual "+ Add" reading picker.
 */
export const LIVE_ONLY_READING_TYPES = new Set(['hrv', 'breathHrv', 'standTest']);

/** Alphabetical by label ("Other exercise" stays last as the catch-all);
 *  pickers render in this insertion order. Covers the Apple Workout app's
 *  default types (strength maps to the upper/lower split). */
export const ACTIVITY_TYPES: Record<string, TypeDef> = {
  breathwork: {
    label: 'Breathwork / meditation', icon: 'wind',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
    ],
  },
  carWash: {
    label: 'Car wash', icon: 'car',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  cooldown: {
    label: 'Cooldown', icon: 'wind',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
    ],
  },
  coreWorkout: {
    label: 'Core workout', icon: 'target',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  dance: {
    label: 'Dance', icon: 'sparkles',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  elliptical: {
    label: 'Elliptical', icon: 'activity',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  errands: {
    label: 'Errands / shopping', icon: 'car',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  hiit: {
    label: 'HIIT', icon: 'flame',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  hike: {
    label: 'Hike', icon: 'footprints',
    fields: [
      { key: 'distance', label: 'Distance', unit: 'mi' },
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  shower: {
    label: 'Hot shower / bath', icon: 'droplet',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  indoorBike: {
    label: 'Indoor bike',
    icon: 'bike',
    custom: 'bike',
    summary: (r: Entry) => (r.duration ? `${r.duration} min` : r.distance ? `${r.distance}` : ''),
    detail: (r: Entry) => {
      const p: string[] = [];
      if (r.distance) p.push(`Dist ${r.distance} mi`);
      if (r.avgHr) p.push(`Avg HR ${r.avgHr}`);
      const ivs = (r.intervals as unknown[]) || [];
      if (r.interval) p.push(`${ivs.length} interval${ivs.length === 1 ? '' : 's'}`);
      else if (r.resistance) p.push(`Resistance ${r.resistance}`);
      if (r.hr60) p.push(`HR@60s ${r.hr60}`);
      return p.join(' · ');
    },
    fields: [],
  },
  kickboxing: {
    label: 'Kickboxing', icon: 'target',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  legsUp: {
    label: 'Legs up', icon: 'legsUp',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'lowHr', label: 'Low HR' },
    ],
  },
  lowerBody: {
    label: 'Lower body strength', icon: 'barbell',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  cycle: {
    label: 'Outdoor bike', icon: 'bike',
    fields: [
      { key: 'distance', label: 'Distance', unit: 'mi' },
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  pilates: {
    label: 'Pilates', icon: 'standing',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  rower: {
    label: 'Rowing', icon: 'activity',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  run: {
    label: 'Run', icon: 'activity',
    fields: [
      { key: 'distance', label: 'Distance', unit: 'mi' },
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
      { key: 'hr60', label: 'HR @60s rest' },
    ],
  },
  sex: {
    label: 'Sex', icon: 'heart',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  stairStepper: {
    label: 'Stair stepper', icon: 'stairs',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  strenuousWork: {
    label: 'Strenuous work', icon: 'flame',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  stressfulWork: {
    label: 'Stressful work', icon: 'zap',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  swim: {
    label: 'Swim', icon: 'droplet',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  taiChi: {
    label: 'Tai chi', icon: 'wind',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  upperBody: {
    label: 'Upper body strength', icon: 'barbell',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  walk: {
    label: 'Walk', icon: 'footprints',
    fields: [
      { key: 'distance', label: 'Distance', unit: 'mi' },
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'maxHr', label: 'Max HR' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'hr60', label: 'HR @60s rest' },
      { type: 'time', key: 'time', label: 'Time' },
      { divider: true },
      { type: 'check', key: 'hotTemp', label: 'Hot temp' },
      { type: 'check', key: 'highHumidity', label: 'High humidity' },
      { type: 'check', key: 'palpitations', label: 'Palpitations' },
    ],
  },
  yoga: {
    label: 'Yoga / stretching', icon: 'standing',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
    ],
  },
  otherExercise: {
    label: 'Other exercise', icon: 'activity',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
      { key: 'hr60', label: 'HR @60s rest' },
      { type: 'time', key: 'time', label: 'Time' },
      { divider: true },
      { type: 'check', key: 'hotTemp', label: 'Hot temp' },
      { type: 'check', key: 'highHumidity', label: 'High humidity' },
      { type: 'check', key: 'palpitations', label: 'Palpitations' },
    ],
  },
};

const med = (label: string): TypeDef => ({
  label,
  icon: 'pill',
  fields: [
    { type: 'time', key: 'time', label: 'Time' },
    { type: 'number', key: 'amount', label: 'Amount' },
  ],
});
export const MED_TYPES: Record<string, TypeDef> = {
  allegra: med('Allegra'),
  pepsidAc: med('Pepsid AC'),
  magCitrate: med('Magnesium Citrate'),
  magGlycinate: med('Magnesium Glycinate'),
  coq10: med('CoQ10'),
  omega3: med('Omega 3'),
  quercetin: med('Quercetin'),
  vitB1: med('Vitamin B1'),
  vitD3: med('Vitamin D3'),
  liquidIv: med('Liquid IV'),
  lmnt: med('LMNT'),
  melatonin: med('Melatonin'),
  gaviscon: med('Gaviscon'),
  metamucil: med('Metamucil'),
};

const symptom = (label: string, fields?: FieldDef[]): TypeDef => ({ label, icon: 'alert', fields: fields || [] });
/** Alphabetical by label; pickers render in this insertion order. Covers the
 *  common POTS / long-COVID / MCAS symptom set. */
export const SYMPTOM_TYPES: Record<string, TypeDef> = {
  adrenalineSurge: symptom('Adrenaline surge'),
  anxiety: symptom('Anxiety'),
  bloating: symptom('Bloating'),
  bloodPooling: symptom('Blood pooling'),
  blurredVision: symptom('Blurred vision'),
  brainFog: symptom('Brain fog'),
  chestPain: symptom('Chest pain / tightness'),
  chills: symptom('Chills'),
  coatHanger: symptom('Coat hanger pain'),
  coldExtremities: symptom('Cold hands / feet'),
  congestion: symptom('Congestion / runny nose'),
  earRinging: symptom('Ear ringing'),
  sweating: symptom('Excess sweating'),
  syncope: symptom('Fainting'),
  fatigue: symptom('Fatigue'),
  flushing: symptom('Flushing'),
  pressure: symptom('Head pressure'),
  headache: symptom('Headache'),
  heatIntolerance: symptom('Heat intolerance'),
  highBp: symptom('High BP', [
    { type: 'number', key: 'sys', label: 'Systolic' },
    { type: 'number', key: 'dia', label: 'Diastolic' },
    { type: 'time', key: 'time', label: 'Time' },
    { type: 'select', key: 'position', label: 'Position', options: ['Laying', 'Sitting'] },
  ]),
  labileHr: symptom('High HR', [
    { type: 'number', key: 'hr', label: 'HR' },
    { type: 'select', key: 'position', label: 'Position', options: ['Sitting', 'Standing'] },
    { type: 'number', key: 'hr5', label: 'HR after 5 min rest' },
    { type: 'time', key: 'time', label: 'Time' },
  ]),
  hives: symptom('Hives / itching'),
  insomnia: symptom('Insomnia / poor sleep'),
  jointPain: symptom('Joint pain'),
  lightHeaded: symptom('Light Headed/Dizzy'),
  muscleFatigue: symptom('Muscle fatigue', [
    { type: 'select', key: 'part', label: 'Body part', options: ['All', 'Arms', 'Legs', 'Core', 'Back', 'Neck'] },
  ]),
  nausea: symptom('Nausea'),
  presyncope: symptom('Near faint / presyncope'),
  nerve: symptom('Nerve issues', [
    { type: 'select', key: 'sensation', label: 'Sensation', options: ['Pain', 'Tingles', 'Asleep'] },
    { type: 'select', key: 'area', label: 'Area of body', options: ['Face', 'Head', 'Neck', 'Chest', 'Shoulders', 'Arms', 'Legs'] },
  ]),
  palpitations: symptom('Palpitations'),
  pem: symptom('Post-exertional malaise'),
  reflux: symptom('Reflux / heartburn'),
  shortnessOfBreath: symptom('Shortness of breath'),
  sick: { label: 'Sick', icon: 'alert', fields: [], noTime: true },
  soreThroat: symptom('Sore throat'),
  stomachPain: symptom('Stomach pain'),
  tempDysregulation: symptom('Temperature swings'),
  throatTightness: symptom('Throat tightness'),
  tremor: symptom('Tremor / shakiness'),
  twitching: symptom('Twitching', [
    { type: 'select', key: 'area', label: 'Area of body', options: ['Face', 'Head', 'Neck', 'Chest', 'Shoulders', 'Arms', 'Legs'] },
    { type: 'select', key: 'severity', label: 'Severity', options: ['Minor', 'Severe'] },
    { type: 'number', key: 'duration', label: 'Duration', unit: 'min' },
  ]),
};

const trig = (label: string): TypeDef => ({ label, icon: 'alert', fields: [] });
/** Alphabetical by label; pickers render in this insertion order. Food plus the
 *  common non-food POTS / MCAS triggers (heat, stress, exertion, standing). */
export const TRIGGER_TYPES: Record<string, TypeDef> = {
  agedCheese: trig('Aged cheese'),
  alcohol: trig('Alcohol'),
  artificialSweeteners: trig('Artificial sweeteners'),
  caffeine: trig('Caffeine'),
  chocolate: trig('Chocolate'),
  citrus: trig('Citrus'),
  dairy: trig('Dairy'),
  dehydration: trig('Dehydration'),
  eggs: trig('Eggs'),
  fermented: trig('Fermented food'),
  foodAdditives: trig('Food dyes / additives'),
  fragrances: trig('Fragrances / chemicals'),
  friedFoods: trig('Fried foods'),
  gluten: trig('Gluten'),
  heat: trig('Heat / hot weather'),
  highSodium: trig('High sodium'),
  highCarb: trig('High-carb meal'),
  histamine: trig('Histamine food'),
  largeMeal: trig('Large meal'),
  leftovers: trig('Leftovers'),
  msg: trig('MSG'),
  nightshades: trig('Nightshades'),
  nuts: trig('Nuts'),
  overexertion: trig('Overexertion'),
  pizza: trig('Pizza'),
  processedMeats: trig('Processed meats'),
  prolongedStanding: trig('Prolonged standing'),
  shellfish: trig('Shellfish'),
  soy: trig('Soy'),
  spicyFood: trig('Spicy food'),
  stress: trig('Stress'),
  sugar: trig('Sugar'),
};

/** Bowel-movement option sets (the bespoke BowelForm renders these as cards). */
export const BM_KINDS = [
  { val: 'Loose', bristol: 'Bristol 5–6' },
  { val: 'Formed', bristol: 'Bristol 3–4' },
  { val: 'Hard', bristol: 'Bristol 1–2' },
  { val: 'Diarrhea', bristol: 'Bristol 7' },
] as const;
export const BM_VOLUMES = [
  { val: 'Small pieces', dot: 8 },
  { val: 'Small', dot: 13 },
  { val: 'Medium', dot: 19 },
  { val: 'Large', dot: 26 },
] as const;

/* ---------- generic field-schema helpers (shared by forms & rows) ---------- */
export const isDivider = (f: FieldDef) => !!f.divider || f.type === 'divider';
export const isNumberField = (f: FieldDef) => f.type === 'number' || (!f.type && !!f.key && !f.divider);
export const fieldLabel = (f: FieldDef) => (f.label || '') + (f.unit ? ` (${f.unit})` : '');

/**
 * The fields to render. Auto-adds a Time input (before any free-text fields)
 * and a trailing Notes textarea when the schema doesn't define them.
 */
export function entryFields(def?: TypeDef): FieldDef[] {
  const fields = (def && def.fields ? def.fields : []).slice();
  if (!(def && def.noTime) && !fields.some((f) => f.type === 'time')) {
    const firstText = fields.findIndex((f) => f.type === 'textarea');
    const timeField: FieldDef = { type: 'time', key: 'time', label: 'Time' };
    if (firstText >= 0) fields.splice(firstText, 0, timeField);
    else fields.push(timeField);
  }
  if (!fields.some((f) => f.key === 'note')) {
    fields.push({ type: 'textarea', key: 'note', label: 'Notes', placeholder: 'Optional note' });
  }
  return fields;
}

/** Headline value shown on the right of a row = first filled number field. */
export function summarizeFields(def: TypeDef | undefined, r: Entry): string {
  if (!def) return '';
  for (const f of entryFields(def)) {
    if (!isNumberField(f)) continue;
    const v = r[f.key!];
    if (v != null && v !== '') return String(v) + (f.unit || '');
  }
  return '';
}

/** Secondary line = remaining filled fields (numbers/selects) + checked flags. */
export function detailFields(def: TypeDef | undefined, r: Entry): string {
  if (!def) return '';
  const parts: string[] = [];
  let headlineSkipped = false;
  for (const f of entryFields(def)) {
    if (isDivider(f) || f.type === 'time' || f.type === 'textarea') continue;
    if (f.type === 'check') { if (r[f.key!]) parts.push(f.label || ''); continue; }
    const v = r[f.key!];
    if (v == null || v === '') continue;
    if (isNumberField(f) && !headlineSkipped) { headlineSkipped = true; continue; }
    parts.push(`${f.label} ${v}${f.unit || ''}`);
  }
  return parts.join(' · ');
}

/** Simplified value shown on the right of a reading row (one thing per type). */
/**
 * Display name for a reading. Only an HRV auto-imported from Apple Health
 * (welcome-view backfill, `imported`) is shown as "Apple Watch HRV"; an HRV
 * captured through the readings section keeps its registry label (Structured /
 * Unstructured HRV) even when the watch was the capture source — the summary
 * card's Source row is what says it came from the watch.
 */
export function readingLabel(r: Entry): string {
  if (r.type === 'hrv' && r.source === 'watch' && r.imported) return 'Apple Watch HRV';
  return READING_TYPES[r.type]?.label ?? r.type;
}

export function readingRowValue(r: Entry, hrCurve?: { t: number; bpm: number }[] | null): string {
  switch (r.type) {
    case 'hrv':
    case 'breathHrv': return r.sdnn != null && r.sdnn !== '' ? `${r.sdnn} SDNN` : '';
    case 'bp': return r.sys || r.dia ? `${r.sys || '-'}/${r.dia || '-'}` : '';
    case 'restingHr': return r.hr != null && r.hr !== '' ? `${r.hr} hr` : '';
    case 'standTest': {
      const d = r.sustainedDelta ?? r.peakDelta;
      return d != null && d !== '' ? `${Math.abs(+d)} Δ` : '';
    }
    case 'orthostatic': {
      const d = orthoMaxDelta(r, hrCurve);
      return d != null ? `${Math.abs(d)} Δ` : '';
    }
    default: return summarizeFields(READING_TYPES[r.type], r);
  }
}

/** Row label for a bowel movement, e.g. "Loose + Medium Volume · Mild straining". */
export function bmLabel(m: { kind?: string; volume?: string; straining?: boolean | 'mild' | 'severe' }): string {
  const parts: string[] = [];
  if (m.kind) parts.push(m.kind);
  if (m.volume) parts.push(`${m.volume} Volume`);
  let s = parts.join(' + ');
  const strain = m.straining === 'mild' ? 'Mild straining'
    : m.straining === 'severe' ? 'Severe straining'
    : m.straining ? 'Straining' : '';
  if (strain) s += (s ? ' · ' : '') + strain;
  return s || 'Bowel movement';
}
