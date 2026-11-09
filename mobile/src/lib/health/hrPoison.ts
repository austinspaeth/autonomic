/**
 * "Reading heart rate from Health Connect kills this process" — the pure half.
 *
 * THE BUG IS NOT OURS AND CANNOT BE CAUGHT. Android's own Health Connect
 * module validates a heart-rate record in the Builder's CONSTRUCTOR:
 *
 *   // framework/java/android/health/connect/datatypes/HeartRateRecord.java
 *   if (heartRateSamples.isEmpty())
 *       throw new IllegalArgumentException("record samples should not be empty");
 *
 * and the READ path builds every returned record through that constructor —
 * `HeartRateRecordInternal.toExternalRecord()` calls `buildWithoutValidation()`,
 * which was plainly written to skip exactly this check and cannot, because the
 * check sits one level up. So a stored HeartRate record with no samples (the
 * APK-based Health Connect on Android 13 did no such validation, so one could
 * be written then and read now) takes down any app that reads heart rate over
 * the window holding it.
 *
 * It takes US down in a place no `try` of ours can see. The conversion runs
 * inside the platform's own AIDL callback —
 * `HealthConnectManager.getReadCallback().onResult()`, on a binder thread,
 * under a `catch (ClassCastException)` and nothing else — so the exception is
 * never handed to the library's coroutine, never becomes a rejected promise,
 * and never reaches `readAll`'s catch. The process is killed and the awaiting
 * promise simply never settles. We learn of it only from the Java
 * uncaught-exception handler's crash row on the NEXT launch.
 *
 * WHY THE BREAKER IS PER WINDOW AND NOT PER INSTALL. The poison is one record
 * at one instant, written by one app. Turning raw heart-rate reads off for the
 * install would cost every day its heart-rate bands and recovery credit for
 * ever — on a phone where a single night is unreadable. So the memory is a set
 * of DAY KEYS and a read is refused when any day it touches is in that set:
 * coarse in the safe direction (a poisoned night also blocks that day's pacing
 * read, which is right — the bad record is somewhere in those hours), and
 * narrow enough that every other day keeps its full curve.
 *
 * WHY THE CRASH ALONE IS NOT ENOUGH, AND NEITHER IS THE MARKER. The crash says
 * nothing about which window was being read, so the shell stamps the days it
 * is about to read before reading them. A marker alone would blacklist a
 * perfectly good window on any ordinary process kill — a swipe-away, an OOM —
 * so a day is poisoned only when a left-behind marker and a crash carrying
 * this exact message are both found on the next launch.
 *
 * The stateful side (the flags MMKV, the fault report) is ./hrPoisonMemory.
 */

/** The platform's words, verbatim. The signature is matched on this rather
 *  than on the exception type: `IllegalArgumentException` is thrown by half of
 *  Android, while this sentence has exactly one source. */
export const HR_EMPTY_SAMPLES_SIG = 'record samples should not be empty';

/** Keep at most this many poisoned days. A bound rather than a real limit:
 *  the list is a string in the flags MMKV, and a phone with more poisoned days
 *  than this has a health store we are not going to read our way out of. */
export const MAX_POISON_DAYS = 64;

/**
 * Is this crash the empty-samples one?
 *
 * Takes the composed crash description (`describeNativeCrash`), which is what
 * the drain has in hand. Substring rather than equality: the description also
 * carries the exception type and the crashing build.
 */
export function isHrSampleCrash(msg: string | null | undefined): boolean {
  return !!msg && msg.includes(HR_EMPTY_SAMPLES_SIG);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A local YYYY-MM-DD key. Local, because every window here is built from
 *  local wall-clock times (a day's bounds, a night's bed and wake). */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The day keys a read window touches: its first and its last, deduped.
 *
 * Only the two ends, not every day between them. No heart-rate read in the app
 * spans more than a night (the day-load read is one day, a night crosses one
 * midnight, a workout sits inside a day), so the ends ARE the window — and a
 * rule that expanded a bad range into hundreds of keys would spend the cap
 * above on one mistake.
 */
export function hrWindowDays(from: Date, to: Date): string[] {
  const a = from.getTime(); const b = to.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  const first = dayKeyOf(new Date(Math.min(a, b)));
  const last = dayKeyOf(new Date(Math.max(a, b)));
  return first === last ? [first] : [first, last];
}

/**
 * Add days to the memory, newest last, deduped and capped.
 *
 * Returns the list it was given, unchanged and identical, when there is
 * nothing new in `add` — so a caller can treat identity as "no state change"
 * and not report the same days twice.
 */
export function nextPoisonDays(current: string[], add: string[], max = MAX_POISON_DAYS): string[] {
  const keep = add.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !current.includes(d));
  if (!keep.length) return current;
  const next = current.concat(keep);
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * The verdict, given what the last session was reading and what it died of.
 *
 * Null means nothing changes, which is the answer for almost every launch.
 * BOTH halves are required and that is the whole rule: the message says WHAT
 * happened and the marker says WHICH DAYS, and a marker with no matching crash
 * is just a process that was killed while reading — a swipe-away, an OOM, a
 * low-memory kill — which is evidence of nothing and would cost the user a
 * day's heart-rate curve for ever.
 */
export function poisonFromCrashes(
  poisoned: string[],
  inFlight: string[],
  messages: (string | null | undefined)[],
  max = MAX_POISON_DAYS,
): string[] | null {
  if (!inFlight.length) return null;
  if (!messages.some(isHrSampleCrash)) return null;
  const next = nextPoisonDays(poisoned, inFlight, max);
  return next === poisoned ? null : next;
}

/** True when any day of this window is known to kill the process. */
export function windowPoisoned(poisoned: string[], days: string[]): boolean {
  return days.some((d) => poisoned.includes(d));
}

/**
 * The support dump's row. "none" is the answer for almost every phone, and it
 * has to be stated rather than omitted: a pacing day that reads thin for ever
 * is otherwise unanswerable from a dump, and this is the only place that says
 * the app is deliberately not reading heart rate for some days.
 */
export function hrPoisonRow(poisoned: string[]): string {
  if (!poisoned.length) return 'none';
  const shown = poisoned.slice(-4).join(', ');
  return poisoned.length > 4 ? `${poisoned.length} days (latest ${shown})` : `${poisoned.length} days (${shown})`;
}
