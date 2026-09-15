import { HR_FULL_COVERAGE, HR_MIN_COVERAGE } from '../burn';
import { coverageFactor } from '../envelope';

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
