/**
 * Breadcrumbs — the pure half. Where the user WAS when something broke.
 *
 * A production crash arrives as a tag and a message and nothing else: a
 * release build's stack is bytecode offsets, React attaches no component
 * stack to an infinite-update throw, and a native crash on iOS is a signal
 * and an offset into the binary. "Maximum update depth exceeded" on three
 * phones says that something looped; it cannot say on which screen, with
 * which card open. This is the answer to that: a short trail of what the
 * user did last — the tab they were on, the sheet that opened, the app going
 * to the background and back — kept in order and attached to a crash as its
 * own fault row (`crash.where`), so the dashboard can rank the CONTEXTS a
 * crash happens in the way it already ranks the crashes.
 *
 * It is a trail, not a log: a dozen short tokens, consecutive repeats
 * collapsed, nothing in it that is not a NAME this app chose. No entry text,
 * no values, no health data — a crumb like `sheet:EntryForm` says which form
 * was open and nothing about what was typed into it. The same redaction every
 * fault message goes through runs over it anyway.
 *
 * The shell (MMKV, the AppState listener, the previous-session memory) is in
 * ./breadcrumbs. Everything here is pure so jest can pin the trail's shape.
 */

export interface Crumb {
  /** Epoch ms. */
  t: number;
  /** Short token: `tab:journal`, `sheet:EntryForm`, `bg`, `fg`, `hrv:running`. */
  s: string;
}

export interface CrumbTrail {
  /** Epoch ms the session this trail describes began. */
  start: number;
  crumbs: Crumb[];
}

/** Crumbs kept per session. Newest last; the oldest fall off. Twelve is
 *  enough to see the two or three screens before a crash and short enough
 *  that the row stays readable on the dashboard. */
export const MAX_CRUMBS = 12;

/** How many of the newest crumbs a `crash.where` row carries. Fewer than are
 *  kept: the row is capped at MAX_FAULT_MSG after redaction, and a trail that
 *  gets truncated loses its NEWEST crumbs, which are the ones that matter. */
export const TRAIL_CRUMBS = 8;

/** Longest a single crumb may be. A crumb is a name this app chose; one this
 *  long is a name that got data into it. */
export const MAX_CRUMB_LEN = 32;

/** A crash stamped this long after the trail's last crumb is still that
 *  session's: a user can sit on one screen for a while before it dies. */
export const TRAIL_GRACE_MS = 30 * 60_000;

export const emptyTrail = (start: number): CrumbTrail => ({ start, crumbs: [] });

/** Keep a crumb to the alphabet a name needs. Anything else is dropped rather
 *  than escaped, since a crumb that needed escaping was never a name. */
export function cleanCrumb(s: string): string {
  const flat = String(s ?? '').replace(/[^A-Za-z0-9:._/-]+/g, '').slice(0, MAX_CRUMB_LEN);
  return flat || '?';
}

/**
 * Append one crumb. A repeat of the newest crumb is collapsed into it (its
 * time moves up), so the Journal re-focusing twenty times reads as one entry
 * rather than filling the whole window with itself.
 */
export function pushCrumb(trail: CrumbTrail, s: string, t: number, max = MAX_CRUMBS): CrumbTrail {
  const token = cleanCrumb(s);
  const last = trail.crumbs[trail.crumbs.length - 1];
  if (last && last.s === token) {
    return { ...trail, crumbs: [...trail.crumbs.slice(0, -1), { t, s: token }] };
  }
  const next = [...trail.crumbs, { t, s: token }];
  return { ...trail, crumbs: next.length > max ? next.slice(next.length - max) : next };
}

/**
 * Did this trail's session contain the moment `atMs`?
 *
 * Used to decide whether a crash drained on THIS launch (an Android Java crash
 * from the file, a MetricKit diagnostic) belongs to the trail persisted by the
 * previous session. A crash from two launches ago must not be described by
 * last launch's trail: a wrong context is worse than none.
 */
export function trailCovers(trail: CrumbTrail | null | undefined, atMs: number | undefined): boolean {
  if (!trail || typeof atMs !== 'number' || !Number.isFinite(atMs)) return false;
  const last = trail.crumbs.length ? trail.crumbs[trail.crumbs.length - 1].t : trail.start;
  return atMs >= trail.start && atMs <= last + TRAIL_GRACE_MS;
}

/**
 * The text of a `crash.where` row: the crash's own tag, then the newest
 * crumbs oldest-first, so the row reads as the path that led there.
 *
 * `approx` marks a trail attached by SESSION rather than by TIME — a MetricKit
 * crash carries the window it was collected in, not the instant it happened,
 * so the previous session's trail is the best available answer and the row
 * says so with a leading `~`.
 */
export function formatWhere(tag: string, trail: CrumbTrail | null | undefined, opts?: { approx?: boolean }): string {
  const crumbs = trail?.crumbs.slice(-TRAIL_CRUMBS).map((c) => c.s) ?? [];
  const path = crumbs.length ? crumbs.join(' > ') : 'unknown';
  return `${tag} @ ${opts?.approx ? '~' : ''}${path}`;
}

/** Parse a persisted trail. Total: a corrupt blob is an empty trail. */
export function parseTrail(raw: string | null | undefined): CrumbTrail | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CrumbTrail> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.start !== 'number') return null;
    const crumbs = Array.isArray(parsed.crumbs)
      ? parsed.crumbs
        .filter((c): c is Crumb => !!c && typeof c === 'object' && typeof c.t === 'number' && typeof c.s === 'string')
        .map((c) => ({ t: c.t, s: cleanCrumb(c.s) }))
      : [];
    return { start: parsed.start, crumbs: crumbs.slice(Math.max(0, crumbs.length - MAX_CRUMBS)) };
  } catch {
    return null;
  }
}
