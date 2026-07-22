/**
 * Per-reading-type Apple Health "sources" for the on-demand import picker.
 *
 * The product model: tapping a reading type (Blood Pressure / Resting HR) opens
 * a card that lists that reading type's samples *for the selected day* from
 * Apple Health so you can pick one to review-and-save — or enter it manually.
 * This deliberately avoids the bulk "sync everything" path, which pulls a lot of
 * noise. HRV/breathing-HRV are live-capture only, and types with no HealthKit
 * equivalent (e.g. Orthostatic) return no source (the caller goes straight to the
 * manual form).
 *
 * BP + Resting HR reuse `readImports` (already timestamped + provenance-aware).
 * Activities follow the same model via `workoutCandidates` — the day's
 * workouts, mapped to app activity types with HR stats, for the add-activity
 * import card.
 */
import { fmtTime12 } from '../dates';
import { ACTIVITY_TYPES, entryFields } from '../registry';
import { health, type ImportedWorkout } from './index';

/** One importable Apple Health reading, shaped for the picker + prefill. */
export interface HealthCandidate {
  key: string;                                 // stable id (uuid / type+time+value)
  time: string;                                // HH:MM local
  label: string;                               // primary line, e.g. "128/82"
  sub: string;                                 // secondary, e.g. "6:32 AM"
  entry: Record<string, string | boolean>;     // prefilled reading fields
}
export interface HealthSource {
  fetch(dk: string): Promise<HealthCandidate[]>;
}

/** Which reading types can be imported from Apple Health (null → manual only). */
export function healthSourceFor(type: string): HealthSource | null {
  if (type === 'restingHr' || type === 'bp') return { fetch: (dk) => sampleCandidates(type, dk) };
  return null;
}

/** One importable workout, shaped for the activity import card + prefill. */
export interface WorkoutCandidate {
  key: string;                                 // stable id (type+startMs)
  type: string;                                // ACTIVITY_TYPES key
  time: string;                                // HH:MM local start
  label: string;                               // "Walk · 32 min · 2.1 mi"
  sub: string;                                 // "10:14 AM · Avg HR 128 · Apple Watch"
  entry: Record<string, string>;               // prefilled activity fields
  /** Full HR trace over the workout, destined for the waveform sidecar. */
  hrSeries: { t: number; bpm: number }[] | null;
}

/** Prefill fields for a workout, filtered to what the target type's form
 *  actually shows (an off-schema key would persist invisibly on the entry).
 *  Indoor bike's bespoke form has no field schema; it takes the full set. */
function workoutEntry(w: ImportedWorkout): Record<string, string> {
  const all: Record<string, string | undefined> = {
    duration: String(w.durationMin),
    distance: w.distanceMi != null ? String(w.distanceMi) : undefined,
    avgHr: w.avgHr != null ? String(w.avgHr) : undefined,
    minHr: w.minHr != null ? String(w.minHr) : undefined,
    maxHr: w.maxHr != null ? String(w.maxHr) : undefined,
  };
  const keys = w.type === 'indoorBike'
    ? ['duration', 'distance', 'avgHr', 'minHr', 'maxHr']
    : entryFields(ACTIVITY_TYPES[w.type]).map((f) => f.key).filter((k): k is string => !!k);
  const entry: Record<string, string> = {};
  for (const k of keys) { const v = all[k]; if (v !== undefined) entry[k] = v; }
  return entry;
}

/** The day's importable workouts: this app's own sessions and workouts already
 *  logged (same type + start time) drop out. `logged` is the day's activities. */
export async function workoutCandidates(dk: string, logged: { type?: unknown; time?: unknown }[]): Promise<WorkoutCandidate[]> {
  const api = health();
  if (!api.available) return [];
  // Workouts joined the read set after the first Health builds — re-requesting
  // prompts existing users once for the new type and is silent once granted.
  await api.requestAuth();
  const workouts = await api.readWorkouts(dk);
  return workouts
    .filter((w) => !w.ownApp && !logged.some((e) => e.type === w.type && e.time === w.time))
    .map((w) => {
      const def = ACTIVITY_TYPES[w.type];
      const label = [def.label, `${w.durationMin} min`, w.distanceMi != null ? `${w.distanceMi} mi` : null]
        .filter(Boolean).join(' · ');
      const sub = [fmtTime12(w.time), w.avgHr != null ? `Avg HR ${w.avgHr}` : null, w.sourceName]
        .filter(Boolean).join(' · ');
      return { key: `${w.type}-${w.startMs}`, type: w.type, time: w.time, label, sub, entry: workoutEntry(w), hrSeries: w.hrSeries };
    });
}

/** Resting HR / BP candidates for a day, from the timestamped import stream. */
async function sampleCandidates(type: 'restingHr' | 'bp', dk: string): Promise<HealthCandidate[]> {
  const api = health();
  if (!api.available) return [];
  const imports = await api.readImports(dk);
  return imports
    .filter((im) => im.type === type && !im.ownApp)   // skip our own write-backs
    .map((im) => {
      const label = type === 'bp' ? `${im.fields.sys}/${im.fields.dia}` : `${im.fields.hr} bpm`;
      const entry: Record<string, string> = type === 'bp'
        ? { sys: im.fields.sys, dia: im.fields.dia }
        : { hr: im.fields.hr, position: im.fields.position || 'Laying' };
      return { key: `${im.type}-${im.startMs}-${label}`, time: im.time, label, sub: fmtTime12(im.time), entry };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}
