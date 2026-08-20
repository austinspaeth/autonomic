import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface AppEnvNative {
  /** iOS: true when the build carries a sandbox receipt (TestFlight or dev install). */
  isSandboxReceipt?: boolean;
  /** Android: package that installed the app ("com.android.vending" = Google
   *  Play; empty/other = sideload via adb or a shared APK). */
  installerPackage?: string;
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

/**
 * True for Android builds that Google Play did NOT install (adb installs,
 * directly shared APKs). Sideloads cannot purchase through Play Billing at
 * all, so the paywall lets them through — the Android twin of the TestFlight
 * bypass. Fails safe: if the installer can't be read, it's treated as a Play
 * install so the paywall stays enforced.
 */
export function isSideloadedAndroidBuild(): boolean {
  if (Platform.OS !== 'android') return false;
  const installer = appEnvNative()?.installerPackage;
  if (installer === undefined || installer === null) return false;
  return installer !== 'com.android.vending';
}
