import { mapStandTestPayload, mapSymptomPayload, mapOrthostaticPayload, mapWatchPayload } from '../payload';
import { BANDS, catFromBands, computeScores, rowScoreCategory } from '../../scoring';
import { readingRowValue } from '../../registry';
import type { Entry } from '../../types';

const base = () => ({
  id: 'abc-123',
  type: 'standTest',
  time: '2026-07-12T09:30:00',
  source: 'watch',
  schemaVersion: 1,
  baselineHr: 68,
  peakHr: 112,
  peakDelta: 44,
  sustainedDelta: 38,
  metThreshold: true,
  maxHrComputed: 178,
  maxHrReached: 141,
  standAt: 300,
  hrSeries: [{ t: 0, hr: 66 }, { t: 1, hr: 67 }, { t: 2, hr: 68 }],
  note: '',
});

describe('mapStandTestPayload', () => {
  it('maps a full v1 payload to entry + day key + sidecar waveform', () => {
    const m = mapStandTestPayload(base())!;
    expect(m).not.toBeNull();
    expect(m.dayKey).toBe('2026-07-12');
    expect(m.entry).toMatchObject({
      id: 'abc-123', type: 'standTest', time: '09:30', source: 'watch', schemaVersion: 1,
      baselineHr: 68, peakHr: 112, peakDelta: 44, sustainedDelta: 38,
      metThreshold: true, maxHrComputed: 178, maxHrReached: 141, standAt: 300,
    });
    // The series must land in the sidecar payload, never on the entry.
    expect(m.entry.hrSeries).toBeUndefined();
    expect(m.entry.sampledHr).toBeUndefined();
    expect(m.waveform).toEqual({ sampledHr: [{ t: 0, bpm: 66 }, { t: 1, bpm: 67 }, { t: 2, bpm: 68 }] });
  });

  it('drops malformed series samples and tolerates a missing series', () => {
    const m = mapStandTestPayload({ ...base(), hrSeries: [{ t: 0, hr: 66 }, { t: 1 }, { hr: 70 }, 'junk'] })!;
    expect(m.waveform).toEqual({ sampledHr: [{ t: 0, bpm: 66 }] });
    const noSeries = mapStandTestPayload({ ...base(), hrSeries: undefined })!;
    expect(noSeries.waveform).toBeNull();
    expect(noSeries.entry.baselineHr).toBe(68);
  });

  it('keeps optional flags only when true', () => {
    const m = mapStandTestPayload({ ...base(), endedEarly: true, baselineUnstable: false })!;
    expect(m.entry.endedEarly).toBe(true);
    expect(m.entry.baselineUnstable).toBeUndefined();
  });

  it('rejects wrong type, missing id, future schema, and bad time', () => {
    expect(mapStandTestPayload({ ...base(), type: 'hrv' })).toBeNull();
    expect(mapStandTestPayload({ ...base(), id: '' })).toBeNull();
    expect(mapStandTestPayload({ ...base(), id: 42 })).toBeNull();
    expect(mapStandTestPayload({ ...base(), schemaVersion: 2 })).toBeNull();
    expect(mapStandTestPayload({ ...base(), schemaVersion: undefined })).toBeNull();
    expect(mapStandTestPayload({ ...base(), time: 'not-a-date' })).toBeNull();
  });

  it('sanitizes non-numeric metric fields instead of importing them', () => {
    const m = mapStandTestPayload({ ...base(), peakHr: 'high', sustainedDelta: NaN })!;
    expect(m.entry.peakHr).toBeUndefined();
    expect(m.entry.sustainedDelta).toBeUndefined();
    expect(m.entry.peakDelta).toBe(44);
  });
});

describe('standTest scoring', () => {
  const entry = (over: Partial<Entry> = {}): Entry =>
    ({ id: 'x', type: 'standTest', sustainedDelta: 38, peakDelta: 44, ...over } as Entry);

  it('standDelta band edges match the confirmed zones (10/20/30/40)', () => {
    expect(catFromBands(9, BANDS.standDelta)).toBe('great');
    expect(catFromBands(10, BANDS.standDelta)).toBe('good');
    expect(catFromBands(19, BANDS.standDelta)).toBe('good');
    expect(catFromBands(20, BANDS.standDelta)).toBe('ok');
    expect(catFromBands(29, BANDS.standDelta)).toBe('ok');
    expect(catFromBands(30, BANDS.standDelta)).toBe('bad');
    expect(catFromBands(39, BANDS.standDelta)).toBe('bad');
    expect(catFromBands(40, BANDS.standDelta)).toBe('crash');
  });

  it('rates the test on the sustained rise; peak only as fallback', () => {
    const s = computeScores(entry());
    expect(s.sustainedDelta).toBe('bad');
    expect(s.peakDelta).toBe('crash');
    expect(s.overall).toBe('bad'); // sustained wins even though peak is worse
    const peakOnly = computeScores(entry({ sustainedDelta: undefined }));
    expect(peakOnly.overall).toBe('crash');
    expect(rowScoreCategory(entry())).toBe('bad');
  });

  it('row headline prefers sustained delta, unsigned', () => {
    expect(readingRowValue(entry())).toBe('38 Δ');
    expect(readingRowValue(entry({ sustainedDelta: undefined }))).toBe('44 Δ');
    expect(readingRowValue(entry({ sustainedDelta: undefined, peakDelta: undefined }))).toBe('');
  });
});

describe('mapSymptomPayload', () => {
  const sym = (over: Record<string, unknown> = {}) => ({
    id: 'sym-1', type: 'symptom', schemaVersion: 1,
    symptomType: 'lightHeaded', time: '2026-07-12T14:05:00', hr: 78, ...over,
  });

  it('maps a valid symptom to a symptoms-section entry with HR in the note', () => {
    const m = mapWatchPayload(sym())!;
    expect(m.section).toBe('symptoms');
    expect(m.dayKey).toBe('2026-07-12');
    expect(m.waveform).toBeNull();
    expect(m.entry).toMatchObject({
      id: 'sym-1', type: 'lightHeaded', time: '14:05', source: 'watch', note: 'HR 78 bpm',
    });
  });

  it('omits the HR note when no hr is given', () => {
    expect(mapSymptomPayload(sym({ hr: undefined }))!.entry.note).toBe('');
  });

  it('drops unknown symptom types, bad ids, future schema, unparseable time', () => {
    expect(mapSymptomPayload(sym({ symptomType: 'notAThing' }))).toBeNull();
    expect(mapSymptomPayload(sym({ id: '' }))).toBeNull();
    expect(mapSymptomPayload(sym({ schemaVersion: 2 }))).toBeNull();
    expect(mapSymptomPayload(sym({ time: 'nope' }))).toBeNull();
    expect(mapSymptomPayload({ type: 'other' })).toBeNull();
  });

  it('mapWatchPayload still routes stand tests to the readings section', () => {
    const m = mapWatchPayload({
      id: 'st-1', type: 'standTest', time: '2026-07-12T09:30:00', schemaVersion: 1,
    })!;
    expect(m.section).toBe('readings');
    expect(m.entry.type).toBe('standTest');
  });
});

describe('mapOrthostaticPayload', () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    id: 'ev-1', type: 'orthostatic', schemaVersion: 1,
    transition: 'Climbing stairs', time: '2026-07-12T15:20:00',
    beforeHr: 70, afterHr: 118, hr1min: 92, transitionAt: 30, completedAt: 55,
    hrSeries: [{ t: 0, hr: 70 }, { t: 1, hr: 118 }], ...over,
  });

  it('maps a valid event to an orthostatic reading with before/after/1-min HR + markers', () => {
    const m = mapWatchPayload(ev())!;
    expect(m.section).toBe('readings');
    expect(m.dayKey).toBe('2026-07-12');
    expect(m.entry).toMatchObject({
      id: 'ev-1', type: 'orthostatic', time: '15:20', source: 'watch',
      transition: 'Climbing stairs', beforeHr: 70, afterHr: 118, hr1min: 92,
      transitionAt: 30, completedAt: 55,
    });
    expect(m.entry.hrSeries).toBeUndefined();
    expect(m.waveform).toEqual({ sampledHr: [{ t: 0, bpm: 70 }, { t: 1, bpm: 118 }] });
  });

  it('tolerates missing HR fields and rejects bad envelopes', () => {
    const partial = mapOrthostaticPayload(ev({ afterHr: undefined, hr1min: 'x', hrSeries: undefined }))!;
    expect(partial.entry.afterHr).toBeUndefined();
    expect(partial.entry.hr1min).toBeUndefined();
    expect(partial.entry.beforeHr).toBe(70);
    expect(partial.waveform).toBeNull();
    expect(mapOrthostaticPayload(ev({ id: '' }))).toBeNull();
    expect(mapOrthostaticPayload(ev({ schemaVersion: 2 }))).toBeNull();
    expect(mapOrthostaticPayload(ev({ time: 'nope' }))).toBeNull();
    expect(mapOrthostaticPayload({ type: 'symptom' })).toBeNull();
  });
});
