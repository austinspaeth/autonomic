/* analytics.js — every number the App usage view shows is computed here.
 *
 * Nothing in this file touches the DOM. It exists so the presentation code can
 * ask a question ("what is D7 retention for these cohorts?") and get an answer
 * that already knows what it is allowed to claim.
 *
 * ---------------------------------------------------------------------------
 * What the data is
 * ---------------------------------------------------------------------------
 * Installs ping a counter at most once per Eastern day, carrying two facts: the
 * day that install first ran, and which store the build came from. The server
 * aggregates on arrival and keeps counters, never events (see
 * sls/lambdas/ping/main.js). So what we hold is:
 *
 *     open[day].cohorts[cohort] = how many installs born on `cohort`
 *                                 opened the app on `day`
 *     sub[day].cohorts[cohort]  = ...and how many first showed a subscription
 *     act[day].cohorts[cohort]  = ...and how many saved their FIRST HRV reading
 *     hrv[day].cohorts[cohort]  = ...and how many saved ANY reading that day
 *
 * `ageDays` is therefore derived, not transmitted: day − cohort.
 *
 * ACTIVATION is the third counter and the one that says whether onboarding
 * works. An install with no first reading has no score, no trend and no reason
 * to come back, so "installed" and "activated" are different populations and
 * the gap between them is the funnel worth fixing. It fires once per install,
 * so — unlike opens — activation rows DO count people, and `act[day].methods`
 * says which sensor each one used (W watch, B Bluetooth strap, F finger).
 *
 * THE HRV COUNTER IS THE OPEN COUNTER'S TWIN, and that is what makes it worth
 * more than a fourth number. Both are capped at one per install per Eastern day
 * by the same client rule, so on any one day they count the same kind of thing
 * over the same population: `hrv[day] / open[day]` is the SHARE OF THE PEOPLE
 * WHO WERE THERE who actually took a reading. It is the only ratio on this
 * page whose numerator and denominator are both install-days, which is why
 * `measureShare` exists and why nothing may be pooled into one of them that is
 * not pooled into the other. Opening the app is not using it: an install that
 * launches every morning and never measures draws a healthy retention curve
 * over an empty journal, and the open counter alone cannot see the difference.
 *
 * THE HRV COUNTER STARTED LATER THAN THE OTHERS, and the "immature is not zero"
 * rule applies to a counter as much as to a cohort. Days before `hrvFirst` have
 * no reading rows because no build was sending them, not because nobody
 * measured, so every function here answers `null` for those days rather than
 * 0%. `hrvKnown` is the gate; the UI must show the difference.
 *
 * A stored cohort is really cohort+platform (`082126I`), so the report can hand
 * back two rows for one cohort day. `index` pools them, and takes a platform
 * filter for the times the split is the question — see `index` and
 * `platformSplit`.
 *
 * Not every ping carries a store. Builds that shipped before the marker existed
 * send a bare `082126`, which reads back as platform U. Those are real installs
 * whose store is unknown, NOT installs on an unknown platform. A platform slice
 * is STRICT — iOS means the pings that said iOS — and what it left out is
 * reported as `unattributed` so the view can state it rather than hide it. See
 * `rowsToMap` for why this was once the other way round.
 *
 * ---------------------------------------------------------------------------
 * The three rules this module enforces so the UI cannot break them
 * ---------------------------------------------------------------------------
 * 1. NEVER SUM ACROSS DAYS TO COUNT PEOPLE. Without an identifier, the same
 *    install appears on every day it opened the app. Daily actives added over a
 *    week is not weekly actives, it is one person counted seven times. There is
 *    no WAU or MAU here and there cannot be. Where a "how many are still
 *    around" number is genuinely wanted, `peakOver` takes a maximum, which is a
 *    true floor, and it is labelled as one.
 *
 * 2. IMMATURE IS NOT ZERO. A cohort installed five days ago has not failed D7;
 *    D7 does not exist for it yet. Every retention function returns `null` for
 *    "not yet knowable" and reports how many cohorts were eligible, so a rate
 *    can never be quietly computed over a denominator that includes cohorts
 *    which never had the chance.
 *
 * 3. A RATE CARRIES ITS DENOMINATOR. Every retention/conversion result is an
 *    object with `kept`, `of`, `pct`, `cohorts` and `immature`, so the UI can
 *    show what a percentage was taken over and flag small ones.
 *
 * ---------------------------------------------------------------------------
 * The product boundary is first-class
 * ---------------------------------------------------------------------------
 * Day 14 is the last day of the trial; day 15 is the first day outside it.
 * D14→D15 is therefore THE transition worth measuring, and it gets its own
 * function rather than being open-coded wherever someone needs it.
 *
 * There used to be two boundaries here: a seven-day trial, and then a separate
 * "history wall" at day 15 where free users lost their older charts. The app
 * now runs a single fourteen-day trial, and the free tier's history clip falls
 * on the same day the trial ends — so the second boundary described the same
 * moment as the first and has been removed rather than drawn twice. Anything
 * still speaking of a "wall" is stale copy, not a second product rule.
 */
window.Analytics = (function () {
  'use strict';

  /* ------------------------------------------------------------ boundaries */

  var B = {
    trialLastDay: 14,     // still in trial
    firstPostTrial: 15    // first day outside it
  };

  /* Columns of the cohort heatmap: the milestones worth naming, including both
     sides of the product boundary. D7 stays as an ordinary week-one checkpoint
     — it is no longer a boundary, but it is still the day a first week ends. */
  var MILESTONES = [0, 1, 3, 7, 14, 15, 21, 30, 60, 90];

  /* Below this a percentage is noise dressed as a number. */
  var SMALL_COHORT = 10;

  /* ----------------------------------------------------------------- dates */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toISO(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function parse(s) { return new Date(String(s) + 'T00:00:00Z'); }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
  function ageDays(cohort, day) { return Math.round((parse(day) - parse(cohort)) / 86400000); }
  /** Monday-based week start, which is also the weekly cohort's key. */
  function weekStart(s) {
    var d = parse(s);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return toISO(d);
  }
  /** Monday-first weekday index, 0..6. */
  function weekday(s) { return (parse(s).getUTCDay() + 6) % 7; }
  function range(from, to) {
    var out = [];
    for (var d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  /* ----------------------------------------------------------------- index */

  var EMPTY = { total: 0, cohorts: {}, platforms: {}, methods: {}, unattributed: 0 };

  /* Capture methods an activation ping can name, and what to call them. Any
     other letter, or none, pools under `?` — an activation whose sensor we
     could not read is still an activation. */
  var METHOD_NAME = { W: 'Apple Watch', B: 'Chest strap', F: 'Phone camera' };
  var METHOD_ORDER = ['W', 'B', 'F', '?'];

  /* The report's platform letters, and the names the filter bar speaks. */
  var PLATFORM_LETTER = { ios: 'I', android: 'A', unknown: 'U', I: 'I', A: 'A', U: 'U' };
  var PLATFORM_NAME = { I: 'ios', A: 'android', U: 'unknown' };

  /** Normalize a filter into a letter, or null for "every platform". */
  function platformFilter(p) {
    if (!p || p === 'all' || p === 'compare') return null;
    return PLATFORM_LETTER[p] || null;
  }

  /**
   * Rows to `{ day: { total, cohorts, platforms, unattributed } }`.
   *
   * Two cohort entries can now share a cohort DAY (one per platform), so the
   * counts are pooled rather than assigned — an `=` here would silently drop
   * whichever platform sorted first. `platforms` is the day's split, always
   * counted before the filter is applied, so a filtered view can still say what
   * it is a slice of. Rows written before the platform marker existed carry no
   * `platform` and pool under U.
   *
   * A platform filter keeps ONLY its own letter. Unattributed pings are counted
   * in `unattributed` and left out of the slice, so the three buckets — iOS,
   * Android, unattributed — sum to the unfiltered total exactly. Combined is
   * the everything view and always was, so nothing is hidden by that; what a
   * slice owes the reader is a statement of what it left out, which is what
   * `unattributed` is for and which the UI must show. See the long note inside
   * for why this pooled them for a while and why that stopped being right.
   */
  function rowsToMap(list, letter) {
    var by = {};
    (list || []).forEach(function (r) {
      if (!r || !r.day) return;
      var c = {}, plat = {}, meth = {}, kept = 0, unattributed = 0;
      (r.cohorts || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var p = PLATFORM_NAME[x.platform] ? x.platform : 'U';
        var n = Number(x.count) || 0;
        plat[p] = (plat[p] || 0) + n;
        /* A PLATFORM SLICE IS STRICT: pick iOS and you get the pings that said
           iOS, and nothing else.

           This pooled unattributed pings into every slice for a while, so that
           a build predating the platform marker still appeared somewhere — the
           alternative at the time was a view that read "no pings" the moment
           the filter was touched. That was the right trade while unattributed
           was a small tail and the wrong one the moment it was the majority: at
           three-quarters unattributed, iOS read 23 and Android 29 against a
           combined 30, both slices were mostly the same pool, and the two
           numbers that were actually true (1 and 7) were invisible.

           Nothing is hidden by the change, because COMBINED is already the
           everything view — it is the unfiltered index, so it is iOS + Android
           + unattributed and it still counts every ping. The three now sum to
           it exactly, which is the property that makes the page checkable. What
           the slice owes the reader is a statement of what it LEFT OUT, which
           is what `unattributed` is carried for. */
        if (letter && p !== letter) {
          if (p === 'U') unattributed += n;
          return;
        }
        c[x.cohort] = (c[x.cohort] || 0) + n;
        /* Only activation rows carry a method. It is counted INSIDE the
           platform filter (unlike `platforms`, which is what the filter is a
           slice of) because "which sensor do iOS users activate on" is a
           question about the slice, not about the whole. */
        meth[METHOD_NAME[x.method] ? x.method : '?'] = (meth[METHOD_NAME[x.method] ? x.method : '?'] || 0) + n;
        kept += n;
      });
      by[r.day] = {
        total: letter ? kept : (Number(r.total) || 0),
        cohorts: c, platforms: plat, methods: meth, unattributed: unattributed,
      };
    });
    return by;
  }

  /** Totals per platform over a whole map, as `{ I: n, A: n, U: n }`. */
  function splitOf(map) {
    var out = {};
    Object.keys(map).forEach(function (d) {
      var p = map[d].platforms || {};
      Object.keys(p).forEach(function (k) { out[k] = (out[k] || 0) + p[k]; });
    });
    return out;
  }

  /**
   * Build the queryable index from a PINGS response.
   *
   * `first` matters more than it looks: it is the day the counter started
   * hearing anything, and any cohort older than it can never have a day 0. Such
   * installs are real and active, but they are not a measurable cohort, and
   * every function below skips them rather than dividing by a size of zero.
   */
  function index(report, platform) {
    var letter = platformFilter(platform);
    var open = rowsToMap(report && report.open, letter);
    var sub = rowsToMap(report && report.sub, letter);
    var act = rowsToMap(report && report.act, letter);
    var hrv = rowsToMap(report && report.hrv, letter);
    /* All three kinds feed `days`, because `days` is what every sweep below
       iterates: an activation landing on a day the open rows happen not to
       cover would otherwise be invisible to `activation` and `activationAges`
       rather than merely unusual. It cannot move `first` in practice — an
       install that activated also opened the app that day — and `cohorts`
       below is unaffected either way, since a measurable cohort is defined by
       an OPEN on its own day 0. */
    var seen = {};
    Object.keys(open).forEach(function (d) { seen[d] = true; });
    Object.keys(sub).forEach(function (d) { seen[d] = true; });
    Object.keys(act).forEach(function (d) { seen[d] = true; });
    Object.keys(hrv).forEach(function (d) { seen[d] = true; });
    var days = Object.keys(seen).sort();
    var first = days[0] || null;
    var last = days[days.length - 1] || null;

    /* The first day the READING counter itself was heard from, which is later
       than `first` — the route shipped in a build of its own. Everything before
       it is unknown rather than zero, and `hrvKnown` is how the rest of this
       module says so. Taken from the data because there is nowhere else to take
       it from: the endpoint stores counts, not a start date. The cost is one
       edge case worth naming — if the very first day the route existed nobody
       measured, that day reads as "before the counter" instead of as a true
       zero. One day, once, and it errs toward silence rather than toward a
       0% that would be a claim about people.

       DELIBERATELY NOT FILTERED by the platform slice: Android shipped the
       route in its own release, and reading `hrvFirst` off an iOS-only slice
       would date the counter from the wrong build. */
    var hrvAll = letter ? rowsToMap(report && report.hrv, null) : hrv;
    var hrvDays = Object.keys(hrvAll).sort();
    var hrvFirst = hrvDays[0] || null;

    /* Cohorts we can measure: born on or after the counter's first day, and
       actually seen on their own day 0. */
    var cohorts = [];
    days.forEach(function (d) {
      if (first && d >= first && (open[d] && open[d].cohorts[d] > 0)) cohorts.push(d);
    });

    /* Cohort keys appearing in the data that predate the counter — active, but
       unmeasurable. Kept so the UI can say how much of the picture they are. */
    var older = {};
    days.forEach(function (d) {
      Object.keys((open[d] || EMPTY).cohorts).forEach(function (c) {
        if (first && c < first) older[c] = true;
      });
    });

    return {
      open: open, sub: sub, act: act, hrv: hrv,
      days: days, first: first, last: last, hrvFirst: hrvFirst,
      cohorts: cohorts,
      preTracking: Object.keys(older).sort(),
      /* What this index is a slice of: the filter in force, and the platform
         totals BEFORE it was applied, so a view can show the split without a
         second pass over the report. */
      platform: letter ? PLATFORM_NAME[letter] : 'all',
      platformSplit: { open: splitOf(open), sub: splitOf(sub) },
      /* The subscribe rows as the counter sent them, kept because `rowsToMap`
         sums each day's cohorts ACROSS platforms — `sub[day].cohorts` is keyed
         by cohort date alone, and the day's `platforms` map is a separate
         total. That is the right shape for every aggregate on this view and
         the wrong one for a list of individual purchases, which has to carry
         both facts on the same line. Reading them raw also makes the list
         unfiltered by construction, which is the rule every platform-split
         thing here already follows. */
      rawSub: (report && report.sub) || [],
      versions: (report && report.versions) || null
    };
  }

  /* -------------------------------------------------------------- accessors */

  function openOn(ix, day) { return ix.open[day] || EMPTY; }
  function subOn(ix, day) { return ix.sub[day] || EMPTY; }
  function actOn(ix, day) { return (ix.act && ix.act[day]) || EMPTY; }
  function activeOn(ix, day) { return openOn(ix, day).total; }
  function countOn(ix, day, cohort) { return openOn(ix, day).cohorts[cohort] || 0; }
  function subCountOn(ix, day, cohort) { return subOn(ix, day).cohorts[cohort] || 0; }
  function purchasesOn(ix, day) { return subOn(ix, day).total; }
  /** First readings saved on `day`, by installs of any cohort. */
  function activationsOn(ix, day) { return actOn(ix, day).total; }
  function actCountOn(ix, day, cohort) { return actOn(ix, day).cohorts[cohort] || 0; }
  /** One day's capture-method split, `{ W: n, B: n, F: n, '?': n }`. */
  function methodsOn(ix, day) { return actOn(ix, day).methods || {}; }
  /** The same split pooled over a set of days. */
  function methodsOver(ix, days) {
    var out = {};
    (days || []).forEach(function (d) {
      var m = methodsOn(ix, d);
      Object.keys(m).forEach(function (k) { out[k] = (out[k] || 0) + m[k]; });
    });
    return out;
  }
  /** The platform split of activations, always unfiltered — the twin of
   *  `subPlatformsOn`, and read for the same reason. */
  function actPlatformsOn(ix, day) { return actOn(ix, day).platforms || {}; }

  /* ------------------------------------------------------------ measuring */

  function hrvOn(ix, day) { return (ix.hrv && ix.hrv[day]) || EMPTY; }
  /** Installs that saved a reading on `day`. One per install per day, so this
   *  counts PEOPLE on that day, exactly as `activeOn` does. */
  function readingsOn(ix, day) { return hrvOn(ix, day).total; }
  function hrvCountOn(ix, day, cohort) { return hrvOn(ix, day).cohorts[cohort] || 0; }
  /** The reading counter's platform split, always unfiltered. */
  function hrvPlatformsOn(ix, day) { return hrvOn(ix, day).platforms || {}; }

  /**
   * Was the reading counter running on `day`?
   *
   * A day before it shipped has no rows, and reporting that as "0% of actives
   * measured" is the counter-level version of calling an immature cohort
   * churned. Every rate below returns null instead, and the UI says so.
   */
  function hrvKnown(ix, day) { return !!(ix.hrvFirst && day >= ix.hrvFirst); }

  /**
   * The share of the installs active on `day` that took a reading.
   *
   * The one genuine share-of-people ratio on this page. Both counters are
   * capped at one per install per Eastern day by the same client rule and
   * bucketed on the same boundary, so the numerator's population is a SUBSET of
   * the denominator's rather than a different measurement of it.
   *
   * It can still exceed 100%, and that is information rather than a bug: a
   * reading saved just after midnight Eastern by a phone whose open ping landed
   * before it, or an install that measured on a launch whose open ping was lost
   * offline, both put a reading in a day without its open. Reported as it comes
   * out — clamping it would hide the only signal that says the two counters
   * have drifted.
   */
  function measureShare(ix, day) {
    if (!hrvKnown(ix, day)) return null;
    var active = activeOn(ix, day);
    if (!active) return null;
    return (readingsOn(ix, day) / active) * 100;
  }

  /**
   * The same share pooled over a set of days.
   *
   * Pooled as install-DAYS, not as people: the denominator is every (install,
   * day) pair on which the app was opened and the numerator is the pairs that
   * also carried a reading. That is a legitimate rate over a window even though
   * neither total is a headcount — it is "on what fraction of the days somebody
   * showed up did they measure", which is the habit question. It is NOT weekly
   * actives and must never be printed as one.
   *
   * Days before the counter shipped are excluded from both sides and counted in
   * `blind`, so a window that straddles the release reports on the part of
   * itself it can see and says how much of it that was.
   */
  function measureRate(ix, days) {
    var readings = 0, active = 0, counted = 0, blind = 0;
    (days || []).forEach(function (d) {
      if (!hrvKnown(ix, d)) { blind += 1; return; }
      readings += readingsOn(ix, d);
      active += activeOn(ix, d);
      counted += 1;
    });
    return {
      readings: readings, active: active,
      pct: active ? (readings / active) * 100 : null,
      days: counted, blind: blind, available: counted > 0 && active > 0
    };
  }

  /**
   * Measuring at day N over a set of cohorts: the share of a cohort that saved
   * a reading on its own day N.
   *
   * `retentionAt`'s twin, and read against it — retention is the share that
   * opened the app, this is the share that used it. The gap between the two
   * curves is the app being opened without being used, which is the number a
   * habit product lives or dies on and which nothing else here can see.
   *
   * Two exclusions, both "we cannot know" rather than "nobody did": a cohort
   * too young for day N (`immature`, the same rule retention runs), and a
   * cohort whose day N fell before the reading counter shipped (`blind`).
   * Neither is counted as a zero.
   */
  function measuringAt(ix, cohorts, n) {
    var did = 0, of = 0, eligible = 0, immature = 0, blind = 0;
    (cohorts || []).forEach(function (c) {
      if (!isMature(ix, c, n)) { immature += 1; return; }
      var day = addDays(c, n);
      if (!hrvKnown(ix, day)) { blind += 1; return; }
      var size = cohortSize(ix, c);
      if (!size) return;
      did += hrvCountOn(ix, day, c);
      of += size;
      eligible += 1;
    });
    return {
      day: n, kept: did, of: of,
      pct: of ? (did / of) * 100 : null,
      cohorts: eligible, immature: immature, blind: blind,
      small: of > 0 && of < SMALL_COHORT,
      available: eligible > 0
    };
  }

  /** Measuring at every day 0..maxN, stopping where nothing is knowable. */
  function measuringCurve(ix, cohorts, maxN) {
    var out = [];
    for (var n = 0; n <= (maxN === undefined ? 90 : maxN); n++) {
      var r = measuringAt(ix, cohorts, n);
      if (!r.available) break;
      out.push(r);
    }
    return out;
  }

  /** One day's platform split, `{ I: n, A: n, U: n }`, ALWAYS unfiltered. */
  function platformsOn(ix, day) { return (ix.open[day] || EMPTY).platforms || {}; }

  /** The same split for SUBSCRIBE pings: a purchase carries the buyer's store
   *  in the very same cohort key an open ping does, so "which store paid" needs
   *  no second source. Also ALWAYS unfiltered, for the same reason. */
  function subPlatformsOn(ix, day) { return (ix.sub[day] || EMPTY).platforms || {}; }

  /** Pooled platform split over a set of days, `{ I: n, A: n, U: n }`. */
  function platformsOver(ix, days, fn) {
    var out = {};
    (days || []).forEach(function (d) {
      var p = fn(ix, d);
      Object.keys(p).forEach(function (k) { out[k] = (out[k] || 0) + p[k]; });
    });
    return out;
  }
  function purchasePlatformsOver(ix, days) { return platformsOver(ix, days, subPlatformsOn); }

  /** How much of a filtered day's count carries no store. 0 when unfiltered. */
  function unattributedOn(ix, day) { return (ix.open[day] || EMPTY).unattributed || 0; }

  /** A cohort's size: how many installs opened the app on their own first day. */
  function cohortSize(ix, cohort) { return countOn(ix, cohort, cohort); }

  /** Installs whose cohort is not today — i.e. someone coming back. */
  function returningOn(ix, day) {
    return Math.max(0, activeOn(ix, day) - countOn(ix, day, day));
  }
  function newOn(ix, day) { return countOn(ix, day, day); }

  /** How old a cohort is as of the newest day we have. */
  function maturity(ix, cohort) { return ix.last ? ageDays(cohort, ix.last) : 0; }
  /** Has this cohort lived long enough for day N to exist? */
  function isMature(ix, cohort, n) { return maturity(ix, cohort) >= n; }

  /* ------------------------------------------------------------- retention */

  /**
   * Retention at day N over a set of cohorts.
   *
   * Cohorts too young for day N are EXCLUDED from the denominator, not counted
   * as churned — that is the difference between "we don't know yet" and "they
   * left", and conflating them is the most common way a retention chart lies.
   * The result says how many cohorts were eligible and how many were skipped,
   * so the UI can show "over 6 cohorts (3 too young)" instead of a bare number.
   */
  function retentionAt(ix, cohorts, n) {
    var kept = 0, of = 0, eligible = 0, immature = 0;
    (cohorts || []).forEach(function (c) {
      if (!isMature(ix, c, n)) { immature += 1; return; }
      var size = cohortSize(ix, c);
      if (!size) return;
      kept += countOn(ix, addDays(c, n), c);
      of += size;
      eligible += 1;
    });
    return {
      day: n,
      kept: kept,
      of: of,
      pct: of ? (kept / of) * 100 : null,
      cohorts: eligible,
      immature: immature,
      small: of > 0 && of < SMALL_COHORT,
      available: eligible > 0
    };
  }

  /** Retention at every day 0..maxN, stopping where no cohort is old enough. */
  function curve(ix, cohorts, maxN) {
    var out = [];
    for (var n = 0; n <= (maxN === undefined ? 90 : maxN); n++) {
      var r = retentionAt(ix, cohorts, n);
      if (!r.available) break;
      out.push(r);
    }
    return out;
  }

  /** The heatmap's columns for one cohort: a cell per milestone. */
  function milestoneRow(ix, cohort, cols) {
    var size = cohortSize(ix, cohort);
    return (cols || MILESTONES).map(function (n) {
      if (!isMature(ix, cohort, n)) return { day: n, available: false, pct: null, kept: null, of: size };
      var kept = countOn(ix, addDays(cohort, n), cohort);
      return {
        day: n, available: true, kept: kept, of: size,
        pct: size ? (kept / size) * 100 : null
      };
    });
  }

  /* ----------------------------------------------------- weekly cohorts */

  /**
   * Group daily cohorts into weeks. A week's size is the sum of its days'
   * sizes — legitimate, because each install is born exactly once, on exactly
   * one day. (Summing *activity* across days would not be.)
   */
  function weeklyCohorts(ix, cohorts) {
    var by = {};
    (cohorts || []).forEach(function (c) {
      var k = weekStart(c);
      (by[k] = by[k] || { key: k, days: [], size: 0 }).days.push(c);
      by[k].size += cohortSize(ix, c);
    });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }

  /**
   * Retention at day N for a weekly cohort: every member day that is mature,
   * pooled. A week is only fully mature when its NEWEST day is, so a partly
   * mature week reports on the days that qualify and says so.
   */
  function weekRetentionAt(ix, week, n) {
    return retentionAt(ix, week.days, n);
  }

  function weekMilestones(ix, week, cols) {
    return (cols || MILESTONES).map(function (n) {
      var r = retentionAt(ix, week.days, n);
      return {
        day: n,
        available: r.available,
        pct: r.pct,
        kept: r.kept,
        of: r.of,
        partial: r.available && r.immature > 0,
        small: r.small
      };
    });
  }

  /* ------------------------------------------------------- trial survival */

  /**
   * The monetization lifecycle as a funnel of milestones, plus the one
   * transition that straddles the product boundary.
   *
   * `trialEnd` is a percentage-POINT change in retention across D14→D15,
   * computed only over cohorts mature enough for the later day, so both sides
   * of the comparison rest on the same installs.
   */
  function survival(ix, cohorts) {
    var steps = [0, 1, 7, 14, 15, 30].map(function (n) { return retentionAt(ix, cohorts, n); });
    function at(n) {
      for (var i = 0; i < steps.length; i++) if (steps[i].day === n) return steps[i];
      return null;
    }
    /* Both sides restricted to cohorts old enough for the LATER day, so the
       change isn't an artefact of a different denominator. */
    function transition(a, b) {
      var eligible = (cohorts || []).filter(function (c) { return isMature(ix, c, b); });
      var before = retentionAt(ix, eligible, a);
      var after = retentionAt(ix, eligible, b);
      if (!before.available || !after.available) return null;
      return {
        from: a, to: b, before: before, after: after,
        points: after.pct - before.pct,
        relative: before.pct ? ((after.pct - before.pct) / before.pct) * 100 : null,
        cohorts: after.cohorts
      };
    }
    return {
      steps: steps,
      trialEnd: transition(B.trialLastDay, B.firstPostTrial),
      at: at
    };
  }

  /**
   * Active installs on a day, bucketed by which side of the product boundaries
   * they are on.
   *
   * This is the honest lifecycle number, and it is deliberately usage-based.
   * Two alternatives are worse:
   *
   * - Store downloads would overcount: the trial days start on FIRST LAUNCH
   *   (the app stamps `trialStartedAt` then), so a download that never opened
   *   the app never started a trial at all.
   * - Cohort sizes (see `lifecycleNow`) only exist for cohorts we watched being
   *   born, which silently drops every install older than the counter — the
   *   most established users there are.
   *
   * Age is known for every ping, measurable cohort or not, so bucketing what
   * actually checked in covers everyone and claims nothing it cannot see.
   */
  function lifecycleActive(ix, day) {
    var d = day || ix.last;
    var abc = activeByCohort(ix, d);
    var out = { inTrial: 0, postTrial: 0, total: abc.total, day: d };
    abc.rows.forEach(function (r) {
      if (r.age <= B.trialLastDay) out.inTrial += r.count;
      else out.postTrial += r.count;
    });
    return out;
  }

  /**
   * How many installs STARTED a trial in each window — a stock count, not a
   * usage one, and only over cohorts we watched being born. Useful as context
   * beside `lifecycleActive`, never as a substitute: it cannot see installs
   * older than the counter.
   */
  function lifecycleNow(ix, cohorts) {
    var inTrial = 0, postTrial = 0;
    (cohorts || []).forEach(function (c) {
      var age = maturity(ix, c);
      var size = cohortSize(ix, c);
      if (age <= B.trialLastDay) inTrial += size;
      else postTrial += size;
    });
    return { inTrial: inTrial, postTrial: postTrial };
  }

  /* --------------------------------------------------------- monetization */

  /** Purchases bucketed by how old the install was when it bought. */
  var PURCHASE_BUCKETS = [
    { key: 'd0_7', label: 'D0–7', note: 'first week of the trial', from: 0, to: 7 },
    { key: 'd8_14', label: 'D8–14', note: 'second week, trial still running', from: 8, to: 14 },
    { key: 'd15', label: 'D15', note: 'the day the trial ends', from: 15, to: 15 },
    { key: 'd16_21', label: 'D16–21', from: 16, to: 21 },
    { key: 'd22_30', label: 'D22–30', from: 22, to: 30 },
    { key: 'd30p', label: 'D30+', from: 31, to: Infinity }
  ];

  /**
   * Every subscribe ping, one row each, newest first.
   *
   *   { day, cohort, platform, count, age }
   *
   * The histogram above answers "when do people decide" and needs a population
   * to mean anything. This answers "what happened", and at the volumes a new
   * app actually has, it is the more honest of the two: three purchases in a
   * bucket chart is three bars of height one, from which nothing can be read
   * back — not which store, not who installed when, and crucially not whether
   * two of the bars are the same install counted twice.
   *
   * That last one is the reason this exists. The client cannot be de-duplicated
   * server-side (there is no identifier, by design), so a ping whose response
   * was lost is re-sent on the next foreground and counted again. It leaves a
   * signature — the SAME cohort key on two adjacent days — and that signature
   * is invisible in every aggregate on this view and obvious in a list.
   *
   * ALWAYS UNFILTERED, like every other platform-split figure here: the store
   * is one of the columns, so slicing by store first would answer the question
   * with its own premise.
   *
   * `age` is exact wherever it exists — a ping carries its own cohort date, so
   * install-to-purchase needs no denominator and works for cohorts older than
   * the counter itself. A negative age cannot happen honestly (nobody buys
   * before installing) and is reported as null rather than clamped, since it
   * means a device's clock disagreed with the server's.
   */
  function purchaseRows(ix, from, to) {
    var out = [];
    ((ix && ix.rawSub) || []).forEach(function (row) {
      if (!row || !row.day) return;
      if (from && row.day < from) return;
      if (to && row.day > to) return;
      (row.cohorts || []).forEach(function (c) {
        var n = Number(c && c.count) || 0;
        if (!(n > 0)) return;
        var age = c.cohort ? ageDays(c.cohort, row.day) : null;
        out.push({
          day: row.day,
          cohort: c.cohort || null,
          key: c.key || null,
          platform: PLATFORM_NAME[c.platform] ? c.platform : 'U',
          count: n,
          age: (age === null || age < 0) ? null : age
        });
      });
    });
    /* Newest arrival first, and within a day the oldest install first — a
       list read top-down is then "what happened most recently". */
    return out.sort(function (a, b) {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return String(a.cohort) < String(b.cohort) ? -1 : 1;
    });
  }

  /**
   * The rows that share a cohort key with another row on an ADJACENT day —
   * the fingerprint of one install whose ping was counted, lost on the way
   * back, and re-sent on its next foreground.
   *
   * Deliberately narrow. Two purchases from the same cohort DATE are perfectly
   * ordinary once a cohort has more than one install in it, so this does not
   * flag a shared cohort on its own; it flags a shared cohort ONE DAY apart,
   * which is what the retry produces and what two independent buyers almost
   * never do. It is a suspicion, named as one in the UI, never a correction —
   * nothing here deletes or adjusts a count.
   */
  function suspectRetries(rows) {
    var flagged = {};
    (rows || []).forEach(function (a) {
      (rows || []).forEach(function (b) {
        if (a === b || !a.key || a.key !== b.key) return;
        if (Math.abs(ageDays(a.day, b.day)) === 1) { flagged[a.day + '|' + a.key] = true; }
      });
    });
    return flagged;
  }

  function purchaseAges(ix, from, to) {
    var buckets = PURCHASE_BUCKETS.map(function (b) {
      return { key: b.key, label: b.label, note: b.note, from: b.from, to: b.to, count: 0 };
    });
    var unknown = 0, total = 0;
    ix.days.forEach(function (day) {
      if (from && day < from) return;
      if (to && day > to) return;
      var cohorts = subOn(ix, day).cohorts;
      Object.keys(cohorts).forEach(function (c) {
        var n = cohorts[c];
        total += n;
        var age = ageDays(c, day);
        if (age < 0) { unknown += n; return; }
        for (var i = 0; i < buckets.length; i++) {
          if (age >= buckets[i].from && age <= buckets[i].to) { buckets[i].count += n; return; }
        }
      });
    });
    return { buckets: buckets, total: total, unknown: unknown };
  }

  /**
   * Install-to-paid conversion, restricted to cohorts old enough to have had
   * `withinDays` to decide. Anything younger is excluded — counting a cohort
   * installed yesterday as "not converted" would drag the rate down with
   * installs that simply haven't had the chance.
   */
  function conversion(ix, cohorts, withinDays) {
    var bought = 0, of = 0, eligible = 0, immature = 0;
    (cohorts || []).forEach(function (c) {
      if (withinDays !== undefined && !isMature(ix, c, withinDays)) { immature += 1; return; }
      var size = cohortSize(ix, c);
      if (!size) return;
      var limit = withinDays === undefined ? Infinity : withinDays;
      ix.days.forEach(function (day) {
        if (day < c) return;
        if (ageDays(c, day) > limit) return;
        bought += subCountOn(ix, day, c);
      });
      of += size;
      eligible += 1;
    });
    return {
      kept: bought, of: of, pct: of ? (bought / of) * 100 : null,
      cohorts: eligible, immature: immature, small: of > 0 && of < SMALL_COHORT,
      available: eligible > 0, withinDays: withinDays
    };
  }

  /**
   * Activation: the share of a cohort that ever saved a first HRV reading,
   * restricted to cohorts old enough to have had `withinDays` to get there.
   *
   * Same shape and the same immaturity rule as `conversion`, because it is the
   * same kind of claim — a one-per-install event measured against the cohort
   * that could have produced it. Kept as its own function rather than a
   * parameterised one so that the two rates can diverge without a flag: paying
   * and activating are not the same decision and will not stay the same shape.
   */
  function activation(ix, cohorts, withinDays) {
    var did = 0, of = 0, eligible = 0, immature = 0;
    (cohorts || []).forEach(function (c) {
      if (withinDays !== undefined && !isMature(ix, c, withinDays)) { immature += 1; return; }
      var size = cohortSize(ix, c);
      if (!size) return;
      var limit = withinDays === undefined ? Infinity : withinDays;
      ix.days.forEach(function (day) {
        if (day < c) return;
        if (ageDays(c, day) > limit) return;
        did += actCountOn(ix, day, c);
      });
      of += size;
      eligible += 1;
    });
    return {
      kept: did, of: of, pct: of ? (did / of) * 100 : null,
      cohorts: eligible, immature: immature, small: of > 0 && of < SMALL_COHORT,
      available: eligible > 0, withinDays: withinDays
    };
  }

  /**
   * How old an install was when it activated, in the same buckets purchases
   * use — so "when do people take their first reading" and "when do they pay"
   * are read off the same axis. Day 0 is the install day, which is where a
   * working onboarding should put nearly all of them.
   */
  function activationAges(ix) {
    var buckets = PURCHASE_BUCKETS.map(function (b) { return { label: b.label, from: b.from, to: b.to, count: 0 }; });
    var total = 0, unknown = 0;
    ix.days.forEach(function (day) {
      var cohorts = actOn(ix, day).cohorts;
      Object.keys(cohorts).forEach(function (c) {
        var n = cohorts[c];
        total += n;
        var age = ageDays(c, day);
        if (age < 0) { unknown += n; return; }
        for (var i = 0; i < buckets.length; i++) {
          if (age >= buckets[i].from && age <= buckets[i].to) { buckets[i].count += n; return; }
        }
      });
    });
    return { buckets: buckets, total: total, unknown: unknown };
  }

  /* ---------------------------------------------------- active by cohort */

  /**
   * "Of the people using the app today, when did they install?"
   *
   * Every active install appears here, INCLUDING ones older than the counter.
   * Two things are being kept apart, and conflating them loses real
   * information: an install's AGE is carried by the ping and is therefore
   * always known, while its cohort's SIZE is only known if we were counting on
   * the day it was born. So a July install pinging today is charted at its true
   * age with `measurable: false` — it just can never carry a retention
   * percentage, because there is no denominator for it and never will be.
   *
   * Rows run youngest first, which is also age order.
   */
  function activeByCohort(ix, day) {
    var cohorts = openOn(ix, day).cohorts;
    var rows = [], older = 0;
    Object.keys(cohorts).forEach(function (c) {
      var measurable = !(ix.first && c < ix.first);
      if (!measurable) older += cohorts[c];
      rows.push({
        cohort: c, count: cohorts[c], age: ageDays(c, day),
        week: weekStart(c), measurable: measurable
      });
    });
    rows.sort(function (a, b) { return a.age - b.age; });
    return { rows: rows, preTracking: older, total: activeOn(ix, day) };
  }

  /**
   * Installs older than the counter, with everything we DO know about them:
   * which day they installed, how old that makes them, when they last checked
   * in and how many were active on the newest day. No percentages, because
   * their cohort size was never observed.
   */
  function preTrackingCohorts(ix) {
    var seen = {};
    ix.days.forEach(function (day) {
      var cohorts = openOn(ix, day).cohorts;
      Object.keys(cohorts).forEach(function (c) {
        if (!ix.first || c >= ix.first) return;
        var row = seen[c] || (seen[c] = { cohort: c, lastSeen: null, activeLatest: 0, peak: 0, days: 0 });
        if (cohorts[c] > 0) {
          row.lastSeen = day;
          row.days += 1;
          if (cohorts[c] > row.peak) row.peak = cohorts[c];
        }
      });
    });
    return Object.keys(seen).sort().reverse().map(function (c) {
      var row = seen[c];
      row.age = ix.last ? ageDays(c, ix.last) : 0;
      row.activeLatest = countOn(ix, ix.last, c);
      return row;
    });
  }

  /** A floor on how many distinct installs were active in a window: the
   *  busiest single day per cohort. Never a sum. */
  function peakOver(ix, cohorts, from, to) {
    var floor = 0;
    (cohorts || []).forEach(function (c) {
      var peak = 0;
      ix.days.forEach(function (day) {
        if (day < from || day > to) return;
        var n = countOn(ix, day, c);
        if (n > peak) peak = n;
      });
      floor += peak;
    });
    return floor;
  }

  /* ------------------------------------------------------------- weekday */

  /** Aggregate a per-day series by weekday (Mon..Sun). */
  function byWeekday(days, valueOf) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push({ weekday: i, total: 0, days: 0, avg: 0 });
    (days || []).forEach(function (day) {
      var v = valueOf(day);
      if (v === null || v === undefined || isNaN(v)) return;
      var slot = out[weekday(day)];
      slot.total += v;
      slot.days += 1;
    });
    out.forEach(function (s) { s.avg = s.days ? s.total / s.days : null; });
    return out;
  }

  /** Retention milestone by the weekday an install was born on — the "are
   *  midweek installs better, or just more numerous?" question. */
  function retentionByInstallWeekday(ix, cohorts, n) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push({ weekday: i, cohorts: [] });
    (cohorts || []).forEach(function (c) { out[weekday(c)].cohorts.push(c); });
    return out.map(function (slot) {
      var r = retentionAt(ix, slot.cohorts, n);
      r.weekday = slot.weekday;
      r.installs = slot.cohorts.reduce(function (a, c) { return a + cohortSize(ix, c); }, 0);
      return r;
    });
  }

  /* --------------------------------------------------------- store funnel */

  /** Impressions -> page views -> downloads, with each step's rate. */
  function funnel(rows) {
    var imp = 0, pv = 0, dl = 0;
    (rows || []).forEach(function (r) {
      imp += Number(r.impressions) || 0;
      pv += Number(r.pageViews) || 0;
      dl += Number(r.downloads) || 0;
    });
    return {
      impressions: imp, pageViews: pv, downloads: dl,
      impToPage: imp ? (pv / imp) * 100 : null,
      pageToDownload: pv ? (dl / pv) * 100 : null,
      impToDownload: imp ? (dl / imp) * 100 : null
    };
  }

  /* -------------------------------------------------------------- events */

  var EVENT_CATEGORIES = {
    RELEASE: {
      label: 'Release', color: '#3987e5',
      types: ['New version', 'Feature launch', 'Onboarding change', 'Paywall change', 'Bug fix']
    },
    MARKETING: {
      label: 'Marketing', color: '#d95926',
      types: ['Ad spot started', 'Ad spot stopped', 'Budget change', 'Apple Search Ads',
        'Reddit post', 'Newsletter', 'Influencer mention', 'Other marketing']
    },
    STORE: {
      label: 'App Store', color: '#c98500',
      types: ['Screenshots changed', 'Subtitle changed', 'Keywords changed', 'Description changed',
        'Pricing changed', 'Android launch']
    },
    EXTERNAL: {
      label: 'External', color: '#9085e9',
      types: ['Press coverage', 'Platform / Apple Health event', 'Competitor event', 'Other']
    }
  };

  function eventColor(ev) {
    var cat = EVENT_CATEGORIES[ev && ev.category];
    return cat ? cat.color : '#898781';
  }

  function eventsBetween(events, from, to) {
    return (events || []).filter(function (e) {
      return e && e.date && e.date >= from && e.date <= to;
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /**
   * Before/after comparison around an event.
   *
   * Observational only, and the caller is expected to say so: nothing here
   * establishes that the event caused anything. The event's own day is excluded
   * from both windows — it is usually half a day of each.
   *
   * Retention is compared over cohorts BORN in each window that are mature
   * enough for the milestone; if the "after" window is too recent for D7, the
   * comparison reports unavailable rather than a misleading zero.
   *
   * `salesByDay` is the purchase ledger already sliced to the platform `ix` is
   * sliced to — `{ 'YYYY-MM-DD': { sales, revenue } }`, which is what
   * `Sales.dailyTotals()` returns. It is what money and purchase counts are read
   * from; the store's transaction is the thing to judge a release or an ad spot
   * by, and the subscribe ping (kept as its own row) fires a launch or two later,
   * so reading only the ping puts a shift in the LAG on the event's account.
   * Omit it and those rows are simply absent rather than zero.
   */
  function beforeAfter(ix, entries, event, days, salesByDay) {
    var n = days || 14;
    var before = { from: addDays(event.date, -n), to: addDays(event.date, -1) };
    var after = { from: addDays(event.date, 1), to: addDays(event.date, n) };

    function storeIn(win) {
      return funnel((entries || []).filter(function (e) {
        return e.date >= win.from && e.date <= win.to;
      }));
    }
    function daysIn(win) {
      return range(win.from, win.to).filter(function (d) { return !ix.first || d >= ix.first; });
    }
    function avgActive(win) {
      var ds = daysIn(win);
      if (!ds.length) return null;
      var sum = 0;
      ds.forEach(function (d) { sum += activeOn(ix, d); });
      return sum / ds.length;
    }
    function avgReturning(win) {
      var ds = daysIn(win);
      if (!ds.length) return null;
      var sum = 0;
      ds.forEach(function (d) { sum += returningOn(ix, d); });
      return sum / ds.length;
    }
    function cohortsIn(win) {
      return ix.cohorts.filter(function (c) { return c >= win.from && c <= win.to; });
    }
    function purchasesIn(win) {
      var sum = 0;
      daysIn(win).forEach(function (d) { sum += purchasesOn(ix, d); });
      return sum;
    }
    /* The ledger runs on its own calendar, not the ping index's: a purchase can
       predate the first ping this dashboard ever saw, so these windows are NOT
       clipped to `ix.first` the way the ping rows above are. */
    function ledgerIn(win, field) {
      if (!salesByDay) return null;
      var sum = 0;
      range(win.from, win.to).forEach(function (d) {
        var rec = salesByDay[d];
        if (rec) sum += Number(rec[field]) || 0;
      });
      return sum;
    }

    var bStore = storeIn(before), aStore = storeIn(after);
    var bDays = Math.max(1, range(before.from, before.to).length);
    var aDays = Math.max(1, range(after.from, after.to).length);

    var metrics = [
      rate('Downloads / day', bStore.downloads / bDays, aStore.downloads / aDays, 'count'),
      rate('Impressions / day', bStore.impressions / bDays, aStore.impressions / aDays, 'count'),
      rate('Impression → page', bStore.impToPage, aStore.impToPage, 'pct'),
      rate('Page → download', bStore.pageToDownload, aStore.pageToDownload, 'pct'),
      rate('Active / day', avgActive(before), avgActive(after), 'count'),
      rate('Returning / day', avgReturning(before), avgReturning(after), 'count')
    ];

    /* Purchases and money come from the ledger; the ping is kept beside them
       under its own name rather than being called "purchases" as well. Both
       windows are the same number of days, so totals are comparable without
       being averaged. */
    if (salesByDay) {
      metrics.push(rate('Purchases', ledgerIn(before, 'sales'), ledgerIn(after, 'sales'), 'count'));
      metrics.push(rate('Revenue', ledgerIn(before, 'revenue'), ledgerIn(after, 'revenue'), 'money'));
    }
    metrics.push(rate('Subscribe pings', purchasesIn(before), purchasesIn(after), 'count'));

    [1, 7, 14].forEach(function (d) {
      var b = retentionAt(ix, cohortsIn(before), d);
      var a = retentionAt(ix, cohortsIn(after), d);
      metrics.push(rate('D' + d + ' retention', b.available ? b.pct : null, a.available ? a.pct : null, 'pct', {
        beforeDetail: b, afterDetail: a
      }));
    });

    function rate(label, b, a, kind, extra) {
      var out = { label: label, before: b, after: a, kind: kind };
      if (b === null || a === null || b === undefined || a === undefined) {
        out.available = false;
      } else {
        out.available = true;
        out.delta = a - b;                                  // points for pct, units for count
        out.relative = b ? ((a - b) / b) * 100 : null;
      }
      if (extra) { out.beforeDetail = extra.beforeDetail; out.afterDetail = extra.afterDetail; }
      return out;
    }

    return { event: event, days: n, before: before, after: after, metrics: metrics };
  }

  /* --------------------------------------------------------------- export */

  return {
    BOUNDARIES: B,
    MILESTONES: MILESTONES,
    SMALL_COHORT: SMALL_COHORT,
    EVENT_CATEGORIES: EVENT_CATEGORIES,
    PURCHASE_BUCKETS: PURCHASE_BUCKETS,

    // dates
    addDays: addDays, ageDays: ageDays, weekStart: weekStart, weekday: weekday, range: range,

    // index + accessors
    index: index, platformName: function (letter) { return PLATFORM_NAME[letter] || 'unknown'; },
    activeOn: activeOn, newOn: newOn, returningOn: returningOn, platformsOn: platformsOn,
    subPlatformsOn: subPlatformsOn, purchasePlatformsOver: purchasePlatformsOver,
    unattributedOn: unattributedOn,
    countOn: countOn, purchasesOn: purchasesOn, cohortSize: cohortSize,
    activationsOn: activationsOn, actCountOn: actCountOn, actPlatformsOn: actPlatformsOn,
    readingsOn: readingsOn, hrvCountOn: hrvCountOn, hrvPlatformsOn: hrvPlatformsOn,
    hrvKnown: hrvKnown, measureShare: measureShare, measureRate: measureRate,
    measuringAt: measuringAt, measuringCurve: measuringCurve,
    methodsOn: methodsOn, methodsOver: methodsOver,
    methodName: function (letter) { return METHOD_NAME[letter] || 'Unknown sensor'; },
    METHOD_ORDER: METHOD_ORDER,
    maturity: maturity, isMature: isMature,

    // retention
    retentionAt: retentionAt, curve: curve, milestoneRow: milestoneRow,
    weeklyCohorts: weeklyCohorts, weekRetentionAt: weekRetentionAt, weekMilestones: weekMilestones,

    // lifecycle + money
    survival: survival, lifecycleNow: lifecycleNow, lifecycleActive: lifecycleActive,
    purchaseAges: purchaseAges, purchaseRows: purchaseRows, suspectRetries: suspectRetries,
    conversion: conversion, activation: activation, activationAges: activationAges,

    // shape of activity
    activeByCohort: activeByCohort, preTrackingCohorts: preTrackingCohorts, peakOver: peakOver,
    byWeekday: byWeekday, retentionByInstallWeekday: retentionByInstallWeekday,

    // store + events
    funnel: funnel, eventColor: eventColor, eventsBetween: eventsBetween, beforeAfter: beforeAfter
  };
})();
