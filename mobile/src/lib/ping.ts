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
 *
 * The activation ping carries one more letter — which sensor took the reading —
 * because "did they ever get a first reading" and "with what" are the same
 * question: a cohort that activates only on the camera is a different product
 * problem from one that never activates at all.
 *
 * The HRV ping is the open ping's twin, and answers the question the open ping
 * cannot: an install that launches the app every morning and never measures is
 * not using it. Same shape (cohort + platform), same once-per-Eastern-day rule,
 * so the two are directly comparable — measured over opened, on the same day,
 * is the share of the people who were there who actually took a reading. It
 * carries NO sensor letter: the activation ping is the one that answers "with
 * what", and a once-a-day counter could only ever name the sensor of whichever
 * reading happened to be first.
 */

/** Base URL of the four ping routes (`/open`, `/sub`, `/act`, `/hrv`). */
export const PING_BASE = 'https://api.autonomic.care/ping';

/** The four routes a ping can take. */
export type PingKind = 'open' | 'sub' | 'act' | 'hrv';

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

/**
 * How the activating reading was taken: `W` Apple Watch, `B` Bluetooth strap,
 * `F` finger on the camera. Only the activation ping carries one — the marker
 * is a property of that one reading, not of the install.
 */
export type MethodCode = 'W' | 'B' | 'F';

/** Map an HRV capture source (see features/hrv/SourcePicker) onto its marker. */
export function methodCode(source: string | undefined): MethodCode | undefined {
  if (source === 'watch') return 'W';
  if (source === 'polar') return 'B';
  if (source === 'camera') return 'F';
  return undefined;
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
 * Encode a cohort as the wire format the endpoint takes:
 * D{MMDDYY}{platform}{method?}, e.g. `D082126I` or `D082126IB`.
 *
 * The method letter is appended rather than sent as a second path segment or a
 * query parameter so that every route stays one opaque code the server decodes
 * in one place, and so a row's storage key stays a single string.
 */
export function cohortCode(
  isoDate: string,
  platform: PlatformCode = 'U',
  method?: MethodCode,
): string {
  const [y, m, d] = isoDate.split('-');
  return `D${m}${d}${y.slice(2)}${platform}${method || ''}`;
}

/** The full URL for one ping. */
export function pingUrl(
  kind: PingKind,
  cohortIso: string,
  platform: PlatformCode = 'U',
  method?: MethodCode,
): string {
  return `${PING_BASE}/${kind}/${cohortCode(cohortIso, platform, method)}`;
}

/**
 * Has the Eastern day turned over since this route last sent?
 *
 * Buckets by Eastern rather than local midnight because Eastern is what the
 * server counts into: matching the two means one install contributes at most
 * one count per row, wherever in the world the phone is.
 *
 * Shared by the two daily routes — opens and HRV readings — because they are
 * only comparable if they are bucketed identically. A day on which one of them
 * rolled over an hour before the other would put a reading and the launch that
 * produced it in different rows.
 */
export function shouldPingDaily(lastSentDay: string | undefined, nowMs: number): boolean {
  return lastSentDay !== easternDay(nowMs);
}

/** The open route's daily gate. Kept as its own name because the call site
 *  reads as a question about opens, not about days. */
export const shouldPingOpen = shouldPingDaily;

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
