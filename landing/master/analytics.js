/* analytics.js — every number the App usage view shows is computed here.
 *
 * Nothing in this file touches the DOM. It exists so the presentation code can
 * ask a question ("what is D7 retention for these cohorts?") and get an answer
 * that already knows what it is allowed to claim.
 *
 * ---------------------------------------------------------------------------
 * What the data is
 * ---------------------------------------------------------------------------
 * Installs ping a counter at most once per UTC day, carrying one fact: the day
 * that install first ran. The server aggregates on arrival and keeps counters,
 * never events (see sls/lambdas/ping/main.js). So what we hold is:
 *
 *     open[day].cohorts[cohort] = how many installs born on `cohort`
 *                                 opened the app on `day`
 *     sub[day].cohorts[cohort]  = ...and how many first showed a subscription
 *
 * `ageDays` is therefore derived, not transmitted: day − cohort.
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
 * Product boundaries are first-class
 * ---------------------------------------------------------------------------
 * Day 7 is the last day of the trial; day 8 is the first day outside it.
 * Full history is available through day 14; day 15 is the first day the
 * history wall bites. D7→D8 and D14→D15 are therefore the two transitions
 * worth measuring, and they get their own function rather than being open-coded
 * wherever someone needs them.
 */
window.Analytics = (function () {
  'use strict';

  /* ------------------------------------------------------------ boundaries */

  var B = {
    trialLastDay: 7,      // still in trial
    firstPostTrial: 8,    // first day outside it
    historyLastDay: 14,   // full charts still open
    firstWallDay: 15      // history wall applies
  };

  /* Columns of the cohort heatmap: the milestones worth naming, including both
     sides of each product boundary. */
  var MILESTONES = [0, 1, 3, 7, 8, 14, 15, 21, 30, 60, 90];

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

  var EMPTY = { total: 0, cohorts: {} };

  function rowsToMap(list) {
    var by = {};
    (list || []).forEach(function (r) {
      if (!r || !r.day) return;
      var c = {};
      (r.cohorts || []).forEach(function (x) {
        if (x && x.cohort) c[x.cohort] = Number(x.count) || 0;
      });
      by[r.day] = { total: Number(r.total) || 0, cohorts: c };
    });
    return by;
  }

  /**
   * Build the queryable index from a PINGS response.
   *
   * `first` matters more than it looks: it is the day the counter started
   * hearing anything, and any cohort older than it can never have a day 0. Such
   * installs are real and active, but they are not a measurable cohort, and
   * every function below skips them rather than dividing by a size of zero.
   */
  function index(report) {
    var open = rowsToMap(report && report.open);
    var sub = rowsToMap(report && report.sub);
    var seen = {};
    Object.keys(open).forEach(function (d) { seen[d] = true; });
    Object.keys(sub).forEach(function (d) { seen[d] = true; });
    var days = Object.keys(seen).sort();
    var first = days[0] || null;
    var last = days[days.length - 1] || null;

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
      open: open, sub: sub, days: days, first: first, last: last,
      cohorts: cohorts,
      preTracking: Object.keys(older).sort(),
      platforms: (report && report.platforms) || null,
      versions: (report && report.versions) || null
    };
  }

  /* -------------------------------------------------------------- accessors */

  function openOn(ix, day) { return ix.open[day] || EMPTY; }
  function subOn(ix, day) { return ix.sub[day] || EMPTY; }
  function activeOn(ix, day) { return openOn(ix, day).total; }
  function countOn(ix, day, cohort) { return openOn(ix, day).cohorts[cohort] || 0; }
  function subCountOn(ix, day, cohort) { return subOn(ix, day).cohorts[cohort] || 0; }
  function purchasesOn(ix, day) { return subOn(ix, day).total; }

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

  /* ------------------------------------------------ trial / wall survival */

  /**
   * The monetization lifecycle as a funnel of milestones, plus the two
   * transitions that straddle a product boundary.
   *
   * `d7to8` and `d14to15` are percentage-POINT changes in retention across the
   * boundary, computed only over cohorts mature enough for the later day, so
   * both sides of the comparison rest on the same installs.
   */
  function survival(ix, cohorts) {
    var steps = [0, 1, 7, 8, 14, 15, 30].map(function (n) { return retentionAt(ix, cohorts, n); });
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
      historyWall: transition(B.historyLastDay, B.firstWallDay),
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
   * - Store downloads would overcount: the seven days start on FIRST LAUNCH
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
    var out = { inTrial: 0, postTrial: 0, pastWall: 0, total: abc.total, day: d };
    abc.rows.forEach(function (r) {
      if (r.age <= B.trialLastDay) out.inTrial += r.count;
      else if (r.age < B.firstWallDay) out.postTrial += r.count;
      else out.pastWall += r.count;
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
    var inTrial = 0, postTrial = 0, pastWall = 0;
    (cohorts || []).forEach(function (c) {
      var age = maturity(ix, c);
      var size = cohortSize(ix, c);
      if (age <= B.trialLastDay) inTrial += size;
      else if (age < B.firstWallDay) postTrial += size;
      else pastWall += size;
    });
    return { inTrial: inTrial, postTrial: postTrial, pastWall: pastWall };
  }

  /* --------------------------------------------------------- monetization */

  /** Purchases bucketed by how old the install was when it bought. */
  var PURCHASE_BUCKETS = [
    { key: 'd0_7', label: 'D0–7', note: 'inside the trial', from: 0, to: 7 },
    { key: 'd8_14', label: 'D8–14', note: 'post-trial, history still open', from: 8, to: 14 },
    { key: 'd15', label: 'D15', note: 'the day the wall applies', from: 15, to: 15 },
    { key: 'd16_21', label: 'D16–21', from: 16, to: 21 },
    { key: 'd22_30', label: 'D22–30', from: 22, to: 30 },
    { key: 'd30p', label: 'D30+', from: 31, to: Infinity }
  ];

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
      types: ['Meta campaign started', 'Meta campaign stopped', 'Budget change', 'Apple Search Ads',
        'Reddit post', 'Newsletter', 'Influencer mention', 'Other campaign']
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
   */
  function beforeAfter(ix, entries, event, days) {
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

    var bStore = storeIn(before), aStore = storeIn(after);
    var bDays = Math.max(1, range(before.from, before.to).length);
    var aDays = Math.max(1, range(after.from, after.to).length);

    var metrics = [
      rate('Downloads / day', bStore.downloads / bDays, aStore.downloads / aDays, 'count'),
      rate('Impressions / day', bStore.impressions / bDays, aStore.impressions / aDays, 'count'),
      rate('Impression → page', bStore.impToPage, aStore.impToPage, 'pct'),
      rate('Page → download', bStore.pageToDownload, aStore.pageToDownload, 'pct'),
      rate('Active / day', avgActive(before), avgActive(after), 'count'),
      rate('Returning / day', avgReturning(before), avgReturning(after), 'count'),
      rate('Purchases', purchasesIn(before), purchasesIn(after), 'count')
    ];

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
    index: index,
    activeOn: activeOn, newOn: newOn, returningOn: returningOn,
    countOn: countOn, purchasesOn: purchasesOn, cohortSize: cohortSize,
    maturity: maturity, isMature: isMature,

    // retention
    retentionAt: retentionAt, curve: curve, milestoneRow: milestoneRow,
    weeklyCohorts: weeklyCohorts, weekRetentionAt: weekRetentionAt, weekMilestones: weekMilestones,

    // lifecycle + money
    survival: survival, lifecycleNow: lifecycleNow, lifecycleActive: lifecycleActive,
    purchaseAges: purchaseAges, conversion: conversion,

    // shape of activity
    activeByCohort: activeByCohort, preTrackingCohorts: preTrackingCohorts, peakOver: peakOver,
    byWeekday: byWeekday, retentionByInstallWeekday: retentionByInstallWeekday,

    // store + events
    funnel: funnel, eventColor: eventColor, eventsBetween: eventsBetween, beforeAfter: beforeAfter
  };
})();
