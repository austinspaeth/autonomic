/**
 * Programmatic entry-type registries — ported from the PWA. Order matters:
 * it is the order shown in the "+ Add" pickers. `icon` keys into the icon set
 * in src/components/Icon.tsx.
 */
import type { Entry, FieldDef, TypeDef } from './types';

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
      { type: 'select', key: 'period', label: 'Reading type', options: ['Morning', 'Evening', 'Random'] },
    ],
  },
  breathHrv: {
    label: 'Structured HRV',
    icon: 'wind',
    fields: [
      { type: 'select', key: 'style', label: 'Breathing style', options: ['4/4', '4/5', '4/6', '5/5'] },
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
      { type: 'select', key: 'period', label: 'Reading type', options: ['Morning', 'Evening', 'Random'] },
    ],
  },
  bp: {
    label: 'Blood Pressure',
    icon: 'droplet',
    fields: [
      { type: 'number', key: 'sys', label: 'Systolic' },
      { type: 'number', key: 'dia', label: 'Diastolic' },
      { type: 'number', key: 'pulse', label: 'Pulse' },
      { type: 'select', key: 'period', label: 'Reading type', options: ['Morning', 'Evening', 'Random'] },
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
  orthostatic: {
    label: 'Orthostatic Event',
    icon: 'standing',
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
export const LIVE_ONLY_READING_TYPES = new Set(['hrv', 'breathHrv']);

export const ACTIVITY_TYPES: Record<string, TypeDef> = {
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
  legsUp: {
    label: 'Legs up', icon: 'legsUp',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'lowHr', label: 'Low HR' },
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
  upperBody: {
    label: 'Upper body strength', icon: 'barbell',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
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
  sex: {
    label: 'Sex', icon: 'heart',
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
  hike: {
    label: 'Hike', icon: 'footprints',
    fields: [
      { key: 'distance', label: 'Distance', unit: 'mi' },
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
  lowerBody: {
    label: 'Lower body strength', icon: 'barbell',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
      { key: 'maxHr', label: 'Max HR' },
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
  breathwork: {
    label: 'Breathwork / meditation', icon: 'wind',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
      { key: 'minHr', label: 'Min HR' },
    ],
  },
  shower: {
    label: 'Hot shower / bath', icon: 'droplet',
    fields: [
      { key: 'duration', label: 'Duration', unit: 'min' },
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
export const SYMPTOM_TYPES: Record<string, TypeDef> = {
  highBp: symptom('High BP', [
    { type: 'number', key: 'sys', label: 'Systolic' },
    { type: 'number', key: 'dia', label: 'Diastolic' },
    { type: 'time', key: 'time', label: 'Time' },
    { type: 'select', key: 'position', label: 'Position', options: ['Laying', 'Sitting'] },
  ]),
  pressure: symptom('Head pressure'),
  labileHr: symptom('High HR', [
    { type: 'number', key: 'hr', label: 'HR' },
    { type: 'select', key: 'position', label: 'Position', options: ['Sitting', 'Standing'] },
    { type: 'number', key: 'hr5', label: 'HR after 5 min rest' },
    { type: 'time', key: 'time', label: 'Time' },
  ]),
  lightHeaded: symptom('Light Headed/Dizzy'),
  muscleFatigue: symptom('Muscle fatigue', [
    { type: 'select', key: 'part', label: 'Body part', options: ['All', 'Arms', 'Legs', 'Core', 'Back', 'Neck'] },
  ]),
  headache: symptom('Headache'),
  earRinging: symptom('Ear ringing'),
  nerve: symptom('Nerve issues', [
    { type: 'select', key: 'sensation', label: 'Sensation', options: ['Pain', 'Tingles', 'Asleep'] },
    { type: 'select', key: 'area', label: 'Area of body', options: ['Face', 'Head', 'Neck', 'Chest', 'Shoulders', 'Arms', 'Legs'] },
  ]),
  twitching: symptom('Twitching', [
    { type: 'select', key: 'area', label: 'Area of body', options: ['Face', 'Head', 'Neck', 'Chest', 'Shoulders', 'Arms', 'Legs'] },
    { type: 'select', key: 'severity', label: 'Severity', options: ['Minor', 'Severe'] },
    { type: 'number', key: 'duration', label: 'Duration', unit: 'min' },
  ]),
  sick: { label: 'Sick', icon: 'alert', fields: [], noTime: true },
};

const trig = (label: string): TypeDef => ({ label, icon: 'alert', fields: [] });
export const TRIGGER_TYPES: Record<string, TypeDef> = {
  histamine: trig('Histamine food'),
  alcohol: trig('Alcohol'),
  caffeine: trig('Caffeine'),
  highSodium: trig('High sodium'),
  sugar: trig('Sugar'),
  dairy: trig('Dairy'),
  gluten: trig('Gluten'),
  agedCheese: trig('Aged cheese'),
  fermented: trig('Fermented food'),
  leftovers: trig('Leftovers'),
  chocolate: trig('Chocolate'),
  citrus: trig('Citrus'),
  pizza: trig('Pizza'),
  friedFoods: trig('Fried foods'),
  processedMeats: trig('Processed meats'),
};

/** Ordered field schema for a bowel-movement entry. */
export const BM_FIELDS: FieldDef[] = [
  { type: 'time', key: 'time', label: 'Time' },
  { type: 'select', key: 'kind', label: 'Type', options: ['Loose', 'Formed', 'Hard', 'Diarrhea'] },
  { type: 'check', key: 'straining', label: 'Straining' },
  { type: 'select', key: 'volume', label: 'Volume', options: ['Small pieces', 'Small', 'Medium', 'Large'] },
];

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
 * Display name for a reading. An unstructured HRV that came from Apple Health /
 * Apple Watch (source 'watch') is shown as "Apple Watch HRV" instead of the
 * generic "Unstructured HRV"; everything else uses its registry label.
 */
export function readingLabel(r: Entry): string {
  if (r.type === 'hrv' && r.source === 'watch') return 'Apple Watch HRV';
  return READING_TYPES[r.type]?.label ?? r.type;
}

export function readingRowValue(r: Entry): string {
  switch (r.type) {
    case 'hrv':
    case 'breathHrv': return r.sdnn != null && r.sdnn !== '' ? `${r.sdnn} SDNN` : '';
    case 'bp': return r.sys || r.dia ? `${r.sys || '-'}/${r.dia || '-'}` : '';
    case 'restingHr': return r.hr != null && r.hr !== '' ? `${r.hr} hr` : '';
    default: return summarizeFields(READING_TYPES[r.type], r);
  }
}

/** Row label for a bowel movement, e.g. "Loose + Medium Volume · Straining". */
export function bmLabel(m: { kind?: string; volume?: string; straining?: boolean }): string {
  const parts: string[] = [];
  if (m.kind) parts.push(m.kind);
  if (m.volume) parts.push(`${m.volume} Volume`);
  let s = parts.join(' + ');
  if (m.straining) s += (s ? ' · ' : '') + 'Straining';
  return s || 'Bowel movement';
}
