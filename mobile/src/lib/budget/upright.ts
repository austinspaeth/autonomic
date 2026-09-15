/**
 * Standing still, inferred from the user's own heart.
 *
 * The real limiter in POTS is time UPRIGHT, and most of it is not walking: the
 * queue, the shower, the kitchen, the conversation in a doorway. No sensor
 * reports it. Apple Stand Time exists only when a watch wrote it, Health
 * Connect has no equivalent record at all, and a step count says nothing about
 * the most expensive state there is, which is upright and motionless.
 *
 * But this population's hearts DO report it. Standing raises heart rate by
 * tens of beats within a minute or two and holds it there — that is the
 * definition of the condition — and the app already measures each user's own
 * rise in the stand test. So a run of minutes with no steps, outside sleep and
 * outside any logged activity, where the heart sits in that user's own
 * standing band, is standing still.
 *
 * WHAT IT CANNOT TELL APART, and the reasons the copy says "estimated": a
 * seated argument, a hot room, a fever, caffeine. All of them can hold a heart
 * in the band. The mitigations are deliberate and layered: the row names
 * itself an estimate, the drill-in draws the inferred minutes hour by hour so
 * the user can see whether noon was a queue or a phone call, the posture tap overrides the whole day, and the calibration loop is
 * the long-run corrective — if inferred upright time does not predict this
 * user's dips, the ceiling moves around it.
 *
 * TWO THINGS THIS GOT WRONG, and both were reported by the same day.
 *
 *   IT COUNTED SAMPLES, NOT TIME. A minute used to be standing when a sample
 *   landed IN it and read in the band, so the answer scaled with how often the
 *   sensor spoke: a watch that samples every few minutes offered a few hundred
 *   candidate minutes a day and almost no runs of three, while a strap
 *   streaming continuously offered all 1,440 and every one of them merged into
 *   a run. The same body on the same afternoon read as twenty minutes upright
 *   or as the five-hour cap depending only on the sensor. It now integrates
 *   over the gaps between samples, capped at the day's own `gapToleranceFor`,
 *   which is the rule ./burn's hrMinutesAbove has always used and for exactly
 *   this reason.
 *
 *   THE BAND HAD NOTHING TO RISE FROM. Its floor was the user's LAYING resting
 *   rate plus a fraction of their stand-test rise, and nobody sits at their
 *   laying rate: an ordinary sedentary afternoon at a desk sits ten to twenty
 *   beats above it, which is inside the band. With continuous sampling that is
 *   a whole day of "standing" logged by somebody who did not get up. Standing
 *   is a RISE, so it needs something to rise FROM, and the honest reference is
 *   the day's own quiet level (below) rather than a reading taken lying down
 *   three weeks ago. The signature floor stays as a floor under that, so a day
 *   we cannot read a quiet level off is charged exactly as it was before.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import { median } from '../trends/compare';
import { keyRange, metricSeries } from '../trends/series';
import type { Entry } from '../types';
import { BASELINE_DAYS, MIN_LINE_READINGS } from './baseline';
import { gapToleranceFor, type Span } from './burn';

/** Where in the stand-test rise the standing band starts. Standing quietly
 *  settles well below the test's peak, so the floor sits at a fraction of it;
 *  too high and the whole day reads as sitting. */
export const BAND_FRACTION = 0.6;

/** The rise assumed when the user has never logged a stand test. Conservative:
 *  a bigger default would sweep ordinary sitting into the band. */
export const DEFAULT_RISE = 20;

/** Days back a stand test still describes the person. */
export const SIGNATURE_DAYS = 90;

/** Consecutive minutes in the band before a run counts. Below this it is a
 *  trip to the kettle, and charging those would make every day look upright. */
export const STILL_MIN_RUN = 3;

/** Minutes after a logged activity ends that are never counted as standing.
 *  Recovery heart rate sits squarely in the band and is not standing still. */
export const RECOVERY_MIN = 30;

/** A day cannot be more upright than this, whatever the trace says. */
export const STILL_CAP_MIN = 300;

/** Minutes of heart-rate coverage a day needs before any of this is claimed.
 *  Four hours of watch time cannot describe a day. */
export const STILL_MIN_COVERAGE = 360;

/**
 * Where in the day's own distribution its QUIET level is read.
 *
 * The quiet level is where this person's heart sits when they are awake, not
 * walking and not exercising, which for almost everybody in this population is
 * sitting. A low percentile rather than a median, because a day holding a lot
 * of standing would drag a median up into the very band it is meant to define;
 * a quarter of the covered day is a bar even a heavily upright day clears,
 * since STILL_CAP_MIN already refuses to claim more than five hours of one.
 */
export const QUIET_PCT = 0.25;

/**
 * Covered intervals needed before the day's own quiet level is trusted.
 *
 * Below it the band keeps the signature floor alone, which is what every day
 * used before this existed. The rule only ever RAISES the floor, so a day it
 * cannot read is charged exactly as it was.
 */
export const QUIET_MIN_SLICES = 30;

export interface UprightSignature {
  /** The user's own resting rate. */
  restBpm: number;
  /** How far standing lifts it, for them. */
  riseBpm: number;
  source: 'standTest' | 'orthostatic' | 'default';
  /** The bottom of the standing band. */
  floorBpm: number;
}

const num = (v: unknown): number | null => {
  const n = parseFloat(v as string);
  return isNaN(n) ? null : n;
};

/**
 * The user's own standing signature, or null when there is not even a resting
 * baseline to build one on. Never guessed from a population figure: a rise
 * that is normal for one person is a diagnosis for another.
 */
export function uprightSignature(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext,
  addDays: (k: string, n: number) => string,
): UprightSignature | null {
  const restKeys = keyRange(dk, BASELINE_DAYS, addDays);
  const rest = metricSeries(days, restKeys, ['restingHr'], ctx).restingHr.filter((v): v is number => v != null);
  if (rest.length < MIN_LINE_READINGS) return null;
  const restBpm = median(rest);

  const keys = keyRange(dk, SIGNATURE_DAYS, addDays);
  const stand: number[] = [];
  const ortho: number[] = [];
  keys.forEach((k) => {
    (days[k]?.readings || []).forEach((r: Entry) => {
      if (r.type === 'standTest') {
        const v = num(r.sustainedDelta) ?? num(r.peakDelta);
        if (v != null && v > 0) stand.push(v);
      } else if (r.type === 'orthostatic') {
        const a = num(r.afterHr);
        const b = num(r.beforeHr);
        if (a != null && b != null && a - b > 0) ortho.push(a - b);
      }
    });
  });

  const riseBpm = stand.length ? median(stand) : ortho.length ? median(ortho) : DEFAULT_RISE;
  const source: UprightSignature['source'] = stand.length ? 'standTest' : ortho.length ? 'orthostatic' : 'default';

  return {
    restBpm: Math.round(restBpm),
    riseBpm: Math.round(riseBpm),
    source,
    floorBpm: Math.round(restBpm + riseBpm * BAND_FRACTION),
  };
}

export interface StillResult {
  stillMin: number;
  spans: { startMin: number; endMin: number; kind: 'still' }[];
  coverageMin: number;
  /** The band's floor as this day resolved it, which is the signature floor
   *  raised to clear the day's own quiet level. Stored and shown, because
   *  "why does it think I was standing" is otherwise unanswerable. */
  floorBpm: number;
}

const overlaps = (a: Span, b: Span) => a.startMin < b.endMin && b.startMin < a.endMin;

/** The value at `p` through a sorted sample, linearly interpolated. */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** One covered interval between two samples: the unit everything here is
 *  measured in, so the answer depends on the CLOCK and not on how talkative
 *  the sensor was. */
interface Slice {
  startMin: number;
  endMin: number;
  lenMin: number;
  /** The interval's own level, the mean of the two samples bounding it. */
  bpm: number;
  /** Awake, not walking, not inside a logged activity or a capture. */
  eligible: boolean;
}

/**
 * Minutes standing still.
 *
 * `hr` is the raw all-day series, `t` in seconds from local midnight.
 * `exclude` holds every window that must not be counted: last night's sleep,
 * each logged activity plus its recovery tail, and any live capture session.
 * `lineBpm` is the exertion line — at or above it the minute is exercise and
 * is already charged by the heart-rate row, so it is not standing.
 */
export function stillUprightMinutes(
  hr: { t: number; bpm: number }[] | null | undefined,
  stepSpans: Span[] | null | undefined,
  sig: UprightSignature | null,
  exclude: Span[],
  lineBpm: number | null,
): StillResult | null {
  if (!hr || !hr.length || !sig) return null;

  const pts = hr
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.bpm) && p.bpm > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;

  const ceiling = lineBpm == null ? Infinity : lineBpm;
  const steps = (stepSpans || []).filter((s) =>
    Number.isFinite(s.startMin) && Number.isFinite(s.endMin) && s.endMin > s.startMin);

  // Cut the day into covered intervals. A gap longer than this day's own
  // tolerance is UNCOVERED: it contributes to neither the coverage nor the
  // count, and it breaks any run across it, because an unwatched hour is
  // unknown and never standing. An interval that touches a step span or an
  // excluded window is kept but marked ineligible, so it still breaks runs and
  // still reports its time as covered without ever being charged.
  const gapMax = gapToleranceFor(pts);
  const slices: Slice[] = [];
  let coverageMin = 0;
  for (let i = 1; i < pts.length; i++) {
    const lenMin = (pts[i].t - pts[i - 1].t) / 60;
    if (lenMin <= 0 || lenMin > gapMax) continue;
    coverageMin += lenMin;
    const startMin = pts[i - 1].t / 60;
    const endMin = pts[i].t / 60;
    const span = { startMin, endMin };
    slices.push({
      startMin,
      endMin,
      lenMin,
      bpm: (pts[i - 1].bpm + pts[i].bpm) / 2,
      eligible: !steps.some((s) => overlaps(span, s)) && !exclude.some((e) => overlaps(span, e)),
    });
  }
  // A day the watch spent mostly on the charger cannot describe a day.
  if (coverageMin < STILL_MIN_COVERAGE) return null;

  // The day's own quiet level, and the band floor it argues for. Only the
  // eligible sub-line intervals: sleep and workouts are already carved out of
  // `eligible`, and anything at or above the line is exercise, which would
  // pull the reference up toward the thing it is meant to exclude.
  const quietPool = slices
    .filter((s) => s.eligible && s.bpm < ceiling)
    .map((s) => s.bpm)
    .sort((a, b) => a - b);
  const quiet = quietPool.length >= QUIET_MIN_SLICES ? percentile(quietPool, QUIET_PCT) : null;
  const floorBpm = Math.round(Math.max(
    sig.floorBpm,
    quiet == null ? sig.floorBpm : quiet + sig.riseBpm * BAND_FRACTION,
  ));

  // Band membership is decided on the interval's own mean, not interpolated
  // the way ./burn crosses a single line: a band has two edges and splitting an
  // interval across both would be guessing at a shape from two samples. The
  // cost is that the entry and exit slices of each stand read as half sitting
  // and are dropped, so a sparsely sampled day UNDER-claims: measured against
  // one fixed day resampled, 105 minutes of standing reads as 78 to 89 at
  // wrist cadences against 105 at a strap's. That is the direction to be wrong
  // in here. The row already calls itself an estimate, a minute upright costs a
  // fifth of a moderate one, and over-claiming standing is the failure this
  // module has already shipped once.
  const spans: { startMin: number; endMin: number; kind: 'still' }[] = [];
  let runStart: number | null = null;
  let runEnd = 0;
  let runMin = 0;
  const close = () => {
    if (runStart != null && runMin >= STILL_MIN_RUN) {
      spans.push({ startMin: Math.round(runStart), endMin: Math.round(runEnd), kind: 'still' });
    }
    runStart = null;
    runMin = 0;
  };

  slices.forEach((s) => {
    if (!s.eligible || s.bpm < floorBpm || s.bpm >= ceiling) { close(); return; }
    // Contiguity is checked against the clock, not against the loop index: the
    // slices either side of an uncovered gap are neighbours in this array and
    // are not neighbours in the day.
    if (runStart == null || Math.abs(s.startMin - runEnd) > 1e-6) { close(); runStart = s.startMin; }
    runEnd = s.endMin;
    runMin += s.lenMin;
  });
  close();

  const total = spans.reduce((s, sp) => s + (sp.endMin - sp.startMin), 0);
  return {
    stillMin: Math.round(Math.min(STILL_CAP_MIN, total)),
    spans,
    coverageMin: Math.round(coverageMin),
    floorBpm,
  };
}
