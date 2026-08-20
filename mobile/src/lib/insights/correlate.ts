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
 * 4. DEDUPLICATION. RMSSD, SDNN, pNN50 and total power move together, so a real
 *    finding arrives several times over; `OUTCOME_FAMILY` collapses it to one,
 *    lags collapse to the stronger of the two, and no single factor may occupy
 *    more than MAX_PER_FACTOR rows.
 * 5. THE READER'S BAR. `MIN_EFFECT`, `worthSaying` and `hasVisibleDelta`: an
 *    association can be perfectly real and still have nothing to say, either
 *    because both groups sit inside a healthy band or because the gap vanishes at
 *    the precision the number is printed to. A rank test answers "does one group
 *    order above the other", which is not the question the row's readout asks.
 *    Also `isRegimeChange`, which is the filter that rules a comparison out
 *    entirely — see MAX_MINORITY_RUN_SHARE.
 *
 * Copy is associational throughout and never causal. The statistics here cannot
 * distinguish "magnesium raised my HRV" from "I take magnesium on the days I am
 * already doing everything else right", and the user is the only one positioned
 * to tell those apart.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { INSIGHT_OUTCOMES, OUTCOME_FAMILY, TREND_METRICS, familyRank, type TrendMetricDef, type TrendMetricId } from '../trends';
import { laggedColumn, pairs, type DayMatrix } from './matrix';
import type { FactorDef } from './factors';
import { benjaminiHochberg, confidenceLabel, confidencePips, mannWhitney, median, spearman, type ConfidenceLabel } from './stats';
import { RETAIN_P } from './stability';

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
/**
 * At most this many findings from one driver, so a single supplement can't own the
 * list by winning in several outcome families.
 *
 * Four, not two. Two was throwing away findings that had already passed every
 * statistical and clinical bar: measured across 25 journals, 4.4 associations
 * survived the sweep and only 2.4 were shown, so the cap — not the statistics —
 * was the binding constraint on a screen whose whole job is to report what it
 * found. Because the family collapse above already runs first, the rows this
 * admits are in DIFFERENT outcome families ("quercetin days show higher RMSSD" and
 * "...a higher daily score"), which are genuinely different claims rather than one
 * claim restated. The cap still exists so one driver cannot fill the visible four.
 */
export const MAX_PER_FACTOR = 4;
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

/* ---------- the early tier ---------- */

/**
 * A journal too young for the main sweep can still hold one thing worth saying,
 * and someone a week in deserves a glimpse of what this screen will become. The
 * early tier is the same sweep with lower COVERAGE floors and much higher
 * EVIDENCE bars, run only when the main sweep found nothing:
 *
 *   · Coverage: 8 paired days, 4 per side, same-day lag only. At 4-vs-4 the
 *     Mann–Whitney's smallest possible two-sided p is ~0.029, so p ≤ EARLY_MAX_P
 *     is only reachable by a near-perfect separation — the floor itself is what
 *     keeps a week of data honest.
 *   · Evidence: raw p ≤ EARLY_MAX_P AND |r| ≥ EARLY_MIN_EFFECT (2.5× the main
 *     sweep's floor) AND a BH pass at EARLY_FDR_Q over the early family.
 *   · Presentation: confidence is pinned to ONE pip and the UI badges every row
 *     "Early" — these are glimpses, and several will dissolve as days arrive.
 *
 * The same evidence bar ALSO serves a long journal that found nothing, which is a
 * completely different situation with the same empty screen. There the coverage
 * floors are the full MIN_PAIRS / MIN_GROUP and only the evidence bar is relaxed —
 * `tier: 'unconfirmed'` — because what those rows lack is not days but a pass
 * through the false-discovery correction. This matters more than it sounds: an
 * 81-day journal measured against this engine ran 772 tests, of which 124 reached
 * raw p < 0.05 and 35 reached p < 0.01, and exactly ONE survived BH at FDR_Q. A
 * screen that answers "nothing" to a person who has logged every day for three
 * months, while holding thirty associations at p < 0.01, is not being careful; it
 * is withholding. The tier's honesty comes from the badge and the copy, not from
 * refusing to show the rows at all.
 *
 * What both variants share, and what must not be relaxed: they run ONLY when the
 * strict sweep is empty, so a weak row can never sit beside a strong one and
 * borrow its authority; every row is pinned to one pip; and none is ever retained
 * by ./stability, so nothing enters the durable report at this bar.
 *
 * Measured against 12 independent 14-day noise journals: 3 produced one badged
 * hint each and 9 stayed silent (the noise-suite test pins that bound). That is
 * the tier's deliberate contract — EARLY_FDR_Q of 0.25 means "expect a quarter
 * of these to be flukes", which is why every row is badged, pinned to one pip,
 * and introduced by copy that says most will fade. Do not loosen any of these
 * constants without re-running that measurement.
 *
 * THE BH STEP IS NOT CEREMONY HERE, despite the raw-p bar sitting beside it, and
 * the reason is worth keeping because the naive measurement says the opposite.
 * Against noise journals whose factors are all BALANCED (a supplement taken half
 * the days), removing the BH step changes nothing: at n = 120 with 60 either side,
 * |r| >= 0.5 is simply out of noise's reach, so EARLY_MIN_EFFECT looks like the
 * only floor that matters. Add RARE factors — a trigger eight days in a hundred,
 * which is the shape of the most actionable thing in a real journal — and the
 * picture inverts, because eight days against seventy reach a large rank-biserial
 * on luck alone. Measured over 40 such journals: 1 seed produced rows with the BH
 * step, 5 produced 12 rows without it. Keeping it costs real findings (on the
 * journal that motivated this tier it dropped two, including the best one) and
 * that is the accepted price.
 */
export const EARLY_MIN_FACTOR_DAYS = 4;
export const MIN_PAIRS_EARLY = 8;
export const MIN_GROUP_EARLY = 4;
export const EARLY_MAX_P = 0.03;
export const EARLY_MIN_EFFECT = 0.5;
export const EARLY_FDR_Q = 0.25;
/** At most this many early rows — a glimpse, not a report. */
export const EARLY_MAX = 3;

/* ---------- regime changes are not on/off comparisons ---------- */

/**
 * The share of a binary factor's minority group that may sit in ONE contiguous
 * block before the factor stops being a day-level on/off comparison.
 *
 * THE FAILURE THIS EXISTS FOR, measured on a real 81-day journal. The user takes
 * quercetin on 64 days and not on 14 — comfortably past MIN_GROUP either side, so
 * the sweep tested it happily. But 13 of those 14 off-days are one unbroken run at
 * the very start of the journal: they started quercetin on June 12 and never
 * stopped. "Quercetin days vs non-quercetin days" is therefore not a comparison
 * between two kinds of day, it is the sentence "after June 12 vs before June 12"
 * with a supplement's name written on it. Every other thing that changed that
 * month — other supplements, the season, the arc of their recovery — is inside the
 * same contrast and cannot be separated from it.
 *
 * The damage is not theoretical and it is not conservative in one direction. Traced
 * week by week through that journal, quercetin → RMSSD read r = +0.75 (p = 0.001)
 * in late June when the split was a fair 13-vs-13 and both groups were local in
 * time, then decayed monotonically to r = −0.03 by mid-August as the on-group grew
 * to 61 days and swallowed a whole declining summer while the off-group stayed
 * frozen at 14. Same supplement, same journal, opposite answer, and nothing about
 * quercetin had changed. Meanwhile LF peak frequency happened to drift UP across
 * the same stretch and so scored r = +0.74 — the one survivor of a 772-test sweep,
 * and pure calendar.
 *
 * So a factor whose off-days are one episode is not evidence about the factor. It
 * is evidence about a period, and ./change is the module that reads periods: an
 * onset has a fixed split point, equal-length windows either side, and copy that
 * says "since you started" rather than "days with it show". Those factors are
 * excluded here and land there instead, which is a routing decision rather than a
 * suppression — the same data, read by the instrument that can actually read it.
 *
 * 0.75 rather than something tighter because the rule has to survive ordinary
 * gaps. A supplement someone genuinely alternates still produces the odd run of
 * four or five days (a trip, a stomach bug, waiting on a delivery), and on the same
 * journal the interleaved factors sat at 0.13–0.60 while the four true start/stops
 * sat at 0.80–1.00. There is a wide gap between those populations and the threshold
 * is in the middle of it.
 */
export const MAX_MINORITY_RUN_SHARE = 0.75;

/**
 * Is this binary column a regime change rather than a day-level on/off?
 *
 * Reads only the days where the factor is KNOWN (./matrix has already nulled the
 * era before the category was logged), so the run is measured against real
 * evidence rather than against a stretch of unknowns.
 *
 * Continuous columns are never regime changes: a factor with a real range is split
 * at its own median and both halves are drawn from the whole window.
 */
export function isRegimeChange(col: (number | null)[]): boolean {
  let on = 0, off = 0;
  for (const v of col) { if (v === 1) on++; else if (v === 0) off++; }
  if (!on || !off) return false;
  const minority = on <= off ? 1 : 0;
  const count = minority === 1 ? on : off;

  let longest = 0, run = 0;
  for (const v of col) {
    if (v == null) continue;          // an unlogged day breaks nothing: skip it
    if (v === minority) { run++; if (run > longest) longest = run; }
    else run = 0;
  }
  return longest / count >= MAX_MINORITY_RUN_SHARE;
}

/**
 * The factors this sweep must not test, because their two groups do not overlap
 * in time. Computed once per sweep and shared by every pass over the matrix, so
 * the correlation list, the early tier and the null-results card all agree about
 * what was actually testable.
 */
export function regimeFactorIds(matrix: DayMatrix): Set<string> {
  const out = new Set<string>();
  matrix.defs.forEach((f) => {
    if (f.kind !== 'binary') return;
    const col = matrix.factors[f.id];
    if (col && isRegimeChange(col)) out.add(f.id);
  });
  return out;
}

/**
 * Outcomes a correlation may target.
 *
 * Four exclusions, each for its own reason:
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
 *
 * `waterIntake` is excluded because drinking is a BEHAVIOR, not a physiological
 * response: nothing the user takes or does plausibly changes how much water they
 * pour, so "magnesium days show higher water consumption" is a claim about their
 * habits dressed up as a finding about their body. Water stays on the OTHER side
 * of the arrow — the `water:litres` / `water:goal` factors still test hydration
 * against real outcomes — and it keeps its Trend Watch row, where a one-column
 * "you're drinking less this month" is a fair observation.
 *
 * `lfPeak` is excluded because it is a LOCATION, not a magnitude, and the report
 * has no sentence it can honestly build from it. Every other outcome here answers
 * "how much" — RMSSD in ms, score in points, sleep in hours — and the reader knows
 * which way is better. LF peak frequency answers "where in the low-frequency band
 * did the spectrum peak", whose healthy direction is not monotone and whose row
 * reads "+0.03 Hz": a true statement that means nothing to anybody. It is also the
 * jumpiest column in the registry, because a spectral argmax hops a whole bin on a
 * single corrected beat, which makes it the member of the HRV family most likely to
 * separate two groups by chance. Measured on a real 81-day journal, it was the ONLY
 * survivor of a 772-test sweep and it took the Biggest-change card as well, so both
 * claims on the screen were about a quantity the app cannot explain, while RMSSD —
 * the number this population actually tracks — said nothing had moved. `FAMILY_RANK`
 * cannot fix that: the family collapse chooses among survivors, so it can never
 * promote RMSSD when RMSSD did not pass.
 *
 * It stays a scored component and keeps its Trend Watch row and its Progress chart.
 * It just may not be the subject of a sentence claiming X is linked to Y. `totalPower`
 * deliberately stays: it is a magnitude in ms² with an unambiguous direction, and it
 * is the family's fallback when RMSSD and SDNN are quiet.
 */
export const CORRELATION_OUTCOMES: TrendMetricId[] = INSIGHT_OUTCOMES.filter((id) =>
  id !== 'cleanDays' && id !== 'badDays' && id !== 'waterIntake' && id !== 'lfPeak'
  && TREND_METRICS[id].aggregate !== 'stdev');

export interface Correlation {
  id: string;
  factorId: string;
  /**
   * The factor's variant key (`variantOf || factorId`) — the same key the
   * MAX_PER_FACTOR cap counts by. Findings sharing a driverKey are one driver
   * seen in several outcome families, which is what the UI groups a row's
   * "+N" badge and the stacked finding sheet around.
   */
  driverKey: string;
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
  /** "+0.68" — the coefficient itself. Kept for the AI prompt and for tests; NOT
   *  shown in the UI, because a rank correlation is not a quantity anybody can act
   *  on and readers reasonably assume a signed decimal is a percentage. */
  rText: string;
  /**
   * The difference the reader can actually picture: the gap between the two medians,
   * signed and in the metric's own unit ("+12 ms").
   *
   * This is what the row shows. The strength of the evidence is the bar and the
   * confidence word; the SIZE of the association belongs in units, not in rho.
   */
  deltaText: string;
  /** The same gap with the unit split off, for a stat tile — which renders its
   *  unit smaller and dimmer and so cannot take a pre-joined string. */
  deltaValue: string;
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
  /** True for the weak tier (either variant below): badged in the UI, pinned to
   *  one confidence pip, never retained. */
  early?: boolean;
  /**
   * Which variant of the weak tier produced this row, so the card can say the
   * true thing about it. Absent on strict findings.
   *
   * `'early'` — a journal too YOUNG for the main sweep, tested at relaxed
   * coverage floors. The caveat is "there isn't much data yet; most of these
   * will fade".
   *
   * `'unconfirmed'` — a journal with plenty of data where the main sweep found
   * nothing. Coverage is the full MIN_PAIRS / MIN_GROUP; what these rows lack is
   * not days but EVIDENCE, having failed the false-discovery correction. The
   * caveat is the opposite one: "this did not clear our bar, treat it as a
   * question rather than an answer". Calling these "early" on an 80-day journal
   * would be a plain lie about why they are hedged.
   */
  tier?: EarlyTier;
}

/**
 * The ranked list folded into per-driver groups, order preserved.
 *
 * A driver that moved several outcome families is ONE story ("quercetin helps"),
 * not several rows' worth, so the UI shows its strongest finding with a "+N"
 * badge and stacks the rest inside the finding sheet. Grouping lives here rather
 * than in the component because which findings are "the same driver" is an
 * engine fact (`driverKey`, the MAX_PER_FACTOR key), not a presentation choice.
 *
 * Each group keeps the list's order: a group sits where its strongest member
 * ranked, and members within it are already strongest-first because the input is.
 */
export function groupCorrelations(list: Correlation[]): Correlation[][] {
  const index = new Map<string, number>();
  const groups: Correlation[][] = [];
  for (const c of list) {
    const at = index.get(c.driverKey);
    if (at == null) {
      index.set(c.driverKey, groups.length);
      groups.push([c]);
    } else {
      groups[at].push(c);
    }
  }
  return groups;
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
export interface Floors { pairs: number; group: number }

/** Which variant of the weak tier a row came from. See `Correlation.tier`. */
export type EarlyTier = 'early' | 'unconfirmed';

function test(matrix: DayMatrix, factor: FactorDef, def: TrendMetricDef, lag: number,
  floors: Floors = { pairs: MIN_PAIRS, group: MIN_GROUP }): Candidate | null {
  const outcomeCol = matrix.outcomes[def.id];
  const factorCol = matrix.factors[factor.id];
  if (!outcomeCol || !factorCol) return null;

  const { x: fv, y: ov } = pairs(laggedColumn(factorCol, lag), outcomeCol);
  if (fv.length < floors.pairs) return null;

  if (factor.kind === 'binary') {
    const withVals: number[] = [], withoutVals: number[] = [];
    for (let i = 0; i < fv.length; i++) (fv[i] ? withVals : withoutVals).push(ov[i]);
    if (withVals.length < floors.group || withoutVals.length < floors.group) return null;
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

/** "+12 ms" / "−0.4" — a signed median gap in the metric's own unit. The minus is a
 *  true minus sign, matching every other signed readout in the app. */
function deltaValue(def: TrendMetricDef, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '\u2212' : '';
  return `${sign}${def.fmt(Math.abs(delta))}`;
}

function deltaText(def: TrendMetricDef, delta: number): string {
  return `${deltaValue(def, delta)}${def.unit ? ` ${def.unit}` : ''}`;
}

/**
 * Does this finding have a difference the row can actually print?
 *
 * A rank test asks whether one group ORDERS above the other, which is not the
 * same question as whether the two groups differ by a printable amount. On a
 * journal where most days score 100, quercetin days ranked reliably below the
 * rest at r = −0.27 and p ≈ 3e-5 — a true statement about ordering — while both
 * medians were exactly 100. The row that produced read "Quercetin days show
 * lower next-day daily score" above a readout of "0", which is the app
 * contradicting itself inside a single row.
 *
 * So the last clinical bar is the reader's: whatever the statistics found, if the
 * gap disappears at the precision the metric is displayed to, there is nothing
 * here to tell anybody. Checked through `def.fmt` rather than against an epsilon,
 * because the threshold that matters is the one the user will see — a 0.004 ms
 * gap is real and unprintable, and both facts are the metric's own to define.
 */
function hasVisibleDelta(def: TrendMetricDef, high: number, low: number): boolean {
  return /[1-9]/.test(def.fmt(Math.abs(high - low)));
}

/** The one place a finding's id is spelled, shared by `describe` and the
 *  retention check so the two can never disagree about what names a finding. */
const candidateId = (c: Candidate) => `${c.factor.id}|${c.def.id}|${c.lag}`;

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
    driverKey: factor.variantOf || factor.id,
    driver: factor.driver,
    outcome: def.id,
    metric,
    unit: def.unit,
    lag,
    r: c.r,
    rText: signed(c.r),
    deltaText: deltaText(def, c.high - c.low),
    deltaValue: deltaValue(def, c.high - c.low),
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
 *
 * `retain` — finding ids a previous real report showed. A retained candidate
 * that fails the strict BH cut is re-admitted while its raw p stays at or under
 * RETAIN_P and it still clears the clinical bars; see ./stability for why entry
 * stays strict while exit is looser. On a fresh sweep (no retain) the behavior
 * is exactly what the noise suite measures.
 */
export function findCorrelations(matrix: DayMatrix, opts: { retain?: readonly string[] } = {}): Correlation[] {
  const retained = new Set(opts.retain || []);
  const regime = regimeFactorIds(matrix);
  const candidates: Candidate[] = [];

  matrix.defs.forEach((factor) => {
    // A start/stop is a period, not a kind of day. See MAX_MINORITY_RUN_SHARE —
    // it goes to ./change's onset analysis instead of being tested here.
    if (regime.has(factor.id)) return;
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
    // A candidate passes on its own merits, or coasts on a previous report's:
    // retention never admits anything the user hasn't already been shown, and its
    // q is this build's honest (weaker) q, so the confidence pips sag with it.
    .map((c, i) => ({ c, q: fdr.q[i], ok: fdr.rejected[i] || (retained.has(candidateId(c)) && c.p <= RETAIN_P) }))
    .filter((s) => s.ok)
    // Clinical bars, applied to what survived: too small to matter, or a
    // difference between two perfectly normal values.
    .filter((s) => Math.abs(s.c.r) >= MIN_EFFECT && worthSaying(s.c.def, s.c.high, s.c.low)
      && hasVisibleDelta(s.c.def, s.c.high, s.c.low))
    .map((s) => describe(s.c, s.q));

  // Strongest first, so the dedup passes below keep the best of each collision.
  survivors.sort((a, b) => (b.pips - a.pips) || (Math.abs(b.r) - Math.abs(a.r)));

  return pickRepresentatives(survivors, MAX_PER_FACTOR, MAX_CORRELATIONS);
}

/**
 * The early tier's sweep. See the EARLY_* constants above for the contract.
 *
 * Callers pass a matrix built with `buildFactors(..., { minDays:
 * EARLY_MIN_FACTOR_DAYS })` — at day eight of a journal the standard factor
 * floor produces no factors at all, which is precisely the situation this tier
 * exists for. Run it only when `findCorrelations` returned nothing.
 */
export function findEarlySignals(matrix: DayMatrix, opts: { floors?: Floors; tier?: EarlyTier } = {}): Correlation[] {
  const floors = opts.floors || { pairs: MIN_PAIRS_EARLY, group: MIN_GROUP_EARLY };
  const tier: EarlyTier = opts.tier || 'early';
  const regime = regimeFactorIds(matrix);
  const candidates: Candidate[] = [];
  matrix.defs.forEach((factor) => {
    if (regime.has(factor.id)) return;
    CORRELATION_OUTCOMES.forEach((id) => {
      if (factor.blocks.includes(OUTCOME_FAMILY[id])) return;
      // Same-day only: a lagged column halves the effective coverage this tier
      // barely has, and a next-day claim on eight days is not a glimpse, it's a guess.
      const c = test(matrix, factor, TREND_METRICS[id], 0, floors);
      if (c) candidates.push(c);
    });
  });
  if (!candidates.length) return [];

  const fdr = benjaminiHochberg(candidates.map((c) => c.p), EARLY_FDR_Q);
  const survivors = candidates
    .map((c, i) => ({ c, q: fdr.q[i], ok: fdr.rejected[i] }))
    .filter((s) => s.ok && s.c.p <= EARLY_MAX_P)
    .filter((s) => Math.abs(s.c.r) >= EARLY_MIN_EFFECT && worthSaying(s.c.def, s.c.high, s.c.low)
      && hasVisibleDelta(s.c.def, s.c.high, s.c.low))
    // ONE pip, whatever the numbers say: eight days cannot earn more, and the
    // pinned value is what keeps the card's own confidence strip honest.
    .map((s) => ({ ...describe(s.c, s.q), early: true, tier, pips: 1, confidence: confidenceLabel(1) }));

  survivors.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  // One row per driver — a glimpse names the driver once.
  return pickRepresentatives(survivors, 1, EARLY_MAX);
}

/* ---------- no detectable impact ---------- */

/**
 * The null results worth stating: a med or supplement the user has clearly
 * committed to, thoroughly tested, and that moved nothing.
 *
 * A null result is only interesting for a deliberate intervention — "walking
 * had no impact" reads as an accusation and "nausea had no impact" as nonsense,
 * so only the medication/supplement groups qualify. And it is only HONEST when
 * the data could have shown an effect: three weeks with it, two without, and a
 * real test against at least NO_IMPACT_MIN_OUTCOMES metrics. Anything less is
 * "not enough data yet", which is a different sentence this card must not say.
 *
 * The copy stays "no DETECTABLE effect": absence of evidence at this sample
 * size, never proof of absence — the help dot carries that caveat in full.
 */
export const NO_IMPACT_MIN_DAYS_ON = 21;
export const NO_IMPACT_MIN_DAYS_OFF = 14;
export const NO_IMPACT_MIN_OUTCOMES = 5;
export const MAX_NO_IMPACT = 3;

export interface NoImpactItem {
  driverKey: string;
  /** "Tylenol" — the row's subject. */
  driver: string;
  daysOn: number;
  /** How many outcome metrics the sweep actually ran against it. */
  tested: number;
  /** "34 days with it · 12 metrics" — the row's right-hand readout. */
  note: string;
}

/**
 * Every well-tested med/supplement with zero findings anywhere in the report.
 * Callers pass everything the report is showing, because a driver with a
 * finding of ANY tier is the opposite of a null result.
 */
export function findNoImpact(matrix: DayMatrix, shown: {
  correlations: Correlation[];
  early: Correlation[];
  changeFactorId: string | null;
}): NoImpactItem[] {
  const withFindings = new Set<string>([
    ...shown.correlations.map((c) => c.driverKey),
    ...shown.early.map((c) => c.driverKey),
  ]);
  if (shown.changeFactorId) {
    const f = matrix.defs.find((d) => d.id === shown.changeFactorId);
    withFindings.add((f && f.variantOf) || shown.changeFactorId);
  }

  const regime = regimeFactorIds(matrix);
  const out: NoImpactItem[] = [];
  for (const factor of matrix.defs) {
    if (factor.group !== 'medication' && factor.group !== 'supplement') continue;
    // Never tested, so never a null result. Saying "no detectable impact" about a
    // supplement the sweep refused to test would be the most misleading sentence
    // on the screen — the honest answer for a start/stop is ./change's before and
    // after, or nothing at all.
    if (regime.has(factor.id)) continue;
    const driverKey = factor.variantOf || factor.id;
    if (withFindings.has(driverKey)) continue;

    const col = matrix.factors[factor.id];
    if (!col) continue;
    let on = 0, off = 0;
    for (const v of col) { if (v === 1) on++; else if (v === 0) off++; }
    if (on < NO_IMPACT_MIN_DAYS_ON || off < NO_IMPACT_MIN_DAYS_OFF) continue;

    // "Tested" means the same coverage bar the real sweep applies — an outcome
    // the user barely logs was not tested against this, and must not count
    // toward "we looked everywhere".
    let tested = 0;
    for (const id of CORRELATION_OUTCOMES) {
      if (factor.blocks.includes(OUTCOME_FAMILY[id])) continue;
      if (test(matrix, factor, TREND_METRICS[id], 0)) tested++;
    }
    if (tested < NO_IMPACT_MIN_OUTCOMES) continue;

    out.push({
      driverKey,
      driver: factor.driver,
      daysOn: on,
      tested,
      note: `${on} days with it · ${tested} metrics`,
    });
  }
  // The most-committed nulls first: a null result is worth more the longer the
  // user has been paying for it.
  return out
    .sort((a, b) => (b.daysOn - a.daysOn) || (a.driver < b.driver ? -1 : 1))
    .slice(0, MAX_NO_IMPACT);
}

/**
 * Group first, choose second.
 *
 * Collapse across the driver's variant key, the outcome family, AND the lag.
 * "Any activity", "activity minutes" and "heavy exertion" against the score is
 * one finding; alcohol against RMSSD today and tomorrow is one finding.
 *
 * A group's POSITION comes from its strongest member, because the input is
 * already strongest-first and a group is registered when its best member is
 * reached — so a family does not lose its place in the list just because its
 * canonical metric is a shade weaker than a sibling. Its REPRESENTATIVE is then
 * chosen by `familyRank`, not by strength: see the note on FAMILY_RANK for why
 * picking the strongest made the reported metric drift under the reader.
 */
function pickRepresentatives(survivors: Correlation[], maxPerFactor: number, maxTotal: number): Correlation[] {
  const groups: { key: string; driverKey: string; members: Correlation[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const c of survivors) {
    const familyKey = `${c.driverKey}|${OUTCOME_FAMILY[c.outcome]}`;
    const at = groupIndex.get(familyKey);
    if (at == null) {
      groupIndex.set(familyKey, groups.length);
      groups.push({ key: familyKey, driverKey: c.driverKey, members: [c] });
    } else {
      groups[at].members.push(c);
    }
  }

  const perFactor = new Map<string, number>();
  const out: Correlation[] = [];
  for (const g of groups) {
    const used = perFactor.get(g.driverKey) || 0;
    if (used >= maxPerFactor) continue;
    // Canonical metric first; among equal ranks (and for unlisted metrics) fall
    // back to the strongest, and finally to the id so the result is total.
    const pick = g.members.slice().sort((a, b) =>
      (familyRank(a.outcome) - familyRank(b.outcome))
      || (Math.abs(b.r) - Math.abs(a.r))
      || (a.lag - b.lag)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    perFactor.set(g.driverKey, used + 1);
    out.push(pick);
    if (out.length >= maxTotal) break;
  }
  return out;
}
