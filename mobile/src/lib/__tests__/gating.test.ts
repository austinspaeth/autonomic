import { canCaptureHrv, hrvCaptureUsedToday, HRV_FREE_PER_DAY } from '../gating';
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

  it('ignores health-imported HRV readings', () => {
    expect(hrvCaptureUsedToday(dayWith(
      reading('hrv', { imported: true, source: 'watch' }),
      reading('hrv', { imported: true, source: 'health' }),
    ))).toBe(0);
    expect(hrvCaptureUsedToday(dayWith(
      reading('hrv', { imported: true, source: 'watch' }),
      reading('hrv', { source: 'polar' }),
    ))).toBe(1);
  });
});

describe('canCaptureHrv', () => {
  it('caps free users at HRV_FREE_PER_DAY', () => {
    expect(canCaptureHrv('free', 0)).toBe(true);
    expect(canCaptureHrv('free', HRV_FREE_PER_DAY)).toBe(false);
    expect(canCaptureHrv('free', HRV_FREE_PER_DAY + 3)).toBe(false);
  });

  it('never caps trial or pro', () => {
    expect(canCaptureHrv('trial', 99)).toBe(true);
    expect(canCaptureHrv('pro', 99)).toBe(true);
  });
});
