/**
 * ECG import from Apple Health — the native bridge + orchestration.
 *
 * The kingstinct HealthKit library does not expose HKElectrocardiogram, so a
 * local native module (modules/ecg-health) hands us the raw lead-I voltage
 * waveform plus Apple's classification and average HR. The waveform → metric
 * math lives in the (pure, unit-tested) ./ecgMetrics module.
 */
import { ecgNative } from '../../../modules/ecg-health';

export type { EcgImport, EcgMetrics, RawEcgSample } from './ecgMetrics';
export { computeEcgMetrics } from './ecgMetrics';

export async function requestEcgAuth(): Promise<boolean> {
  const mod = ecgNative();
  if (!mod) return false;
  try { return await mod.requestAuthorization(); } catch { return false; }
}
