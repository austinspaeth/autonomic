import { hasStandTestDevice, nextRecommendation } from '../recommend';
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

describe('the stand-test todo', () => {
  const stand = (standTestAsked: boolean, canStandTest = true) => nextRecommendation({
    days: { [DK]: day([base]) }, dk: DK, nowMin: 9 * 60, signatureSource: 'default', learning: 1, heldDays: 30,
    hasHrSeries: true, canStandTest, standTestAsked, stepsGranted: true, spentShare: 0,
  });
  it('asks while it has never been tapped', () => {
    expect(stand(false)?.id).toBe('orthostatic');
  });
  it('moves on once the reader has tapped it, test taken or not', () => {
    expect(stand(true)?.id).not.toBe('orthostatic');
  });
  it('is never asked of somebody with no watch app or strap', () => {
    expect(stand(false, false)?.id).not.toBe('orthostatic');
  });
});

describe('hasStandTestDevice', () => {
  const days = (r: Partial<Entry>) => ({ [DK]: day([{ id: 'x', type: 'hrv', time: '07:00', ...r } as Entry]) });
  it('counts an HRV reading taken with the watch app or a strap', () => {
    expect(hasStandTestDevice(days({ source: 'watch' }))).toBe(true);
    expect(hasStandTestDevice(days({ source: 'polar' }))).toBe(true);
    expect(hasStandTestDevice(days({ type: 'breathHrv', source: 'polar' }))).toBe(true);
  });
  it('does not count the camera, a Health import, or a non-HRV reading', () => {
    expect(hasStandTestDevice(days({ source: 'camera' }))).toBe(false);
    expect(hasStandTestDevice(days({ source: 'watch', imported: true }))).toBe(false);
    expect(hasStandTestDevice(days({ type: 'restingHr', source: 'polar' }))).toBe(false);
  });
});
