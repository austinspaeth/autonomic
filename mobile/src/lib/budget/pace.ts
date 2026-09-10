/**
 * The pace marker: where an even day would have you by now.
 *
 * This is the single new visual idea in the design, and it is what lets a
 * static bar answer "how fast" as well as "how much". Fill to the left of the
 * mark is room; fill past it is running ahead. Without it the strip could only
 * say a remaining figure, and a remaining figure at 9am and at 6pm mean
 * opposite things.
 *
 * The line is EVEN spend across waking hours. Not because anybody spends
 * evenly — nobody does — but because it is the one reference the reader can
 * check without being told a model of their day. It is a ruler, not a
 * prediction.
 *
 * Pure: no store, no native, no React.
 */

/** When the waking day is assumed to end, minutes past midnight. Later than
 *  most bedtimes on purpose: an evening that runs to 10:30 should not read as
 *  overspending simply because it happened after dark. */
export const DAY_END_MIN = 22 * 60 + 30;
/** The fallback wake time when no sleep was logged. */
export const DEFAULT_WAKE_MIN = 8 * 60;

/** How far past the mark the spend has to sit before the strip says "ahead",
 *  as a share of the envelope. Below this it is the ordinary jitter of a day
 *  that did its errands before lunch. */
export const AHEAD_MARGIN = 0.08;

export type PaceStatus = 'under' | 'ahead' | 'over';

export interface Pace {
  /** 0..1, where the marker sits. */
  expected: number;
  /** Effort minutes an even day would have spent by now. */
  byNowMin: number;
  status: PaceStatus;
  /** Minutes past midnight when the budget runs out at the current rate, or
   *  null when it does not run out today or there is no rate yet. */
  runsOutMin: number | null;
}

export function paceAt(
  nowMin: number,
  wakeMin: number | null,
  envelopeMin: number,
  spentMin: number,
): Pace {
  const wake = wakeMin == null || !Number.isFinite(wakeMin) ? DEFAULT_WAKE_MIN : wakeMin;
  const span = Math.max(60, DAY_END_MIN - wake);
  const elapsed = Math.max(0, Math.min(span, nowMin - wake));
  const expected = elapsed / span;
  const byNowMin = envelopeMin * expected;

  const status: PaceStatus =
    spentMin > envelopeMin ? 'over'
      : spentMin - byNowMin > envelopeMin * AHEAD_MARGIN ? 'ahead'
        : 'under';

  // The projection is the rate SINCE WAKE, extended forward. Before there is
  // an hour of day behind it the rate is noise, so it is not published: a
  // 6-minute errand at 8:05am must not report that the day runs out at nine.
  let runsOutMin: number | null = null;
  if (elapsed >= 60 && spentMin > 0 && status !== 'over') {
    const perMin = spentMin / elapsed;
    const remaining = envelopeMin - spentMin;
    const minsLeft = remaining / perMin;
    const at = nowMin + minsLeft;
    if (at <= DAY_END_MIN) runsOutMin = at;
  }

  return { expected, byNowMin, status, runsOutMin };
}

/** Minutes past midnight for an "HH:MM" clock string, or null. */
export function minutesOf(hhmm: string | undefined | null): number | null {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mi) || h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
