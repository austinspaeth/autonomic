/**
 * An HRV reading's card wears the grade the day score takes from it.
 */
import type { DayRecord, Entry } from '../../types';
import { addDays } from '../../dates';
import { scoreSet } from '../day';
import { catFromPts, entryDayKey, readingGrade } from '../readingGrade';

const day = (readings: Entry[] = []): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings, activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
});
const DK = '2026-08-22';
let n = 0;
const base = (rmssd: number): Entry => ({ id: `b${++n}`, type: 'hrv', time: '07:30', rmssd: String(rmssd) });
const train = (rmssd: number): Entry => ({ id: `t${++n}`, type: 'breathHrv', time: '09:00', rmssd: String(rmssd) });
const history = (k: number, make: () => Entry) => {
  const days: Record<string, DayRecord> = {};
  for (let i = 1; i <= k; i++) days[addDays(DK, -i)] = day([make()]);
  return days;
};

describe('readingGrade', () => {
  it('matches the Baseline HRV component the day score uses, personal pull included', () => {
    for (const v of [15, 20, 25, 30, 34, 40, 50]) {
      const days = history(6, () => base(45));
      const r = base(v);
      days[DK] = day([r]);
      const comp = scoreSet([r], days[DK], DK, days).comps.find((c) => c.label === 'Baseline HRV')!;
      expect(readingGrade(r, days, DK).cat).toBe(catFromPts(comp.p));
    }
  });

  it('a baseline above its usual is not lifted past the absolute grade', () => {
    const days = history(6, () => base(15));
    const r = base(25); // ok on the absolute bands, far above usual
    days[DK] = day([r]);
    expect(readingGrade(r, days, DK).cat).toBe('ok');
  });

  it('grades training on the paced bands, with no personal pull', () => {
    const days = history(6, () => train(60));
    const r = train(33);
    days[DK] = day([r]);
    expect(readingGrade(r, days, DK)).toEqual({ kind: 'training', counts: true, cat: 'great' });
  });

  it('finds the day an entry lives on', () => {
    const r = base(30);
    expect(entryDayKey({ [DK]: day([r]) }, String(r.id))).toBe(DK);
    expect(entryDayKey({}, 'x')).toBeNull();
  });
});
