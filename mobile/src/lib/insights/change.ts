/**
 * The single loudest thing that happened, for the card at the top of Insights.
 *
 * This asks a different question from ./correlate. A correlation is a standing
 * association across the whole window ("trigger days run lower"); a change is an
 * event with a before and an after ("since you started magnesium"). The second is
 * far more useful to read first, because it is the one a person can act on, and
 * far easier to get wrong, because a before/after split will always find SOME
 * difference if you let it choose the split point freely.
 *
 * Two candidate shapes, and the guards that keep them honest:
 *
 * ONSET — the first day a factor appears. The split point is therefore fixed by
 * the data rather than chosen to maximise the effect, which is the whole reason
 * this is defensible. Both sides need MIN_SIDE days of the outcome, the windows
 * are trimmed to EQUAL length so a 60-day "after" can't be compared against a
 * 5-day "before", and the difference is tested with the same rank test
 * ./correlate uses.
 *
 * SHIFT — an outcome that simply moved, month against month, straight through
 * ../trends/compareWindows so its thresholds are the ones the rest of the app
 * already agrees on.
 *
 * Copy stays associational: "SDNN is up since you started magnesium" states the
 * order of events, which is all that is known. It does not say magnesium did it.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { OUTCOME_FAMILY, TREND_METRICS, TREND_WINDOW_DAYS, compareWindows, type TrendMetricDef, type TrendMetricId } from '../trends';
import { CORRELATION_OUTCOMES, MIN_EFFECT, midSentence, shortMetric } from './correlate';
import type { DayMatrix } from './matrix';
import { benjaminiHochberg, confidenceLabel, confidencePips, mannWhitney, type ConfidenceLabel } from './stats';

/** Days of the outcome needed on each side of an onset. */
export const MIN_SIDE = 10;
/** A change has to clear this to be worth the top of the screen. */
export const CHANGE_FDR_Q = 0.10;
/** An onset older than this is history, not "this month". */
export const MAX_ONSET_AGE_DAYS = 120;

export interface BiggestChange {
  id: string;
  kind: 'onset' | 'shift' | 'welcome';
  /** The columns behind the claim, for ./detail. `outcome` is null only on the
   *  fabricated welcome card, which has no data to chart. */
  outcome: TrendMetricId | null;
  factorId: string | null;
  /** Index into the matrix's key range where the before/after split sits. */
  onsetIndex: number | null;
  /** "SDNN is up since you started magnesium glycinate" */
  headline: string;
  /** "In the 24 days since, SDNN averaged 12 ms higher than the 24 days before." */
  body: string;
  /**
   * The three stat tiles, split into numeral and unit.
   *
   * Progress's tile draws the number in Manrope at 25pt with the unit trailing in
   * 12pt, so the two have to arrive separately — a pre-joined "41 ms" would render
   * the unit at numeral size and break the row's rhythm.
   */
  beforeValue: string;
  afterValue: string;
  /** Shared by before and after, e.g. "ms". */
  unit: string;
  /** Relative change where that is meaningful ("+29"), else the absolute delta. */
  changeValue: string;
  changeUnit: string;
  beforeLabel: string;
  afterLabel: string;
  /** Formatted for display, e.g. "41 ms". Still used by the AI prompt. */
  beforeText: string;
  afterText: string;
  /** Raw, for anything that needs to compare them. */
  before: number;
  after: number;
  good: boolean;
  pips: number;
  confidence: ConfidenceLabel;
}

const bandDistance = (v: number, target: [number, number]) =>
  (v < target[0] ? target[0] - v : v > target[1] ? v - target[1] : 0);

function isGood(def: TrendMetricDef, after: number, before: number): boolean {
  if (def.better === 'band' && def.target) return bandDistance(after, def.target) < bandDistance(before, def.target);
  return def.better === 'up' ? after > before : after < before;
}

/** Two values both inside a banded metric's target are not a change worth the top
 *  of the screen — same rule ./correlate and ../trends/compare apply. */
function worthSaying(def: TrendMetricDef, after: number, before: number): boolean {
  if (def.better !== 'band' || !def.target) return true;
  return bandDistance(after, def.target) > 0 || bandDistance(before, def.target) > 0;
}

interface Cand {
  kind: 'onset' | 'shift';
  id: string;
  def: TrendMetricDef;
  /** The onset's noun ("magnesium glycinate"), or null for a shift. */
  driver: string | null;
  /** Which outcome moved, and (for an onset) which factor's first day split it.
   *  Carried so ./detail can hand the sheet the very columns this was computed
   *  from, rather than re-deriving them from the id string. */
  outcome: TrendMetricId;
  factorId: string | null;
  onsetAt: number | null;
  before: number;
  after: number;
  n: number;
  spanDays: number;
  r: number;
  p: number;
}

/** First index where a factor column reads 1, or -1. */
function onsetIndex(col: (number | null)[]): number {
  for (let i = 0; i < col.length; i++) if (col[i] === 1) return i;
  return -1;
}

/** First index where the factor is known at all, or -1 — the start of the active
 *  window ./matrix computed. */
function firstKnownIndex(col: (number | null)[]): number {
  for (let i = 0; i < col.length; i++) if (col[i] != null) return i;
  return -1;
}

/**
 * Onset candidates: for each binary factor's first appearance, every outcome
 * compared before against after.
 */
function onsetCandidates(matrix: DayMatrix): Cand[] {
  const out: Cand[] = [];
  const total = matrix.keys.length;

  matrix.defs.forEach((factor) => {
    // Only factors that represent something a person STARTED. See
    // FactorDef.onsetNoun: without this gate the first night somebody slept seven
    // hours reads as an intervention, and the card reported a symptom of recovery
    // as its cause.
    if (factor.kind !== 'binary' || !factor.onsetNoun) return;
    const col = matrix.factors[factor.id];
    if (!col) return;
    const at = onsetIndex(col);
    // Needs room either side, and has to be recent enough to still be news.
    if (at < MIN_SIDE || at > total - MIN_SIDE) return;
    if (total - at > MAX_ONSET_AGE_DAYS) return;

    // THE CONFOUND THIS GUARD EXISTS FOR. If the user began logging the whole
    // category on the same day they started this one thing, the "before" side is
    // the pre-logging era — which for most people is also when they were sickest
    // and least organised. Comparing across it attributes an entire era of their
    // life to one supplement. The before window must therefore sit inside the
    // active span, where we actually know the factor was ABSENT.
    const known = firstKnownIndex(col);
    if (known < 0 || at - known < MIN_SIDE) return;

    CORRELATION_OUTCOMES.forEach((id) => {
      if (factor.blocks.includes(OUTCOME_FAMILY[id])) return;
      const def = TREND_METRICS[id];
      const series = matrix.outcomes[id];
      if (!series) return;

      // Equal-length windows either side of the onset, and the before side
      // clipped to the active span. Without the equal lengths, a factor started
      // on day 12 of 180 would compare 12 days against 168 and report whatever
      // the year happened to do.
      const span = Math.min(at - known, total - at);
      const before: number[] = [], after: number[] = [];
      for (let i = at - span; i < at; i++) { const v = series[i]; if (v != null) before.push(v); }
      for (let i = at; i < at + span; i++) { const v = series[i]; if (v != null) after.push(v); }
      if (before.length < MIN_SIDE || after.length < MIN_SIDE) return;

      const g = mannWhitney(after, before);
      if (!Number.isFinite(g.median1) || !Number.isFinite(g.median2)) return;
      if (g.median1 === g.median2) return;
      out.push({
        kind: 'onset', id: `onset:${factor.id}|${id}`, def, driver: factor.onsetNoun as string,
        outcome: id, factorId: factor.id, onsetAt: at,
        before: g.median2, after: g.median1, n: before.length + after.length,
        spanDays: span, r: g.r, p: g.p,
      });
    });
  });
  return out;
}

/**
 * Shift candidates: an outcome that moved month against month.
 *
 * Reuses `compareWindows`, so the "is this big enough to mention" question is
 * answered by the registry's own clinical thresholds rather than by a second
 * opinion invented here. `p` is synthesised from the same rank test applied to
 * the two windows, so shifts and onsets can compete in one FDR family.
 */
function shiftCandidates(matrix: DayMatrix): Cand[] {
  const out: Cand[] = [];
  const W = TREND_WINDOW_DAYS;

  CORRELATION_OUTCOMES.forEach((id) => {
    const series = matrix.outcomes[id];
    if (!series || series.length < W * 2) return;
    const def = TREND_METRICS[id];
    const delta = compareWindows(series, W, W, def);
    if (!delta.significant) return;

    const recent = series.slice(series.length - W).filter((v): v is number => v != null);
    const prior = series.slice(series.length - W * 2, series.length - W).filter((v): v is number => v != null);
    const g = mannWhitney(recent, prior);
    out.push({
      kind: 'shift', id: `shift:${id}`, def, driver: null,
      outcome: id, factorId: null, onsetAt: null,
      before: delta.prior, after: delta.recent, n: delta.recentN + delta.priorN,
      spanDays: W, r: g.r, p: g.p,
    });
  });
  return out;
}

/**
 * How loud a candidate is, for picking between them.
 *
 * Confidence leads, because a weakly-evidenced claim at the top of the screen
 * costs more than a strong but small one. Effect size breaks ties, and an onset
 * beats a shift at equal strength because it names something the user did.
 */
/**
 * How legible the outcome is, as a tie-breaker.
 *
 * Confidence and effect size routinely tie at the top (several outcomes move
 * together), and the winner then came down to registry order — which is how the
 * demo ended up leading with diastolic pressure over the daily score. The app's
 * own headline numbers win a tie, because they are the ones the user already
 * knows how to read.
 */
const HEADLINE_RANK: Partial<Record<TrendMetricId, number>> = {
  score: 4, rmssd: 3, sdnn: 3, restingHr: 2, sleepDuration: 2, symptomLoad: 2,
};

const loudness = (pips: number, r: number, kind: string, id: TrendMetricId) =>
  pips * 100 + Math.abs(r) * 50 + (HEADLINE_RANK[id] || 0) * 2 + (kind === 'onset' ? 1 : 0);

export function findBiggestChange(matrix: DayMatrix): BiggestChange | null {
  const cands = [...onsetCandidates(matrix), ...shiftCandidates(matrix)];
  if (!cands.length) return null;

  // Correct over the whole family first, then apply the clinical bars to the
  // survivors — never the other way round, for the reason ./correlate documents.
  const fdr = benjaminiHochberg(cands.map((c) => c.p), CHANGE_FDR_Q);
  let best: { c: Cand; q: number; pips: number } | null = null;
  cands.forEach((c, i) => {
    if (!fdr.rejected[i]) return;
    if (Math.abs(c.r) < MIN_EFFECT || !worthSaying(c.def, c.after, c.before)) return;
    const pips = confidencePips(fdr.q[i], Math.abs(c.r), c.n);
    if (!best || loudness(pips, c.r, c.kind, c.def.id) > loudness(best.pips, best.c.r, best.c.kind, best.c.def.id)) best = { c, q: fdr.q[i], pips };
  });
  if (!best) return null;

  const { c, pips } = best as { c: Cand; q: number; pips: number };
  const def = c.def;
  const metric = shortMetric(def);
  const good = isGood(def, c.after, c.before);
  const up = c.after > c.before;
  const magnitude = def.fmt(Math.abs(c.after - c.before));

  const headline = c.kind === 'onset'
    ? `${metric} is ${up ? 'up' : 'down'} since you started ${c.driver}`
    : `${metric} has ${up ? 'risen' : 'fallen'} over the last month`;

  const said = midSentence(metric);
  const body = c.kind === 'onset'
    ? `In the ${c.spanDays} days since, ${said} ran ${magnitude} ${def.unit} ${up ? 'higher' : 'lower'} than the ${c.spanDays} days before. This is an association in your own log, not proof of a cause.`
    : `Across the last ${c.spanDays} days, ${said} ran ${magnitude} ${def.unit} ${up ? 'higher' : 'lower'} than the ${c.spanDays} days before.`;

  // A percentage only where a ratio actually means something, which the registry
  // already knows: `deltaKind === 'relative'` is exactly the metrics whose own
  // threshold is a fraction of the baseline (the HRV family). Everywhere else it
  // would mislead — the daily score is a 0-100 index, so 28 to 61 is "+33 pts", not
  // the "+118%" an unguarded ratio produces; counts and banded metrics are worse
  // still, since "+8%" on a systolic reading implies more is better.
  const relative = def.deltaKind === 'relative' && Math.abs(c.before) > 0.0001;
  const rel = Math.round(((c.after - c.before) / Math.abs(c.before)) * 100);
  const absDelta = c.after - c.before;

  return {
    id: c.id,
    kind: c.kind,
    outcome: c.outcome,
    factorId: c.factorId,
    onsetIndex: c.onsetAt,
    headline,
    body,
    beforeValue: def.fmt(c.before),
    afterValue: def.fmt(c.after),
    unit: def.unit,
    changeValue: relative ? `${rel > 0 ? '+' : ''}${rel}` : `${absDelta > 0 ? '+' : ''}${def.fmt(absDelta)}`,
    changeUnit: relative ? '%' : def.unit,
    beforeLabel: 'Before',
    afterLabel: 'After',
    beforeText: `${def.fmt(c.before)} ${def.unit}`,
    afterText: `${def.fmt(c.after)} ${def.unit}`,
    before: c.before,
    after: c.after,
    good,
    pips,
    confidence: confidenceLabel(pips),
  };
}

/**
 * What the card says on an empty journal.
 *
 * Deliberately a joke, and deliberately the only fabricated finding in the whole
 * engine — it sits above a demo-data banner, so nothing here can be mistaken for
 * the user's own numbers.
 */
export const WELCOME_CHANGE: BiggestChange = {
  id: 'welcome',
  kind: 'welcome',
  // No columns behind it, because there is no finding behind it. The detail sheet
  // reads this as "nothing to chart" and the card stays untappable.
  outcome: null,
  factorId: null,
  onsetIndex: null,
  headline: 'You downloaded this app',
  body: 'Easily the biggest change this month. Log a few days and this card starts reporting the real ones: what you changed, what moved, and how sure we are about it.',
  beforeValue: '0',
  afterValue: '1',
  unit: 'app',
  changeValue: '+100',
  changeUnit: '%',
  beforeLabel: 'Before',
  afterLabel: 'After',
  beforeText: 'Guessing',
  afterText: 'Measuring',
  before: 0,
  after: 1,
  good: true,
  pips: 5,
  confidence: 'Very strong',
};

/** Outcome ids a change may be reported for, exported for the tests. */
export const CHANGE_OUTCOMES: TrendMetricId[] = CORRELATION_OUTCOMES;
