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
import { health } from './index';
import { workoutCandidateOf, type WorkoutCandidate } from './workoutCandidate';

// The candidate shape + mapper live in ./workoutCandidate (pure module, shared
// with the periodic update check); existing consumers keep importing them here.
export { workoutCandidateOf, type WorkoutCandidate } from './workoutCandidate';

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

/** The day's workouts, plus whether an empty result might be a denied read. */
export interface WorkoutImport {
  workouts: WorkoutCandidate[];
  /**
   * True when we cannot prove we're allowed to read workouts, so an empty list
   * may mean "denied" rather than "rest day". Always true on iOS (HealthKit
   * never reports read grants); on Android only when the grant is really
   * missing. Drives the permission hint in the empty state.
   */
  mayBeDenied: boolean;
}

/** The day's importable workouts: this app's own sessions and workouts already
 *  logged (same type + start time) drop out. `logged` is the day's activities. */
export async function workoutCandidates(dk: string, logged: { type?: unknown; time?: unknown }[]): Promise<WorkoutImport> {
  const api = health();
  if (!api.available) return { workouts: [], mayBeDenied: false };
  // Workouts joined the read set after the first Health builds — re-requesting
  // prompts existing users once for the new type and is silent once granted.
  await api.requestAuth();
  const [raw, status] = await Promise.all([api.readWorkouts(dk), api.readAuthStatus('workouts')]);
  const workouts = raw
    .filter((w) => !w.ownApp && !logged.some((e) => e.type === w.type && e.time === w.time))
    .map(workoutCandidateOf);
  return { workouts, mayBeDenied: status !== 'granted' };
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
