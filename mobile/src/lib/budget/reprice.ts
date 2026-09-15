/**
 * Re-pricing a stored day when the pricing RULES change.
 *
 * `days[dk].load` is written once, on the day itself, so a change to how a day
 * is charged reaches only the days that come after it. That is usually fine
 * and once was not: the gap tolerance moved from a fixed five minutes to the
 * day's own cadence (./burn `gapToleranceFor`), which on a background wrist
 * takes a day from almost no coverage to the whole waking day. Leaving the
 * back catalogue alone would put TODAY on one scale and the forty-two days the
 * ceiling is fitted from on another, and since `personal` in ./baseline can
 * only ever RAISE the ceiling, the lag runs the wrong way round: today's spend
 * reads high against a ceiling fitted from days that read low, so the bar fills
 * faster and the alerts fire more often for a fortnight. Harmless in direction
 * and wrong in fact, and the fix is to move both onto one scale at once.
 *
 * The material is already on the phone: `refreshDayLoad` puts a thinned copy of
 * each day's heart-rate curve in the waveform sidecar under `load:<dk>`, which
 * is the same thing `backfillHrBands` re-prices from. No health read, no
 * permission, nothing native.
 *
 * WHAT STOPS IT MAKING THINGS WORSE is `CURVE_MAX`. A curve is thinned to that
 * many points at WRITE time, so a day that wrote fewer was never thinned and
 * its curve is exactly what was read; a day sitting AT the cap had more, and
 * what survives is a lossy copy. The stored figures for such a day were
 * computed at read time from the raw series and are the most accurate numbers
 * that exist for it, so re-pricing them from the lossy copy would trade a good
 * answer for a worse one. Same inference ./burn's `uprightHours` already makes
 * about `uprightSpans` sitting at `UPRIGHT_SPANS_MAX`.
 *
 * Which leaves the nice part: the days that CANNOT be re-priced are the densely
 * sampled ones, and the days the tolerance change actually broke are the
 * sparse ones, whose curves are intact. The repair lands exactly where it is
 * needed.
 *
 * Pure: no store, no native, no React.
 */
import type { DayLoad } from '../types';

/**
 * Points kept in a stored day's heart-rate curve.
 *
 * Lives here rather than in the shell that writes it, because the writer and
 * the re-pricer have to agree about it: "is this curve a lossy copy" is
 * answered by comparing a length to this number, and two copies of it would
 * drift the moment one moved.
 */
export const CURVE_MAX = 400;

/**
 * The pricing rules a stored day was charged under.
 *
 * 1 is every day written before the tolerance was fitted to the day (and is
 * what an absent field means). BUMP THIS whenever a change to ./burn or
 * ./upright would give a stored day a different answer from the same curve,
 * and the repair runs once more.
 */
export const PRICE_VERSION = 2;

export type RepriceAction =
  /** Already priced under the current rules, or there is nothing to work from. */
  | 'done'
  /** The curve is a lossy copy: keep the stored minutes, stamp what can be
   *  read from it anyway (the cadence, which only needs the spacing). */
  | 'stamp'
  /** The curve is exactly what was read: charge the day again from it. */
  | 'full';

/**
 * What to do with one stored day.
 *
 * `curveLen` is the number of points in its sidecar curve, or null when the
 * curve is gone (pruned, or a day read before curves were kept). A day with no
 * curve is stamped DONE rather than left alone, for the reason
 * `backfillHrBands` stamps an empty band set: absent reads as "never looked"
 * and would be rescanned on every launch for ever.
 */
export function repriceAction(load: DayLoad | undefined | null, curveLen: number | null): RepriceAction {
  if (!load) return 'done';
  if ((load.pricedVersion ?? 1) >= PRICE_VERSION) return 'done';
  if (curveLen == null || curveLen < 2) return 'stamp';
  // At or over the cap means the curve was thinned and the stored minutes are
  // the better answer. Only the cadence can still be read off it.
  return curveLen >= CURVE_MAX ? 'stamp' : 'full';
}
