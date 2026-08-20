/**
 * The statistics behind every correlation the app claims to have found.
 *
 * This file is the reason the Insights view can be trusted, so the choices in it
 * are deliberate and none of them are stylistic:
 *
 * 1. EVERYTHING IS RANK-BASED. Spearman for continuous factors, Mann–Whitney for
 *    binary ones. This population's data is riddled with legitimate extremes — a
 *    130 bpm standing episode, a 2-hour night, one catastrophic crash week — and
 *    Pearson's r would let a single such day invent a relationship. Ranks make
 *    every finding a statement about ordering, which is the only thing this data
 *    can honestly support. It is the same "median, not mean" rule ../trends/compare
 *    is built on, extended to two variables.
 * 2. TIES ARE CORRECTED FOR. Half these series are small integers (symptom
 *    counts, bowel movements) or repeated round numbers, so ties are the norm
 *    rather than an edge case. Both tests use average ranks and Mann–Whitney
 *    applies the tie correction to its variance; the 6Σd² Spearman shortcut is
 *    NOT used because it is simply wrong in the presence of ties.
 * 3. P-VALUES COME FROM NORMAL APPROXIMATIONS, ON PURPOSE. Both tests reduce to
 *    a z score (Fisher transform for Spearman, the standard tie-corrected normal
 *    approximation for Mann–Whitney) rather than pulling in an incomplete-beta
 *    implementation for exact t and U distributions. The approximations are
 *    accurate well inside the sample sizes ./correlate admits (≥12 paired points,
 *    ≥8 per group) and the alternative is 80 lines of continued fractions nobody
 *    can check by eye.
 * 4. MULTIPLE COMPARISONS ARE CORRECTED. See ./correlate — a sweep over every
 *    factor × outcome × lag runs several hundred tests, and at a naive p < 0.05
 *    roughly one in twenty of those would "find" something in pure noise. That is
 *    not a rounding error, it is a screen full of fiction. `benjaminiHochberg`
 *    is what stands between the user and that screen.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */

/* ---------- ranking ---------- */

/**
 * Average ranks, 1-based, ties sharing the mean of the ranks they span.
 *
 * Also returns the tie-group sizes, which Mann–Whitney's variance needs and
 * which are otherwise expensive to recover.
 */
export function ranks(xs: number[]): { rank: number[]; tieGroups: number[] } {
  const idx = xs.map((v, i) => i).sort((a, b) => xs[a] - xs[b]);
  const rank = new Array<number>(xs.length);
  const tieGroups: number[] = [];
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rank[idx[k]] = shared;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }
  return { rank, tieGroups };
}

/* ---------- normal tail ---------- */

/**
 * Two-tailed p for a z score.
 *
 * erfc via Abramowitz & Stegun 7.1.26, whose worst-case error is ~1.5e-7 —
 * several orders of magnitude finer than any threshold this module compares
 * against, and nothing downstream reads a p-value as anything but "which side of
 * 0.10 is this".
 */
export function normalTwoTailed(z: number): number {
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return Math.min(1, Math.max(0, 1 - erf));
}

/* ---------- Spearman ---------- */

export interface RankCorrelation {
  /** Spearman's rho in [-1, 1]. */
  r: number;
  /** Paired observations the test actually saw. */
  n: number;
  p: number;
}

/**
 * Spearman's rho: Pearson's correlation of the average ranks.
 *
 * Computed the long way rather than via 6Σd²/(n³−n) precisely because that
 * shortcut assumes no ties, and ties are everywhere in this data.
 *
 * Significance uses the Fisher transform with Fieller's variance for rank
 * correlation, z = atanh(r) · sqrt((n−3)/1.06), the standard approximation for
 * Spearman. Returns r = 0, p = 1 when the input is degenerate (fewer than 4
 * pairs, or one series entirely constant — a factor the user logged every single
 * day carries no information about the days they didn't).
 */
export function spearman(x: number[], y: number[]): RankCorrelation {
  const n = Math.min(x.length, y.length);
  if (n < 4) return { r: 0, n, p: 1 };
  const rx = ranks(x.slice(0, n)).rank;
  const ry = ranks(y.slice(0, n)).rank;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return { r: 0, n, p: 1 };
  const r = Math.max(-1, Math.min(1, num / Math.sqrt(dx * dy)));
  if (Math.abs(r) >= 1) return { r, n, p: 0 };
  const z = Math.atanh(r) * Math.sqrt((n - 3) / 1.06);
  return { r, n, p: normalTwoTailed(z) };
}

/* ---------- Mann–Whitney ---------- */

export interface GroupComparison {
  /** Rank-biserial correlation in [-1, 1]: +1 = every `withVals` day ranked
   *  above every `withoutVals` day. Directly comparable to Spearman's rho, which
   *  is what lets ./correlate rank both kinds of finding in one list. */
  r: number;
  p: number;
  n1: number;
  n2: number;
  /** Medians, for the copy — never means. */
  median1: number;
  median2: number;
}

function med(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Mann–Whitney U as an effect size plus a p-value.
 *
 * `withVals` are the outcome values on days the factor was present, `withoutVals`
 * the days it wasn't. Uses the tie-corrected normal approximation with a
 * continuity correction toward the null — valid well below the ≥8-per-group floor
 * ./correlate enforces, and it degrades conservatively rather than optimistically.
 */
export function mannWhitney(withVals: number[], withoutVals: number[]): GroupComparison {
  const n1 = withVals.length, n2 = withoutVals.length;
  const base: GroupComparison = { r: 0, p: 1, n1, n2, median1: med(withVals), median2: med(withoutVals) };
  if (n1 < 3 || n2 < 3) return base;

  const all = withVals.concat(withoutVals);
  const { rank, tieGroups } = ranks(all);
  let r1 = 0;
  for (let i = 0; i < n1; i++) r1 += rank[i];

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const N = n1 + n2;
  const mu = (n1 * n2) / 2;
  const tieTerm = tieGroups.reduce((s, t) => s + (t * t * t - t), 0);
  const variance = ((n1 * n2) / 12) * ((N + 1) - tieTerm / (N * (N - 1)));
  const rb = Math.max(-1, Math.min(1, (2 * u1) / (n1 * n2) - 1));
  if (!(variance > 0)) return { ...base, r: rb };

  const diff = u1 - mu;
  // Continuity correction pulls the statistic toward the null, never away.
  const corrected = diff > 0 ? Math.max(0, diff - 0.5) : Math.min(0, diff + 0.5);
  return { ...base, r: rb, p: normalTwoTailed(corrected / Math.sqrt(variance)) };
}

/* ---------- multiple comparisons ---------- */

export interface FdrResult {
  /** Per-input-index: did this test survive the FDR procedure? */
  rejected: boolean[];
  /** Per-input-index BH-adjusted p-value (a q-value), monotone and capped at 1.
   *  This is what ./correlate ranks and grades confidence on, not the raw p. */
  q: number[];
  /** How many tests were in the family. Reported so a caller can say so. */
  tests: number;
}

/**
 * Benjamini–Hochberg step-up, controlling the false discovery rate at `q`.
 *
 * Chosen over Bonferroni because the goal is a useful screen, not a clinical
 * trial: Bonferroni across ~500 tests would demand p < 0.0001 and silence real
 * findings in a 90-day journal. BH instead accepts that a stated fraction of
 * what is shown may be spurious, which is the honest trade for a discovery tool
 * whose output is worded as an association and never as advice.
 */
export function benjaminiHochberg(pvals: number[], q = 0.10): FdrResult {
  const m = pvals.length;
  const out: FdrResult = { rejected: new Array(m).fill(false), q: new Array(m).fill(1), tests: m };
  if (!m) return out;

  const order = pvals.map((p, i) => i).sort((a, b) => pvals[a] - pvals[b]);
  // Step down from the largest p, carrying the running minimum, so adjusted
  // values come out monotone in the raw p ordering.
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const i = order[k];
    running = Math.min(running, (pvals[i] * m) / (k + 1));
    out.q[i] = Math.min(1, running);
  }
  // Largest k whose raw p clears its own BH threshold; everything at or below it
  // is rejected, including tests whose individual p did not clear it.
  let cut = -1;
  for (let k = 0; k < m; k++) if (pvals[order[k]] <= ((k + 1) / m) * q) cut = k;
  for (let k = 0; k <= cut; k++) out.rejected[order[k]] = true;
  return out;
}

/* ---------- confidence ---------- */

export type ConfidenceLabel = 'Very weak' | 'Weak' | 'Moderate' | 'Strong' | 'Very strong';

export const CONFIDENCE_LABELS: ConfidenceLabel[] = ['Very weak', 'Weak', 'Moderate', 'Strong', 'Very strong'];

/**
 * 1–5 pips, from the q-value and then capped by effect size and coverage.
 *
 * The caps are the important half. A vanishing q-value on 13 observations with a
 * rho of 0.22 is a statistically detectable, clinically meaningless relationship,
 * and showing it as "Very strong" would teach the user to distrust the whole
 * screen. Statistical significance sets the ceiling; magnitude and sample size
 * pull it back down.
 */
export function confidencePips(qValue: number, absR: number, n: number): number {
  let pips = qValue <= 0.001 ? 5 : qValue <= 0.01 ? 4 : qValue <= 0.05 ? 3 : qValue <= 0.10 ? 2 : 1;
  if (absR < 0.50) pips = Math.min(pips, 4);
  if (absR < 0.35) pips = Math.min(pips, 3);
  if (absR < 0.20) pips = Math.min(pips, 2);
  if (n < 30) pips = Math.min(pips, 4);
  if (n < 20) pips = Math.min(pips, 3);
  if (n < 14) pips = Math.min(pips, 2);
  return Math.max(1, pips);
}

export const confidenceLabel = (pips: number): ConfidenceLabel =>
  CONFIDENCE_LABELS[Math.max(0, Math.min(4, Math.round(pips) - 1))];

export { med as median };
