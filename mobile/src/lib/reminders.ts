/**
 * Morning reminder — the app's only notification.
 *
 * A single repeating local notification (no push, no server, nothing leaves the
 * device) nudging the user to take their reading at the same time each morning,
 * which is what makes a baseline comparable day to day.
 *
 * The scheduled notification is derived state: `settings.reminder` in the
 * journal is the source of truth, and `syncReminder()` reconciles the OS
 * schedule to it on launch. That keeps the two from drifting after a reinstall,
 * a restore from an export, or the user revoking permission in system settings.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getState, save } from '../store/store';

/** Stable id so scheduling twice replaces rather than stacks. */
const ID = 'morning-reminder';
const CHANNEL = 'reminders';

/** 8:00 AM — late enough to be awake, early enough to be pre-coffee. */
export const DEFAULT_REMINDER_TIME = '08:00';

/** Foreground presentation: the reminder should show even with the app open. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const parse = (hhmm: string): { hour: number; minute: number } => {
  const [h, m] = (hhmm || DEFAULT_REMINDER_TIME).split(':').map(Number);
  return {
    hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8,
    minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
};

/** Android needs an explicit channel or the notification posts silently. */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Daily reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * Ask for notification permission, returning whether we ended up with it.
 * Only prompts when the OS hasn't already decided — a previous "don't allow"
 * can't be re-prompted, so that path resolves false and the caller should send
 * the user to system settings.
 */
export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

/** Whether the OS would let us prompt again (false = must go to Settings). */
export async function canAskForReminders(): Promise<boolean> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted || p.canAskAgain;
}

/** Replace any scheduled reminder with one firing daily at `hhmm`. */
export async function scheduleMorningReminder(hhmm: string): Promise<void> {
  const { hour, minute } = parse(hhmm);
  await ensureChannel();
  await cancelMorningReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: {
      title: 'Good morning',
      body: 'Take your morning reading while your body is still at rest.',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL,
    },
  });
}

export async function cancelMorningReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
}

/**
 * Turn the reminder on at `hhmm`, persisting it. Returns false (and persists
 * nothing) when the reminder could not actually be armed, so the caller's
 * checkbox stays off rather than promising a notification that will never
 * arrive. iOS *throws* from scheduleNotificationAsync when the app isn't
 * authorized, so the schedule has to succeed before the state is written.
 */
export async function enableReminder(hhmm: string): Promise<boolean> {
  if (!(await requestReminderPermission())) return false;
  try {
    await scheduleMorningReminder(hhmm);
  } catch {
    return false;
  }
  getState().settings.reminder = { enabled: true, time: hhmm };
  save();
  return true;
}

export async function disableReminder(): Promise<void> {
  await cancelMorningReminder();
  const r = getState().settings.reminder;
  // Keep the chosen time so re-checking the box offers it again.
  getState().settings.reminder = { enabled: false, time: r?.time || DEFAULT_REMINDER_TIME };
  save();
}

/**
 * Reconcile the OS schedule with the journal on launch. Re-scheduling an
 * already-scheduled reminder is a no-op-by-replacement, which is what makes
 * this safe to call every cold start.
 */
export async function syncReminder(): Promise<void> {
  try {
    const r = getState().settings.reminder;
    if (!r?.enabled) {
      await cancelMorningReminder();
      return;
    }
    // Permission revoked in system settings while we were away: the journal
    // still says "on", so flip it off rather than show a lie in the UI.
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      await disableReminder();
      return;
    }
    await scheduleMorningReminder(r.time || DEFAULT_REMINDER_TIME);
  } catch {
    // Reminders are a nicety — never let them break launch.
  }
}
