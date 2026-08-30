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
 * (1) EVERY OCCURRENCE IS COUNTED. Not the first one, not one a day — every
 *     time it happens. That is the whole ask, and the only reason it is safe is
 *     that COUNTING and SENDING are separate things here. Occurrences
 *     accumulate in a persisted buffer and a report carries the count it
 *     accumulated (`n`), so a signature's first sighting goes out immediately
 *     and the rest of a storm rides three requests a minute instead of sixty.
 *     Suppressing a REQUEST — the debounce, the launch budget, a dead network —
 *     therefore never loses a COUNT: the occurrences simply wait, on disk, and
 *     go out on the next report or the next launch. A request per occurrence
 *     would have the app answering a failure by hammering an endpoint from a
 *     phone that is already having a bad time, and the user would pay for our
 *     telemetry in battery and data.
 *
 * (2) TWO NUMBERS COME OUT, and the pair is the point. `n` sums to OCCURRENCES
 *     ("this happened 412 times"); `d`, sent on a signature's first report each
 *     Eastern day and only then, sums to INSTALL-DAYS ("...across 3
 *     phone-days"). Either alone misleads in a way that matters — occurrences
 *     alone cannot tell one phone in a retry loop from a bug everybody has, and
 *     install-days alone cannot tell a single glitch from a storm. There is no
 *     identifier anywhere in this system, so install-days is as close to "how
 *     many phones" as anything here can honestly get, and the dashboard says so.
 *
 * (3) THE MESSAGE IS REDACTED BEFORE IT LEAVES, and the redaction is the price
 *     of admission. An error string is the one field in this app with any real
 *     chance of carrying user content — a file name from a failed import, a
 *     value quoted by a parse error, a path with a device owner's name in it —
 *     and this app's whole promise is that health data and identifiers never
 *     leave the phone. `redactMessage` strips emails, URLs down to their host,
 *     paths down to a basename, anything id-shaped, and every digit run long
 *     enough to be a timestamp or a key, then truncates hard. What survives is
 *     the SHAPE of the failure, which is what a fix needs — and, usefully, what
 *     makes two attempts of the same failure one signature rather than two.
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

/** Signatures whose install-day is remembered per day. Bounded because it is a
 *  string in the flags MMKV; a phone hitting more distinct failures than this
 *  in one day has one problem, not thirty. */
export const MAX_DAY_SIGNATURES = 32;

/** Distinct failures that may be buffered at once. The bound is on VARIETY and
 *  never on volume: an already-buffered signature's count keeps climbing
 *  however full this is, so a storm is never undercounted — only a phone
 *  failing in dozens of genuinely different ways stops adding new kinds. */
export const MAX_PENDING_SIGNATURES = 24;

/** Ceiling on one signature's occurrence count. It rides in a URL and lands in
 *  a counter; past five digits the number has stopped being information and
 *  started being a way to corrupt a total. */
export const MAX_OCCURRENCES = 99999;

/** How long occurrences of an ALREADY-REPORTED signature accumulate before the
 *  next report goes out. A signature's first sighting is sent immediately, so
 *  this is never the latency of learning that something broke — only of
 *  learning how hard. Twenty seconds turns a per-second retry loop into three
 *  requests a minute carrying every one of its sixty occurrences. */
export const FLUSH_DEBOUNCE_MS = 20000;

/** Requests one launch may send. A CAP ON REQUESTS, NOT ON OCCURRENCES — this
 *  is the whole reason the two are separate. Hitting it leaves occurrences
 *  buffered and persisted, and they go out on the next launch rather than being
 *  discarded, so the count stays true even when the phone is stopped from
 *  talking. */
export const MAX_REPORTS_PER_LAUNCH = 40;

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
  opts?: { fatal?: boolean; n?: number; installDay?: boolean },
): string {
  const n = Math.max(1, Math.min(Math.floor(Number(opts?.n) || 1), MAX_OCCURRENCES));
  const q = [
    `t=${encodeURIComponent(safeTag(tag))}`,
    `m=${encodeURIComponent(redactMessage(msg))}`,
    // Occurrences carried by THIS report. Always sent, even when it is 1, so
    // the server never has to guess whether a missing parameter means one
    // occurrence or a client too old to say.
    `n=${n}`,
    ...(opts?.fatal ? ['f=1'] : []),
    // Does this report own the day's install-day for this signature? It is the
    // only thing here still capped per day, and it is what keeps "how many
    // phones" answerable beside "how many times".
    ...(opts?.installDay ? ['d=1'] : []),
  ].join('&');
  return `${FAULT_BASE}/${code}?${q}`;
}

/* ----------------------------------------------------------------- memory */

/**
 * The pending buffer, and the day's install-day ledger.
 *
 * EVERY OCCURRENCE IS COUNTED. That is the rule this shape exists to make
 * possible, and it is worth being precise about what it costs. A request per
 * occurrence is not the same thing and is not acceptable: a retry loop firing
 * every second would have the app answering a failure by hammering an endpoint
 * — from a phone that is, by definition, already having a bad time — and the
 * user would pay for our telemetry in battery and data.
 *
 * So the two are DECOUPLED. Occurrences accumulate here; a report carries the
 * count it accumulated (`n`). Suppressing a REQUEST therefore never loses a
 * COUNT — the occurrences simply ride the next one — which is what lets the
 * rate limiting be as aggressive as it needs to be without lying about volume.
 *
 * A signature's FIRST sighting flushes immediately, so a one-off failure is
 * reported the moment it happens with no delay at all. Everything after it in
 * that window accumulates.
 *
 * TWO NUMBERS COME OUT OF THIS, and the pair is the point. `n` sums to
 * OCCURRENCES ("this happened 412 times"), and `d` — set on the first report of
 * a signature each day and only then — sums to INSTALL-DAYS ("...across 3
 * phone-days"). Either alone is misleading in a way that matters: occurrences
 * alone cannot tell one phone in a loop from a bug everybody has, and
 * install-days alone cannot tell a single glitch from a hundred-a-minute storm.
 */

/** Occurrences buffered for one signature, waiting to be reported. */
export interface PendingFault {
  tag: string;
  msg: string;
  fatal?: boolean;
  /** Occurrences accumulated since the last report went out. */
  n: number;
}

export interface FaultMemory {
  /** Eastern day `counted` belongs to. */
  day: string;
  /** Signatures that have already contributed an install-day on `day`. */
  counted: string[];
  /** Occurrences seen but not yet reported. */
  pending: Record<string, PendingFault>;
}

export const EMPTY_FAULT_MEMORY: FaultMemory = { day: '', counted: [], pending: {} };

export function parseFaultMemory(raw: string | null | undefined): FaultMemory {
  if (!raw) return EMPTY_FAULT_MEMORY;
  try {
    const o = JSON.parse(raw) as FaultMemory;
    if (!o || typeof o !== 'object' || typeof o.day !== 'string') return EMPTY_FAULT_MEMORY;
    const counted = Array.isArray(o.counted) ? o.counted.filter((s) => typeof s === 'string') : [];
    const pending: Record<string, PendingFault> = {};
    const src = (o.pending && typeof o.pending === 'object') ? o.pending : {};
    Object.keys(src).slice(0, MAX_PENDING_SIGNATURES).forEach((k) => {
      const p = src[k];
      if (!p || typeof p.tag !== 'string' || typeof p.msg !== 'string') return;
      const n = Math.floor(Number(p.n));
      if (!(n > 0)) return;
      pending[k] = { tag: p.tag, msg: p.msg, n: Math.min(n, MAX_OCCURRENCES), ...(p.fatal ? { fatal: true } : null) };
    });
    return { day: o.day, counted: counted.slice(Math.max(0, counted.length - MAX_DAY_SIGNATURES)), pending };
  } catch {
    return EMPTY_FAULT_MEMORY;
  }
}

/**
 * Add one occurrence.
 *
 * The day rolls the install-day ledger over and nothing else — pending
 * occurrences survive a midnight, because they happened and are owed a report
 * whichever day they are finally sent on.
 *
 * Beyond MAX_PENDING_SIGNATURES DISTINCT failures the buffer stops taking new
 * ones. A phone failing in thirty distinct ways at once has one problem, and
 * the bound is on distinct signatures rather than on occurrences precisely so
 * that the thing it refuses is variety and never volume: an existing
 * signature's count keeps climbing however full the buffer is.
 */
export function notePending(
  mem: FaultMemory, sig: string, entry: Omit<PendingFault, 'n'>, day: string,
): FaultMemory {
  const counted = mem.day === day ? mem.counted : [];
  const prev = mem.pending[sig];
  if (!prev && Object.keys(mem.pending).length >= MAX_PENDING_SIGNATURES) {
    return { day, counted, pending: mem.pending };
  }
  return {
    day,
    counted,
    pending: {
      ...mem.pending,
      [sig]: prev
        ? { ...prev, n: Math.min(prev.n + 1, MAX_OCCURRENCES) }
        : { ...entry, n: 1 },
    },
  };
}

/** Remove a signature's buffered occurrences, to be carried by a report. */
export function takePending(mem: FaultMemory, sig: string): FaultMemory {
  if (!mem.pending[sig]) return mem;
  const pending = { ...mem.pending };
  delete pending[sig];
  return { ...mem, pending };
}

/**
 * Put occurrences back after a report failed to land.
 *
 * The half of the take/restore pair that makes "every occurrence is counted"
 * true across a bad network. Occurrences that arrived while the request was in
 * flight are already buffered under the same key, so this ADDS rather than
 * assigns — assigning would drop them, which is the exact bug the decoupling
 * exists to avoid.
 */
export function restorePending(
  mem: FaultMemory, sig: string, entry: Omit<PendingFault, 'n'>, n: number,
): FaultMemory {
  const prev = mem.pending[sig];
  return {
    ...mem,
    pending: {
      ...mem.pending,
      [sig]: { ...(prev || entry), n: Math.min((prev?.n || 0) + n, MAX_OCCURRENCES) },
    },
  };
}

/**
 * Does this report own the day's install-day for this signature?
 *
 * True once per signature per Eastern day. It is what keeps a count of PHONES
 * available beside the count of occurrences, and it is the one thing in this
 * module that is still capped per day — because "how many phones" is a
 * different question from "how many times", and answering it needs a counter
 * that only moves once per phone per day whatever the volume.
 */
export function needsInstallDay(mem: FaultMemory, sig: string, day: string): boolean {
  if (mem.day !== day) return true;
  return mem.counted.indexOf(sig) === -1;
}

export function noteInstallDay(mem: FaultMemory, sig: string, day: string): FaultMemory {
  const counted = mem.day === day ? mem.counted.slice() : [];
  if (counted.indexOf(sig) === -1) counted.push(sig);
  return { ...mem, day, counted: counted.slice(Math.max(0, counted.length - MAX_DAY_SIGNATURES)) };
}
