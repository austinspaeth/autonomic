/**
 * Cohort ping — the pure half. The stateful side (flags, network, lifecycle)
 * lives in src/store/ping.ts; this module is just the wire format and the
 * once-per-day rule, so jest can pin them.
 *
 * The app sends exactly two facts: the day this install first ran, and which
 * of the two stores it came from. The server stamps the day the request
 * arrives, and (cohort day, arrival day) is a retention matrix. No identifier
 * is involved anywhere — see the header of src/store/ping.ts for what that
 * costs and buys.
 */

/** Base URL of the two ping routes (`/open/<code>` and `/sub/<code>`). */
export const PING_BASE = 'https://api.autonomic.care/ping';

/**
 * The platform marker carried by a ping: one letter, appended to the cohort
 * code. `U` covers everything else, including pings from builds that shipped
 * before the marker existed (the server reads a missing suffix as `U`).
 */
export type PlatformCode = 'I' | 'A' | 'U';

/** Map a `Platform.OS` value onto its marker. */
export function platformCode(os: string | undefined): PlatformCode {
  if (os === 'ios') return 'I';
  if (os === 'android') return 'A';
  return 'U';
}

/* ------------------------------------------------------------------ dates */

/**
 * Day-of-month of the `n`th Sunday of a month (1-based `n`, 0-based `month`).
 */
function nthSunday(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
}

/**
 * Is this instant inside US Eastern daylight time?
 *
 * Second Sunday of March at 02:00 local standard (07:00 UTC) through the first
 * Sunday of November at 02:00 local daylight (06:00 UTC). Hard-coded rather
 * than asked of `Intl`, because this has to give the same answer in Hermes and
 * in Node — a client and a server that disagree about which day it is would
 * let one install land twice in one row.
 */
function isEasternDst(ms: number): boolean {
  const year = new Date(ms).getUTCFullYear();
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 7);
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 6);
  return ms >= start && ms < end;
}

/**
 * The US Eastern calendar day of a timestamp, as YYYY-MM-DD.
 *
 * Eastern rather than UTC because these counters are read as a business's own
 * days: a ping at 8pm in New York belongs to that evening, not to tomorrow.
 * The server buckets the same way (sls/lambdas/ping/main.js), which is the
 * part that matters — see `shouldPingOpen`.
 */
export function easternDay(ms: number): string {
  const offsetMs = (isEasternDst(ms) ? 4 : 5) * 60 * 60 * 1000;
  return new Date(ms - offsetMs).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------- wire */

/**
 * Encode a cohort as the wire format the endpoint takes: D{MMDDYY}{platform},
 * e.g. `D082126I`.
 */
export function cohortCode(isoDate: string, platform: PlatformCode = 'U'): string {
  const [y, m, d] = isoDate.split('-');
  return `D${m}${d}${y.slice(2)}${platform}`;
}

/** The full URL for one ping. */
export function pingUrl(
  kind: 'open' | 'sub',
  cohortIso: string,
  platform: PlatformCode = 'U',
): string {
  return `${PING_BASE}/${kind}/${cohortCode(cohortIso, platform)}`;
}

/**
 * Should this install send an open ping now?
 *
 * Buckets by Eastern rather than local midnight because Eastern is what the
 * server counts into: matching the two means one install contributes at most
 * one count per row, wherever in the world the phone is.
 */
export function shouldPingOpen(lastSentDay: string | undefined, nowMs: number): boolean {
  return lastSentDay !== easternDay(nowMs);
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
  return easternDay(Number.isFinite(stamped) && stamped <= nowMs ? stamped : nowMs);
}
