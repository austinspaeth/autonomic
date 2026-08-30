/**
 * Fault report — the pure half. The stateful side (flags, network) lives in
 * src/store/errorReport.ts; this module is the wire format, the redaction and
 * the once-a-day rule, so jest can pin all three.
 *
 * WHY THIS IS NOT A PING. Every route in src/lib/ping.ts is a COUNTER: a fixed
 * alphabet, no free text, and a number at the end of it that means "how many
 * people". `/ping/err` is one of them and stays one — it fires once per install
 * ever and answers "how many phones have had something go wrong", which is a
 * population and a genuinely useful one.
 *
 * It cannot answer the next question, and by construction never will. It fires
 * ONCE, so a phone that hiccuped in March is silent through every bug shipped
 * since; and it carries no tag, so the answer to "what broke" was always "ask
 * the user for a support dump" — which needs a user who wrote in, and most
 * don't. A release could break Health imports for every Android install and the
 * counter would not move, because those installs had already spent their one
 * ping on something else.
 *
 * So this is a different thing with a different shape: a LOG, keyed by what
 * went wrong rather than by who saw it.
 *
 *   GET /fault/D082126I-TP-V1.26.0?t=health.check&m=timeout+after+<n>ms&f=1
 *
 * Cohort, platform, tier and version come free from the same code every ping
 * already sends. What is new is `t`, a tag this app chose from a fixed set of
 * call sites, and `m`, a message it did not choose — which is the whole reason
 * the redaction below is not optional.
 *
 * THREE RULES HOLD IT IN PLACE.
 *
 * (1) EVERY DISTINCT FAILURE IS REPORTED, not just the first ever. The dedupe
 *     key is the failure's own SIGNATURE (tag + redacted message), and the cap
 *     is one send per signature per install per Eastern day — the same day
 *     boundary every counter uses. A phone that breaks in a new way tomorrow
 *     says so tomorrow; a phone stuck in a retry loop says so once. That is the
 *     fix: "anything new, every day" rather than "one thing, once, forever".
 *
 * (2) THE MESSAGE IS REDACTED BEFORE IT LEAVES, and the redaction is the price
 *     of admission. An error string is the one field in this app with any real
 *     chance of carrying user content — a file name from a failed import, a
 *     value quoted by a parse error, a path with a device owner's name in it —
 *     and this app's whole promise is that health data and identifiers never
 *     leave the phone. `redactMessage` strips emails, URLs down to their host,
 *     paths down to a basename, anything id-shaped, and every digit run long
 *     enough to be a timestamp or a key, then truncates hard. What survives is
 *     the SHAPE of the failure, which is what a fix needs.
 *
 * (3) A COUNT HERE IS INSTALL-DAYS, NOT OCCURRENCES. Because of (1), one phone
 *     failing four hundred times in a loop contributes 1 to the day's count for
 *     that signature. That is deliberate and it is the number worth having: it
 *     says how many phones are affected, which is what decides whether a bug
 *     ships a hotfix. How OFTEN it happened on one phone is a question the
 *     support dump answers, and the dump is where it belongs.
 */

/** Base URL of the fault route. Deliberately not under /ping — this is not a
 *  counter, it carries text, and the two must not be read the same way. */
export const FAULT_BASE = 'https://api.autonomic.care/fault';

/** Hard cap on the redacted message. Short on purpose: the useful part of an
 *  error string is its first clause, and everything a long one gained its
 *  length from is the part that must not be sent. */
export const MAX_FAULT_MSG = 140;

/** Hard cap on a tag. Tags are ours and dotted (`store.persist`), so this is a
 *  sanity bound rather than a real limit. */
export const MAX_FAULT_TAG = 40;

/** Distinct signatures remembered per day. A phone failing in more than this
 *  many distinct ways in one day has one problem, not thirty, and the memory is
 *  a bounded string in the flags MMKV rather than a key per signature. */
export const MAX_DAY_SIGNATURES = 24;

/** Reports one launch may send, whatever happens. The backstop behind the
 *  per-signature rule: a phone melting down must not also become a phone
 *  hammering an endpoint, and an app that DDoSes its own API while the user
 *  waits for it has made their problem worse. */
export const MAX_REPORTS_PER_LAUNCH = 8;

/* -------------------------------------------------------------- redaction */

/** A `tag` is a stable dotted key this app chose, so it is checked rather than
 *  cleaned: anything that is not one is not a tag we wrote, and reporting it as
 *  `unknown` is more honest than sanitising an unknown string into the slot. */
export function safeTag(tag: string | undefined): string {
  const t = String(tag || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,38}[a-z0-9]$|^[a-z0-9]$/.test(t) ? t : 'unknown';
}

/**
 * Strip everything from an error message that could identify a person, a
 * device or a piece of their data, leaving the shape of the failure.
 *
 * ORDER MATTERS and each rule is here because of the thing it catches:
 *
 *   emails      an import failure that quotes a file named after its owner
 *   URLs        reduced to scheme + host; a path or query can carry anything
 *   paths       reduced to a basename; an iOS container path holds the device's
 *               own UUID, and an Android one can hold the user's name
 *   ids         UUIDs, long hex, long base64 — tokens, receipt ids, update ids
 *   digit runs  four or more digits is a timestamp, a key or a size, never a
 *               fact worth carrying; short runs survive so `code 404` still
 *               reads as `code 404`
 *
 * The digit rule is the one that also does the grouping work: it turns
 * `timeout after 3012ms` and `timeout after 4188ms` into one signature, which
 * is what stops a retry loop reading as a hundred distinct bugs.
 */
export function redactMessage(msg: string | undefined, max = MAX_FAULT_MSG): string {
  let s = String(msg == null ? '' : msg);
  // Control characters would ride through the query string as escapes and are
  // never part of a message worth reading.
  s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ');
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>');
  // A URL keeps its scheme and host — "which service timed out" is a fact worth
  // having — and loses the path and query, which are where anything specific
  // lives. The host may be empty, so `file:///var/…` is caught here rather than
  // falling through to the path rule below.
  s = s.replace(/\b([a-z][a-z0-9+.-]*):\/\/([^\s/?#]*)[^\s]*/gi, '$1://$2');
  // Absolute paths down to a basename: an iOS container path carries the
  // device's own UUID and an Android one can carry the user's name. Anchored to
  // a boundary so a module specifier (`expo-modules-core/build/x`), which is
  // genuinely useful to see, survives untouched.
  s = s.replace(/(^|[\s"'(\[<])((?:\/[^\s/]+){2,}\/?)/g, (_all, pre: string, p: string) => {
    const parts = p.split('/').filter(Boolean);
    return `${pre}…/${parts[parts.length - 1] || ''}`;
  });
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>');
  s = s.replace(/\b[0-9a-f]{12,}\b/gi, '<id>');
  s = s.replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<id>');
  s = s.replace(/\d{4,}/g, '<n>');
  return trimFault(s, max);
}

/** Collapse whitespace and truncate. Shared so the length rule is stated once. */
export function trimFault(s: string, max = MAX_FAULT_MSG): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/* -------------------------------------------------------------- signature */

/**
 * FNV-1a, 32 bits, as 8 hex characters.
 *
 * Not a security hash and not required to match the server's: the client uses
 * it to answer "have I already sent this today" and the server derives its own
 * storage key from the message it received. Keeping them independent means the
 * two can never fall out of step the way `easternDay`'s two copies can — the
 * worst a drift could do here is group two rows the client thought were one.
 */
export function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A failure's identity: its tag and its REDACTED message.
 *
 * Redacted rather than raw, so the thing that groups two failures is the same
 * thing that gets reported — what you see in the dashboard is what the dedupe
 * was computed from. A raw signature would let two rows that read identically
 * be counted separately because of a timestamp neither of them shows.
 */
export function faultSignature(tag: string, msg: string, fatal?: boolean): string {
  return `${safeTag(tag)}#${hash8(redactMessage(msg))}${fatal ? '!' : ''}`;
}

/* ------------------------------------------------------------------- wire */

/**
 * The full URL for one fault report.
 *
 * The path segment is the SAME cohort code every ping sends — built by
 * `cohortCode` in ./ping, so cohort day, platform, tier and build version all
 * arrive here with no second implementation and no second thing to remember.
 * The variable-length parts ride in the query string, which is the one place a
 * message can go without fighting path encoding: an error string is full of
 * slashes, and an encoded slash in a path parameter is a fight with API Gateway
 * that nobody wins.
 */
export function faultUrl(
  code: string,
  tag: string,
  msg: string,
  fatal?: boolean,
): string {
  const q = [
    `t=${encodeURIComponent(safeTag(tag))}`,
    `m=${encodeURIComponent(redactMessage(msg))}`,
    ...(fatal ? ['f=1'] : []),
  ].join('&');
  return `${FAULT_BASE}/${code}?${q}`;
}

/* ----------------------------------------------------------------- memory */

/**
 * What this install has already reported today: the Eastern day, and the
 * signatures sent on it.
 *
 * One bounded JSON blob rather than a flag per signature, because a flag per
 * signature is a key per bug per day accumulating in the flags MMKV forever —
 * device bookkeeping that grows with how badly the app is behaving is the wrong
 * shape twice over.
 */
export interface FaultMemory {
  /** Eastern day these signatures belong to. */
  day: string;
  /** Signatures already reported on that day, newest last. */
  sigs: string[];
}

export function parseFaultMemory(raw: string | null | undefined): FaultMemory {
  if (!raw) return { day: '', sigs: [] };
  try {
    const p: unknown = JSON.parse(raw);
    const o = p as FaultMemory;
    if (!o || typeof o !== 'object' || typeof o.day !== 'string') return { day: '', sigs: [] };
    const sigs = Array.isArray(o.sigs) ? o.sigs.filter((s) => typeof s === 'string') : [];
    return { day: o.day, sigs: sigs.slice(Math.max(0, sigs.length - MAX_DAY_SIGNATURES)) };
  } catch {
    return { day: '', sigs: [] };
  }
}

/**
 * Should this signature be sent?
 *
 * A new day answers yes to everything — the memory is per day, so a failure
 * that is still happening tomorrow is reported again tomorrow, which is what
 * makes "is this bug still live" answerable at all. Within a day, only a
 * signature not already sent, and only while the day's list has room.
 */
export function shouldReportFault(mem: FaultMemory, sig: string, day: string): boolean {
  if (mem.day !== day) return true;
  if (mem.sigs.indexOf(sig) !== -1) return false;
  return mem.sigs.length < MAX_DAY_SIGNATURES;
}

/** Record a sent signature, rolling the memory over on a new day. */
export function noteFaultReported(mem: FaultMemory, sig: string, day: string): FaultMemory {
  const sigs = mem.day === day ? mem.sigs.slice() : [];
  if (sigs.indexOf(sig) === -1) sigs.push(sig);
  return { day, sigs: sigs.slice(Math.max(0, sigs.length - MAX_DAY_SIGNATURES)) };
}
