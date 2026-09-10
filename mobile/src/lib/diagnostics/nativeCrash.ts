/**
 * Reading the native crash log — the pure half.
 *
 * The Android module writes crashes to a file from inside a dying process (see
 * `modules/app-env`), and the next launch hands the raw JSON here. Everything
 * in this file is parsing and phrasing, with no imports at all, so jest can pin
 * the shape of what ends up in the error log and on the `/fault` route.
 *
 * The shell — installing the handler, draining the log into `logError` — lives
 * in ./errorLog beside the JavaScript hook it completes.
 *
 * WHY THE MESSAGE MATTERS HERE, when it usually doesn't. The rule everywhere
 * else in this app is that the TAG is the location and the message is a
 * courtesy: a release build's JS stack is minified bytecode offsets, so
 * `area.thing` plus an error type is the whole diagnosis. A native crash
 * inverts that. There is only one site — "something threw on a Java thread" —
 * so the tag can say nothing useful about WHERE, and the exception type and its
 * root cause carry the entire finding. `BadParcelableException:
 * ClassNotFoundException when unmarshalling: com.garmin.android.connectiq.IQDevice`
 * IS the bug report. So the message is composed carefully, and it survives
 * `redactMessage` intact: no digit runs, no slashes, and dotted class names
 * break into segments too short for the id rule.
 */

/** One crash, as the Android module recorded it. Every field is optional: it
 *  was written by a process on its way out, and an older build's row must still
 *  parse rather than taking the drain down with it. */
export interface NativeCrash {
  /** Epoch ms, stamped at the crash rather than at the read. */
  at?: number;
  thread?: string;
  type?: string;
  message?: string;
  causeType?: string;
  causeMessage?: string;
  frame?: string;
}

/**
 * The tag every native crash lands under.
 *
 * ONE tag, not one per exception type, and that is what makes it readable. The
 * dashboard's signature is tag + redacted message, so distinct crashes still
 * separate into distinct rows — while "how many phones had the process killed
 * out from under them" stays a question you can answer by looking at a single
 * prefix. A tag per type would scatter that across the list.
 */
export const NATIVE_CRASH_TAG = 'native.crash';

/** Longest composed message worth carrying. `redactMessage` truncates to its
 *  own limit afterwards; this only stops a pathological native string from
 *  sitting in the on-device log, which has no such cap. */
const MAX_DESCRIPTION = 220;

/** Strip the package off a Java class name: `android.os.BadParcelableException`
 *  is the same fact as `BadParcelableException` and four times the width in a
 *  140-character message that also has to hold the cause. The one place a
 *  package genuinely carries the finding — a class that could not be found — is
 *  inside the MESSAGE, which is never touched. */
function simpleName(qualified: string): string {
  const cut = qualified.lastIndexOf('.');
  return cut >= 0 && cut < qualified.length - 1 ? qualified.slice(cut + 1) : qualified;
}

/**
 * One line describing a crash, in the shape `describeError` produces for
 * everything else: `Type: message (cause: CauseType: message)`.
 *
 * The cause is included rather than replacing the top exception, because which
 * wrapper threw is half the diagnosis — `BadParcelableException` says the
 * failure was unmarshalling an intent extra, and `ClassNotFoundException`
 * alone would not.
 */
export function describeNativeCrash(c: NativeCrash): string {
  const type = c.type ? simpleName(c.type) : '';
  const head = [type, (c.message || '').trim()].filter(Boolean).join(': ');
  const causeType = c.causeType ? simpleName(c.causeType) : '';
  const causeBody = [causeType, (c.causeMessage || '').trim()].filter(Boolean).join(': ');
  const cause = causeBody ? ` (cause: ${causeBody})` : '';
  const line = (head + cause).replace(/\s+/g, ' ').trim() || 'unknown native crash';
  return line.length > MAX_DESCRIPTION ? `${line.slice(0, MAX_DESCRIPTION - 1)}…` : line;
}

/**
 * Parse what the native module handed over.
 *
 * Total by construction. The file it came from was written by a crashing
 * process and may be truncated, may be from an older build, may be `""`
 * because there was nothing — and none of those is a reason for the launch
 * that reads it to fail. Anything unparseable yields no crashes rather than an
 * exception; a lost record is better than a drain that throws.
 */
export function parseNativeCrashes(raw: string | null | undefined): NativeCrash[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: NativeCrash[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const crash: NativeCrash = {
      at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : undefined,
      thread: str(r.thread),
      type: str(r.type),
      message: str(r.message),
      causeType: str(r.causeType),
      causeMessage: str(r.causeMessage),
      frame: str(r.frame),
    };
    // A row carrying no identifying text at all describes nothing and would
    // report as "unknown native crash", which is a row on the dashboard that
    // can never be acted on.
    if (crash.type || crash.message || crash.causeType) out.push(crash);
  }
  return out;
}
