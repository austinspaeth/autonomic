import { HR_FULL_COVERAGE, HR_MIN_COVERAGE } from '../burn';
import { buildEnvelope, coverageFactor } from '../envelope';
import { addDays } from '../../dates';
import type { DayRecord, Entry } from '../../types';

describe('coverage moves confidence as a ramp, not a cliff', () => {
  it('is continuous where it used to step', () => {
    // A day holding 119 minutes of heart rate was weighted 0.6 and one holding
    // 121 was weighted 0.9, and which side a day landed on came down to
    // whether the watch was on the charger over lunch.
    const below = coverageFactor('logged-only', HR_MIN_COVERAGE - 1);
    const above = coverageFactor('partial', HR_MIN_COVERAGE + 1);
    expect(Math.abs(above - below)).toBeLessThan(0.01);
  });

  it('rises with coverage and never overtakes the class above', () => {
    const steps = [0, 30, 60, 119, 121, 300, 599, 601, 900];
    const vals = steps.map((c) => coverageFactor(c < HR_MIN_COVERAGE ? 'logged-only' : c < HR_FULL_COVERAGE ? 'partial' : 'full', c));
    vals.forEach((v, i) => { if (i) expect(v).toBeGreaterThanOrEqual(vals[i - 1]); });
    expect(vals[vals.length - 1]).toBe(1);
  });

  it('leaves a day with no series read exactly where it was', () => {
    // Nothing to ramp along, and the word is the whole of what we know.
    expect(coverageFactor('none', null)).toBe(0.4);
    expect(coverageFactor('logged-only', null)).toBe(0.6);
  });

  it('never lifts a day that has no steps and nothing logged', () => {
    // 'none' is a day where a heart-rate series is not what was missing.
    expect(coverageFactor('none', 500)).toBe(0.4);
  });
});

/* ---------- the HRV input is the baseline reading ---------- */


describe('the HRV input', () => {
  const DK = '2026-08-22';
  let n = 0;
  const day = (readings: Entry[]): DayRecord => ({
    sleep: { bed: '', wake: '' }, readings, activities: [], meds: [], symptoms: [],
    food: { water: 0, calories: 0, meals: [], triggers: {} }, digestion: { movements: [] },
  } as DayRecord);
  const base = (rmssd: number, time = '07:30'): Entry => ({ id: `b${++n}`, type: 'hrv', time, rmssd: String(rmssd) } as Entry);
  const train = (rmssd: number, time = '09:00'): Entry => ({ id: `t${++n}`, type: 'breathHrv', time, rmssd: String(rmssd) } as Entry);
  const hist = (k: number, readings: () => Entry[]) => {
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i <= k; i++) days[addDays(DK, -i)] = day(readings());
    return days;
  };
  const hrvInput = (today: Entry[], days: Record<string, DayRecord>) => buildEnvelope({
    days: { ...days, [DK]: day(today) }, dk: DK, ctx: {}, addDays, types: {}, lineBpm: null,
    downturn: false, strain: null, coverage: 'none',
  }).inputs.find((i) => i.id === 'hrv')!;

  it("reads today's FIRST baseline against each earlier day's first, as a percent", () => {
    const i = hrvInput([base(18, '07:00'), base(30, '15:00')], hist(10, () => [base(20)]));
    expect(i.label).toBe('Baseline HRV');
    expect(i.value).toBe('18');
    // 10% below usual costs a 10% step.
    expect(i.factor).toBeCloseTo(0.9);
  });

  it('is the same percent for a high-HRV and a low-HRV person', () => {
    const low = hrvInput([base(18)], hist(10, () => [base(20)]));
    const high = hrvInput([base(54)], hist(10, () => [base(60)]));
    expect(low.factor).toBeCloseTo(high.factor);
  });

  it('is not moved by a later training reading', () => {
    const days = hist(10, () => [base(20), train(40)]);
    const alone = hrvInput([base(18)], days);
    const withTraining = hrvInput([base(18), train(10, '18:00')], days);
    expect(withTraining.factor).toBe(alone.factor);
    expect(withTraining.label).toBe('Baseline HRV');
  });

  it('may reach 0.6 on its own, below the other inputs\' 0.7 floor', () => {
    const i = hrvInput([base(8)], hist(10, () => [base(40)]));
    expect(i.factor).toBe(0.6);
  });

  it('falls back to the training component when there is no baseline to compare', () => {
    const days = hist(10, () => [train(30)]);
    const i = hrvInput([train(22)], days);
    expect(i.label).toBe('Training HRV');
    expect(i.known).toBe(true);
    expect(i.factor).toBeCloseTo(0.9); // 8 ms below, on the ms scale
  });

  it('says it is learning, not that nothing was logged, when history is thin', () => {
    const i = hrvInput([base(20)], hist(2, () => [base(20)]));
    expect(i.known).toBe(false);
    expect(i.value).toBe('20');
    expect(i.vs).toBe('Learning your usual');
    expect(i.factor).toBe(1);
  });
});
