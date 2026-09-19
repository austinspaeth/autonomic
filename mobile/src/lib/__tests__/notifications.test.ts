import { computeHrv } from '../hrv';
import {
  MORNING_AHEAD, PRESSURE_FROM_HOUR, PRESSURE_UNTIL_HOUR,
  morningFireTimes, pressureAlertVerdict, readingDoneCopy, type PressureAlertInput,
} from '../notifications';
import type { HrvResult } from '../hrv';

/** A steady, gently varying series: five minutes at ~60 bpm. */
function cleanRr(n = 300): number[] {
  return Array.from({ length: n }, (_, i) => 1000 + 40 * Math.sin(i / 3));
}

describe('readingDoneCopy', () => {
  it('names the reading\'s own numbers when it was filed', () => {
    const r = computeHrv(cleanRr(), { source: 'polar', durationSec: 300 });
    expect(r.ok).toBe(true);
    const c = readingDoneCopy(r);
    expect(c.title).toBe('Reading complete');
    expect(c.body).toMatch(/^RMSSD \d+ ms, heart rate \d+ bpm\. It is in your journal\.$/);
    expect(c.body).not.toMatch(/save it/i);
  });

  it('asks for a decision on a refused-but-salvageable reading, with its artifact rate', () => {
    const r = { ok: false, salvageable: true, artifactPct: 21.6, fields: {} } as unknown as HrvResult;
    const c = readingDoneCopy(r);
    expect(c.title).toMatch(/decision/);
    expect(c.body).toContain('22% artifacts');
  });

  it('never calls an unusable reading complete', () => {
    const r = { ok: false, salvageable: false, artifactPct: 0, fields: {} } as unknown as HrvResult;
    expect(readingDoneCopy(r).title).not.toMatch(/complete/i);
  });

  it('points a wrist reading at the watch it is still on', () => {
    expect(readingDoneCopy(null, 'Garmin').body).toContain('Garmin');
  });

  it('carries no em dashes', () => {
    const r = computeHrv(cleanRr(), { source: 'polar', durationSec: 300 });
    for (const c of [readingDoneCopy(r), readingDoneCopy(null)]) {
      expect(c.title + c.body).not.toContain('—');
    }
  });
});

describe('morningFireTimes', () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 19, h, m);

  it('arms a week of mornings, today included while it is still ahead', () => {
    const t = morningFireTimes(at(6), '08:00', false);
    expect(t).toHaveLength(MORNING_AHEAD);
    expect(t[0]).toEqual(new Date(2026, 8, 19, 8, 0));
    expect(t[6]).toEqual(new Date(2026, 8, 25, 8, 0));
  });

  it('skips today once today holds a reading', () => {
    const t = morningFireTimes(at(6), '08:00', true);
    expect(t[0]).toEqual(new Date(2026, 8, 20, 8, 0));
    expect(t).toHaveLength(MORNING_AHEAD);
  });

  it('skips today once its time has passed', () => {
    expect(morningFireTimes(at(9), '08:00', false)[0]).toEqual(new Date(2026, 8, 20, 8, 0));
    expect(morningFireTimes(at(8), '08:00', false)[0]).toEqual(new Date(2026, 8, 20, 8, 0));
  });

  it('crosses a month end', () => {
    const t = morningFireTimes(new Date(2026, 8, 29, 9), '07:30', false);
    expect(t[1]).toEqual(new Date(2026, 9, 1, 7, 30));
  });
});

describe('pressureAlertVerdict', () => {
  const base: PressureAlertInput = {
    enabled: undefined, lastFired: undefined, dk: '2026-09-19', hour: 9,
    low: true, linked: true, otherWarning: false,
  };

  it('fires on a low day with a found link, undefined reading as on', () => {
    expect(pressureAlertVerdict(base)).toBe('fire');
  });

  it('says nothing without a link, however low the day', () => {
    expect(pressureAlertVerdict({ ...base, linked: false })).toBe('quiet');
  });

  it('is quiet on an ordinary day, when switched off, or once fired today', () => {
    expect(pressureAlertVerdict({ ...base, low: false })).toBe('quiet');
    expect(pressureAlertVerdict({ ...base, enabled: false })).toBe('quiet');
    expect(pressureAlertVerdict({ ...base, lastFired: '2026-09-19' })).toBe('quiet');
    expect(pressureAlertVerdict({ ...base, lastFired: '2026-09-18' })).toBe('fire');
  });

  it('gives way to any other warning: one warning a day', () => {
    expect(pressureAlertVerdict({ ...base, otherWarning: true })).toBe('quiet');
  });

  it('keeps to waking hours', () => {
    expect(pressureAlertVerdict({ ...base, hour: PRESSURE_FROM_HOUR - 1 })).toBe('quiet');
    expect(pressureAlertVerdict({ ...base, hour: PRESSURE_UNTIL_HOUR })).toBe('quiet');
    expect(pressureAlertVerdict({ ...base, hour: PRESSURE_UNTIL_HOUR - 1 })).toBe('fire');
  });
});
