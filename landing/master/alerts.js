/* alerts.js — the dashboard noticing something happened.
 *
 * The page auto-refreshes every 5 minutes while it is visible, on every view
 * (app.js), and this is what makes that worth doing: the difference between one
 * ping report and the next is announced rather than silently redrawn. Five
 * events, in ascending order of how much they matter:
 *
 *   visitors    someone opened the app         soft blip, a card + a toast
 *               (returning: a first run is       naming the store and how old
 *               counted as a download, not       the installs are, THREE
 *               as a return)                     SECONDS of house-coloured
 *                                                glitter. No notification.
 *   readings    an install saved a reading      soft tap, a card + a toast + a
 *               TODAY (any reading, not the      notification naming the
 *               first)                           sensor. No canvas.
 *   activations an install saved its FIRST      soft chime, a card + a toast +
 *               HRV reading                     a notification naming the
 *                                               sensor. No canvas.
 *   downloads   a first run the counter had     two-note chime, TEN SECONDS of
 *               never seen (a new install)      SILVER glitter falling from the
 *                                               top, a card + a toast + a
 *                                               notification naming the store
 *   sales       a subscribe ping                fanfare, TWENTY SECONDS of
 *                                               GOLD glitter from both edges, a
 *                                               card + a toast + a notification
 *                                               naming the store that paid
 *
 * A first reading is NOT a fifth event, and that is a correction rather than a
 * simplification: `act` fires once per install ever and `hrv` once per install
 * per Eastern day, both from the moment a reading completes, so an install's
 * first reading raises BOTH — and this file announced it twice, as two cards
 * and two notifications directly above one another, which reads as two things
 * happening. It is one card with a tag on the row now. See `mergeFirsts`.
 *
 * **The canvas ranks nothing; only the SOUND does.** All three celebrations run
 * at once, so a refresh carrying a sale, a new install and somebody coming back
 * shows gold, silver and colour together — that is the news, and drawing only
 * the loudest of the three threw two thirds of it away. One cue is still played
 * per refresh, the best outcome that happened (pay > sign up > return), because
 * three simultaneous sounds are a noise where three simultaneous emitters are a
 * party. Count STACKS at a decayed rate, halving each time: two sales are 20s
 * plus 10s, three are 20 + 10 + 5. See `celebrate`.
 *
 * **The metal is the news, and the duration is the ranking.** Gold for money,
 * silver for a new install, house colours for somebody coming back — told apart
 * across a room with the sound off. An earlier version of this file reserved
 * the canvas for arrivals and gave usage nothing, on the argument that a
 * celebration for the event the dashboard hopes to see all day would run
 * permanently and leave a sale's confetti meaning nothing. That argument was
 * about duration, not about the canvas: three seconds is over before it reads
 * as an interruption, where a sale holds the screen for twenty. An activation
 * is the one event that still gets no canvas at all — it lands in the same
 * refresh as the download that caused it often enough that its own puff would
 * only ever be read as part of that one, and the reading counter beside it is
 * the same event one rung quieter: the app being USED, which is the thing this
 * dashboard hopes to see all day and therefore the last thing that may hold the
 * screen. Both are told, neither is celebrated.
 *
 * **A card lists the installs behind its count, it does not only total them.**
 * Under the header sits one sub-card per install: which store, which tier
 * (Free / Trial / Pro), which build, and how old that install is. All four
 * were already in the ping and three of them were being thrown away — the old
 * one-line card flattened two sales from a 17-day-old iOS install and a
 * two-day-old Android install into "2 new sales · 1 on iOS · 1 on Android",
 * which is the same number and none of the news. Rows GROUP: two pings that
 * agree on all four facts are one row with a count, because identical facts
 * are one fact.
 *
 * The version is the one field that is INFERRED rather than read, and the only
 * one that can be missing for a reason other than an old build. Tier and store
 * ride inside the ping's own cohort key, so they belong to the install that
 * pinged; version is counted in a separate map keyed platform x tier (the
 * lambda cannot afford it in the cohort key — see sls/lambdas/ping/main.js),
 * so joining it to a row is only safe when that group turns out to hold one
 * version. When it holds two, the row says nothing and the card footers the
 * candidates. See `versionFor`.
 *
 * The TOAST and the NOTIFICATION do not get the table. They get the sentence,
 * now carrying the tier split and the build — a line that replaces itself in
 * seconds, or is read on a lock screen, is the wrong place for a breakdown,
 * and the card in the corner is already the thing that stays.
 *
 * Everything here is fed by the PING COUNTER, which is the only source on this
 * page that changes on its own. Store downloads and the sales ledger are hand
 * imported, so a burst of "new sales" from a CSV paste would be an alert about
 * your own typing, not about the business.
 *
 * Two halves, deliberately separated:
 *
 *   `snapshot` / `diff` are PURE — no DOM, no audio, no clock — and are what
 *   `tests/alerts.test.mjs` pins. Everything under "effects" is the shell.
 *
 * The rules the pure half obeys:
 *
 * - **A download is a first run, not an open.** An open ping whose cohort key
 *   IS the day it arrived on is an install the counter had never heard from
 *   before. That is the closest thing to a live download this dashboard has;
 *   the store's own download number arrives a day late in a CSV.
 * - **The platform comes off the ping's own cohort key**, so a card can say
 *   which store without a second source. A ping from a build that predates the
 *   platform marker reads as `U` and is reported as "unknown store" rather
 *   than being folded into either one — the same rule the App usage view runs.
 * - **A delta is never negative.** The report is a sliding 400-day window, so
 *   the oldest day drops out of it as the calendar turns and a count can fall
 *   without anything having gone wrong. A drop is not an event: it clamps to
 *   zero, and the new snapshot becomes the baseline either way.
 * - **Two snapshots are compared DAY BY DAY, not total against total**, which
 *   is what makes the point above survive an absence rather than only a
 *   refresh. See the note on `diff`.
 * - **The baseline is remembered across sessions**, so what arrived while the
 *   dashboard was closed is announced when you open it — which was the whole
 *   point of a dashboard that celebrates. A browser that has never held a
 *   baseline still seeds in silence, and so does one whose baseline is older
 *   than `MAX_CATCHUP_MS`; otherwise a first sign-in would open with a fanfare
 *   for a month of history, which is the rule this replaces and not one it
 *   throws away.
 */
(function () {
  'use strict';

  /* Cards and copy speak store names; the report speaks letters. */
  var STORE = { I: 'iOS', A: 'Android', U: 'unknown store' };

  /* The second letter a READING ping carries — activations and daily readings
     both do: which sensor took it. Lower case because it reads inside a
     sentence ("1 chest strap"), unlike a store name. */
  var SENSOR = { W: 'Apple Watch', B: 'chest strap', F: 'phone camera', G: 'Garmin watch' };

  /* Sentence case for the same four, because on a card they are a CHIP rather
     than a clause — "Chest strap" beside "iOS" and "Paid", not "1 chest strap"
     inside a sentence. Both spellings are needed and neither can be derived
     from the other without a capitalisation rule that would title-case
     "Garmin watch" wrongly. */
  var SENSOR_CHIP = { W: 'Apple Watch', B: 'Chest strap', F: 'Phone camera', G: 'Garmin watch' };

  /* The stores, for the same reason: `storeName` is written for the middle of a
     sentence ("1 on unknown store") and a chip is not a sentence. */
  var STORE_CHIP = { I: 'iOS', A: 'Android', U: 'Unknown store' };
  function storeChip(letter) { return STORE_CHIP[letter] || STORE_CHIP.U; }

  /* What an install could do at the instant it pinged, from the tier token
     every route has carried since 1.26. `?` is a ping from a build that
     predates the token and is reported as unknown — never folded into free,
     the same rule the App usage view runs on every other missing letter.

     These three words are the app's own and must stay the app's own: `Pro` is
     what the paywall, Settings and the landing page's pricing table all call
     the paid tier, and analytics.js spells TIER_NAME identically. Kept as a
     copy rather than read off `window.A` because this module is inlined ahead
     of nothing in particular and must not depend on load order — but the two
     say the same words on purpose, and a change to one belongs in both. */
  var TIER = { F: 'Free', T: 'Trial', P: 'Pro' };

  function storeName(letter) { return STORE[letter] || STORE.U; }
  function letterOf(p) { return (p === 'I' || p === 'A') ? p : 'U'; }
  function sensorOf(m) { return SENSOR[m] ? m : '?'; }
  function sensorName(letter) { return SENSOR[letter] || 'unknown sensor'; }
  function tierOf(t) { return TIER[t] ? t : '?'; }
  function tierName(letter) { return TIER[letter] || 'Tier unknown'; }

  /* The version a ping carried, as the report spells it. The lambda stores an
     unreadable or absent version as `?` in its build key, and so does a build
     old enough to have sent no version token at all; both mean the same thing
     here and both must render as unknown rather than as a guess. */
  function versionOf(v) { return (v && v !== '?') ? String(v) : ''; }

  /* The key a per-install detail row is counted under, inside one arrival day.
     Everything the ping can say about ONE install, which is what makes a row a
     row: two pings that agree on all four are the same fact twice and are
     shown as one row with a count, where two that differ are two events.

     The slot letter is the sensor on a reading route and is absent elsewhere;
     it rides in the key regardless, so one shape answers for every kind. */
  function whoKey(cohort, platform, tier, slot) {
    return cohort + '|' + letterOf(platform) + '|' + tierOf(tier) + '|' + (slot || '?');
  }

  /* The key a BUILD is counted under. This is NOT the row key, and the
     difference is the whole of the version rule below: the lambda counts
     versions in a map of its own, keyed platform x tier x version, because
     putting the version in the cohort key would multiply a row that already
     grows forever (sls/lambdas/ping/main.js). So a version is known for a
     platform+tier GROUP and is only attributable to a row when that group
     turns out to hold exactly one of them. */
  function buildKey(platform, tier) {
    return letterOf(platform) + '|' + tierOf(tier);
  }

  /* How many days back a snapshot keeps its per-cohort maps. Past the 30-day
     catch-up window (MAX_CATCHUP_MS) with room to spare. */
  var COHORT_DAYS = 45;

  /* The shape of the stored baseline's detail maps.

     A baseline is a claim about what you have already been told, and the keys
     that claim is written in are part of it: a snapshot whose `who` maps are
     keyed by cohort ALONE cannot be compared against one keyed by cohort,
     store, tier and sensor — every row in the new shape would read as a rise
     from nothing, and the first refresh after a deploy would announce a month
     of history as news. So the shape is stamped, and a baseline that does not
     carry this exact number keeps its COUNTS (which never changed shape) and
     is skipped for detail, for exactly one refresh. Bump it whenever the key
     shape below changes. */
  var SNAP_V = 2;

  /* How many rows a card in the CORNER STACK draws before it stops and counts
     the rest. The dock is a fixed corner of the screen holding several cards at
     once, so a card there has to be bounded.

     The HISTORY DRAWER is not bounded — it is a scroller whose whole job is to
     be read — so it draws every row (`rowsHtml` with no limit). A morning
     carrying 59 returns and 31 readings is exactly when you want the
     breakdown, and "+34 more" in a panel with room to scroll was throwing away
     the answer to the question the drawer was opened to ask. */
  var MAX_ROWS = 8;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Day keys are YYYY-MM-DD. Read as UTC so a DST change can't make one day 23h. */
  function dayNum(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null;
  }

  /** Whole days from install day `cohort` to arrival day `day`; null if either is unreadable. */
  function ageDays(cohort, day) {
    var a = dayNum(cohort), b = dayNum(day);
    return (a === null || b === null) ? null : Math.max(0, Math.round(b - a));
  }

  /* --------------------------------------------------------------- pure */

  /**
   * Fold a PINGS report into the three running totals we alert on.
   *
   *   { opens, downloads, sales, activations, readings,
   *     downloadsBy: {I,A,U}, salesBy: {I,A,U},
   *     activationsBy: {W,G,B,F,?}, readingsBy: {W,G,B,F,?} }
   *
   * `activationsBy` is keyed by SENSOR rather than by store, because that is
   * the fact the activation route carries that nothing else does — which store
   * an install came from is already on its download card.
   *
   * These are counts of PINGS, not of people — summing daily actives into one
   * number would count the same install once per day it opened the app, which
   * is the rule the App usage view is built around. Here that does not matter
   * and the distinction is still worth keeping in mind: this is an event
   * counter whose only job is to be compared with its own previous value.
   */
  function snapshot(report) {
    var out = {
      v: SNAP_V,
      opens: 0, downloads: 0, returns: 0, sales: 0, activations: 0, readings: 0,
      downloadsBy: {}, returnsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {}, days: {},
    };

    /* The newest day in the report, which is what "recent" is measured from
       for the per-cohort maps below. */
    var newest = '';
    ['open', 'sub', 'act', 'hrv'].forEach(function (k) {
      ((report && report[k]) || []).forEach(function (r) {
        if (r && r.day && r.day > newest) newest = r.day;
      });
    });

    function day(d) {
      if (out.days[d]) return out.days[d];
      var bucket = out.days[d] = {
        opens: 0, downloads: 0, returns: 0, sales: 0, activations: 0, readings: 0,
        downloadsBy: {}, returnsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {},
      };
      /* WHO arrived, keyed by everything the ping can say about ONE install:
         its cohort, its store, its tier and (on a reading route) its sensor.
         This is what lets a card list the installs behind a count rather than
         only their number, and it is why `downloads` has a map now — a first
         run is always "installed today", so under the old cohort-only key it
         had nothing left to say and was given none.

         Only kept for recent days: this snapshot is the stored baseline, a year
         of these maps is most of a localStorage quota, and a day older than the
         catch-up window can never rise into an announcement anyway.

         `builds` is the same window and the other half of a row. It is keyed
         platform x tier — NOT by cohort — because that is the shape the lambda
         counts versions in, and the honesty of the version on a card depends on
         not pretending otherwise. See `versionFor`. */
      var age = ageDays(d, newest);
      if (age !== null && age <= COHORT_DAYS) {
        bucket.who = { downloads: {}, returns: {}, sales: {}, activations: {}, readings: {} };
        bucket.builds = { open: {}, sub: {}, act: {}, hrv: {} };
      }
      return bucket;
    }

    function bump(map, key, n) {
      if (map) map[key] = (map[key] || 0) + n;
    }

    /* One route's build rows for one day, folded into the day's own map. */
    function builds(bucket, kind, rows) {
      var into = bucket.builds && bucket.builds[kind];
      if (!into) return;
      (rows || []).forEach(function (b) {
        if (!b) return;
        var n = Number(b.count) || 0;
        if (!(n > 0)) return;
        var g = into[buildKey(b.platform, b.tier)] || (into[buildKey(b.platform, b.tier)] = {});
        var v = versionOf(b.version) || '?';
        g[v] = (g[v] || 0) + n;
      });
    }

    ((report && report.open) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      builds(bucket, 'open', row.builds);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        out.opens += n;
        bucket.opens += n;
        // Born today == first run == the install we are calling a download.
        if (x.cohort === row.day) {
          var p = letterOf(x.platform);
          out.downloads += n;
          out.downloadsBy[p] = (out.downloadsBy[p] || 0) + n;
          bucket.downloads += n;
          bucket.downloadsBy[p] = (bucket.downloadsBy[p] || 0) + n;
          bump(bucket.who && bucket.who.downloads, whoKey(x.cohort, x.platform, x.tier), n);
        } else {
          /* Somebody the counter had heard from before. Counted in its own
             right rather than left as `opens - downloads`: the platform is on
             the ping's own cohort key and is thrown away by a subtraction, and
             it is the half of a return that a store name makes readable. */
          var rp = letterOf(x.platform);
          out.returns += n;
          out.returnsBy[rp] = (out.returnsBy[rp] || 0) + n;
          bucket.returns += n;
          bucket.returnsBy[rp] = (bucket.returnsBy[rp] || 0) + n;
          bump(bucket.who && bucket.who.returns, whoKey(x.cohort, x.platform, x.tier), n);
        }
      });
    });

    ((report && report.sub) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      builds(bucket, 'sub', row.builds);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        var p = letterOf(x.platform);
        out.sales += n;
        out.salesBy[p] = (out.salesBy[p] || 0) + n;
        bucket.sales += n;
        bucket.salesBy[p] = (bucket.salesBy[p] || 0) + n;
        bump(bucket.who && bucket.who.sales, whoKey(x.cohort, x.platform, x.tier), n);
      });
    });

    /* Activation fires once per install, ever, so unlike the open rows above
       these really do count people — no de-duplication is being skipped here. */
    ((report && report.act) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      builds(bucket, 'act', row.builds);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        var m = sensorOf(x.method);
        out.activations += n;
        out.activationsBy[m] = (out.activationsBy[m] || 0) + n;
        bucket.activations += n;
        bucket.activationsBy[m] = (bucket.activationsBy[m] || 0) + n;
        bump(bucket.who && bucket.who.activations, whoKey(x.cohort, x.platform, x.tier, m), n);
      });
    });

    /* The daily reading counter. Unlike activation this fires again tomorrow,
       so a row counts install-DAYS rather than people — which is exactly the
       news it is for: somebody who already has the app used it today. Its
       sensor letter names that install's FIRST reading of the day, since the
       counter is capped at one per install per Eastern day. */
    ((report && report.hrv) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      builds(bucket, 'hrv', row.builds);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        var sensor = sensorOf(x.method);
        out.readings += n;
        out.readingsBy[sensor] = (out.readingsBy[sensor] || 0) + n;
        bucket.readings += n;
        bucket.readingsBy[sensor] = (bucket.readingsBy[sensor] || 0) + n;
        bump(bucket.who && bucket.who.readings, whoKey(x.cohort, x.platform, x.tier, sensor), n);
      });
    });

    return out;
  }

  function gain(prevBy, nextBy) {
    var out = {};
    Object.keys(nextBy || {}).forEach(function (k) {
      var d = (nextBy[k] || 0) - ((prevBy && prevBy[k]) || 0);
      if (d > 0) out[k] = d;
    });
    return out;
  }

  function rise(a, b) { return Math.max(0, (b || 0) - (a || 0)); }

  /* Per-install rises for one arrival day, folded into `into` as
     whoKey -> { n, age, day, cohort, platform, tier, slot }. `age` is how old
     the install was when it arrived; across several arrival days the latest
     (oldest age) wins.

     The key carries store, tier and sensor now, so a cohort that pinged from
     two stores is two entries rather than one — which is the point: they are
     two installs and the card draws them as two rows. */
  function whoGain(into, prevMap, nextMap, day) {
    Object.keys(nextMap || {}).forEach(function (k) {
      var r = (nextMap[k] || 0) - ((prevMap && prevMap[k]) || 0);
      if (!(r > 0)) return;
      var parts = String(k).split('|');
      var age = ageDays(parts[0], day);
      if (age === null) return;
      var e = into[k] || (into[k] = {
        n: 0, age: age, day: day,
        cohort: parts[0], platform: parts[1] || 'U', tier: parts[2] || '?', slot: parts[3] || '?',
      });
      e.n += r;
      if (age > e.age) { e.age = age; e.day = day; }
    });
  }

  /* Build rises for one arrival day and one route, pooled across the whole
     diff as platform|tier -> { version: count }. Pooled rather than kept per
     day on purpose: a group that ran one version on Tuesday and another on
     Wednesday is a group this diff cannot attribute, and pooling is what makes
     `versionFor` say so instead of picking the newer day's answer. */
  function buildGain(into, prevMap, nextMap) {
    Object.keys(nextMap || {}).forEach(function (k) {
      var a = (prevMap && prevMap[k]) || {};
      var b = nextMap[k] || {};
      Object.keys(b).forEach(function (v) {
        var r = (b[v] || 0) - (a[v] || 0);
        if (!(r > 0)) return;
        var g = into[k] || (into[k] = {});
        g[v] = (g[v] || 0) + r;
      });
    });
  }

  /**
   * The build behind one row, or the honest absence of one.
   *
   *   '1.26.0'   every ping sharing this row's platform and tier, on this
   *              route across this diff, came from that one version — so the
   *              row's own ping did too, and the claim is exact
   *   ''         nothing is known: no build rows, or the group's one version
   *              is the lambda's `?` (a build too old to name itself)
   *   null       AMBIGUOUS — the group holds two or more versions, and which
   *              one this row ran is not in the data. The row says nothing and
   *              the card footers the candidates
   *
   * The third case is the one worth being strict about. Version is counted
   * against platform x tier and never against the cohort key, so joining it to
   * a row is an inference; it happens to be a safe one almost always, because
   * two live builds rarely ping from the same store and tier inside one
   * five-minute refresh. When they do, guessing would put a version number on
   * a specific install that we cannot place there — which is precisely the
   * kind of confident wrong answer the rest of this dashboard is built to
   * avoid.
   */
  function versionFor(bd, kind, platform, tier) {
    var g = bd && bd[kind] && bd[kind][buildKey(platform, tier)];
    var keys = g ? Object.keys(g).filter(function (v) { return g[v] > 0; }) : [];
    if (keys.length > 1) return null;
    if (!keys.length) return '';
    return keys[0] === '?' ? '' : keys[0];
  }

  /** "builds: 1.26.0 x2 · 1.25.2" — what a card says when at least one of its
   *  rows could not be given a build. Every fact present, none of them falsely
   *  attached to an install. Empty when nothing was ambiguous. */
  function buildNote(bd, kind, rows) {
    var pool = {}, seen = {}, any = false;
    (rows || []).forEach(function (r) {
      if (r.version !== null) return;
      var k = buildKey(r.platform, r.tier);
      if (seen[k]) return;
      seen[k] = 1;
      any = true;
      var g = (bd && bd[kind] && bd[kind][k]) || {};
      Object.keys(g).forEach(function (v) { if (g[v] > 0) pool[v] = (pool[v] || 0) + g[v]; });
    });
    if (!any) return '';
    var list = Object.keys(pool).sort(function (a, b) {
      return (pool[b] - pool[a]) || (a < b ? -1 : a > b ? 1 : 0);
    }).map(function (v) {
      return (v === '?' ? 'unknown' : v) + (pool[v] > 1 ? ' \u00d7' + pool[v] : '');
    });
    return list.length ? 'builds: ' + list.join(' \u00b7 ') : '';
  }

  /**
   * One kind's `who` map, as the ordered list of rows a card draws.
   *
   * Youngest install first — the same order `cohortLine` sorts in, and the
   * useful one: a two-day-old install converting is the row you want at the
   * top. Rows are already grouped by construction, since two pings agreeing on
   * cohort, store, tier and sensor share a key and are one row with a count.
   */
  function rowList(whoMap, bd, kind) {
    var list = Object.keys(whoMap || {})
      .map(function (k) { return whoMap[k]; })
      .filter(function (e) { return e && e.n > 0; });
    list.sort(rowSort);
    list.forEach(function (e) { e.version = versionFor(bd, kind, e.platform, e.tier); });
    return list;
  }

  function addInto(into, from) {
    Object.keys(from || {}).forEach(function (k) {
      if (from[k] > 0) into[k] = (into[k] || 0) + from[k];
    });
  }

  /**
   * What changed between two snapshots. Rises only — see the sliding-window
   * note at the top.
   *
   * DAY BY DAY, not total against total, and the difference is the whole reason
   * a remembered baseline works at all. The report is a sliding 400-day window:
   * come back after two days away and it has dropped two old days off the back
   * as it gained two new ones at the front. Compared as totals, a flat week
   * nets to roughly nothing and the fortnight you missed announces itself as
   * silence. Compared per day, the two new days are two new days and the two
   * that left are simply not there to be a fall.
   *
   * A day the baseline never saw counts whole, which is exactly what "since you
   * last looked" means. Everything else is unchanged: a day whose count went
   * DOWN contributes zero rather than a negative, so a re-stamped or corrected
   * row can never read as an event.
   *
   * The totals path is kept for a baseline written before this shipped — a
   * snapshot in localStorage from the previous version has no `days`.
   *
   * A COUNTER THE BASELINE NEVER KNEW IS SKIPPED ENTIRELY. A stored snapshot
   * written before the activation counter existed has no `activations` field,
   * so every day in it would read as a rise from zero and the first refresh
   * after the deploy would announce a year of first readings as news. A
   * baseline is a claim about what you have already been told; silence about a
   * counter it never knew is the honest reading of it, and the snapshot it is
   * replaced with knows about it from then on. The reading counter is newer
   * still and gets its own gate for the same reason — one flag cannot answer
   * for two counters that shipped on different days.
   */
  function diff(prev, next) {
    var p = prev || snapshot(null);
    var n = next || snapshot(null);
    var actKnown = typeof p.activations === 'number';
    var readKnown = typeof p.readings === 'number';
    /* A baseline written before returns were counted in their own right. It
       still knows every open and every download, so the COUNT survives as the
       subtraction it always was; only the platform split is unavailable, and an
       empty `returnsBy` renders as no store line rather than as a wrong one. */
    var retKnown = typeof p.returns === 'number';
    /* The detail maps are keyed in a shape the baseline has to agree with, or
       every row in them reads as a rise from nothing — see SNAP_V. A baseline
       from before the shape changed keeps its counts and is skipped for
       detail, which costs one refresh of rows and cannot invent one. */
    var detail = p.v === SNAP_V && n.v === SNAP_V;
    var bd = { open: {}, sub: {}, act: {}, hrv: {} };
    var d;

    if (p.days && n.days) {
      d = { visitors: 0, downloads: 0, returns: 0, sales: 0, activations: 0, readings: 0,
            downloadsBy: {}, returnsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {},
            who: { downloads: {}, returns: {}, sales: {}, activations: {}, readings: {} } };
      Object.keys(n.days).forEach(function (key) {
        var a = p.days[key] || { opens: 0, downloads: 0, returns: 0, sales: 0, activations: 0, readings: 0,
                                 downloadsBy: {}, returnsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {} };
        var b = n.days[key];
        /* Who arrived. A baseline day that exists but carries no cohort map
           (written before this shipped, or too old to keep one) would make every
           cohort in it look new, so its detail is skipped; the COUNTS above it
           are unaffected, and a day the baseline never saw counts whole. */
        if (detail && b.who && (!p.days[key] || a.who)) {
          var aw = a.who || {};
          whoGain(d.who.downloads, aw.downloads, b.who.downloads, key);
          whoGain(d.who.returns, aw.returns, b.who.returns, key);
          whoGain(d.who.sales, aw.sales, b.who.sales, key);
          if (actKnown) whoGain(d.who.activations, aw.activations, b.who.activations, key);
          if (readKnown) whoGain(d.who.readings, aw.readings, b.who.readings, key);
        }
        /* The version side of the same rows, under the same guard: a day whose
           baseline had no build map would report every build in it as new. */
        if (detail && b.builds && (!p.days[key] || a.builds)) {
          var ab = a.builds || {};
          Object.keys(bd).forEach(function (kind) {
            buildGain(bd[kind], ab[kind], b.builds[kind]);
          });
        }
        d.visitors += rise(a.opens, b.opens);
        d.downloads += rise(a.downloads, b.downloads);
        d.sales += rise(a.sales, b.sales);
        addInto(d.downloadsBy, gain(a.downloadsBy, b.downloadsBy));
        addInto(d.salesBy, gain(a.salesBy, b.salesBy));
        if (retKnown) {
          d.returns += rise(a.returns, b.returns);
          addInto(d.returnsBy, gain(a.returnsBy, b.returnsBy));
        }
        if (readKnown) {
          d.readings += rise(a.readings, b.readings);
          addInto(d.readingsBy, gain(a.readingsBy, b.readingsBy));
        }
        if (!actKnown) return;
        d.activations += rise(a.activations, b.activations);
        addInto(d.activationsBy, gain(a.activationsBy, b.activationsBy));
      });
    } else {
      d = {
        visitors: rise(p.opens, n.opens),
        downloads: rise(p.downloads, n.downloads),
        returns: retKnown ? rise(p.returns, n.returns) : 0,
        sales: rise(p.sales, n.sales),
        activations: actKnown ? rise(p.activations, n.activations) : 0,
        readings: readKnown ? rise(p.readings, n.readings) : 0,
        downloadsBy: gain(p.downloadsBy, n.downloadsBy),
        returnsBy: retKnown ? gain(p.returnsBy, n.returnsBy) : {},
        salesBy: gain(p.salesBy, n.salesBy),
        activationsBy: actKnown ? gain(p.activationsBy, n.activationsBy) : {},
        readingsBy: readKnown ? gain(p.readingsBy, n.readingsBy) : {},
        who: { downloads: {}, returns: {}, sales: {}, activations: {}, readings: {} }
      };
    }

    /* What "returning" means, in one place. A counted return where the
       baseline knew about them; otherwise the subtraction this file always did,
       which is the same number without a store behind it. Never negative: a
       download is also an open, and a day's opens can be re-stated. */
    if (!retKnown) d.returns = Math.max(0, d.visitors - d.downloads);

    /* The rows a card draws: one per install behind each count, in the order
       they are read, with the build resolved or honestly missing. `who` stays
       on the diff beside them because `cohortLine` still folds it back into
       the one-line sentence the toast and the notification carry. */
    d.rows = {
      downloads: rowList(d.who.downloads, bd, 'open'),
      returns: rowList(d.who.returns, bd, 'open'),
      sales: rowList(d.who.sales, bd, 'sub'),
      activations: rowList(d.who.activations, bd, 'act'),
      readings: rowList(d.who.readings, bd, 'hrv'),
    };
    d.notes = {
      downloads: buildNote(bd, 'open', d.rows.downloads),
      returns: buildNote(bd, 'open', d.rows.returns),
      sales: buildNote(bd, 'sub', d.rows.sales),
      activations: buildNote(bd, 'act', d.rows.activations),
      readings: buildNote(bd, 'hrv', d.rows.readings),
    };

    d.any = d.visitors > 0 || d.downloads > 0 || d.sales > 0 || d.activations > 0 || d.readings > 0;
    return d;
  }

  /** "2 on iOS · 1 on Android", in a fixed order so it never shuffles. */
  function storeLine(by) {
    return ['I', 'A', 'U'].filter(function (k) { return (by || {})[k] > 0; })
      .map(function (k) { return by[k] + ' on ' + storeName(k); })
      .join(' · ');
  }

  /** "1 chest strap · 1 phone camera", in the order the app offers them. */
  function sensorLine(by) {
    return ['W', 'G', 'B', 'F', '?'].filter(function (k) { return (by || {})[k] > 0; })
      .map(function (k) { return by[k] + ' ' + sensorName(k); })
      .join(' · ');
  }

  /** "2 Pro · 1 free", from the rows behind a count. Lower case for the two
   *  that are adjectives in a sentence; `Pro` keeps its capital because it is
   *  the plan's NAME, spelled the way the paywall and Settings spell it. */
  function tierLine(rows) {
    var by = {};
    (rows || []).forEach(function (r) { by[r.tier] = (by[r.tier] || 0) + r.n; });
    return ['P', 'T', 'F', '?'].filter(function (k) { return by[k] > 0; })
      .map(function (k) {
        return by[k] + ' ' + (k === '?' ? 'tier unknown' : (k === 'P' ? 'Pro' : TIER[k].toLowerCase()));
      })
      .join(' \u00b7 ');
  }

  /** "1.26.0" / "1.25.2 ×2 · 1.26.0" — only the builds a row could be
   *  given. A refresh nothing could be attributed in says nothing. */
  function buildLine(rows) {
    var by = {};
    (rows || []).forEach(function (r) { if (r.version) by[r.version] = (by[r.version] || 0) + r.n; });
    var keys = Object.keys(by).sort();
    if (!keys.length) return '';
    if (keys.length === 1) return keys[0];
    return keys.map(function (v) { return v + (by[v] > 1 ? ' \u00d7' + by[v] : ''); }).join(' \u00b7 ');
  }

  /**
   * The one line the toast and the notification carry.
   *
   * Those two are not the card and must not try to be: a toast replaces itself
   * after a few seconds and a notification is read on a lock screen, so both
   * get the SENTENCE — what, from where, how old, on which tier and build —
   * where the card gets the table. The tier split is the part worth having in
   * a glance; the per-install breakdown is the part worth having in the
   * corner, where it stays until it is pressed.
   */
  function summaryLine(parts) {
    return parts.filter(function (x) { return !!x; }).join(' \u00b7 ');
  }

  function plural(n, one, many) { return n === 1 ? one : (many || (one + 's')); }

  /* "Aug 29", with the year only when it isn't the arrival's year. */
  function dateLabel(cohort, day) {
    var p = cohort.split('-');
    return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + (p[0] !== String(day).slice(0, 4) ? ' ' + p[0] : '');
  }

  /**
   * How old the installs behind an event are, from a diff's `who` map.
   *
   *   one cohort    "installed Aug 29, 12 days ago"  ("installed today" / "yesterday")
   *   several       "installed Sep 8 (2d), Aug 29 (12d) ×2, +3 more"
   *
   * Youngest first. Empty when nothing is known, so a caller can drop it.
   */
  function cohortLine(who, max) {
    /* The map is keyed per INSTALL now (cohort, store, tier, sensor), and this
       sentence is about cohorts — two installs from the same cohort on two
       stores are "Aug 29 x2" here and two rows on the card. So fold first, on
       the entry's own `cohort` where it has one and on the key's first segment
       where it does not, which keeps a caller passing a plain cohort map (the
       unit tests, and anything older) working unchanged. */
    var byCohort = {};
    Object.keys(who || {}).forEach(function (k) {
      var e = who[k];
      if (!e || !(e.n > 0)) return;
      var c = e.cohort || String(k).split('|')[0];
      var g = byCohort[c] || (byCohort[c] = { c: c, n: 0, age: e.age, day: e.day });
      g.n += e.n;
      if (e.age > g.age) { g.age = e.age; g.day = e.day; }
    });

    var list = Object.keys(byCohort).map(function (c) { return byCohort[c]; });
    if (!list.length) return '';
    list.sort(function (x, y) { return (x.age - y.age) || (x.c < y.c ? 1 : -1); });

    if (list.length === 1) {
      var e = list[0];
      if (e.age === 0) return 'installed today';
      return 'installed ' + dateLabel(e.c, e.day) + ', ' + (e.age === 1 ? 'yesterday' : e.age + ' days ago');
    }

    var cap = max || 3;
    var shown = list.slice(0, cap).map(function (e) {
      return (e.age === 0 ? 'today' : dateLabel(e.c, e.day) + ' (' + e.age + 'd)') + (e.n > 1 ? ' ×' + e.n : '');
    });
    var rest = list.slice(cap).reduce(function (a, e) { return a + e.n; }, 0);
    return 'installed ' + shown.join(', ') + (rest ? ', +' + rest + ' more' : '');
  }


  /** The key a row is one row FOR — the same tuple `whoKey` builds, read back
   *  off a row. */
  function rowKey(r) { return whoKey(r.cohort, r.platform, r.tier, r.slot); }

  function rowSort(x, y) {
    return (x.age - y.age)
      || (x.cohort < y.cohort ? 1 : x.cohort > y.cohort ? -1 : 0)
      || (x.platform < y.platform ? -1 : x.platform > y.platform ? 1 : 0)
      || (x.slot < y.slot ? -1 : x.slot > y.slot ? 1 : 0)
      || ((y.first ? 1 : 0) - (x.first ? 1 : 0));
  }

  function withFirst(r, first, n) {
    return {
      n: n, age: r.age, day: r.day, cohort: r.cohort, platform: r.platform,
      tier: r.tier, slot: r.slot, version: r.version, first: !!first,
    };
  }

  /**
   * Fold the first-reading rows INTO the reading rows.
   *
   * An activation and a reading are the same measurement counted twice: `act`
   * fires once per install ever and `hrv` once per install per Eastern day,
   * and both fire from the moment a reading completes — so an install's first
   * reading raises both, and the dashboard used to announce it as two cards,
   * two notifications and (in the same refresh) two lines of what is plainly
   * one event. There is one card now, and the rows that were a first wear a
   * FIRST tag.
   *
   * A row that is PART first is SPLIT, because it is genuinely two facts: with
   * `hrv` capped once per install per day, a group of two readings holding one
   * activation is one install measuring for the first time and one that has
   * done it before, and rolling them into "x2 First" would claim the wrong
   * thing about one of them.
   *
   * An activation with no reading beside it is kept rather than dropped. The
   * two routes shipped on different days and a ping can fail and retry into
   * the next refresh, so the pair can come apart; the reading happened either
   * way, and `extra` is what the headline has to add to `d.readings` to stay
   * true to the rows under it.
   */
  function mergeFirsts(readingRows, actRows) {
    var left = {};
    (actRows || []).forEach(function (r) {
      var k = rowKey(r);
      left[k] = (left[k] || 0) + r.n;
    });

    var out = [];
    (readingRows || []).forEach(function (r) {
      var k = rowKey(r);
      var f = Math.min(left[k] || 0, r.n);
      if (f > 0) left[k] -= f;
      if (!f) out.push(withFirst(r, false, r.n));
      else if (f >= r.n) out.push(withFirst(r, true, r.n));
      else {
        out.push(withFirst(r, true, f));
        out.push(withFirst(r, false, r.n - f));
      }
    });

    var extra = 0;
    (actRows || []).forEach(function (r) {
      var k = rowKey(r);
      var over = left[k] || 0;
      if (over <= 0) return;
      left[k] = 0;
      extra += over;
      out.push(withFirst(r, true, over));
    });

    out.sort(rowSort);
    return { rows: out, extra: extra };
  }

  /* ------------------------------------------------------------ settings */

  var BASE_KEY = 'autonomic.master.alertBase';
  var MUTE_KEY = 'autonomic.master.alertsMuted';

  /* How far back a remembered baseline is allowed to reach.

     A baseline is a claim about what you have already been told. Past a month
     it stops being one: the sliding window itself is only 400 days, the missing
     stretch is no longer "since you last looked" in any useful sense, and
     announcing three hundred downloads in one go is a number, not news. Past
     this, the stored snapshot seeds silently exactly as a first-ever sign-in
     does. */
  var MAX_CATCHUP_MS = 30 * 24 * 3600 * 1000;

  /**
   * The baseline, remembered across sessions.
   *
   * This is the one rule the original module got right for the wrong span of
   * time. "The first report of a session is a baseline, not news" was there to
   * stop a sign-in opening with a fanfare for a month of history — but it also
   * meant that everything which arrived while the dashboard was CLOSED was
   * silently absorbed into the new baseline and never mentioned. The page you
   * open in the morning had no way to tell you about the sale that came in
   * overnight; it just quietly drew a bigger number.
   *
   * So the baseline is stored, and the first report of a session is compared
   * against the last one the previous session saw. A browser that has never
   * held one still seeds silently — that is the case the original rule was
   * written for, and it is unchanged.
   *
   * It lives in localStorage rather than in the synced store on purpose: "what
   * this browser has already told me" is a property of this browser. Two
   * devices should each get the news once, and neither should swallow it for
   * the other.
   */
  var storedRead = false;

  function loadBase() {
    storedRead = true;
    try {
      var raw = window.localStorage.getItem(BASE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.snap || typeof p.snap.opens !== 'number') return null;
      if (!p.at || (Date.now() - p.at) > MAX_CATCHUP_MS) return null;
      return p.snap;
    } catch (e) { return null; }
  }

  function saveBase(snap) {
    try {
      window.localStorage.setItem(BASE_KEY, JSON.stringify({ at: Date.now(), snap: snap }));
    } catch (e) { /* private mode, or the quota is full — the session baseline still works */ }
  }
  var muted = false;
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* private mode */ }

  function setMuted(v) {
    muted = !!v;
    try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    syncButton();
  }

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  /* --------------------------------------------------------------- sound
   *
   * Synthesized, not sampled. The dashboard is inlined into one self-contained
   * document with nothing to resolve at runtime (see MASTER_DASHBOARD.md), so
   * an <audio src> is out and a base64 fanfare would be a hundred kilobytes of
   * the page. A handful of oscillators costs nothing and can be retuned in a
   * diff you can read.
   *
   * A browser will not let a page make noise before it has been touched, so the
   * context is created on the first real interaction — signing in is one — and
   * resumed on every use, because it can be suspended again at any point.
   */

  var actx = null;

  function audio() {
    if (muted) return null;
    try {
      if (!actx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        actx = new C();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }

  /**
   * One note, as an object rather than a positional tuple — a fanfare is a
   * dozen of these and `[783.99, 0.3, 0.18, 'sawtooth', 0.09]` is unreadable
   * five notes in.
   *
   *   f     frequency, Hz            v   peak gain
   *   at    offset from the downbeat  d   how long it takes to decay away
   *   type  oscillator shape          lp  lowpass corner, when it needs one
   *   to    frequency to glide to     dt  detune, cents (shimmer on a chord)
   *
   * The envelope is exponential in both directions: a linear ramp to zero
   * reads as a click, and a linear attack reads as a fade-in rather than a
   * strike.
   */
  function note(ctx, at, n, out) {
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    var dur = n.d;
    osc.type = n.type || 'sine';
    osc.frequency.setValueAtTime(n.f, at);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, at + dur * 0.5);
    if (n.dt) osc.detune.setValueAtTime(n.dt, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(n.v, at + (n.a || 0.008));
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(amp);
    /* A raw sawtooth is a buzz. A brass instrument is a sawtooth with the top
       taken off, which is all a lowpass is doing here. */
    if (n.lp) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(n.lp, at);
      amp.connect(f); f.connect(out);
    } else {
      amp.connect(out);
    }
    osc.start(at);
    osc.stop(at + dur + 0.06);
  }

  /* The three signatures. They are meant to be told apart across a room and
     with your back to the screen, so they differ in SHAPE and not only in
     pitch: two notes, three notes, or a fanfare with a held chord under it.
     They also climb in weight in the order the events matter.

     The visitor blip is the one that fires most often and it still has to be
     audible — the first version was one sine at 0.055 gain, which is a sound
     you have to already know is coming to hear at all. It is now a struck
     two-note interval (C6 up a fifth to G6, an octave of body underneath),
     short enough to stay out of the way at three times a refresh. */
  var VISITOR = [
    { f: 1046.50, at: 0,     d: 0.13, type: 'triangle', v: 0.20 },   // C6
    { f: 1567.98, at: 0.075, d: 0.26, type: 'triangle', v: 0.15 },   // G6
    { f: 523.25,  at: 0,     d: 0.12, type: 'sine',     v: 0.10 }    // C5, body
  ];

  /* An activation is a small good thing: two notes settling rather than
     rising, softer than a download and unmistakably not it. It is the app
     starting to work for somebody who already had it, which is worth hearing
     and is not an arrival. */
  var ACTIVATION = [
    { f: 783.99,  at: 0,     d: 0.15, type: 'triangle', v: 0.17 },   // G5
    { f: 1046.50, at: 0.085, d: 0.42, type: 'triangle', v: 0.16 },   // C6, rings
    { f: 392.00,  at: 0.085, d: 0.34, type: 'sine',     v: 0.09 }    // G4, body
  ];

  /* A reading is the quietest thing here that still gets said out loud: one
     struck note with a short body under it, softer than the activation above
     and unmistakably not it. It is somebody using the app they already have,
     which is the event this dashboard hopes to see all day — anything with a
     rise or a ring in it would wear out by lunchtime. */
  var READING = [
    { f: 880.00,  at: 0,    d: 0.16, type: 'triangle', v: 0.13 },   // A5
    { f: 440.00,  at: 0,    d: 0.13, type: 'sine',     v: 0.07 }    // A4, body
  ];

  /* A download ARRIVES, so it is three notes rising to a note that rings, with
     a low sine under the landing to give it weight. */
  var DOWNLOAD = [
    { f: 587.33,  at: 0,    d: 0.16, type: 'triangle', v: 0.20 },    // D5
    { f: 880.00,  at: 0.08, d: 0.18, type: 'triangle', v: 0.20 },    // A5
    { f: 1174.66, at: 0.16, d: 0.70, type: 'triangle', v: 0.19 },    // D6, rings
    { f: 1760.00, at: 0.16, d: 0.55, type: 'sine',     v: 0.07 },    // A6 sparkle
    { f: 293.66,  at: 0.16, d: 0.50, type: 'sine',     v: 0.14 }     // D4, weight
  ];

  /* The fanfare: a repeated-note pickup into a C major arpeggio and a held
     chord, brass-shaped, with the bass an octave and two below it. This is the
     only sound on the page allowed to take two seconds. */
  var SALE = [
    { f: 392.00,  at: 0.00, d: 0.13, type: 'sawtooth', v: 0.16, lp: 2600 },  // G4
    { f: 392.00,  at: 0.14, d: 0.12, type: 'sawtooth', v: 0.15, lp: 2600 },  // G4
    { f: 523.25,  at: 0.27, d: 0.17, type: 'sawtooth', v: 0.17, lp: 2800 },  // C5
    { f: 659.25,  at: 0.44, d: 0.15, type: 'sawtooth', v: 0.17, lp: 3000 },  // E5
    { f: 783.99,  at: 0.58, d: 0.17, type: 'sawtooth', v: 0.18, lp: 3200 },  // G5
    // the arrival: C6 over the triad, two voices a few cents apart so it moves
    { f: 1046.50, at: 0.76, d: 1.20, type: 'sawtooth', v: 0.17, lp: 3400 },
    { f: 1046.50, at: 0.76, d: 1.20, type: 'sawtooth', v: 0.09, lp: 3400, dt: 9 },
    { f: 783.99,  at: 0.76, d: 1.20, type: 'sawtooth', v: 0.11, lp: 3000 },
    { f: 659.25,  at: 0.76, d: 1.20, type: 'sawtooth', v: 0.10, lp: 3000 },
    { f: 261.63,  at: 0.76, d: 1.20, type: 'sawtooth', v: 0.11, lp: 1100 },  // C4
    { f: 130.81,  at: 0.76, d: 1.00, type: 'sine',     v: 0.16 }             // C3
  ];

  /* How loud the whole page is allowed to be. These cues have to carry across
     a room from a laptop speaker, and the first version summed into the
     destination at 0.75 — comfortably below the level any other tab plays at,
     which is why they read as "no sounds" rather than as quiet ones. */
  var MASTER_GAIN = 2.6;

  function play(score) {
    var ctx = audio();
    if (!ctx) return;
    /* One gain stage for the whole cue: the fanfare stacks five voices on its
       last chord, and summing them straight into the destination is how a
       celebration turns into a crackle.
       Past unity that crackle is a certainty rather than a risk, so the sum
       goes through a compressor on its way out. That is what buys the headroom
       to be loud: peaks are held down and the body of the cue comes up, where
       simply raising the gain would clip the chord and leave the quiet notes
       exactly as inaudible as they were. */
    var out = ctx.createGain();
    out.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);

    var comp = null;
    try {
      comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-20, ctx.currentTime);
      comp.knee.setValueAtTime(24, ctx.currentTime);
      comp.ratio.setValueAtTime(8, ctx.currentTime);
      comp.attack.setValueAtTime(0.004, ctx.currentTime);
      comp.release.setValueAtTime(0.22, ctx.currentTime);
    } catch (e) { comp = null; }

    if (comp) { out.connect(comp); comp.connect(ctx.destination); }
    else { out.gain.setValueAtTime(1, ctx.currentTime); out.connect(ctx.destination); }

    var now = ctx.currentTime + 0.02;
    score.forEach(function (n) { note(ctx, now + n.at, n, out); });
  }

  /* ------------------------------------------------------------ glitter
   *
   * One canvas, one RAF loop, and no loop at all while the screen is empty —
   * an idle animation frame every 16ms for the whole session is exactly the
   * kind of thing that turns a dashboard left open into a warm laptop.
   *
   * **Each event has its own metal, and the metal IS the news.** Told apart
   * across a room and with the sound off:
   *
   *   sale      GOLD    20 seconds, bursting from both edges
   *   download  SILVER  10 seconds, falling from the top
   *   visitor   COLOUR   3 seconds, a light puff from the top
   *
   * They run TOGETHER when they arrive together, each on its own emitter and
   * its own clock, sharing one shard list and one RAF loop.
   *
   * The colour puff is a deliberate reversal of the older rule
   * here, which was that the canvas belonged to arrivals only and that any
   * celebration of ordinary usage would run more or less permanently. That
   * argument was about DURATION, and it still holds: what makes the puff safe
   * is that it is over before it registers as an interruption, where a sale
   * runs for twenty seconds. The three durations are the ranking, so a glance
   * at the screen tells you which of the three happened without reading a word.
   *
   * Glitter rather than paper: the shards are small, they catch a highlight
   * along one edge, and each one twinkles on its own phase. A metallic palette
   * drawn as flat rectangles reads as grey confetti, not as silver.
   */

  var PALETTES = {
    /* Gold, from deep amber up to a near-white specular. The lightest two are
       rare on purpose — they are the glint, and a glint every third shard is
       just a pale palette. */
    sale: ['#8a5a00', '#b8860b', '#d4a017', '#e8c252', '#f5d97a', '#fff6d5', '#ffffff'],
    /* Silver, same shape: cold greys under two near-whites. */
    download: ['#6b7280', '#8b94a3', '#adb5bd', '#ced4da', '#e9ecef', '#f8f9fa', '#ffffff'],
    /* The house colours, for the puff that says somebody came back. */
    visit: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#ffffff']
  };

  /* How long the canvas keeps emitting, per event. Duration is the ranking:
     twenty seconds for money, ten for a new install, three for somebody coming
     back. */
  var DURATION = { sale: 20000, download: 10000, visit: 3000 };
  /* How often a wave leaves the emitter, and how big a wave is. A sale runs
     the longest at the lowest density per wave, or twenty seconds of it would
     be a wall rather than glitter. The three can now run AT ONCE, so each one's
     density is also its share of a crowded canvas. */
  var WAVE_MS = { sale: 620, download: 400, visit: 300 };
  var WAVE_N  = { sale: 24,  download: 40,  visit: 18 };

  var canvas = null, cctx = null, bits = [], raf = 0;

  /* The pure half of this file is unit-tested in a `window`-only sandbox with
     no document at all, and `announce` is reachable from there. Both effects
     therefore check for a DOM rather than assuming one — a missing canvas is
     already a no-op, and this makes a missing DOCUMENT one too. */
  function hasDom() { return typeof document !== 'undefined' && !!document; }

  function surface() {
    if (canvas) return canvas;
    if (!hasDom()) return null;
    var el = document.getElementById('confetti');
    if (!el) return null;
    /* A 2D context is not guaranteed — jsdom hands back null without the canvas
       package, and a locked-down browser can too. Everything downstream draws
       through `cctx`, so the celebration is skipped rather than thrown. */
    try { cctx = el.getContext('2d'); } catch (e) { cctx = null; }
    if (!cctx) return null;
    canvas = el;
    return canvas;
  }

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * One shard.
   *
   * `twinkle` is the per-shard phase offset that stops the field pulsing in
   * unison — the single thing that separates glitter from a swarm of coloured
   * rectangles. `flip` is how fast it tumbles edge-on, which is what makes a
   * shard vanish to a line and come back.
   */
  function piece(pal, x, y, vx, vy) {
    var w = 3 + Math.random() * 5;
    return {
      x: x, y: y, vx: vx, vy: vy,
      w: w, h: w * (0.5 + Math.random() * 0.7),
      rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.5,
      flip: 0.10 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      color: pal[(Math.random() * pal.length) | 0],
      life: 0, max: 260 + Math.random() * 220
    };
  }

  /** Falling from the top edge — the download celebration. */
  function rain(pal, n) {
    var w = window.innerWidth;
    for (var i = 0; i < n; i++) {
      bits.push(piece(pal, Math.random() * w, -20 - Math.random() * 120,
        (Math.random() - 0.5) * 1.4, 2 + Math.random() * 2.6));
    }
  }

  /** Shot from both edges toward the middle — the sale celebration. */
  function burst(pal, n) {
    var w = window.innerWidth, h = window.innerHeight;
    for (var i = 0; i < n; i++) {
      bits.push(piece(pal, w * (0.15 + Math.random() * 0.7), -10,
        (Math.random() - 0.5) * 7, 4 + Math.random() * 5));
      bits.push(piece(pal, w * (0.15 + Math.random() * 0.7), h + 10,
        (Math.random() - 0.5) * 7, -(9 + Math.random() * 5)));
    }
  }

  /** A light puff across the top — the visitor cue. */
  function puff(pal, n) {
    var w = window.innerWidth;
    for (var i = 0; i < n; i++) {
      bits.push(piece(pal, Math.random() * w, -12 - Math.random() * 40,
        (Math.random() - 0.5) * 2.2, 3 + Math.random() * 3.4));
    }
  }

  function step() {
    var h = window.innerHeight;
    cctx.clearRect(0, 0, window.innerWidth, h);
    bits = bits.filter(function (b) {
      b.life += 1;
      b.vy += 0.16;              // gravity
      b.vx *= 0.992;             // drag, so a burst fans out and settles
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.spin;
      if (b.y > h + 40 || b.life > b.max) return false;

      /* Tumble: the shard is drawn at its true width scaled by how edge-on it
         currently is, so it narrows to a line and opens out again. `catchLight`
         peaks at the same moment the face is square to the viewer, which is
         when a real flake would flash. */
      var face = Math.cos(b.life * b.flip + b.phase);
      var open = Math.abs(face);
      var catchLight = open * open;
      var fade = b.life > b.max - 90 ? Math.max(0, (b.max - b.life) / 90) : 1;

      cctx.save();
      cctx.translate(b.x, b.y);
      cctx.rotate(b.rot);
      cctx.globalAlpha = fade * (0.45 + 0.55 * open);
      cctx.fillStyle = b.color;
      cctx.fillRect(-b.w / 2 * open, -b.h / 2, Math.max(0.6, b.w * open), b.h);
      /* The specular edge. Cheap, and it is the whole reason the palette above
         reads as metal rather than as beige and grey. */
      if (catchLight > 0.55) {
        cctx.globalAlpha = fade * (catchLight - 0.55) * 2.0;
        cctx.fillStyle = '#ffffff';
        cctx.fillRect(-b.w / 2 * open, -b.h / 2, Math.max(0.6, b.w * open), Math.max(0.6, b.h * 0.3));
      }
      cctx.restore();
      return true;
    });
    if (bits.length) raf = window.requestAnimationFrame(step);
    else { raf = 0; cctx.clearRect(0, 0, window.innerWidth, h); }
  }

  /**
   * Celebrate `kind`.
   *
   * **The three kinds run AT ONCE.** Gold from the edges, silver down the
   * middle and a puff of house colour are three different pictures, and a
   * refresh that carried a sale, a new install and somebody coming back should
   * show all three of them — that IS the news, and picking one to draw threw
   * two thirds of it away. Only the SOUND still ranks (see `announce`): three
   * simultaneous cues are a noise, three simultaneous emitters are a party.
   *
   * So each kind owns its own emitter — its own clock, its own wave interval,
   * its own palette — and they share only the shard list and the one RAF loop
   * that draws it.
   *
   * **Count stacks at a decayed rate, halving every time.** Two sales are
   * twenty seconds plus ten, three are twenty plus ten plus five: more money is
   * visibly more celebration, and the series converges (to twice the base) so a
   * hundred of them can never wedge the canvas on for an hour. The decay
   * carries ACROSS refreshes while an emitter is still running — a second sale
   * arriving inside the first one's twenty seconds is the second sale of that
   * celebration, not a fresh one — and `seen` resets once the emitter falls
   * silent.
   */
  var EMITTERS = {};        // kind -> { until, timer, seen, boost }

  function emitterFor(kind) {
    return EMITTERS[kind] || (EMITTERS[kind] = { until: 0, timer: 0, seen: 0, boost: 1 });
  }

  /* base + base/2 + base/4 … for `n` more events, starting from however many
     this run has already counted. */
  function stackedMs(base, already, n) {
    var add = 0;
    for (var i = 0; i < n; i++) add += base / Math.pow(2, already + i);
    return add;
  }

  function celebrate(kind, count) {
    if (reducedMotion()) return;
    if (!surface()) return;
    sizeCanvas();

    var pal = PALETTES[kind] || PALETTES.visit;
    var base = DURATION[kind] || DURATION.visit;
    var n = Math.max(1, Math.round(count) || 1);
    var e = emitterFor(kind);
    var now = Date.now();

    if (e.until <= now) { e.seen = 0; e.until = now; }
    e.until += stackedMs(base, e.seen, n);
    e.seen += n;
    /* Density bonus on top of the duration, capped: three downloads at once are
       heavier as well as longer. */
    e.boost = Math.min(2.2, 1 + (e.seen - 1) * 0.25);

    var shoot = function () {
      var w = Math.round((WAVE_N[kind] || WAVE_N.visit) * e.boost);
      if (kind === 'sale') burst(pal, w);
      else if (kind === 'download') rain(pal, w);
      else puff(pal, w);
      if (!raf) raf = window.requestAnimationFrame(step);
      if (Date.now() >= e.until) {
        window.clearInterval(e.timer);
        e.timer = 0;
        e.seen = 0;
        e.boost = 1;
      }
    };

    shoot();
    if (!e.timer && e.until > Date.now() + 60) {
      e.timer = window.setInterval(shoot, WAVE_MS[kind] || WAVE_MS.visit);
    }
  }

  /* ---------------------------------------------------------------- cards
   *
   * Bottom right, newest at the bottom, and they STAY until they are dismissed.
   * Deliberately not the toast, in two ways: the toast is one line that
   * replaces itself, where two downloads inside ten minutes should read as two
   * things happening; and the toast disappears on a timer, where the whole
   * point of this stack is to still be there when you come back to the laptop.
   *
   * What that costs is bounded rather than unbounded. The stack scrolls once it
   * is taller than the viewport allows, it clears in one press, and past
   * `MAX_CARDS` the oldest is dropped — a dashboard left open over a weekend
   * should not hold nine hundred DOM nodes to tell you the same thing.
   */

  var MAX_CARDS = 40;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function cardEls() {
    var stack = document.getElementById('alertStack');
    return stack ? [].slice.call(stack.querySelectorAll('.alert-card')) : [];
  }

  function remove(el) {
    el.classList.remove('on');
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      syncClear();
    }, 260);
  }

  /** The "Clear all" control only exists while there is more than one to clear. */
  function syncClear() {
    var btn = document.getElementById('alertClear');
    if (!btn) return;
    btn.classList.toggle('hidden', cardEls().length < 2);
  }

  function clearAll() { cardEls().forEach(remove); }

  /* One glyph per kind, so a card is identified before it is read — the left
     edge carries the same distinction in colour (styles.css). */
  var MARK = { sale: '💸', download: '📲', activation: '💓', reading: '🫀', visit: '👋' };

  /* The chip classes the two install facts wear. Kept as maps rather than
     built from the letter, so an unrecognised letter lands on the `unk`
     treatment instead of producing a class that styles nothing. */
  var PLAT_CLASS = { I: 'ios', A: 'and', U: 'unk' };
  var TIER_CLASS = { P: 'pro', T: 'trial', F: 'free' };

  /** "Today" / "Aug 29 · day 17", for one row.
   *
   *  Short, because a row is one LINE and this shares it with three chips, a
   *  build and a count. "Installed 17 days old" spelled out pushed every row
   *  onto a second line, and on a busy morning — 31 readings, 59 returns —
   *  that is the difference between a card you can read and a card that is
   *  mostly "+34 more".
   *
   *  "day 17" rather than a bare "17d" because a row on a READING card sits
   *  beside a sensor and a time, and a bare date there reads as the date of
   *  the reading. "day 17" can only be the install's age, which is the one
   *  thing it is. The full sentence is on the row's hover title. */
  function installedText(r) {
    if (r.age === 0) return 'Today';
    return dateLabel(r.cohort, r.day) + ' \u00b7 day ' + r.age;
  }

  /** The same fact spelled out, for the row's hover title — the short form on
   *  the row is what fits, this is what it means. */
  function installedTitle(r) {
    if (r.age === 0) return 'Installed today';
    return 'Installed ' + dateLabel(r.cohort, r.day) + ', ' +
      (r.age === 1 ? 'yesterday' : r.age + ' days ago');
  }

  /**
   * One install, as the card inside the card.
   *
   * Two levels, and the split is the same on all five kinds: the CHIPS are
   * what you scan (store, tier, and on a reading route the sensor), the
   * sub-line is what you read once you have stopped (when they installed, how
   * old that makes them, which build they are on).
   *
   * A row with no build says nothing about one rather than guessing — see
   * `versionFor`. A build that is known to be unnameable says so out loud,
   * because an install still running a build from before the version token is
   * a fact worth seeing and is not the same as silence.
   */
  function rowHtml(r) {
    var build = '';
    if (r.version) build = '<span class="alert-build">' + esc(r.version) + '</span>';
    else if (r.version === '') build = '<span class="alert-build unknown">build unknown</span>';
    // r.version === null is AMBIGUOUS: the row says nothing and the card's
    // footer names the candidates. See `versionFor`.

    return '<div class="alert-row" title="' + esc(installedTitle(r)) + '">' +
      '<div class="alert-row-main">' +
        '<span class="alert-chip plat ' + (PLAT_CLASS[r.platform] || 'unk') + '">' +
          '<i aria-hidden="true"></i>' + esc(storeChip(r.platform)) + '</span>' +
        '<span class="alert-chip tier ' + (TIER_CLASS[r.tier] || 'unk') + '">' +
          esc(tierName(r.tier)) + '</span>' +
        (SENSOR_CHIP[r.slot] ? '<span class="alert-chip sensor">' + esc(SENSOR_CHIP[r.slot]) + '</span>' : '') +
        (r.first ? '<span class="alert-chip first">First</span>' : '') +
        /* The install date and the build travel together: when a row is too
           wide to fit, it has to break between the CHIPS and the meta, never
           between the date and the build — a stranded "1.26.0" on a line of
           its own reads as a fault. */
        '<span class="alert-meta">' +
          '<span class="alert-inst">' + esc(installedText(r)) + '</span>' + build +
        '</span>' +
      '</div>' +
      (r.n > 1 ? '<span class="alert-n">\u00d7' + r.n + '</span>' : '') +
      '</div>';
  }

  /** The rows of one card, with whatever is left over counted in a tail.
   *  `limit` is 0 for "draw them all" — see MAX_ROWS. */
  function rowsHtml(rows, note, limit) {
    if (!rows || !rows.length) return '';
    var cap = limit > 0 ? limit : rows.length;
    var shown = rows.slice(0, cap);
    var rest = rows.slice(cap).reduce(function (a, r) { return a + r.n; }, 0);
    var tail = [];
    if (rest) tail.push('+' + rest + ' more');
    if (note) tail.push(note);
    return '<div class="alert-rows">' + shown.map(rowHtml).join('') +
      (tail.length ? '<div class="alert-more">' + esc(tail.join(' \u00b7 ')) + '</div>' : '') +
      '</div>';
  }

  /* ------------------------------------------------------- today's record
   *
   * A card is dismissed by pressing it, and until this existed that press was
   * the only copy: the sale you cleared at nine was gone at noon. So every card
   * raised is also written to a log of TODAY, which is what the Alerts button
   * in the header replays — the day's news, in order, re-raised as the same
   * cards. The log rolls over on the dashboard's own local midnight (this is
   * "what has this room been told today", not a ping bucket), and it lives in
   * localStorage for the same reason the baseline does: it is a property of
   * this browser and neither device should swallow the other's.
   */

  var LOG_KEY = 'autonomic.master.alertLog';

  /* How far back the history reaches, and how much of it is kept.

     The log used to hold TODAY and be thrown away at midnight, because the
     only thing that read it re-raised the day's cards into the corner stack.
     What reads it now is a drawer with a heading per day, and "what did I miss
     over the weekend" is the question it exists to answer — so it keeps a
     fortnight. Both bounds are real: `LOG_DAYS` is what the drawer can show,
     `MAX_LOG` is what localStorage will hold without the quota becoming this
     module's problem, and the older half of a very busy fortnight is what goes
     when they disagree. */
  var LOG_DAYS = 14;
  var MAX_LOG = 400;

  function localDay(ms) {
    var d = ms === undefined ? new Date() : new Date(ms);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* The local day `n` days before today, as the cut-off for the window above.
     Built by walking a Date rather than by subtracting from a string, so a
     month boundary and a DST change are the platform's problem. */
  function dayBefore(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return localDay(d.getTime());
  }

  /**
   * Every alert this browser has been told about, oldest first, inside the
   * window above.
   *
   * Stamped with the LOCAL day it was raised on, which is the dashboard's own
   * day and deliberately not the ping bucket: this is "what has this room been
   * told", and the room is in one time zone.
   *
   * A log written by the previous version is `{ day, items }` — one day, with
   * the day on the outside. It is read rather than discarded: today's entries
   * are carried into the new shape and anything older is dropped, which is
   * exactly what the old reader did with it.
   */
  function readLog() {
    try {
      var raw = window.localStorage.getItem(LOG_KEY);
      if (!raw) return [];
      var o = JSON.parse(raw);
      if (!o) return [];
      var items;
      if (Array.isArray(o.items) && o.day) {
        // the old single-day shape
        items = o.day === localDay() ? o.items.map(function (it) {
          return { kind: it.kind, title: it.title, line: it.line, rows: it.rows, note: it.note, at: it.at, day: o.day };
        }) : [];
      } else if (Array.isArray(o.items)) {
        items = o.items;
      } else {
        return [];
      }
      var floor = dayBefore(LOG_DAYS - 1);
      return items.filter(function (it) {
        return it && it.day >= floor;
      });
    } catch (e) { return []; }
  }

  function writeLog(items) {
    try {
      window.localStorage.setItem(LOG_KEY, JSON.stringify({ v: 2, items: items }));
    } catch (e) { /* private mode, or the quota is full */ }
  }

  /* The record holds the ROWS as well as the sentence, because the drawer
     draws the same card and a history that lost its breakdown would be a worse
     copy of the thing it is a record of. Rows are plain data by construction
     (`whoGain` builds nothing but numbers and letters), so they serialise as
     they stand. */
  function logCard(kind, info) {
    var now = Date.now();
    var items = readLog();
    items.push({
      kind: kind, title: info.title, line: info.line || '',
      rows: info.rows || [], note: info.note || '', at: now, day: localDay(now),
    });
    while (items.length > MAX_LOG) items.shift();
    writeLog(items);
    if (drawerOpen()) renderHistory();
  }

  function clockOf(ms) {
    try {
      return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  /**
   * Re-raise every card today has already produced. The stack is emptied first,
   * so pressing the button twice shows the same day once rather than two of it.
   */
  /* ------------------------------------------------------------- history
   *
   * Pressing Alerts opens a drawer from the right holding everything this
   * browser has been told about, newest first, under a heading per day.
   *
   * It used to re-raise the day's cards into the corner stack, which had two
   * problems and they are different ones. The stack is where LIVE news
   * arrives and is dismissed; filling it with a record you are reading puts
   * the two in one slot, and a real alert landing mid-read is then
   * indistinguishable from the replay around it. And the log was today only,
   * where the question the button answers — what did I miss — reaches back
   * over a weekend.
   */

  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  /** "September 1, 2026", from a local day key. */
  function dayHeading(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
    if (!m) return key || '';
    return MONTHS_LONG[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
  }

  function drawerOpen() {
    var el = hasDom() && document.getElementById('alertDrawer');
    return !!(el && el.classList.contains('open'));
  }

  /**
   * Draw the whole history into the drawer.
   *
   * Newest day first and, inside a day, newest first — the drawer opens on
   * what just happened, which is what it was opened to see. It rebuilds
   * wholesale rather than appending, because a new alert arriving while it is
   * open has to land at the top of today's group and not at the bottom of the
   * list.
   */
  function renderHistory() {
    if (!hasDom()) return 0;
    var body = document.getElementById('alertDrawerBody');
    if (!body) return 0;
    var items = readLog();

    if (!items.length) {
      body.innerHTML = '<p class="drawer-empty">Nothing has happened yet. ' +
        'Downloads, sales and readings land here as they arrive.</p>';
      return 0;
    }

    var order = [];
    var byDay = {};
    items.slice().reverse().forEach(function (it) {
      var d = it.day || localDay(it.at);
      if (!byDay[d]) { byDay[d] = []; order.push(d); }
      byDay[d].push(it);
    });

    body.innerHTML = order.map(function (d) {
      return '<section class="drawer-day">' +
        '<h3 class="drawer-date">' + esc(dayHeading(d)) + '</h3>' +
        byDay[d].map(function (it) {
          return '<article class="alert-card ' + it.kind + ' on">' +
            cardHtml(it.kind, {
              title: it.title, line: it.line, rows: it.rows, note: it.note, when: clockOf(it.at),
            }, false, 0) +
            '</article>';
        }).join('') +
        '</section>';
    }).join('');
    body.scrollTop = 0;
    return items.length;
  }

  /** Open the history drawer. Returns how many alerts it is showing. */
  function openHistory() {
    if (!hasDom()) return 0;
    var el = document.getElementById('alertDrawer');
    var scrim = document.getElementById('alertScrim');
    var n = renderHistory();
    if (!el) return n;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.remove('hidden');
    // One frame later, so the transition has a state to leave from.
    window.requestAnimationFrame(function () {
      el.classList.add('open');
      if (scrim) scrim.classList.add('open');
    });
    var x = document.getElementById('alertDrawerClose');
    if (x && x.focus) { try { x.focus(); } catch (e) { /* not focusable yet */ } }
    return n;
  }

  function closeHistory() {
    if (!hasDom()) return;
    var el = document.getElementById('alertDrawer');
    var scrim = document.getElementById('alertScrim');
    if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
    if (scrim) scrim.classList.remove('open');
    /* Hidden only once it has finished sliding out, or the panel would vanish
       rather than leave. */
    window.setTimeout(function () {
      if (el && !el.classList.contains('open')) el.classList.add('hidden');
      if (scrim && !scrim.classList.contains('open')) scrim.classList.add('hidden');
    }, 280);
  }

  function toggleHistory() {
    return drawerOpen() ? (closeHistory(), 0) : openHistory();
  }

  /**
   * Raise one card: a header that says what happened, and under it one row per
   * install behind it.
   *
   * `info.line` is the one-line summary the card used to be, and it is still
   * the fallback rather than dead weight — a diff with no rows to draw (a
   * baseline in the old shape, for one refresh; a caller that passes counts
   * and nothing else) renders exactly the card this file has always rendered
   * instead of a header with nothing under it.
   */
  /**
   * One card's contents, shared by the live stack and the history drawer so
   * the two can never draw the same event differently.
   *
   * `dismissible` is the whole of the difference: a card in the corner is news
   * you clear, a card in the drawer is a record you read. The × is the only
   * part that changes, because everything else about the event is the same
   * event.
   */
  function cardHtml(kind, info, dismissible, limit) {
    var rows = rowsHtml(info.rows, info.note, limit);
    return '<div class="alert-head">' +
        '<span class="alert-mark" aria-hidden="true">' + MARK[kind] + '</span>' +
        '<span class="alert-title">' + esc(info.title) + '</span>' +
        (info.when ? '<span class="alert-when">' + esc(info.when) + '</span>' : '') +
        (dismissible ? '<button class="alert-x" aria-label="Dismiss">×</button>' : '') +
      '</div>' +
      (rows || (info.line ? '<div class="alert-line">' + esc(info.line) + '</div>' : ''));
  }

  function card(kind, info, replay) {
    if (!hasDom()) return;
    var stack = document.getElementById('alertStack');
    if (!stack) return;
    if (!replay) logCard(kind, info);
    var el = document.createElement('div');
    el.className = 'alert-card ' + kind;
    el.innerHTML = cardHtml(kind, info, true, MAX_ROWS);
    stack.appendChild(el);
    // One frame later, so the transition has a state to leave from.
    window.requestAnimationFrame(function () { el.classList.add('on'); });
    el.addEventListener('click', function () { remove(el); });

    var all = cardEls();
    while (all.length > MAX_CARDS) { var old = all.shift(); if (old.parentNode) old.parentNode.removeChild(old); }
    syncClear();
    // Newest card visible once the stack is long enough to scroll.
    stack.scrollTop = stack.scrollHeight;
  }

  /* -------------------------------------------------------------- announce */

  /* ---------------------------------------------------------- other rooms
   *
   * The card is the record and it stays until it is pressed. Two more channels
   * carry the same sentence to somewhere the card is not:
   *
   *   the TOAST, because the card stack lives in one corner and a dashboard on
   *   a phone is mostly not that corner. It is the same line, said once,
   *   wherever you are on the page.
   *
   *   a NOTIFICATION, for the window you are not currently looking at. `pwa.js`
   *   owns the rules and refuses unless permission was granted and the document
   *   has lost focus, so this can be called unconditionally.
   *
   * Both are best-effort. Neither may throw into the middle of a celebration:
   * the toast lives in app.js, which is a later script, and the notification
   * lives behind a permission that can be revoked between one refresh and the
   * next.
   */

  function say(line) {
    try {
      if (window.Dashboard && window.Dashboard.toast) window.Dashboard.toast(line);
    } catch (e) { /* never block the rest of the announcement */ }
  }

  function push(title, body, tag) {
    try {
      if (window.Pwa && window.Pwa.notify) window.Pwa.notify({ title: title, body: body, tag: tag });
    } catch (e) { /* ditto */ }
  }

  /**
   * Say what changed. Only ONE sound plays per refresh, the best outcome that
   * happened (pay > sign up > return): a fanfare and a chime and a blip fired
   * together is a noise, not three pieces of news. Cards do stack, because they
   * are read rather than heard — and so does the CANVAS, which ranks nothing:
   * a refresh carrying a sale, a new install and somebody coming back draws
   * gold, silver and colour at the same time.
   */
  function announce(d) {
    /* How old the installs behind each event are ("installed Aug 29, 12 days
       ago"). A download is always "today", so it carries none. */
    var who = d.who || {};

    var rows = d.rows || {};
    var notes = d.notes || {};

    if (d.sales > 0) {
      var saleTitle = d.sales + ' new ' + plural(d.sales, 'sale') + '!';
      var saleLine = summaryLine([
        storeLine(d.salesBy), cohortLine(who.sales),
        tierLine(rows.sales), buildLine(rows.sales),
      ]);
      card('sale', { title: saleTitle, line: saleLine, rows: rows.sales, note: notes.sales });
      say(saleTitle + ' ' + saleLine);
      push('💸 ' + saleTitle, saleLine, 'autonomic-sale');
      play(SALE);
      celebrate('sale', d.sales);
    }

    if (d.downloads > 0) {
      var dlTitle = d.downloads + ' new ' + plural(d.downloads, 'download') + '!';
      /* No cohort clause: a first run is always "installed today", which is
         what makes it a download in the first place. */
      var dlLine = summaryLine([
        storeLine(d.downloadsBy), tierLine(rows.downloads), buildLine(rows.downloads),
      ]);
      card('download', { title: dlTitle, line: dlLine, rows: rows.downloads, note: notes.downloads });
      /* One toast per refresh: a sale already said the louder half, and two
         toasts in a row replace each other so fast the first is unreadable. */
      if (!d.sales) say(dlTitle + ' ' + dlLine);
      push('📲 ' + dlTitle, dlLine, 'autonomic-download');
      if (!d.sales) play(DOWNLOAD);
      /* Its own silver, alongside a sale's gold rather than instead of it: the
         two are different pictures and a refresh that carried both should show
         both. Only the sound ranks. */
      celebrate('download', d.downloads);
    }
    /* Readings, and the FIRST readings folded into them.
     *
     * A first reading used to raise a card, a chime and a notification of its
     * own, directly above a reading card counting the very same measurement —
     * `act` fires once per install ever and `hrv` once per install per
     * Eastern day, and BOTH fire the moment a reading completes. Two
     * announcements of one event read as two events, which is the one thing
     * an alert must never do. So there is one card, and the rows that were a
     * first wear a FIRST tag; `mergeFirsts` is where that happens, and where
     * a part-first group is SPLIT, since with `hrv` capped daily those really
     * are two different installs.
     *
     * What a first still earns is the SOUND. The activation chime is two
     * notes settling where the reading tap is one, and a card carrying a
     * first is the difference between somebody using the app and somebody
     * starting to — worth hearing, not worth a second card.
     *
     * Like the activation card before it, this gets every channel a download
     * gets EXCEPT the canvas: this is the app being USED, the thing this
     * dashboard hopes to see all day, so confetti for it would be confetti
     * permanently and a sale's confetti would then mean nothing. */
    var merged = mergeFirsts(rows.readings, rows.activations);
    /* `extra` is an activation whose reading ping did not land in the same
       diff — the two routes shipped on different days and a ping can fail and
       retry into the next refresh. The reading happened either way, so the
       headline counts it rather than sitting above a row it does not cover. */
    var readTotal = d.readings + merged.extra;
    var firsts = merged.rows.reduce(function (a, r) { return a + (r.first ? r.n : 0); }, 0);
    if (readTotal > 0) {
      /* When every reading in the card is a first, that IS the news and the
         title says so, with the exclamation mark the activation card used to
         carry. Otherwise the count leads and the tags do the rest: a sentence
         that shouts every time somebody takes their morning reading stops
         being read. */
      var readTitle = (firsts && firsts === readTotal)
        ? firsts + ' first ' + plural(firsts, 'reading') + '!'
        : readTotal + ' ' + plural(readTotal, 'reading') + ' today' +
          (firsts ? ', ' + firsts + ' a first' : '');
      var readLine = summaryLine([
        sensorLine(d.readingsBy), cohortLine(who.readings),
        tierLine(merged.rows), buildLine(merged.rows),
      ]);
      card('reading', { title: readTitle, line: readLine, rows: merged.rows, note: notes.readings });
      if (!d.sales && !d.downloads) {
        say(readTitle + (readLine ? ' \u00b7 ' + readLine : ''));
        play(firsts ? ACTIVATION : READING);
      }
      push((firsts ? '\ud83d\udc93 ' : '\ud83e\udec0 ') + readTitle, readLine, 'autonomic-reading');
    }
    /* RETURNING users, so the new installs are taken out of it: a first run is
       also an open, and it already has ten seconds of silver of its own. The
       diff counts them in their own right now, which is what carries the store
       letter — a subtraction has no platform. */
    var returning = d.returns || 0;
    /* A return gets a CARD and a TOAST, and still no notification. The card is
       the part that cannot be lost: it is the event that fires most often, so
       it used to be the one thing announced only in a slot it almost never won
       — a refresh carrying a single morning reading swallowed every return in
       it, and the news that somebody came back was gone with the toast that
       never appeared. A card stays until it is pressed and is replayed by the
       Alerts button, which is where a frequent event belongs. A notification
       still is not: that one leaves the page, and a push for every open is the
       fastest way to have pushes turned back off.

       The LINE says which store and how old the installs are, the same two
       facts a download card carries, because "3 returning visitors" on its own
       is a number with nobody behind it.

       Its TOAST yields only to the two ARRIVALS above (a sale, a new install).
       It deliberately outranks the activation and reading toasts, which is a
       reordering rather than a new interruption: there is one toast element and
       it replaces itself, so the question is only which single line is worth
       reading, and those two already have cards of their own holding the same
       sentence. Nothing is lost by letting the return speak. */
    if (returning > 0) {
      var visTitle = returning + ' returning ' + plural(returning, 'visitor');
      var visLine = summaryLine([
        storeLine(d.returnsBy), cohortLine(who.returns),
        tierLine(rows.returns), buildLine(rows.returns),
      ]);
      card('visit', { title: visTitle, line: visLine, rows: rows.returns, note: notes.returns });
      if (!d.sales && !d.downloads) say(summaryLine([visTitle, visLine]));
    }
    /* The blip is still the quietest cue there is and still yields to
       everything, returns included: a sound is an interruption where a card is
       not, and this is the event that happens all day. */
    if (!d.sales && !d.downloads && !d.activations && !d.readings && d.visitors > 0) {
      play(VISITOR);
    }
    /* Three seconds of house-coloured glitter, and it runs whatever else
       happened — the canvas ranks nothing, only the sound does. */
    if (returning > 0) celebrate('visit', returning);
  }

  /* ---------------------------------------------------------------- shell */

  var base = null;

  /**
   * Hand the module a freshly fetched PINGS report. Returns the diff it
   * announced, or null when there was nothing to say.
   *
   * The first report of a session is compared against the baseline the LAST
   * session left behind, so opening the dashboard in the morning tells you
   * about the night. Only a browser that has never held one — a first sign-in,
   * or a baseline older than `MAX_CATCHUP_MS` — seeds in silence.
   */
  function sync(report) {
    var next = snapshot(report);
    var prev = base;
    if (!prev && !storedRead) prev = loadBase();
    base = next;
    saveBase(next);
    if (!prev) return null;
    var d = diff(prev, next);
    if (!d.any) return null;
    announce(d);
    return d;
  }

  /** Throw away the baseline, so the next report seeds instead of alerting. */
  function reset() {
    base = null;
    storedRead = true;   // and don't go and read the stored one instead
  }

  /* The bell still SHOWS whether sound is on, because that is a state worth
     seeing; it is no longer what turns it off. Pressing it replays the day. */
  function syncButton() {
    var btn = document.getElementById('btnAlerts');
    if (!btn) return;
    btn.dataset.muted = muted ? 'true' : 'false';
    btn.title = muted ? 'Show alerts history (sound is off)' : 'Show alerts history';
  }

  function init() {
    var clear = document.getElementById('alertClear');
    if (clear) clear.addEventListener('click', clearAll);
    syncClear();

    /* Pressing Alerts opens the history, it does not silence anything. A button
       whose one job was muting was a button you pressed by accident and then
       heard nothing for the rest of the afternoon; the thing actually wanted
       from that corner is "what have I missed", and every card raised is
       already logged for exactly that. Muting survives as `setMuted`, which
       nothing in the header calls.

       It TOGGLES, because the button is the only thing on the page that looks
       like the drawer's handle and pressing it twice should not leave you
       hunting for the close. */
    var btn = document.getElementById('btnAlerts');
    if (btn) btn.addEventListener('click', toggleHistory);
    syncButton();

    var drawerX = document.getElementById('alertDrawerClose');
    if (drawerX) drawerX.addEventListener('click', closeHistory);
    var scrim = document.getElementById('alertScrim');
    if (scrim) scrim.addEventListener('click', closeHistory);
    window.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && drawerOpen()) closeHistory();
    });

    /* Build the audio context on the first gesture of the session. Without it
       the first alert of the day is silent, and it is the one most worth
       hearing. */
    var unlock = function () {
      audio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    window.addEventListener('resize', function () { if (raf) sizeCanvas(); });
  }

  window.Alerts = {
    // pure
    snapshot: snapshot, diff: diff, storeLine: storeLine, sensorLine: sensorLine, cohortLine: cohortLine,
    tierLine: tierLine, buildLine: buildLine, versionFor: versionFor, buildNote: buildNote,
    mergeFirsts: mergeFirsts,
    stackedMs: stackedMs, DURATION: DURATION,
    // shell
    init: init, sync: sync, reset: reset, announce: announce, clearAll: clearAll,
    openHistory: openHistory, closeHistory: closeHistory, toggleHistory: toggleHistory,
    renderHistory: renderHistory, dayHeading: dayHeading,
    isMuted: function () { return muted; }, setMuted: setMuted
  };
})();
