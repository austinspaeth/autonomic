/**
 * The pacing budget with the app closed.
 *
 * There is no way to keep a React Native app running all day, and this file
 * does not pretend otherwise. It borrows the two wake-ups each platform will
 * actually grant and spends each one on the same short job: read today's load,
 * decide an alert, push the widgets, write to disk, stop.
 *
 *   ANDROID: a WorkManager job (expo-background-task), every 15 minutes at
 *   best and later under Doze. Health Connect refuses reads from the background
 *   unless READ_HEALTH_DATA_IN_BACKGROUND is granted, which is asked for from
 *   the tap that turns an alert on (./pacingAlerts). Without it the job reads
 *   nothing and, because of `requireEvidence`, writes nothing.
 *
 *   iOS: HealthKit background delivery. An observer query on heart rate and
 *   steps wakes the app when new samples land (steps at most hourly, Apple's
 *   own cap; the watch's heart rate arrives in batches). The same
 *   expo-background-task job is registered too, but iOS schedules it at its own
 *   discretion (mostly overnight), so it is a backstop, not the mechanism.
 *   Health data is unreadable while the phone is locked, so a wake-up then
 *   reads empty: `requireEvidence` and `readLosesEvidence` in the shell make
 *   sure that can never write a quieter day than the one on record. In
 *   practice an alert lands shortly after the phone is next unlocked.
 *
 * `definePacingBackground` MUST run at bundle load (index.js): a WorkManager
 * job can start a headless JS runtime that never mounts the app, and
 * TaskManager only finds tasks defined in the global scope; an iOS background
 * delivery launch needs its observers registered before HealthKit hands over
 * the pending samples.
 *
 * THE TWO TASK MODULES ARE REQUIRED LAZILY AND MAY BE MISSING. Both throw at
 * import on a binary built before they were added (a simulator dev build, most
 * often), and this file is imported by the root layout, so a static import
 * took the whole app down with "Cannot find native module 'ExpoTaskManager'".
 * Without them the job simply is not registered; the foreground watcher and the
 * HealthKit observers still run.
 */
import { AppState as RNAppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { holdBackgroundTime } from '../../modules/app-env';
import { alertsEnabled } from '../lib/budget/alerts';
import { todayKey } from '../lib/dates';
import { logError } from '../lib/diagnostics/errorLog';
import { healthKitAsked } from '../lib/health';
import { syncNotificationPermission } from '../lib/reminders';
import { syncWidgetsNow } from '../lib/widgets';
import { refreshDayLoad } from './budget';
import { checkPacingAlerts } from './pacingAlerts';
import { isPacingUnlocked } from './pacingTrial';
import { flushSave, getState } from './store';

export const PACING_TASK = 'autonomic.pacing.refresh';

/** WorkManager's floor. Anything lower is silently raised to it. */
const TASK_INTERVAL_MIN = 15;

/** A wake-up this soon after a read reuses it. HealthKit can deliver heart
 *  rate every few minutes, and each wake-up is a read plus a budget build. */
const BG_STALE_MIN = 10;

/** HKUpdateFrequency: 1 immediate, 2 hourly. Steps are capped at hourly by
 *  Apple whatever is asked for; asking for it outright keeps the intent honest. */
const HK_TYPES = [
  { id: 'HKQuantityTypeIdentifierHeartRate', frequency: 1, scope: 'core' },
  { id: 'HKQuantityTypeIdentifierStepCount', frequency: 2, scope: 'steps' },
] as const;

interface TaskModules {
  tm: typeof import('expo-task-manager');
  bt: typeof import('expo-background-task');
}

let taskCache: TaskModules | null | undefined;

/** The job's two native modules, or null on a binary that does not carry them. */
function taskModules(): TaskModules | null {
  if (taskCache !== undefined) return taskCache;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    taskCache = {
      tm: require('expo-task-manager') as TaskModules['tm'],
      bt: require('expo-background-task') as TaskModules['bt'],
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    taskCache = null;
  }
  return taskCache;
}

interface HkBackground {
  subscribeToChanges?: (id: string, cb: () => void) => Promise<unknown>;
  enableBackgroundDelivery?: (id: string, frequency: number) => Promise<boolean>;
  disableBackgroundDelivery?: (id: string) => Promise<boolean>;
}

function healthKit(): HkBackground | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hk = require('@kingstinct/react-native-healthkit');
    return ((hk as { default?: unknown }).default ?? hk) as HkBackground;
  } catch {
    return null;
  }
}

/**
 * Is there any reason to wake up? The budget reads Health, pacing is unlocked,
 * and at least one alert is on. Permission is checked separately (it is async).
 */
export function pacingBackgroundWanted(): boolean {
  const s = getState();
  if (!s.settings?.healthEnabled) return false;
  if (!isPacingUnlocked()) return false;
  return Object.values(alertsEnabled(s.settings)).some(Boolean);
}

let running: Promise<void> | null = null;

/** One wake-up's worth of work. Coalesced, and always releases the time it holds. */
export function runPacingBackgroundCheck(): Promise<void> {
  if (running) return running;
  running = (async () => {
    // iOS gives a woken app a few seconds unless it asks for more; a health
    // read plus a budget build can take longer than that.
    const release = holdBackgroundTime('pacing-refresh');
    try {
      if (!pacingBackgroundWanted()) return;
      await refreshDayLoad(todayKey(), { maxAgeMin: BG_STALE_MIN, requireEvidence: true });
      await checkPacingAlerts();
      await syncWidgetsNow();
      // The debounce timer may never fire before the process is suspended.
      flushSave();
    } catch (e) {
      logError('pacing.background', e);
    } finally {
      release();
    }
  })().finally(() => { running = null; });
  return running;
}

function onHealthChange(): void {
  // An open app already re-reads on its own tick; this is for a closed one.
  if (RNAppState.currentState === 'active') return;
  void runPacingBackgroundCheck();
}

const observing = new Set<string>();

/**
 * Register an observer per type, but only for a type HealthKit has already
 * been ASKED about (`healthKitAsked`). On a not-determined type HealthKit errors
 * the observer after the library has resolved the subscribe call, and the
 * library then rejects that settled promise — a native "Tried to reject a
 * promise after it's already been resolved" error, which no catch here can
 * reach. Steps are asked only from the pacing Connect tap, so their observer
 * typically arrives later: per type, on the foreground sync after that tap.
 */
async function observeHealthKit(): Promise<void> {
  if (!getState().settings?.healthEnabled) return;
  const hk = healthKit();
  if (!hk?.subscribeToChanges) return;
  for (const t of HK_TYPES) {
    if (observing.has(t.id) || !healthKitAsked(t.scope)) continue;
    observing.add(t.id);
    try {
      await hk.subscribeToChanges(t.id, onHealthChange);
    } catch {
      observing.delete(t.id);
    }
  }
}

async function setHealthKitDelivery(on: boolean): Promise<void> {
  const hk = healthKit();
  if (!hk) return;
  for (const t of HK_TYPES) {
    try {
      if (on) await hk.enableBackgroundDelivery?.(t.id, t.frequency);
      else await hk.disableBackgroundDelivery?.(t.id);
    } catch { /* not authorised for this type */ }
  }
}

let defined = false;

/** Bundle-load hook, from index.js. Defines the task and, on iOS, starts observing. */
export function definePacingBackground(): void {
  if (defined) return;
  defined = true;
  const mods = taskModules();
  if (mods) {
    try {
      mods.tm.defineTask(PACING_TASK, async () => {
        try {
          await runPacingBackgroundCheck();
          return mods.bt.BackgroundTaskResult.Success;
        } catch {
          return mods.bt.BackgroundTaskResult.Failed;
        }
      });
    } catch (e) {
      logError('pacing.task', e);
    }
  }
  if (Platform.OS === 'ios' && pacingBackgroundWanted()) void observeHealthKit();
}

/**
 * Reconcile the OS registrations with what the user wants: register the job
 * and enable delivery when an alert could fire, undo both when none can.
 * Launch, foreground and every alert toggle call it; each step is idempotent.
 */
export async function syncPacingBackground(): Promise<void> {
  try {
    const granted = (await Notifications.getPermissionsAsync()).granted;
    const want = granted && pacingBackgroundWanted();
    const mods = taskModules();
    if (mods) {
      const registered = await mods.tm.isTaskRegisteredAsync(PACING_TASK);
      if (want && !registered && (await mods.bt.getStatusAsync()) === mods.bt.BackgroundTaskStatus.Available) {
        await mods.bt.registerTaskAsync(PACING_TASK, { minimumInterval: TASK_INTERVAL_MIN });
      } else if (!want && registered) {
        await mods.bt.unregisterTaskAsync(PACING_TASK);
      }
    }
    if (want) await observeHealthKit();
    await setHealthKitDelivery(want);
  } catch (e) {
    logError('pacing.background', e);
  }
}

let armed = false;

/**
 * Root-layout hook. On launch and every foreground: notice a permission that
 * changed in system settings (which is also what turns the defaults on when
 * somebody grants it there), then reconcile the registrations.
 */
export function initPacingBackground(): void {
  if (armed) return;
  armed = true;
  const sync = () => { void syncNotificationPermission().then(() => syncPacingBackground()); };
  sync();
  RNAppState.addEventListener('change', (st) => { if (st === 'active') sync(); });
}
