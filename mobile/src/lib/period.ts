/**
 * Default time-of-day tag ("period") for a new reading, shared by the live
 * HRV setup sheet and manual entry forms (e.g. blood pressure).
 */
import { getState } from '../store/store';

export type Period = 'Morning' | 'Evening' | 'Other';

/** Before 11am → Morning, after 7pm → Evening — unless a reading of the SAME
 *  type already carries that tag on this day (each type gets one morning and
 *  one evening; extras fall through to Other). */
export function defaultPeriod(type: string, dk: string, hour: number = new Date().getHours()): Period {
  const day = getState().days[dk];
  const has = (per: Period) => (day?.readings || []).some((r) => r.type === type && r.period === per);
  if (hour >= 19) return has('Evening') ? 'Other' : 'Evening';
  if (hour < 11) return has('Morning') ? 'Other' : 'Morning';
  return 'Other';
}
