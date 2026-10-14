/**
 * The on-device error log: storage + the global uncaught-error hooks, of which
 * there are two — JavaScript's `ErrorUtils` and, on Android, a Java
 * uncaught-exception handler. Both are needed, and for a while only the first
 * existed: a Java exception never passes through JS, so a native crash left
 * this log empty and a support dump said "nothing has failed" about a phone
 * that had been crashing for days.
 *
 * Lives in the plaintext `autonomic.flags` MMKV (same instance as the tier
 * stamp, the health import memory and the review memory) rather than the
 * journal, because it is device bookkeeping: it must not ride export/import,
 * must survive "Clear all data", and holds no health data. Capped at
 * MAX_ERRORS rows (see ./errorBuffer for the ring-buffer rules).
 *
 * Everything here is best-effort and total. A logger that throws while logging
 * would turn a degraded feature into a crash, so every path falls back to the
 * in-memory copy and moves on.
 */
import { MMKV } from 'react-native-mmkv';
import { initBreadcrumbs, liveTrail, previousTrail } from './breadcrumbs';
import { type CrumbTrail, formatWhere } from './crumbs';
import { describeError } from './env';
import { MAX_ERRORS, parseErrorLog, pushError, type LoggedError } from './errorBuffer';
import { describeNativeCrash, parseNativeCrashes, tagForNativeCrash } from './nativeCrash';

export type { LoggedError };

const FLAGS_ID = 'autonomic.flags';
const KEY = 'errorLog';

let kv: MMKV | null | undefined;
/** In-memory mirror: also the fallback when MMKV can't be opened (jest, web). */
let mem: LoggedError[] | null = null;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function load(): LoggedError[] {
  if (mem) return mem;
  let raw: string | undefined;
  try { raw = store()?.getString(KEY); } catch { raw = undefined; }
  mem = parseErrorLog(raw);
  return mem;
}

/** The tag a crash's CONTEXT lands under: where the user was, as a trail of
 *  crumbs (see ./crumbs). Its own row beside the crash's, never folded into
 *  the crash's message — that would split one crash into a signature per
 *  path and lose the "3 phones" the crash row exists to say. */
export const CRASH_WHERE_TAG = 'crash.where';

/**
 * Record a failure. `tag` is a stable dotted key naming the site
 * (`store.persist`, `iap.init`, `health.check`) — it's what makes a dump
 * skimmable, so prefer an existing tag over a new phrasing of one.
 *
 * A FATAL also files where it happened. `where` is the trail to use when the
 * caller knows better than "this session" — a native crash drained from a
 * previous process passes that process's trail — and `null` says there is no
 * trustworthy trail, in which case the row still goes out saying `unknown`:
 * a crash with no context is still a crash whose context was asked for.
 *
 * `dying` says the process will not outlive this call (the uncaught-error
 * hook): the reports are then buffered for the next launch rather than sent,
 * because a request in flight when the process is killed is a report lost.
 */
export function logError(
  tag: string,
  err: unknown,
  opts?: { fatal?: boolean; dying?: boolean; where?: { trail: CrumbTrail; approx: boolean } | null },
): void {
  try {
    const msg = describeError(err);
    mem = pushError(load(), {
      at: new Date().toISOString(),
      tag,
      msg,
      ...(opts?.fatal ? { fatal: true } : null),
    }, MAX_ERRORS);
    try { store()?.set(KEY, JSON.stringify(mem)); } catch { /* in-memory only this session */ }
    // TWO things are told, and they answer different questions.
    //
    // `pingErrorSeen` is the counter: once per install EVER, no tag, no
    // message — how many phones have had something go wrong. It is a
    // population and it stays exactly as blunt as it was.
    //
    // `reportFault` is the log: what went wrong and roughly where, once per
    // distinct failure per install per day, with the message redacted before it
    // leaves (see lib/errorReport). It exists because the counter is spent on
    // an install's first hiccup and can never say what broke afterwards — a
    // release that broke Health imports for everyone would not move it at all.
    //
    // Both are required lazily rather than imported: the ping store reaches the
    // IAP and tier stores, both of which log errors, and a static import would
    // close that circle at module-init time. Neither can route back here —
    // neither logs its own failures, precisely so that a phone with no signal
    // cannot flush this window.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { require('../../store/ping').pingErrorSeen(); } catch { /* not wired up yet */ }
    const send = { defer: !!opts?.dying };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { require('../../store/errorReport').reportFault(tag, msg, opts?.fatal, send); } catch { /* not wired up yet */ }
    if (opts?.fatal) {
      // The context row. Not fatal itself: it is not a second crash, and must
      // not wear the dashboard's CRASH pill or push a second alert.
      const where = opts.where === undefined ? { trail: liveTrail(), approx: false } : opts.where;
      const line = formatWhere(tag, where?.trail, { approx: !!where?.approx });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      try { require('../../store/errorReport').reportFault(CRASH_WHERE_TAG, line, false, send); } catch { /* not wired up yet */ }
    }
  } catch { /* logging must never throw */ }
}

/** The log, oldest first. */
export function getErrorLog(): LoggedError[] {
  try { return [...load()]; } catch { return []; }
}

export function clearErrorLog(): void {
  mem = [];
  try { store()?.delete(KEY); } catch { /* in-memory only */ }
}

/* ---------- global hook ---------- */

let installed = false;

/**
 * Route uncaught JS errors into the log on their way to the default handler.
 *
 * In a release build a fatal error tears the app down before anyone can read a
 * red box, and the user's report is "it closed". Writing the error first means
 * the next launch's dump still has it. The original handler is always called:
 * this observes, it does not swallow, and it must not change whether a fatal
 * error is fatal.
 */
export function installErrorLogging(): void {
  if (installed) return;
  installed = true;
  // Where the user is, from this moment on. First, so the trail the previous
  // session left is read back before anything this launch does overwrites it.
  initBreadcrumbs();
  // The NATIVE half next, because the JS block below can bail early.
  //
  // `ErrorUtils` is JavaScript's global handler and sees JavaScript throws.
  // Nothing routes a Java exception through it, so an exception on the Android
  // main thread — thrown inside a library's own BroadcastReceiver, say, where
  // no `catch` of ours can reach it — killed the process and left this log
  // completely empty. An empty log reads as "nothing went wrong", which is the
  // worst possible answer: the one bug class the app degrades WORST on was the
  // one class it recorded nothing about. The Android handler writes to a file
  // (the process is dying; MMKV is JSI and the runtime may already be gone);
  // the iOS one subscribes to MetricKit, which writes the same file on the
  // launch after a crash. `drainNativeCrashes` picks both up.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../modules/app-env').installNativeCrashHandler();
  } catch { /* no native module here — the JS hook below still applies */ }
  try {
    const EU = (globalThis as { ErrorUtils?: {
      getGlobalHandler(): (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler(fn: (e: unknown, isFatal?: boolean) => void): void;
    } }).ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((e, isFatal) => {
      // A fatal here is the process ending: in a release build the default
      // handler we hand it to next tears the app down.
      logError(isFatal ? 'uncaught.fatal' : 'uncaught', e, { fatal: !!isFatal, dying: !!isFatal });
      prev?.(e, isFatal);
    });
  } catch { /* no ErrorUtils here — explicit logError calls still work */ }
}

/**
 * Record whatever the native handler wrote before the process died.
 *
 * Called on launch, AFTER `initFaultReporting()`: that drains the fault buffer
 * and registers the background flush, so a crash logged here is buffered and
 * sent on this launch rather than waiting for the one after. Ordering is the
 * only reason this is a separate call from `installErrorLogging` — installing
 * the handler must happen as early as possible, and reporting what it caught
 * must happen once there is something to report through.
 *
 * Marked `fatal`, because that is exactly what it was: unlike a logged
 * failure, the app did not carry on afterwards. (A MetricKit HANG is the one
 * row that is not: the app came back, so it is filed as a plain failure under
 * its own tag.)
 *
 * The context row takes the PREVIOUS session's trail, matched by time for a
 * Java crash (which is stamped at the instant) and by session for a MetricKit
 * one (which is stamped with the window it was collected in). See
 * ./breadcrumbs for why the two trails exist.
 *
 * On iOS the diagnostics arrive a few seconds AFTER launch, through the
 * module's `onCrashLog` event, so the first call also subscribes to it and
 * drains again whenever it fires.
 */
let crashLogSub: { remove(): void } | null = null;
export function drainNativeCrashes(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appEnv = require('../../../modules/app-env') as typeof import('../../../modules/app-env');
    const raw = appEnv.takeNativeCrashLog();
    for (const crash of parseNativeCrashes(raw)) {
      const hang = crash.kind === 'hang';
      const where = previousTrail(crash.source === 'metrickit' ? undefined : crash.at);
      logError(tagForNativeCrash(crash), new Error(describeNativeCrash(crash)), hang ? undefined : { fatal: true, where });
    }
    if (!crashLogSub) crashLogSub = appEnv.onNativeCrashLog(() => drainNativeCrashes());
  } catch { /* nothing recorded, or no native module — either way there is nothing to say */ }
}
