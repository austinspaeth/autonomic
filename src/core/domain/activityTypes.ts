// Activity types registry — programmatic only (no custom user-added ones).
// Each logged activity is { id, type, time, note, ...fields }.
// Ported verbatim from legacy docs/index.html ACTIVITY_TYPES (~1583-1671).
// Decouplings: `icon` is a string key name (was ICONS.* DOM/SVG ref);
// summary()/detail() kept verbatim. `custom: 'bike'` preserved (indoor bike).

import type { TypeDef } from '@core/domain/fieldSchema';

export const ACTIVITY_TYPES: Record<string, TypeDef> = {
  indoorBike: {
    label: 'Indoor bike',
    icon: 'bike',
    custom: 'bike', // uses bikeForm() instead of the generic schema form
    summary: (r: any) => (r.duration ? `${r.duration} min` : (r.distance ? `${r.distance}` : '')),
    detail: (r: any) => {
      const p: string[] = [];
      if (r.distance) p.push(`Dist ${r.distance} mi`);
      if (r.avgHr) p.push(`Avg HR ${r.avgHr}`);
      if (r.interval) p.push(`${(r.intervals || []).length} interval${(r.intervals || []).length === 1 ? '' : 's'}`);
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
};
