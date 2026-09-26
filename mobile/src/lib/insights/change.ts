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
 * Three candidate shapes, and the guards that keep them honest:
 *
 * ONSET — the first day a factor appears. The split point is therefore fixed by
 * the data rather than chosen to maximise the effect, which is the whole reason
 * this is defensible. Both sides need MIN_SIDE days of the outcome, the windows
 * are trimmed to EQUAL length so a 60-day "after" can't be compared against a
 * 5-day "before", and the difference is tested with the same rank test
 * ./correlate uses.
 *
 * STOP — the day after the last dose of a REGIMEN. The mirror of an onset, with
 * the same fixed split point, equal windows and test, and three guards of its
 * own (see `regimenEvents`): it had to be a regimen (the start/stop rule's own
 * density bar), the absence has to be sustained, and the user has to have gone
 * on logging OTHER meds, or "stopped everything" is really "stopped logging".
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
import { CORRELATION_OUTCOMES, MIN_EFFECT, REGIME_MIN_DENSITY, midSentence, shortMetric } from './correlate';
import type { FactorDef } from './factors';
import type { DayMatrix } from './matrix';
import { benjaminiHochberg, confidenceLabel, confidencePips, mannWhitney, type ConfidenceLabel } from './stats';
import { RETAIN_P } from './stability';

/** Days of the outcome needed on each side of an onset. */
export const MIN_SIDE = 10;
/** A change has to clear this to be worth the top of the screen. */
export const CHANGE_FDR_Q = 0.10;
/** An onset older than this is history, not "this month". */
export const MAX_ONSET_AGE_DAYS = 120;
/**
 * Other things started within this many days of an onset are named beside it.
 *
 * On a real journal vitamin C and Zyrtec began on the same morning, and the card
 * could only ever say "since you started vitamin C": the one comparison that
 * cannot tell the two apart, presented as if it had picked one. Naming them
 * together is the honest version, and it is what the user needs to know before
 * they act on it.
 */
export const CO_START_DAYS = 2;
/**
 * The shortest stretch that counts as an event when it is only being MENTIONED
 * beside another change ("you also started vitamin C in this stretch"): a week
 * of regimen before a stop and a week of absence after it. A change that heads
 * the card needs MIN_SIDE either side, because it is tested; a mention only has
 * to be true.
 */
export const MIN_EVENT_DAYS = 7;
/** How far back the "was it a regimen" density is read before a stop. */
export const STOP_REGIMEN_DAYS = 28;
/**
 * Share of the days after a stop on which OTHER meds were still logged. Below
 * it, the absence is the user stopping logging rather than stopping the thing,
 * and nobody's supplement is declared stopped because they got tired of the app.
 */
export const STOP_MIN_LOGGING = 0.6;

export interface BiggestChange {
  id: string;
  kind: 'onset' | 'stop' | 'shift' | 'welcome';
  /** The columns behind the claim, for ./detail. `outcome` is null only on the
   *  fabricated welcome card, which has no data to chart. */
  outcome: TrendMetricId | null;
  factorId: string | null;
  /** Driver keys of everything the change names, its own first: things started
   *  or stopped together are one event, and every one of them is on this card,
   *  as is anything `context` mentions. */
  drivers: string[];
  /**
   * What ELSE started or stopped in the stretch the change compares ("You also
   * started vitamin C and Zyrtec in this stretch..."), or null. Shown in the
   * finding's sheet. A before/after silently credits one change with everything
   * else that moved in the same weeks; this is the sentence that says so.
   */
  context: string | null;
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
  kind: 'onset' | 'stop' | 'shift';
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

/** Last index where a factor column reads 1, or -1. */
function lastOnIndex(col: (number | null)[]): number {
  for (let i = col.length - 1; i >= 0; i--) if (col[i] === 1) return i;
  return -1;
}

/** One thing somebody started or stopped, with the index it happened at (for a
 *  stop, the first day WITHOUT it). */
interface RegimenEvent {
  factor: FactorDef;
  key: string;
  kind: 'start' | 'stop';
  at: number;
  noun: string;
  /** For a stop: the first day it was ever taken, so the regimen's length is known. */
  firstOn: number;
}

/**
 * Every start and stop in the window, for things a person takes
 * (`onsetNoun` factors), one per driver per kind.
 *
 * A START is the first day a factor appears, at least MIN_SIDE days into the span
 * where its category was being logged (./matrix's active window), or it is only
 * the day logging began. A STOP is the day after the last dose, and it has to earn
 * the word:
 *
 * 1. IT WAS A REGIMEN. Over the last STOP_REGIMEN_DAYS before it, the thing was
 *    taken on at least REGIME_MIN_DENSITY of known days — the same bar
 *    ./correlate uses to call a block of days one episode, so the two modules
 *    agree about what a regimen is. Stopping something taken twice is not news.
 * 2. THE ABSENCE IS SUSTAINED. At least `minDays` days with none, to the end of
 *    the window.
 * 3. THE USER KEPT LOGGING. Other meds appear on at least STOP_MIN_LOGGING of the
 *    days after. Somebody who stopped opening the meds section has "stopped"
 *    every supplement on the same day, and the active-window rule cannot see it,
 *    because a span never closes.
 */
function regimenEvents(matrix: DayMatrix, minDays: number): RegimenEvent[] {
  const total = matrix.keys.length;
  const out: RegimenEvent[] = [];
  const seen = new Set<string>();
  for (const f of matrix.defs) {
    if (f.kind !== 'binary' || !f.onsetNoun) continue;
    const col = matrix.factors[f.id];
    if (!col) continue;
    const key = f.variantOf || f.id;
    const first = onsetIndex(col);
    const known = firstKnownIndex(col);
    if (first < 0 || known < 0) continue;

    if (!seen.has(`start|${key}`) && first - known >= MIN_SIDE) {
      seen.add(`start|${key}`);
      out.push({ factor: f, key, kind: 'start', at: first, noun: f.onsetNoun, firstOn: first });
    }

    const stopAt = lastOnIndex(col) + 1;
    if (seen.has(`stop|${key}`) || total - stopAt < minDays) continue;
    const from = Math.max(first, stopAt - STOP_REGIMEN_DAYS);
    if (stopAt - from < minDays) continue;
    let on = 0, knownBefore = 0;
    for (let i = from; i < stopAt; i++) { if (col[i] != null) { knownBefore++; if (col[i] === 1) on++; } }
    if (!knownBefore || on / knownBefore < REGIME_MIN_DENSITY) continue;
    const pres = f.presence;
    let logging = 0;
    for (let i = stopAt; i < total; i++) {
      const d = matrix.days[matrix.keys[i]];
      if (d && (!pres || pres.has(d))) logging++;
    }
    if (logging / (total - stopAt) < STOP_MIN_LOGGING) continue;
    seen.add(`stop|${key}`);
    out.push({ factor: f, key, kind: 'stop', at: stopAt, noun: f.onsetNoun, firstOn: first });
  }
  return out;
}

/**
 * Stop candidates: for each regimen that ended, every outcome compared in the
 * weeks before the stop against the weeks after. Same windows, same test and the
 * same family as an onset — a stop is an onset read in the other direction.
 */
function stopCandidates(matrix: DayMatrix): Cand[] {
  const out: Cand[] = [];
  const total = matrix.keys.length;
  regimenEvents(matrix, MIN_SIDE).forEach((e) => {
    if (e.kind !== 'stop' || total - e.at > MAX_ONSET_AGE_DAYS) return;
    const span = Math.min(e.at - e.firstOn, total - e.at);
    if (span < MIN_SIDE) return;
    CORRELATION_OUTCOMES.forEach((id) => {
      if (e.factor.blocks.includes(OUTCOME_FAMILY[id])) return;
      const series = matrix.outcomes[id];
      if (!series) return;
      const before: number[] = [], after: number[] = [];
      for (let i = e.at - span; i < e.at; i++) { const v = series[i]; if (v != null) before.push(v); }
      for (let i = e.at; i < e.at + span; i++) { const v = series[i]; if (v != null) after.push(v); }
      if (before.length < MIN_SIDE || after.length < MIN_SIDE) return;
      const g = mannWhitney(after, before);
      if (!Number.isFinite(g.median1) || !Number.isFinite(g.median2) || g.median1 === g.median2) return;
      out.push({
        kind: 'stop', id: `stop:${e.factor.id}|${id}`, def: TREND_METRICS[id], driver: e.noun,
        outcome: id, factorId: e.factor.id, onsetAt: e.at,
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
  pips * 100 + Math.abs(r) * 50 + (HEADLINE_RANK[id] || 0) * 2 + (kind === 'onset' || kind === 'stop' ? 1 : 0);

/**
 * `retain` — the id of the change a previous real report headlined. A strict
 * survivor always wins the card outright ("Biggest change" must stay a
 * superlative), but when NOTHING passes strictly and the remembered change is
 * still plausible (raw p ≤ RETAIN_P plus the clinical bars), the card keeps
 * saying it rather than going blank — the same hysteresis ./stability gives the
 * correlation list, applied to the one slot up here.
 */
export function findBiggestChange(matrix: DayMatrix, opts: { retain?: string | null } = {}): BiggestChange | null {
  const cands = [...onsetCandidates(matrix), ...stopCandidates(matrix), ...shiftCandidates(matrix)];
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
  if (!best && opts.retain) {
    cands.forEach((c, i) => {
      if (c.id !== opts.retain || c.p > RETAIN_P) return;
      if (Math.abs(c.r) < MIN_EFFECT || !worthSaying(c.def, c.after, c.before)) return;
      best = { c, q: fdr.q[i], pips: confidencePips(fdr.q[i], Math.abs(c.r), c.n) };
    });
  }
  if (!best) return null;

  const { c, pips } = best as { c: Cand; q: number; pips: number };
  const def = c.def;
  const metric = shortMetric(def);
  const good = isGood(def, c.after, c.before);
  const up = c.after > c.before;
  const magnitude = def.fmt(Math.abs(c.after - c.before));

  // Verb agreement: "Bowel movements ARE up", "RMSSD IS up". A word ending in a
  // lowercase plural-s marks the plural labels; the acronyms stay clear of it,
  // and so does a double s ("Stool softness IS up").
  const plural = metric.split(' ').some((w) => /[a-rt-z]s$/.test(w));
  const verb = c.kind === 'stop' ? 'stopped' : 'started';
  const story = describeEvents(matrix, c);
  const nouns = [c.driver as string, ...story.together.map((e) => e.noun)];
  const headline = c.kind === 'shift'
    ? `${metric} ${plural ? 'have' : 'has'} ${up ? 'risen' : 'fallen'} over the last month`
    : `${metric} ${plural ? 'are' : 'is'} ${up ? 'up' : 'down'} since you ${verb} ${listOf(nouns)}`;

  const said = midSentence(metric);
  const apart = nouns.length === 2
    ? ` Both ${verb} within a couple of days of each other, so your log cannot tell which one this goes with, if either.`
    : nouns.length > 2
      ? ` They all ${verb} within a couple of days of each other, so your log cannot tell which one this goes with, if any.`
      : ' This is an association in your own log, not proof of a cause.';
  // A medication is somebody's prescriber's business: nothing here may read as a
  // reason to start, stop or restart one.
  const named = [story.self, ...story.together, ...story.during].filter(Boolean) as RegimenEvent[];
  const doctor = c.kind !== 'shift' && named.some((e) => e.factor.group === 'medication')
    ? ' Talk to your doctor before changing a medication.' : '';
  const body = c.kind === 'shift'
    ? `Across the last ${c.spanDays} days, ${said} ran ${magnitude} ${def.unit} ${up ? 'higher' : 'lower'} than the ${c.spanDays} days before.${story.context ? ` ${story.context}` : ''}`
    : `In the ${c.spanDays} days since, ${said} ran ${magnitude} ${def.unit} ${up ? 'higher' : 'lower'} than the ${c.spanDays} days before.${apart}${story.context ? ` ${story.context}` : ''}${doctor}`;
  const drivers = named.map((e) => e.key).filter((k, i, all) => all.indexOf(k) === i);

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
    drivers,
    context: story.context ? `${story.context}${doctor}` : doctor.trim() || null,
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
  drivers: [],
  context: null,
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

/**
 * The rest of the story around a change: what happened at the same moment, and
 * what else started or stopped inside the stretch it compares.
 *
 * `together` — the same kind of event (a start beside a start) within
 * CO_START_DAYS: one event, named in the headline. `during` — anything else
 * inside the compared window: said in `context`, because a before/after credits
 * its one named change with everything else that moved in those weeks. For a
 * shift the window is the two months it compares, and `context` is the honest
 * answer to "what changed then?" without claiming any of it is why.
 */
function describeEvents(matrix: DayMatrix, c: Cand): {
  self: RegimenEvent | null;
  together: RegimenEvent[];
  during: RegimenEvent[];
  context: string | null;
} {
  const events = regimenEvents(matrix, MIN_EVENT_DAYS);
  const total = matrix.keys.length;
  const lead = c.factorId ? matrix.defs.find((f) => f.id === c.factorId) : undefined;
  const selfKey = lead ? lead.variantOf || lead.id : null;
  const kind = c.kind === 'stop' ? 'stop' : 'start';
  const self = selfKey ? events.find((e) => e.key === selfKey && e.kind === kind) || null : null;

  const at = c.onsetAt;
  const together: RegimenEvent[] = [];
  const nouns = new Set<string>(c.driver ? [c.driver.toLowerCase()] : []);
  if (at != null && c.kind !== 'shift') {
    for (const e of events) {
      if (e.kind !== kind || e.key === selfKey || Math.abs(e.at - at) > CO_START_DAYS) continue;
      if (nouns.has(e.noun.toLowerCase())) continue;
      nouns.add(e.noun.toLowerCase());
      together.push(e);
    }
  }

  const [from, to] = c.kind === 'shift'
    ? [total - c.spanDays * 2, total]
    : [(at as number) - c.spanDays, (at as number) + c.spanDays];
  const during = events.filter((e) => e !== self && !together.includes(e)
    && !(e.key === selfKey && e.kind === kind) && e.at > from && e.at < to);

  if (!during.length) return { self, together, during, context: null };
  const started = during.filter((e) => e.kind === 'start').map((e) => e.noun);
  const stopped = during.filter((e) => e.kind === 'stop').map((e) => e.noun);
  const parts = [
    started.length ? `started ${listOf(started)}` : '',
    stopped.length ? `stopped ${listOf(stopped)}` : '',
  ].filter(Boolean);
  const context = c.kind === 'shift'
    ? `In these two months you ${parts.join(' and ')}.`
    : `You also ${parts.join(' and ')} in this stretch, so the change cannot be pinned on any one of them.`;
  return { self, together, during, context };
}

/** "a", "a and b", "a, b and c". */
function listOf(items: string[]): string {
  if (items.length < 2) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Outcome ids a change may be reported for, exported for the tests. */
export const CHANGE_OUTCOMES: TrendMetricId[] = CORRELATION_OUTCOMES;
