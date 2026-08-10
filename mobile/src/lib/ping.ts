/**
 * Cohort ping — the pure half. The stateful side (flags, network, lifecycle)
 * lives in src/store/ping.ts; this module is just the wire format and the
 * once-per-day rule, so jest can pin them.
 *
 * The app sends exactly one fact: the UTC day this install first ran. The
 * server stamps the day the request arrives, and (cohort day, arrival day) is
 * a retention matrix. No identifier is involved anywhere — see the header of
 * src/store/ping.ts for what that costs and buys.
 */

/** Base URL of the two ping routes (`/open/<code>` and `/sub/<code>`). */
export const PING_BASE = 'https://api.autonomic.care/ping';

/** The UTC calendar day of a timestamp, as YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Encode an ISO date as the wire format the endpoint takes: D{MMDDYY}. */
export function cohortCode(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `D${m}${d}${y.slice(2)}`;
}

/** The full URL for one ping. */
export function pingUrl(kind: 'open' | 'sub', cohortIso: string): string {
  return `${PING_BASE}/${kind}/${cohortCode(cohortIso)}`;
}

/**
 * Should this install send an open ping now?
 *
 * Buckets by UTC rather than local midnight because UTC is what the server
 * counts into: matching the two means one install contributes at most one
 * count per row, even for a user who crosses a date line.
 */
export function shouldPingOpen(lastSentDay: string | undefined, nowMs: number): boolean {
  return lastSentDay !== utcDay(nowMs);
}

/**
 * This install's cohort, given what the flags store knows.
 *
 * `frozen` is a cohort already decided (nothing may move an install between
 * cohorts afterwards, including a clock change). Otherwise the trial stamp
 * written by initTier() on the very first launch is the install's birthday —
 * on an install that has been around a while, today is emphatically not the
 * cohort. Today is the last resort, for a stamp that is missing or in the
 * future (a rolled-back clock).
 */
export function resolveCohort(
  frozen: string | undefined,
  trialStartedAtIso: string | undefined,
  nowMs: number,
): string {
  if (frozen) return frozen;
  const stamped = Date.parse(trialStartedAtIso || '');
  return utcDay(Number.isFinite(stamped) && stamped <= nowMs ? stamped : nowMs);
}
