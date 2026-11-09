import { hrvNorm, isNormMetric, normMedian, NORM_MAX_AGE, NORM_MIN_AGE } from '../hrvNorms';

const pick = (n: { typical: number; low: number; high: number }) => ({ typical: n.typical, low: n.low, high: n.high });

describe('hrvNorm (Voss et al. 2015, supplement S1)', () => {
  it('reads the published decade for the given sex', () => {
    // Men 35-44: RMSSD 28.7 [20.9-39.0]
    expect(hrvNorm('rmssd', 38, 'Male')).toEqual({ label: 'Healthy 38 year old men', typical: 29, low: 21, high: 39 });
    // Women 45-54: SDNN 35.5 [26.5-44.5]
    expect(hrvNorm('sdnn', 50, 'Female')).toEqual({ label: 'Healthy 50 year old women', typical: 36, low: 27, high: 45 });
  });

  it('uses the middle half, not mean ± SD, so pNN50 has a real lower edge', () => {
    // Men 35-44: 6.8 [1.9-18.8]. Mean ± SD (13 ± 15) printed "0-28%".
    expect(hrvNorm('pnn50', 36, 'Male')).toMatchObject({ typical: 7, low: 2, high: 19 });
    // Women 25-34: 18.3 [4.9-40.3]
    expect(hrvNorm('pnn50', 30, 'Female')).toMatchObject({ low: 5, high: 40 });
  });

  it('averages the sexes when sex is unset or Other', () => {
    const n = hrvNorm('rmssd', 30, '')!;
    expect(n.label).toBe('Healthy adults age 30');
    expect(n).toMatchObject({ typical: Math.round((38.4 + 36.2) / 2), low: Math.round((26.1 + 26.2) / 2), high: Math.round((54.5 + 48.5) / 2) });
    expect(hrvNorm('rmssd', 30, 'Other')).toEqual(n);
  });

  it('names the user\'s own age, and 18-24 borrow the 25-34 decade', () => {
    expect(hrvNorm('sdnn', 20, 'Female')).toMatchObject({ label: 'Healthy 20 year old women', ...pick(hrvNorm('sdnn', 25, 'Female')!) });
  });

  // The cap used to be 54, because the healthy median itself graded red on the
  // app's absolute bands. The baseline band is recentered on this same table
  // now, so the card speaks for every decade the study covers and stops where
  // the DATA stops.
  it('covers the whole study and stops at its top decade', () => {
    expect(hrvNorm('rmssd', 60, 'Female')).not.toBeNull();
    expect(hrvNorm('rmssd', 70, 'Female')).not.toBeNull();
    expect(hrvNorm('sdnn', NORM_MAX_AGE, 'Male')).not.toBeNull();
    expect(hrvNorm('sdnn', NORM_MAX_AGE + 1, 'Male')).toBeNull();
  });

  // normMedian is the RATIO's source and so has no upper cap: the display card
  // may decline to speak past the study, a grade may not.
  it('normMedian is raw, uncapped above, and null below the minimum age', () => {
    expect(normMedian('rmssd', 38, 'Female')).toBe(30.5);
    expect(normMedian('rmssd', 58, 'Female')).toBe(18.9);
    // Past the top decade it borrows 65-74, as 18-24 borrows 25-34.
    expect(normMedian('rmssd', 90, 'Female')).toBe(normMedian('rmssd', 70, 'Female'));
    expect(normMedian('rmssd', 20, 'Female')).toBe(normMedian('rmssd', 30, 'Female'));
    // No sex: the two sexes averaged, unrounded.
    expect(normMedian('rmssd', 38, '')).toBeCloseTo((30.5 + 28.7) / 2, 10);
    expect(normMedian('rmssd', NORM_MIN_AGE - 1, 'Female')).toBeNull();
    expect(normMedian('rmssd', null, 'Female')).toBeNull();
  });

  it('shows nothing without an age or for a minor', () => {
    expect(hrvNorm('sdnn', null, 'Male')).toBeNull();
    expect(hrvNorm('sdnn', NORM_MIN_AGE - 1, 'Male')).toBeNull();
    expect(hrvNorm('sdnn', NORM_MIN_AGE, 'Male')).not.toBeNull();
  });

  it('knows which metrics it covers', () => {
    expect(['sdnn', 'rmssd', 'pnn50'].every(isNormMetric)).toBe(true);
    expect(isNormMetric('avgHr')).toBe(false);
  });
});
