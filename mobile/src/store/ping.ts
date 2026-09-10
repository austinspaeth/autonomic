/**
 * Cohort ping — the one and only thing this app sends anywhere.
 *
 * The question it answers is retention: of the installs that started using the
 * app on a given day, how many are still opening it weeks later, and how many
 * ever subscribed. Answering that needs exactly one fact per request, the day
 * this install first ran, because the server stamps the day the request
 * arrives. Two routes, no body, no response worth reading:
 *
 *   GET /ping/open/D082126I   opened today by an install from that cohort
 *   GET /ping/sub/D082126I    an install from that cohort became a subscriber
 *   GET /ping/act/D082126IB   an install from that cohort took its FIRST reading
 *   GET /ping/hrv/D082126IG   an install from that cohort took a reading today
 *
 * The trailing letter is the platform: I for iOS, A for Android. It is a
 * property of the build, not of the person holding it, and it is what makes
 * "how is Android doing" answerable without a second data source.
 *
 * The activation ping carries a second letter for the sensor that reading used
 * (W Apple Watch / B Bluetooth strap / F finger on camera / G Garmin watch).
 * Installing is not using: without a first HRV reading there is no score, no
 * trend and nothing to come back for, so "how many of a cohort ever got one,
 * and with what" is the single number that says whether onboarding works. It is the same shape as the other
 * two — one code, no identifier — and it fires exactly once per install.
 *
 * CAPTURE IS COUNTED TWICE, at the two moments that can differ. `/cap` fires
 * when a reading STARTS (`beginCollection`, the moment the timer runs) and
 * `/hrv` when one COMPLETES (`finishSession`, the moment there is a result).
 * Neither fires on Save. Saving is a third moment and a different fact — the
 * measurement already happened, and a completed reading that was discarded,
 * backgrounded or lost to a closing sheet stack is still a reading this app
 * took. Counting the save undercounted exactly those, and it could not see an
 * abandoned session at all.
 *
 * That gap is the point of the pair. Five minutes is a long time to sit still,
 * and a start with no completion is the specific shape of "the app asked for
 * something the person could not give it" — a strap that would not pair, a pace
 * that was wrong, a session that was too long. `hrv / cap` on one day is the
 * completion rate, and because both carry the sensor letter it is the
 * completion rate PER SENSOR, which is the version of the number that implies
 * an action.
 *
 * The COMPLETED ping is also the open ping's twin and half the reason both
 * exist: opening the app is not using it. An install that launches every morning, reads yesterday's
 * score and never measures again has a retention curve that looks healthy and a
 * journal that is going nowhere, and the open counter alone cannot tell that
 * apart from a person taking a reading a day. So this fires at most once per
 * Eastern day, from the moment a reading is SAVED, carrying the same cohort and
 * platform an open ping carries — which makes the two directly comparable:
 * readings over opens, on one day, is the share of the people who were there
 * who actually measured. It names its sensor as well, which costs that symmetry
 * nothing: the letter splits the KEY a count lands under, not the count, so a
 * day's readings still sum to one per install. The daily cap does mean it names
 * whichever reading came first that day, which is what the dashboard says it
 * is. Activation answers "what did they start on"; this answers "what are they
 * still measuring with".
 *
 * What is deliberately absent: no device id, no install id, no session id, no
 * request body, no health data, no journal data, nothing about what the user
 * did in the app. Not "anonymized" — never collected. A cohort date is shared
 * by every install born that day, so it names a day, not a person.
 *
 * Because there is no identifier, the server cannot de-duplicate, so THIS side
 * has to: at most one open ping per install per Eastern day (the server's own
 * bucket — see easternDay in ../lib/ping), and exactly one subscribe ping per
 * install, ever.
 *
 * Bookkeeping lives in the plaintext `autonomic.flags` MMKV, the same instance
 * as the trial stamp and the review-prompt memory. That placement is the point:
 * it is device-local bookkeeping about what this install has SENT, so it must
 * never ride export/import (a restored journal would re-ping every day it
 * remembered) and it must survive "Erase journal" (erasing data is not a
 * reinstall). A genuine reinstall does start a new cohort — accepted, the same
 * trade the trial window already makes.
 *
 * Failures are silent and unlogged. Being offline is the normal state of a
 * phone, not an error worth a slot in the 40-entry support log — a lost ping
 * costs one count and retries on the next foreground.
 */
import { AppState as RNAppState, Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import {
  easternDay, methodCode, notifyCode, pingUrl, platformCode, resolveCohort,
  shouldPingDaily, surfaceCode, tierCode,
  type OfferCode, type PingKind, type PotsCode, type SlotCode, type ViewCode,
} from '../lib/ping';
import { getIapState, paywallBypassed, subscribeIap } from './iap';
import { getTier } from './tier';

const FLAGS_ID = 'autonomic.flags';
const KEY_COHORT = 'pingCohort';        // ISO date — this install's cohort, frozen once
const KEY_LAST_OPEN = 'pingLastOpen';   // ISO date (Eastern) of the last open ping sent
const KEY_SUB_SENT = 'pingSubSent';     // '1' once the subscribe ping landed
const KEY_ACT_SENT = 'pingActSent';     // '1' once the activation ping landed
const KEY_LAST_CAP = 'pingLastCap';     // ISO date (Eastern) of the last capture-started ping
const KEY_LAST_HRV = 'pingLastHrv';     // ISO date (Eastern) of the last capture-completed ping
const KEY_LAST_PAY = 'pingLastPay';     // ISO date (Eastern) of the last paywall ping
const KEY_LAST_NOT = 'pingLastNot';     // + the notification letter — one per day EACH
const KEY_LAST_POT = 'pingLastPot';     // + the POTS letter
const KEY_LAST_SEE = 'pingLastSee';     // + the view letter
const KEY_LAST_OFF = 'pingLastOff';     // + the phase letter + the offer letter
const KEY_ERR_SENT = 'pingErrSent';     // '1' once this install has reported a failure
/** Written by ./tier.ts on first launch: this install's birthday. */
const KEY_TRIAL_STARTED = 'trialStartedAt';

/** A ping whose response nobody reads has no reason to hold a socket open on
 *  a bad connection. */
const TIMEOUT_MS = 6000;

/* ----------------------------------------------------------------- flags */

let kv: MMKV | null | undefined;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}
function read(key: string): string | undefined {
  try { return store()?.getString(key); } catch { return undefined; }
}
function write(key: string, value: string) {
  try { store()?.set(key, value); } catch { /* nothing to do; retries next launch */ }
}

function cohortDate(nowMs: number): string {
  const cohort = resolveCohort(read(KEY_COHORT), read(KEY_TRIAL_STARTED), nowMs);
  if (read(KEY_COHORT) !== cohort) write(KEY_COHORT, cohort);
  return cohort;
}

/* ------------------------------------------------------------------ wire */

/**
 * This build's version, or undefined if it cannot be read.
 *
 * Required rather than optional: a version that fails to resolve must land as
 * ABSENT, never as a wrong string, because it becomes a map key on the server
 * and a bogus key is a build that appears to exist.
 */
function appVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-constants').default?.expoConfig?.version || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fire one ping. Resolves true only if the server actually took it.
 *
 * Tier and version are stamped HERE rather than by each caller, which is the
 * only reason "every ping carries them" is a fact about the app and not a
 * convention four call sites are each expected to remember. A route added later
 * gets them for free; a route cannot forget them.
 *
 * Tier is read at the moment of the send, so it is the state the install was in
 * when the event happened — a purchase mid-session moves the NEXT ping, which
 * is what makes a cohort's drift from F to P a conversion curve.
 */
async function send(kind: PingKind, cohort: string, slot?: SlotCode): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = pingUrl(
    kind, cohort, platformCode(Platform.OS), slot, tierCode(getTier()), appVersion(),
  );
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;   // offline, DNS, timeout — all the same to us
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------- pinging */

/**
 * One in-flight guard per route, and every route needs one.
 *
 * The "sent" flag is written only on success, so between the check and the
 * write there is a window in which a second caller reads a flag that is not
 * there yet and sends the same ping again. `pingOpen` is called from two places
 * and has always been guarded; `pingSub` was not, and Android found the hole:
 * Play's purchase sheet is a separate ACTIVITY, so completing a purchase
 * backgrounds and re-foregrounds the app, and within the same second the
 * purchase listener, the AppState handler here and the entitlement refresh in
 * ./iap all call pingSub — three calls, one flag, written last. iOS renders
 * StoreKit in-process, never leaves the foreground, and so only ever made the
 * one call, which is why a real Android purchase counted twice and an iOS one
 * did not. Since there is no identifier the server cannot de-duplicate, so a
 * duplicate here is a permanent wrong number in the subscriber count.
 */
const inFlight: Record<string, boolean> = {};

/**
 * The daily counters, all of them, in one function.
 *
 * `flagKey` is the memory: whichever routes share one share a cap. That is the
 * distinction the two shapes of counter here turn on, and it is worth being
 * explicit about because both are correct and they measure different things.
 *
 * A **whole-route cap** (`open`, `cap`, `hrv`, `pay`) means one ping per install
 * per Eastern day for the WHOLE route, so a day's rows sum to the number of
 * people. That is what makes `hrv[day] / open[day]` a share of people, and it is
 * why the slot letter on those routes can only ever describe the FIRST event of
 * the day rather than the day.
 *
 * A **per-letter cap** (`not`, `pot`, `see`, the three offer routes) means one
 * ping per install per day per LETTER. Those routes carry flavours the user
 * genuinely chose between — a stand test is not an episode, Insights is not
 * Progress — and a whole-route cap would have silently dropped the second one
 * every time somebody did both. The trade is that the route's daily TOTAL is no
 * longer a headcount; each letter's count still is, which is the number anyone
 * actually wants.
 *
 * The in-flight guard is keyed the same way, and every route needs one: the
 * "sent" flag is written only on success, so between the check and the write
 * there is a window where a second caller reads a flag that is not there yet and
 * sends the same ping again. `pingSub` learned this the hard way — Play's
 * purchase sheet is a separate ACTIVITY, so a completed purchase backgrounds and
 * re-foregrounds the app, and the purchase listener, the AppState handler and
 * the entitlement refresh all called it inside one second. iOS renders StoreKit
 * in-process, never leaves the foreground, and so only ever made the one call,
 * which is why a real Android purchase counted twice and an iOS one did not.
 * Since there is no identifier the server cannot de-duplicate, so a duplicate
 * here is a permanent wrong number.
 */
function pingDaily(kind: PingKind, flagKey: string, slot?: SlotCode): void {
  if (__DEV__) return;
  if (inFlight[flagKey]) return;
  const now = Date.now();
  if (!shouldPingDaily(read(flagKey), now)) return;
  inFlight[flagKey] = true;
  void (async () => {
    try {
      if (await send(kind, cohortDate(now), slot)) write(flagKey, easternDay(now));
    } finally {
      inFlight[flagKey] = false;
    }
  })();
}

/** A per-letter daily counter's memory key. A route with no letter to report
 *  falls back to the route's own key, so it simply behaves as a whole-route
 *  cap — the safe direction: never more than one ping. */
const slotKey = (base: string, slot?: SlotCode) => (slot ? `${base}${slot}` : base);

/**
 * Send today's open ping, unless this install already sent one today.
 *
 * The "sent" flag is written only on success, so a launch made in airplane
 * mode retries at the next foreground. The cost of that choice is a possible
 * double count when a response is lost after the server counted it — far rarer
 * than being offline, and it errs toward reporting a real user as present.
 */
async function pingOpen(): Promise<void> {
  if (inFlight.open) return;
  const now = Date.now();
  if (!shouldPingDaily(read(KEY_LAST_OPEN), now)) return;
  inFlight.open = true;
  try {
    if (await send('open', cohortDate(now))) write(KEY_LAST_OPEN, easternDay(now));
  } finally {
    inFlight.open = false;
  }
}

/**
 * Send the one-per-install subscribe ping, once the store says this install is
 * entitled — whichever CTA got them there, since every path ends in the same
 * entitlement. Waits for `ready` so the cold-start guess in ./tier.ts (which
 * trusts a persisted flag before the store answers) can't trigger it, and
 * skips builds whose Pro status came from a paywall bypass: nobody paid in a
 * dev, TestFlight or sideloaded build.
 */
async function pingSub(): Promise<void> {
  if (inFlight.sub) return;
  if (read(KEY_SUB_SENT) === '1') return;
  if (paywallBypassed()) return;
  const { ready, isPro } = getIapState();
  if (!ready || !isPro) return;
  inFlight.sub = true;
  try {
    if (await send('sub', cohortDate(Date.now()))) write(KEY_SUB_SENT, '1');
  } finally {
    inFlight.sub = false;
  }
}

/**
 * Send the one-per-install activation ping, from the moment this install's first
 * HRV reading COMPLETES (`finishSession`) — never from the moment one starts,
 * since a session that was abandoned produced nothing and is the opposite of an
 * activation, and never from the Save, since the measurement is what activated
 * them and filing it is a separate decision they may reasonably not make.
 *
 * Exported rather than driven from a subscription because there is no store
 * state to watch: the caller knows a reading just finished, and the flag here
 * makes every call after the first a no-op. Dev builds send nothing, the same
 * rule `initPing` applies to opens.
 */
export function pingActivation(source: string | undefined): void {
  if (__DEV__) return;
  if (inFlight.act) return;
  if (read(KEY_ACT_SENT) === '1') return;
  inFlight.act = true;
  void (async () => {
    try {
      if (await send('act', cohortDate(Date.now()), methodCode(source))) write(KEY_ACT_SENT, '1');
    } finally {
      inFlight.act = false;
    }
  })();
}

/**
 * Send today's capture-STARTED ping, unless this install already sent one today.
 *
 * Fired from `beginCollection` in features/hrv/sessionStore.ts — the moment the
 * timer actually runs, not the moment the setup card opened. Opening a card and
 * backing out is browsing; this counter is for readings that genuinely began and
 * therefore genuinely could have been finished.
 *
 * It lives in the ENGINE rather than in a view for the same reason the session
 * itself does: a reading can be minimized, restored, backgrounded and finished
 * from three different places, and a counter mounted in one of them would miss
 * the others.
 */
export function pingCaptureStarted(source: string | undefined): void {
  pingDaily('cap', KEY_LAST_CAP, methodCode(source));
}

/**
 * Send today's capture-COMPLETED ping, unless this install already sent one
 * today.
 *
 * Fired from `finishSession`, which is the ONE path out of a running reading —
 * the timer reaching the duration and the user tapping Finish both go through
 * it, and it early-returns once finished, so a completion cannot be counted
 * twice. Abandoning instead calls `endSession`, which pings nothing: that is
 * exactly the gap `pingCaptureStarted` above exists to make visible.
 *
 * NOT fired on Save. The measurement is the event; whether the results card
 * survived long enough to be filed is a different fact about a different moment,
 * and counting it here silently dropped every reading that was discarded or lost
 * to a closing sheet stack.
 *
 * The sensor letter names THIS capture, which the daily cap makes the first
 * completion of the day rather than a summary of the day — a person who straps
 * up in the morning and checks on the camera at night counts once, as a strap.
 * The dashboard reads it that way; nothing here is allowed to pretend otherwise.
 *
 * The flag is written only on success, so a reading finished offline is
 * re-counted by the next one that day rather than being lost — and if there is
 * no next one, the day simply reports what it could see. The same trade
 * `pingOpen` makes, and it errs the same way: toward reporting a real reading.
 */
export function pingCaptureCompleted(source: string | undefined): void {
  pingDaily('hrv', KEY_LAST_HRV, methodCode(source));
}

/**
 * The wrist route's counterpart to the pair above: a reading taken ON a watch,
 * with the phone never asked to run a session at all.
 *
 * The phone-side counters live in `sessionStore` because that is the one path a
 * phone-driven reading can start from. A watch reading has no such path — the
 * wearer starts it on the wrist, walks away, and the whole beat-to-beat series
 * arrives in one message when it finishes. Counted only where the session runs,
 * those readings were invisible: no `hrv` row, and worse, an install whose FIRST
 * ever reading was taken this way never registered as activated at all. That is
 * the normal way to use the Garmin app and a normal way to use the Apple Watch,
 * so the two receivers call this from their arrival path.
 *
 * It fires the STARTED ping as well as the completed one, and that is the whole
 * design decision here. A reading that arrives did begin — we simply learned of
 * the start and the finish in the same instant — and `hrv / cap` is read as a
 * completion rate, so crediting the completion alone would let `hrv` exceed
 * `cap` and turn a rate into a number above 100%. What this cannot see is a
 * wrist reading that was ABANDONED: the watch sends nothing, so the completion
 * rate is measured only over phone-driven sessions and reads high for the watch
 * sensors. That is a disclosure, not a distortion of the headcount, which is
 * what `hrv` is actually for.
 *
 * Both daily routes are capped per install per Eastern day, so a wrist reading
 * landing after a phone-driven one adds nothing, and activation is capped per
 * install ever — no call here can double count.
 *
 * The CALLER decides whether the reading belongs to today (`dayKey ===
 * todayKey()`). A watch that queued a reading while the app was closed can
 * deliver last night's on this morning's launch, and counting that as measuring
 * today would put a reading on the wrong day — the one thing the daily counters
 * cannot recover from.
 */
export function pingWristReading(source: string | undefined): void {
  pingCaptureStarted(source);
  pingCaptureCompleted(source);
  pingActivation(source);
}

/**
 * Send today's paywall ping — the first time in an Eastern day that a locked
 * surface raises the card — carrying one letter for WHICH surface raised it.
 *
 * Fired from `usePaywall()` (features/Paywall.tsx), the single choke point every
 * locked surface in the app already goes through, so a new lock cannot ship
 * without a source name and no lock can be counted twice for one tap.
 *
 * Capped once per day like the open and HRV routes, and for the same reason:
 * uncapped it would count TAPS, and a frustrated user tapping a locked range
 * four times would read as four people meeting a wall. Capped, `pay[day] /
 * open[day]` is a share of the people who were there — the same shape as
 * measuring — and the surface letter names the day's FIRST wall. That is a real
 * limit and the dashboard says so: it is the wall they met, not every wall they
 * met, and the honest question it answers is "what is the app's front door to
 * Pro", not "how often is each feature locked".
 *
 * Deliberately fired for EVERY tier, not just free. A trial user meeting a wall
 * is the same event and a more urgent one; a pro user reaching it means the
 * paywall came up for somebody who has already paid, which is a bug, and the
 * counter that would have hidden it is the one that filtered by tier.
 */
export function pingPaywall(surface: string | undefined): void {
  pingDaily('pay', KEY_LAST_PAY, surfaceCode(surface));
}

/**
 * Send today's notification-enabled ping: `'reminder'` for the morning nudge,
 * `'crash'` for the rest warning.
 *
 * Fired only when one is turned ON and only once the OS schedule actually
 * succeeded — on iOS `scheduleNotificationAsync` throws when the app is not
 * authorized, so a ping sent on the tap rather than on the result would count
 * an ask that produced no notification at all. Turning one OFF sends nothing:
 * this counter is for whether the ask is accepted.
 *
 * Per-letter cap, so somebody who accepts both in one sitting is counted for
 * both. They are separate decisions and one of them is much easier to say yes
 * to than the other.
 */
export function pingNotifyEnabled(kind: 'reminder' | 'crash'): void {
  const slot = notifyCode(kind);
  pingDaily('not', slotKey(KEY_LAST_NOT, slot), slot);
}

/**
 * Send today's POTS ping when a capture COMPLETES — `'stand'` for the stand
 * test, `'episode'` for an orthostatic episode capture.
 *
 * On completion rather than on save, the same rule the HRV pair follows and for
 * the same reason: the capture is the event.
 *
 * Per-letter cap, because a stand test and an episode are not two flavours of
 * one thing. One is a protocol somebody sat down to run; the other is a symptom
 * they were having and reached for the phone during. Pooling them under a
 * single daily cap would drop whichever came second, which on a bad day is
 * exactly the one worth knowing about.
 */
export function pingPots(kind: 'stand' | 'episode'): void {
  const slot: PotsCode | undefined = kind === 'stand' ? 'T' : kind === 'episode' ? 'E' : undefined;
  pingDaily('pot', slotKey(KEY_LAST_POT, slot), slot);
}

/**
 * Send today's view ping when a gated view is opened: `'insights'` or
 * `'progress'`.
 *
 * Fired for EVERY tier, and that is the point — for a free user this is the
 * demand side of the same question the paywall counter answers from the supply
 * side, and for a paying one it is whether the thing they paid for is the thing
 * they use. Filtering either out would leave a number that cannot be compared
 * with itself across a conversion.
 *
 * Per-letter cap: somebody who opens both in a day is counted for both, so each
 * letter's count is a headcount for that view.
 */
export function pingViewOpened(view: 'insights' | 'progress'): void {
  const slot: ViewCode | undefined = view === 'insights' ? 'I' : view === 'progress' ? 'P' : undefined;
  pingDaily('see', slotKey(KEY_LAST_SEE, slot), slot);
}

/**
 * Say once, ever, that something on this install failed.
 *
 * ONCE PER INSTALL and never repeated, which is a deliberately blunt shape. It
 * says how many installs are having a bad time and nothing whatsoever about
 * what went wrong: there is no tag, no message and no count, because a tag is a
 * string this app chose and a message is a string it did not, and neither
 * belongs in a counter that carries no identifier. The support dump is where a
 * failure is diagnosed (`collectApp.ts`), from the user's own phone, with their
 * consent — this only says how many phones would have one worth reading.
 *
 * Called from `logError`, so it must be as close to free as a call can be: the
 * flag read is the first thing it does, and after the first failure every later
 * call returns immediately without touching the network. Its own failure is
 * silent like every other ping's, and — the part that matters — it must never
 * route back into `logError`, or a failing network turns one error into a loop.
 */
export function pingErrorSeen(): void {
  if (__DEV__) return;
  if (read(KEY_ERR_SENT) === '1') return;
  if (inFlight[KEY_ERR_SENT]) return;
  inFlight[KEY_ERR_SENT] = true;
  void (async () => {
    try {
      if (await send('err', cohortDate(Date.now()))) write(KEY_ERR_SENT, '1');
    } finally {
      inFlight[KEY_ERR_SENT] = false;
    }
  })();
}

/**
 * The offer funnel: shown, then dismissed or accepted. `'annual'` is the
 * half-off annual window, `'founder'` the founding-member card.
 *
 * Three routes rather than one route with a phase letter, the same call the
 * capture pair makes: these are read AGAINST each other (`oac / osh` is the
 * offer's conversion, `odm / osh` its rejection) and a route is the one
 * distinction a consumer cannot accidentally pool away.
 *
 * "Accepted" means the user tapped the offer's own buy button — it is a
 * statement about the card, not about money. Whether the purchase then went
 * through is the `sub` counter's question, and keeping the two separate is what
 * makes the gap between them (store sheet abandoned, payment declined) visible
 * instead of silently folded into the offer's conversion rate.
 *
 * Per-letter caps, so the two offers never mask each other — though in practice
 * they cannot both be due on one day, by their own design.
 */
export function pingOfferShown(offer: 'annual' | 'founder'): void {
  offerPing('osh', offer);
}
export function pingOfferDismissed(offer: 'annual' | 'founder'): void {
  offerPing('odm', offer);
}
export function pingOfferAccepted(offer: 'annual' | 'founder'): void {
  offerPing('oac', offer);
}

function offerPing(kind: 'osh' | 'odm' | 'oac', offer: 'annual' | 'founder'): void {
  const slot: OfferCode | undefined = offer === 'annual' ? 'A' : offer === 'founder' ? 'F' : undefined;
  pingDaily(kind, slotKey(`${KEY_LAST_OFF}${kind}`, slot), slot);
}

let started = false;

/**
 * Call once at app start, after `initIap()` and `initTier()` (the cohort is
 * read from the stamp the latter writes).
 *
 * Runs on launch and on every return to the foreground: the foreground pass is
 * what catches an app that was merely backgrounded across midnight, which for
 * a daily journal is the common case rather than the edge one.
 */
export function initPing(): void {
  if (started || __DEV__) return;   // a dev build's opens are not users
  started = true;
  void pingOpen();
  void pingSub();
  subscribeIap(() => { void pingSub(); });
  try {
    RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void pingOpen();
      void pingSub();
    });
  } catch { /* no AppState here (jest / bare node) */ }
}
