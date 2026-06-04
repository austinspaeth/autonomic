// Ported verbatim from legacy docs/index.html ~lines 1675-1756:
//   med() + MED_TYPES, symptom() + SYMPTOM_TYPES, trig() + TRIGGER_TYPES, MEAL_TYPES.
// Decouplings: ICONS.pill / ICONS.alert -> string icon keys 'pill' / 'alert';
// trig() objects get an explicit `fields: []` to satisfy the strict TypeDef shape
// (legacy omitted the key, which buildFieldInputs treats as empty).

import type { TypeDef, Field } from '@core/domain/fieldSchema';

// Medications & supplements - programmatic list (no custom adds). Each logged
// entry captures a time and an amount.
const med = (label: string): TypeDef => ({
  label,
  icon: 'pill',
  fields: [
    { type: 'time', key: 'time', label: 'Time' },
    { type: 'text', key: 'amount', label: 'Amount', placeholder: 'e.g. 5 mg, 1 tablet, 1 packet' },
  ],
});

export const MED_TYPES: Record<string, TypeDef> = {
  allegra: med('Allegra'),
  pepsidAc: med('Pepsid AC'),
  magCitrate: med('Magnesium Citrate'),
  magGlycinate: med('Magnesium Glycinate'),
  coq10: med('CoQ10'),
  omega3: med('Omega 3'),
  vitB1: med('Vitamin B1'),
  vitD3: med('Vitamin D3'),
  liquidIv: med('Liquid IV'),
  lmnt: med('LMNT'),
  melatonin: med('Melatonin'),
  gaviscon: med('Gaviscon'),
  metamucil: med('Metamucil'),
};

// Symptoms - programmatic list. Each is a logged entry; templates (per-symptom
// fields) can be added like readings. Time + Notes are auto-included.
const symptom = (label: string, fields?: Field[]): TypeDef => ({
  label,
  icon: 'alert',
  fields: fields || [],
});

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

// Trigger foods/drinks (programmatic). Logged with an occurrence count per day.
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

// Meals: logged with a type, time eaten, calories, and notes. Calories sum
// to the day's total; a dinner by 5pm feeds the clean-day score.
export const MEAL_TYPES: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
  snack: 'Snack',
};
