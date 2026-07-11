import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface AppEnvNative {
  /** True when the build carries a sandbox receipt (TestFlight or dev install). */
  isSandboxReceipt: boolean;
}

let mod: AppEnvNative | null | undefined;

/** The native module, or null when it isn't built in (non-iOS / Expo Go). */
function appEnvNative(): AppEnvNative | null {
  if (mod !== undefined) return mod;
  try {
    mod = requireNativeModule('AppEnv') as AppEnvNative;
  } catch {
    mod = null;
  }
  return mod;
}

/**
 * True for TestFlight and dev-installed iOS builds (sandbox receipt), false for
 * App Store installs. Fails safe: if the native constant can't be read, returns
 * false so the paywall stays enforced rather than accidentally disabled in
 * production.
 */
export function isTestFlightBuild(): boolean {
  if (Platform.OS !== 'ios') return false;
  return appEnvNative()?.isSandboxReceipt ?? false;
}
