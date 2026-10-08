/* Over-the-air updates. expo-updates already checks on a cold start
 * (checkAutomatically: ON_LOAD) and applies what it finds on the launch after
 * that, which is two cold starts for an app iOS keeps suspended for days. So
 * every foreground also asks, and an update that is there is applied at once:
 * the screen repaints from the cache, so the reload costs a blink.
 *
 * Nothing here runs in a dev build, where Metro is the bundle. */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

let checking = false;

async function applyIfAvailable() {
  if (__DEV__ || !Updates.isEnabled || checking) return;
  checking = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) await Updates.reloadAsync();
  } catch {
    // Offline, or no update published for this runtime: the next foreground asks again.
  } finally {
    checking = false;
  }
}

export function useOtaUpdates() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') applyIfAvailable();
    });
    return () => sub.remove();
  }, []);
}
