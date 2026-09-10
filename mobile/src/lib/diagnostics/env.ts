/**
 * Shared collection side of a support dump: build/OS facts and error
 * description. Both diagnostics reports (Bluetooth, camera) print the same APP
 * and PLATFORM blocks, so a dump can be read the same way whichever one arrives.
 *
 * Imports `react-native`, so it belongs to the collectors, not the formatters —
 * the pure rendering helpers live in `format.ts` where jest can reach them.
 *
 * Everything here is defensive by design — a diagnostics collector that throws
 * while collecting is worse than one with gaps.
 */
import { Platform } from 'react-native';

/** Android API level. `Platform.Version` is already a number on Android, but it
 *  arrives as a string on some OEM builds — parse defensively and assume modern
 *  (31+) if it is unreadable, since that is the permission set nearly every live
 *  device wants and the legacy branch is the narrower guess. */
export function androidApiLevel(): number {
  const v = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  return Number.isFinite(v) ? v : 31;
}

/** Build/runtime facts. Everything is optional and guarded. */
export function appInfo(): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const C = require('expo-constants').default;
    out['app version'] = C?.expoConfig?.version ?? null;
    out['native version'] = C?.nativeAppVersion ?? null;
    out['native build'] = C?.nativeBuildVersion ?? null;
    out['environment'] = C?.executionEnvironment ?? null;
  } catch { /* ignore */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const U = require('expo-updates');
    out['runtime version'] = U?.runtimeVersion ?? null;
    out['update id'] = U?.updateId ?? null;
    out['update channel'] = U?.channel ?? null;
    out['embedded launch'] = U?.isEmbeddedLaunch ?? null;
  } catch { /* ignore */ }
  return out;
}

export function platformInfo(): Record<string, string | number | boolean | null> {
  const c = Platform.constants as unknown as Record<string, unknown> | undefined;
  const pick = (...keys: string[]) => {
    for (const k of keys) if (c?.[k] != null) return String(c[k]);
    return null;
  };
  return {
    os: Platform.OS,
    'os version': pick('Release', 'osVersion', 'systemVersion') ?? String(Platform.Version),
    'api level': Platform.OS === 'android' ? androidApiLevel() : null,
    manufacturer: pick('Manufacturer'),
    brand: pick('Brand'),
    model: pick('Model', 'model'),
    'dev build': __DEV__,
  };
}

/* `describeError` moved to ./format — it is pure, and this file imports
   `react-native`, which jest here cannot load. Re-exported so the call sites
   that reach for it beside `appInfo` and `platformInfo` keep working. */
export { describeError } from './format';
