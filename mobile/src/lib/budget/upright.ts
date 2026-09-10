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
 * itself an estimate, the drill-in shades every inferred stretch on the trace
 * with its clock time so the user can see whether 12:40 was a queue or a phone
 * call, the posture tap overrides the whole day, and the calibration loop is
 * the long-run corrective — if inferred upright time does not predict this
 * user's dips, the ceiling moves around it.
 *
 * Pure: no store, no native, no React.
 */
import type { ScoreContext } from '../scoring';
import type { DaysMap } from '../scoring/day';
import { median } from '../trends/compare';
import { keyRange, metricSeries } from '../trends/series';
import type { Entry } from '../types';
import { BASELINE_DAYS, MIN_LINE_READINGS } from './baseline';
import type { Span } from './burn';

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
}

const overlaps = (a: Span, b: Span) => a.startMin < b.endMin && b.startMin < a.endMin;

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

  // One value per minute of the day, and a record of which minutes we saw.
  const bpmAt = new Map<number, number[]>();
  hr.forEach((p) => {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.bpm) || p.bpm <= 0) return;
    const m = Math.floor(p.t / 60);
    const arr = bpmAt.get(m);
    if (arr) arr.push(p.bpm); else bpmAt.set(m, [p.bpm]);
  });
  const coverageMin = bpmAt.size;
  // A day the watch spent mostly on the charger cannot describe a day.
  if (coverageMin < STILL_MIN_COVERAGE) return null;

  const ceiling = lineBpm == null ? Infinity : lineBpm;
  const stepped = new Set<number>();
  (stepSpans || []).forEach((s) => {
    for (let m = Math.floor(s.startMin); m < Math.ceil(s.endMin); m++) stepped.add(m);
  });

  const inBand = (m: number) => {
    const vals = bpmAt.get(m);
    if (!vals || !vals.length) return false;             // a gap is never upright
    if (stepped.has(m)) return false;                    // that is walking, not standing
    const v = vals.reduce((a, b) => a + b, 0) / vals.length;
    return v >= sig.floorBpm && v < ceiling;
  };

  const excluded = (m: number) => exclude.some((e) => overlaps({ startMin: m, endMin: m + 1 }, e));

  const spans: { startMin: number; endMin: number; kind: 'still' }[] = [];
  const minutes = Array.from(bpmAt.keys()).sort((a, b) => a - b);
  const last = minutes.length ? minutes[minutes.length - 1] : 0;

  let runStart: number | null = null;
  const close = (endM: number) => {
    if (runStart == null) return;
    if (endM - runStart >= STILL_MIN_RUN) spans.push({ startMin: runStart, endMin: endM, kind: 'still' });
    runStart = null;
  };

  for (let m = 0; m <= last; m++) {
    if (inBand(m) && !excluded(m)) {
      if (runStart == null) runStart = m;
    } else {
      close(m);
    }
  }
  close(last + 1);

  const stillMin = Math.min(STILL_CAP_MIN, spans.reduce((s, sp) => s + (sp.endMin - sp.startMin), 0));
  return { stillMin, spans, coverageMin };
}
