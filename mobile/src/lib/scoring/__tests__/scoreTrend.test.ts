/**
 * scoreTrend: the readout under the Outlook gauge's number.
 *
 * Same fixtures as downturn/upturn — an 'hrv' reading with only rmssd set makes
 * the day score exactly its grade points (40→100, 30→80, 25→60, 20→35, 15→10).
 */
import type { DayRecord, Entry } from '../../types';
import { addDays } from '../../dates';
import { LEVEL_DELTA, MIN_WINDOW_DAYS, TREND_LOOKBACK, scoreTrend } from '../scoreTrend';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});
const hrvR = (rmssd: number): Entry => ({ id: `r${rmssd}`, type: 'hrv', time: '08:00', rmssd: String(rmssd) });
const hrvDay = (rmssd: number) => day({ readings: [hrvR(rmssd)] });

const DK = '2026-03-20';
/** rmssd per day, oldest first, the last entry landing on DK itself. */
const journal = (vals: (number | null)[]): Record<string, DayRecord> => {
  const days: Record<string, DayRecord> = {};
  vals.forEach((v, i) => { if (v != null) days[addDays(DK, -(vals.length - 1 - i))] = hrvDay(v); });
  return days;
};

const run = (vals: (number | null)[]) => scoreTrend(journal(vals), DK, {}, addDays);

describe('scoreTrend', () => {
  it('is null with nothing logged before today', () => {
    expect(run([30])).toBeNull();
  });

  it('compares today against the 7-day median', () => {
    // 60, 60, 60, 60 behind an 80 today.
    const t = run([25, 25, 25, 25, 30])!;
    expect(t.windowDays).toBe(7);
    expect(t.delta).toBe(20);
    expect(t.direction).toBe('up');
    expect(t.windowN).toBe(4);
  });

  it('reports a decline as readily as a rise', () => {
    const t = run([30, 30, 30, 30, 25])!;
    expect(t.delta).toBe(-20);
    expect(t.direction).toBe('down');
  });

  it('is level inside the noise floor', () => {
    // 35, 35, 35, 35 behind a 35 today.
    const t = run([20, 20, 20, 20, 20])!;
    expect(t.delta).toBe(0);
    expect(t.direction).toBe('level');
    expect(LEVEL_DELTA).toBe(3);
  });

  // One artifact day must not be able to invent a move.
  it('uses the median, so one outlier day cannot carry the window', () => {
    const t = run([25, 25, 25, 25, 40, 25])!;
    expect(t.delta).toBe(0); // median of 60,60,60,60,100 is 60
  });

  it('falls back to 14 days when the last 7 are too thin', () => {
    const vals: (number | null)[] = new Array(TREND_LOOKBACK).fill(null);
    [0, 1, 2, 3].forEach((i) => { vals[i] = 25; }); // 11-14 days back
    vals[TREND_LOOKBACK - 1] = 30;                     // today
    const t = run(vals)!;
    expect(t.windowDays).toBe(14);
    expect(t.delta).toBe(20);
  });

  it('says nothing at all when no window has the coverage', () => {
    const vals: (number | null)[] = new Array(TREND_LOOKBACK).fill(null);
    vals[TREND_LOOKBACK - 2] = 25;
    vals[TREND_LOOKBACK - 1] = 30;
    const t = run(vals)!;
    expect(t.delta).toBeNull();
    expect(t.direction).toBeNull();
    expect(t.windowDays).toBeNull();
    expect(MIN_WINDOW_DAYS).toBe(4);
    expect(TREND_LOOKBACK).toBe(14);
  });

  it('has no delta on an unscored today', () => {
    const days = journal([25, 25, 25, 25, 25]);
    delete days[DK];
    expect(scoreTrend(days, DK, {}, addDays)!.delta).toBeNull();
  });

  // The window is fixed by coverage, never chosen for the number it produces:
  // a 7-day window with the coverage wins even when 14 days would flatter.
  it('does not shop for the flattering window', () => {
    const vals: (number | null)[] = [10, 10, 10, 10, 10, 10, 25, 25, 25, 25, 25, 25, 25, 25];
    const t = run(vals.map((v) => v))!;
    expect(t.windowDays).toBe(7);
    expect(t.delta).toBe(0); // flat against the last week, though the fortnight rose
  });
});
