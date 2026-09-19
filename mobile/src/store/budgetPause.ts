/**
 * The live half of the pacing pause: which days are showing a number anyway.
 *
 * A module store in the `pillSlot` / `watchSyncStore` shape, because the
 * choice is made in one place (the strip's play button, or the sheet's own
 * action) and has to be read in three others — the Journal's three heroes all
 * render the same strip, and the sheet is a separate tree above them. A hook
 * per surface would give each its own copy and leave the sheet showing a
 * paused card over a Journal that had already revealed the number.
 *
 * `lib/budget/pause.ts` decides; `lib/budget/pauseMemory.ts` persists; this
 * only keeps the app in step with what is on disk.
 */
import { useSyncExternalStore } from 'react';
import {
  isUnpausedDay, notePausedDay, pausedDays, setUnpausedDay,
} from '../lib/budget/pauseMemory';
import { pingFeature } from './ping';

const subs = new Set<() => void>();
/** Bumped on every change, so a memoized consumer re-reads the lists. */
let version = 0;

function bump(): void {
  version++;
  subs.forEach((cb) => cb());
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

/** Re-renders whenever either list changes. The value itself is only a
 *  counter: the caller reads the lists, which are cheap and on disk. */
export function usePauseVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Everything `buildBudget` needs to decide whether a paused day publishes. */
export function pauseOpts(dk: string): { userUnpaused: boolean; pausedDays: string[] } {
  return { userUnpaused: isUnpausedDay(dk), pausedDays: pausedDays() };
}

/**
 * The reader asked to see it. Pinged once per day per install (`use` is
 * capped per letter), because if this is tapped on most paused days then the
 * pause rule is still wrong and that is worth knowing from the outside.
 */
export function showBudgetAnyway(dk: string): void {
  setUnpausedDay(dk, true);
  // Wrapped, and AFTER the write. A counter must never be able to cost the
  // reader the thing they tapped for: a throw here used to leave the day
  // recorded as revealed with nothing on screen having changed, which reads
  // as a dead button.
  try { pingFeature('unpause'); } catch { /* the reveal is what matters */ }
  bump();
}

/** And put it back. No ping: an undo is not a preference. */
export function hideBudgetAgain(dk: string): void {
  setUnpausedDay(dk, false);
  bump();
}

/**
 * Record that a paused budget was actually drawn today, for ./pause's run
 * valve. Called from the render path, so it must stay idempotent and must not
 * notify — a bump here would re-render the card that just recorded itself,
 * every time, for ever.
 */
export function notePausedShown(dk: string): void {
  notePausedDay(dk);
}
