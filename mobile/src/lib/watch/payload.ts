/**
 * Pure mapping from a raw watch userInfo payload (stand-test result, schema
 * v1) to its journal pieces: the reading entry, the day key it belongs to,
 * and the 1 Hz HR series destined for the waveform sidecar. No store or
 * native imports — unit-tested directly.
 */
import { keyOf } from '../dates';
import { computeHrv } from '../hrv';
import { SYMPTOM_TYPES } from '../registry';
import type { Entry } from '../types';
import type { WaveformData } from '../waveforms';

const pad = (n: number) => String(n).padStart(2, '0');

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** Pull a `{ t, hr }[]` series off a payload into the sidecar waveform shape. */
function hrSeriesWaveform(payload: Record<string, unknown>): WaveformData | null {
  if (!Array.isArray(payload.hrSeries)) return null;
  const sampledHr = (payload.hrSeries as unknown[])
    .map((s) => {
      const o = s as { t?: unknown; hr?: unknown };
      const t = num(o?.t), hr = num(o?.hr);
      return t != null && hr != null ? { t, bpm: hr } : null;
    })
    .filter((s): s is { t: number; bpm: number } => s != null);
  return sampledHr.length ? { sampledHr } : null;
}

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

  return { dayKey: keyOf(date), entry, waveform: hrSeriesWaveform(payload) };
}

/**
 * Orthostatic-event quick-log from the watch (schema v1). Maps onto the app's
 * existing `orthostatic` reading type: transition + before/after/1-min HR.
 */
export function mapOrthostaticPayload(payload: Record<string, unknown>): { dayKey: string; entry: Entry; waveform: WaveformData | null } | null {
  if (!payload || payload.type !== 'orthostatic') return null;
  const id = payload.id;
  if (typeof id !== 'string' || !id) return null;
  const schema = num(payload.schemaVersion);
  if (schema == null || schema > 1) return null;
  const date = new Date(String(payload.time));
  if (isNaN(date.getTime())) return null;

  const entry: Entry = {
    id,
    type: 'orthostatic',
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    startedAt: date.toISOString(),
    note: typeof payload.note === 'string' ? payload.note : '',
    source: 'watch',
    schemaVersion: schema,
  };
  if (typeof payload.transition === 'string') entry.transition = payload.transition;
  for (const k of ['beforeHr', 'afterHr', 'hr1min', 'transitionAt', 'completedAt'] as const) {
    const v = num(payload[k]);
    if (v != null) entry[k] = v;
  }
  return { dayKey: keyOf(date), entry, waveform: hrSeriesWaveform(payload) };
}

/**
 * Symptom quick-log from the watch (schema v1): `{ symptomType, time, hr }`.
 * The symptomType must be a known registry key — an unknown one is dropped so a
 * newer watch build can't inject a type this phone build doesn't render. The HR
 * at the moment of logging is preserved in the note (e.g. "HR 78 bpm").
 */
export function mapSymptomPayload(payload: Record<string, unknown>): { dayKey: string; entry: Entry } | null {
  if (!payload || payload.type !== 'symptom') return null;
  const id = payload.id;
  if (typeof id !== 'string' || !id) return null;
  const schema = num(payload.schemaVersion);
  if (schema == null || schema > 1) return null;
  const symptomType = payload.symptomType;
  if (typeof symptomType !== 'string' || !(symptomType in SYMPTOM_TYPES)) return null;
  const date = new Date(String(payload.time));
  if (isNaN(date.getTime())) return null;
  const hr = num(payload.hr);

  const entry: Entry = {
    id,
    type: symptomType,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    note: hr != null ? `HR ${Math.round(hr)} bpm` : '',
    source: 'watch',
    schemaVersion: schema,
  };
  return { dayKey: keyOf(date), entry };
}


/**
 * A live HRV reading captured on a Garmin watch (schema v1).
 *
 * Unlike the Apple Watch — which streams nothing off the wrist and only ever
 * sends summary results — Connect IQ hands us the raw beat-to-beat series, so
 * this runs the SAME `computeHrv` pipeline a phone-side capture does. The
 * reading is therefore indistinguishable downstream from one taken with a
 * strap, which is the point: scoring, Analysis and Insights need no Garmin
 * special case.
 *
 * `durationSec` is stamped from the watch's own elapsed time rather than
 * inferred from the RR sum, because a shortfall between the two is exactly the
 * dropped-beat signal `isTrustedReading` exists to catch.
 */
export function mapHrvPayload(payload: Record<string, unknown>): { dayKey: string; entry: Entry; waveform: WaveformData | null } | null {
  if (!payload || payload.type !== 'hrv') return null;
  const id = payload.id;
  if (typeof id !== 'string' || !id) return null;
  const schema = num(payload.schemaVersion);
  if (schema == null || schema > 1) return null;
  const date = new Date(String(payload.time));
  if (isNaN(date.getTime())) return null;

  const rr = Array.isArray(payload.rrMs)
    ? (payload.rrMs as unknown[]).map(num).filter((v): v is number => v != null)
    : [];
  if (rr.length < 2) return null;

  const durationSec = num(payload.elapsedSec) ?? Math.round(rr.reduce((a, b) => a + b, 0) / 1000);
  const result = computeHrv(rr, { source: 'garmin', durationSec });

  const entry: Entry = {
    id,
    type: 'hrv',
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    startedAt: date.toISOString(),
    period: typeof payload.period === 'string' ? payload.period : 'Other',
    note: typeof payload.note === 'string' ? payload.note : '',
    source: 'garmin',
    durationSec,
    schemaVersion: schema,
  };
  if (result.ok || Object.keys(result.fields).length) Object.assign(entry, result.fields);

  // Waveforms never enter the journal — the raw RR goes to the sidecar, and
  // rrClean is deliberately not stored (it is re-derived by correctArtifacts).
  return { dayKey: keyOf(date), entry, waveform: { rrRaw: rr } };
}

export interface MappedWatch {
  section: 'readings' | 'symptoms';
  dayKey: string;
  entry: Entry;
  waveform: WaveformData | null;
}

/** Dispatch a raw watch userInfo payload to its journal section. */
export function mapWatchPayload(payload: Record<string, unknown>): MappedWatch | null {
  const st = mapStandTestPayload(payload);
  if (st) return { section: 'readings', dayKey: st.dayKey, entry: st.entry, waveform: st.waveform };
  const ortho = mapOrthostaticPayload(payload);
  if (ortho) return { section: 'readings', dayKey: ortho.dayKey, entry: ortho.entry, waveform: ortho.waveform };
  const sym = mapSymptomPayload(payload);
  if (sym) return { section: 'symptoms', dayKey: sym.dayKey, entry: sym.entry, waveform: null };
  const hrv = mapHrvPayload(payload);
  if (hrv) return { section: 'readings', dayKey: hrv.dayKey, entry: hrv.entry, waveform: hrv.waveform };
  return null;
}
