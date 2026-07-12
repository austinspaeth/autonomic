/** Journal current-day state, shared across the header + Journal screen. */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { addDays, todayKey } from '../lib/dates';

let today = todayKey();
let current = today;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Re-read the local calendar date. If midnight passed (or the device timezone
 *  shifted) while the app was open or suspended, a journal left on "today"
 *  advances to the new today; a deliberately back-dated view stays put. A view
 *  that would now sit in the future (timezone moved backward) clamps to today. */
export function refreshToday() {
  const t = todayKey();
  if (t === today) return;
  if (current === today || current > t) current = t;
  today = t;
  emit();
}

// iOS freezes JS timers while the app is suspended, so the timer alone can't be
// trusted: refresh on every return to foreground too, and re-arm the timer for
// the (possibly new) next local midnight.
let midnightTimer: ReturnType<typeof setTimeout> | undefined;
function armMidnightTimer() {
  if (midnightTimer) clearTimeout(midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(() => {
    refreshToday();
    armMidnightTimer();
  }, nextMidnight.getTime() - now.getTime() + 1000);
}
AppState.addEventListener('change', (s) => {
  if (s === 'active') {
    refreshToday();
    armMidnightTimer();
  }
});
armMidnightTimer();

export function setCurrentKey(k: string) {
  if (k > todayKey()) return; // never navigate into the future
  current = k;
  emit();
}
export function shiftCurrent(delta: number) { setCurrentKey(addDays(current, delta)); }
export function getCurrentKey() { return current; }

export function useCurrentKey(): string {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
    () => current,
  );
}
