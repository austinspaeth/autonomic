/* The forecast's assumptions, as the reader last left them. Only what was
 * moved BY HAND is kept (a lever nobody touched goes on following the measured
 * pace as the data changes), and it is kept on disk, so a refresh, a change of
 * view or a relaunch never puts a slider back. Clearing one, or all of them,
 * is the only way back to the current pace. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { Levers } from './forecast';

export type LeverOverrides = Partial<Levers>;

const KEY = 'master.forecast.levers.v1';
let current: LeverOverrides = {};
const listeners = new Set<() => void>();

const publish = (next: LeverOverrides, save = true) => {
  current = next;
  listeners.forEach((fn) => fn());
  if (save) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
};

AsyncStorage.getItem(KEY)
  .then((raw) => {
    const saved = raw ? JSON.parse(raw) : null;
    // Whatever was moved before the disk answered wins over what it held.
    if (saved && typeof saved === 'object') publish({ ...saved, ...current }, false);
  })
  .catch(() => {});

/** Hold one lever where it was put; `undefined` lets it follow the pace again. */
export function setLeverOverride<K extends keyof Levers>(key: K, value: Levers[K] | undefined) {
  const next = { ...current };
  if (value === undefined) delete next[key];
  else next[key] = value;
  publish(next);
}

export function clearLeverOverrides() {
  publish({});
}

export function useLeverOverrides(): LeverOverrides {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => current,
  );
}
