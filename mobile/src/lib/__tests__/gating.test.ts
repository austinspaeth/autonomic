import { hrvCaptureUsedToday } from '../gating';
import { blankDay } from '../migrate';
import type { DayRecord, Entry } from '../types';

const reading = (type: string, extra: Partial<Entry> = {}): Entry =>
  ({ id: Math.random().toString(36).slice(2), type, ...extra });

const dayWith = (...readings: Entry[]): DayRecord => {
  const d = blankDay();
  d.readings = readings;
  return d;
};

describe('hrvCaptureUsedToday', () => {
  it('is 0 for a missing or empty day', () => {
    expect(hrvCaptureUsedToday(undefined)).toBe(0);
    expect(hrvCaptureUsedToday(null)).toBe(0);
    expect(hrvCaptureUsedToday(blankDay())).toBe(0);
  });

  it('counts only live HRV types', () => {
    expect(hrvCaptureUsedToday(dayWith(
      reading('hrv'),
      reading('breathHrv'),
      reading('bp'),
      reading('restingHr'),
      reading('standTest'),
    ))).toBe(2);
  });

  it('counts an imported reading only when it is a real session', () => {
    // No RR coverage (an SDNN-only sample) or a one-minute background sample.
    expect(hrvCaptureUsedToday(dayWith(
      reading('hrv', { imported: true, source: 'watch' }),
      reading('hrv', { imported: true, source: 'watch', durationSec: 60 }),
      reading('hrv', { imported: true, source: 'health' }),
    ))).toBe(0);
    // A five-minute Mindfulness session taken with the app closed.
    expect(hrvCaptureUsedToday(dayWith(
      reading('hrv', { imported: true, source: 'watch', durationSec: 280 }),
      reading('hrv', { source: 'polar' }),
    ))).toBe(2);
  });
});

// There is no canCaptureHrv any more: live HRV capture is unlimited on every
// tier. `hrvCaptureUsedToday` stays because the clean-day protocol counts a
// reading with it (scoring/day.ts), not because anything is metered.
