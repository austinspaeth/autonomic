import { LONG_SHIFT_DAYS, ONSET_MIN_DENSITY, alreadyMoving, findBiggestChange } from '../change';
import type { DayMatrix } from '../matrix';

const DAYS = 120;
const START = 60;
const keys = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 1 + i));
  return d.toISOString().slice(0, 10);
});

/** A journal with one supplement first taken on day 60 and RMSSD as given. */
function matrix(rmssd: (i: number) => number, taken: (i: number) => boolean): DayMatrix {
  const def = { id: 'med:test', label: 'Test', driver: 'Test', onsetNoun: 'Test', group: 'supplement', kind: 'binary', lags: [0], blocks: [] };
  return {
    keys, logged: keys.map(() => true),
    outcomes: { rmssd: keys.map((_, i) => rmssd(i)) },
    factors: { 'med:test': keys.map((_, i) => (i >= START && taken(i) ? 1 : 0)) },
    defs: [def] as never, ctx: {} as never, days: {},
  } as DayMatrix;
}
// A little texture, so the rank test is not handed two constants.
const wobble = (i: number) => ((i * 7) % 5) - 2;
const step = (i: number) => (i < START ? 34 : 24) + wobble(i);

describe('alreadyMoving', () => {
  const series = (f: (i: number) => number) => Array.from({ length: DAYS }, (_, i) => f(i));

  it('is false for a level before and a step at the event', () => {
    expect(alreadyMoving(series(step), START, 30, 34, 24)).toBe(false);
  });

  it('is true when the before window was already falling', () => {
    const slide = series((i) => 40 - i * 0.2);
    expect(alreadyMoving(slide, START, 30, 31, 25)).toBe(true);
  });

  it('is true when the fall happened in the window before the before window', () => {
    // Level at 40, down to 30 two windows back, then 24 after the event.
    const s = series((i) => (i < 30 ? 40 : i < START ? 30 : 24));
    expect(alreadyMoving(s, START, 30, 30, 24)).toBe(true);
  });

  it('ignores a drift the other way', () => {
    const rising = series((i) => (i < START ? 20 + i * 0.2 : 24));
    expect(alreadyMoving(rising, START, 30, 29, 24)).toBe(false);
  });

  it('never reads too little history as movement', () => {
    const s: (number | null)[] = series(step);
    for (let i = 0; i < START - 4; i++) s[i] = null;
    expect(alreadyMoving(s, START, 30, 34, 24)).toBe(false);
  });
});

describe('findBiggestChange', () => {
  it('says "since you started" for something kept up over a level before', () => {
    const c = findBiggestChange(matrix(step, () => true))!;
    expect(c.kind).toBe('onset');
    expect(c.headline).toBe('RMSSD is down since you started Test');
    expect(c.coverage).toBeNull();
  });

  it('does not call a thing tried now and then a start', () => {
    // One day in four: well under ONSET_MIN_DENSITY.
    expect(0.25).toBeLessThan(ONSET_MIN_DENSITY);
    const c = findBiggestChange(matrix(step, (i) => i % 4 === 0))!;
    expect(c.kind).toBe('shift');
    expect(c.headline).not.toMatch(/Test/);
  });

  it('does not hand a slide that was under way to whatever started during it', () => {
    const c = findBiggestChange(matrix((i) => 44 - i * 0.18 + wobble(i), () => true))!;
    expect(c.kind).toBe('shift');
    expect(c.headline).toBe('RMSSD has fallen over the last two months');
    // The split is where the recent window begins, so the sheet can draw it.
    expect(c.onsetIndex).toBe(DAYS - LONG_SHIFT_DAYS);
    // A shift claims no link, so it states its coverage instead of a confidence.
    expect(c.coverage).toBe('60 logged days vs 60 the two months before');
  });
});
