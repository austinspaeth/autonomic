/**
 * Pure ring-buffer logic for the on-device error log (the storage half lives in
 * ./errorLog.ts, which imports MMKV and so can't be reached from jest).
 *
 * The buffer exists because the app swallows almost every error by design — a
 * failed store write, a refused notification schedule, a health query that
 * threw are all handled as "degrade quietly" so nothing bricks. That's right
 * for the user and useless for support: by the time someone writes in, the
 * evidence is gone. Keeping the last few, dated, in plaintext device-local
 * storage costs nothing and turns "it just stopped working" into a line of
 * text.
 *
 * Two rules shape it. Consecutive repeats of the same failure COLLAPSE into one
 * row with a count — a retry loop firing every second would otherwise flush the
 * whole window in a minute and leave only its own noise. And messages are
 * truncated hard: these are error strings, and an error string that got long
 * did so by embedding data.
 */

export interface LoggedError {
  /** ISO timestamp of the most recent occurrence. */
  at: string;
  /** Where it happened — a stable dotted key like `store.persist`. */
  tag: string;
  /** Flattened error text (see describeError), truncated. */
  msg: string;
  /** Uncaught, i.e. it reached the global handler rather than a catch block. */
  fatal?: boolean;
  /** Occurrences collapsed into this row. Absent means 1. */
  n?: number;
  /** ISO timestamp of the FIRST occurrence, when n > 1. */
  first?: string;
}

export const MAX_ERRORS = 40;
export const MAX_MSG = 240;

/** Error text is the one field with any chance of carrying user content (a file
 *  name in an import failure, a value in a parse error), so cap it hard and
 *  collapse whitespace — a dump is read as text, not scrolled through. */
export function trimMessage(msg: string, max = MAX_MSG): string {
  const flat = msg.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Append `entry` to `list`, collapsing it into the newest row when that row is
 * the same failure, and dropping the oldest rows past `max`. Newest last.
 */
export function pushError(list: LoggedError[], entry: LoggedError, max = MAX_ERRORS): LoggedError[] {
  const msg = trimMessage(entry.msg);
  const last = list[list.length - 1];
  if (last && last.tag === entry.tag && last.msg === msg && !!last.fatal === !!entry.fatal) {
    const merged: LoggedError = {
      ...last,
      at: entry.at,
      n: (last.n ?? 1) + 1,
      first: last.first ?? last.at,
    };
    return [...list.slice(0, -1), merged];
  }
  const next = [...list, { ...entry, msg }];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Parse a persisted log blob, discarding anything that isn't a well-formed
 *  row. A corrupt log must never be the reason a diagnostics dump fails. */
export function parseErrorLog(raw: string | null | undefined, max = MAX_ERRORS): LoggedError[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rows = parsed.filter(
      (r): r is LoggedError =>
        !!r && typeof r === 'object'
        && typeof (r as LoggedError).at === 'string'
        && typeof (r as LoggedError).tag === 'string'
        && typeof (r as LoggedError).msg === 'string',
    );
    return rows.slice(Math.max(0, rows.length - max));
  } catch {
    return [];
  }
}
