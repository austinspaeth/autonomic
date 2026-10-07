/* Instant pushes for the three events worth an interruption: a new install,
 * a sale and a hard crash. The ping handler sends them through Expo's push
 * service the moment the ping arrives (sls/lambdas/push/expo.js); this
 * registers the phone for them.
 *
 * Needs a native build: Expo Go cannot receive remote pushes, so there this
 * quietly does nothing and the 45-second alert check is the only source. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

const REGISTERED_KEY = 'master.push.registered.v1';
/* Re-register now and then: a token can change after a restore or reinstall,
   and the server drops tokens Expo reports as gone. */
const REFRESH_MS = 7 * 864e5;

/* With the app open, the alert itself (toast + confetti) is the
   notification, so the system banner is not shown on top of it. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export const pushSupported = () =>
  Device.isDevice && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Ask (once), get the Expo token, and tell the API. Never throws. */
export async function registerForPush(force = false): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!pushSupported()) return { ok: false, reason: 'Needs the installed app, not Expo Go or a simulator.' };
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return { ok: false, reason: 'Notifications are off for this app in Settings.' };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const raw = await AsyncStorage.getItem(REGISTERED_KEY);
    const last = raw ? JSON.parse(raw) : null;
    if (!force && last?.token === token && Date.now() - last.at < REFRESH_MS) return { ok: true };
    const res = await api.registerPush(token, `${Device.modelName ?? 'iPhone'} · ${Platform.OS} ${Platform.Version}`);
    if (!res.ok) return { ok: false, reason: res.error || 'The server refused the token.' };
    await AsyncStorage.setItem(REGISTERED_KEY, JSON.stringify({ token, at: Date.now() }));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Could not register for notifications.' };
  }
}

/** Run `fn` whenever a push arrives in the foreground or is tapped. */
export function onPush(fn: () => void): () => void {
  if (!pushSupported()) return () => {};
  const a = Notifications.addNotificationReceivedListener(() => fn());
  const b = Notifications.addNotificationResponseReceivedListener(() => fn());
  return () => {
    a.remove();
    b.remove();
  };
}
