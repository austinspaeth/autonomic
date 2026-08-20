/**
 * Heart-rate recovery one minute after exercise — the ONE definition, shared by
 * the workout report, the Progress card and the strain detector, so the three
 * cannot drift.
 *
 * The reference point is the rate you STOPPED at, not the session's peak. The
 * classic ≤12 bpm abnormal threshold comes from graded exercise tests, where
 * you stop at peak exertion and the two are the same number by protocol. On a
 * real workout they are not: hard intervals early and an easy spin at the end
 * put the peak far above the rate you finished on, and measuring from there
 * reports a fall that is mostly cool-down. The hand-entered `hr60` is timed
 * from when you stopped, so its reference must be too.
 *
 * The stop rate is the MEDIAN of the trace's last few seconds rather than its
 * final sample: one dropped beat at the end would otherwise swing the whole
 * reading. Without a trace (a hand-logged workout) the entered `maxHr` is all
 * there is, and it stands in as before.
 */
import type { Entry } from './types';

export interface HrSample { t: number; bpm: number }
/** Seconds of trace, back from the last sample, that define the stop rate. */
export const STOP_WINDOW_SEC = 15;

const num = (v: unknown): number | null => { const n = parseFloat(v as string); return isNaN(n) ? null : n; };

/** The rate the session ended at: median bpm over the trace's final seconds. */
export function stopHr(curve: HrSample[] | null | undefined): number | null {
  if (!curve || !curve.length) return null;
  const end = curve[curve.length - 1].t;
  const tail = curve.filter((q) => q.t >= end - STOP_WINDOW_SEC).map((q) => q.bpm).sort((a, b) => a - b);
  if (!tail.length) return null;
  const m = Math.floor(tail.length / 2);
  return tail.length % 2 ? tail[m] : (tail[m - 1] + tail[m]) / 2;
}

/** The rate `hr60` is measured against: the stop rate, else the logged max HR.
 *  `curveOf` resolves an activity's stored HR trace (the sidecar lookup differs
 *  per caller, so it is passed in rather than imported). */
export function recoveryBaseline(a: Entry, curveOf?: (a: Entry) => HrSample[] | null): number | null {
  const stop = stopHr(curveOf ? curveOf(a) : null);
  if (stop != null) return Math.round(stop);
  return num(a.maxHr);
}

/** Signed fall in the minute after stopping (`hr60` - stop rate), so a bigger
 *  recovery is more negative. Null when either end is missing, or when the rate
 *  did not fall at all (which is bad data far more often than it is a finding). */
export function hrRecovery(a: Entry, curveOf?: (a: Entry) => HrSample[] | null): number | null {
  const h60 = num(a.hr60);
  if (h60 == null) return null;
  const base = recoveryBaseline(a, curveOf);
  return base != null && base > h60 ? h60 - base : null;
}
