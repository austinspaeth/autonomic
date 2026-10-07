/* Which view the app is showing. A tiny external store, because the picker
   lives in the bottom bar and the content lives in the screen, and neither
   owns the other. */
import { useSyncExternalStore } from 'react';

export type ViewKey = 'glance' | 'usage' | 'sales' | 'forecast' | 'errors' | 'pings' | 'links' | 'account';

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'usage', label: 'App usage' },
  { key: 'glance', label: 'App Performance' },
  { key: 'sales', label: 'Sales' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'errors', label: 'Crashes & Errors' },
  { key: 'pings', label: 'Raw pings' },
  { key: 'links', label: 'Links' },
  { key: 'account', label: 'Account' },
];

/* App usage is the home view: it is what gets opened to most often. */
let current: ViewKey = 'usage';
const listeners = new Set<() => void>();

export function setView(key: ViewKey) {
  if (current === key) return;
  current = key;
  listeners.forEach((fn) => fn());
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
