/**
 * The baseline RMSSD band, recentered on age and sex (`rmssdBaselineEdges`).
 *
 * The property everything else rests on is the FIRST test: at the reference
 * decade the factor is exactly 1, so the recentering reproduces the ladder that
 * shipped. This is a recentering of the existing product, not a new scale.
 */
import { todayKey, addDays } from '../../dates';
import type { DayRecord, Entry } from '../../types';
import {
  RMSSD_U_EDGES, bandsFor, catFromBands, computeScores, profileCtx,
  rmssdBaselineEdges, rmssdBaselineScale, sRMSSDu,
} from '../index';
import { scoreSet } from '../day';
import { readingGrade } from '../readingGrade';

/** A birthday that makes someone exactly `age` today. */
const bdayFor = (age: number) => {
  const [y, m, d] = todayKey().split('-').map(Number);
  return `${y - age}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const ctxFor = (age: number | null, sex = '') =>
  profileCtx({ sex, birthday: age == null ? '' : bdayFor(age) });

const day = (readings: Entry[]): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings,
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
} as unknown as DayRecord);

describe('the reference decade is the identity', () => {
  // 35-44 for a man, for a woman, and sex-averaged: the factor is 1 and the
  // edges come back as the integers in the source. Measured, not asserted
  // approximately — a drift here means the ratio is being taken from rounded
  // medians, which is the one mistake this design cannot absorb.
  it.each([['Male'], ['Female'], [''], ['Other']])('35-44 %s reproduces 34/27/22/17', (sex) => {
    expect(rmssdBaselineScale(ctxFor(40, sex))).toBe(1);
    expect(rmssdBaselineEdges(ctxFor(40, sex))).toEqual([34, 27, 22, 17]);
  });

  it('holds across the whole reference decade', () => {
    [35, 38, 44].forEach((age) => {
      expect(rmssdBaselineEdges(ctxFor(age, 'Female'))).toEqual([...RMSSD_U_EDGES]);
    });
  });
});

describe('the gate', () => {
  it('no birthday means no adjustment at all', () => {
    expect(rmssdBaselineScale({})).toBe(1);
    expect(rmssdBaselineScale(ctxFor(null, 'Female'))).toBe(1);
    expect(rmssdBaselineEdges(ctxFor(null, 'Female'))).toEqual([...RMSSD_U_EDGES]);
  });

  it('grades a profile with no birthday exactly as today, on every edge', () => {
    const none = ctxFor(null, 'Female');
    [16.9, 17, 21.9, 22, 26.9, 27, 33.9, 34, 60].forEach((v) => {
      expect(sRMSSDu(v, none)).toBe(sRMSSDu(v));
    });
    expect(sRMSSDu(34)).toBe('great');
    expect(sRMSSDu(27)).toBe('good');
    expect(sRMSSDu(22)).toBe('ok');
    expect(sRMSSDu(17)).toBe('bad');
    expect(sRMSSDu(16.9)).toBe('crash');
  });

  it('a minor is not adjusted, honouring NORM_MIN_AGE', () => {
    expect(rmssdBaselineScale(ctxFor(17, 'Female'))).toBe(1);
    expect(rmssdBaselineScale(ctxFor(18, 'Female'))).not.toBe(1);
  });

  // The regression guard for ADJUST_REQUIRES_SEX = false: the user whose
  // readings prompted this change has a birthday and a blank sex.
  it('a birthday with a blank sex DOES adjust', () => {
    const blank = ctxFor(58, '');
    expect(rmssdBaselineScale(blank)).toBeLessThan(1);
    expect(rmssdBaselineEdges(blank)).not.toEqual([...RMSSD_U_EDGES]);
    expect(rmssdBaselineEdges(ctxFor(58, 'Other'))).toEqual(rmssdBaselineEdges(blank));
  });
});

describe('the measured edges', () => {
  it('55-64 female', () => {
    expect(rmssdBaselineEdges(ctxFor(58, 'Female'))).toEqual([21.1, 16.7, 13.6, 10.5]);
  });
  it('25-34 female: younger is STRICTER', () => {
    expect(rmssdBaselineEdges(ctxFor(30, 'Female'))).toEqual([42.8, 34, 27.7, 21.4]);
  });
  it('edges only ever fall with age', () => {
    const top = [30, 40, 50, 58, 70].map((a) => rmssdBaselineEdges(ctxFor(a, 'Female'))[0]);
    top.forEach((v, i) => { if (i) expect(v).toBeLessThan(top[i - 1]); });
  });
});

describe('the 55F who prompted this', () => {
  const her = ctxFor(55, 'Female');

  it('14 ms is low-normal, not the floor', () => {
    expect(sRMSSDu(14, her)).toBe('ok');
    // ...and was the floor before.
    expect(sRMSSDu(14)).toBe('crash');
  });

  // The scale must keep being able to report a genuinely bad day, or it has
  // bought her nothing but a flattering number.
  it('8 ms still grades the floor', () => {
    expect(sRMSSDu(8, her)).toBe('crash');
  });

  it('the chart zones agree with the grade', () => {
    const bands = bandsFor('hrv', 'rmssd', her)!;
    [8, 14, 20, 25, 40].forEach((v) => {
      expect(catFromBands(v, bands)).toBe(sRMSSDu(v, her));
    });
  });
});

describe('scope', () => {
  it('a paced (breathHrv) reading grades identically with and without age', () => {
    const her = ctxFor(55, 'Female');
    const r = (rmssd: string): Entry => ({ id: 'b', type: 'breathHrv', time: '08:00', rmssd, durationSec: 300 } as Entry);
    [8, 14, 20, 25, 33].forEach((v) => {
      expect(computeScores(r(String(v)), her).rmssd).toBe(computeScores(r(String(v)), {}).rmssd);
    });
  });

  it('the day score moves for a baseline reading and not for a paced one', () => {
    const her = ctxFor(55, 'Female');
    const dk = todayKey();
    const base = { id: 'u', type: 'hrv', time: '07:30', rmssd: '14', durationSec: 300 } as Entry;
    const paced = { id: 's', type: 'breathHrv', time: '07:30', rmssd: '14', durationSec: 300 } as Entry;

    // One day only, so the personal-baseline half has no history to pull on.
    const dBase = day([base]);
    const dPaced = day([paced]);
    const withAge = scoreSet([base], dBase, dk, { [dk]: dBase }, her).score!;
    const without = scoreSet([base], dBase, dk, { [dk]: dBase }, {}).score!;
    expect(withAge).toBeGreaterThan(without);
    expect(scoreSet([paced], dPaced, dk, { [dk]: dPaced }, her).score)
      .toBe(scoreSet([paced], dPaced, dk, { [dk]: dPaced }, {}).score);
  });

  it('the reading card reads the same band as the day score', () => {
    const her = ctxFor(55, 'Female');
    const dk = todayKey();
    const r = { id: 'u', type: 'hrv', time: '07:30', rmssd: '14', durationSec: 300 } as Entry;
    const days = { [dk]: day([r]) };
    expect(readingGrade(r, days, dk, her).cat).toBe('ok');
    expect(readingGrade(r, days, dk).cat).toBe('crash');
    // Nothing about a day far in the past changes either answer.
    expect(addDays(dk, -1) < dk).toBe(true);
  });
});
