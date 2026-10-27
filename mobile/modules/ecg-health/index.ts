import { requireNativeModule } from 'expo-modules-core';
import type { RawEcgSample } from '../../src/lib/health/ecgMetrics';

export type { RawEcgSample };

interface EcgHealthNative {
  isAvailable(): Promise<boolean>;
  requestAuthorization(): Promise<boolean>;
  queryEcg(sinceMs: number, limit: number): Promise<RawEcgSample[]>;
  /** Delete the category samples of one type THIS APP saved in a window.
   *  Optional: binaries built before 1.38 do not carry it. */
  deleteOwnCategory?(typeIdentifier: string, startMs: number, endMs: number): Promise<boolean>;
}

let mod: EcgHealthNative | null | undefined;

/** The native module, or null when it isn't built in (non-iOS / Expo Go). */
export function ecgNative(): EcgHealthNative | null {
  if (mod !== undefined) return mod;
  try {
    mod = requireNativeModule('EcgHealth') as EcgHealthNative;
  } catch {
    mod = null;
  }
  return mod;
}
