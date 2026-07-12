/**
 * Pure mapping from a raw watch userInfo payload (stand-test result, schema
 * v1) to its journal pieces: the reading entry, the day key it belongs to,
 * and the 1 Hz HR series destined for the waveform sidecar. No store or
 * native imports — unit-tested directly.
 */
import { keyOf } from '../dates';
import type { Entry } from '../types';
import type { WaveformData } from '../waveforms';

const pad = (n: number) => String(n).padStart(2, '0');

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

export interface MappedStandTest {
  dayKey: string;
  entry: Entry;
  waveform: WaveformData | null;
}

/**
 * Validate + convert. Returns null for anything malformed: unknown type,
 * missing id, unparseable time, or a schema newer than we understand (an old
 * phone build receiving a future watch payload must not half-import it).
 */
export function mapStandTestPayload(payload: Record<string, unknown>): MappedStandTest | null {
  if (!payload || payload.type !== 'standTest') return null;
  const id = payload.id;
  if (typeof id !== 'string' || !id) return null;
  const schema = num(payload.schemaVersion);
  if (schema == null || schema > 1) return null;
  const date = new Date(String(payload.time));
  if (isNaN(date.getTime())) return null;

  const entry: Entry = {
    id,
    type: 'standTest',
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    startedAt: date.toISOString(),
    note: typeof payload.note === 'string' ? payload.note : '',
    source: 'watch',
    schemaVersion: schema,
  };
  for (const k of ['baselineHr', 'peakHr', 'peakDelta', 'sustainedDelta', 'maxHrComputed', 'maxHrReached', 'standAt'] as const) {
    const v = num(payload[k]);
    if (v != null) entry[k] = v;
  }
  entry.metThreshold = payload.metThreshold === true;
  if (payload.endedEarly === true) entry.endedEarly = true;
  if (payload.baselineUnstable === true) entry.baselineUnstable = true;

  let waveform: WaveformData | null = null;
  if (Array.isArray(payload.hrSeries)) {
    const sampledHr = (payload.hrSeries as unknown[])
      .map((s) => {
        const o = s as { t?: unknown; hr?: unknown };
        const t = num(o?.t), hr = num(o?.hr);
        return t != null && hr != null ? { t, bpm: hr } : null;
      })
      .filter((s): s is { t: number; bpm: number } => s != null);
    if (sampledHr.length) waveform = { sampledHr };
  }
  return { dayKey: keyOf(date), entry, waveform };
}
