/**
 * The sweep: every plausible factor against every outcome, at same-day and
 * next-day lag, and then the part that matters — throwing almost all of it away.
 *
 * A journal with 40 logged types produces several hundred testable pairs. At a
 * naive p < 0.05 something like fifteen of those would come back "significant"
 * from pure noise, and fifteen confident, specific, false claims about someone's
 * chronic illness is materially worse than showing nothing at all. Four filters
 * stand in the way, in order of how much work they do:
 *
 * 1. COVERAGE. Both sides of a binary factor need MIN_GROUP days; a continuous
 *    one needs MIN_PAIRS paired observations. Applied AFTER ./matrix has nulled
 *    the factor's pre-logging era, so the count is of real evidence.
 * 2. TAUTOLOGY BLOCKS. `FactorDef.blocks` names outcome families where the answer
 *    is arithmetic — water intake against water intake, a symptom against the
 *    symptom count, anything against clean days when it is itself a clean-day
 *    criterion.
 * 3. FALSE-DISCOVERY CORRECTION. One Benjamini–Hochberg family over every test
 *    actually run. This is the filter doing the real work and the reason the
 *    sweep is allowed to be broad in the first place.
 * 4. DEDUPLICATION. RMSSD, SDNN, pNN50, total power and LF peak move together, so
 *    a real finding arrives five times over; `OUTCOME_FAMILY` collapses it to
 *    one, lags collapse to the stronger of the two, and no single factor may
 *    occupy more than MAX_PER_FACTOR rows.
 *
 * Copy is associational throughout and never causal. The statistics here cannot
 * distinguish "magnesium raised my HRV" from "I take magnesium on the days I am
 * already doing everything else right", and the user is the only one positioned
 * to tell those apart.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { INSIGHT_OUTCOMES, OUTCOME_FAMILY, TREND_METRICS, type TrendMetricDef, type TrendMetricId } from '../trends';
import { laggedColumn, pairs, type DayMatrix } from './matrix';
import type { FactorDef } from './factors';
import { benjaminiHochberg, confidenceLabel, confidencePips, mannWhitney, median, spearman, type ConfidenceLabel } from './stats';

/** Days needed on EACH side of a binary factor. */
export const MIN_GROUP = 8;
/** Paired observations needed for a continuous factor. */
export const MIN_PAIRS = 12;
/**
 * False-discovery rate the whole family is held to.
 *
 * Measured, not guessed. Against 30 independent noise journals of 120 days each
 * (~500 tests apiece — see the noise suite in ./__tests__), q = 0.10 reported a
 * false finding on roughly one journal in four, while q = 0.05 reported one across
 * all thirty. The planted associations in the same suite come back at q ≈ 0, so
 * the tighter bar costs no real signal. Do not loosen this without re-running that
 * measurement.
 */
export const FDR_Q = 0.05;
/** At most this many findings from one driver, so a single supplement can't own
 *  the list by winning in four different outcome families. */
export const MAX_PER_FACTOR = 2;
/** Hard cap on the full list, including what "Show all" reveals. */
export const MAX_CORRELATIONS = 24;
/**
 * Smallest effect worth a row, however significant it is.
 *
 * A clinical bar on top of the statistical one, in the same spirit as the
 * registry's `minDelta`. Below about 0.2 the ordering barely agrees, and a row
 * saying so takes a slot from something the user could act on.
 */
export const MIN_EFFECT = 0.20;

/**
 * Outcomes a correlation may target.
 *
 * Three exclusions, each for its own reason:
 *
 * `aggregate: 'stdev'` metrics — `sleepConsistency` today — are excluded as a
 * CLASS, and this is the important one. A correlation compares per-day values
 * between two groups, but a dispersion statistic has no per-day value: one night's
 * bedtime is a bedtime, not a consistency. Correlating against it silently
 * compares bedtimes and then labels the result "bedtime consistency", which is
 * both wrong and confidently worded. The noise suite caught exactly that.
 *
 * `cleanDays` is excluded because nearly every derived factor is one of its own
 * criteria, so it would only ever restate the protocol back to the user.
 *
 * `badDays` is excluded because it is a threshold on `score` and `OUTCOME_FAMILY`
 * would dedupe it away regardless — testing it is wasted budget that also dilutes
 * the FDR correction for everything else.
 */
export const CORRELATION_OUTCOMES: TrendMetricId[] = INSIGHT_OUTCOMES.filter((id) =>
  id !== 'cleanDays' && id !== 'badDays' && TREND_METRICS[id].aggregate !== 'stdev');

export interface Correlation {
  id: string;
  factorId: string;
  /** "Magnesium glycinate" — the left side of the row. */
  driver: string;
  outcome: TrendMetricId;
  /** "SDNN" — the right side of the row. */
  metric: string;
  unit: string;
  /** 0 = same day, 1 = next day. */
  lag: number;
  /** Spearman's rho or the rank-biserial correlation, both in [-1, 1]. */
  r: number;
  /** "+0.68" */
  rText: string;
  /** Does the association point the healthy way for this metric? */
  good: boolean;
  q: number;
  pips: number;
  confidence: ConfidenceLabel;
  /** Observations the test saw. */
  n: number;
  /** "24 days with it, 38 without" */
  note: string;
  /** One associational sentence. */
  headline: string;
  /** "53 vs 41 ms" */
  detail: string;
  /** Outcome medians on the high/present side and the low/absent side. */
  high: number;
  low: number;
  highLabel: string;
  lowLabel: string;
}

/** "HRV (SDNN)" -> "SDNN"; anything without a parenthetical is already short. */
export function shortMetric(def: TrendMetricDef): string {
  const m = /\(([^)]+)\)/.exec(def.label);
  return m ? m[1] : def.label;
}

/**
 * A metric name used mid-sentence.
 *
 * Registry labels are title-case because they head charts, which leaves
 * "...show lower Daily score" in a sentence. Lowercasing the first letter fixes
 * that, EXCEPT for the acronyms — "sDNN" and "sys" would be worse than the
 * problem, so anything starting with two capitals is left exactly as it is.
 */
export function midSentence(metric: string): string {
  return /^[A-Z]{2,}/.test(metric) ? metric : metric.charAt(0).toLowerCase() + metric.slice(1);
}

/** Distance outside a banded metric's target, mirroring ../trends/compare. */
const bandDistance = (v: number, target: [number, number]) =>
  (v < target[0] ? target[0] - v : v > target[1] ? v - target[1] : 0);

/**
 * Is a higher outcome on the factor's present/high side the healthy direction?
 *
 * For a banded metric this cannot be read off `better` alone — moving from 6h to
 * 7.5h of sleep and from 9h to 10.5h are both "up", and only one is good — so the
 * two group medians are compared by their distance from the band instead.
 */
function isGood(def: TrendMetricDef, high: number, low: number): boolean {
  if (def.better === 'band' && def.target) return bandDistance(high, def.target) < bandDistance(low, def.target);
  return def.better === 'up' ? high > low : high < low;
}

/**
 * Is there anything clinically worth saying about these two group medians?
 *
 * For a banded metric, two values that both sit INSIDE the target band are not a
 * finding — moving from 8 hours of sleep to 9 is not an improvement, and the
 * difference between 118 and 122 systolic is not news. ../trends/compare applies
 * exactly this rule to its own windows; without it here, a chance association
 * between a supplement and a perfectly normal night gets a row.
 */
function worthSaying(def: TrendMetricDef, high: number, low: number): boolean {
  if (def.better !== 'band' || !def.target) return true;
  return bandDistance(high, def.target) > 0 || bandDistance(low, def.target) > 0;
}

const signed = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}`;

interface Candidate {
  factor: FactorDef;
  def: TrendMetricDef;
  lag: number;
  r: number;
  p: number;
  n: number;
  high: number;
  low: number;
  nHigh: number;
  nLow: number;
}

/**
 * One factor × one outcome × one lag.
 *
 * Returns null the moment coverage fails, which is most of the time — the early
 * exit is what keeps a several-hundred-pair sweep cheap.
 */
function test(matrix: DayMatrix, factor: FactorDef, def: TrendMetricDef, lag: number): Candidate | null {
  const outcomeCol = matrix.outcomes[def.id];
  const factorCol = matrix.factors[factor.id];
  if (!outcomeCol || !factorCol) return null;

  const { x: fv, y: ov } = pairs(laggedColumn(factorCol, lag), outcomeCol);
  if (fv.length < MIN_PAIRS) return null;

  if (factor.kind === 'binary') {
    const withVals: number[] = [], withoutVals: number[] = [];
    for (let i = 0; i < fv.length; i++) (fv[i] ? withVals : withoutVals).push(ov[i]);
    if (withVals.length < MIN_GROUP || withoutVals.length < MIN_GROUP) return null;
    const g = mannWhitney(withVals, withoutVals);
    if (!Number.isFinite(g.median1) || !Number.isFinite(g.median2)) return null;
    return {
      factor, def, lag, r: g.r, p: g.p, n: withVals.length + withoutVals.length,
      high: g.median1, low: g.median2, nHigh: withVals.length, nLow: withoutVals.length,
    };
  }

  // Continuous: rank-correlate the whole series, but read the DIRECTION off the
  // medians of the outcome above and below the factor's own median. A rho tells
  // you the ordering agrees; only the medians can say by how much, in the unit
  // the user recognises.
  const s = spearman(fv, ov);
  if (!s.r) return null;
  const split = median(fv);
  const hi: number[] = [], lo: number[] = [];
  for (let i = 0; i < fv.length; i++) (fv[i] > split ? hi : lo).push(ov[i]);
  if (hi.length < 3 || lo.length < 3) return null;
  const hiMed = median(hi), loMed = median(lo);
  return {
    factor, def, lag, r: s.r, p: s.p, n: s.n,
    high: hiMed, low: loMed, nHigh: hi.length, nLow: lo.length,
  };
}

function describe(c: Candidate, q: number): Correlation {
  const { factor, def, lag } = c;
  const metric = shortMetric(def);
  const good = isGood(def, c.high, c.low);
  const higher = c.high > c.low;
  const pips = confidencePips(q, Math.abs(c.r), c.n);
  const when = lag ? 'next-day ' : '';
  const dirWord = higher ? 'higher' : 'lower';

  // `subject` defaults to "<label> days", which is right for the type-derived
  // factors because their labels are nouns ("Alcohol days"). The derived factors
  // supply their own, because "Slept 7 hours or more days" is not English.
  const said = midSentence(metric);
  const headline = factor.kind === 'binary'
    ? `${factor.subject || `${factor.label} days`} show ${dirWord} ${when}${said}`
    : `More ${factor.label.toLowerCase()} is linked to ${dirWord} ${when}${said}`;

  const note = factor.kind === 'binary'
    ? `${c.nHigh} days with it, ${c.nLow} without`
    : `${c.n} paired days`;

  return {
    id: `${factor.id}|${def.id}|${lag}`,
    factorId: factor.id,
    driver: factor.driver,
    outcome: def.id,
    metric,
    unit: def.unit,
    lag,
    r: c.r,
    rText: signed(c.r),
    good,
    q,
    pips,
    confidence: confidenceLabel(pips),
    n: c.n,
    note: lag ? `Next day · ${note}` : note,
    headline,
    detail: `${def.fmt(c.high)} vs ${def.fmt(c.low)} ${def.unit}`,
    high: c.high,
    low: c.low,
    highLabel: factor.kind === 'binary' ? 'With it' : 'Higher',
    lowLabel: factor.kind === 'binary' ? 'Without' : 'Lower',
  };
}

/**
 * Every association in this journal that survives all four filters, strongest
 * first. An empty array is a completely normal and correct answer.
 */
export function findCorrelations(matrix: DayMatrix): Correlation[] {
  const candidates: Candidate[] = [];

  matrix.defs.forEach((factor) => {
    CORRELATION_OUTCOMES.forEach((id) => {
      if (factor.blocks.includes(OUTCOME_FAMILY[id])) return;
      const def = TREND_METRICS[id];
      factor.lags.forEach((lag) => {
        const c = test(matrix, factor, def, lag);
        if (c) candidates.push(c);
      });
    });
  });

  if (!candidates.length) return [];

  // One family, one correction, over EVERY test that ran.
  //
  // Splitting it per outcome or per factor group would quietly restore the problem
  // the correction exists to solve. Less obviously, so would applying the
  // clinical filters below BEFORE this line: BH's threshold is (k/m)·q, so
  // shrinking the family raises every threshold and makes the correction more
  // permissive. Dropping weak candidates early measurably increased the false
  // findings in the noise suite. Correct first, filter second.
  const fdr = benjaminiHochberg(candidates.map((c) => c.p), FDR_Q);
  const survivors = candidates
    .map((c, i) => ({ c, q: fdr.q[i], ok: fdr.rejected[i] }))
    .filter((s) => s.ok)
    // Clinical bars, applied to what survived: too small to matter, or a
    // difference between two perfectly normal values.
    .filter((s) => Math.abs(s.c.r) >= MIN_EFFECT && worthSaying(s.c.def, s.c.high, s.c.low))
    .map((s) => describe(s.c, s.q));

  // Strongest first, so the dedup passes below keep the best of each collision.
  survivors.sort((a, b) => (b.pips - a.pips) || (Math.abs(b.r) - Math.abs(a.r)));

  const byId = new Map(matrix.defs.map((f) => [f.id, f]));
  const seenFamily = new Set<string>();
  const perFactor = new Map<string, number>();
  const out: Correlation[] = [];
  for (const c of survivors) {
    const factor = byId.get(c.factorId);
    // Collapse across the driver's variant key, the outcome family, AND the lag.
    // "Any activity", "activity minutes" and "heavy exertion" against the score is
    // one finding; alcohol against RMSSD today and tomorrow is one finding,
    // reported at whichever lag is stronger.
    const driverKey = (factor && factor.variantOf) || c.factorId;
    const familyKey = `${driverKey}|${OUTCOME_FAMILY[c.outcome]}`;
    if (seenFamily.has(familyKey)) continue;
    const used = perFactor.get(driverKey) || 0;
    if (used >= MAX_PER_FACTOR) continue;
    seenFamily.add(familyKey);
    perFactor.set(driverKey, used + 1);
    out.push(c);
    if (out.length >= MAX_CORRELATIONS) break;
  }
  return out;
}
