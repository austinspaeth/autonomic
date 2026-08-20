/**
 * shouldAskForReview: the review prompt only goes out after real use, on a day
 * trending up, and never on a bad day or a day we've already spent an ask on.
 *
 * Fixtures match the scoring tests: an 'hrv' reading with only rmssd set makes
 * the day score exactly its grade points (40→100, 30→80, 25→60, 20→35, 15→10).
 */
import type { DayRecord, Entry } from '../../types';
import { engagedDayCount, shouldAskForReview, MIN_DAYS_BETWEEN_ASKS } from '../eligibility';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

const hrvR = (rmssd: number, over: Partial<Entry> = {}): Entry =>
  ({ id: `r${rmssd}`, type: 'hrv', time: '08:00', rmssd: String(rmssd), ...over });
const hrvDay = (rmssd: number) => day({ readings: [hrvR(rmssd)] });

const DK = '2026-01-08';
const K = (n: number) => `2026-01-0${n}`;
const NOW = Date.UTC(2026, 0, 8, 18, 0, 0);
const DAY_MS = 86400000;

/** A week that climbs into today (see upturn.test). */
const climb = (): Record<string, DayRecord> => ({
  [K(1)]: hrvDay(15), [K(2)]: hrvDay(15), [K(3)]: hrvDay(15),
  [K(4)]: hrvDay(15), [K(5)]: hrvDay(15),
  [K(6)]: hrvDay(20), [K(7)]: hrvDay(25), [K(8)]: hrvDay(30),
});

const ask = (over: Partial<Parameters<typeof shouldAskForReview>[0]> = {}) =>
  shouldAskForReview({
    days: climb(), dk: DK, memory: {}, appVersion: '1.20.0', nowMs: NOW, ...over,
  });

describe('engagedDayCount', () => {
  it('counts days the user put something into', () => {
    const days = {
      [K(1)]: hrvDay(25),
      [K(2)]: day({ food: { water: 1.5, calories: 0, triggers: {}, meals: [] } }),
      [K(3)]: day({ notes: 'rough morning' }),
      [K(4)]: day(),                                    // empty
    };
    expect(engagedDayCount(days)).toBe(3);
  });

  it('ignores imported entries — a year of Health history is not a year of use', () => {
    const days = {
      [K(1)]: day({ readings: [hrvR(25, { imported: true })] }),
      [K(2)]: day({ readings: [hrvR(30, { imported: true })] }),
      [K(3)]: hrvDay(25),
    };
    expect(engagedDayCount(days)).toBe(1);
  });
});

describe('shouldAskForReview', () => {
  it('asks on a day trending up after enough real use', () => {
    const v = ask();
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.upturn.score).toBe(80);
  });

  it('holds off until the user has logged four days', () => {
    const days = { [K(6)]: hrvDay(20), [K(7)]: hrvDay(25), [K(8)]: hrvDay(30) };
    expect(ask({ days })).toEqual({ ok: false, reason: 'too-few-days' });
  });

  it('never asks on a flat or falling week', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 8; i++) days[K(i)] = hrvDay(25);
    expect(ask({ days })).toEqual({ ok: false, reason: 'no-upturn' });
  });

  it('never asks on the day the crash warning fired', () => {
    expect(ask({ crashAlertFiredToday: true })).toEqual({ ok: false, reason: 'crash-alert-today' });
  });

  it('never asks in a session where the paywall came up', () => {
    expect(ask({ paywallSeenThisSession: true })).toEqual({ ok: false, reason: 'paywall-this-session' });
  });

  it('never asks twice on the same app version', () => {
    expect(ask({ memory: { askedVersion: '1.20.0' } })).toEqual({ ok: false, reason: 'asked-this-version' });
  });

  it('leaves a long gap between asks even across versions', () => {
    const recent = { lastAskedAtMs: NOW - 30 * DAY_MS, askedVersion: '1.19.0' };
    expect(ask({ memory: recent })).toEqual({ ok: false, reason: 'asked-recently' });
    const old = { lastAskedAtMs: NOW - (MIN_DAYS_BETWEEN_ASKS + 1) * DAY_MS, askedVersion: '1.19.0' };
    expect(ask({ memory: old }).ok).toBe(true);
  });

  it('a downturn beats an upturn — the slide wins', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 5; i++) days[K(i)] = hrvDay(40);
    days[K(6)] = hrvDay(30); days[K(7)] = hrvDay(25); days[K(8)] = hrvDay(20);
    const v = ask({ days });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(['downturn', 'no-upturn']).toContain(v.reason);
  });
});
