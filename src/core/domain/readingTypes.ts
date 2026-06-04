// READING_TYPES registry — ported verbatim from docs/index.html:1451-1578.
// Pure TypeScript: no react / react-native / expo / DOM imports.
//
// Decouplings from legacy:
//  - `icon` values were `ICONS.<key>` object refs; here they are the string key
//    name (e.g. 'smile') so this module stays free of the icon registry.
//  - `weight.onSave` mutated the global `state.profile` in legacy; here it is a
//    pure function returning a `Partial<Profile>` patch for the caller to apply.

import type { TypeDef } from '@core/domain/fieldSchema';
import type { Profile, Reading } from '@core/types';

export const READING_TYPES: Record<string, TypeDef> = {
  mood: {
    label: 'Mood',
    icon: 'smile',
    fields: [
      {
        type: 'select',
        key: 'mood',
        label: 'How are you feeling?',
        options: [
          'Feeling amazing',
          'Feeling normal',
          'Feeling bad',
          'Feeling like a crash',
        ],
      },
    ],
  },
  hrv: {
    label: 'Unstructured HRV',
    icon: 'heartPulse',
    fields: [
      { key: 'readiness', label: 'Readiness', unit: '%' },
      { key: 'age', label: 'Age' },
      { key: 'pns', label: 'PNS index', signed: true },
      { key: 'sns', label: 'SNS index', signed: true },
      { divider: true },
      { key: 'rmssd', label: 'RMSSD' },
      { key: 'sdnn', label: 'SDNN' },
      { key: 'avgHr', label: 'Avg HR' },
      { key: 'stressIndex', label: 'Stress index' },
      { key: 'lowPower', label: 'Low power' },
      { key: 'highPower', label: 'High power' },
      { type: 'check', key: 'swallowing', label: 'Swallowing' },
    ],
  },
  breathHrv: {
    label: 'Breathing HRV',
    icon: 'wind',
    fields: [
      { type: 'select', key: 'style', label: 'Breathing style', options: ['4/4', '4/5', '4/6', '5/5'] },
      { type: 'number', key: 'coherence', label: 'Coherence', unit: '%' },
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
      { type: 'check', key: 'swallowing', label: 'Swallowing' },
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
  bloodO2: {
    label: 'Blood Oxygen',
    icon: 'gauge',
    fields: [
      { type: 'number', key: 'value', label: 'Blood oxygen', unit: '%' },
      { type: 'number', key: 'perfusion', label: 'Perfusion index' },
      { type: 'number', key: 'pulse', label: 'Pulse' },
    ],
  },
  ecg: {
    label: 'ECG',
    icon: 'activity',
    fields: [
      { type: 'number', key: 'hrv', label: 'HRV' },
      { type: 'number', key: 'hr', label: 'HR' },
      { type: 'number', key: 'qrs', label: 'QRS' },
      { type: 'number', key: 'qtc', label: 'QTc' },
      { type: 'number', key: 'pr', label: 'PR' },
      { type: 'number', key: 'ectopic', label: 'Ectopic beats' },
      { divider: true },
      { type: 'check', key: 'sinus', label: 'Sinus' },
      { type: 'check', key: 'svt', label: 'SVT' },
      { type: 'check', key: 'otherArrhythmia', label: 'Other' },
      { type: 'textarea', key: 'note', label: 'Notes', placeholder: 'Optional notes' },
      { type: 'textarea', key: 'techReview', label: 'Technician review', placeholder: 'Technician review' },
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
      { type: 'select', key: 'transition', label: 'Transition', options: ['Laying to standing', 'Sitting to standing', 'Climbing stairs'] },
      { type: 'number', key: 'beforeHr', label: 'Before HR' },
      { type: 'number', key: 'afterHr', label: 'After HR' },
      { type: 'number', key: 'hr1min', label: 'HR after 1 min' },
    ],
  },
  weight: {
    label: 'Weight',
    icon: 'scale',
    fields: [
      { type: 'time', key: 'time', label: 'Time' },
      { type: 'number', key: 'weight', label: 'Weight (lbs)', unit: ' lbs' },
    ],
    // Logging a weight updates the profile's current weight.
    // Decoupled: returns a Partial<Profile> patch instead of mutating state.profile.
    onSave: (r: Reading): Partial<Profile> | undefined => {
      if (r.weight !== '' && r.weight != null) {
        return { weight: String(r.weight).trim() };
      }
      return undefined;
    },
  },
};
