/**
 * Whether the app is wearing its seasonal touches right now.
 *
 * Asked of TODAY, never of the day the Journal is showing: scrolling back to
 * last Tuesday must not change what the app looks like. Re-asked on every
 * foreground, so a phone that slept through Saturday midnight wakes up plain.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { todayKey } from '../lib/dates';
import { isHalloweenWeek, isThanksgivingWeek } from '../lib/seasonal';

const halloweenSnapshot = () => isHalloweenWeek(todayKey());
const thanksgivingSnapshot = () => isThanksgivingWeek(todayKey());

function subscribe(fn: () => void) {
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') fn(); });
  return () => sub.remove();
}

export const useHalloween = (): boolean => useSyncExternalStore(subscribe, halloweenSnapshot);
export const useThanksgiving = (): boolean => useSyncExternalStore(subscribe, thanksgivingSnapshot);
