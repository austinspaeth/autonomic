import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The JS face of `modules/background-launch` (iOS only). The native half
 * starts React Native on a launch that never gets a scene — see
 * `ios/BackgroundLaunch.swift` for why that is needed at all.
 *
 * Absent on Android, on web and on any binary that predates the module, where
 * every call here answers "nothing".
 */
type Native = {
  takeSceneLaunchURL(): string | null;
  status(): { startedHost: boolean; outcome: string };
};

const native = requireOptionalNativeModule<Native>('BackgroundLaunch');

/**
 * The link that opened the app, when the ordinary route cannot deliver it.
 *
 * A process iOS launched in the background has a React host with no launch
 * URL. If the user then opens the app from a link (a widget tap), that scene's
 * URL is in neither `Linking.getInitialURL()` nor a `url` event anybody was
 * mounted to hear. The native side keeps it; this hands it over ONCE. Null on
 * every ordinary launch.
 */
export function sceneLaunchURL(): string | null {
  // Taken from native once and remembered: more than one consumer asks (the
  // widget deep links and the Garmin device-select callback), each with its
  // own handled-once latch, and the native side forgets it on the first read.
  // Only ever call this from a MOUNTED component or something a mounted
  // component started — the first call tells native that `url` events now
  // have a listener.
  if (taken === undefined) {
    try { taken = native?.takeSceneLaunchURL() ?? null; } catch { taken = null; }
  }
  return taken;
}
let taken: string | null | undefined;

/** How this launch started React Native, for the support dump. */
export function backgroundLaunchStatus(): string {
  if (!native) return 'module absent';
  try { return native.status().outcome; } catch { return 'unreadable'; }
}
