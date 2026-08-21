/* news.js — what counts as news, and the rules that stop a notification lying.
 *
 * Pure: no AWS, no clock, no network. `main.js` is the shell around it, and
 * `sls/lambdas/push/__tests__/news.test.mjs` is what pins the arithmetic.
 *
 * ------------------------------------------------------------------ scope
 *
 * Two events only, and they are the two the counter hears on its own:
 *
 *   download   an open ping whose cohort key IS the day it arrived on — an
 *              install the counter had never heard from before
 *   sale       a subscribe ping
 *
 * **Store CSV downloads and the sales ledger are deliberately NOT read.** Both
 * are hand-imported, so a push about them would be a push about Austin's own
 * typing rather than about the business. That is the same rule
 * `landing/master/alerts.js` states at the top of the file, and this module is
 * the server-side twin of that one's pure half: same definition of a download,
 * same day-by-day comparison, same clamp. **If one moves, the other must** —
 * the two are read side by side (one buzzes the phone, the other throws
 * confetti at the open dashboard) and a reader who saw them disagree would
 * have no way to tell which was right.
 *
 * ------------------------------------------------------------------- rules
 *
 * - **A delta is never negative.** The report is a sliding window, so the
 *   oldest day falls out of it as the calendar turns and a count can drop with
 *   nothing having gone wrong. A drop is not an event: it clamps to zero, and
 *   the new snapshot becomes the watermark either way.
 * - **Two snapshots are compared DAY BY DAY, not total against total.** A run
 *   that missed an hour has two new days in front of it and possibly one that
 *   fell off the back; compared as totals those cancel, and the day you were
 *   away announces itself as silence.
 * - **A missing watermark seeds in SILENCE.** The first run after this ships
 *   has nothing to compare against, and "everything ever recorded" is not news.
 *   The same reason the dashboard's alert baseline seeds quietly, and the same
 *   reason a baseline written before the activation counter existed announces
 *   no activations.
 * - **Only recent days are compared** (`WINDOW_DAYS`). A correction written
 *   against a row from three months ago is a correction, not an arrival, and
 *   the phone should not buzz for it.
 */

'use strict';

/* How far back a rise is still treated as an arrival. Seven days is generous
   for an hourly job — it exists so a schedule that was switched off over a
   long weekend still reports what came in, and so that a very old row being
   corrected never does. */
const WINDOW_DAYS = 7;

/* Cards and copy speak store names; the counter speaks letters. Kept verbatim
   in step with alerts.js, which says the same three things in the browser. */
const STORE = { I: 'iOS', A: 'Android', U: 'unknown store' };

const storeName = (letter) => STORE[letter] || STORE.U;
const letterOf = (p) => ((p === 'I' || p === 'A') ? p : 'U');

/**
 * Fold a PINGS report into per-day download and sale counts.
 *
 *   { '2026-08-21': { d: 3, s: 1, dBy: { I: 2, A: 1 }, sBy: { I: 1 } } }
 *
 * Keyed by day so `risen` can compare like with like. These are counts of
 * PINGS rather than of people, which does not matter here — the only job this
 * number has is to be compared with its own previous value.
 */
function snapshotDays(report) {
  const out = {};
  const day = (d) => (out[d] || (out[d] = { d: 0, s: 0, dBy: {}, sBy: {} }));

  ((report && report.open) || []).forEach((row) => {
    if (!row || !row.day) return;
    const bucket = day(row.day);
    (row.cohorts || []).forEach((x) => {
      if (!x || !x.cohort) return;
      const n = Number(x.count) || 0;
      if (!(n > 0)) return;
      /* Born today == first run == the install we are calling a download.
         Everything else in this row is somebody coming back, which is not an
         arrival and never buzzes a phone. */
      if (x.cohort !== row.day) return;
      const p = letterOf(x.platform);
      bucket.d += n;
      bucket.dBy[p] = (bucket.dBy[p] || 0) + n;
    });
  });

  ((report && report.sub) || []).forEach((row) => {
    if (!row || !row.day) return;
    const bucket = day(row.day);
    (row.cohorts || []).forEach((x) => {
      if (!x || !x.cohort) return;
      const n = Number(x.count) || 0;
      if (!(n > 0)) return;
      const p = letterOf(x.platform);
      bucket.s += n;
      bucket.sBy[p] = (bucket.sBy[p] || 0) + n;
    });
  });

  return out;
}

const rise = (a, b) => Math.max(0, (Number(b) || 0) - (Number(a) || 0));

function gainBy(prevBy, nextBy) {
  const out = {};
  Object.keys(nextBy || {}).forEach((k) => {
    const d = (nextBy[k] || 0) - ((prevBy && prevBy[k]) || 0);
    if (d > 0) out[k] = d;
  });
  return out;
}

/**
 * What arrived between two snapshots.
 *
 * `prev` null (no watermark yet) returns nothing at all, and says so with
 * `seeded: true` so the caller can store the new watermark without sending —
 * the silent-seed rule above.
 *
 * `newest` is the latest day the report knows about, and is what `WINDOW_DAYS`
 * is measured back from. It is passed in rather than read off a clock so this
 * stays pure and so a report that lags a day is not silently ignored.
 */
function risen(prev, next, newest) {
  if (!prev) return { seeded: true, downloads: 0, sales: 0, downloadsBy: {}, salesBy: {} };

  const cutoff = newest ? shiftDay(newest, -(WINDOW_DAYS - 1)) : null;
  const out = { seeded: false, downloads: 0, sales: 0, downloadsBy: {}, salesBy: {} };

  Object.keys(next || {}).forEach((d) => {
    if (cutoff && d < cutoff) return;
    const a = prev[d] || { d: 0, s: 0, dBy: {}, sBy: {} };
    const b = next[d];
    out.downloads += rise(a.d, b.d);
    out.sales += rise(a.s, b.s);
    addInto(out.downloadsBy, gainBy(a.dBy, b.dBy));
    addInto(out.salesBy, gainBy(a.sBy, b.sBy));
  });

  return out;
}

function addInto(into, from) {
  Object.keys(from || {}).forEach((k) => {
    if (from[k] > 0) into[k] = (into[k] || 0) + from[k];
  });
}

/** ISO day arithmetic, UTC so it cannot drift with the runtime's zone. */
function shiftDay(iso, n) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

/** "2 iOS, 1 Android" — the split, in the order the tiles use, unknowns last. */
function splitText(by) {
  const parts = [];
  ['I', 'A', 'U'].forEach((k) => {
    if (by && by[k] > 0) parts.push(`${by[k]} ${storeName(k)}`);
  });
  return parts.join(', ');
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * One run's worth of copy, or null when there is nothing to say.
 *
 * ONE notification per run, never one per event: an hourly job that found six
 * installs has six pieces of the same news, and six banners is the version of
 * this feature that gets switched off in a week. The title carries the
 * headline and the body carries the split, because iOS shows both and truncates
 * the body first.
 *
 * A sale leads whenever there is one. That is the whole ranking — money over
 * arrivals — and it is the same order alerts.js gives them on screen.
 */
function headline(gain) {
  if (!gain || (!gain.downloads && !gain.sales)) return null;

  const bits = [];
  if (gain.sales) bits.push(plural(gain.sales, 'sale', 'sales'));
  if (gain.downloads) bits.push(plural(gain.downloads, 'new install', 'new installs'));

  const body = [];
  if (gain.sales) {
    const s = splitText(gain.salesBy);
    body.push(s ? `Paid: ${s}` : 'Paid');
  }
  if (gain.downloads) {
    const d = splitText(gain.downloadsBy);
    body.push(d ? `Installed: ${d}` : 'Installed');
  }

  return {
    /* The emoji is the ranking, read before the words are: gold coin for
       money, a wave for an arrival. It is the notification-shade version of
       "the metal is the news" that the confetti obeys on screen. */
    title: `${gain.sales ? '\u{1F4B0}' : '\u{1F44B}'} ${bits.join(' · ')}`,
    body: body.join(' · '),
    /* One tag, so an hour that brings more news REPLACES the banner still
       sitting on the lock screen rather than stacking beside it. */
    tag: 'autonomic-arrivals',
  };
}

module.exports = { WINDOW_DAYS, snapshotDays, risen, headline, splitText, shiftDay };
