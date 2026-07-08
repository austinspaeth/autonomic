/**
 * Per-reading-type Apple Health "sources" for the on-demand import picker.
 *
 * The product model: tapping a reading type (Blood Pressure / ECG / Resting HR)
 * opens a card that lists that reading type's samples *for the selected day* from
 * Apple Health so you can pick one to review-and-save — or enter it manually.
 * This deliberately avoids the bulk "sync everything" path, which pulls a lot of
 * noise. HRV/breathing-HRV are live-capture only, and types with no HealthKit
 * equivalent (e.g. Orthostatic) return no source (the caller goes straight to the
 * manual form).
 *
 * BP + Resting HR reuse `readImports` (already timestamped + provenance-aware);
 * ECG uses the dedicated native module via `readEcgSince`.
 */
import { fmtTime12, keyOf } from '../dates';
import { health } from './index';
import { ecgAvailable, readEcgSince, requestEcgAuth } from './ecg';

/** One importable Apple Health reading, shaped for the picker + prefill. */
export interface HealthCandidate {
  key: string;                                 // stable id (uuid / type+time+value)
  time: string;                                // HH:MM local
  label: string;                               // primary line, e.g. "128/82"
  sub: string;                                 // secondary, e.g. "6:32 AM · Sinus rhythm"
  entry: Record<string, string | boolean>;     // prefilled reading fields
}
export interface HealthSource {
  fetch(dk: string): Promise<HealthCandidate[]>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Which reading types can be imported from Apple Health (null → manual only). */
export function healthSourceFor(type: string): HealthSource | null {
  if (type === 'ecg') return { fetch: ecgCandidates };
  if (type === 'restingHr' || type === 'bp') return { fetch: (dk) => sampleCandidates(type, dk) };
  return null;
}

/** Resting HR / BP candidates for a day, from the timestamped import stream. */
async function sampleCandidates(type: 'restingHr' | 'bp', dk: string): Promise<HealthCandidate[]> {
  const api = health();
  if (!api.available) return [];
  const imports = await api.readImports(dk);
  return imports
    .filter((im) => im.type === type && !im.ownApp)   // skip our own write-backs
    .map((im) => {
      const label = type === 'bp' ? `${im.fields.sys}/${im.fields.dia}` : `${im.fields.hr} bpm`;
      const entry: Record<string, string> = type === 'bp'
        ? { sys: im.fields.sys, dia: im.fields.dia }
        : { hr: im.fields.hr, position: im.fields.position || 'Laying' };
      return { key: `${im.type}-${im.startMs}-${label}`, time: im.time, label, sub: fmtTime12(im.time), entry };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

const CLASS_LABELS: Record<string, string> = {
  sinusRhythm: 'Sinus rhythm',
  atrialFibrillation: 'Atrial fibrillation',
  inconclusiveLowHeartRate: 'Inconclusive · low HR',
  inconclusiveHighHeartRate: 'Inconclusive · high HR',
  inconclusivePoorReading: 'Poor recording',
  inconclusiveOther: 'Inconclusive',
  unrecognized: 'Unrecognized',
  notSet: 'ECG',
};

/** ECGs recorded on `dk`, via the native ECG module. */
async function ecgCandidates(dk: string): Promise<HealthCandidate[]> {
  if (!ecgAvailable()) return [];
  await requestEcgAuth();
  const [y, m, d] = dk.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0);
  const imports = await readEcgSince(dayStart.toISOString(), 50);
  return imports
    .filter((im) => keyOf(new Date(im.startISO)) === dk)   // local-day match (startISO is UTC)
    .map((im) => {
      const time = hhmm(new Date(im.startISO));
      const hr = im.fields.hr as string | undefined;
      return {
        key: im.uuid,
        time,
        label: hr ? `${hr} bpm` : 'ECG',
        sub: `${fmtTime12(time)} · ${CLASS_LABELS[im.metrics.classification] || 'ECG'}`,
        entry: { ...im.fields, ecgUuid: im.uuid },
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}
