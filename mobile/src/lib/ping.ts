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
 * CAPTURE IS TWO PINGS, NOT ONE: `/cap` when a reading STARTS and `/hrv` when
 * one COMPLETES. They are separate routes rather than one route with a phase
 * letter because they answer different questions and are read against different
 * denominators, and because a route is the one distinction no consumer can
 * accidentally pool away.
 *
 * The pair exists because the interesting failure is invisible to either one
 * alone. A five-minute reading is a long time to sit still, and somebody who
 * starts one and walks away has told us something specific — the sensor would
 * not pair, the breathing pace was wrong, the session was too long, the phone
 * rang — none of which shows up in a counter that only sees finished readings.
 * `hrv[day] / cap[day]` is the completion rate, and with the sensor letter on
 * both it is the completion rate PER SENSOR, which is the form the question is
 * useful in.
 *
 * Neither fires on SAVE, and that is deliberate: the reading is the measurement,
 * and whether the user then kept the card open long enough to tap Save is a
 * different fact about a different moment. Counting the save conflated "the app
 * measured them" with "they filed it", and undercounted every completed reading
 * that was discarded, backgrounded or lost to a stack that closed.
 *
 * The COMPLETED ping is also the open ping's twin, and answers the question the
 * open ping cannot: an install that launches the app every morning and never
 * measures is not using it. Same shape, same once-per-Eastern-day rule, so the
 * two are directly comparable — measured over opened, on the same day, is the
 * share of the people who were there who actually took a reading.
 *
 * It carries the sensor letter too, and that does NOT break the symmetry the
 * pair is built on. The letter rides INSIDE the cohort code, so it splits the
 * key a count lands under and never the count itself: a day's readings still
 * sum to one per install per Eastern day, exactly as its opens do, and
 * `hrv[day] / open[day]` is the same share of people it always was. What the
 * letter cannot say is "which sensors did this person use today" — the daily
 * cap means it names whichever reading came FIRST, which is the honest reading
 * of it and the one the dashboard states. Activation answers "with what did
 * they start"; this answers "with what are they still measuring", and a cohort
 * that starts on the camera and stays there is a different product problem
 * from one that starts there and moves to a strap.
 *
 * The PAYWALL ping is the newest route and the only one that is not about a
 * measurement: it fires the first time in an Eastern day that a locked surface
 * raises the paywall, carrying one letter for WHICH surface. Same cap as the
 * open and HRV routes, for the same reason — it counts people who met a wall
 * that day, not walls met — and it names the day's FIRST wall, which is the
 * honest limit of a once-a-day counter and the one the dashboard states.
 *
 * Every route now also carries the install's TIER and the build's VERSION.
 * Those are the two questions that were unanswerable before: every counter here
 * described one undifferentiated population, so "do paying users measure more"
 * and "has the fix reached anybody yet" both needed a data source the app does
 * not have. Neither is an identifier — a tier letter is one of three and a
 * version is shared by everyone who updated.
 */

/** Base URL of every ping route. */
export const PING_BASE = 'https://api.autonomic.care/ping';

/**
 * The routes a ping can take.
 *
 * A route is the ONE distinction no consumer can accidentally pool away, which
 * is why phases of the same thing get their own — started/completed, and
 * shown/dismissed/accepted — rather than a phase letter inside a shared one.
 * Flavours of the same event share a route and are told apart by the slot
 * letter: sensors, walls, which offer, which view.
 */
export type PingKind =
  | 'open' | 'sub' | 'act'          // install lifecycle
  | 'cap' | 'hrv'                   // a reading started · completed
  | 'pay'                           // met the paywall
  | 'not'                           // turned a notification on
  | 'pot'                           // finished a POTS capture
  | 'see'                           // opened a gated view
  | 'err'                           // something failed on this install
  | 'osh' | 'odm' | 'oac';          // an offer was shown · dismissed · accepted

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
 * How a reading was taken: `W` Apple Watch, `B` Bluetooth strap, `F` finger on
 * the camera, `G` Garmin watch. Carried by all three capture routes — the
 * activation ping (the sensor of the first reading this install ever finished),
 * and the daily started/completed pair (the sensor of that day's first capture
 * of each kind). It is a property of one capture, never of the install.
 *
 * On the started/completed pair it is what makes abandonment answerable per
 * sensor, which is the form the question is actually useful in: "do camera
 * readings get abandoned more than strap readings" is a product decision, where
 * a single pooled completion rate is only ever a number to worry about.
 */
export type MethodCode = 'W' | 'B' | 'F' | 'G';

/** Map an HRV capture source (see features/hrv/SourcePicker) onto its marker. */
export function methodCode(source: string | undefined): MethodCode | undefined {
  if (source === 'watch') return 'W';
  if (source === 'polar') return 'B';
  if (source === 'camera') return 'F';
  if (source === 'garmin') return 'G';
  return undefined;
}

/**
 * Which locked surface raised the paywall: `R` a locked Progress range
 * (Week/Month/Year/custom), `I` the Insights tab, `P` a POTS capture, `O` the
 * Outlook's AI report, `M` a metric's AI report, `N` the Insights AI report,
 * `S` the Upgrade button in Settings.
 *
 * It rides in the SAME slot the sensor letter uses, because it is the same kind
 * of fact: one letter saying which flavour of this route's event happened. A
 * route only ever sends one alphabet, so the two can never be confused, and
 * every consumer that already splits a reading ping by sensor splits a paywall
 * ping by surface with no new machinery.
 *
 * `S` is the odd one and is deliberately kept: it is the only entry here that
 * is not a wall. Somebody who opened Settings and tapped Upgrade went LOOKING
 * for the paywall, which is the opposite signal from somebody who walked into
 * it, and a conversion rate that mixes the two is telling you about the wrong
 * population.
 */
export type SurfaceCode = 'R' | 'I' | 'P' | 'O' | 'M' | 'N' | 'S';

/** Map a `usePaywall()` call site's name onto its marker. */
export function surfaceCode(surface: string | undefined): SurfaceCode | undefined {
  if (surface === 'progress') return 'R';
  if (surface === 'insights') return 'I';
  if (surface === 'pots') return 'P';
  if (surface === 'outlook-ai') return 'O';
  if (surface === 'metric-ai') return 'M';
  if (surface === 'insights-ai') return 'N';
  if (surface === 'settings') return 'S';
  return undefined;
}

/**
 * Which notification the user just turned ON: `M` the morning reminder, `C` the
 * crash warning. Only an enable is counted — a disable is a different event and
 * counting both here would make the number meaningless in the direction that
 * matters, which is "did anyone accept the ask".
 */
export type NotifyCode = 'M' | 'C';

/** Map a notification kind onto its marker. */
export function notifyCode(kind: string | undefined): NotifyCode | undefined {
  if (kind === 'reminder') return 'M';
  if (kind === 'crash') return 'C';
  return undefined;
}

/**
 * Which POTS capture just finished: `T` the stand test, `E` an episode
 * (orthostatic) capture. Two genuinely different things — one is a protocol the
 * user sat down to run, the other is a symptom they were having — which is why
 * they are told apart rather than pooled as "a POTS capture".
 */
export type PotsCode = 'T' | 'E';

/**
 * Which gated view was opened: `I` Insights, `P` Progress. The two Pro surfaces
 * a free user can see the shape of but not the contents of, so "how many people
 * go looking" is the demand side of the same question the paywall counter asks
 * from the supply side.
 */
export type ViewCode = 'I' | 'P';

/** Which offer: `A` the half-off annual window, `F` the founding-member card. */
export type OfferCode = 'A' | 'F';

/**
 * The 8th-character slot, whatever the route calls it: a sensor on the capture
 * routes, a surface on the paywall route, a notification, a POTS kind, a view or
 * an offer on the rest. One slot, one letter, and the ROUTE says which alphabet
 * it is drawn from — so no route can be handed another's letters, and a
 * consumer that knows the route always knows what the letter means.
 */
export type SlotCode = MethodCode | SurfaceCode | NotifyCode | PotsCode | ViewCode | OfferCode;

/**
 * What this install could do at the moment it pinged: `F` free, `T` trial (the
 * install trial and the half-off annual window both report this — nobody paid,
 * and it ends), `P` paid.
 *
 * EVERY route carries it, which is the point. Without it the counters describe
 * a single undifferentiated population, and every question worth asking of them
 * is really a question about one half of it: do paying users open the app more,
 * do free users measure less, which wall does a trial hit on its last day. It
 * is a property of the install at the instant of the ping and it MOVES — a
 * cohort's rows drift from F to P as people convert, which is the conversion
 * curve, read for free.
 *
 * It names no person and buys nobody an identifier: it is one of three letters
 * shared by everybody in the same state on the same day.
 */
export type TierCode = 'F' | 'T' | 'P';

/** Map a `getTier()` value onto its marker. Anything unrecognised is free —
 *  the app's own default, and the safe way to be wrong about a count. */
export function tierCode(tier: string | undefined): TierCode {
  if (tier === 'pro') return 'P';
  if (tier === 'trial') return 'T';
  return 'F';
}

/**
 * The app version, reduced to the digits that identify a build: `1.26.0`.
 *
 * Anything that is not a dotted number is dropped rather than sent, because
 * this ends up as a MAP KEY on the server and a key nobody can read is worse
 * than a key that is absent. One to three parts are accepted, so a build that
 * calls itself `1.26` counts under `1.26` instead of vanishing.
 */
export function versionCode(version: string | undefined): string | undefined {
  const v = String(version || '').trim();
  return /^\d+(\.\d+){0,2}$/.test(v) ? v : undefined;
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
 * Encode one ping as the single opaque code the endpoint takes:
 *
 *   D082126I                 an open, from an iOS install born 21 Aug 2026
 *   D082126IG               a reading, taken on a Garmin
 *   D082126IG-TP-V1.26.0    the same reading, from a paid install on 1.26.0
 *
 * The head is FIXED-WIDTH and unchanged since the first build: `D`, the cohort
 * as MMDDYY, one letter for the platform, and an optional letter for the slot
 * (the sensor on a reading route, the surface on the paywall route). Everything
 * added since rides behind it as `-` separated, TAGGED tokens.
 *
 * Tagged rather than positional, and behind a delimiter rather than appended to
 * the head, because the head had already run out of room in a way that cannot
 * be fixed later: `[A-Z]?[A-Z]?` cannot tell a missing sensor from a tier
 * letter sitting where the sensor would have been, so one more bare letter
 * would have made `D082126IP` ambiguous forever. A tag says what a token is
 * regardless of what else is present, which means a future field costs a letter
 * and breaks nothing.
 *
 * Old builds send no tokens at all, so the format is backward compatible by
 * construction: every ping in the table today decodes under the new reader as
 * "no tier, no version", which is exactly what it is.
 */
export function cohortCode(
  isoDate: string,
  platform: PlatformCode = 'U',
  slot?: SlotCode,
  tier?: TierCode,
  version?: string,
): string {
  const [y, m, d] = isoDate.split('-');
  const head = `D${m}${d}${y.slice(2)}${platform}${slot || ''}`;
  const v = versionCode(version);
  return `${head}${tier ? `-T${tier}` : ''}${v ? `-V${v}` : ''}`;
}

/** The full URL for one ping. */
export function pingUrl(
  kind: PingKind,
  cohortIso: string,
  platform: PlatformCode = 'U',
  slot?: SlotCode,
  tier?: TierCode,
  version?: string,
): string {
  return `${PING_BASE}/${kind}/${cohortCode(cohortIso, platform, slot, tier, version)}`;
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
