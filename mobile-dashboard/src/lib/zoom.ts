/* How large the wide board is drawn. The board is the one part of a wide
   screen whose density is a matter of taste and of the window it is in: zoomed
   out, a whole day fits a laptop without scrolling; zoomed in, it reads from
   across a desk. The top bar and the filter bar are controls and stay put.
   Remembered across launches. An external store because the buttons are in
   the top bar and the board is in the screen. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'master.boardZoom.v1';
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;
const STEP = 0.1;

let zoom = 1;
const listeners = new Set<() => void>();
const clamp = (z: number) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 10) / 10;

AsyncStorage.getItem(KEY)
  .then((raw) => {
    const z = Number(raw);
    if (!raw || !isFinite(z) || clamp(z) === zoom) return;
    zoom = clamp(z);
    listeners.forEach((fn) => fn());
  })
  .catch(() => {});

/** One step in (+1) or out (-1). */
export function stepZoom(dir: 1 | -1) {
  const next = clamp(zoom + dir * STEP);
  if (next === zoom) return;
  zoom = next;
  AsyncStorage.setItem(KEY, String(zoom)).catch(() => {});
  listeners.forEach((fn) => fn());
}

export function useZoom(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => zoom,
  );
}
