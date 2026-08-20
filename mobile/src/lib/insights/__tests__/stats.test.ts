/**
 * The statistics are the product here in the strictest sense: an error in this
 * file becomes a confident, specific, false claim about somebody's health. So
 * these pin the numbers against hand-computable cases and textbook examples, not
 * just the branches.
 */
import {
  benjaminiHochberg, confidenceLabel, confidencePips, mannWhitney, median,
  normalTwoTailed, ranks, spearman,
} from '../stats';

describe('ranks', () => {
  it('is 1-based and ascending', () => {
    expect(ranks([30, 10, 20]).rank).toEqual([3, 1, 2]);
  });

  it('averages tied ranks and reports the tie group sizes', () => {
    const r = ranks([10, 20, 20, 30]);
    expect(r.rank).toEqual([1, 2.5, 2.5, 4]);
    expect(r.tieGroups).toEqual([2]);
  });

  it('handles an all-tied series as one group', () => {
    const r = ranks([5, 5, 5, 5]);
    expect(r.rank).toEqual([2.5, 2.5, 2.5, 2.5]);
    expect(r.tieGroups).toEqual([4]);
  });
});

describe('normalTwoTailed', () => {
  it('is 1 at the mean and symmetric', () => {
    expect(normalTwoTailed(0)).toBeCloseTo(1, 6);
    expect(normalTwoTailed(1.5)).toBeCloseTo(normalTwoTailed(-1.5), 12);
  });

  it('matches the textbook critical values', () => {
    expect(normalTwoTailed(1.959964)).toBeCloseTo(0.05, 4);
    expect(normalTwoTailed(2.575829)).toBeCloseTo(0.01, 4);
    expect(normalTwoTailed(3.290527)).toBeCloseTo(0.001, 4);
  });
});

describe('spearman', () => {
  it('is +1 on a monotone increasing pair and -1 on a decreasing one', () => {
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]).r).toBe(1);
    expect(spearman([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]).r).toBe(-1);
  });

  it('is +1 on a monotone but wildly non-linear pair, where Pearson would not be', () => {
    // The whole reason this module is rank-based: one enormous value is ordinary
    // in this data and must not change the answer.
    expect(spearman([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 9000]).r).toBe(1);
  });

  it('reports nothing when either series is constant', () => {
    // A supplement taken every single day carries no information about the days
    // it was not taken, because there are none.
    expect(spearman([1, 1, 1, 1, 1], [5, 3, 9, 1, 7])).toEqual({ r: 0, n: 5, p: 1 });
  });

  it('refuses to answer below four pairs', () => {
    expect(spearman([1, 2, 3], [1, 2, 3]).p).toBe(1);
  });

  it('averages tied ranks rather than taking the 6-sigma-d-squared shortcut', () => {
    // x = [1,1,2,3,4,5] ranks as [1.5,1.5,3,4,5,6], giving rho = 17/sqrt(17*17.5)
    // = 0.98561. The shortcut formula, which assumes no ties, returns 0.98571 —
    // close here, but it drifts with the size of the tie blocks, and half these
    // series are small integers where tie blocks are large.
    expect(spearman([1, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6]).r).toBeCloseTo(0.98561, 5);
    // A binary series against itself: eight ties on each side, still a perfect
    // ordering, and the tie handling has to see that.
    // 32/sqrt(32*42) = 0.87287 — capped below 1 by the ties, which is correct: a
    // binary split cannot resolve the ordering WITHIN each group.
    expect(spearman([0, 0, 0, 0, 1, 1, 1, 1], [1, 2, 3, 4, 9, 10, 11, 12]).r).toBeCloseTo(0.87287, 4);
  });

  it('finds a strong relationship significant and a weak one not', () => {
    const x = Array.from({ length: 30 }, (_, i) => i);
    expect(spearman(x, x).p).toBeLessThan(0.001);
    const shuffled = [14, 2, 27, 9, 21, 5, 18, 1, 25, 11, 0, 29, 7, 16, 23, 3, 12, 28, 6, 19, 10, 26, 4, 22, 8, 17, 13, 24, 15, 20];
    expect(spearman(x, shuffled).p).toBeGreaterThan(0.05);
  });
});

describe('mannWhitney', () => {
  it('is +1 when every present-day value outranks every absent-day value', () => {
    const g = mannWhitney([9, 10, 11, 12, 13, 14, 15, 16], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(g.r).toBe(1);
    expect(g.p).toBeLessThan(0.001);
    expect(g.median1).toBe(12.5);
    expect(g.median2).toBe(4.5);
  });

  it('is -1 the other way round', () => {
    expect(mannWhitney([1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16]).r).toBe(-1);
  });

  it('is 0 and insignificant on perfectly interleaved groups', () => {
    const g = mannWhitney([1, 3, 5, 7, 9, 11, 13, 15], [2, 4, 6, 8, 10, 12, 14, 16]);
    expect(g.r).toBeCloseTo(-0.125, 6);
    expect(g.p).toBeGreaterThan(0.5);
  });

  it('survives a fully tied comparison without returning a false positive', () => {
    // Every value identical: the tie correction drives the variance to zero, and
    // the answer must be "nothing", not a division by zero.
    const g = mannWhitney([4, 4, 4, 4], [4, 4, 4, 4]);
    expect(g.p).toBe(1);
    expect(g.r).toBe(0);
  });

  it('refuses to answer below three per group', () => {
    expect(mannWhitney([1, 2], [8, 9]).p).toBe(1);
  });

  it('reports medians, not means, so one outlier cannot move the copy', () => {
    const g = mannWhitney([10, 11, 12, 13, 14, 15, 16, 900], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(g.median1).toBe(13.5);
  });
});

describe('benjaminiHochberg', () => {
  // The standard worked example from the FDR literature: 15 tests at q = 0.05
  // rejects exactly the first four.
  const P = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240, 0.4262, 0.5719, 0.6528, 0.7590, 1.0];

  it('rejects the textbook four', () => {
    const r = benjaminiHochberg(P, 0.05);
    expect(r.rejected.filter(Boolean)).toHaveLength(4);
    expect(r.rejected.slice(0, 4)).toEqual([true, true, true, true]);
    expect(r.tests).toBe(15);
  });

  it('produces monotone q-values that are never below the raw p', () => {
    const r = benjaminiHochberg(P, 0.05);
    for (let i = 0; i < P.length; i++) expect(r.q[i]).toBeGreaterThanOrEqual(P[i] - 1e-12);
    for (let i = 1; i < P.length; i++) expect(r.q[i]).toBeGreaterThanOrEqual(r.q[i - 1] - 1e-12);
    expect(Math.max(...r.q)).toBeLessThanOrEqual(1);
  });

  it('rejects a test whose own p missed its threshold but which sits under the cut', () => {
    // BH is a step-UP procedure: everything below the largest passing index is
    // rejected. p = 0.04 fails its own k = 2 threshold of 0.025 yet is rejected
    // because p = 0.049 passes at k = 4.
    const r = benjaminiHochberg([0.001, 0.04, 0.045, 0.049], 0.05);
    expect(r.rejected).toEqual([true, true, true, true]);
  });

  it('rejects nothing in a family of pure noise', () => {
    // 200 uniform p-values, deterministic. This is the case that matters: a broad
    // sweep over a journal with no real signal must come back empty.
    const p = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
    expect(benjaminiHochberg(p, 0.10).rejected.filter(Boolean)).toHaveLength(0);
  });

  it('is unbothered by an empty family', () => {
    expect(benjaminiHochberg([], 0.10)).toEqual({ rejected: [], q: [], tests: 0 });
  });
});

describe('confidencePips', () => {
  it('gives five pips only to a strong, well-evidenced, large effect', () => {
    expect(confidencePips(0.0005, 0.7, 60)).toBe(5);
  });

  it('caps a tiny effect however significant it is', () => {
    // Statistically detectable and clinically meaningless. Showing this as "Very
    // strong" is how a user learns to distrust the whole screen.
    expect(confidencePips(0.0000001, 0.15, 200)).toBe(2);
    expect(confidencePips(0.0000001, 0.30, 200)).toBe(3);
  });

  it('caps a thin sample however large the effect', () => {
    expect(confidencePips(0.0001, 0.9, 13)).toBe(2);
    expect(confidencePips(0.0001, 0.9, 19)).toBe(3);
    expect(confidencePips(0.0001, 0.9, 29)).toBe(4);
  });

  it('never goes below one, and steps down with the q-value', () => {
    expect(confidencePips(0.9, 0.9, 200)).toBe(1);
    expect(confidencePips(0.08, 0.9, 200)).toBe(2);
    expect(confidencePips(0.03, 0.9, 200)).toBe(3);
    expect(confidencePips(0.005, 0.9, 200)).toBe(4);
  });

  it('labels every pip count', () => {
    expect([1, 2, 3, 4, 5].map(confidenceLabel)).toEqual(['Very weak', 'Weak', 'Moderate', 'Strong', 'Very strong']);
  });
});

describe('median', () => {
  it('averages the middle pair on an even count and is NaN on empty', () => {
    expect(median([3, 1, 4, 2])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});
