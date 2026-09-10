/**
 * The pacing budget's free week — pure logic, unit-tested
 * (see __tests__/pacingTrial).
 *
 * Pacing shipped as a Pro feature, which means the users it was built for meet
 * a lock card instead of the thing itself. A pacing budget is not a feature
 * anybody can judge from a description: it is a number in minutes that only
 * means something once you have watched it against a few of your own
 * afternoons. So a free install gets ONE window, seven days long, in which the
 * budget is simply on.
 *
 * It is deliberately NOT the 14-day install trial (src/lib/tier.ts). That one
 * grants the whole app and is stamped the first time the app ever runs, so an
 * install updating into the pacing release had already spent it months ago and
 * would never see pacing at all. This window is scoped to one feature and its
 * clock starts on the first launch at which the user is actually FREE — which
 * for an updating install is the launch that brings them this build, and for a
 * brand new one is the day their full trial lapses. Starting it at first launch
 * regardless would burn it underneath the install trial, where it grants
 * nothing.
 *
 * One window per install, ever: `startedAtMs` is stamped once and never
 * re-stamped, so a lapsed subscriber does not earn a fresh week each time they
 * cancel. The stateful side (where the stamp lives, how the expiry propagates)
 * is src/store/pacingTrial.ts; this module is just the math.
 */

/** How long the pacing budget stays unlocked for a free install. */
export const PACING_TRIAL_DAYS = 7;
export const PACING_TRIAL_MS = PACING_TRIAL_DAYS * 86_400_000;

/**
 * Milliseconds of pacing trial left (0 when lapsed or never stamped).
 *
 * A stamp in the FUTURE means the clock was rolled back after stamping. Clamp
 * it to now — the same defence `trialMsLeft` makes — so the window runs its
 * seven days from here rather than staying open forever.
 */
export function pacingTrialMsLeft(nowMs: number, startedAtMs: number | null): number {
  if (startedAtMs == null || !Number.isFinite(startedAtMs)) return 0;
  const started = Math.min(startedAtMs, nowMs);
  return Math.max(0, started + PACING_TRIAL_MS - nowMs);
}

/** Whole days left, rounded UP: a window with an hour to run reads "1 day
 *  left", never "0 days left" on a feature that still works. */
export function pacingTrialDaysLeft(nowMs: number, startedAtMs: number | null): number {
  return Math.ceil(pacingTrialMsLeft(nowMs, startedAtMs) / 86_400_000);
}

/** Is the window open right now? */
export function pacingTrialActive(nowMs: number, startedAtMs: number | null): boolean {
  return pacingTrialMsLeft(nowMs, startedAtMs) > 0;
}

/** Has this install's window been opened AND spent? The lock card says so, and
 *  "never had one" must not be confused with "had one and used it". */
export function pacingTrialSpent(nowMs: number, startedAtMs: number | null): boolean {
  return startedAtMs != null && Number.isFinite(startedAtMs)
    && pacingTrialMsLeft(nowMs, startedAtMs) === 0;
}
