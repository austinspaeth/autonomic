/**
 * Cohort ping — the one and only thing this app sends anywhere.
 *
 * The question it answers is retention: of the installs that started using the
 * app on a given day, how many are still opening it weeks later, and how many
 * ever subscribed. Answering that needs exactly one fact per request, the day
 * this install first ran, because the server stamps the day the request
 * arrives. Two routes, no body, no response worth reading:
 *
 *   GET /ping/open/D082126   opened today by an install from that cohort
 *   GET /ping/sub/D082126    an install from that cohort became a subscriber
 *
 * What is deliberately absent: no device id, no install id, no session id, no
 * request body, no health data, no journal data, nothing about what the user
 * did in the app. Not "anonymized" — never collected. A cohort date is shared
 * by every install born that day, so it names a day, not a person.
 *
 * Because there is no identifier, the server cannot de-duplicate, so THIS side
 * has to: at most one open ping per install per UTC day, and exactly one
 * subscribe ping per install, ever.
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
import { AppState as RNAppState } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { pingUrl, resolveCohort, shouldPingOpen, utcDay } from '../lib/ping';
import { getIapState, paywallBypassed, subscribeIap } from './iap';

const FLAGS_ID = 'autonomic.flags';
const KEY_COHORT = 'pingCohort';        // ISO date — this install's cohort, frozen once
const KEY_LAST_OPEN = 'pingLastOpen';   // ISO date (UTC) of the last open ping sent
const KEY_SUB_SENT = 'pingSubSent';     // '1' once the subscribe ping landed
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
async function send(kind: 'open' | 'sub', cohort: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(pingUrl(kind, cohort), { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;   // offline, DNS, timeout — all the same to us
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------- pinging */

let inFlight = false;

/**
 * Send today's open ping, unless this install already sent one today.
 *
 * The "sent" flag is written only on success, so a launch made in airplane
 * mode retries at the next foreground. The cost of that choice is a possible
 * double count when a response is lost after the server counted it — far rarer
 * than being offline, and it errs toward reporting a real user as present.
 */
async function pingOpen(): Promise<void> {
  if (inFlight) return;
  const now = Date.now();
  if (!shouldPingOpen(read(KEY_LAST_OPEN), now)) return;
  inFlight = true;
  try {
    if (await send('open', cohortDate(now))) write(KEY_LAST_OPEN, utcDay(now));
  } finally {
    inFlight = false;
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
  if (read(KEY_SUB_SENT) === '1') return;
  if (paywallBypassed()) return;
  const { ready, isPro } = getIapState();
  if (!ready || !isPro) return;
  if (await send('sub', cohortDate(Date.now()))) write(KEY_SUB_SENT, '1');
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
