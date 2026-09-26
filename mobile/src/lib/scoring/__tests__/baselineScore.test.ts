/**
 * Baseline and training HRV are two inputs to the day score, and the baseline
 * one is built from the FIRST reading of the day, graded half against the
 * user's own usual once there is one, which may only pull a grade DOWN.
 */
import type { DayRecord, Entry } from '../../types';
import { addDays } from '../../dates';
import { scoreSet } from '../day';
import { GRADE_PTS } from '../index';
import {
  PERSONAL_MIN_READINGS, baselineHistory, firstBaselineRmssd, personalBaselineCat, usualBaseline,
} from '../baseline';

const day = (readings: Entry[] = []): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings, activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
});

const DK = '2026-08-22';
let n = 0;
const base = (rmssd: number, time = '07:30', over: Partial<Entry> = {}): Entry =>
  ({ id: `b${++n}`, type: 'hrv', time, rmssd: String(rmssd), ...over });
const training = (over: Partial<Entry> = {}): Entry => ({
  id: `t${++n}`, type: 'breathHrv', time: '09:00', rmssd: '35',
  pnn50: '12', vlowPower: '150', lowPower: '1200', highPower: '2500', lfPeak: '0.095', hr: '58', ...over,
});

/** `k` earlier days each holding one baseline reading of `rmssd`. */
const history = (k: number, rmssd: number): Record<string, DayRecord> => {
  const days: Record<string, DayRecord> = {};
  for (let i = 1; i <= k; i++) days[addDays(DK, -i)] = day([base(rmssd)]);
  return days;
};

const scoreOn = (readings: Entry[], days: Record<string, DayRecord> = {}) => {
  const d = day(readings);
  return scoreSet(readings, d, DK, { ...days, [DK]: d });
};
const comp = (r: ReturnType<typeof scoreSet>, label: string) => r.comps.find((c) => c.label === label);

describe('the first baseline reading of the day dominates', () => {
  it('scores a lone baseline on its own grade', () => {
    // 20 ms grades 'bad' (35) on the baseline bands; no history, so no personal half.
    expect(comp(scoreOn([base(20)]), 'Baseline HRV')!.p).toBe(35);
  });

  it('gives later baseline readings a 30% say, never more', () => {
    // First 'great' (100), a later 'bad' (35).
    const both = comp(scoreOn([base(40, '07:30'), base(20, '15:00')]), 'Baseline HRV')!;
    expect(both.p).toBeCloseTo(0.7 * 100 + 0.3 * 35);
    expect(both.readings).toBe(2);
  });

  it('decides "first" by the clock, not by the order readings were logged', () => {
    const logged = [base(20, '15:00'), base(40, '07:30')];
    expect(comp(scoreOn(logged), 'Baseline HRV')!.p).toBeCloseTo(0.7 * 100 + 0.3 * 35);
  });

  it('quotes the first reading in the explain sheet', () => {
    const c = comp(scoreOn([base(40, '07:30'), base(20, '15:00')]), 'Baseline HRV')!;
    expect(c.detail.metrics[0].raw).toBe(40);
    expect(c.detail.note).toMatch(/first baseline reading of the day counts most/);
  });
});

describe('power stays with training', () => {
  it('a baseline-only day has no spectral components', () => {
    const r = scoreOn([base(30, '07:30', { pnn50: '12', vlowPower: '150', lowPower: '900', highPower: '900', lfPeak: '0.1' })]);
    const labels = r.comps.map((c) => c.label);
    expect(labels).toContain('Baseline HRV');
    ['Training HRV', 'Total power', 'pNN50', 'VLF power', 'LF peak'].forEach((l) => expect(labels).not.toContain(l));
  });

  it('a later training reading fills them without touching the baseline component', () => {
    const alone = comp(scoreOn([base(30)]), 'Baseline HRV')!.p;
    const r = scoreOn([base(30), training()]);
    expect(comp(r, 'Baseline HRV')!.p).toBe(alone);
    expect(r.comps.map((c) => c.label)).toEqual(expect.arrayContaining(['Training HRV', 'Total power', 'pNN50', 'VLF power', 'LF peak']));
  });
});

describe('the personal half', () => {
  it('grades a percent move against the usual', () => {
    expect(personalBaselineCat(22, 20)).toBe('great');   // +10%
    expect(personalBaselineCat(20, 20)).toBe('good');
    expect(personalBaselineCat(18, 20)).toBe('ok');      // -10%
    expect(personalBaselineCat(16, 20)).toBe('bad');     // -20%
    expect(personalBaselineCat(15, 20)).toBe('crash');   // -25%
  });

  it(`needs ${PERSONAL_MIN_READINGS} earlier days before it applies`, () => {
    // 18 ms is 'bad' (35) on the absolute bands.
    const thin = scoreOn([base(18)], history(PERSONAL_MIN_READINGS - 1, 18));
    expect(comp(thin, 'Baseline HRV')!.p).toBe(35);
    // At the bar, a morning well under its usual is pulled down halfway toward
    // its personal grade: 18 against 30 is -40%, 'crash'.
    const enough = scoreOn([base(18)], history(PERSONAL_MIN_READINGS, 30));
    expect(comp(enough, 'Baseline HRV')!.p).toBeCloseTo(0.5 * 35 + 0.5 * GRADE_PTS.crash);
    expect(comp(enough, 'Baseline HRV')!.detail.note).toMatch(/your own usual baseline of 30 ms/);
  });

  it('never lifts a bad stretch that has become the usual', () => {
    // Weeks at 18 ms: personally "right at usual", absolutely still 'bad'.
    const settled = scoreOn([base(18)], history(PERSONAL_MIN_READINGS + 10, 18));
    expect(comp(settled, 'Baseline HRV')!.p).toBe(35);
  });

  it('counts only the first baseline of each earlier day', () => {
    const days = history(6, 30);
    days[addDays(DK, -1)] = day([base(30, '07:00'), base(10, '16:00')]);
    expect(baselineHistory(days, DK)).toEqual([30, 30, 30, 30, 30, 30]);
    expect(usualBaseline(days, DK)!.median).toBe(30);
  });

  it('ignores untrusted imports and readings with no RMSSD', () => {
    const d = day([
      base(50, '06:00', { imported: true, durationSec: 60 }),
      { id: 'x', type: 'hrv', time: '06:30' },
      base(24, '07:00'),
    ]);
    expect(firstBaselineRmssd(d)).toBe(24);
  });
});

describe('resting heart rate falls back to the baseline reading', () => {
  it('prefers the first baseline average over the paced training heart rate', () => {
    const r = scoreOn([base(30, '07:00', { avgHr: '90' }), training({ hr: '55' })]);
    const rhr = comp(r, 'Resting HR')!;
    expect(rhr.detail.metrics[0].raw).toBe(90);
    expect(rhr.detail.metrics[0].label).toMatch(/baseline/);
  });
});
