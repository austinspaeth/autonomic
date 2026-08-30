/**
 * Fault report — the stateful half. The wire format, the redaction and the
 * once-a-day rule are pure and live in ../lib/errorReport; this is the flags
 * MMKV, the network and the launch budget.
 *
 * It sits beside ./ping rather than inside it on purpose. Everything in that
 * file is a COUNTER — a fixed alphabet, no free text, a number at the end that
 * means "how many people" — and the promise it makes ("no body, no message,
 * nothing but a date and a letter") is load-bearing for the whole app's privacy
 * story. This route carries a message, so it gets its own file, its own memory
 * and its own rules, and reading the two together is never mistaken for reading
 * one thing.
 *
 * What it borrows from ./ping is the identity of the install — cohort day,
 * platform, tier, build version — because there is exactly one right answer to
 * "which install is this" and a second implementation of it would drift.
 *
 * WHAT CHANGED AND WHY. `/ping/err` fires once per install EVER and carries no
 * tag. That makes it a population ("how many phones have had something go
 * wrong") and permanently unable to answer the next question. A phone that
 * hiccuped once in March has spent its ping and is silent through every bug
 * shipped since, so a release that broke Health imports for every Android
 * install would not move the counter at all. Both routes now run: the counter
 * keeps saying how many phones, and this says WHAT, every distinct failure,
 * every day it is still happening.
 *
 * Three rules, all of them about not making a bad situation worse:
 *
 *   one send per SIGNATURE per install per Eastern day — a phone stuck in a
 *   retry loop says so once, a phone that breaks in a new way tomorrow says so
 *   tomorrow;
 *
 *   at most MAX_REPORTS_PER_LAUNCH sends per launch, whatever happens, because
 *   an app that answers a failure by hammering an endpoint has made the user's
 *   problem worse rather than better;
 *
 *   and never, ever back into `logError`. This is called FROM the error logger,
 *   so a failure reported from here would be a loop with a network timeout in
 *   it. Every path below swallows.
 */
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { cohortCode, easternDay, platformCode, resolveCohort, tierCode } from '../lib/ping';
import {
  MAX_REPORTS_PER_LAUNCH, faultSignature, faultUrl, noteFaultReported,
  parseFaultMemory, shouldReportFault,
} from '../lib/errorReport';
import { getTier } from './tier';

const FLAGS_ID = 'autonomic.flags';
/** `{ day, sigs }` — what this install has already reported today. */
const KEY_FAULTS = 'faultsSent';
/** ./ping's frozen cohort, and the stamp ./tier.ts writes on first launch that
 *  it is derived from. READ here, never written: one writer for a value nothing
 *  may move an install between, and it is the one that pings with it. */
const KEY_COHORT = 'pingCohort';
const KEY_TRIAL_STARTED = 'trialStartedAt';

/** A report whose response nobody reads has no reason to hold a socket open on
 *  a bad connection — and this one is sent by a phone already having a bad
 *  time, so the timeout matters more here than anywhere else. */
const TIMEOUT_MS = 6000;

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

/** This build's version, or undefined. Absent rather than wrong: it becomes a
 *  map key on the server, and a bogus key is a build that appears to exist. */
function appVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-constants').default?.expoConfig?.version || undefined;
  } catch {
    return undefined;
  }
}

/** Sends made this launch. In memory, so it resets on relaunch — which is
 *  right: a user who has restarted the app is a new chance to learn something,
 *  and the per-signature rule is what stops that being a loophole. */
let sentThisLaunch = 0;
/** Signatures currently in flight. The memory is written only on a successful
 *  send, so without this two failures a millisecond apart both read a memory
 *  that does not have them yet and both go out. */
const inFlight: Record<string, boolean> = {};

/**
 * Report one failure: what it was, roughly where, and nothing else.
 *
 * Called from `logError` in lib/diagnostics/errorLog.ts, so it must be as close
 * to free as a call can be on the path that does nothing — the launch budget
 * and the memory read come before anything that allocates, and the whole body
 * is inside a try that swallows.
 *
 * `tag` is ours (a stable dotted key like `store.persist`); `msg` is not, and
 * is redacted by `faultUrl` before it can reach the network. That redaction is
 * the reason this route is allowed to exist at all — see ../lib/errorReport.
 */
export function reportFault(tag: string, msg: string, fatal?: boolean): void {
  if (__DEV__) return;
  try {
    if (sentThisLaunch >= MAX_REPORTS_PER_LAUNCH) return;
    const now = Date.now();
    const day = easternDay(now);
    const sig = faultSignature(tag, msg, fatal);
    if (inFlight[sig]) return;
    const mem = parseFaultMemory(read(KEY_FAULTS));
    if (!shouldReportFault(mem, sig, day)) return;

    inFlight[sig] = true;
    sentThisLaunch += 1;
    const url = faultUrl(
      cohortCode(
        resolveCohort(read(KEY_COHORT), read(KEY_TRIAL_STARTED), now),
        platformCode(Platform.OS),
        undefined,
        tierCode(getTier()),
        appVersion(),
      ),
      tag,
      msg,
      fatal,
    );

    void (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        // Written only on success, so a report made offline is retried by the
        // next occurrence rather than being silently spent. The cost is a
        // possible double count when a response is lost after the server took
        // it — far rarer than being offline, and it errs toward reporting a
        // real failure, which is the direction that matters here.
        if (res.ok) {
          write(KEY_FAULTS, JSON.stringify(
            noteFaultReported(parseFaultMemory(read(KEY_FAULTS)), sig, day),
          ));
        }
      } catch {
        // Offline, DNS, timeout — all the same, and none of them is logged.
        // A phone with no signal must not turn one failure into forty.
      } finally {
        clearTimeout(timer);
        inFlight[sig] = false;
      }
    })();
  } catch {
    /* reporting a failure must never be one */
  }
}
