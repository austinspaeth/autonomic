/**
 * Fault report — the stateful half. The wire format, the redaction and the
 * buffer's arithmetic are pure and live in ../lib/errorReport; this is the
 * flags MMKV, the network, the timers and the launch budget.
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
 * wrong") and permanently unable to answer the next question: an install that
 * hiccuped in March has spent its ping and is silent through every bug shipped
 * since, so a release that broke Health imports for every Android install would
 * not move the counter at all. Both routes now run: the counter keeps saying
 * how many phones, and this says WHAT, and HOW OFTEN.
 *
 * ------------------------------------------------------ counting vs sending
 *
 * EVERY OCCURRENCE IS COUNTED. Not the first, not one a day — every time it
 * happens. The only reason that is safe is that counting and sending are
 * separate things here:
 *
 *   an occurrence is added to a PERSISTED buffer, always, synchronously;
 *   a report carries the count it accumulated (`n`) and clears it.
 *
 * A signature's first sighting flushes IMMEDIATELY, so nothing about learning
 * that something broke is delayed. Everything after it in that window
 * accumulates and goes out on the debounce, on backgrounding, or on the next
 * launch. So a per-second retry loop becomes three requests a minute carrying
 * all sixty of its occurrences, rather than sixty requests — from a phone that
 * is by definition already having a bad time, whose battery and data the user
 * pays for.
 *
 * The property that makes the rate limiting honest: SUPPRESSING A REQUEST NEVER
 * LOSES A COUNT. The debounce, the launch budget and a dead network all leave
 * occurrences buffered on disk rather than dropping them, and the take/restore
 * pair in ../lib/errorReport is what holds that across a failed send.
 *
 * TWO NUMBERS COME OUT. `n` sums to occurrences; `d` — sent on a signature's
 * first report each Eastern day and only then — sums to install-days. Either
 * alone misleads: occurrences cannot tell one phone in a loop from a bug
 * everybody has, and install-days cannot tell a glitch from a storm.
 *
 * And the rule that outranks all of it: this must NEVER route back into
 * `logError`. It is called FROM the error logger, so a failure reported from
 * here would be a loop with a network timeout in it. Every path below swallows.
 */
import { AppState as RNAppState, Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { cohortCode, easternDay, platformCode, resolveCohort, tierCode } from '../lib/ping';
import {
  FLUSH_DEBOUNCE_MS, MAX_REPORTS_PER_LAUNCH, type PendingFault,
  faultSignature, faultUrl, needsInstallDay, noteInstallDay, notePending,
  parseFaultMemory, restorePending, takePending,
} from '../lib/errorReport';
import { getTier } from './tier';

const FLAGS_ID = 'autonomic.flags';
/** `{ day, counted, pending }` — the install-day ledger and the buffer. */
const KEY_FAULTS = 'faultsPending';
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

const load = () => parseFaultMemory(read(KEY_FAULTS));
const save = (mem: ReturnType<typeof load>) => write(KEY_FAULTS, JSON.stringify(mem));

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

/** Requests sent this launch. A cap on REQUESTS, never on occurrences — the
 *  buffer is persisted, so hitting it defers rather than discards. In memory,
 *  so a relaunch is a fresh budget: by then the buffer has a backlog worth
 *  draining and the phone has had a rest. */
let sentThisLaunch = 0;
/** One in-flight guard per signature. The buffer is cleared before the request
 *  and restored on failure, so without this a second flush would send an empty
 *  report while the first is still deciding whether it landed. */
const inFlight: Record<string, boolean> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Send whatever is buffered for one signature.
 *
 * The take/restore pair is the load-bearing part. The count is REMOVED from the
 * buffer before the request goes out and put back if it does not land, so
 * occurrences that arrive mid-flight accumulate under the same key and are
 * neither lost (which clearing afterwards would do) nor sent twice (which not
 * clearing would do).
 */
function flushSignature(sig: string): void {
  if (inFlight[sig]) return;
  if (sentThisLaunch >= MAX_REPORTS_PER_LAUNCH) return;

  const now = Date.now();
  const day = easternDay(now);
  let mem = load();
  const pending: PendingFault | undefined = mem.pending[sig];
  if (!pending || !pending.n) return;

  const taken = pending.n;
  const owed = needsInstallDay(mem, sig, day);
  mem = takePending(mem, sig);
  save(mem);

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
    pending.tag,
    pending.msg,
    { fatal: pending.fatal, n: taken, installDay: owed },
  );

  void (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      if (res.ok) {
        // The install-day is stamped only on a report that actually landed, so
        // a failed first attempt still gets to claim the day when it retries.
        if (owed) save(noteInstallDay(load(), sig, day));
      } else {
        save(restorePending(load(), sig, pending, taken));
      }
    } catch {
      // Offline, DNS, timeout. The occurrences go back in the buffer and ride
      // the next report or the next launch — being offline must never be the
      // reason a count is wrong. Not logged: a phone with no signal must not
      // turn one failure into forty.
      save(restorePending(load(), sig, pending, taken));
    } finally {
      clearTimeout(timer);
      inFlight[sig] = false;
    }
  })();
}

/** Send everything buffered. Used by the debounce, by backgrounding and by
 *  launch, all of which mean "there is no reason to keep waiting". */
function flushAll(): void {
  try {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    Object.keys(load().pending).forEach(flushSignature);
  } catch { /* reporting a failure must never be one */ }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flushAll(); }, FLUSH_DEBOUNCE_MS);
}

/**
 * Record one occurrence of a failure: what it was, roughly where, and nothing
 * else.
 *
 * Called from `logError` in lib/diagnostics/errorLog.ts, so the work on the hot
 * path is one MMKV read, one write and (for a signature already seen) a timer
 * that is already running. The network is never touched synchronously.
 *
 * `tag` is ours (a stable dotted key like `store.persist`); `msg` is not, and
 * is redacted by `faultUrl` before it can reach the network. That redaction is
 * the reason this route is allowed to exist at all — see ../lib/errorReport.
 */
export function reportFault(tag: string, msg: string, fatal?: boolean): void {
  if (__DEV__) return;
  try {
    const day = easternDay(Date.now());
    const sig = faultSignature(tag, msg, fatal);
    const before = load();
    const first = !before.pending[sig];
    save(notePending(before, sig, { tag, msg, ...(fatal ? { fatal: true } : null) }, day));
    // A signature nobody is waiting on goes out NOW: the first sighting of a
    // failure is the one report that must not be delayed, and a one-off error
    // — which is most of them — is therefore reported the instant it happens.
    // Everything after it in this window rides the debounce.
    if (first) flushSignature(sig); else scheduleFlush();
  } catch {
    /* reporting a failure must never be one */
  }
}

let started = false;

/**
 * Call once at app start, after `initTier()` (the cohort is read from the stamp
 * it writes).
 *
 * Two jobs, and the first is the one that makes the buffer trustworthy:
 * anything left pending when the app last stopped — a storm that outran the
 * launch budget, occurrences buffered while offline, a phone that was killed
 * mid-debounce — is flushed now. Without it, "every occurrence is counted"
 * would quietly mean "every occurrence the app got a chance to send".
 *
 * The second is backgrounding, which is where a debounce that has not fired
 * yet would otherwise be lost.
 */
export function initFaultReporting(): void {
  if (started || __DEV__) return;
  started = true;
  flushAll();
  try {
    RNAppState.addEventListener('change', (s) => {
      // On the way OUT as well as in: a report buffered a second ago is far
      // more likely to survive if it is sent while the app is still running
      // than if it waits for a launch that may be days away.
      if (s === 'active' || s === 'background') flushAll();
    });
  } catch { /* no AppState here (jest / bare node) */ }
}
