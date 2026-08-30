/**
 * The on-device error log: storage + the global uncaught-error hook.
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
import { describeError } from './env';
import { MAX_ERRORS, parseErrorLog, pushError, type LoggedError } from './errorBuffer';

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

/**
 * Record a failure. `tag` is a stable dotted key naming the site
 * (`store.persist`, `iap.init`, `health.check`) — it's what makes a dump
 * skimmable, so prefer an existing tag over a new phrasing of one.
 */
export function logError(tag: string, err: unknown, opts?: { fatal?: boolean }): void {
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { require('../../store/errorReport').reportFault(tag, msg, opts?.fatal); } catch { /* not wired up yet */ }
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
  try {
    const EU = (globalThis as { ErrorUtils?: {
      getGlobalHandler(): (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler(fn: (e: unknown, isFatal?: boolean) => void): void;
    } }).ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((e, isFatal) => {
      logError(isFatal ? 'uncaught.fatal' : 'uncaught', e, { fatal: !!isFatal });
      prev?.(e, isFatal);
    });
  } catch { /* no ErrorUtils here — explicit logError calls still work */ }
}
