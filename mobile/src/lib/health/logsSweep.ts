/**
 * How often the two "what you log in Health itself" reads may run.
 *
 * Pure; ./logsSweepMemory is the flags-MMKV shell.
 *
 * Why there is a rule at all. `readSymptoms` is one native category query per
 * mapped type — 23 of them in ./symptomMap — and `checkHealthUpdates` runs on
 * EVERY foreground. While symptoms were opt-in, an install that had not opted
 * in never ran those queries; now that they ride the Apple Health connect ask,
 * they would run for everyone who connected, including everyone who DENIED the
 * symptom types in that sheet. HealthKit never reports read grants, so "denied"
 * and "nothing logged there" are indistinguishable from here and the queries
 * would go on forever for both.
 *
 * The rule is a THROTTLE and nothing more, and it applies to those two reads
 * ONLY — never to the update check as a whole. That check is deliberately
 * unthrottled (see the pill in ../../features/HealthUpdates): opening the app
 * IS the request to bring it up to date, there is no background execution here
 * so a foreground is the only moment a check can happen, and the hourly pacing
 * it used to carry meant a reading taken minutes ago was invisible.
 *
 * Three ways through:
 *   - an hour has passed since the last sweep;
 *   - the day key changed (the first check of a new day always sweeps — the
 *     day the reads are ABOUT is new, whatever the clock says);
 *   - the user ASKED (Settings → "Check for updates", the Journal's
 *     pull-to-refresh). An explicit action always bypasses the throttle, for
 *     the same reason `checkHealthUpdatesLast24h` ignores the seen memory.
 *
 * Deliberately NOT here: a "stop after N empty sweeps" back-off. It would
 * silently retire the feature for somebody who logs symptoms in Health only
 * occasionally, which is most people who log them at all.
 */

/** Minimum gap between two automatic sweeps of the same day. */
export const LOGS_SWEEP_MIN_MS = 60 * 60 * 1000;

/** The last sweep: which day key it was about, and when it ran. */
export interface LogsSweepMemory {
  dk?: string;
  at?: number;
}

export const emptyLogsSweepMemory = (): LogsSweepMemory => ({});

/**
 * May the two logs reads run now?
 *
 * `explicit` is a user action and always wins. Otherwise: a different day key
 * than the last sweep, or `LOGS_SWEEP_MIN_MS` since it.
 */
export function logsSweepDue(
  mem: LogsSweepMemory | null | undefined,
  dk: string,
  nowMs: number,
  explicit = false,
): boolean {
  if (explicit) return true;
  const last = mem?.at;
  if (!mem?.dk || mem.dk !== dk) return true;
  if (!Number.isFinite(last)) return true;
  return nowMs - (last as number) >= LOGS_SWEEP_MIN_MS;
}

/**
 * Stamp a sweep that RAN. Only ever called after the reads actually went out,
 * so a skipped read can never push the next one an hour further away.
 */
export function noteLogsSweep(dk: string, nowMs: number): LogsSweepMemory {
  return { dk, at: nowMs };
}
