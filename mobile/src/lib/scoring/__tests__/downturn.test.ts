/**
 * detectDownturn: a clear multi-day worsening trend must fire, quiet or
 * improving data must not, and the cause attribution must follow the journal
 * (triggers > exertion > sleep > protocol > unexplained/sickness).
 *
 * Score fixtures lean on the unstructured RMSSD bands: an 'hrv' reading with
 * only rmssd set makes the day score exactly its grade points
 * (40→100, 30→80, 25→60, 20→35, 15→10).
 */
import type { DayRecord, Entry } from '../../types';
import { addDays, todayKey } from '../../dates';
import { detectDownturn } from '../downturn';
import { DEFAULT_PROTOCOL } from '../day';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [],
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

const hrvR = (rmssd: number): Entry => ({ id: `r${rmssd}`, type: 'hrv', time: '08:00', rmssd: String(rmssd) });
const hrvDay = (rmssd: number, over: Partial<DayRecord> = {}) => day({ readings: [hrvR(rmssd)], ...over });

const DK = '2026-01-08';
const K = (n: number) => `2026-01-0${n}`; // Jan 1..8

/** Steep clean decline: 100 ×5, then 80 → 60 → 35 on the 8th. */
const steepDecline = (): Record<string, DayRecord> => ({
  [K(1)]: hrvDay(40), [K(2)]: hrvDay(40), [K(3)]: hrvDay(40),
  [K(4)]: hrvDay(40), [K(5)]: hrvDay(40),
  [K(6)]: hrvDay(30), [K(7)]: hrvDay(25), [K(8)]: hrvDay(20),
});

describe('detectDownturn — when it fires', () => {
  it('null with fewer than 4 scored days', () => {
    const days = { [K(6)]: hrvDay(40), [K(7)]: hrvDay(25), [K(8)]: hrvDay(20) };
    expect(detectDownturn(days, DK)).toBeNull();
  });

  it('null when today has no score', () => {
    const days = steepDecline();
    delete days[K(8)];
    expect(detectDownturn(days, DK)).toBeNull();
  });

  it('null on a stable week', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 8; i++) days[K(i)] = hrvDay(25); // 60 every day
    expect(detectDownturn(days, DK)).toBeNull();
  });

  it('null while today still scores comfortably (Excellent → Good is not a crash signal)', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= 6; i++) days[K(i)] = hrvDay(40); // 100
    days[K(7)] = hrvDay(30); // 80
    days[K(8)] = hrvDay(30); // 80
    expect(detectDownturn(days, DK)).toBeNull();
  });

  it('fires alert on a steep multi-day slide', () => {
    const w = detectDownturn(steepDecline(), DK)!;
    expect(w).not.toBeNull();
    expect(w.severity).toBe('alert');
    expect(w.drop).toBeGreaterThanOrEqual(25);
    expect(w.spanDays).toBeGreaterThanOrEqual(2);
  });

  it('fires watch on a milder sustained drop', () => {
    const days = {
      [K(5)]: hrvDay(30), [K(6)]: hrvDay(30), // 80, 80
      [K(7)]: hrvDay(25), [K(8)]: hrvDay(25), // 60, 60
    };
    const w = detectDownturn(days, DK)!;
    expect(w).not.toBeNull();
    expect(w.severity).toBe('watch');
  });

  it('handles gaps: unlogged days between scored days still trend', () => {
    const days = {
      [K(1)]: hrvDay(40), [K(3)]: hrvDay(40),
      [K(6)]: hrvDay(25), [K(8)]: hrvDay(20),
    };
    const w = detectDownturn(days, DK);
    expect(w).not.toBeNull();
  });
});

describe('detectDownturn — cause attribution', () => {
  it('clean logs → unexplained, warns of stress/sickness', () => {
    const w = detectDownturn(steepDecline(), DK)!;
    expect(w.cause).toBe('unexplained');
    expect(w.title).toBe('You may be crashing or getting sick');
    expect(w.body).toMatch(/signal illness before symptoms/);
    expect(w.body).toMatch(/Take it easy and rest/);
  });

  it('triggers logged in the slide window win the attribution', () => {
    const days = steepDecline();
    days[K(7)] = hrvDay(25, { food: { water: 0, calories: 0, meals: [], triggers: { alcohol: 2 } } });
    const w = detectDownturn(days, DK)!;
    expect(w.cause).toBe('triggers');
    expect(w.body).toMatch(/^2 triggers logged/);
  });

  it('heavy activity → exertion', () => {
    const days = steepDecline();
    days[K(6)] = hrvDay(30, { activities: [{ id: 'a', type: 'strenuousWork', time: '10:00' }] });
    const w = detectDownturn(days, DK)!;
    expect(w.cause).toBe('exertion');
  });

  it('short/interrupted sleep → sleep', () => {
    const days = steepDecline();
    days[K(7)] = hrvDay(25, { sleep: { bed: '', wake: '', quality: 'interrupted' } });
    days[K(8)] = hrvDay(20, { sleep: { bed: '', wake: '', quality: 'interrupted' } });
    const w = detectDownturn(days, DK)!;
    expect(w.cause).toBe('sleep');
  });

  it('tracked-but-short water on 2+ days → protocol slip', () => {
    const days = steepDecline();
    days[K(6)] = hrvDay(30, { food: { water: 1, calories: 0, meals: [], triggers: {} } });
    days[K(7)] = hrvDay(25, { food: { water: 1, calories: 0, meals: [], triggers: {} } });
    const w = detectDownturn(days, DK, {}, DEFAULT_PROTOCOL)!;
    expect(w.cause).toBe('protocol');
    expect(w.body).toMatch(/protocol slipped on 2/);
  });

  it('untracked water (0) is not a protocol slip', () => {
    const w = detectDownturn(steepDecline(), DK, {}, DEFAULT_PROTOCOL)!;
    expect(w.cause).toBe('unexplained');
  });
});

describe('detectDownturn — factors for the detail sheet', () => {
  it('clean logs → no factors', () => {
    expect(detectDownturn(steepDecline(), DK)!.factors).toEqual([]);
  });

  it('collects trigger types with counts, most frequent first', () => {
    const days = steepDecline();
    days[K(7)] = hrvDay(25, { food: { water: 0, calories: 0, meals: [], triggers: { alcohol: 1 } } });
    days[K(8)] = hrvDay(20, { food: { water: 0, calories: 0, meals: [], triggers: { alcohol: 1, caffeine: 3 } } });
    const f = detectDownturn(days, DK)!.factors;
    expect(f[0].value).toBe('3×'); // caffeine first
    expect(f[1].value).toBe('2×'); // alcohol summed across days
  });

  it('collects heavy activity and missed protocol items with day counts', () => {
    const days = steepDecline();
    days[K(6)] = hrvDay(30, {
      activities: [{ id: 'a', type: 'strenuousWork', time: '10:00' }],
      food: { water: 1, calories: 0, meals: [], triggers: {} },
    });
    days[K(7)] = hrvDay(25, { food: { water: 1, calories: 0, meals: [], triggers: {} } });
    const f = detectDownturn(days, DK, {}, DEFAULT_PROTOCOL)!.factors;
    expect(f.some((x) => x.label === 'Heavy activity' && x.value === '1 day')).toBe(true);
    expect(f.some((x) => /Water/.test(x.label) && x.value === '2 days')).toBe(true);
  });

  // The current day is still being lived: its water, sleep and meds simply
  // aren't entered yet, so nothing logged (or missing) today may be blamed.
  it('ignores the current day entirely when the anchor day is today', () => {
    const T = todayKey();
    const days: Record<string, DayRecord> = {};
    for (let i = 7; i >= 3; i--) days[addDays(T, -i)] = hrvDay(40); // 100
    days[addDays(T, -2)] = hrvDay(30); // 80
    days[addDays(T, -1)] = hrvDay(25); // 60
    days[T] = hrvDay(20, { // 35 — today, with a trigger and heavy activity logged
      activities: [{ id: 'a', type: 'strenuousWork', time: '10:00' }],
      food: { water: 1, calories: 0, meals: [], triggers: { alcohol: 2 } },
    });
    const w = detectDownturn(days, T, {}, DEFAULT_PROTOCOL)!;
    expect(w).not.toBeNull();
    expect(w.factors).toEqual([]);
    expect(w.cause).toBe('unexplained');
  });
});
