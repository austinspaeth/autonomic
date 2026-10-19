import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface WatchState {
  supported: boolean;
  activated: boolean;
  paired: boolean;
  watchAppInstalled: boolean;
  reachable: boolean;
}

/** Raw userInfo dictionary from the watch (a stand-test result payload). */
export type WatchUserInfo = Record<string, unknown>;

interface WatchBridgeNative {
  getState(): Promise<WatchState>;
  /** Results still sitting in the native inbox (arrived before JS attached). */
  pendingUserInfo(): Promise<WatchUserInfo[]>;
  /** Confirm a result id is durably stored: clears the inbox + tells the watch. */
  sendAck(id: string): Promise<void>;
  /** Replace the application context the watch mirrors ({ pro, age, sex }). */
  updateContext(context: Record<string, unknown>): Promise<void>;
  /** The same context as complication user info, which wakes the watch app so
   *  the face redraws. Resolves to the transfers left today (-1: no
   *  complication on the active face, nothing sent). Optional: binaries
   *  built before the score/pacing complications do not carry it. */
  transferComplication?(info: Record<string, unknown>): Promise<number>;
  addListener(event: 'onUserInfo', cb: (info: WatchUserInfo) => void): EventSubscription;
  addListener(event: 'onStateChange', cb: (state: WatchState) => void): EventSubscription;
}

let mod: WatchBridgeNative | null | undefined;

/** The native module, or null when it isn't built in (non-iOS / Expo Go). */
export function watchBridge(): WatchBridgeNative | null {
  if (mod !== undefined) return mod;
  try {
    mod = requireNativeModule('WatchBridge') as WatchBridgeNative;
  } catch {
    mod = null;
  }
  return mod;
}
