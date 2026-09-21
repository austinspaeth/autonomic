/**
 * The barometer's shell: reads the phone's pressure sensor and files a sample
 * into `state.pressure` (see ../lib/pressure for what is done with it).
 *
 * WHEN it reads: on launch, on every foreground, and on the pacing background
 * wake-up (store/pacingBackground, so only while that is registered), at most
 * once per `SAMPLE_EVERY_MS`. The sensor only speaks while the app is running,
 * and a handful of samples on the days the app is opened is all a daily median
 * needs; a day the app is never opened is an unknown day, which the analysis
 * already treats as unknown. The background read exists for the low-pressure
 * notification (lib/reminders `checkPressureAlert`), which is worth nothing if
 * it can only arrive once the app is already open.
 *
 * WHETHER it reads, which differs by platform because the permission does:
 *   · Android needs no permission for the pressure sensor, so recording is on
 *     unless the user switched it off (`settings.pressureEnabled === false`).
 *   · iOS reads the barometer through CoreMotion, which sits behind the Motion &
 *     Fitness permission. Subscribing with that undetermined RAISES the prompt, so
 *     nothing here subscribes without a grant in hand: the launch path only ever
 *     reads the status, and the prompt comes from a tap (`enablePressure`, the
 *     wizard's row and Settings). That is the Health rule, for the same reason.
 *
 * Only ever reads; the one write is the sample itself, through `save()`. A phone
 * with no barometer (plenty of budget Androids, every simulator) answers
 * unavailable and every surface that offers this hides itself.
 */
import { AppState as RNAppState, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { getState, save } from './store';
import { addPressureSample, isPlausibleHpa } from '../lib/pressure';
import { keyOf } from '../lib/dates';
import { logError } from '../lib/diagnostics/errorLog';

type SensorsModule = typeof import('expo-sensors');

/**
 * Optional native module: a JS bundle running on a binary built before it was
 * added (an OTA onto an older build) has no ExpoBarometer, and must degrade to
 * "no barometer" rather than crash on import.
 *
 * `Barometer` is the ONLY thing this app takes from expo-sensors, and it needs
 * no Android permission. The library's own manifest nonetheless declares
 * `ACTIVITY_RECOGNITION` unconditionally, for the `Pedometer` API nothing here
 * calls — Android steps come from Health Connect's READ_STEPS, which is a
 * separate namespace and does not require it. Play asks for a written
 * justification for every manifest permission, so that one is listed in
 * `android.blockedPermissions` (app.json) and prebuild strips it with
 * `tools:node="remove"`. **Do not reach for `Pedometer` here without unblocking
 * it**: the call would compile, ship and then be denied at runtime on any
 * device, since the permission would no longer be in the manifest to grant.
 */
let sensors: SensorsModule | null | undefined;
function mod(): SensorsModule | null {
  if (sensors !== undefined) return sensors;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sensors = require('expo-sensors') as SensorsModule;
  } catch { sensors = null; }
  return sensors;
}

const SAMPLE_EVERY_MS = 30 * 60_000;
/** How long one read listens. The first event can arrive a beat late on iOS. */
const LISTEN_MS = 2500;

let lastSampleAt = 0;
let sampling = false;
let available: boolean | null = null;

/** Does this phone have a barometer at all? Cached after the first answer. */
export async function pressureAvailable(): Promise<boolean> {
  if (available != null) return available;
  const m = mod();
  if (!m) return (available = false);
  try { available = await m.Barometer.isAvailableAsync(); } catch { available = false; }
  return available;
}

export type PressurePermission = 'granted' | 'denied' | 'undetermined';

/** The Motion & Fitness status on iOS (a status READ, never a request). Android
 *  has nothing to ask. */
export async function pressurePermission(): Promise<PressurePermission> {
  if (Platform.OS !== 'ios') return 'granted';
  const m = mod();
  if (!m) return 'denied';
  try {
    const r = await m.DeviceMotion.getPermissionsAsync();
    return r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied';
  } catch { return 'undetermined'; }
}

/** Is recording switched on, as far as the user's own choice goes? */
export function pressureChosen(): boolean {
  const v = getState().settings.pressureEnabled;
  return v === undefined ? Platform.OS !== 'ios' : v;
}

/** Listen briefly and return the median reading, or null. */
function readOnce(m: SensorsModule): Promise<number | null> {
  return new Promise((resolve) => {
    const seen: number[] = [];
    let sub: { remove: () => void } | null = null;
    const done = () => {
      try { sub?.remove(); } catch { /* already gone */ }
      if (!seen.length) { resolve(null); return; }
      seen.sort((a, b) => a - b);
      resolve(seen[seen.length >> 1]);
    };
    try {
      sub = m.Barometer.addListener(({ pressure }) => { if (isPlausibleHpa(pressure)) seen.push(pressure); });
    } catch (e) { logError('pressure.listen', e); resolve(null); return; }
    setTimeout(done, LISTEN_MS);
  });
}

/**
 * Take one sample now, if everything allows it. `force` skips the half-hour
 * pacing (turning the feature on should show a first reading straight away).
 */
export async function samplePressure(force = false): Promise<void> {
  if (sampling || (!force && Date.now() - lastSampleAt < SAMPLE_EVERY_MS)) return;
  if (!pressureChosen()) return;
  const m = mod();
  if (!m || !(await pressureAvailable())) return;
  // On iOS a subscription with the permission undetermined raises the prompt,
  // which a launch or a foreground must never do.
  if ((await pressurePermission()) !== 'granted') return;
  sampling = true;
  try {
    const hpa = await readOnce(m);
    if (hpa == null) return;
    lastSampleAt = Date.now();
    const now = new Date();
    const s = getState();
    s.pressure = addPressureSample(s.pressure, keyOf(now), now.getHours(), hpa);
    save();
    // A new sample is what can turn today low. Lazy: reminders pulls in the
    // scoring engines, which this sampler has no other reason to load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void (require('../lib/reminders') as typeof import('../lib/reminders')).checkPressureAlert();
  } finally {
    sampling = false;
  }
}

/**
 * Turn recording on from a tap: ask iOS for Motion & Fitness if it has not been
 * asked, and only persist ON once the answer is yes. Returns whether it is on.
 */
export async function enablePressure(): Promise<boolean> {
  const m = mod();
  if (!m || !(await pressureAvailable())) return false;
  if (Platform.OS === 'ios') {
    try {
      const r = await m.DeviceMotion.requestPermissionsAsync();
      if (!r.granted) return false;
    } catch (e) { logError('pressure.permission', e); return false; }
  }
  getState().settings.pressureEnabled = true;
  save();
  void samplePressure(true);
  return true;
}

export function disablePressure(): void {
  getState().settings.pressureEnabled = false;
  save();
}

/** Launch + foreground sampling. Call once from the root layout. */
export function initPressureWatch(): void {
  void samplePressure().catch((e) => logError('pressure.sample', e));
  RNAppState.addEventListener('change', (s) => {
    if (s === 'active') void samplePressure().catch((e) => logError('pressure.sample', e));
  });
}

/**
 * The UI's view: whether the phone has a barometer, and whether recording is
 * actually happening (chosen AND permitted). Re-reads the permission on each
 * render trigger, since it can change in system settings behind our back.
 */
export function usePressureStatus(): { available: boolean | null; on: boolean } {
  const chosen = getState().settings.pressureEnabled;
  const [s, setS] = useState<{ available: boolean | null; on: boolean }>({ available: available, on: false });
  useEffect(() => {
    let live = true;
    (async () => {
      const a = await pressureAvailable();
      const on = a && pressureChosen() && (await pressurePermission()) === 'granted';
      if (live) setS({ available: a, on });
    })();
    return () => { live = false; };
  }, [chosen]);
  return s;
}
