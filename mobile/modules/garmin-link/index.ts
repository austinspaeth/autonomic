import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * URL scheme Garmin Connect uses to hand device selections back to us.
 *
 * iOS only in practice: the Android SDK reports paired devices directly and
 * never calls back through a URL. It is still passed to `initialize` on both so
 * the two platforms present one interface.
 */
export const GARMIN_URL_SCHEME = 'autonomic-ciq';

export type GarminDeviceStatus =
  | 'invalid'
  | 'bluetoothNotReady'
  | 'notFound'
  | 'notConnected'
  | 'connected'
  | 'unknown';

export interface GarminDevice {
  id: string;
  name: string;
  model: string;
  status: GarminDeviceStatus;
  connected: boolean;
}

export interface GarminAppStatus {
  /** Advisory only — a sideloaded watch app reports false yet still delivers. */
  installed: boolean;
  version: number;
  known: boolean;
}

interface GarminLinkNative {
  initialize(urlScheme: string): Promise<boolean>;
  showDeviceSelection(): Promise<void>;
  handleUrl(url: string): Promise<GarminDevice[]>;
  getDevices(): Promise<GarminDevice[]>;
  getAppStatus(deviceId: string): Promise<GarminAppStatus>;
  startListening(deviceId: string): Promise<boolean>;
  stopListening(): Promise<void>;
  ackMessage(deviceId: string, id: string): Promise<boolean>;
  openStoreForApp(deviceId: string): Promise<void>;
  addListener(event: 'onMessage', cb: (msg: GarminMessage) => void): EventSubscription;
  addListener(
    event: 'onDeviceStatus',
    cb: (e: { id: string; status: GarminDeviceStatus; connected: boolean }) => void,
  ): EventSubscription;
  addListener(event: 'onNeedsGarminConnect', cb: () => void): EventSubscription;
}

/**
 * A reading arriving from the watch. The body is whatever the Monkey C app
 * sent, so it is deliberately untyped here — `mapWatchPayload` owns validation,
 * and it is the same contract the Apple Watch relay uses.
 */
export type GarminMessage = Record<string, unknown> & { deviceId?: string; id?: string };

let mod: GarminLinkNative | null | undefined;

/** The native module, or null when it isn't built in (web / Expo Go). */
export function garminNative(): GarminLinkNative | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    mod = null;
    return mod;
  }
  try {
    mod = requireNativeModule('GarminLink') as GarminLinkNative;
  } catch {
    mod = null;
  }
  return mod;
}

export function garminAvailable(): boolean {
  return garminNative() !== null;
}


export function onGarminMessage(fn: (msg: GarminMessage) => void): EventSubscription | null {
  return garminNative()?.addListener('onMessage', fn) ?? null;
}

export function onGarminDeviceStatus(
  fn: (e: { id: string; status: GarminDeviceStatus; connected: boolean }) => void,
): EventSubscription | null {
  return garminNative()?.addListener('onDeviceStatus', fn) ?? null;
}

/** Garmin Connect is missing; device discovery cannot work without it. */
export function onNeedsGarminConnect(fn: () => void): EventSubscription | null {
  return garminNative()?.addListener('onNeedsGarminConnect', fn) ?? null;
}
