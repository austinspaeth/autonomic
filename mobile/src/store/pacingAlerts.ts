/**
 * Pacing alerts' shell: builds today's budget, asks src/lib/budget/alerts
 * whether it is worth a notification, and sends it.
 *
 * Everything that decides lives in the pure module. This file only gathers
 * the inputs (the same builds the Journal strip and the widgets run), stamps
 * the memory and posts the notification, so the foreground watcher and the
 * background task (./pacingBackground) cannot disagree about what to say.
 *
 * Also the setters behind the Notifications sheet's pacing rows and the pacing
 * sheet's "Turn on notifications" card.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDays, todayKey } from '../lib/dates';
import { logError } from '../lib/diagnostics/errorLog';
import { buildBudget } from '../lib/budget';
import { wakeMinutes } from '../lib/budget/envelope';
import { alertsEnabled, decidePacingAlert, loggedWindows, type PacingAlertKind } from '../lib/budget/alerts';
import { noteAlertFired, readAlertMemory } from '../lib/budget/alertMemory';
import { health } from '../lib/health';
import { canAskForReminders, requestReminderPermission } from '../lib/reminders';
import { resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { loadWaveformId } from '../lib/waveforms';
import { isPacingUnlocked } from './pacingTrial';
import { pingNotifyEnabled } from './ping';
import { getState, getWaveform, save, subscribeStore } from './store';

const CHANNEL = 'pacing-alerts';

/** A "slow down" alert should break through the way a crash warning does. */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Pacing alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

let inFlight: Promise<void> | null = null;

/**
 * Evaluate today's budget and post the one alert worth posting, if any.
 *
 * Coalesced: the store watcher, the background task and a setter can all ask
 * at once, and two concurrent runs would both read an empty memory and both
 * send. Silent when pacing is locked, every kind is off, or notifications are
 * not permitted.
 */
export function checkPacingAlerts(now: Date = new Date()): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = run(now).finally(() => { inFlight = null; });
  return inFlight;
}

async function run(now: Date): Promise<void> {
  try {
    const s = getState();
    if (!isPacingUnlocked()) return;
    const enabled = alertsEnabled(s.settings);
    if (!Object.values(enabled).some(Boolean)) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;

    const dk = todayKey();
    const ctx = { sex: s.profile.sex, height: s.profile.height };
    const protocol = resolveProtocol(s.settings.protocol);
    const downturn = detectDownturn(s.days, dk, ctx, protocol, s.customTypes);
    const strain = downturn ? null : detectStrain(s.days, dk, ctx);
    // `brief`: an alert reads nothing from the accuracy strip or the ceiling
    // sentence, and this runs on every journal change.
    const view = buildBudget(s, dk, ctx, {
      now, addDays, downturn: !!downturn, strain: strain ? strain.severity : null, brief: true,
    });

    const memory = readAlertMemory();
    // Yesterday is only built when the morning-after nudge could still fire:
    // it is a whole second budget build, and past noon it answers nothing.
    const easyDone = memory?.dk === dk && (memory.fired.easy?.length ?? 0) > 0;
    let yesterday = null;
    if (enabled.easy && !easyDone && now.getHours() < 12) {
      const yk = addDays(dk, -1);
      const yDown = detectDownturn(s.days, yk, ctx, protocol, s.customTypes);
      const yStrain = yDown ? null : detectStrain(s.days, yk, ctx);
      yesterday = buildBudget(s, yk, ctx, {
        now: new Date(`${yk}T23:59:00`), addDays,
        downturn: !!yDown, strain: yStrain ? yStrain.severity : null, past: true, brief: true,
      });
    }

    const day = s.days[dk];
    const alert = decidePacingAlert({
      dk, now, view, yesterday,
      wakeMin: wakeMinutes(s.days, dk),
      hr: getWaveform(loadWaveformId(dk))?.sampledHr ?? null,
      lineBpm: day?.load?.lineBpm ?? null,
      activities: loggedWindows(day?.activities),
      enabled,
      memory,
      crashFiredToday: s.settings.crashAlert?.lastFired === dk,
    });
    if (!alert) return;

    noteAlertFired(dk, alert.kind, now.getTime());
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title: alert.title, body: alert.body, sound: 'default', data: { pacingAlert: alert.kind } },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch (e) {
    logError('pacing.alert', e);
  }
}

let watcherArmed = false;

/**
 * Re-check shortly after any journal change. The shell's own health reads land
 * as journal changes too (`refreshDayLoad` writes `days[dk].load`), so the
 * foreground tick that moves the strip is also what moves the alerts. Trailing
 * debounce, the crash watcher's shape; the memory lives outside the journal, so
 * a check never triggers another.
 */
export function initPacingAlertWatcher(): void {
  if (watcherArmed) return;
  watcherArmed = true;
  void checkPacingAlerts();
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; void checkPacingAlerts(); }, 2500);
  });
}

/**
 * Health Connect reads from the background need their own permission. Asked
 * only from a tap (turning an alert on), and only when the budget reads Health
 * at all. iOS has no such grant: HealthKit background delivery rides the
 * entitlement.
 */
async function requestBackgroundHealth(): Promise<void> {
  if (Platform.OS !== 'android' || !getState().settings?.healthEnabled) return;
  try {
    await health().requestBackgroundRead?.();
  } catch (e) {
    logError('pacing.bgHealth', e);
  }
}

/** Lazy: ./pacingBackground imports this module for `checkPacingAlerts`. */
function syncBackground(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void (require('./pacingBackground') as typeof import('./pacingBackground')).syncPacingBackground();
  } catch { /* the foreground watcher still runs */ }
}

/**
 * Turn one pacing alert on or off. Enabling asks for notification permission
 * first and persists nothing when it is refused, the `setCrashAlert` rule.
 */
export async function setPacingAlert(kind: PacingAlertKind, on: boolean): Promise<boolean> {
  if (on && !(await requestReminderPermission())) return false;
  const s = getState();
  s.settings.pacingAlerts = { ...(s.settings.pacingAlerts || {}), [kind]: on };
  save();
  if (on) {
    pingNotifyEnabled('pacing');
    await requestBackgroundHealth();
    void checkPacingAlerts();
  }
  syncBackground();
  return true;
}

/**
 * The master switch. Off silences all five without forgetting which were on;
 * on asks for permission first, like every other enable. Turning it on when
 * every kind had been switched off individually resets them, or the switch
 * would read on and deliver nothing.
 */
export async function setPacingAlertsEnabled(on: boolean): Promise<boolean> {
  if (on && !(await requestReminderPermission())) return false;
  const s = getState();
  s.settings.pacingAlertsEnabled = on;
  if (on) {
    const kinds = s.settings.pacingAlerts || {};
    const allOff = (['ahead', 'nearly', 'over', 'exertion', 'easy'] as const).every((k) => kinds[k] === false);
    if (allOff) s.settings.pacingAlerts = {};
  }
  save();
  if (on) {
    pingNotifyEnabled('pacing');
    await requestBackgroundHealth();
    void checkPacingAlerts();
  }
  syncBackground();
  return true;
}

export type PacingNotifyResult = 'granted' | 'blocked' | 'denied';

/**
 * The pacing sheet's card: ask for notifications, which (on a fresh grant)
 * turns every notification the user never chose for on, then arm the
 * background half. 'blocked' means the OS will not ask again and the caller
 * should open system settings.
 */
export async function enablePacingNotifications(): Promise<PacingNotifyResult> {
  try {
    if (!(await canAskForReminders())) return 'blocked';
    if (!(await requestReminderPermission())) return 'denied';
  } catch (e) {
    logError('pacing.permission', e);
    return 'denied';
  }
  pingNotifyEnabled('pacing');
  await requestBackgroundHealth();
  syncBackground();
  void checkPacingAlerts();
  return 'granted';
}
