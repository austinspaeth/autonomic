import { requireNativeModule } from 'expo-modules-core';
import type { RawEcgSample } from '../../src/lib/health/ecgMetrics';

export type { RawEcgSample };

interface EcgHealthNative {
  isAvailable(): Promise<boolean>;
  requestAuthorization(): Promise<boolean>;
  queryEcg(sinceMs: number, limit: number): Promise<RawEcgSample[]>;
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
