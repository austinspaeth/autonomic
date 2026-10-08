/**
 * Freemium tier derivation — pure logic, unit-tested (see __tests__/tier).
 *
 * Three tiers: 'pro' (active store entitlement — paid, or a store-side trial
 * where one still exists), 'trial' (inside the local 14-day full-access window
 * stamped on first launch), and 'free' (everything else). The stateful side —
 * where the stamp persists, how changes propagate — lives in src/store/tier.ts;
 * this module is just the math so jest can pin the boundaries.
 */

export type Tier = 'pro' | 'trial' | 'free';

/** Length of the local full-access window that starts on first launch. */
export const TRIAL_DAYS = 14;
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

/**
 * Milliseconds left on an access-code grant (0 when there is none or it has
 * passed). A grant is an absolute end time: an access code extends the
 * full-access window to it, see `extendAccess`.
 */
export function grantMsLeft(nowMs: number, grantUntilMs: number | null | undefined): number {
  if (grantUntilMs == null || !Number.isFinite(grantUntilMs)) return 0;
  return Math.max(0, grantUntilMs - nowMs);
}

/** Milliseconds of full access left without a subscription: whichever of the
 *  install trial and an access-code grant runs longer. */
export function accessMsLeft(
  nowMs: number, trialStartedAtMs: number | null, grantUntilMs?: number | null,
): number {
  return Math.max(trialMsLeft(nowMs, trialStartedAtMs), grantMsLeft(nowMs, grantUntilMs));
}

/**
 * The new grant end after redeeming a code worth `days`. The days are added to
 * whatever access is still running, so a code entered on day 4 of the trial
 * does not swallow the ten days that were left, and a second code stacks on the
 * first. With nothing running they count from now.
 */
export function extendAccess(
  nowMs: number, trialStartedAtMs: number | null, grantUntilMs: number | null | undefined, days: number,
): number {
  return nowMs + accessMsLeft(nowMs, trialStartedAtMs, grantUntilMs) + Math.max(0, days) * 86_400_000;
}

/** The user's current tier. Entitlement always wins over the local clock. An
 *  access-code grant reads as 'trial': it IS the trial, extended. */
export function deriveTier(
  nowMs: number, trialStartedAtMs: number | null, isPro: boolean, grantUntilMs?: number | null,
): Tier {
  if (isPro) return 'pro';
  return accessMsLeft(nowMs, trialStartedAtMs, grantUntilMs) > 0 ? 'trial' : 'free';
}
