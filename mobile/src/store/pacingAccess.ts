/**
 * May this install see the pacing budget? The one question the rest of the app
 * asks; nothing outside this module should compose it from the tier itself.
 *
 * The answer is simply "not on the free tier": pacing comes with Pro and with
 * the 14-day install trial, and with nothing else. It used to carry a seven-day
 * window of its own for free installs, which for a new install meant pacing
 * outlived the rest of the trial by a week and then vanished on its own — two
 * separate losses, the second one reading as a fault. That window is gone; its
 * old `pacingTrialStartedAt` flag may still sit in the flags MMKV and is read
 * by nothing.
 */
import { getTier, useTier } from './tier';

/** Read at TAP TIME by the gate in features/budget/open.tsx, so an upgrade
 *  takes effect without leaving the Journal. */
export function isPacingUnlocked(): boolean {
  return getTier() !== 'free';
}

/** The React half of `isPacingUnlocked` — re-renders on a tier change, so the
 *  strip locks itself the moment the install trial lapses. */
export function usePacingUnlocked(): boolean {
  return useTier() !== 'free';
}
