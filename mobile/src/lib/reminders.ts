/**
 * The app's notifications, all local (no push, no server, nothing leaves the
 * device):
 *
 * - Daily reminder: a nudge to take the reading at the same time each morning,
 *   which is what makes a baseline comparable day to day. Armed as a week of
 *   one-shots rather than one repeating trigger, so a morning that already
 *   holds a reading is skipped (initMorningWatcher).
 * - Crash warning: fired when the trailing-week trend flags a likely crash
 *   (detectDownturn — the same engine behind the Outlook card), telling the
 *   user to rest. Evaluated whenever the app is running: on launch and after
 *   journal changes (initCrashWatcher).
 * - Reading complete: a reading that finished while the app was backgrounded.
 * - Pacing alerts: src/store/pacingAlerts.ts, which also runs from the
 *   background (src/store/pacingBackground.ts). Only the shared permission
 *   handling for them lives here.
 *
 * The scheduled reminder is derived state: `settings.reminder` in the journal
 * is the source of truth, and `syncReminder()` reconciles the OS schedule to
 * it on launch. That keeps the two from drifting after a reinstall, a restore
 * from an export, or the user revoking permission in system settings.
 *
 * SAYING YES TURNS ON EVERYTHING NEVER CHOSEN. The moment permission first
 * becomes granted, whether through one of our prompts or in system settings,
 * `applyNotificationDefaults()` switches on every notification the user has
 * not decided about. An explicit off is never overridden.
 */
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { MMKV } from 'react-native-mmkv';
import { todayKey } from './dates';
import { hasHrvReadingOn } from './hrvQuality';
import { MORNING_AHEAD, morningFireTimes, type NotificationCopy } from './notifications';
import { logError } from './diagnostics/errorLog';
import { alertsEnabled } from './budget/alerts';
import { pingNotifyEnabled } from '../store/ping';
import { resolveProtocol } from './scoring/day';
import { detectDownturn } from './scoring/downturn';
import { detectStrain } from './scoring/strain';
import { readPressure } from './pressure';
import { pressureLink } from './insights/pressureMemory';
import { pressureNotificationBody } from './insights/pressureCopy';
import { pressureAlertVerdict } from './notifications';
import { getState, save, subscribeStore } from '../store/store';

/** Stable id so scheduling twice replaces rather than stacks. */
// NEVER change this id. It is what cancelReminder targets, so a rename would
// orphan every schedule already on a phone and the next sync would stack a
// second daily notification beside one nothing can cancel.
const ID = 'morning-reminder';
const CHANNEL = 'reminders';
const CRASH_CHANNEL = 'crash-warnings';
const HRV_CHANNEL = 'hrv-complete';
const PRESSURE_CHANNEL = 'pressure';

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

/* ---------- the last permission answer we saw ---------- */

// Plaintext flags MMKV: it is about the device's permission, not the journal,
// so it must not ride an import. It exists only so a grant made in system
// settings can be told apart from one that was already there.
const FLAGS_ID = 'autonomic.flags';
const PERM_KEY = 'notifPermissionSeen';
let flags: MMKV | null | undefined;

function flagStore(): MMKV | null {
  if (flags !== undefined) return flags;
  try { flags = new MMKV({ id: FLAGS_ID }); } catch { flags = null; }
  return flags;
}

function permSeen(): boolean | undefined {
  try { return flagStore()?.getBoolean(PERM_KEY); } catch { return undefined; }
}

function notePermSeen(granted: boolean): void {
  try { flagStore()?.set(PERM_KEY, granted); } catch { /* best-effort */ }
}

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

/** Crash warnings ride their own higher-importance channel on Android — a
 *  "stop and rest" alert should break through where a daily nudge shouldn't. */
async function ensureCrashChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CRASH_CHANNEL, {
    name: 'Crash warnings',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/** Reading-complete rides its own channel — a "your reading is done" buzz
 *  should break through like the crash warning, not sit on the quiet daily
 *  channel. */
async function ensureHrvChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(HRV_CHANNEL, {
    name: 'Reading complete',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * A backgrounded HRV reading finishes with no felt haptic — iOS suppresses
 * haptics entirely while the app isn't in the foreground, and a baseline
 * reading is usually taken with the phone set aside. Post an immediate local
 * notification (sound + vibration) so completion is still felt, the same signal
 * the completion buzz gives a foreground reading. Best-effort: silently no-ops
 * without notification permission, mirroring the crash warning — never prompt
 * mid-reading.
 */
export async function notifyHrvComplete(copy: NotificationCopy): Promise<void> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await ensureHrvChannel();
    await Notifications.scheduleNotificationAsync({
      content: { ...copy, sound: 'default' },
      trigger: Platform.OS === 'android' ? { channelId: HRV_CHANNEL } : null,
    });
  } catch {
    // Best-effort — never let the cue break the reading.
  }
}

/**
 * Ask for notification permission, returning whether we ended up with it.
 * Only prompts when the OS hasn't already decided — a previous "don't allow"
 * can't be re-prompted, so that path resolves false and the caller should send
 * the user to system settings.
 *
 * A prompt that comes back granted turns on every notification never chosen
 * for (`applyNotificationDefaults`), whichever toggle raised it.
 */
export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  notePermSeen(asked.granted);
  if (asked.granted) await applyNotificationDefaults();
  return asked.granted;
}

/** Whether the OS would let us prompt again (false = must go to Settings). */
export async function canAskForReminders(): Promise<boolean> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted || p.canAskAgain;
}

export type NotificationPermission = 'granted' | 'ask' | 'blocked';

/** The permission as a UI needs it: on, askable, or only fixable in settings. */
export async function readNotificationPermission(): Promise<NotificationPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
  } catch {
    return 'ask';
  }
}

/**
 * Turn on every notification the user has never decided about: the morning
 * reminder at its default time, crash warnings, and (by leaving them undefined,
 * which reads as on) every pacing alert. An explicit off stays off.
 *
 * Called the moment permission becomes granted. The reminder is only persisted
 * once its schedule succeeded, the `enableReminder` rule.
 */
export async function applyNotificationDefaults(): Promise<void> {
  try {
    const s = getState();
    let changed = false;
    if (s.settings.reminder === undefined) {
      try {
        await scheduleMorningReminder(DEFAULT_REMINDER_TIME);
        s.settings.reminder = { enabled: true, time: DEFAULT_REMINDER_TIME };
        changed = true;
        pingNotifyEnabled('reminder');
      } catch (e) {
        logError('reminder.schedule', e);
      }
    }
    if (s.settings.crashAlert === undefined) {
      s.settings.crashAlert = { enabled: true };
      changed = true;
      pingNotifyEnabled('crash');
    }
    if (changed) save();
    if (Object.values(alertsEnabled(s.settings)).some(Boolean) && pacingUnlocked()) pingNotifyEnabled('pacing');
    if (changed) void checkCrashRisk();
  } catch (e) {
    logError('notify.defaults', e);
  }
}

/** Lazy: the tier store is a heavier dependency than this module should carry. */
function pacingUnlocked(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../store/pacingTrial') as typeof import('../store/pacingTrial')).isPacingUnlocked();
  } catch {
    return false;
  }
}

/**
 * Notice a permission that changed while we were not asking: granted, or
 * taken away, in system settings. Launch and foreground call it. A grant seen
 * here for the first time applies the defaults exactly as a prompt would.
 *
 * A phone seen for the first time is only recorded: permission that was
 * already there before this shipped is not a new yes.
 */
export async function syncNotificationPermission(): Promise<boolean> {
  try {
    const granted = (await Notifications.getPermissionsAsync()).granted;
    const prev = permSeen();
    notePermSeen(granted);
    if (granted && prev === false) await applyNotificationDefaults();
    return granted;
  } catch {
    return false;
  }
}

/** The one-shot ids, one per morning ahead. `ID` itself is kept only so the
 *  old repeating trigger is cancelled on every phone that still carries it. */
const morningId = (i: number) => `${ID}-${i}`;

/**
 * Arm the next mornings at `hhmm`, replacing whatever was armed. Today's is
 * skipped once today already holds a reading that counts: this reminder is a
 * nudge to measure, and nudging somebody who has measured is the fastest way
 * to teach them to ignore it. See `morningFireTimes`.
 */
export async function scheduleMorningReminder(hhmm: string): Promise<void> {
  await ensureChannel();
  await cancelMorningReminder();
  const readingToday = hasHrvReadingOn(getState().days[todayKey()]);
  const times = morningFireTimes(new Date(), hhmm || DEFAULT_REMINDER_TIME, readingToday);
  for (let i = 0; i < times.length; i++) {
    await Notifications.scheduleNotificationAsync({
      identifier: morningId(i),
      content: {
        title: 'Good morning',
        body: 'Take your morning reading while your body is still at rest.',
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: times[i],
        channelId: CHANNEL,
      },
    });
  }
  plannedFor = planKey(hhmm, readingToday);
}

export async function cancelMorningReminder(): Promise<void> {
  plannedFor = null;
  const ids = [ID];
  for (let i = 0; i <= MORNING_AHEAD; i++) ids.push(morningId(i));
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

/** What the armed plan was built from, so a journal change that does not move
 *  it (most of them) costs nothing. */
let plannedFor: string | null = null;
const planKey = (hhmm: string, readingToday: boolean) => `${todayKey()}|${hhmm}|${readingToday ? 1 : 0}`;

let morningWatcherArmed = false;
/**
 * Re-plan the mornings when the answer changes: a reading landing today drops
 * today's reminder, and a new day (seen on foreground) rolls the week forward.
 * Debounced like the crash watcher, and a no-op when the plan is unchanged.
 */
export function initMorningWatcher(): void {
  if (morningWatcherArmed) return;
  morningWatcherArmed = true;
  const replan = () => {
    const r = getState().settings.reminder;
    if (!r?.enabled) return;
    const hhmm = r.time || DEFAULT_REMINDER_TIME;
    if (planKey(hhmm, hasHrvReadingOn(getState().days[todayKey()])) === plannedFor) return;
    void syncReminder();
  };
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; replan(); }, 2000);
  });
  AppState.addEventListener('change', (s) => { if (s === 'active') replan(); });
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
  } catch (e) {
    logError('reminder.schedule', e);
    return false;
  }
  const s = getState();
  s.settings.reminder = { enabled: true, time: hhmm };
  // Saying yes to notifications for the first time (the welcome wizard's
  // opt-in, or a fresh journal's first enable) turns crash warnings on too —
  // permission was just granted, and a rest warning is the notification most
  // worth having. An explicit off (crashAlert already set) is never overridden.
  if (s.settings.crashAlert === undefined) s.settings.crashAlert = { enabled: true };
  save();
  // Counted here and not at the tap: on iOS the schedule above THROWS when the
  // app isn't authorized, so a ping fired earlier would count an ask that
  // produced no notification. Reaching this line means one is really armed.
  pingNotifyEnabled('reminder');
  // The journal may already show a slide today; warn now rather than on the
  // next data point.
  void checkCrashRisk();
  return true;
}

export async function disableReminder(): Promise<void> {
  await cancelMorningReminder();
  const r = getState().settings.reminder;
  // Keep the chosen time so re-checking the box offers it again.
  getState().settings.reminder = { enabled: false, time: r?.time || DEFAULT_REMINDER_TIME };
  save();
}

/* ---------- crash warning ---------- */

/**
 * Turn crash warnings on/off, persisting the choice. Enabling requests
 * permission first and returns false (persisting nothing) when it isn't
 * granted, mirroring enableReminder.
 */
export async function setCrashAlert(on: boolean): Promise<boolean> {
  if (on && !(await requestReminderPermission())) return false;
  const prev = getState().settings.crashAlert;
  getState().settings.crashAlert = { ...(prev || {}), enabled: on };
  save();
  // Only an enable is counted; a disable is a different event (see pingNotifyEnabled).
  if (on) pingNotifyEnabled('crash');
  if (on) void checkCrashRisk();
  return true;
}

/**
 * Evaluate today's trend and fire the rest warning if it's sliding. Called on
 * launch and (debounced) after every journal change — the moment new data
 * lands is the moment we can warn. Dedupe is one notification per calendar day
 * (`crashAlert.lastFired`), and the message reuses the Outlook card's downturn
 * copy so the notification and the app always tell the same story.
 */
export async function checkCrashRisk(): Promise<void> {
  try {
    const s = getState();
    const ca = s.settings.crashAlert;
    const dk = todayKey();
    if (!ca?.enabled || ca.lastFired === dk) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const ctx = { sex: s.profile.sex, height: s.profile.height };
    const w = detectDownturn(s.days, dk, ctx, resolveProtocol(s.settings.protocol), s.customTypes);
    if (!w) return;
    await ensureCrashChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title: w.title, body: `${w.body} Open Autonomic to see what's behind this.`, sound: 'default' },
      trigger: Platform.OS === 'android' ? { channelId: CRASH_CHANNEL } : null,
    });
    getState().settings.crashAlert = { ...ca, lastFired: dk };
    save();
  } catch {
    // Warnings are best-effort — never let them break logging.
  }
}

/* ---------- low barometric pressure ---------- */

async function ensurePressureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PRESSURE_CHANNEL, {
    name: 'Low pressure',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/** Turn the low-pressure notification on/off. Undefined already reads as on,
 *  so this only ever records a choice. */
export async function setPressureAlert(on: boolean): Promise<boolean> {
  if (on && !(await requestReminderPermission())) return false;
  const prev = getState().settings.pressureAlert;
  getState().settings.pressureAlert = { ...(prev || {}), enabled: on };
  save();
  if (on) void checkPressureAlert();
  return true;
}

/**
 * Today's pressure reads low AND this person's own journal has been found to
 * run worse on low days: say so, once a day, in the Journal card's own words.
 * Called after every pressure sample, foreground or background.
 *
 * With the app OPEN the Journal is already showing that card, so the day is
 * stamped and nothing is posted: the card was the delivery, and a banner over
 * the screen that says the same thing is noise.
 */
export async function checkPressureAlert(): Promise<void> {
  try {
    const s = getState();
    const dk = todayKey();
    const pa = s.settings.pressureAlert;
    if (pa?.enabled === false || pa?.lastFired === dk) return;
    // Cheap questions first: most days are not low, and most journals hold no link.
    const low = !!readPressure(s.pressure, dk)?.low;
    const link = low ? pressureLink() : null;
    if (!link) return;
    const ctx = { sex: s.profile.sex, height: s.profile.height };
    const downturn = detectDownturn(s.days, dk, ctx, resolveProtocol(s.settings.protocol), s.customTypes);
    const otherWarning = s.settings.crashAlert?.lastFired === dk || !!downturn || !!detectStrain(s.days, dk, ctx);
    const verdict = pressureAlertVerdict({
      enabled: pa?.enabled, lastFired: pa?.lastFired, dk, hour: new Date().getHours(),
      low, linked: true, otherWarning,
    });
    if (verdict !== 'fire') return;
    if (AppState.currentState !== 'active') {
      if (!(await Notifications.getPermissionsAsync()).granted) return;
      await ensurePressureChannel();
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Barometric pressure is low today', body: pressureNotificationBody(link), sound: 'default' },
        trigger: Platform.OS === 'android' ? { channelId: PRESSURE_CHANNEL } : null,
      });
    }
    getState().settings.pressureAlert = { enabled: pa?.enabled ?? true, lastFired: dk };
    save();
  } catch (e) {
    logError('pressure.alert', e);
  }
}

let crashWatcherArmed = false;
/** Launch hook: check once now, then re-check shortly after any journal change
 *  (a reading landing is what turns a trend into a warning). The trailing
 *  debounce keeps a burst of saves to one evaluation, and the once-per-day
 *  dedupe makes re-entry from checkCrashRisk's own save() a no-op. */
export function initCrashWatcher(): void {
  if (crashWatcherArmed) return;
  crashWatcherArmed = true;
  void checkCrashRisk();
  let t: ReturnType<typeof setTimeout> | null = null;
  subscribeStore(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; void checkCrashRisk(); }, 2000);
  });
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
  } catch (e) {
    // Reminders are a nicety — never let them break launch. Logged because a
    // reminder that silently never re-armed is invisible from the UI, which
    // keeps showing it as on.
    logError('reminder.sync', e);
  }
}
