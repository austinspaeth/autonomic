import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface AppEnvNative {
  /** iOS: true when the build carries a sandbox receipt (TestFlight or dev install). */
  isSandboxReceipt?: boolean;
  /** Android: package that installed the app ("com.android.vending" = Google
   *  Play; empty/other = sideload via adb or a shared APK). */
  installerPackage?: string;
  /** Which of these class names this build can no longer resolve. iOS always []. */
  missingClasses?: (names: string[]) => string[];
  /** Install the Java uncaught-exception handler. iOS is a no-op returning false. */
  installCrashHandler?: () => boolean;
  /** Crashes recorded since the last call, as raw JSON, clearing them. */
  takeCrashLog?: () => string;
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

/**
 * Which of these fully-qualified class names this build can no longer resolve.
 *
 * For classes that are looked up by NAME at runtime — a Parcelable arriving in
 * an Intent extra, anything reflective — R8 renaming one is invisible until it
 * fails, and it fails inside the library that owns it. Asking here lets a
 * feature switch itself off instead.
 *
 * FAILS SAFE, and the direction is deliberate: an unreadable answer returns
 * `[]` (nothing missing). This gates features off, so a module that cannot
 * answer must not be able to disable working functionality on a hunch — the
 * real evidence is a class we asked about and were told is gone.
 */
export function missingClasses(names: string[]): string[] {
  if (Platform.OS !== 'android' || names.length === 0) return [];
  try {
    return appEnvNative()?.missingClasses?.(names) ?? [];
  } catch {
    return [];
  }
}

/**
 * Start recording Java crashes. Android only; returns false everywhere else.
 *
 * The JS-side `installErrorLogging()` hooks React Native's `ErrorUtils`, which
 * only ever sees JavaScript throws — a Java exception on the main thread took
 * the process down and left the on-device error log empty, which reads exactly
 * like "nothing went wrong". This closes that half.
 */
export function installNativeCrashHandler(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return appEnvNative()?.installCrashHandler?.() ?? false;
  } catch {
    return false;
  }
}

/** Crashes recorded since the last call, as raw JSON. Reading them clears them. */
export function takeNativeCrashLog(): string {
  if (Platform.OS !== 'android') return '';
  try {
    return appEnvNative()?.takeCrashLog?.() ?? '';
  } catch {
    return '';
  }
}
