/* Which view the app is showing. A tiny external store, because the picker
   lives in the bottom bar and the content lives in the screen, and neither
   owns the other. */
import { useSyncExternalStore } from 'react';

export type ViewKey = 'glance' | 'usage' | 'sales' | 'forecast' | 'errors' | 'pings' | 'links' | 'codes';

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'usage', label: 'App usage' },
  { key: 'glance', label: 'App Performance' },
  { key: 'sales', label: 'Sales & Revenue' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'errors', label: 'Crashes & Errors' },
  { key: 'pings', label: 'Raw pings' },
  { key: 'links', label: 'Links' },
  { key: 'codes', label: 'Access codes' },
];

/* App usage is the home view: it is what gets opened to most often. */
let current: ViewKey = 'usage';
const listeners = new Set<() => void>();

export function setView(key: ViewKey) {
  /* Always announced, even for the view already chosen: on the wide board,
     where every view is on one page, picking one SCROLLS to it, and picking
     the same one again after scrolling away has to work. */
  current = key;
  picks += 1;
  listeners.forEach((fn) => fn());
}

/** Counts every pick, so a repeat of the same view still reads as a change. */
let picks = 0;
export function usePicks(): number {
  return useSyncExternalStore(subscribe, () => picks);
}

/* Where each view's section starts on the wide board, measured as it lays
   out: `board` is the board's own top inside the scroll content, the rest are
   offsets within it. */
const tops: Partial<Record<ViewKey | 'board', number>> = {};
export const noteTop = (key: ViewKey | 'board', y: number) => {
  tops[key] = y;
};
export const topOf = (key: ViewKey): number | null => (tops[key] === undefined ? null : (tops.board ?? 0) + tops[key]!);

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useView(): ViewKey {
  return useSyncExternalStore(subscribe, () => current);
}
