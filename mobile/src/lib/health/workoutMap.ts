/**
 * Platform workout-type → app activity-type mapping, shared by the HealthKit
 * and Health Connect implementations of `readWorkouts`. Pure (no native
 * imports) so the tables are unit-testable.
 *
 * The registry's ACTIVITY_TYPES were designed around the Apple Workout app's
 * defaults, so most types map 1:1. Anything without a sensible home lands on
 * `otherExercise` — the catch-all — rather than being dropped, so every
 * workout the user recorded is importable.
 */

/** HKWorkoutActivityType (numeric enum) → ACTIVITY_TYPES key. Cycling is
 *  handled separately (indoor flag splits it across two app types). */
const HK_ACTIVITY: Record<number, string> = {
  8: 'kickboxing',    // boxing
  11: 'hiit',         // crossTraining (mixed cardio/strength)
  14: 'dance',
  15: 'dance',        // danceInspiredTraining (legacy)
  16: 'elliptical',
  20: 'strength',     // functionalStrengthTraining
  24: 'hike',
  28: 'kickboxing',   // martialArts
  29: 'breathwork',   // mindAndBody (qigong, meditation)
  30: 'hiit',         // mixedMetabolicCardioTraining (legacy)
  33: 'yoga',         // preparationAndRecovery (foam rolling, stretching)
  35: 'rower',
  37: 'run',
  44: 'stairStepper', // stairClimbing
  46: 'swim',
  50: 'strength',     // traditionalStrengthTraining
  52: 'walk',
  53: 'swim',         // waterFitness
  57: 'yoga',
  58: 'pilates',      // barre
  59: 'coreWorkout',
  62: 'yoga',         // flexibility
  63: 'hiit',
  65: 'kickboxing',
  66: 'pilates',
  68: 'stairStepper', // stairs
  69: 'stairStepper', // stepTraining
  72: 'taiChi',
  73: 'hiit',         // mixedCardio
  77: 'dance',        // cardioDance
  78: 'dance',        // socialDance
  80: 'cooldown',
};
const HK_CYCLING = 13;

/** Health Connect ExerciseType → ACTIVITY_TYPES key. HC has no indoor flag on
 *  sessions; stationary biking is its own constant instead. */
const HC_ACTIVITY: Record<number, string> = {
  8: 'cycle',         // BIKING
  9: 'indoorBike',    // BIKING_STATIONARY
  10: 'hiit',         // BOOT_CAMP
  11: 'kickboxing',   // BOXING
  13: 'strength',     // CALISTHENICS
  16: 'dance',        // DANCING
  25: 'elliptical',
  33: 'breathwork',   // GUIDED_BREATHING
  36: 'hiit',
  37: 'hike',
  41: 'hiit',         // JUMP_ROPE
  44: 'kickboxing',   // MARTIAL_ARTS
  48: 'pilates',
  53: 'rower',        // ROWING
  54: 'rower',        // ROWING_MACHINE
  56: 'run',
  57: 'run',          // RUNNING_TREADMILL
  68: 'stairStepper', // STAIR_CLIMBING
  69: 'stairStepper', // STAIR_CLIMBING_MACHINE
  70: 'strength',     // STRENGTH_TRAINING
  71: 'yoga',         // STRETCHING
  73: 'swim',         // SWIMMING_OPEN_WATER
  74: 'swim',         // SWIMMING_POOL
  79: 'walk',
  81: 'strength',     // WEIGHTLIFTING
  83: 'yoga',
};

/**
 * The workout's HR trace for the waveform sidecar: raw timestamped samples →
 * `{ t, bpm }` seconds-from-start, sorted, sanity-filtered, and decimated to
 * at most `cap` points (a long ride at one sample per ~5 s can run to
 * thousands; the report chart strides to ~300 anyway). Returns null when the
 * trace is too short to chart.
 */
export function workoutHrSeries(
  points: { ms: number; bpm: number }[],
  startMs: number,
  cap = 900,
): { t: number; bpm: number }[] | null {
  const clean = points
    .filter((s) => Number.isFinite(s.ms) && Number.isFinite(s.bpm) && s.bpm >= 25 && s.bpm <= 250)
    .sort((a, b) => a.ms - b.ms)
    .map((s) => ({ t: Math.max(0, Math.round((s.ms - startMs) / 1000)), bpm: Math.round(s.bpm) }));
  if (clean.length < 10) return null;
  const stride = Math.max(1, Math.ceil(clean.length / cap));
  return clean.filter((_, i) => i % stride === 0 || i === clean.length - 1);
}

/** App activity type for a HealthKit workout. */
export function activityTypeFromHk(hkType: number, indoor: boolean): string {
  if (hkType === HK_CYCLING) return indoor ? 'indoorBike' : 'cycle';
  return HK_ACTIVITY[hkType] || 'otherExercise';
}

/** App activity type for a Health Connect exercise session. */
export function activityTypeFromHc(exerciseType: number): string {
  return HC_ACTIVITY[exerciseType] || 'otherExercise';
}
