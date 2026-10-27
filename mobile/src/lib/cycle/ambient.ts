/**
 * The cycle model in force, AMBIENT the way the unit system is (../units).
 *
 * Phase-matched baselines have to reach the scoring engine, the strain
 * detector and the trend extractors, and those are called from some forty
 * places with a `ScoreContext` built from the PROFILE alone. Threading a model
 * through every one would leave the surfaces that were missed answering
 * differently from the ones that were not — the exact failure "three surfaces
 * cannot disagree" exists to prevent. So the store sets the model here on every
 * change (src/store/cycle.ts, from the store's `emit`) and the pure modules read
 * it, the same contract `getUnits()` has.
 *
 * Null is the default and means "no cycle-awareness": cycle tracking is off,
 * the mode claims nothing, or this is a test. Every consumer must behave
 * EXACTLY as it did before this feature existed when it reads null, which is
 * what keeps every existing test passing untouched.
 */
import type { CycleModel, CyclePhase, PhaseInfo } from './model';

let current: CycleModel | null = null;

export function setCycleModel(m: CycleModel | null): void { current = m; }
export function getCycleModel(): CycleModel | null { return current; }

/** The phase of `dk` under the model in force, or null. */
export function phaseFor(dk: string): PhaseInfo | null {
  return current ? current.phaseOn(dk) : null;
}

/** Phases that are compared with each other. Ovulatory days are too few to
 *  carry a baseline of their own and sit physiologically with the follicular
 *  side (estrogen high, progesterone not yet risen). */
export type PhaseGroup = 'menstrual' | 'follicular' | 'luteal' | 'premenstrual';
export const groupOf = (p: CyclePhase): PhaseGroup =>
  p === 'ovulatory' ? 'follicular' : p;

/**
 * Should comparisons for `dk` be made against the same phase of past cycles?
 * Only with a pattern to compare against (`patternReady`) and a known phase
 * for the day. Returns the group to match, or null for "compare as before".
 */
export function matchGroupFor(dk: string): PhaseGroup | null {
  if (!current || !current.patternReady) return null;
  const ph = current.phaseOn(dk);
  return ph?.phase ? groupOf(ph.phase) : null;
}

/** Is `dk` a past day in phase group `g` (forecast phases never count)? */
export function inGroup(dk: string, g: PhaseGroup): boolean {
  const ph = current?.phaseOn(dk);
  return !!ph?.phase && !ph.predicted && groupOf(ph.phase) === g;
}
