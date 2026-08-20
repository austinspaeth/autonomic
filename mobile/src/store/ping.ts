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
 *
 * The trailing letter is the platform: I for iOS, A for Android. It is a
 * property of the build, not of the person holding it, and it is what makes
 * "how is Android doing" answerable without a second data source.
 *
 * The activation ping carries a second letter for the sensor that reading used
 * (W watch / B Bluetooth strap / F finger on camera). Installing is not using:
 * without a first HRV reading there is no score, no trend and nothing to come
 * back for, so "how many of a cohort ever got one, and with what" is the single
 * number that says whether onboarding works. It is the same shape as the other
 * two — one code, no identifier — and it fires exactly once per install.
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
  easternDay, methodCode, pingUrl, platformCode, resolveCohort, shouldPingOpen,
  type MethodCode, type PingKind,
} from '../lib/ping';
import { getIapState, paywallBypassed, subscribeIap } from './iap';

const FLAGS_ID = 'autonomic.flags';
const KEY_COHORT = 'pingCohort';        // ISO date — this install's cohort, frozen once
const KEY_LAST_OPEN = 'pingLastOpen';   // ISO date (Eastern) of the last open ping sent
const KEY_SUB_SENT = 'pingSubSent';     // '1' once the subscribe ping landed
const KEY_ACT_SENT = 'pingActSent';     // '1' once the activation ping landed
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

/** Fire one ping. Resolves true only if the server actually took it. */
async function send(kind: PingKind, cohort: string, method?: MethodCode): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = pingUrl(kind, cohort, platformCode(Platform.OS), method);
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
const inFlight = { open: false, sub: false, act: false };

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
  if (!shouldPingOpen(read(KEY_LAST_OPEN), now)) return;
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
 * Send the one-per-install activation ping, from the moment a first HRV reading
 * is actually saved (features/hrv/Results.tsx) — never from the moment capture
 * starts, since a session that was abandoned or produced nothing usable is the
 * opposite of an activation.
 *
 * Exported rather than driven from a subscription because there is no store
 * state to watch: the caller knows it just saved a reading, and the flag here
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
