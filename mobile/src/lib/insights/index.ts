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
import { addDays } from '../dates';
import type { ScoreContext } from '../scoring';
import { detectDownturn } from '../scoring/downturn';
import { resolveProtocol } from '../scoring/day';
import { INSIGHT_OUTCOMES, keyRange } from '../trends';
import type { AppState } from '../types';
import { WELCOME_CHANGE, findBiggestChange, type BiggestChange } from './change';
import { dataConfidence, type DataConfidence } from './confidence';
import { findCorrelations, type Correlation } from './correlate';
import { buildFactors } from './factors';
import { buildDayMatrix } from './matrix';
import { findObservations, type Observation } from './observations';
import { findWatchItems, overallDirection, type Overall, type WatchItem } from './watch';

export type { BiggestChange } from './change';
export type { Correlation } from './correlate';
export type { Observation } from './observations';
export type { WatchItem, Overall, OverallDirection } from './watch';
export type { ConfidencePart, DataConfidence } from './confidence';
export type { FactorDef, FactorGroup, FactorKind } from './factors';
export type { ConfidenceLabel } from './stats';
export { WELCOME_CHANGE } from './change';
export { CONFIDENCE_LABELS, confidenceLabel } from './stats';
export { MAX_OBSERVATIONS } from './observations';
export { MAX_WATCH_ITEMS } from './watch';
export { MAX_CORRELATIONS, shortMetric } from './correlate';

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
  observations: Observation[];
  watch: WatchItem[];
  confidence: DataConfidence;
  /** Days in the journal with any record — the header's count. */
  daysLogged: number;
  /** True while a downturn is active, which is why `watch` may be empty. */
  downturn: boolean;
  /** Where the whole journal is heading, for the header. */
  overall: Overall;
  /** Wall-clock cost of the build, for the perf check. */
  ms: number;
  /** Stable fingerprint of the headline findings, for the NEW badge. See ./seen. */
  fingerprint: string;
}

/**
 * Build the whole report.
 *
 * `demo` is passed by the caller rather than inferred, because the caller has
 * already decided whether to hand us the user's state or the sample month and the
 * two must not disagree about what the banner says.
 */
export function buildInsights(state: AppState, dk: string, opts: { demo?: boolean; ctx?: ScoreContext } = {}): InsightReport {
  const started = Date.now();
  const ctx: ScoreContext = opts.ctx || {
    sex: state.profile.sex,
    height: state.profile.height,
    protocol: resolveProtocol(state.settings.protocol),
    customTypes: state.customTypes,
  };

  const keys = keyRange(dk, ANALYSIS_DAYS, addDays);
  const defs = buildFactors(state, keys);
  const matrix = buildDayMatrix(state, keys, INSIGHT_OUTCOMES, defs, ctx);

  // One downturn check for the whole report: ./watch needs it as a gate and the
  // caller needs to know why the section is empty.
  const downturn = !!detectDownturn(state.days, dk, ctx, ctx.protocol, state.customTypes);

  const correlations = findCorrelations(matrix);
  // On an empty journal the headline slot is the welcome card, unconditionally —
  // whatever the sample month happens to contain, the honest headline for someone
  // with no data is that they just arrived.
  const change = opts.demo ? WELCOME_CHANGE : findBiggestChange(matrix);
  const observations = findObservations({ matrix, state, dk });
  const watch = findWatchItems(matrix, downturn);
  // NOT gated on the downturn. Trend Watch hides its five red rows during one, but
  // the header saying "Trending down" in a single calm line is the honest headline
  // for exactly that situation, and suppressing it would leave the screen mute at
  // the moment it has the most to say.
  const overall = overallDirection(matrix);
  const confidence = dataConfidence(state.days, dk);

  return {
    dk,
    demo: !!opts.demo,
    change,
    correlations,
    observations,
    watch,
    overall,
    confidence,
    daysLogged: confidence.daysLogged,
    downturn,
    ms: Date.now() - started,
    fingerprint: fingerprintOf(change, correlations),
  };
}

/**
 * What "new findings" means.
 *
 * The headline change plus the ids of the correlations that would be visible
 * without tapping "show all" — the things a user would actually notice had
 * changed. Deliberately NOT the whole list: a twenty-fourth correlation shuffling
 * position is not news, and a badge that lights up every single day teaches people
 * to ignore it.
 */
export function fingerprintOf(change: BiggestChange | null, correlations: Correlation[]): string {
  return [change ? change.id : '-', ...correlations.slice(0, VISIBLE_CORRELATIONS).map((c) => c.id)].join(',');
}

/** An empty report, for the first render before the real one is built. */
export function emptyReport(dk: string): InsightReport {
  return {
    dk, demo: false, change: null, correlations: [], observations: [], watch: [],
    overall: { direction: 'unknown', label: null, detail: 'not enough to compare yet' },
    confidence: { pct: 0, parts: [], topFix: null, daysLogged: 0 },
    daysLogged: 0, downturn: false, ms: 0, fingerprint: '',
  };
}
