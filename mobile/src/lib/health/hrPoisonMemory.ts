/**
 * The stateful half of the heart-rate read breaker (see ./hrPoison for what it
 * is and why it exists at all).
 *
 * Lives in the plaintext `autonomic.flags` MMKV beside the other health
 * memories: it is a fact about this DEVICE'S health store, not about the
 * journal, so it must not ride export/import and it deliberately survives
 * "Clear all data" — erasing a journal does not fix a record in Health
 * Connect, and re-learning the hard way costs the user another crash.
 *
 * Two keys. `hrReadInFlight` is written BEFORE a read and cleared after, so a
 * process that dies mid-read leaves evidence of which days it was reading;
 * MMKV writes land synchronously, which is the whole reason it can be trusted
 * from a process about to be killed. `hrPoisonDays` is the verdict.
 *
 * THE IN-FLIGHT MARKER IS CAPTURED ONCE PER LAUNCH, by whichever comes first:
 * the crash drain or the first heart-rate read. It cannot be read at a fixed
 * point in startup, because a headless background wake-up refreshes the day's
 * load without ever mounting the app — so the capture is lazy and the key is
 * deleted the moment it is taken, and this session's own marker can never be
 * mistaken for the last session's.
 *
 * Concurrent reads are counted, not assumed: the one-year backfill pools
 * several nights at a time, so the marker is the UNION of what is in flight
 * and a crash during a pooled batch poisons all of it. Over-blocking by a few
 * nights is the right direction to be wrong in — the alternative is a backfill
 * that crashes, restarts, and crashes again on the same night for ever.
 */
import { hrPoisonRow, hrWindowDays, nextPoisonDays, poisonFromCrashes, windowPoisoned } from './hrPoison';

const FLAGS_ID = 'autonomic.flags';
const KEY_INFLIGHT = 'hrReadInFlight';
/** Evidence carried forward: what an earlier session was reading when it
 *  stopped, held until a crash drain has had a chance to look at it. */
const KEY_PREV = 'hrReadPrev';
const KEY_POISON = 'hrPoisonDays';

/** The tag poisoned days are reported under. Its own tag rather than a
 *  `logError` call: `logError` would spend the once-per-install `/ping/err`
 *  population counter on somebody else's data, and this is not a failure of
 *  ours to fix — it is a count of how many phones hold a health store that
 *  kills the app, which is exactly what `/fault` answers. */
export const HR_POISON_TAG = 'hc.hrPoison';

interface Flags {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

let kv: Flags | null | undefined;
let mem: string[] | null = null;
/** The previous session's in-flight days: undefined until captured, then the
 *  list (possibly empty) for the rest of this session. */
let previous: string[] | undefined;
/** Reads running right now, one entry per read. */
let active: string[][] = [];

/* The require is LAZY, unlike the sibling health memories: this module is
 * reached from ./healthConnect, which the pure-logic jest project imports, and
 * that environment cannot even parse react-native's entry point. Without MMKV
 * the breaker degrades to doing nothing, which is what every non-Android build
 * wants anyway. */
function store(): Flags | null {
  if (kv !== undefined) return kv;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv') as { MMKV: new (opts: { id: string }) => Flags };
    kv = new MMKV({ id: FLAGS_ID });
  } catch { kv = null; }
  return kv;
}

function readList(key: string): string[] {
  try {
    const raw = store()?.getString(key);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : [];
  } catch { return []; }
}

/**
 * Take the marker an earlier session left, exactly once per session.
 *
 * The marker is MOVED to `hrReadPrev` rather than deleted, and only the crash
 * drain clears it. Without that, the Android background wake-up — which runs
 * every quarter of an hour, reads the day's heart rate, and never mounts the
 * app or drains a crash — would quietly eat the evidence of the crash before
 * anything could look at it, and the loop would go on for ever. Carrying it
 * forward can only ever over-attribute, which is the same direction the
 * pooled-batch case errs in and costs a day's curve rather than a crash.
 */
function capturePrevious(): string[] {
  if (previous !== undefined) return previous;
  const carried = readList(KEY_PREV);
  const left = readList(KEY_INFLIGHT);
  previous = [...new Set([...carried, ...left])];
  try {
    if (previous.length) store()?.set(KEY_PREV, JSON.stringify(previous));
    store()?.delete(KEY_INFLIGHT);
  } catch { /* in-memory only this session */ }
  return previous;
}

function poisoned(): string[] {
  if (mem) return mem;
  mem = readList(KEY_POISON);
  return mem;
}

function writeActive(): void {
  capturePrevious();
  const union = [...new Set(active.flat())];
  try {
    if (union.length) store()?.set(KEY_INFLIGHT, JSON.stringify(union));
    else store()?.delete(KEY_INFLIGHT);
  } catch { /* best effort: without it a crash is simply not attributed */ }
}

/** Is a heart-rate read over this window known to kill the process? */
export function hrWindowBlocked(from: Date, to: Date): boolean {
  try { return windowPoisoned(poisoned(), hrWindowDays(from, to)); } catch { return false; }
}

/** Stamp a read as in flight. Returns the token to hand back when it ends. */
export function markHrReadStart(from: Date, to: Date): string[] {
  const days = hrWindowDays(from, to);
  try { active.push(days); writeActive(); } catch { /* nothing to attribute a crash to */ }
  return days;
}

/** The read finished (or threw — either way the process survived it). */
export function markHrReadDone(token: string[]): void {
  try {
    const i = active.indexOf(token);
    if (i >= 0) active.splice(i, 1);
    writeActive();
  } catch { /* best effort */ }
}

/**
 * Whatever the native crash handler recorded, examined for this one signature.
 *
 * Called from the crash drain with every description it just logged. Both
 * halves are required: the message says WHAT happened and the marker says
 * WHICH DAYS, and a marker with no matching crash is just a process that was
 * killed while reading — which is not evidence of anything.
 */
export function noteNativeCrashes(messages: (string | null | undefined)[]): void {
  try {
    const was = capturePrevious();
    // The drain is the only thing that clears the carried evidence: it has now
    // seen it, so whatever it decided, it must not be weighed against a later
    // unrelated crash.
    try { store()?.delete(KEY_PREV); } catch { /* best effort */ }
    const next = poisonFromCrashes(poisoned(), was, messages);
    if (!next) return;
    mem = next;
    try { store()?.set(KEY_POISON, JSON.stringify(mem)); } catch { /* in-memory only this session */ }
    // Reported once per state change, never per skipped read: the dashboard
    // wants "how many phones hold data that crashes them", and a report on
    // every foreground would answer "how often do we open the app".
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { require('../../store/errorReport').reportFault(HR_POISON_TAG, `empty heart rate samples on ${was.length} day(s)`, false); } catch { /* not wired up yet */ }
  } catch { /* the drain must never throw */ }
}

/**
 * A read that hung because the native handler SWALLOWED the empty-samples
 * throw (see ./hrPoison): the process lived, so there is no next-launch crash
 * to pair with a marker, and the read's own window is the evidence. Poisons
 * exactly the days that read covered, which is narrower than the next-launch
 * path can be (that one only knows the union of everything in flight).
 */
export function poisonHrRead(days: string[]): void {
  try {
    const next = nextPoisonDays(poisoned(), days);
    if (next === poisoned()) return;
    mem = next;
    try { store()?.set(KEY_POISON, JSON.stringify(mem)); } catch { /* in-memory only this session */ }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { require('../../store/errorReport').reportFault(HR_POISON_TAG, `empty heart rate samples on ${days.length} day(s), survived`, false); } catch { /* not wired up yet */ }
  } catch { /* best effort: without it the window is simply read again */ }
}

/** A heart-rate read that hit `HR_READ_TIMEOUT_MS` without a swallowed throw
 *  behind it: slow rather than poisoned. Counted, never acted on. */
export const HR_TIMEOUT_TAG = 'hc.hrTimeout';

/**
 * A heart-rate read that never came back. Two different things look alike
 * here, and only one of them may cost a day its curve: if native swallowed the
 * empty-samples throw since the read began, the read is dead and its days are
 * poisoned; otherwise it was merely slow, and the caller falls back for this
 * one read and tries again next time.
 */
export function noteHrReadTimeout(days: string[], startedAtMs: number): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appEnv = require('../../../modules/app-env') as typeof import('../../../modules/app-env');
    if (appEnv.takeSwallowedHrRead(startedAtMs)) {
      poisonHrRead(days);
      // File the swallowed row NOW rather than on the next launch (as
      // `native.swallowed`, non-fatal). Nothing in the drain routes back here.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      try { require('../diagnostics/errorLog').drainNativeCrashes(); } catch { /* next launch, then */ }
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    try { require('../../store/errorReport').reportFault(HR_TIMEOUT_TAG, 'heart rate read timed out', false); } catch { /* not wired up yet */ }
  } catch { /* best effort */ }
}

/**
 * DEV ONLY: make the next heart-rate read rehearse the empty-samples crash —
 * native throws `HrSampleCrash.simulated()` on a background thread (the real
 * record cannot be created any more) and the read itself never settles, which
 * is exactly what a swallowed throw leaves behind. Expect, about 15 s later:
 * the read falls back to the aggregate, its day(s) appear in the support
 * dump's `heart rate reads blocked` row, and `native.swallowed` +
 * `hc.hrPoison` land in the error log. Undo with `hrPoisonDays` in the flags
 * MMKV (or reinstall). A release build ignores it.
 */
const REHEARSE_HR_POISON = false;
let rehearsed = false;

/** Called by `readHr` once per read: true when THIS read should rehearse. */
export function takeHrPoisonRehearsal(): boolean {
  if (!REHEARSE_HR_POISON || rehearsed || !__DEV__) return false;
  rehearsed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../../../modules/app-env') as typeof import('../../../modules/app-env')).simulateHrSampleCrash();
  } catch { return false; }
}

/** The support dump's row. */
export function hrPoisonDump(): string {
  try { return hrPoisonRow(poisoned()); } catch { return 'unreadable'; }
}

/** Test seam. */
export function resetHrPoisonCache(): void {
  mem = null; previous = undefined; active = []; rehearsed = false;
}
