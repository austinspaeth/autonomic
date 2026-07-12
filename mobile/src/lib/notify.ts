/**
 * Reading-complete local notification — the background half of the completion
 * buzz. expo-haptics only plays while the app process is running: the BLE
 * strap keeps the app alive in the background (bluetooth-central mode), but
 * watch and camera sessions are fully suspended, so the in-app buzz can't fire
 * until the app returns. A local notification scheduled for the reading's end
 * time buzzes the device regardless; whenever finish() actually runs in-app it
 * cancels this so the two never double up.
 */
import * as Notifications from 'expo-notifications';

// If a notification somehow fires while the app is foregrounded (the cancel in
// finish() lost a race), stay silent — the haptic buzz already played.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Schedule the end-of-reading notification. Returns its id, or null if
 *  permission was declined (foreground haptics still cover completion). */
export async function scheduleReadingDone(endMs: number): Promise<string | null> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    if (endMs <= Date.now()) return null;
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Reading complete',
        body: 'Your HRV reading has finished.',
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endMs) },
    });
  } catch {
    return null;
  }
}

export async function cancelReadingDone(id: string | null) {
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* already fired or gone */ }
}
