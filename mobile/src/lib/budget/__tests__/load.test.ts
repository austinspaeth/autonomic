import { ACTIVITY_TYPES } from '../../registry';
import { ASSUMED_MIN, CREDIT_CAP, LOAD_PER_MIN, LOAD_TABLE, entryCost, loadOf } from '../load';
import type { Entry, TypeDef } from '../../types';

const act = (over: Partial<Entry>): Entry => ({ id: 'x', type: 'walk', ...over } as Entry);

describe('load table', () => {
  /* The coverage test. A new registry activity cannot ship without somebody
     deciding what a minute of it costs — the alternative is that it silently
     becomes free, which is the failure mode this whole table exists to fix. */
  it('covers every built-in activity type', () => {
    const missing = Object.keys(ACTIVITY_TYPES).filter((k) => !LOAD_TABLE[k]);
    expect(missing).toEqual([]);
  });

  it('names only real activity types', () => {
    const stray = Object.keys(LOAD_TABLE).filter((k) => !ACTIVITY_TYPES[k]);
    expect(stray).toEqual([]);
  });

  it('keeps the non-exercise rows non-zero', () => {
    // The whole correction this makes over activityGrade: standing in a
    // supermarket and washing the car cost something.
    ['errands', 'stressfulWork', 'carWash', 'shower'].forEach((k) => {
      expect(LOAD_PER_MIN[LOAD_TABLE[k]]).toBeGreaterThan(0);
    });
  });

  it('makes rest the only negative weight', () => {
    const negatives = Object.entries(LOAD_PER_MIN).filter(([, v]) => v < 0).map(([k]) => k);
    expect(negatives).toEqual(['rest']);
  });
});

describe('loadOf', () => {
  it('lets a custom type answer for itself', () => {
    const def = { label: 'Gardening', icon: 'leaf', fields: [], userDefined: true, load: 'heavy' } as TypeDef;
    expect(loadOf(def, 'custom-gardening')).toBe('heavy');
  });

  it('falls back to moderate for a custom type that never answered', () => {
    const def = { label: 'Gardening', icon: 'leaf', fields: [], userDefined: true } as TypeDef;
    expect(loadOf(def, 'custom-gardening')).toBe('moderate');
  });

  it('reads the table for a built-in', () => {
    expect(loadOf(ACTIVITY_TYPES.strength, 'strength')).toBe('heavy');
    expect(loadOf(ACTIVITY_TYPES.legsUp, 'legsUp')).toBe('rest');
  });
});

describe('entryCost', () => {
  it('charges duration times the weight', () => {
    const c = entryCost(act({ type: 'errands', duration: '45' }), ACTIVITY_TYPES.errands, null);
    expect(c.minutes).toBe(45);
    expect(c.effortMin).toBeCloseTo(45, 5);
    expect(c.credit).toBe(false);
  });

  it('charges a heavy minute more than a light one', () => {
    const heavy = entryCost(act({ type: 'strength', duration: '30' }), ACTIVITY_TYPES.strength, null);
    const light = entryCost(act({ type: 'walk', duration: '30' }), ACTIVITY_TYPES.walk, null);
    expect(heavy.effortMin).toBeGreaterThan(light.effortMin);
  });

  it('refunds a restorative entry', () => {
    const c = entryCost(act({ type: 'legsUp', duration: '20' }), ACTIVITY_TYPES.legsUp, null);
    expect(c.credit).toBe(true);
    expect(c.effortMin).toBeLessThan(0);
    expect(Math.abs(c.effortMin)).toBeCloseTo(7, 5);
  });

  it('assumes a short duration when none was logged, and says so', () => {
    const c = entryCost(act({ type: 'errands' }), ACTIVITY_TYPES.errands, null);
    expect(c.assumed).toBe(true);
    expect(c.minutes).toBe(ASSUMED_MIN);
  });

  it('costs more when the heart ran above the line', () => {
    const plain = entryCost(act({ type: 'walk', duration: '30' }), ACTIVITY_TYPES.walk, 100);
    const hard = entryCost(act({ type: 'walk', duration: '30', avgHr: '120' }), ACTIVITY_TYPES.walk, 100);
    expect(hard.effortMin).toBeGreaterThan(plain.effortMin);
    expect(hard.hrBoost).toBeCloseTo(1.5, 5);
  });

  it('caps the heart-rate boost', () => {
    const wild = entryCost(act({ type: 'walk', duration: '30', avgHr: '220' }), ACTIVITY_TYPES.walk, 100);
    expect(wild.hrBoost).toBeCloseTo(1.5, 5);
  });

  it('never boosts without a line to compare against', () => {
    const c = entryCost(act({ type: 'walk', duration: '30', avgHr: '160' }), ACTIVITY_TYPES.walk, null);
    expect(c.hrBoost).toBe(1);
  });

  it('never boosts a credit', () => {
    const c = entryCost(act({ type: 'legsUp', duration: '20', avgHr: '150' }), ACTIVITY_TYPES.legsUp, 100);
    expect(c.hrBoost).toBe(1);
  });
});

describe('the credit cap is a real bound', () => {
  it('keeps a quarter as the most rest can give back', () => {
    // Pinned so a future tweak to CREDIT_PER_MIN cannot quietly turn rest into
    // a way to manufacture a second day.
    expect(CREDIT_CAP).toBeLessThanOrEqual(0.25);
  });
});
