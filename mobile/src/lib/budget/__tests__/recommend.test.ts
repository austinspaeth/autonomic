import { nextRecommendation } from '../recommend';
import type { DayRecord, Entry } from '../../types';

const DK = '2026-08-22';
const day = (readings: Entry[]): DayRecord => ({
  sleep: { bed: '23:00', wake: '07:00' }, readings, activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, meals: [], triggers: {} }, digestion: { movements: [] },
} as DayRecord);
const rec = (readings: Entry[], nowMin: number) => nextRecommendation({
  days: { [DK]: day(readings) }, dk: DK, nowMin, signatureSource: null, learning: 1, heldDays: 30, hasHrSeries: false, stepsGranted: true, spentShare: 0,
} as unknown as Parameters<typeof nextRecommendation>[0]);
const base: Entry = { id: 'b', type: 'hrv', time: '07:30', rmssd: '30' };
const train: Entry = { id: 't', type: 'breathHrv', time: '08:00', rmssd: '30' };

describe('the HRV todo asks for the baseline', () => {
  it('asks for a baseline reading on an empty day', () => {
    expect(rec([], 9 * 60)).toEqual({ id: 'hrv', title: 'Todo: Take a baseline HRV reading', actionable: true });
  });
  it('still asks before 1pm when only a training reading exists', () => {
    expect(rec([train], 10 * 60)?.id).toBe('hrv');
  });
  it('lets a training reading quiet it after 1pm', () => {
    expect(rec([train], 14 * 60)?.id).not.toBe('hrv');
  });
  it('is satisfied by a baseline reading', () => {
    expect(rec([base], 9 * 60)?.id).not.toBe('hrv');
  });
});
