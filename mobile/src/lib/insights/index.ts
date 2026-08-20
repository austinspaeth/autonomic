/**
 * Public API for on-device discovery: the one call that produces everything the
 * Insights view renders.
 *
 * THE RULES THAT MUST NOT BREAK, all of them enforced in the modules below and
 * all of them there because the alternative is the app confidently telling
 * somebody with a chronic illness something untrue about their own body:
 *
 * 1. RANK STATISTICS ONLY, MEDIANS ONLY. ./stats. Never a mean, never Pearson.
 * 2. ONE FALSE-DISCOVERY FAMILY PER SWEEP. ./correlate, ./change. Broad search is
 *    only safe because it is corrected; correcting per-outcome or per-group would
 *    silently undo it.
 * 3. FACTORS HAVE ACTIVE WINDOWS. ./factors, applied in ./matrix. The months
 *    before somebody started logging supplements are not supplement-free months.
 * 4. COPY IS ASSOCIATIONAL, NEVER CAUSAL. Every headline in ./correlate and
 *    ./change states what was observed and in what order. "X is up since you
 *    started Y", never "Y raised X".
 * 5. THE ANSWER IS ALLOWED TO BE NOTHING. An empty report is the correct output
 *    for a thin or noisy journal and is far better than a plausible invention.
 * 6. OUTCOME METRICS LIVE IN ../trends/metrics AND NOWHERE ELSE. Adding something
 *    the app can make a claim about is a row in that registry.
 *
 * Trend Watch is the one place the app's "never volunteer bad news" rule is
 * relaxed — see ./watch for why, and note that `findTrend` in ../trends is
 * unchanged and still governs the Journal card and the widgets.
 *
 * Cost: one pass over the window (~180 days), dominated by `scoreSet` at roughly
 * what Progress already pays, plus a few thousand rank operations on arrays of
 * ≤180. Callers should still build it off the interaction thread and cache it —
 * see ./cache.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { addDays, dateFromKey } from '../dates';
import type { ScoreContext } from '../scoring';
import { detectDownturn } from '../scoring/downturn';
import { resolveProtocol } from '../scoring/day';
import { INSIGHT_OUTCOMES, keyRange } from '../trends';
import type { AppState } from '../types';
import { WELCOME_CHANGE, findBiggestChange, type BiggestChange } from './change';
import { changeSeries, correlationSeries, type DetailSeries } from './detail';
import { dataConfidence, type DataConfidence } from './confidence';
import { EARLY_MIN_FACTOR_DAYS, MIN_GROUP, MIN_PAIRS, findCorrelations, findEarlySignals, findNoImpact, type Correlation, type NoImpactItem } from './correlate';
import { buildFactors, factorProgress, type FactorProgress } from './factors';
import { buildDayMatrix } from './matrix';
import { findObservations, type Observation } from './observations';
import { changeSinceStart, findWatchItems, overallDirection, type Overall, type SinceStart, type WatchItem } from './watch';

export type { BiggestChange } from './change';
export type { DetailSeries } from './detail';
export { factorPeak, markColumn } from './detail';
export type { Correlation, NoImpactItem } from './correlate';
export type { Observation } from './observations';
export type { WatchItem, Overall, OverallDirection, SinceStart } from './watch';
export type { ConfidencePart, DataConfidence } from './confidence';
export type { FactorDef, FactorGroup, FactorKind, FactorProgress } from './factors';
export type { ConfidenceLabel } from './stats';
export { WELCOME_CHANGE } from './change';
export { CONFIDENCE_LABELS, confidenceLabel } from './stats';

/**
 * The day the empty screen counts toward: two weeks.
 *
 * NOT a threshold in the engine — there isn't one number to point at. The real
 * floors are staggered: an observation can land at 8 logged days, a correlation
 * with a continuous driver at `MIN_PAIRS` (12) paired days, one with a binary
 * driver at `MIN_GROUP * 2` (16), an onset change at 20, and anything
 * month-against-month at 60. A counter aimed at the last of those would be
 * telling someone on day three to come back in two months, which is both
 * discouraging and false — things do show up long before then.
 *
 * Two weeks is where a normally-logged journal has usually cleared the first
 * couple of floors, and it is a span people can actually picture. The counter is
 * therefore a "you are nearly there", not a promise: the copy beside it says the
 * screen fills in as you go, and the day-14 screen still says "nothing solid yet"
 * when nothing has separated from the noise.
 *
 * `insights/__tests__/detail.test.ts` pins it inside the engine's own range, so
 * lowering a floor cannot leave it stranded above every one of them.
 */
export const INSIGHT_MIN_DAYS = 14;
export { MAX_OBSERVATIONS } from './observations';
export { MAX_WATCH_ITEMS } from './watch';
export { MAX_CORRELATIONS, groupCorrelations, shortMetric } from './correlate';
export { INSIGHTS_HELP } from './help';

/**
 * How far back the engine looks.
 *
 * Six months, not everything. Two reasons, and the second is the real one: cost
 * grows linearly with the window, and a factor's relationship to an outcome two
 * years ago is not evidence about the same relationship now — medication,
 * baseline and season have all moved. A long journal gets a sharper answer from a
 * recent window than a diluted one from all of it.
 */
export const ANALYSIS_DAYS = 180;

/** Correlations visible before the user asks for the rest. */
export const VISIBLE_CORRELATIONS = 4;


export interface InsightReport {
  /** The day the report was computed for. */
  dk: string;
  /** True when this was built from the sample month rather than the user's data. */
  demo: boolean;
  change: BiggestChange | null;
  correlations: Correlation[];
  /**
   * The early tier: weak-but-striking associations found at relaxed coverage
   * floors, for a journal the main sweep has nothing to say about yet. Only
   * ever non-empty when `correlations` is empty; each row carries `early: true`
   * and one confidence pip, and the UI badges it. See EARLY_* in ./correlate.
   */
  early: Correlation[];
  /**
   * Types closest to becoming testable ("Magnesium · 5 of 8 days"), for the
   * empty screen's keep-going rows. Only populated when `correlations` is empty
   * — the situation in which the distance to the first finding is the useful
   * thing to show.
   */
  progress: FactorProgress[];
  /**
   * Meds/supplements the user has clearly committed to, thoroughly tested, and
   * that moved nothing — the null results worth stating. See findNoImpact.
   */
  noImpact: NoImpactItem[];
  /**
   * The evidence behind each finding, keyed by `Correlation.id` /
   * `BiggestChange.id`: the outcome and factor columns it was computed from.
   *
   * Kept as a map beside the findings rather than as a field on each one, so the
   * claim objects stay small enough to log and to diff, and so anything that only
   * wants to READ the findings never carries a few thousand numbers with it.
   * Built here because ./matrix exists only during a build.
   */
  detail: Record<string, DetailSeries>;
  observations: Observation[];
  watch: WatchItem[];
  confidence: DataConfidence;
  /** Days in the journal with any record — the header's count. */
  daysLogged: number;
  /** True while a downturn is active, which is why `watch` may be empty. */
  downturn: boolean;
  /** Where the whole journal is heading. */
  overall: Overall;
  /**
   * The header's claim: the daily score now against the daily score at the very
   * start of the journal. Null when there isn't enough to compare, in which case
   * the header states its window instead.
   */
  since: SinceStart | null;
  /**
   * How many days the findings were actually computed from: the span of the
   * user's own history, capped at ANALYSIS_DAYS. This is what the header states,
   * because "what window is this?" is the question every claim below depends on.
   */
  windowDays: number;
  /** Wall-clock cost of the build, for the perf check. */
  ms: number;
  /**
   * This report is the one `emptyReport` hands back after a build THREW, not a
   * genuine "nothing found".
   *
   * The two look identical in the data and are completely different facts, so the
   * view has to be able to tell them apart: "there isn't enough here yet" invites
   * the user to keep logging, and saying that after a crash would be a lie about
   * their own journal. Never set by `buildInsights`, which either returns a real
   * report or throws.
   */
  failed?: boolean;
}

/**
 * Build the whole report.
 *
 * `demo` is passed by the caller rather than inferred, because the caller has
 * already decided whether to hand us the user's state or the sample month and the
 * two must not disagree about what the banner says.
 */
export function buildInsights(state: AppState, dk: string, opts: {
  demo?: boolean;
  ctx?: ScoreContext;
  anchor?: string | null;
  /** Finding ids a previous real report showed, from ./findingMemory via the
   *  shell (./cache). See ./stability: strict to enter, looser to stay. */
  retain?: { correlations: readonly string[]; change: string | null };
} = {}): InsightReport {
  const started = Date.now();
  const ctx: ScoreContext = opts.ctx || {
    sex: state.profile.sex,
    height: state.profile.height,
    protocol: resolveProtocol(state.settings.protocol),
    customTypes: state.customTypes,
  };

  // THE ANALYSIS ENDS AT THE LAST COMPLETE DAY, NOT AT TODAY.
  //
  // Today is a day in progress: at 7am it holds no water, no meds and no symptoms,
  // and ./matrix writes those as a real 0 rather than null (the span-presence rule
  // only nulls days from before a category was ever logged). So a half-logged today
  // enters every window as a genuine "drank nothing, took nothing" day and then
  // flips as the user logs. That is 1/180 for the correlation sweep and harmless,
  // but ./watch compares 30 days against 30 and `changeSinceStart` compares 14
  // against 14 — there today is 3% and 7% of the number in the largest text on the
  // screen, and a single symptom logged at 3pm was enough to delete a whole Trend
  // Watch row. Measured across 30 synthetic journals × 5 in-day updates: 39/150
  // rebuilds changed the report with today in the window, 0/150 with it excluded.
  //
  // Insights answers "what does my history say", so it reads history. Today's data
  // is not lost, it joins the analysis tomorrow, when it is a complete day.
  const analysisDk = addDays(dk, -1);
  const keys = keyRange(analysisDk, ANALYSIS_DAYS, addDays);
  const defs = buildFactors(state, keys);
  const matrix = buildDayMatrix(state, keys, INSIGHT_OUTCOMES, defs, ctx);

  // One downturn check for the whole report, and the ONE thing here still anchored
  // to today: this is the crash-safety gate, and "are you heading into a crash" is a
  // question about right now. It gates ./watch and tells the caller why the section
  // is empty.
  const downturn = !!detectDownturn(state.days, dk, ctx, ctx.protocol, state.customTypes);

  const correlations = findCorrelations(matrix, { retain: opts.retain?.correlations });
  // On an empty journal the headline slot is the welcome card, unconditionally —
  // whatever the sample month happens to contain, the honest headline for someone
  // with no data is that they just arrived.
  const change = opts.demo ? WELCOME_CHANGE : findBiggestChange(matrix, { retain: opts.retain?.change });

  // The early tier, only when the strict sweep came back empty (the demo month is
  // never "early"). Its matrix is rebuilt at the relaxed factor floor, because at
  // day eight the standard floor produces no factors at all — a second pass, but
  // one only ever paid on a journal too small for the first to have cost anything.
  // One pass over the findings to keep the columns they were computed from. The
  // sheet must never re-extract them: a second extraction is a second chance to
  // disagree with the statistics the card is showing.
  const detail: Record<string, DetailSeries> = {};
  correlations.forEach((c) => { const s = correlationSeries(matrix, c); if (s) detail[c.id] = s; });
  if (change) { const s = changeSeries(matrix, change); if (s) detail[change.id] = s; }

  let early: Correlation[] = [];
  let progress: FactorProgress[] = [];
  if (!opts.demo && !correlations.length) {
    // The weak tier, in two variants that answer two different empty screens. Try
    // the one that needs no excuses first: FULL coverage on the matrix we already
    // built, with only the evidence bar relaxed. That is the honest tier for a
    // long, well-logged journal where the correction happened to clear the board —
    // those rows are short of evidence, not of days, and calling them "early"
    // would misdescribe why they are hedged.
    early = findEarlySignals(matrix, { floors: { pairs: MIN_PAIRS, group: MIN_GROUP }, tier: 'unconfirmed' });
    early.forEach((c) => { const s = correlationSeries(matrix, c); if (s) detail[c.id] = s; });

    // Only if that found nothing does the young-journal variant run, on a second
    // matrix built at the relaxed factor floor — at day eight the standard floor
    // produces no factors at all, which is the situation it exists for.
    if (!early.length) {
      const earlyDefs = buildFactors(state, keys, { minDays: EARLY_MIN_FACTOR_DAYS });
      const earlyMatrix = buildDayMatrix(state, keys, INSIGHT_OUTCOMES, earlyDefs, ctx);
      early = findEarlySignals(earlyMatrix);
      // Evidence columns from the EARLY matrix — the relaxed factors have no
      // columns in the main one.
      early.forEach((c) => { const s = correlationSeries(earlyMatrix, c); if (s) detail[c.id] = s; });
    }
    progress = factorProgress(state, keys);
  }

  // The null results: only for real journals — the demo month is a sales floor,
  // and "this did nothing" is not a sentence to fabricate.
  const noImpact = opts.demo ? [] : findNoImpact(matrix, {
    correlations, early, changeFactorId: change ? change.factorId : null,
  });

  const observations = findObservations({ matrix, state, dk: analysisDk });
  const watch = findWatchItems(matrix, downturn);
  // NOT gated on the downturn. Trend Watch hides its five red rows during one, but
  // the header saying "Trending down" in a single calm line is the honest headline
  // for exactly that situation, and suppressing it would leave the screen mute at
  // the moment it has the most to say.
  const overall = overallDirection(matrix);
  // Reads the two ENDS of the whole journal rather than the analysis window, so
  // "day one" is genuinely day one. Cheap: 28 scored days regardless of length.
  const since = changeSinceStart(state.days, analysisDk, ctx, opts.anchor);
  const confidence = dataConfidence(state.days, analysisDk);

  // The window a claim could have been computed from: the user's own span, capped.
  // Reported rather than assumed, so the header cannot promise 180 days of analysis
  // to somebody who has logged three weeks.
  const logged = Object.keys(state.days).sort();
  const spanDays = logged.length
    ? Math.min(ANALYSIS_DAYS, Math.round((dateFromKey(analysisDk).getTime() - dateFromKey(logged[0]).getTime()) / 86400000) + 1)
    : 0;

  return {
    dk,
    demo: !!opts.demo,
    change,
    correlations,
    early,
    progress,
    noImpact,
    detail,
    observations,
    watch,
    overall,
    since,
    confidence,
    daysLogged: confidence.daysLogged,
    downturn,
    windowDays: Math.max(0, spanDays),
    ms: Date.now() - started,
  };
}

/**
 * An empty report, for the first render before the real one is built — and for the
 * screen's catch, which must hand back a report rather than nothing.
 *
 * A null there left the view on its skeleton permanently: the placeholder is shown
 * whenever there is no report, so a failed build promised content that was never
 * coming. An empty report at least renders a finished screen, and `failed` lets it
 * say which kind of empty it is.
 */
export function emptyReport(dk: string, failed = false): InsightReport {
  return {
    dk, demo: false, change: null, correlations: [], early: [], progress: [], noImpact: [], detail: {}, observations: [], watch: [],
    overall: { direction: 'unknown', label: null, detail: 'not enough to compare yet' },
    since: null,
    confidence: { pct: 0, parts: [], topFix: null, daysLogged: 0 },
    daysLogged: 0, downturn: false, windowDays: 0, ms: 0, failed,
  };
}
