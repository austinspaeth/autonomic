/**
 * Pure mapping of an ImportedWorkout to a picker row + entry prefill — kept
 * free of runtime health/store imports so the update-check dedup logic (and
 * jest) can use it. Consumers usually reach it through ./sources.
 */
import { fmtTime12 } from '../dates';
import { ACTIVITY_TYPES, entryFields } from '../registry';
import type { ImportedWorkout } from './index';

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

/** Shape one imported workout for a picker row + prefill (shared between the
 *  add-activity import card and the periodic health-updates check). */
export function workoutCandidateOf(w: ImportedWorkout): WorkoutCandidate {
  const def = ACTIVITY_TYPES[w.type];
  const label = [def.label, `${w.durationMin} min`, w.distanceMi != null ? `${w.distanceMi} mi` : null]
    .filter(Boolean).join(' · ');
  const sub = [fmtTime12(w.time), w.avgHr != null ? `Avg HR ${w.avgHr}` : null, w.sourceName]
    .filter(Boolean).join(' · ');
  return { key: `${w.type}-${w.startMs}`, type: w.type, time: w.time, label, sub, entry: workoutEntry(w), hrSeries: w.hrSeries };
}
