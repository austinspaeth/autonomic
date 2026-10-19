/**
 * The day's imports, read back out of the journal: what the import pill's card
 * and Settings → Apple Health list, and what the pill names.
 */
import { importedRows, pillSummary, type LabelOf } from '../importLog';
import type { DayRecord, Entry } from '../../types';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const labels: LabelOf = (_kind, type) => ({ walk: 'Walk', magnesium: 'Magnesium', spo2: 'SpO2' } as Record<string, string>)[type] ?? type;
const e = (o: Partial<Entry> & { type: string; time: string }): Entry => ({ id: `${o.type}-${o.time}`, note: '', ...o } as Entry);

describe('importedRows', () => {
  it('lists only imported entries and an imported night, newest first by when they happened', () => {
    const rows = importedRows(day({
      sleep: { bed: '23:10', wake: '06:40', imported: true, stages: { deep: 60, rem: 90, core: 240, awake: 20 } },
      readings: [
        e({ type: 'hrv', time: '07:05', imported: true, healthKey: 'hrv-1', sdnn: '41', durationSec: 300 }),
        e({ type: 'restingHr', time: '09:00', hr: '58' }), // logged by hand
      ],
      activities: [e({ type: 'walk', time: '12:30', imported: true, healthKey: 'walk-1', duration: '32', avgHr: '104' })],
      meds: [e({ type: 'magnesium', time: '08:00', imported: true, healthKey: 'med-1', amount: '200' })],
    }), labels);
    expect(rows.map((r) => r.key)).toEqual(['walk-1', 'med-1', 'hrv-1', 'sleep']);
    expect(rows[0]).toMatchObject({ kind: 'workout', title: 'Walk · 32 min', noun: 'activity', removable: true });
    expect(rows[2]).toMatchObject({ title: 'HRV 41 ms', sub: '7:05am · 5 min', noun: 'HRV' });
    expect(rows[3]).toMatchObject({ kind: 'sleep', title: '6h 30m asleep', sub: '11:10pm to 6:40am', removable: false, noun: 'sleep' });
  });

  it('leaves out a night typed by hand, and one with only one end', () => {
    expect(importedRows(day({ sleep: { bed: '23:00', wake: '07:00' } }), labels)).toEqual([]);
    expect(importedRows(day({ sleep: { bed: '23:00', wake: '', imported: true } }), labels)).toEqual([]);
  });

  it('falls back to the bed-to-wake span across midnight when there are no stages', () => {
    const [r] = importedRows(day({ sleep: { bed: '22:30', wake: '06:00', imported: true, quality: 'interrupted' } }), labels);
    expect(r.title).toBe('7h 30m asleep');
    expect(r.sub).toBe('10:30pm to 6:00am · interrupted');
  });

  it('lists an imported entry with no health key but cannot remove it', () => {
    const [r] = importedRows(day({ readings: [e({ type: 'bp', time: '10:00', imported: true, sys: '118', dia: '76' })] }), labels);
    expect(r).toMatchObject({ title: '118/76', removable: false });
    expect(r.key).toBe('entry:bp-10:00');
  });

  it('keeps the poor-quality chip on a kept reading, and reads a missing grade as unknown', () => {
    const rows = importedRows(day({
      readings: [
        e({ type: 'hrv', time: '07:00', imported: true, healthKey: 'a', rmssd: '20', artifactPct: 24, confidence: 'low', beatCount: 300 }),
        e({ type: 'hrv', time: '08:00', imported: true, healthKey: 'b', rmssd: '30' }),
      ],
    }), labels);
    expect(rows.find((r) => r.key === 'a')?.poor).toBe(true);
    expect(rows.find((r) => r.key === 'b')?.poor).toBe(false);
  });

  it('uses the catalog label for a reading type it has no sentence for', () => {
    const [r] = importedRows(day({ readings: [e({ type: 'spo2', time: '10:00', imported: true, healthKey: 's' })] }), labels);
    expect(r).toMatchObject({ title: 'SpO2', noun: 'a reading' });
  });

  it('is empty for a day that does not exist', () => {
    expect(importedRows(undefined, labels)).toEqual([]);
  });
});

describe('pillSummary', () => {
  const rows = importedRows(day({
    sleep: { bed: '23:00', wake: '06:30', imported: true },
    readings: [e({ type: 'hrv', time: '07:00', imported: true, healthKey: 'hrv-1', sdnn: '40' })],
    activities: [e({ type: 'walk', time: '18:00', imported: true, healthKey: 'walk-old', duration: '20' })],
  }), labels);

  it('names the newest thing this check wrote and counts the rest of it', () => {
    expect(pillSummary(rows, new Set(['sleep', 'hrv-1']))).toMatchObject({ lead: { noun: 'HRV' }, more: 1 });
    expect(pillSummary(rows, new Set(['sleep']))).toMatchObject({ lead: { noun: 'sleep' }, more: 0 });
  });

  it('ignores imports from earlier checks, and anything deleted since', () => {
    expect(pillSummary(rows, new Set(['gone']))).toBeNull();
  });
});
