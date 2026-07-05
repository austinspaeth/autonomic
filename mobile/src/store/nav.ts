/** Journal current-day state, shared across the header + Journal screen. */
import { useSyncExternalStore } from 'react';
import { addDays, todayKey } from '../lib/dates';

let current = todayKey();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

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
