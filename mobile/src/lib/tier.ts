/**
 * Freemium tier derivation — pure logic, unit-tested (see __tests__/tier).
 *
 * Three tiers: 'pro' (active store entitlement — paid, or a store-side trial
 * where one still exists), 'trial' (inside the local 7-day full-access window
 * stamped on first launch), and 'free' (everything else). The stateful side —
 * where the stamp persists, how changes propagate — lives in src/store/tier.ts;
 * this module is just the math so jest can pin the boundaries.
 */

export type Tier = 'pro' | 'trial' | 'free';

/** Length of the local full-access window that starts on first launch. */
export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * 86_400_000;

/**
 * Milliseconds of local trial remaining (0 when lapsed or never stamped).
 * A stamp in the future means the clock was rolled back after stamping —
 * treat it as "started just now" rather than punishing (or infinitely
 * extending) the user; the store layer re-stamps to `now` when it sees this.
 */
export function trialMsLeft(nowMs: number, trialStartedAtMs: number | null): number {
  if (trialStartedAtMs == null || !Number.isFinite(trialStartedAtMs)) return 0;
  const started = Math.min(trialStartedAtMs, nowMs);
  return Math.max(0, started + TRIAL_MS - nowMs);
}

/** The user's current tier. Entitlement always wins over the local clock. */
export function deriveTier(nowMs: number, trialStartedAtMs: number | null, isPro: boolean): Tier {
  if (isPro) return 'pro';
  return trialMsLeft(nowMs, trialStartedAtMs) > 0 ? 'trial' : 'free';
}
