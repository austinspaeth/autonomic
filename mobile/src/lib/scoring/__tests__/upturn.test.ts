/**
 * detectUpturn: a day clearly above the user's own recent baseline fires; flat
 * or falling data doesn't; and a day that improved but still scores Bad/Crash
 * never counts, however big the gain.
 *
 * Same fixtures as downturn.test: an 'hrv' reading with only rmssd set makes
 * the day score exactly its grade points (40→100, 30→80, 25→60, 20→35, 15→10).
 */
import type { DayRecord, Entry } from '../../types';
import { detectUpturn } from '../upturn';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

const hrvR = (rmssd: number): Entry => ({ id: `r${rmssd}`, type: 'hrv', time: '08:00', rmssd: String(rmssd) });
const hrvDay = (rmssd: number) => day({ readings: [hrvR(rmssd)] });

const DK = '2026-01-08';
const K = (n: number) => `2026-01-0${n}`;

/** Rough start, then a real climb: 10 ×5, 35, 60, 80 today. */
const climb = (): Record<string, DayRecord> => ({
  [K(1)]: hrvDay(15), [K(2)]: hrvDay(15), [K(3)]: hrvDay(15),
  [K(4)]: hrvDay(15), [K(5)]: hrvDay(15),
  [K(6)]: hrvDay(20), [K(7)]: hrvDay(25), [K(8)]: hrvDay(30),
});

describe('detectUpturn', () => {
  it('fires on a multi-day climb and reports the gain', () => {
    const up = detectUpturn(climb(), DK)!;
    expect(up).not.toBeNull();
    expect(up.score).toBe(80);
    expect(up.gain).toBeGreaterThanOrEqual(12);
    expect(up.rising).toBeGreaterThanOrEqual(2);
    expect(up.spanDays).toBeGreaterThanOrEqual(2);
  });

  it('fires on a single day well clear of the baseline', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 7; i++) days[K(i)] = hrvDay(25); // 60
    days[K(8)] = hrvDay(40);                              // 100
    expect(detectUpturn(days, DK)).not.toBeNull();
  });

  it('null on a flat week', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 8; i++) days[K(i)] = hrvDay(25);
    expect(detectUpturn(days, DK)).toBeNull();
  });

  it('null while the trend is down', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 5; i++) days[K(i)] = hrvDay(40);
    days[K(6)] = hrvDay(30); days[K(7)] = hrvDay(25); days[K(8)] = hrvDay(20);
    expect(detectUpturn(days, DK)).toBeNull();
  });

  it('never fires on a day that still scores Bad, however big the improvement', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 7; i++) days[K(i)] = hrvDay(15); // 10 — crash days
    days[K(8)] = hrvDay(20);                              // 35 — much better, still Bad
    expect(detectUpturn(days, DK)).toBeNull();
  });

  it('null with fewer than 4 scored days', () => {
    const days = { [K(6)]: hrvDay(15), [K(7)]: hrvDay(25), [K(8)]: hrvDay(30) };
    expect(detectUpturn(days, DK)).toBeNull();
  });

  it('null when today has no score', () => {
    const days = climb();
    delete days[K(8)];
    expect(detectUpturn(days, DK)).toBeNull();
  });
});
