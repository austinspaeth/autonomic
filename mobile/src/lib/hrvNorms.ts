/**
 * What a resting HRV figure typically looks like for somebody of the user's age
 * and sex, as a REFERENCE beside their own number. It never grades anything:
 * the scoring bands are the product (see `scoring/`), and a 60-year-old whose
 * RMSSD is Moderate on those bands may be squarely typical for their age, which
 * is the one thing this exists to say.
 *
 * Source: Voss A. et al. (2015) "Short-term heart rate variability — influence
 * of gender and age in healthy subjects", PLoS ONE 10(3): e0118308,
 * supplement S1, Tables C (women) and E (men). 1,906 healthy adults (arrhythmia,
 * hypertension, diabetes, cardiac and psychiatric disease and HR-affecting
 * medication all excluded), 5-minute resting ECG, supine, spontaneous breathing.
 *
 * The range is the MIDDLE HALF of those healthy people (25th to 75th
 * percentile), never mean ± SD. These metrics are right-skewed, pNN50 severely:
 * the paper's own mean ± SD for men 35-44 is 13 ± 15%, whose lower edge is
 * below zero, and flooring it printed "0-28%" as if 0 were a healthy value. The
 * quartiles are real observed values, so the low end is where a quarter of
 * healthy people genuinely sit.
 *
 * SHOWN ONLY UNDER 55 (`NORM_MAX_AGE`). From 55 the healthy median itself
 * grades Compromised or Crash on the app's absolute bands (SDNN 29 ms against a
 * Crash edge of 30), so the card would wear a red dot above a bubble calling
 * that number healthy. The grades are the product and are not age-adjusted;
 * until they are, the reference stays off where the two would contradict each
 * other. The 55+ decades are kept below so that lifting the cap is one line.
 *
 * Only resting (baseline) readings are comparable: paced breathing inflates
 * SDNN and pNN50 by design, so callers show this for baseline readings only.
 * Adults only. The label names the user's own age; the figures are that age's
 * decade, and 18-24 (younger than the study's youngest) borrow 25-34.
 */

export type NormMetric = 'sdnn' | 'rmssd' | 'pnn50';

export const isNormMetric = (k: string): k is NormMetric => k === 'sdnn' || k === 'rmssd' || k === 'pnn50';

type Stat = [median: number, q1: number, q3: number];
type Decades = [Stat, Stat, Stat, Stat, Stat];

/** Decade lower bounds, matching the rows of the tables below. */
const DECADES = [25, 35, 45, 55, 65] as const;

// pNN50 in percent, as the supplement publishes it and the app stores it.
const FEMALE: Record<NormMetric, Decades> = {
  sdnn: [[44.9, 35.4, 58.1], [40.2, 32.9, 53.7], [35.5, 26.5, 44.5], [29.0, 22.8, 35.2], [26.0, 18.7, 32.5]],
  rmssd: [[38.4, 26.1, 54.5], [30.5, 22.4, 45.7], [23.7, 16.9, 31.3], [18.9, 13.2, 27.3], [16.9, 11.1, 23.9]],
  pnn50: [[18.3, 4.9, 40.3], [9.3, 2.1, 28.4], [3.4, 0.5, 9.5], [1.1, 0, 6.0], [0.5, 0, 4.6]],
};
const MALE: Record<NormMetric, Decades> = {
  sdnn: [[46.0, 36.4, 58.9], [42.6, 32.3, 53.1], [34.5, 26.1, 44.3], [29.9, 22.0, 39.3], [26.5, 20.1, 35.4]],
  rmssd: [[36.2, 26.2, 48.5], [28.7, 20.9, 39.0], [21.5, 15.7, 29.6], [17.5, 12.5, 24.8], [16.7, 11.8, 23.4]],
  pnn50: [[15.3, 5.3, 30.3], [6.8, 1.9, 18.8], [2.1, 0.3, 8.4], [1.1, 0, 3.7], [0.8, 0, 4.8]],
};

/** Youngest age this is shown for. The study has no one under 25, and the
 *  app's reference is for adults. */
export const NORM_MIN_AGE = 18;
/** Oldest age this is shown for; see the header for why it stops at 54. */
export const NORM_MAX_AGE = 54;

export interface HrvNorm {
  /** "Healthy 38 year old women" / "Healthy adults age 38". Says HEALTHY
   *  because it is: the reference is a screened population, not everybody. */
  label: string;
  /** Median of healthy people this age and sex. */
  typical: number;
  /** 25th and 75th percentile: the middle half. */
  low: number;
  high: number;
}

type SexKey = 'male' | 'female' | null;

function sexKey(sex?: string | null): SexKey {
  const s = (sex || '').trim().toLowerCase();
  if (s.startsWith('f')) return 'female';
  if (s.startsWith('m')) return 'male';
  return null;
}

function decadeIndex(age: number): number {
  let i = 0;
  DECADES.forEach((lo, k) => { if (age >= lo) i = k; });
  return i;
}

const round = (v: number) => Math.round(v);

/**
 * The reference for one metric, or null when there is no age to anchor on or
 * the user is outside `NORM_MIN_AGE`..`NORM_MAX_AGE`. With no sex (or "Other"), the two sexes'
 * decade figures are averaged, a fair approximation since they differ by a few
 * ms at most (quartiles do not strictly average, but they sit this close).
 */
export function hrvNorm(metric: NormMetric, age: number | null | undefined, sex?: string | null): HrvNorm | null {
  if (age == null || !isFinite(age) || age < NORM_MIN_AGE || age > NORM_MAX_AGE + 0.999) return null;
  const i = decadeIndex(age);
  const k = sexKey(sex);
  const f = FEMALE[metric][i], m = MALE[metric][i];
  const [median, q1, q3] = k === 'female' ? f : k === 'male' ? m : [0, 1, 2].map((j) => (f[j] + m[j]) / 2);
  const a = Math.floor(age);
  return {
    label: k ? `Healthy ${a} year old ${k === 'female' ? 'women' : 'men'}` : `Healthy adults age ${a}`,
    typical: round(median),
    low: round(q1),
    high: round(q3),
  };
}
