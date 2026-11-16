/**
 * DEV BUILDS ONLY: `autonomic://?demo=load` replaces the journal with the
 * 60-day sample (`demoState`, src/lib/demo.ts) written in as the user's OWN
 * data, and marks the welcome wizard done, so a simulator can be looked at
 * with a full journal behind every screen.
 *
 * It REPLACES the journal on the device it is opened on, exactly as an import
 * would. Nothing is rendered and nothing is listened for in a release build:
 * the root layout mounts this only under `__DEV__`, and the handler checks
 * again.
 */
import { useEffect } from 'react';
import * as ExpoLinking from 'expo-linking';
import { demoState } from '../lib/demo';
import { getState, replaceState } from '../store/store';

function handle(url: string | null): void {
  if (!__DEV__ || !url) return;
  if (ExpoLinking.parse(url).queryParams?.demo !== 'load') return;
  const now = new Date().toISOString();
  const next = demoState(getState());
  replaceState({ ...next, meta: { ...next.meta, onboarded: next.meta.onboarded || now } }, 'demo');
}

export function DevDemoLink(): null {
  useEffect(() => {
    if (!__DEV__) return;
    void ExpoLinking.getInitialURL().then(handle);
    const sub = ExpoLinking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  return null;
}
