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
  if (current === key) return;
  current = key;
  listeners.forEach((fn) => fn());
}

/* Wide only. The board holds the views that are read all day; these four are
   visited, so each opens as a side panel over the board, from a link in the
   top bar. Which one is open lives here because the links are in the bar and
   the panel is in the screen. */
export const PANELS: ViewKey[] = ['forecast', 'links', 'codes', 'pings'];
export const BOARD: ViewKey[] = ['usage', 'glance', 'sales', 'errors'];
/* The board's columns of sections: each group starts a column of its own and
   its views run on from one another. Crashes and errors is short, so it rides
   under sales rather than holding a column nearly empty. */
export const BOARD_GROUPS: ViewKey[][] = [['usage'], ['glance'], ['sales', 'errors']];
let panel: ViewKey | null = null;
export function openPanel(key: ViewKey | null) {
  if (panel === key) return;
  panel = key;
  listeners.forEach((fn) => fn());
}
export function usePanel(): ViewKey | null {
  return useSyncExternalStore(subscribe, () => panel);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useView(): ViewKey {
  return useSyncExternalStore(subscribe, () => current);
}
