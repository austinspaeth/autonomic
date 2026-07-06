/**
 * ECG import from Apple Health — the native bridge + orchestration.
 *
 * The kingstinct HealthKit library does not expose HKElectrocardiogram, so a
 * local native module (modules/ecg-health) hands us the raw lead-I voltage
 * waveform plus Apple's classification and average HR. The waveform → metric
 * math lives in the (pure, unit-tested) ./ecgMetrics module.
 */
import { ecgNative } from '../../../modules/ecg-health';
import { EcgImport, RawEcgSample, toImport } from './ecgMetrics';

export type { EcgImport, EcgMetrics, RawEcgSample } from './ecgMetrics';
export { computeEcgMetrics } from './ecgMetrics';

export function ecgAvailable(): boolean {
  return ecgNative() != null;
}

export async function requestEcgAuth(): Promise<boolean> {
  const mod = ecgNative();
  if (!mod) return false;
  try { return await mod.requestAuthorization(); } catch { return false; }
}

/** Read ECGs recorded since `sinceISO` (default: last 30 days) → import records. */
export async function readEcgSince(sinceISO?: string, limit = 20): Promise<EcgImport[]> {
  const mod = ecgNative();
  if (!mod) return [];
  const since = sinceISO ? new Date(sinceISO).getTime() : Date.now() - 30 * 864e5;
  let raw: RawEcgSample[] = [];
  try { raw = await mod.queryEcg(since, limit); } catch { return []; }
  return raw.map(toImport);
}
