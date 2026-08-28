/* app.js — Autonomic dashboard.
   DynamoDB is the store of record (see sync.js); localStorage is kept as a
   local cache so the page paints instantly and survives a dead network. Every
   save() writes the cache and schedules a push. */
(function () {
  'use strict';

  var KEY = 'autonomic.dashboard.v1';
  var COLOR = {
    s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500',
    s5: '#d55181', s6: '#008300', s7: '#9085e9', s8: '#e66767',
    // platform identities, validated as a pair on the dark surface
    ios: '#3987e5', android: '#6aa80f',
    // lifecycle stages — green while in trial, gold at the boundary, red once
    // past it and on the free tier
    green: '#00a08f', gold: '#c98500', red: '#c9403f',
    muted: '#898781', text: '#c3c2b7'
  };

  /* Entity colours — fixed, never assigned by rank.
     Downloads own slot 1 and the trial threshold slot 2. `wallHit` is slot 3
     and is now simply "past the trial": it kept its key when the separate
     history wall was removed, because the colour is referenced widely and the
     rename would have been the whole diff. */
  var ENTITY = {
    downloads: COLOR.s1,        // blue
    inTrial: COLOR.green,       // still inside the free trial
    trialEnd: COLOR.gold,       // past the trial
    wallHit: COLOR.red,         // past the trial, on the free tier
    sales: COLOR.s7,            // violet — "paid" covers sales and revenue
    revenue: COLOR.s7,
    impressions: COLOR.s2,      // orange
    pageViews: COLOR.s5,        // magenta
    ios: COLOR.ios,
    android: COLOR.android
  };

  var PLATFORMS = { ios: 'iOS', android: 'Android' };

  /* ---------------------------------------------------------------- store */

  var db = load();

  function load() {
    var d = {
      entries: [], events: [], ads: [], costs: [], sales: [], links: [],
      settings: { trialDays: 14, currency: '$', storeCutPct: 15 }
    };
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.entries)) d.entries = p.entries;
        if (p && Array.isArray(p.events)) d.events = p.events;
        if (p && Array.isArray(p.ads)) d.ads = p.ads;
        if (p && Array.isArray(p.costs)) d.costs = p.costs;
        if (p && Array.isArray(p.sales)) d.sales = p.sales;
        if (p && Array.isArray(p.links)) d.links = p.links;
        // conversion rate used to be an entered field; it is derived now, so drop
        // any stale values rather than carrying them into exports and backups
        d.entries.forEach(function (e) { if (e) delete e.conversionRate; });
        if (p && p.settings) Object.assign(d.settings, p.settings);
        migrateSettings(d.settings);
      }
    } catch (e) { console.warn('Could not read saved data', e); }
    return d;
  }

  /**
   * Bring a settings record written by the two-boundary build up to date.
   *
   * `wallDays` is the tell: only a build that still had a separate history wall
   * ever wrote it. Such a record also carries the OLD seven-day trial, and
   * because the field is stored per dashboard rather than derived, a stored 7
   * would have quietly outlived the change — the code would say fourteen days
   * everywhere and the screen would still say seven, which is exactly the drift
   * that let `analytics.js` and `app.js` disagree in the first place.
   *
   * Keyed on `wallDays` and not on the value 7, so it only ever touches records
   * the old build wrote. A trial length typed in deliberately after this ships
   * has no `wallDays` beside it and is left alone.
   */
  function migrateSettings(st) {
    if (!st || st.wallDays === undefined) return;
    delete st.wallDays;
    st.trialDays = 14;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      toast('Could not save — local storage may be full or blocked.');
    }
    if (window.Sync) window.Sync.schedule();
  }

  var state = {
    view: 'overview',
    range: '30', from: '', to: '',
    platform: 'combined',
    grain: 'day',
    ovMode: 'daily',
    cohGrain: 'day',
    dowMetric: 'downloads',
    exportN: 1,
    exportUnit: 'days',
    lastView: 'overview',
    fc: { horizon: 12, model: 'mix' }
  };
  try {
    var st = JSON.parse(localStorage.getItem(KEY + '.ui') || 'null');
    if (st) Object.assign(state, st);
  } catch (e) { /* ignore */ }
  /* `compare` was a fourth platform option and is gone. A browser that had it
     selected — or a synced UI state written by a build that still had it —
     would otherwise land on a filter with no button to leave it by. */
  if (state.platform === 'compare') state.platform = 'combined';
  function saveUI() {
    try { localStorage.setItem(KEY + '.ui', JSON.stringify(state)); } catch (e) {}
    if (window.Sync) window.Sync.schedule();
  }

  /* Is there anything in the cache worth painting before the server answers?

     The dashboard used to wait for the pull on principle: a second device
     would otherwise flash the first one's numbers. That was the wrong trade for
     an app one person reads on three devices — it made every open cost a round
     trip, and on a phone with a slow connection that is the difference between
     a dashboard and a loading screen. The cache paints first now, and the pull
     lands on top of it a moment later. What used to be a "stale numbers" risk
     is bounded by the same thing that always bounded it: the data is one
     account's, the pull is already in flight, and the refresh button spins
     until it lands. */
  function hasCache() {
    return !!(db.entries.length || (db.sales || []).length ||
      (db.costs || []).length || (db.ads || []).length || (db.events || []).length);
  }

  /* True between "the page came up with nothing cached" and "the first pull
     landed" — the only window in which the whole page is a skeleton. */
  var bootPending = false;

  /* ---------------------------------------------------------------- dates */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  /* Day-of-month of the `n`th Sunday of a month (1-based n, 0-based month). */
  function nthSunday(year, month, n) {
    var firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
  }
  /* Is this instant inside US Eastern daylight time? Second Sunday of March at
     02:00 standard (07:00 UTC) through the first Sunday of November at 02:00
     daylight (06:00 UTC). */
  function isEasternDst(ms) {
    var year = new Date(ms).getUTCFullYear();
    return ms >= Date.UTC(year, 2, nthSunday(year, 2, 2), 7)
        && ms < Date.UTC(year, 10, nthSunday(year, 10, 1), 6);
  }

  /**
   * The dashboard's own calendar day, in US EASTERN — not the browser's.
   *
   * This is a copy of `easternDay` in sls/lambdas/ping/main.js, which is a copy
   * of the one in mobile/src/lib/ping.ts, and the three must stay identical:
   * the ping counter buckets every arrival on the Eastern day, so a dashboard
   * reading the browser's local day disagrees with its own data for part of
   * every day. Opened from a laptop on UTC, the page started calling tomorrow
   * "today" at 8pm Eastern and showed a fresh, nearly empty day hours before
   * one existed. Anchoring here rather than shifting the data means the page
   * reads the same wherever it is opened, which is the point: these are the
   * business's numbers, read against the business's calendar.
   */
  function easternDay(ms) {
    var t = (ms === undefined ? Date.now() : ms);
    return new Date(t - (isEasternDst(t) ? 4 : 5) * 3600000).toISOString().slice(0, 10);
  }
  function today() { return easternDay(); }
  /* Store reporting always lags, so the current calendar day never has data.
     `reportDay` is the newest day the dashboard treats as real; `asOf` is the
     same thing but extended if entries somehow run later, so a manually entered
     day is never silently hidden. */
  function reportDay() { return addDays(today(), -1); }
  function asOf() { var b = base(); return b.dates.length ? b.end : reportDay(); }
  function weekStart(s) { var d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); }
  function monthStart(s) { return s.slice(0, 7) + '-01'; }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  /* Monday-first weekday index */
  function dow(isoStr) { return (parseISO(isoStr).getDay() + 6) % 7; }
  function labelDay(s) { var d = parseISO(s); return MON[d.getMonth()] + ' ' + d.getDate(); }
  function labelFull(s) { var d = parseISO(s); return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function labelMonth(s) { var d = parseISO(s); return MON[d.getMonth()] + ' ' + d.getFullYear(); }

  /* --------------------------------------------------------------- format */

  function fmtInt(n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return Math.round(n).toLocaleString();
  }
  function fmtPct(n) {
    if (n === null || n === undefined || isNaN(n) || !isFinite(n)) return '–';
    return (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2)) + '%';
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    var cur = db.settings.currency || '$';
    var abs = Math.abs(n);
    var s = abs >= 1000 ? Math.round(abs).toLocaleString() : abs.toFixed(2);
    return (n < 0 ? '-' : '') + cur + s;
  }
  var esc = Chart.escapeHTML;

  /* --------------------------------------------------------------- derive */

  function num(v) { return (v === null || v === undefined || v === '' || isNaN(v)) ? 0 : +v; }

  /* Every numeric field a day carries. The first four come from the store CSVs
     you paste in; `sales` / `revenue` and the three after them are folded in
     from the sales ledger (see base()). Listed once so the running totals, the
     cumulative record and an empty day can never drift out of step — they used
     to be three hand-written copies of the same six names. */
  var FIELDS = ['downloads', 'impressions', 'pageViews', 'updates',
    'sales', 'revenue', 'mrr', 'annualSales', 'monthlySales'];
  function blank() {
    var o = {};
    FIELDS.forEach(function (f) { o[f] = 0; });
    return o;
  }

  /* daily[platform][date] = summed record; built once per render pass */
  var cache = null;
  /* Bumped on every write, so a memoised derivation can key on "has anything
     changed" without knowing WHAT changed. An edit that leaves a list the same
     length — correcting an ad spot's price, say — moves this. */
  var revision = 0;
  function invalidate() { cache = null; revision += 1; }

  function base() {
    if (cache) return cache;
    var byPlat = { ios: {}, android: {}, all: {} };
    var min = null, max = null;

    db.entries.forEach(function (e) {
      if (!e || !e.date || !PLATFORMS[e.platform]) return;
      [e.platform, 'all'].forEach(function (p) {
        var r = byPlat[p][e.date] || (byPlat[p][e.date] = blank());
        r.downloads += num(e.downloads);
        r.impressions += num(e.impressions);
        r.pageViews += num(e.pageViews);
        r.updates += num(e.updates);
      });
      if (!min || e.date < min) min = e.date;
      if (!max || e.date > max) max = e.date;
    });

    /* Sales come from the LEDGER, never from the store entry any more.
       `sales` and `revenue` still mean exactly what they meant when they were
       two columns on an entry — a unit count and gross bookings at the
       customer-facing price — so every consumer downstream (Overview, Costs,
       Trial & conversion, the weekday chart) reads one source of truth without
       knowing the shape underneath it changed. `mrr` and the plan counts are
       new and only the Sales view asks for them. */
    var salesByDay = Sales.dailyTotals(salesList());
    ['ios', 'android', 'all'].forEach(function (p) {
      Object.keys(salesByDay[p]).forEach(function (d) {
        var s = salesByDay[p][d];
        var r = byPlat[p][d] || (byPlat[p][d] = blank());
        r.sales += s.sales; r.revenue += s.revenue; r.mrr += s.mrr;
        r.annualSales += s.annual; r.monthlySales += s.monthly;
      });
    });
    /* A sale widens the spine the way a cost does: the first purchase can
       predate the first store CSV you happened to paste in, and an "All time"
       that started at the first download would drop it off the left edge. */
    Object.keys(salesByDay.all).forEach(function (d) {
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });

    /* The spine has to reach back to the first cost as well as the first store
       entry: the developer programme is usually paid for months before there is
       anything to download, and "All time" that starts at the first install
       would silently drop it. Store days stay the only source of store numbers
       — these dates only widen the axis. */
    (db.costs || []).forEach(function (c) {
      if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.date || ''))) return;
      if (!min || c.date < min) min = c.date;
    });
    (db.ads || []).forEach(function (a) {
      if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.start || ''))) return;
      if (!min || a.start < min) min = a.start;
    });

    var end = reportDay();
    if (max && max > end) end = max;
    var start = min || end;

    // continuous date spine + running cumulative totals per platform
    var dates = [], cum = { ios: {}, android: {}, all: {} };
    var run = { ios: blank(), android: blank(), all: blank() };
    for (var d = start; d <= end; d = addDays(d, 1)) {
      dates.push(d);
      ['ios', 'android', 'all'].forEach(function (p) {
        var r = byPlat[p][d];
        if (r) FIELDS.forEach(function (f) { run[p][f] += r[f]; });
        var c = {};
        FIELDS.forEach(function (f) { c[f] = run[p][f]; });
        cum[p][d] = c;
      });
    }

    cache = { byPlat: byPlat, cum: cum, dates: dates, start: start, end: end, min: min, max: max };
    return cache;
  }

  function dayRec(p, d) {
    return base().byPlat[p][d] || blank();
  }
  /* cumulative value at a date, clamped to the data spine (0 before it starts) */
  function cumAt(p, d, field) {
    var b = base();
    if (!b.dates.length) return 0;
    if (d < b.start) return 0;
    if (d > b.end) d = b.end;
    var c = b.cum[p][d];
    return c ? c[field] : 0;
  }

  function trialDays() { return Math.max(1, num(db.settings.trialDays) || 14); }
  /* The limit is inclusive — day 14 is still inside the trial — so a cohort
     leaves on the day AFTER it. This is the shift every threshold metric is
     derived with. */
  function trialExit() { return trialDays() + 1; }

  /* There was a SECOND boundary here once: a shorter trial, and then a separate
     "history wall" some days later where a free user lost their older charts.
     The app now runs one fourteen-day trial and the free tier's history clip
     falls on the same day it ends, so the wall describes the same moment the
     trial exit does. These two survive as aliases rather than as a stored
     setting: every `wallHit` / `pastWall` field below is therefore numerically
     identical to its trial twin by construction, and cannot drift back apart
     the way a second settings field silently did. New code should say trial. */
  function wallDays() { return trialDays(); }
  function wallExit() { return trialExit(); }

  /* selected range as an inclusive [from,to] pair of ISO dates */
  function activeRange() {
    var b = base();
    var end = b.end, start = b.start;
    if (state.range === 'custom' && state.from && state.to) {
      return { from: state.from <= state.to ? state.from : state.to, to: state.to >= state.from ? state.to : state.from };
    }
    if (state.range === 'all') return { from: start, to: end };
    var n = parseInt(state.range, 10) || 30;
    var f = addDays(end, -(n - 1));
    return { from: f < start ? start : f, to: end };
  }

  function bucketOf(d) {
    return state.grain === 'week' ? weekStart(d) : state.grain === 'month' ? monthStart(d) : d;
  }
  function bucketLabel(key, grain) {
    grain = grain || state.grain;
    if (grain === 'month') return { label: labelMonth(key), full: labelMonth(key) };
    if (grain === 'week') return { label: labelDay(key), full: 'Week of ' + WD[dow(key)] + ' ' + labelFull(key) };
    return { label: labelDay(key), full: WD[dow(key)] + ' ' + labelFull(key) };
  }

  /* Build per-bucket metrics for one platform key over a date range. */
  function buildBuckets(p, from, to, grain) {
    grain = grain || state.grain;
    var T = trialExit(), Wd = wallExit();
    var order = [], map = {};
    var b = base();
    if (!b.dates.length) return [];
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var k = grain === 'week' ? weekStart(d) : grain === 'month' ? monthStart(d) : d;
      var row = map[k];
      if (!row) {
        row = map[k] = {
          key: k, start: d, end: d,
          downloads: 0, impressions: 0, pageViews: 0, updates: 0, sales: 0, revenue: 0,
          trialEnd: 0, wallHit: 0
        };
        order.push(row);
      }
      row.end = d;
      var r = dayRec(p, d);
      row.downloads += r.downloads; row.impressions += r.impressions; row.pageViews += r.pageViews;
      row.updates += r.updates; row.sales += r.sales; row.revenue += r.revenue;
      // cohorts crossing a threshold on day d are the installs from T / Wd days earlier
      row.trialEnd += dayRec(p, addDays(d, -T)).downloads;
      row.wallHit += dayRec(p, addDays(d, -Wd)).downloads;
    }

    order.forEach(function (row) {
      var e = row.end;
      row.cumDownloads = cumAt(p, e, 'downloads');
      row.cumSales = cumAt(p, e, 'sales');
      row.cumRevenue = cumAt(p, e, 'revenue');
      row.cumTrialEnd = cumAt(p, addDays(e, -T), 'downloads');
      row.cumWallHit = cumAt(p, addDays(e, -Wd), 'downloads');
      row.inTrial = row.cumDownloads - row.cumTrialEnd;
      /* One boundary now, so this band is empty by construction: it used to
         hold the installs between the trial ending and the history wall biting,
         and those two are the same day. Kept as a field because the export
         columns and the stacked chart both still name it, and zero is the
         honest value rather than a missing key. */
      row.pastTrial = row.cumTrialEnd - row.cumWallHit;
      row.pastWall = row.cumWallHit;

      // store conversion is always derived — downloads over impressions
      row.convRate = row.impressions ? (row.downloads / row.impressions) * 100 : null;
      row.ppvConv = row.pageViews ? (row.downloads / row.pageViews) * 100 : null;
      row.tapThrough = row.impressions ? (row.pageViews / row.impressions) * 100 : null;
      row.arppu = row.sales ? row.revenue / row.sales : null;
      row.rpi = row.downloads ? row.revenue / row.downloads : null;
      row.paidOfTrial = row.cumTrialEnd ? (row.cumSales / row.cumTrialEnd) * 100 : null;
      row.paidOfWall = row.cumWallHit ? (row.cumSales / row.cumWallHit) * 100 : null;
      row.paidOfInstalls = row.cumDownloads ? (row.cumSales / row.cumDownloads) * 100 : null;
    });
    return order;
  }

  /* Totals for a platform over [from,to], plus all-time state at `to`. */
  function summarize(p, from, to) {
    var T = trialExit(), Wd = wallExit();
    var s = {
      downloads: 0, impressions: 0, pageViews: 0, updates: 0, sales: 0, revenue: 0,
      trialEnd: 0, wallHit: 0,          // crossings that happened DURING the range
      cohortPastTrial: 0, cohortPastWall: 0  // maturity of the range's OWN installs, as of today
    };
    if (base().dates.length) {
      var now = base().end;
      for (var d = from; d <= to; d = addDays(d, 1)) {
        var r = dayRec(p, d);
        s.downloads += r.downloads; s.impressions += r.impressions; s.pageViews += r.pageViews;
        s.updates += r.updates; s.sales += r.sales; s.revenue += r.revenue;
        s.trialEnd += dayRec(p, addDays(d, -T)).downloads;
        s.wallHit += dayRec(p, addDays(d, -Wd)).downloads;
        var age = diffDays(d, now);
        if (age >= T) s.cohortPastTrial += r.downloads;
        if (age >= Wd) s.cohortPastWall += r.downloads;
      }
    }
    s.totalInstalls = cumAt(p, to, 'downloads');
    s.totalSales = cumAt(p, to, 'sales');
    s.totalRevenue = cumAt(p, to, 'revenue');
    s.outOfTrial = cumAt(p, addDays(to, -T), 'downloads');
    s.hitWall = cumAt(p, addDays(to, -Wd), 'downloads');
    s.inTrial = s.totalInstalls - s.outOfTrial;
    s.betweenTrialAndWall = s.outOfTrial - s.hitWall;
    s.convOfInstalls = s.totalInstalls ? (s.totalSales / s.totalInstalls) * 100 : null;
    s.convOfOutOfTrial = s.outOfTrial ? (s.totalSales / s.outOfTrial) * 100 : null;
    s.convOfWall = s.hitWall ? (s.totalSales / s.hitWall) * 100 : null;
    s.storeConv = s.impressions ? (s.downloads / s.impressions) * 100 : null;
    s.ppvConv = s.pageViews ? (s.downloads / s.pageViews) * 100 : null;
    s.tapThrough = s.impressions ? (s.pageViews / s.impressions) * 100 : null;
    s.arppu = s.totalSales ? s.totalRevenue / s.totalSales : null;
    s.rpi = s.totalInstalls ? s.totalRevenue / s.totalInstalls : null;
    return s;
  }

  /* which platform keys the current filter puts on screen */
  function platKeys() {
    if (state.platform === 'ios') return ['ios'];
    if (state.platform === 'android') return ['android'];
    return ['all'];
  }
  function platName(k) { return k === 'all' ? 'All platforms' : PLATFORMS[k]; }
  function platColor(k) { return k === 'all' ? ENTITY.downloads : ENTITY[k]; }
  /* The filter bar once carried a fourth option, `compare`, which drew iOS and
     Android as two series in every chart. It is gone: it doubled the series
     count on charts that were already stacked, it had no single answer for any
     tile (so half of them silently fell back to combined), and the iOS vs
     Android tab answers the same question properly. This survives as a constant
     `false` so the branches that read it collapse rather than being deleted one
     by one — a `compare` in a saved filter state now simply reads as combined. */
  function isCompare() { return false; }

  /* --------------------------------------------------------------- charts */

  var chartCfgs = {};

  function drawChart(id, cfg) {
    var host = document.getElementById(id);
    if (!host) return;
    chartCfgs[id] = cfg;
    Chart.render(host, cfg);
    var t = document.getElementById(id + '-table');
    if (t && !t.classList.contains('hidden')) t.innerHTML = Chart.tableHTML(cfg);
  }

  function xAxis(rows, grain) {
    return rows.map(function (r) { return bucketLabel(r.key, grain); });
  }

  /* ------------------------------------------------------------ tiles */

  /** One signed percentage as its own coloured span. `invert` is for the
   *  measures where down is the good direction. */
  function deltaSpan(pct, invert) {
    if (pct === undefined || pct === null || !isFinite(pct)) return '';
    var cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    if (invert) cls = cls === 'up' ? 'down' : cls === 'down' ? 'up' : 'flat';
    var arrow = pct > 0.05 ? '▲' : pct < -0.05 ? '▼' : '■';
    return '<span class="delta ' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(1) + '%</span>';
  }

  /** A RATE's move, in percentage POINTS.
   *
   *  A share that goes from 20% to 25% did not go up 5%, and reporting it that
   *  way is the oldest wrong number in analytics — it is up 5 points, or up
   *  25%, and only one of those two is what a reader takes from a "%" glued to
   *  a percentage tile. Every tile whose VALUE is already a percentage takes
   *  this instead of `delta`. */
  function ptsSpan(pts, invert) {
    if (pts === undefined || pts === null || !isFinite(pts)) return '';
    var cls = pts > 0.05 ? 'up' : pts < -0.05 ? 'down' : 'flat';
    if (invert) cls = cls === 'up' ? 'down' : cls === 'down' ? 'up' : 'flat';
    var arrow = pts > 0.05 ? '\u25b2' : pts < -0.05 ? '\u25bc' : '\u25a0';
    return '<span class="delta ' + cls + '">' + arrow + ' ' +
      Math.abs(pts).toFixed(1) + ' pts</span>';
  }

  function tile(o) {
    var delta = deltaSpan(o.delta, o.invertDelta) || ptsSpan(o.deltaPts, o.invertDelta);
    /* The stacked comparisons under a day tile. A count on its own says
       nothing about whether it is a good day: `deltas` is the same number read
       against yesterday, against the same weekday a week ago (traffic here is
       strongly weekly, so Monday only means anything beside another Monday)
       and against the range's own average. Rows whose baseline was too small
       to divide by are dropped upstream — see dayDeltas — so a tile with
       nothing honest to compare simply shows no block. */
    var deltas = '';
    var rows = (o.deltas || []).filter(function (d) {
      return d && d.pct !== undefined && d.pct !== null && isFinite(d.pct);
    });
    if (rows.length) {
      deltas = '<div class="deltas">' + rows.map(function (d) {
        return '<div>' + deltaSpan(d.pct, o.invertDelta) +
          '<span>' + esc(d.label) + '</span></div>';
      }).join('') + '</div>';
    }
    /* A tile may carry two splits, and they are two ROWS rather than one long
       wrapping line: a store split and a sensor split answer different
       questions about the same count, and run together they read as one list
       of seven things that do not sum to anything. */
    function splitRow(parts) {
      if (!parts || !parts.length) return '';
      return '<div class="split">' + parts.map(function (s) {
        return '<span><span class="swatch" style="background:' + s.color + '"></span> ' + esc(s.name) + ' <b>' + s.value + '</b></span>';
      }).join('') + '</div>';
    }
    var split = splitRow(o.split) + splitRow(o.splitB);
    /* Everything under the value goes in ONE wrapper, because on a phone the
       tile is condensed to its label and its number and this is the part that
       is folded away — see `.cards.condensed` in styles.css and `toggleTile`
       below. One element to measure and one to animate; the desktop tile is
       unchanged, since the wrapper carries no styling of its own. */
    var more = (o.meta ? '<div class="meta">' + o.meta + '</div>' : '') +
      deltas + split +
      (o.spark ? '<div style="margin-top:8px">' + o.spark + '</div>' : '');

    return '<div class="card tile' + (more ? ' has-more' : '') + '">' +
      (more ? '<span class="tile-chev" aria-hidden="true">›</span>' : '') +
      '<div class="label">' + (o.color ? '<span class="swatch" style="background:' + o.color + '"></span>' : '') + esc(o.label) + '</div>' +
      '<div class="value' + (o.smallValue ? ' small' : '') + '">' + o.value + (delta ? ' ' + delta : '') + '</div>' +
      (more ? '<div class="tile-more">' + more + '</div>' : '') +
      '</div>';
  }

  /* ---------------------------------------------------------- tile layout
   *
   * How many tiles go on a row, decided here rather than by the stylesheet.
   *
   * "As many as fit" is the wrong answer whenever the count does not divide by
   * it: six columns and eight tiles leaves the last two sitting beside a
   * four-column void, with a whole block of tiles below it. `.cards` is a flex
   * row (see styles.css) so the trailing row always GROWS into that space, but
   * left alone that turns two tiles into two half-page slabs.
   *
   * So the column count is chosen to make the last row as full as it can be:
   * eight tiles go 4 + 4 rather than 6 + 2, fourteen go 5 + 5 + 4 rather than
   * 6 + 6 + 2. Only the top two or three counts are considered, so a row never
   * thins out just to divide evenly, and a set that fits on one row keeps it.
   *
   * The minimum tile width lives in the stylesheet as `--tile-min`, so the
   * measurement and the CSS fallback cannot drift apart. */
  function tileColumns(n, maxCols) {
    if (n <= maxCols) return n;
    /* Never down to a single column while two fit. One column divides ANY count
       perfectly, so on a phone — where `maxCols` is 2 and the window below
       reaches `maxCols - 2` — "fullest last row" chose it every time and the
       condensed row was a stack of full-width cards. The rule this loop is for
       is trimming a wide row to balance its tail, not collapsing a narrow one. */
    var lo = Math.max(1, maxCols - 2);
    if (maxCols >= 2) lo = Math.max(lo, 2);
    var best = maxCols, bestFill = -1;
    for (var c = lo; c <= maxCols; c++) {
      var rest = n % c, fill = (rest === 0 ? c : rest) / c;
      if (fill >= bestFill) { bestFill = fill; best = c; }   // ties go to the wider row
    }
    return best;
  }

  /* The tiles of one row, flattened past any `.tile-group` (which is
     `display: contents`, so its children are the flex items, not it). */
  function tileItems(host) {
    var items = [];
    [].slice.call(host.children).forEach(function (el) {
      if (el.classList.contains('tile-group')) items = items.concat([].slice.call(el.children));
      else items.push(el);
    });
    return items;
  }

  /* ------------------------------------------------------ condensed tiles
   *
   * On a phone a stat tile is its LABEL and its NUMBER, and nothing else.
   *
   * The tiles carry a lot under the number — a store split, a sensor split,
   * three baselines to read the day against — and all of it is worth having on
   * a desktop, where a row of six sits above the fold. On a 390px screen the
   * same eleven tiles are a full screen of scrolling before the first chart,
   * and the reader is looking for one number. So the phone shows two columns of
   * label + value, and the rest is one tap away.
   *
   * Opening one is a real transition rather than a re-render: the tile grows
   * across the row while its neighbours slide to where they now belong. That
   * movement is not decoration — it is the only thing that says the wide card
   * you are now reading is the small one you just pressed, on a screen where
   * everything else moved at the same moment.
   *
   * How it is done, and why it is not simply a CSS class:
   *
   *   The width and the height are CSS transitions on the tile itself
   *   (`flex-basis`, and an inline `max-height` on `.tile-more` because `auto`
   *   is not animatable). The NEIGHBOURS are FLIPped — measured before, measured
   *   after, inverted with a transform and released — because their move is a
   *   change of flex line, which reflow does instantly and no property can tween.
   *
   *   The "after" pass is taken with the opening tile's body still folded, so
   *   the neighbours' final positions are their positions at t=0 of the height
   *   growth rather than after it. Measured the other way, every neighbour
   *   starts the animation a card's height above where it actually is and
   *   drifts down into place, which reads as a bug in the layout.
   *
   * Only one tile is open at a time. Two open tiles on a phone is a list of
   * cards with a two-column row wedged in the middle of it, and the point of
   * the condensed row is that it is skimmable. */
  var TILE_ANIM_MS = 420;

  function tilesCondensed() {
    try { return window.matchMedia('(max-width: 700px)').matches; }
    catch (e) { return false; }
  }

  /** The flex-basis every tile in `host` should hold, written to `data-basis`
   *  so an animation can play toward it and layout can restore it. */
  function applyBases(host, items) {
    var w = host.clientWidth;
    if (!items.length || !w) return;             // a hidden view has no width to divide
    var cs = getComputedStyle(host);
    var gap = parseFloat(cs.columnGap) || 14;
    var min = parseFloat(cs.getPropertyValue('--tile-min')) || 215;
    var maxCols = Math.max(1, Math.floor((w + gap) / (min + gap)));
    /* An expanded tile owns its own line, so the columns are chosen for the
       ones that still share rows. */
    var rest = items.filter(function (el) { return !el.classList.contains('expanded'); });
    var cols = tileColumns(rest.length || items.length, maxCols);
    var basis = 'calc((100% - ' + ((cols - 1) * gap) + 'px) / ' + cols + ')';
    items.forEach(function (el) {
      var b = el.classList.contains('expanded') ? '100%' : basis;
      el.style.flexBasis = b;
    });
  }

  function layoutTiles() {
    /* Never mid-tween: inserting the placeholder is itself a mutation, so the
       observer below calls straight back into here while a tile is out of
       flow. `settleTiles` is what ends a tween, not this. */
    if (flying) return;
    document.querySelectorAll('.cards').forEach(function (host) {
      var condensed = tilesCondensed();
      host.classList.toggle('condensed', condensed);
      /* Leaving the phone width behind takes every fold with it: a tile left
         open in a rotated phone would otherwise be the one wide card in a row
         of six. */
      if (!condensed) {
        tileItems(host).forEach(function (el) {
          el.classList.remove('expanded');
          el.style.transform = '';
          var m = el.querySelector('.tile-more');
          if (m) m.style.maxHeight = '';
        });
      }
      applyBases(host, tileItems(host));
    });
  }

  var tileAnimTimer = 0;
  var flying = null;          // { host, el, ph, items } while a tween is running

  /** Put a finished (or interrupted) tween back into the ordinary flow. */
  function settleTiles() {
    window.clearTimeout(tileAnimTimer);
    if (!flying) return;
    var f = flying;
    flying = null;
    f.items.forEach(function (t) { t.style.transform = ''; });
    f.el.classList.remove('tile-flying');
    ['position', 'left', 'top', 'width', 'height', 'margin', 'zIndex'].forEach(function (k) {
      f.el.style[k] = '';
    });
    var m = f.el.querySelector('.tile-more');
    if (m) m.style.maxHeight = '';
    if (f.ph.parentNode) f.ph.parentNode.removeChild(f.ph);
    applyBases(f.host, tileItems(f.host));
  }

  /**
   * Open `el` — or close it, if it is the one already open — and move
   * everything else out of the way.
   *
   * The tile being opened leaves the flow for the length of the tween and a
   * PLACEHOLDER takes its slot. That is the whole trick, and it is worth the
   * twenty lines: a flex item cannot be widened smoothly in place, because the
   * moment its basis passes half the row its neighbour wraps to the next line
   * and `flex-grow` snaps the widened tile across the whole row in one frame —
   * measured, the width went 177px to 366px between two frames while the height
   * tweened perfectly. Out of flow it is just a box with a left, a top, a width
   * and a height, all four of which animate; the placeholder holds the final
   * slot, so nothing else has to guess where the row is going.
   *
   * The other tiles are FLIPped — measured before, measured after, inverted with
   * a transform and released — because their move is a change of flex line, and
   * reflow does that instantly whatever you transition.
   *
   * The "after" pass is taken with the placeholder still at the OLD height, so
   * their final positions are their positions at the start of the growth rather
   * than after it. The placeholder then grows under them, which carries them
   * (and the charts below the row) down at the same speed the card opens.
   * Measured the other way, every tile below starts a card-height too high and
   * drifts down into place, which reads as a bug in the layout.
   */
  function toggleTile(el) {
    var host = el.parentNode && el.parentNode.classList.contains('tile-group')
      ? el.parentNode.parentNode : el.parentNode;
    if (!host || !host.classList.contains('cards')) return;

    settleTiles();                       // finish anything still in flight first
    var items = tileItems(host);
    var hostBox = host.getBoundingClientRect();
    var before = items.map(function (t) { return t.getBoundingClientRect(); });
    var mine = before[items.indexOf(el)];

    var opening = !el.classList.contains('expanded');
    items.forEach(function (t) { t.classList.remove('expanded'); });
    if (opening) el.classList.add('expanded');

    /* The stand-in. It carries the `expanded` class so `applyBases` gives it
       the width the tile is heading for, and it starts at the tile's CURRENT
       height so nothing below the row has moved yet. */
    var ph = document.createElement('div');
    ph.className = 'tile-ph' + (opening ? ' expanded' : '');
    ph.style.height = mine.height + 'px';
    el.parentNode.insertBefore(ph, el);

    host.classList.add('tiles-still');
    el.classList.add('tile-flying');
    el.style.position = 'absolute';
    el.style.margin = '0';
    el.style.zIndex = '2';
    var more = el.querySelector('.tile-more');
    /* Folded for the MEASUREMENT below and held open for the tween itself.
       Both halves matter. The height the tile is heading for is the height it
       will rest at, which on the way back down is the header alone — measured
       with the body still open, a closing tile grew to 209px before snapping to
       80, because the same text is TALLER in a half-width column. And during
       the tween the body has to stay laid out, or the text would vanish in one
       frame and leave an empty box shrinking. */
    if (more) more.style.maxHeight = opening ? 'none' : '0px';

    applyBases(host, items.map(function (t) { return t === el ? ph : t; }));

    var after = items.map(function (t) { return t.getBoundingClientRect(); });
    var slot = ph.getBoundingClientRect();
    // The height the tile wants at the width it is heading for.
    el.style.width = slot.width + 'px';
    el.style.height = 'auto';
    var wantH = el.offsetHeight;
    if (more) more.style.maxHeight = 'none';

    // Invert: put everything back where it was, with nothing transitioning.
    items.forEach(function (t, i) {
      if (t === el) return;
      var dx = before[i].left - after[i].left;
      var dy = before[i].top - after[i].top;
      if (dx || dy) t.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    el.style.left = (mine.left - hostBox.left) + 'px';
    el.style.top = (mine.top - hostBox.top) + 'px';
    el.style.width = mine.width + 'px';
    el.style.height = mine.height + 'px';

    void host.offsetHeight;              // flush the inverted frame
    host.classList.remove('tiles-still');
    flying = { host: host, el: el, ph: ph, items: items };

    // Play.
    window.requestAnimationFrame(function () {
      if (!flying) return;
      items.forEach(function (t) { if (t !== el) t.style.transform = ''; });
      el.style.left = (slot.left - hostBox.left) + 'px';
      el.style.top = (slot.top - hostBox.top) + 'px';
      el.style.width = slot.width + 'px';
      el.style.height = wantH + 'px';
      ph.style.height = wantH + 'px';
    });

    /* Hand the resting state back to the stylesheet once it is over: an open
       tile has to be free to reflow — a rotation, a refresh that changes its
       rows — which a pinned pixel height would prevent. */
    tileAnimTimer = window.setTimeout(settleTiles, TILE_ANIM_MS + 40);
  }

  /* Tiles are written straight into `innerHTML` from a dozen render functions;
     watching for that is one hook rather than a dozen call sites. renderAll
     calls it too, for the case a view is shown without its content changing. */
  function watchTileRows() {
    /* One delegated listener rather than a handler per tile: the rows are
       rewritten wholesale on every refresh, and a listener bound to a node that
       innerHTML has since replaced is a leak with no symptom. */
    document.addEventListener('click', function (e) {
      if (!tilesCondensed()) return;
      var t = e.target;
      while (t && t !== document.body) {
        if (t.classList && t.classList.contains('tile')) break;
        t = t.parentNode;
      }
      if (!t || t === document.body || !t.classList.contains('has-more')) return;
      toggleTile(t);
    });
    /* Crossing the phone breakpoint changes the column count AND retires any
       open tile — see layoutTiles. */
    window.addEventListener('resize', function () { settleTiles(); layoutTiles(); });

    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function () { layoutTiles(); });
    document.querySelectorAll('.cards').forEach(function (host) {
      mo.observe(host, { childList: true, subtree: true });
    });
  }

  /* A delta is only honest when the comparison window is fully covered by data —
     otherwise "up 391%" just means the previous window predates the first entry. */
  var deltaOK = true;
  function pctDelta(cur, prev) {
    if (!deltaOK || !prev) return null;
    return ((cur - prev) / prev) * 100;
  }

  /* --------------------------------------------------------- view: overview */

  function renderOverview() {
    var r = activeRange();
    var keys = platKeys();
    var prevTo = addDays(r.from, -1);
    var prevFrom = addDays(prevTo, -diffDays(r.from, r.to));
    deltaOK = base().min !== null && prevFrom >= base().min;

    var cur = {}, prev = {};
    ['all', 'ios', 'android'].forEach(function (p) {
      cur[p] = summarize(p, r.from, r.to);
      prev[p] = summarize(p, prevFrom, prevTo);
    });
    var main = isCompare() ? 'all' : keys[0];
    var s = cur[main], ps = prev[main];

    var rowsMain = buildBuckets(main, r.from, r.to);
    var spark = function (field, color) {
      return Chart.sparkline(rowsMain.map(function (x) { return x[field]; }), color);
    };
    var splitOf = function (fn) {
      return isCompare() ? [
        { name: 'iOS', color: ENTITY.ios, value: fn(cur.ios) },
        { name: 'Android', color: ENTITY.android, value: fn(cur.android) }
      ] : null;
    };

    var tiles = [
      tile({
        label: 'First-time downloads', color: ENTITY.downloads, value: fmtInt(s.downloads),
        delta: pctDelta(s.downloads, ps.downloads),
        meta: 'in range · ' + fmtInt(s.totalInstalls) + ' all time',
        split: splitOf(function (x) { return fmtInt(x.downloads); }),
        spark: spark('downloads', ENTITY.downloads)
      }),
      tile({
        label: 'Out of trial (past day ' + trialDays() + ')', color: ENTITY.trialEnd, value: fmtInt(s.outOfTrial),
        meta: pctOf(s.outOfTrial, s.totalInstalls) + ' of all installs · ' + fmtInt(s.inTrial) + ' still in trial',
        split: splitOf(function (x) { return fmtInt(x.outOfTrial); })
      }),
      tile({
        label: 'Paid conversions', color: ENTITY.sales, value: fmtInt(s.totalSales),
        delta: pctDelta(s.sales, ps.sales),
        meta: fmtInt(s.sales) + ' in range · ' + fmtMoney(s.totalRevenue) + ' all time',
        split: splitOf(function (x) { return fmtInt(x.totalSales); }),
        spark: spark('sales', ENTITY.sales)
      }),
      tile({
        label: 'Convert rate — past trial', value: fmtPct(s.convOfOutOfTrial),
        meta: fmtInt(s.totalSales) + ' paid ÷ ' + fmtInt(s.outOfTrial) + ' who finished the trial',
        split: splitOf(function (x) { return fmtPct(x.convOfOutOfTrial); })
      }),
      tile({
        label: 'Revenue', color: ENTITY.revenue, value: fmtMoney(s.revenue), smallValue: true,
        delta: pctDelta(s.revenue, ps.revenue),
        meta: 'in range · ' + fmtMoney(s.arppu) + ' per paying user',
        split: splitOf(function (x) { return fmtMoney(x.revenue); }),
        spark: spark('revenue', ENTITY.revenue)
      }),
      tile({
        label: 'Impression → install', value: fmtPct(s.storeConv), smallValue: true,
        meta: fmtInt(s.impressions) + ' impressions → ' + fmtInt(s.downloads) + ' downloads',
        split: splitOf(function (x) { return fmtPct(x.storeConv); })
      }),
      tile({
        label: 'Page view → install', color: ENTITY.pageViews, value: fmtPct(s.ppvConv), smallValue: true,
        meta: fmtInt(s.pageViews) + ' product page views → ' + fmtInt(s.downloads) + ' downloads',
        split: splitOf(function (x) { return fmtPct(x.ppvConv); })
      }),
      tile({
        label: 'Impression → page view', value: fmtPct(s.tapThrough), smallValue: true,
        meta: fmtInt(s.impressions) + ' impressions → ' + fmtInt(s.pageViews) + ' page views',
        split: splitOf(function (x) { return fmtPct(x.tapThrough); })
      })
    ];

    document.getElementById('ovTiles').innerHTML = tiles.join('');
    renderOverviewMoney(r);

    /* main chart — downloads with the two thresholds shaded underneath */
    var cumulative = state.ovMode === 'cumulative';
    document.getElementById('ovChartTitle').textContent =
      cumulative ? 'Cumulative downloads and thresholds' : 'Downloads over time';
    document.getElementById('ovChartHint').innerHTML = cumulative
      ? 'Everyone who has ever installed, and how many of them have since passed the ' + trialDays() +
        '-day trial. Paid conversions are on the same axis — same unit, so the gap between the '
        + 'past-trial band and the paid line is the conversion you are leaving on the table.'
      : 'The line is new installs. The shaded band is the same installs re-plotted on the day they aged out of the ' +
        trialDays() + '-day trial — so a spike moves right across the chart as that cohort matures.';

    var series = [];
    if (isCompare()) {
      ['ios', 'android'].forEach(function (p) {
        var rows = buildBuckets(p, r.from, r.to);
        series.push(mk(rows, p, cumulative ? 'cumDownloads' : 'downloads', platName(p) + ' downloads', ENTITY[p], 'line'));
        series.push(mk(rows, p, cumulative ? 'cumTrialEnd' : 'trialEnd', platName(p) + ' past trial', ENTITY[p], 'area', true));
      });
    } else {
      series = [
        mk(rowsMain, main, cumulative ? 'cumDownloads' : 'downloads', 'First-time downloads', ENTITY.downloads, 'line'),
        mk(rowsMain, main, cumulative ? 'cumTrialEnd' : 'trialEnd', 'Past the ' + trialDays() + '-day trial', ENTITY.trialEnd, 'area')
      ];
      // paid is the same unit (people), so it shares the axis honestly — it sits low
      // against the thresholds, which is exactly the comparison worth seeing
      if (cumulative) series.push(mk(rowsMain, main, 'cumSales', 'Paid', ENTITY.sales, 'line'));
    }
    drawChart('ovChart', {
      x: xAxis(rowsMain), series: series, height: 320, format: fmtInt, xLabel: 'Period',
      ariaLabel: 'Downloads over time with the trial threshold',
      tooltipNote: (!cumulative && state.grain === 'day') ? function (i) {
        var row = rowsMain[i];
        if (!row) return '';
        return 'The trial band here is the cohort that installed on ' + labelFull(addDays(row.start, -trialExit()));
      } : null
    });

    /* lifecycle mix */
    var lifeSeries;
    if (isCompare()) {
      lifeSeries = ['ios', 'android'].map(function (p) {
        var rows = buildBuckets(p, r.from, r.to);
        return mk(rows, p, 'cumDownloads', platName(p) + ' installs', ENTITY[p], 'area');
      });
      drawChart('ovStack', { x: xAxis(rowsMain), series: lifeSeries, stacked: true, height: 260, format: fmtInt });
    } else {
      lifeSeries = [
        mk(rowsMain, main, 'inTrial', 'In free trial (day 0–' + trialDays() + ')', ENTITY.inTrial, 'area'),
        mk(rowsMain, main, 'pastWall', 'Past the trial — Pro features locked', ENTITY.wallHit, 'area')
      ];
      drawChart('ovStack', { x: xAxis(rowsMain), series: lifeSeries, stacked: true, height: 260, format: fmtInt });
    }

    /* store reach — impressions alone; page views live on the next card beside the
       installs they produced, and the tap-through rate is a tile */
    var reachSeries = isCompare()
      ? ['ios', 'android'].map(function (p) {
          return mk(buildBuckets(p, r.from, r.to), p, 'impressions', platName(p) + ' impressions', ENTITY[p], 'line');
        })
      : [mk(rowsMain, main, 'impressions', 'Impressions', ENTITY.impressions, 'area')];
    drawChart('ovReach', { x: xAxis(rowsMain), series: reachSeries, height: 260, format: fmtInt });

    /* page views -> installs */
    var storeSeries = isCompare()
      ? ['ios', 'android'].reduce(function (acc, p) {
          var rows = buildBuckets(p, r.from, r.to);
          acc.push(mk(rows, p, 'pageViews', platName(p) + ' page views', ENTITY[p], 'area'));
          acc.push(mk(rows, p, 'downloads', platName(p) + ' downloads', ENTITY[p], 'line', true));
          return acc;
        }, [])
      : [
          mk(rowsMain, main, 'downloads', 'First-time downloads', ENTITY.downloads, 'line'),
          mk(rowsMain, main, 'pageViews', 'Product page views', ENTITY.pageViews, 'area')
        ];
    drawChart('ovStore', { x: xAxis(rowsMain), series: storeSeries, height: 260, format: fmtInt });

    /* sales & revenue — counts and money never share an axis, so revenue gets its own card row */
    var salesSeries = isCompare()
      ? ['ios', 'android'].map(function (p) {
          return mk(buildBuckets(p, r.from, r.to), p, 'sales', platName(p) + ' sales', ENTITY[p], 'bar');
        })
      : [mk(rowsMain, main, 'sales', 'Paid conversions', ENTITY.sales, 'bar')];
    drawChart('ovSales', {
      x: xAxis(rowsMain), series: salesSeries, height: 260, format: fmtInt, stacked: isCompare(),
      tooltipNote: function (i) {
        var row = rowsMain[i];
        return row ? 'Revenue ' + fmtMoney(row.revenue) : '';
      }
    });

    /* conversion rates — both are percentages, so they share one axis honestly */
    var convSeries = isCompare()
      ? ['ios', 'android'].reduce(function (acc, p) {
          var rr = buildBuckets(p, r.from, r.to);
          acc.push(mk(rr, p, 'ppvConv', platName(p) + ' page view → install', ENTITY[p], 'line'));
          acc.push(mk(rr, p, 'convRate', platName(p) + ' impression → install', ENTITY[p], 'line', true));
          return acc;
        }, [])
      : [
          mk(rowsMain, main, 'ppvConv', 'Page view → install', ENTITY.pageViews, 'line'),
          mk(rowsMain, main, 'convRate', 'Impression → install', ENTITY.downloads, 'line')
        ];
    convSeries.forEach(function (s) { s.format = fmtPct; });
    drawChart('ovConv', {
      x: xAxis(rowsMain), series: convSeries, height: 260, format: fmtPct,
      yTickFormat: function (v) { return v.toFixed(v < 10 ? 1 : 0) + '%'; }
    });

    renderWeekday(r);
  }

  /**
   * The Overview's money strip.
   *
   * It reads the same two engines the Costs and Sales views do — `CS.summary`
   * for the cash and `Sales.summarize` for the recurring side — rather than
   * doing any arithmetic of its own, so a number here can never disagree with
   * the view it came from. Four rules it inherits from them, each of which was
   * a decision made once and must not be re-made here:
   *
   * - **Gross and net are both shown.** Entries carry the customer-facing
   *   price; the store keeps 15% or 30%. Profit is always struck against the
   *   net, and the commission is named rather than silently applied.
   * - **Cash and MRR are never blended.** An annual plan is a year of cash on
   *   one day and a twelfth of its price every month; a single figure called
   *   "revenue" that picked one is the thing the Sales view was built to stop.
   * - **Everything here is BOTH stores.** No ad network splits spend the way
   *   the stores split downloads, and a hosting bill is neither, so the filter
   *   bar does not apply and the strip says so.
   * - **Cost per install is blended** — marketing ÷ every install, organic
   *   ones included — which is the honest ceiling rather than the number an ad
   *   network reports about its own work.
   *
   * The whole strip is hidden when there is no money at all to report, rather
   * than sitting at six zeroes above the funnel.
   */
  function renderOverviewMoney(r) {
    var host = document.getElementById('ovMoney');
    var head = document.getElementById('ovMoneyHead');
    if (!host) return;

    var money = costSummary(r);
    var ix = Sales.index(salesList(), 'all');
    var s = Sales.summarize(ix, r.from, r.to);
    var live = money.spend || money.grossRevenue || s.mrr || s.bookings;

    if (head) head.classList.toggle('hidden', !live);
    host.classList.toggle('hidden', !live);
    if (!live) { host.innerHTML = ''; return; }

    var cut = storeCut();
    var tiles = [
      tile({
        label: 'Net profit in range', color: money.profit >= 0 ? COLOR.s3 : COLOR.red,
        value: fmtMoney(money.profit), smallValue: true,
        meta: fmtMoney(money.netRevenue) + ' after the store cut − ' + fmtMoney(money.spend) + ' spent' +
          (money.margin === null ? '' : ' · ' + fmtPct(money.margin) + ' margin')
      }),
      tile({
        label: 'Spend in range', color: ENTITY.impressions,
        value: fmtMoney(money.spend), smallValue: true,
        meta: fmtMoney(money.marketing) + ' marketing · ' + fmtMoney(money.other) + ' everything else'
      }),
      tile({
        label: 'Revenue, net of commission', color: ENTITY.revenue,
        value: fmtMoney(money.netRevenue), smallValue: true,
        meta: fmtMoney(money.grossRevenue) + ' at list · ' + fmtMoney(money.commission) +
          ' kept by the stores at ' + cut + '%'
      })
    ];

    /* The recurring side. `active` counts subscriptions only — a lifetime
       purchase and an unclassified legacy row are real money with no term, so
       counting either would put "13 active" beside an MRR that does not
       include them. Both are named in the meta line instead. */
    var noTerm = s.activeByPlan.lifetime.count + s.activeByPlan.unknown.count;
    tiles.push(tile({
      label: 'MRR at ' + labelDay(r.to), color: ENTITY.sales,
      value: fmtMoney(s.mrr), smallValue: true,
      meta: fmtMoney(s.arr) + ' a year · ' + fmtInt(s.active) + ' active ' +
        (s.active === 1 ? 'subscription' : 'subscriptions') +
        (noTerm ? ' · ' + fmtInt(noTerm) + ' more carry no term and are not in it' : '')
    }));

    tiles.push(tile({
      label: 'Bookings in range', color: ENTITY.sales,
      value: fmtMoney(s.bookings), smallValue: true,
      meta: 'cash taken · ' + fmtMoney(s.newMrr) + ' of new MRR' +
        (s.refunds ? ' · ' + fmtMoney(s.refunds) + ' refunded' : '')
    }));

    if (money.spend) {
      tiles.push(tile({
        label: 'Cost per install', value: fmtMoney(money.costPerInstall), smallValue: true,
        meta: 'blended · ' + fmtMoney(money.costPerPaid) + ' per paid conversion · ' +
          (money.roas === null ? 'no marketing spend' : fmtMoney(money.roas) + ' back per ' + (db.settings.currency || '$') + '1 of ads')
      }));
    }

    var be = breakevenSeries();
    tiles.push(tile({
      label: 'All-time net', value: fmtMoney(be.revenue - be.spend), smallValue: true,
      color: be.revenue - be.spend >= 0 ? COLOR.s3 : COLOR.red,
      meta: be.at
        ? 'broke even ' + labelFull(be.at) + ' · every day since ' + labelDay(be.from)
        : fmtMoney(be.spend - be.revenue) + ' still to make back · since ' + labelDay(be.from)
    }));

    host.innerHTML = tiles.join('');
  }

  var DOW_METRICS = {
    downloads: { label: 'downloads', color: function () { return ENTITY.downloads; }, fmt: fmtInt },
    sales: { label: 'paid conversions', color: function () { return ENTITY.sales; }, fmt: fmtInt },
    pageViews: { label: 'product page views', color: function () { return ENTITY.pageViews; }, fmt: fmtInt },
    impressions: { label: 'impressions', color: function () { return ENTITY.impressions; }, fmt: fmtInt },
    revenue: { label: 'revenue', color: function () { return ENTITY.revenue; }, fmt: fmtMoney }
  };

  /* Average per weekday over the range, plus the most recent occurrence of each. */
  function weekdayStats(p, from, to, field) {
    var acc = [];
    for (var i = 0; i < 7; i++) acc.push({ sum: 0, count: 0, last: null, lastDate: null });
    if (base().dates.length) {
      for (var d = from; d <= to; d = addDays(d, 1)) {
        var w = acc[dow(d)];
        var v = dayRec(p, d)[field];
        w.sum += v; w.count++;
        w.last = v; w.lastDate = d;   // dates ascend, so this ends on the latest one
      }
    }
    return acc;
  }

  function renderWeekday(r) {
    var field = state.dowMetric in DOW_METRICS ? state.dowMetric : 'downloads';
    var spec = DOW_METRICS[field];
    var keys = platKeys();
    var stats = {};
    keys.forEach(function (p) { stats[p] = weekdayStats(p, r.from, r.to, field); });
    var main = isCompare() ? null : keys[0];

    var x = WD.map(function (w, i) {
      var st = (stats[main] || stats[keys[0]])[i];
      return { label: w, full: WD_LONG[i] + (st.count ? ' · ' + st.count + ' in range' : '') };
    });

    var series;
    if (isCompare()) {
      series = keys.map(function (p) {
        return {
          key: p, name: platName(p) + ' average', color: ENTITY[p], type: 'bar', format: spec.fmt,
          values: stats[p].map(function (w) { return w.count ? w.sum / w.count : null; })
        };
      });
    } else {
      series = [
        { key: 'avg', name: 'Average ' + spec.label, color: spec.color(), type: 'bar', format: spec.fmt,
          values: stats[main].map(function (w) { return w.count ? w.sum / w.count : null; }) },
        // a neutral reference tick, not a second identity
        { key: 'last', name: 'Most recent', color: COLOR.text, type: 'marker', format: spec.fmt,
          values: stats[main].map(function (w) { return w.lastDate === null ? null : w.last; }) }
      ];
    }

    drawChart('ovDow', {
      x: x, series: series, height: 300, format: spec.fmt, xLabel: 'Weekday',
      yTickFormat: field === 'revenue'
        ? function (v) { return (db.settings.currency || '$') + Chart.fmtCompact(v); } : undefined,
      tooltipNote: function (i) {
        var st = (stats[main] || stats[keys[0]])[i];
        if (!st.count) return '';
        var note = st.count + ' ' + WD_LONG[i] + (st.count === 1 ? '' : 's') + ' in range';
        if (st.lastDate) {
          note += ' · most recent ' + labelFull(st.lastDate);
          var avg = st.sum / st.count;
          if (avg > 0) {
            var diff = ((st.last - avg) / avg) * 100;
            note += ' (' + (diff >= 0 ? '+' : '') + diff.toFixed(0) + '% vs average)';
          }
        }
        return note;
      }
    });
  }

  function mk(rows, plat, field, name, color, type, dashed) {
    return {
      key: plat + '.' + field, name: name, color: color, type: type || 'line',
      dashed: !!dashed,
      values: rows.map(function (r) { return r[field]; })
    };
  }

  function pctOf(a, b) { return b ? ((a / b) * 100).toFixed(1) + '%' : '–'; }

  /* ------------------------------------------------------- view: trial */

  function renderTrial() {
    var r = activeRange();
    var main = isCompare() ? 'all' : platKeys()[0];
    var s = summarize(main, r.from, r.to);
    var cur = { ios: summarize('ios', r.from, r.to), android: summarize('android', r.from, r.to) };
    var splitOf = function (fn) {
      return isCompare() ? [
        { name: 'iOS', color: ENTITY.ios, value: fn(cur.ios) },
        { name: 'Android', color: ENTITY.android, value: fn(cur.android) }
      ] : null;
    };

    document.getElementById('trTiles').innerHTML = [
      tile({
        label: 'Crossed day ' + trialDays() + ' in range', color: ENTITY.trialEnd, value: fmtInt(s.trialEnd),
        meta: 'reached day ' + trialExit() + ' during this range — they installed between ' +
          labelFull(addDays(r.from, -trialExit())) + ' and ' + labelFull(addDays(r.to, -trialExit())),
        split: splitOf(function (x) { return fmtInt(x.trialEnd); })
      }),
      tile({
        label: 'Paid in range', color: ENTITY.sales, value: fmtInt(s.sales),
        meta: fmtMoney(s.revenue) + ' · ' + fmtMoney(s.arppu) + ' per paying user',
        split: splitOf(function (x) { return fmtInt(x.sales); })
      }),
      tile({
        label: 'In-range convert rate', value: fmtPct(s.trialEnd ? (s.sales / s.trialEnd) * 100 : null),
        meta: fmtInt(s.sales) + ' paid ÷ ' + fmtInt(s.trialEnd) + ' who crossed day ' + trialExit() + ' in this range',
        split: splitOf(function (x) { return fmtPct(x.trialEnd ? (x.sales / x.trialEnd) * 100 : null); })
      }),
      tile({
        label: 'Lifetime convert — past trial', value: fmtPct(s.convOfOutOfTrial),
        meta: 'all-time paid ÷ everyone all-time past day ' + trialDays(),
        split: splitOf(function (x) { return fmtPct(x.convOfOutOfTrial); })
      }),
      tile({
        label: 'Revenue per install', value: fmtMoney(s.rpi), smallValue: true,
        meta: 'all-time revenue ÷ all-time installs',
        split: splitOf(function (x) { return fmtMoney(x.rpi); })
      }),
      tile({
        label: 'Still inside the trial', color: ENTITY.inTrial, value: fmtInt(s.inTrial),
        meta: 'installed within the last ' + trialDays() + ' days — not yet a conversion opportunity',
        split: splitOf(function (x) { return fmtInt(x.inTrial); })
      })
    ].join('');

    /* Funnel — a true nested funnel: every step after "downloads" is a subset of the
       installs in this range, aged forward to today. (Using crossings that happened
       during the range instead would compare two different install windows.) */
    document.getElementById('trFunnelScope').textContent = labelFull(r.from) + ' → ' + labelFull(r.to);
    var steps = [
      { name: 'Impressions', sub: 'store listing seen', v: s.impressions, color: ENTITY.impressions },
      { name: 'Product page views', sub: 'tapped through', v: s.pageViews, color: ENTITY.pageViews },
      { name: 'First-time downloads', sub: 'installed', v: s.downloads, color: ENTITY.downloads },
      { name: 'Now past day ' + trialDays(), sub: 'of those installs, day ' + trialExit() + '+ by now',
        v: s.cohortPastTrial, color: ENTITY.trialEnd },
      { name: 'Paid', sub: 'sales recorded in this range', v: s.sales, color: ENTITY.sales }
    ];
    var maxV = Math.max.apply(null, steps.map(function (x) { return x.v; })) || 1;
    var html = '';
    steps.forEach(function (st, i) {
      if (i === steps.length - 1) {
        // sales are recorded on the purchase date, not attributed back to a cohort —
        // so a step rate here would be comparing two different populations
        html += '<div class="funnel-gap">↓ recorded separately — sales are not attributed back to an install cohort</div>';
      } else if (i > 0) {
        var prev = steps[i - 1].v;
        var rate = prev ? (st.v / prev) * 100 : null;
        html += '<div class="funnel-gap">↓ ' + (rate === null ? '–' : fmtPct(rate)) +
          ' of ' + esc(steps[i - 1].name.toLowerCase()) + '</div>';
      }
      html += '<div class="funnel-step">' +
        '<div class="fname">' + esc(st.name) + '<small>' + esc(st.sub) + '</small></div>' +
        '<div class="funnel-bar" style="background:' + st.color + ';opacity:.9;width:' +
          Math.max(0.4, (st.v / maxV) * 100) + '%"></div>' +
        '<div class="fval">' + fmtInt(st.v) + '<small>' + pctOf(st.v, steps[0].v) + ' of impressions</small></div>' +
        '</div>';
    });
    document.getElementById('trFunnel').innerHTML = html;

    /* pressure points per period */
    var rows = buildBuckets(main, r.from, r.to);
    var pressSeries = isCompare()
      ? ['ios', 'android'].reduce(function (acc, p) {
          var rr = buildBuckets(p, r.from, r.to);
          acc.push(mk(rr, p, 'wallHit', platName(p) + ' past day ' + wallDays(), ENTITY[p], 'bar'));
          return acc;
        }, []).concat(['ios', 'android'].map(function (p) {
          return mk(buildBuckets(p, r.from, r.to), p, 'sales', platName(p) + ' paid', ENTITY[p], 'line', true);
        }))
      : [
          mk(rows, main, 'trialEnd', 'Past day ' + trialDays(), ENTITY.trialEnd, 'bar'),
          mk(rows, main, 'sales', 'Paid', ENTITY.sales, 'line')
        ];
    drawChart('trPressure', { x: xAxis(rows), series: pressSeries, height: 280, format: fmtInt });

    /* cumulative conversion rate over time */
    var rateSeries = isCompare()
      ? ['ios', 'android'].map(function (p) {
          return mk(buildBuckets(p, r.from, r.to), p, 'paidOfWall', platName(p) + ' of wall-hitters', ENTITY[p], 'line');
        })
      : [
          mk(rows, main, 'paidOfInstalls', 'of all installs', ENTITY.downloads, 'line'),
          mk(rows, main, 'paidOfTrial', 'of everyone past day ' + trialDays(), ENTITY.trialEnd, 'line')
        ];
    rateSeries.forEach(function (s) { s.format = fmtPct; });
    drawChart('trRate', {
      x: xAxis(rows), series: rateSeries, height: 280, format: fmtPct,
      yTickFormat: function (v) { return v.toFixed(v < 10 ? 1 : 0) + '%'; }
    });
  }

  /* ------------------------------------------------------ view: cohorts */

  function renderCohorts() {
    var b = base();
    var r = activeRange();
    var grain = state.cohGrain;
    var main = isCompare() ? 'all' : platKeys()[0];
    var T = trialExit(), Wd = wallExit(), now = asOf();

    var rows = buildBuckets(main, r.from, r.to, grain).filter(function (x) { return x.downloads > 0; });
    var iosRows = buildBuckets('ios', r.from, r.to, grain);
    var andRows = buildBuckets('android', r.from, r.to, grain);
    var byKey = {};
    iosRows.forEach(function (x) { (byKey[x.key] = byKey[x.key] || {}).ios = x; });
    andRows.forEach(function (x) { (byKey[x.key] = byKey[x.key] || {}).android = x; });

    var totalCohort = rows.reduce(function (a, x) { return a + x.downloads; }, 0);
    var matured = { trial: 0, wall: 0, young: 0 };
    rows.forEach(function (x) {
      var age = diffDays(x.start, now);
      if (age >= T) matured.wall += x.downloads;
      else matured.young += x.downloads;
    });

    document.getElementById('cohTiles').innerHTML = [
      tile({ label: 'Cohorts in range', value: fmtInt(rows.length), smallValue: true, meta: 'grouped by ' + grain }),
      tile({ label: 'Installs in these cohorts', color: ENTITY.downloads, value: fmtInt(totalCohort) }),
      tile({ label: 'Fully past the trial', color: ENTITY.wallHit, value: fmtInt(matured.wall), meta: pctOf(matured.wall, totalCohort) + ' of these installs' }),
      tile({ label: 'Still inside the trial', color: ENTITY.inTrial, value: fmtInt(matured.young), meta: 'too young to judge — ' + pctOf(matured.young, totalCohort) + ' of these installs' })
    ].join('');

    var head = '<tr><th>Cohort</th><th>Age (days)</th><th style="text-align:left">Status</th><th>Installs</th><th>iOS</th><th>Android</th>' +
      '<th>Share</th><th>Cumulative</th></tr>';
    var run = 0;
    var body = rows.slice().reverse().map(function (x) {
      var age = diffDays(x.start, now);
      var status = age >= T ? '<span class="pill past14">Past the ' + trialDays() + '-day trial</span>'
        : '<span class="pill trial">In trial</span>';
      return { x: x, age: age, status: status };
    });
    // cumulative reads oldest → newest, then display newest first
    var cumMap = {};
    rows.forEach(function (x) { run += x.downloads; cumMap[x.key] = run; });
    var bodyHTML = body.map(function (o) {
      var x = o.x, pair = byKey[x.key] || {};
      return '<tr><td>' + esc(bucketLabel(x.key, grain).full) + '</td>' +
        '<td>' + o.age + '</td><td style="text-align:left">' + o.status + '</td>' +
        '<td>' + fmtInt(x.downloads) + '</td>' +
        '<td>' + fmtInt(pair.ios ? pair.ios.downloads : 0) + '</td>' +
        '<td>' + fmtInt(pair.android ? pair.android.downloads : 0) + '</td>' +
        '<td>' + pctOf(x.downloads, totalCohort) + '</td>' +
        '<td>' + fmtInt(cumMap[x.key]) + '</td></tr>';
    }).join('');
    document.getElementById('cohTable').innerHTML = rows.length
      ? '<div class="table-scroll"><table><thead>' + head + '</thead><tbody>' + bodyHTML + '</tbody></table></div>'
      : '<div class="empty">No install cohorts in this range.</div>';

    /* maturity chart — each cohort sits in exactly one band */
    var young = [], old = [];
    rows.forEach(function (x) {
      var age = diffDays(x.start, now);
      young.push(age < T ? x.downloads : 0);
      old.push(age >= T ? x.downloads : 0);
    });
    drawChart('cohChart', {
      x: rows.map(function (x) { return bucketLabel(x.key, grain); }),
      series: [
        { key: 'young', name: 'Still in trial', color: ENTITY.inTrial, type: 'bar', values: young },
        { key: 'old', name: 'Past the ' + trialDays() + '-day trial', color: ENTITY.wallHit, type: 'bar', values: old }
      ],
      stacked: true, height: 300, format: fmtInt, xLabel: 'Cohort',
      tooltipNote: function (i) { return rows[i] ? 'Age ' + diffDays(rows[i].start, now) + ' days' : ''; }
    });
  }

  /* ---------------------------------------------------- view: app usage */

  /* The one view fed by the app rather than by store CSVs.
   *
   * All of the arithmetic lives in analytics.js — see its header for the three
   * rules it exists to enforce (never sum actives across days, immature is not
   * churned, a rate carries its denominator). This file is presentation: it
   * decides what to draw and how to say what a number does not know.
   *
   * The data is read-only and lives outside `db`, so sync.js never sees it.
   * Events, by contrast, ARE part of `db` and do sync — they are the one thing
   * on this screen a human enters. */

  var A = window.Analytics;
  var CS = window.Costs;

  var PING_DAYS = 400;                 // history pulled in one call, then cached
  var pings = { status: 'idle', report: null, at: null, error: '', stale: false };

  /* The counter's last answer, kept in localStorage beside the store.

     It is the only source on this page that is NOT part of `db` — it is
     read-only and never synced — so it used to live in memory alone, which
     meant App usage and Timeline opened on "Reading the counter…" every single
     time however recently you had read it. Cached, they open on the numbers you
     last saw and swap them for the fresh ones a moment later, exactly like
     every other view.

     `stale` is what stops the cache being mistaken for a fetch: a cached report
     is drawn immediately AND refetched, where a report fetched this session is
     left alone until the auto-refresh comes round. It is also why the alerts
     baseline is not seeded from this — see the note in `pingLoad`. */
  var PING_KEY = KEY + '.pings';

  function loadPingCache() {
    try {
      var raw = localStorage.getItem(PING_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (!p || !p.report) return;
      pings.report = p.report;
      pings.at = p.at ? new Date(p.at) : null;
      pings.status = 'ready';
      pings.stale = true;
    } catch (e) { /* unreadable cache is no cache */ }
  }

  function savePingCache() {
    try {
      localStorage.setItem(PING_KEY, JSON.stringify({
        at: pings.at ? pings.at.toISOString() : null, report: pings.report
      }));
    } catch (e) {
      /* 400 days of cohorts is the biggest thing this page stores, and it is
         the most disposable: if the quota is tight the journal keeps the room. */
      try { localStorage.removeItem(PING_KEY); } catch (e2) { /* ignore */ }
    }
  }
  var pingUI = { tlMode: 'usage', tlMetric: 'active', curveMode: 'all', heatGrain: 'week', cohort: null, event: null, editing: null, rawKind: 'all' };

  var PC = {
    fresh: COLOR.green,        // first run — an install the counter had not seen
    back: COLOR.s1,            // returning
    active: COLOR.s1,
    downloads: COLOR.s2,       // store-sourced, deliberately not the blue above
    pageViews: COLOR.s5,
    subs: ENTITY.sales,        // violet, as "paid" is everywhere else
    activation: COLOR.s6,      // green — the step between installing and paying,
                               // and the same green its alert card wears
    reading: COLOR.s5,         // a reading taken TODAY — deliberately not the
                               // activation green: one is a first, one is a
                               // habit, and the two are read side by side
    trial: COLOR.green,
    postTrial: COLOR.gold,
    wall: COLOR.red
  };

  /* All THREE counter-fed views repaint when the fetch lands. Naming only one
     of them here is how the Timeline tab ended up rendering an empty chart: the
     data arrived, and nothing asked the view to draw it again. */
  function repaintPingViews() {
    if (state.view !== 'ping' && state.view !== 'timeline' && state.view !== 'pings') return;
    /* Through renderAll while a skeleton is up, because the skeleton is what is
       currently standing in for the view and only renderAll takes it down. */
    if (skeletonOn) { renderAll(); return; }
    if (state.view === 'ping') renderPing();
    else if (state.view === 'pings') renderPings();
    else renderTimelineView();
  }

  /* The filter bar's platform, as the ping index speaks it. Anything that is
     not one of the two stores reads as "all", and the platform tile carries the
     split instead. */
  function pingPlatform() {
    return (state.platform === 'ios' || state.platform === 'android') ? state.platform : 'all';
  }

  function pingLoad(force) {
    if (pings.status === 'loading') return Promise.resolve();
    if (pings.status === 'ready' && !force && !pings.stale) return Promise.resolve();
    pings.status = 'loading';
    pings.error = '';
    /* Only repaint into the loading state when there is nothing on screen to
       keep. A refetch holds the numbers it already has and swaps them when the
       new ones land — tearing the view down and rebuilding it is the whole
       reason the page used to blink on every refresh. */
    if (!pings.report) repaintPingViews();
    return window.Api.call('PINGS', { since: addDays(today(), -PING_DAYS) }).then(function (res) {
      pings.report = res || { open: [], sub: [], act: [] };
      pings.at = new Date();
      pings.status = 'ready';
      pings.stale = false;
      savePingCache();
      /* Every path that reads the counter goes through here, so this is the one
         place the live alerts have to hang off. The baseline they compare
         against is REMEMBERED across sessions (alerts.js), so opening the
         dashboard after a day away announces what arrived while it was shut —
         which is why the cached report above is never handed to `sync`. Feeding
         it the cache first would move the baseline forward to what you have
         already been told about, and the news would be swallowed silently.
         A failure to make a noise must never cost the repaint. */
      if (window.Alerts) {
        try { window.Alerts.sync(pings.report); } catch (e) { /* never block the view */ }
      }
      repaintPingViews();
    }).catch(function (err) {
      pings.status = 'error';
      pings.error = (err && err.message) || 'Could not reach the counter.';
      repaintPingViews();
    });
  }

  /* --------------------------------------------------------------- events */

  function events() { return db.events || (db.events = []); }

  /**
   * Releases, as annotations the dashboard derives rather than stores.
   *
   * The app's own release log (mobile/src/lib/whatsNew.ts, generated into
   * releases.js) already knows every version and the day it was cut, so a
   * hand-entered copy would only drift from what actually shipped. They behave
   * like events everywhere it matters — flags on charts, before/after analysis
   * — but they are read-only, and `derived` is what stops the editor offering
   * to change something this dashboard does not own.
   */
  function releaseEvents() {
    return (window.RELEASES || []).map(function (r) {
      return {
        id: 'rel-' + r.version,
        date: r.date,
        category: 'RELEASE',
        type: 'New version',
        title: 'v' + r.version,
        note: (r.notes || []).join(' '),
        derived: true
      };
    });
  }

  /**
   * Ad spots, as annotations. Same argument as releases: Edit data already
   * knows the day each spot started and stopped, so a hand-entered MARKETING
   * event beside it would be a second copy free to drift. They are derived and
   * therefore not editable from the event form — the spot itself is edited in
   * the Spending section.
   */
  function adEvents() {
    return CS.adMarks(ads()).map(function (m) {
      return {
        id: m.id,
        date: m.date,
        category: 'MARKETING',
        type: m.ad.platform || 'Ad spot',
        title: m.ad.name + (m.edge === 'end' ? ' ended' : ' started'),
        note: m.ad.note || '',
        derived: true
      };
    });
  }

  /** Everything that can be annotated or analysed: recorded plus derived. */
  function timelineItems() {
    return events().concat(releaseEvents()).concat(adEvents());
  }

  function eventById(id) {
    return timelineItems().filter(function (e) { return e.id === id; })[0] || null;
  }
  function newEventId() {
    return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function putEvent(ev) {
    var list = events();
    var at = -1;
    list.forEach(function (e, i) { if (e.id === ev.id) at = i; });
    if (at >= 0) list[at] = ev; else list.push(ev);
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    save();
  }
  function removeEvent(id) {
    db.events = events().filter(function (e) { return e.id !== id; });
    if (pingUI.event === id) pingUI.event = null;
    save();
  }

  /* How each kind of annotation draws its rule. The pattern is the category,
     so a chart can be read without hovering: releases dashed, marketing dotted,
     store changes dash-dot, everything else solid. */
  var MARK_DASH = {
    RELEASE: '6 4',
    MARKETING: '1 5',
    STORE: '6 3 2 3',
    EXTERNAL: null
  };

  /**
   * Chart annotations for a day-indexed x axis.
   *
   * Built centrally and handed to whichever chart wants them, so no chart ever
   * decides for itself what happened on a date — that was the whole point of
   * recording events in one place.
   */
  function marksFor(days, indexOf) {
    var idx = {};
    days.forEach(function (d, i) { idx[d] = i; });
    /* `days` is the axis when a chart is per-day, and every day the axis covers
       when it is per-week or per-month. `indexOf` is how the second kind says
       which column a date belongs in; without it a Wednesday release would be
       dropped from a weekly chart for not being a bucket's first day. */
    var at = indexOf || function (d) { return idx[d]; };
    return A.eventsBetween(timelineItems(), days[0], days[days.length - 1]).map(function (ev) {
      var cat = A.EVENT_CATEGORIES[ev.category] || {};
      return {
        id: ev.id,
        index: at(ev.date),
        color: A.eventColor(ev),
        title: ev.title,
        categoryLabel: (cat.label || 'Event') + (ev.type ? ' · ' + ev.type : ''),
        dateLabel: labelDay(ev.date),
        note: ev.note || '',
        dash: MARK_DASH[ev.category] || null
      };
    }).filter(function (m) { return m.index !== undefined; });
  }

  /* Clicking a flag opens its before/after — but ONLY on the Timeline tab,
     where that analysis lives.
     A flag used to navigate: a click anywhere else switched you to Timeline and
     scrolled you to the event. That is a whole-view change fired by a rule two
     pixels wide, and on a touch screen it was unusable — the rules sit on top of
     the plot, a tap near one to read a day's value landed on the flag instead,
     and the App usage view you were reading vanished. There is no way to
     "hover instead" on a phone, so the only safe behaviour is to do nothing:
     the flag still carries its tooltip, and Timeline is a tab away. */
  /* Charts only get a click handler on the tab where the click leads somewhere.
     Everywhere else the flag is a hover target and nothing more, which is also
     what stops `charts.js` painting a pointer cursor over a rule that does not
     act. */
  function markClickFor() { return state.view === 'timeline' ? onMarkClick : null; }

  function onMarkClick(mark) {
    if (state.view !== 'timeline') return;
    pingUI.event = mark.id;
    renderTimelineView();
    var node = document.getElementById('pgEventAnalysis');
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ------------------------------------------------------------ formatting */

  /** A rate, with "not yet knowable" kept distinct from zero. */
  function fmtRate(r) {
    if (!r || !r.available) return '<span class="na" title="No cohort has reached this milestone yet">–</span>';
    return fmtPct(r.pct);
  }
  function rateMeta(r, noun) {
    if (!r || !r.available) {
      var waiting = r && r.immature ? r.immature + ' cohort' + (r.immature === 1 ? '' : 's') + ' still too young' : 'not enough history yet';
      return waiting;
    }
    return fmtInt(r.kept) + ' of ' + fmtInt(r.of) + ' ' + (noun || 'installs') +
      (r.immature ? ' · ' + r.immature + ' cohort' + (r.immature === 1 ? '' : 's') + ' too young to count' : '') +
      (r.small ? ' · <span class="warn-small">small sample</span>' : '');
  }

  /* ---------------------------------------------------------------- render */

  function pingStatusHTML() {
    // A refetch over data we already hold says nothing: the header's refresh is
    // already spinning, and a banner appearing above the charts would move
    // every one of them down a line and back.
    if (pings.status === 'loading') {
      return pings.report ? '' :
        '<div class="card" style="margin-bottom:14px"><div class="empty">Reading the counter…</div></div>';
    }
    if (pings.status === 'error') {
      return '<div class="card" style="margin-bottom:14px"><div class="empty">' + esc(pings.error) +
        ' <button class="btn sm" id="pgRetry" style="margin-left:8px">Try again</button></div></div>';
    }
    return '';
  }

  function renderPing() {
    document.getElementById('pgStatus').innerHTML = pingStatusHTML();
    var retry = document.getElementById('pgRetry');
    if (retry) retry.addEventListener('click', function () { pingLoad(true); });

    var ix = A.index(pings.report, pingPlatform());
    /* Anything we hold is worth drawing, whatever the fetch is doing now: a
       failed refresh should leave the last good read on screen under its error,
       not replace a working page with an empty one. */
    var ready = pings.status === 'ready' || !!pings.report;
    var blank = !ix.days.length;

    var hosts = ['pgTilesToday', 'pgTilesRange', 'pgTilesLife', 'pgTodayNote', 'pgRangeNote', 'pgHeat', 'pgCohortDetail', 'pgTransitions', 'pgConversion',
      'pgActivationRates', 'pgMethodNote', 'pgMeasureNote', 'pgMeasureRates', 'pgReadMethodNote',
      'pgPayNote', 'pgSurfaceNote', 'pgTierNote', 'pgBuildNote', 'pgBuildShareNote',
      'pgFunnelNote', 'pgOfferNote', 'pgEventNote',
      'pgWeekdayRetention', 'pgPlatformNote', 'pgFilterNote'];
    if (!ready || blank) hosts.forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.innerHTML = '';
    });
    if (!ready) return;

    /* The two group notes. This is what is left of the old "counter data
       through <date>" row, which stated the counter's last day above a wall of
       tiles that each already carried that date in their own label.

       What the row was actually FOR is the caveat, and the caveat is only
       sometimes true: a last day that IS today is a partial count, so every
       comparison against it is reading a day that is not finished. That is
       said here, under the heading it applies to, and nothing is said when
       there is nothing to say. When the counter's newest day is not today —
       nobody has opened the app yet, or the report is cached — the note names
       the day instead, because then "Today" is not the day it means. */
    /* The range heading names the window it covers. The filter bar says which
       range is selected; this says what that resolved to, which is not the
       same thing on a counter whose history is shorter than the selection. */
    var rangeNote = document.getElementById('pgRangeNote');
    if (rangeNote) {
      var rr = blank ? null : pingRange(ix);
      rangeNote.textContent = rr
        ? labelFull(rr.from) + ' – ' + labelFull(rr.to) +
          ' · ' + fmtInt(A.range(rr.from, rr.to).length) + ' days'
        : '';
    }

    var todayNote = document.getElementById('pgTodayNote');
    if (todayNote) {
      todayNote.textContent = blank ? ''
        : ix.last === today() ? labelDay(ix.last) + ' — still running, so it is a partial day'
        : 'Newest day with pings: ' + labelFull(ix.last);
    }

    if (blank) {
      document.getElementById('pgHeat').innerHTML =
        '<div class="empty">No pings yet. The counter starts filling the first time a build carrying it is opened.</div>';
      ['pgTimeline', 'pgCurve', 'pgSurvival', 'pgActiveCohort', 'pgPurchaseAge',
        'pgActivationAge', 'pgMethods', 'pgMeasureDaily', 'pgMeasureCurve', 'pgReadMethods',
        'pgPayDaily', 'pgSurfaces', 'pgTiers', 'pgBuilds', 'pgBuildShare',
        'pgFunnel', 'pgOffers', 'pgEvents',
        'pgPlatforms', 'pgWeekday'].forEach(function (id) {
        drawChart(id, { x: [], series: [], emptyText: 'Waiting for the first ping.' });
      });
      return;
    }

    var r = pingRange(ix);
    var days = A.range(r.from, r.to);
    var marks = marksFor(days);
    var scoped = scopeToRange(ix, r);

    renderPingTiles(scoped, r, days);
    renderTimeline(scoped, days, marks);
    renderCurve(scoped);
    renderSurvival(scoped);
    renderHeat(scoped);
    renderActiveByCohort(scoped, r);
    renderPurchases(scoped, r);
    renderActivation(scoped, days);
    renderMeasuring(scoped, days);
    renderCaptureFunnel(scoped, days);
    renderReadingMethods(scoped, days);
    renderPaywall(scoped, days);
    renderOffers(scoped, days);
    renderEvents(scoped, days);
    renderTierBuild(scoped, days);
    /* The one card that stays on the FULL index by design: it is what the
       platform filter is a slice of, so filtering it would leave nothing to
       compare. Its hint says so on screen. */
    renderPingPlatforms(ix, days);
    renderPingWeekday(scoped, days);
  }

  /**
   * The filter bar's range, applied to the cohort-based half of App usage.
   *
   * Only `cohorts` is narrowed — to the installs BORN inside the range. Every
   * day map (`open` / `sub` / `act` / `days` / `last`) is left whole on purpose,
   * because a cohort born inside the range has to be aged with data from after
   * it: clipping the days too would report D30 retention as "not yet available"
   * for every cohort in any window shorter than a month, which is not a filter,
   * it is a lie about maturity.
   *
   * This exists because changing the range used to move the tiles, the timeline
   * and the weekday chart while the retention curve, the survival funnel, the
   * cohort heatmap and the active-by-age chart all quietly went on reporting
   * all-time numbers — four cards on one screen answering a different question
   * from the six above them, with nothing on screen saying so.
   */
  function scopeToRange(ix, r) {
    if (!r || (!r.from && !r.to)) return ix;
    var cohorts = ix.cohorts.filter(function (c) {
      return (!r.from || c >= r.from) && (!r.to || c <= r.to);
    });
    /* A range holding no cohort at all would blank every retention card. That
       is the honest answer — the cards say "no cohort has reached this yet"
       rather than showing numbers the range excludes. */
    var out = {};
    for (var k in ix) out[k] = ix[k];
    out.cohorts = cohorts;
    return out;
  }

  /* The filter bar's range, anchored to the pings rather than to the store:
     store reporting lags a day, a ping lands the moment the app opens. */
  function pingRange(ix) {
    var sel = activeRange();
    var to = (ix.last && ix.last > sel.to) ? ix.last : sel.to;
    var from = sel.from;
    if (state.range !== 'custom' && state.range !== 'all') {
      from = addDays(to, -((parseInt(state.range, 10) || 30) - 1));
    }
    if (state.range === 'all' && ix.first) from = ix.first;
    if (ix.first && from < ix.first) from = ix.first;
    return { from: from, to: to };
  }

  /* ------------------------------------------------------------- 1. tiles */

  /* The floor a baseline has to clear before a percentage means anything.
     Two purchases yesterday against three today is not "+50%", it is two and
     three; a percentage off a base that small reads as a trend and is noise.
     Below this the row is DROPPED rather than printed, which is why the
     purchase tile usually carries no comparisons and the active one always
     does — the same rule, applied to numbers of different sizes. */
  var DELTA_MIN_BASE = 5;

  function pctChange(now, before) {
    if (now === null || now === undefined) return null;
    if (before === null || before === undefined || !isFinite(before)) return null;
    if (before < DELTA_MIN_BASE) return null;
    return ((now - before) / before) * 100;
  }

  /**
   * The window immediately before this one, of the same length — or null when
   * the counter did not cover all of it.
   *
   * "Up 12% on the previous 30 days" is only a fact if the previous 30 days
   * were being counted. A range that reaches back past `ix.first` has a
   * previous window the counter was not running for, and comparing against it
   * would report the deploy date as a surge. Same rule the tiles' own
   * `covered` check has always used, lifted out so every card can share it.
   */
  function prevWindow(ix, days) {
    if (!days || !days.length) return null;
    var to = addDays(days[0], -1);
    var from = addDays(to, -(days.length - 1));
    if (!ix.first || from < ix.first) return null;
    return A.range(from, to);
  }

  /**
   * This range's total against the previous range's, as a signed percentage.
   *
   * `valueOf(day)` returns the day's count, or **null** for a day the measure
   * could not be taken on at all — the days before a staggered counter shipped
   * are the live case. A single unknown day in EITHER window returns null for
   * the whole comparison rather than being treated as a zero: a counter that
   * was not running is not a quiet day, and half a window compared against a
   * whole one is not a comparison. This is `hrvKnown`'s rule, one level up.
   */
  function rangeDelta(ix, days, valueOf) {
    var prev = prevWindow(ix, days);
    if (!prev) return null;
    var now = 0, before = 0, i, v;
    for (i = 0; i < days.length; i += 1) {
      v = valueOf(days[i]);
      if (v === null || v === undefined) return null;
      now += v;
    }
    for (i = 0; i < prev.length; i += 1) {
      v = valueOf(prev[i]);
      if (v === null || v === undefined) return null;
      before += v;
    }
    return pctChange(now, before);
  }

  /** The same, as a trailing clause a card note can end with. Empty when there
      is nothing honest to say, so the sentence simply does not gain a tail. */
  function rangeTrendNote(ix, days, valueOf) {
    var pct = rangeDelta(ix, days, valueOf);
    if (pct === null) return '';
    return ' · ' + deltaSpan(pct) + ' vs the previous ' + fmtInt(days.length) +
      ' day' + (days.length === 1 ? '' : 's');
  }

  /**
   * The three comparisons a day's count is worth reading against: yesterday,
   * the same weekday a week back, and the range's own daily average.
   *
   * The weekday one is not a nicety. Openings here swing by a third between a
   * Sunday and a Wednesday, so "down 28% on yesterday" on a Monday morning is
   * usually just Monday; only Monday against Monday separates a real move from
   * the week's own shape.
   *
   * `valueOf(day)` returns the count, or `null` for a day the measure could not
   * be taken on at all — the days before the reading counter shipped are the
   * live case. An unknown baseline drops its row; it never becomes a zero, and
   * it never lands in the average's denominator.
   */
  function dayDeltas(day, days, valueOf) {
    var now = valueOf(day);
    if (now === null || now === undefined) return [];
    var weekAgoDay = addDays(day, -7);
    var sum = 0, seen = 0;
    (days || []).forEach(function (d) {
      var v = valueOf(d);
      if (v === null || v === undefined) return;
      sum += v; seen++;
    });
    return [
      { label: 'vs the day before', pct: pctChange(now, valueOf(addDays(day, -1))) },
      { label: 'vs ' + WD[dow(weekAgoDay)] + ' last week', pct: pctChange(now, valueOf(weekAgoDay)) },
      { label: 'vs the range average', pct: pctChange(now, seen ? sum / seen : null) }
    ];
  }

  function renderPingTiles(ix, r, days) {
    var latest = ix.last;
    var activeToday = A.activeOn(ix, latest);
    var returningToday = A.returningOn(ix, latest);

    var avg = 0, avgRet = 0;
    days.forEach(function (d) { avg += A.activeOn(ix, d); avgRet += A.returningOn(ix, d); });
    avg = days.length ? avg / days.length : 0;
    avgRet = days.length ? avgRet / days.length : 0;

    /* Installs across the whole window, which is the acquisition number the
       date filter is usually being moved to answer.
       This is a SUM, on a view whose governing rule is that daily counts are
       never summed — and it is the one measure the rule does not apply to. An
       open ping counts the same install again on every day it opens the app,
       which is why there is no weekly active number here; a FIRST RUN happens
       once in an install's life, on its own cohort day, so adding them across
       days double-counts nobody. It is the same property that makes cohort
       size exact, and `lifecycleNow` already sums it. */
    var freshRange = A.newOver(ix, days);
    var rangeFresh = A.newPlatformsOver(ix, days);

    // previous window of equal length, only when the counter covered all of it
    var prevTo = addDays(r.from, -1), prevFrom = addDays(prevTo, -(days.length - 1));
    var covered = ix.first && prevFrom >= ix.first;
    var prevAvg = 0, prevAvgRet = 0, prevFreshRange = 0;
    if (covered) {
      var prevDays = A.range(prevFrom, prevTo);
      prevDays.forEach(function (d) { prevAvg += A.activeOn(ix, d); prevAvgRet += A.returningOn(ix, d); });
      prevAvg /= days.length; prevAvgRet /= days.length;
      prevFreshRange = A.newOver(ix, prevDays);
    }
    var dActive = covered && prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : null;
    var dRet = covered && prevAvgRet ? ((avgRet - prevAvgRet) / prevAvgRet) * 100 : null;
    var dFresh = covered ? pctChange(freshRange, prevFreshRange) : null;

    var d1 = A.retentionAt(ix, ix.cohorts, 1);
    var d7 = A.retentionAt(ix, ix.cohorts, 7);
    var d14 = A.retentionAt(ix, ix.cohorts, 14);
    var d30 = A.retentionAt(ix, ix.cohorts, 30);
    // Usage-based, so installs older than the counter are included: their age
    // is exact even though their cohort size was never observed.
    var live = A.lifecycleActive(ix, ix.last);
    var started = A.lifecycleNow(ix, ix.cohorts);

    var subsRange = 0;
    days.forEach(function (d) { subsRange += A.purchasesOn(ix, d); });
    var rangeBuys = A.purchasePlatformsOver(ix, days);
    var conv7 = A.conversion(ix, ix.cohorts, 7);
    var conv30 = A.conversion(ix, ix.cohorts, 30);
    /* Activation on the install day is the onboarding's own number: everything
       later is a recovery, not the wizard working. */
    var act0 = A.activation(ix, ix.cohorts, 0);
    var act7 = A.activation(ix, ix.cohorts, 7);
    /* Opening the app is not using it. This pair is the whole point of the
       reading counter: the day's share, and the range's habit rate. */
    var shareToday = A.measureShare(ix, ix.last);
    var measured = A.measureRate(ix, days);
    /* The same rate over the window before this one, so the range tile can say
       which way it moved. Null unless that window was fully counted AND the
       rate is available on both sides — `measureRate` already refuses a window
       whose days predate the counter, so this inherits that refusal. */
    var prevRangeDays = prevWindow(ix, days);
    var measuredPrevRate = prevRangeDays ? A.measureRate(ix, prevRangeDays) : null;
    var measuredPrev = measuredPrevRate && measuredPrevRate.available
      ? measuredPrevRate.pct : null;

    /* Activations across the window, the range twin of the day tile above.
       First readings are once-per-install-ever, so summing them across days
       double-counts nobody — the same property that makes `newOver` legal. */
    var actRange = 0;
    days.forEach(function (d) { actRange += A.activationsOn(ix, d); });
    var rangeActMethods = A.methodsOver(ix, days);

    /* How many installs this slice LEFT OUT because they named no store. Zero
       when the filter is off, since Combined counts everything. It rides on the
       headline tile rather than only in the platform card lower down: the
       number a reader questions is the one they are looking at, and "1" beside
       a combined "30" needs its own explanation just as much as the old
       double-counted "23" did. */
    var unattrToday = A.unattributedOn(ix, ix.last);

    /* The newest day's installs, as their own tile rather than only as the
       "first run" half of the active tile's split. It is the number every
       other number on this page is downstream of, and the one question the
       split could not answer was which store they came from — `newPlatformsOn`
       is that answer, and it is the unfiltered one, like every split here. */
    var freshToday = A.newPlatformsOn(ix, ix.last);

    /* The store split of everyone active that day, for the active tile's second
       pair of swatches. Unfiltered like every split on this page — with a
       platform filter on, the tile's own number is the slice and this says what
       the whole day was. */
    var activeStores = A.platformsOn(ix, ix.last);

    /* THREE HOSTS, THREE SCOPES, and the split is the point. These tiles used
       to be one wrapping row in which "Active on Aug 28", "Returning / day"
       (a range average) and "D7 retention" (every cohort that ever installed)
       sat side by side, told apart only by whether the label happened to end
       in a date. Each block now sits under the heading that says what its
       numbers are about. Nothing here is recomputed — the tiles are the same
       tiles, dealt into the pile they always belonged to. */
    document.getElementById('pgTilesToday').innerHTML = [
      tile({
        label: 'Active on ' + labelDay(ix.last), color: PC.active, value: fmtInt(activeToday),
        /* The range average used to ride here, which is exactly the confusion
           the three groups exist to end: it is a claim about thirty days,
           printed under a number about one. It has its own tile under
           "This range" now. */
        meta: 'installs that opened the app that day' +
          (unattrToday ? ' · ' + fmtInt(unattrToday) + ' more named no store and are not in this slice' : ''),
        deltas: dayDeltas(ix.last, days, function (d) { return A.activeOn(ix, d); }),
        /* TWO partitions of the same day, on one row: who they were
           (returning / first run) and which store they came from. Both add up
           to the tile's own number, which is why the store half goes through
           `storeSplit` — it carries the "no store" band when there is one, and
           without it the second pair would silently fail to sum on any day
           that still has pre-marker installs in it. */
        split: [{ name: 'returning', color: PC.back, value: fmtInt(returningToday) },
                { name: 'first run', color: PC.fresh, value: fmtInt(A.newOn(ix, ix.last)) }]
          .concat(storeSplit(activeStores))
      }),
      tile({
        label: 'Installs on ' + labelDay(ix.last), color: PC.fresh,
        value: fmtInt(A.newOn(ix, ix.last)),
        meta: 'first-run pings on the newest day' + storeSplitNote(ix, freshToday),
        deltas: dayDeltas(ix.last, days, function (d) { return A.newOn(ix, d); }),
        split: storeSplit(freshToday)
      }),
      tile({
        label: 'Purchases on ' + labelDay(ix.last), color: PC.subs, value: fmtInt(A.purchasesOn(ix, ix.last)),
        meta: 'subscribe pings on the newest day' + storeSplitNote(ix, A.subPlatformsOn(ix, ix.last)),
        deltas: dayDeltas(ix.last, days, function (d) { return A.purchasesOn(ix, d); }),
        split: storeSplit(A.subPlatformsOn(ix, ix.last))
      }),
      tile({
        label: 'First readings on ' + labelDay(ix.last), color: PC.activation,
        value: fmtInt(A.activationsOn(ix, ix.last)),
        meta: 'installs that activated that day' + methodSplitNote(A.methodsOn(ix, ix.last)),
        deltas: dayDeltas(ix.last, days, function (d) { return A.activationsOn(ix, d); }),
        split: methodSplit(A.methodsOn(ix, ix.last))
      }),
      /* The reading counter's own headline, beside the active one it is read
         against. Both are one-per-install-per-day, so the share underneath is a
         share of the people who were there — see measureShare. */
      tile({
        label: 'Measured on ' + labelDay(ix.last), color: PC.reading,
        value: A.hrvKnown(ix, ix.last) ? fmtInt(A.readingsOn(ix, ix.last)) : '–',
        meta: A.hrvKnown(ix, ix.last)
          ? 'installs that saved a reading' + storeSplitNote(ix, A.hrvPlatformsOn(ix, ix.last)) +
            methodSplitNote(A.hrvMethodsOn(ix, ix.last))
          : 'the reading counter was not running yet',
        /* A day before the counter shipped is not a day nobody measured, so it
           returns null and drops out of every comparison rather than dragging
           an average down — the `hrvKnown` rule, in the deltas. */
        deltas: dayDeltas(ix.last, days, function (d) {
          return A.hrvKnown(ix, d) ? A.readingsOn(ix, d) : null;
        }),
        split: A.hrvKnown(ix, ix.last) ? storeSplit(A.hrvPlatformsOn(ix, ix.last)) : null,
        /* And WITH WHAT, on its own line under the store split. The daily
           counter is capped at one per install, so this names the sensor of
           each install's FIRST reading that day and not everything it used —
           `hrvMethodKnown` keeps the line off a day whose builds predated the
           letter, where every reading would otherwise read as "no sensor". */
        splitB: A.hrvMethodKnown(ix, ix.last) ? methodSplit(A.hrvMethodsOn(ix, ix.last)) : null
      }),
      tile({
        label: 'Measured of active', color: PC.reading, smallValue: true,
        value: shareToday === null ? '–' : fmtPct(shareToday),
        meta: shareToday === null
          ? 'no reading counter on ' + labelDay(ix.last)
          : fmtInt(A.readingsOn(ix, ix.last)) + ' of ' + fmtInt(activeToday) +
            ' who opened the app that day also measured'
      }),
      /* Both lifecycle counts are of installs active on the SAME newest day,
         split by where they are in their own life — a today number wearing an
         age label, which is why they sit here and not under All installs. */
      tile({
        label: 'Active in trial', color: PC.trial, value: fmtInt(live.inTrial),
        meta: 'day 0–14 · ' + fmtInt(started.inTrial) + ' started a trial in that window'
      }),
      tile({
        label: 'Active past the trial', color: PC.postTrial, value: fmtInt(live.postTrial),
        meta: 'day 15+: free tier, Pro features locked'
      }),
      platformTile(ix)
    ].join('');

    /* Everything scoped to the date range, each one read against the range
       before it wherever that comparison is honest — see `rangeDelta`. */
    document.getElementById('pgTilesRange').innerHTML = [
      tile({
        label: 'Returning / day', color: PC.back, value: fmtInt(Math.round(avgRet)), delta: dRet,
        meta: 'the number that says the product is holding people'
      }),
      tile({
        label: 'Installs in range', color: PC.fresh, value: fmtInt(freshRange),
        delta: dFresh,
        meta: fmtInt(days.length) + ' day' + (days.length === 1 ? '' : 's') +
          ' of first runs' + storeSplitNote(ix, rangeFresh),
        split: storeSplit(rangeFresh)
      }),
      tile({
        label: 'Purchases in range', color: PC.subs, value: fmtInt(subsRange),
        delta: rangeDelta(ix, days, function (d) { return A.purchasesOn(ix, d); }),
        meta: 'subscribe pings, not store receipts' + storeSplitNote(ix, rangeBuys),
        split: storeSplit(rangeBuys)
      }),
      tile({
        label: 'Active / day', color: PC.active, value: fmtInt(Math.round(avg)), delta: dActive,
        meta: 'installs opening the app on an average day of this range'
      }),
      tile({
        label: 'First readings in range', color: PC.activation, value: fmtInt(actRange),
        delta: rangeDelta(ix, days, function (d) { return A.activationsOn(ix, d); }),
        meta: 'installs that activated' + methodSplitNote(rangeActMethods),
        split: methodSplit(rangeActMethods)
      }),
      tile({
        /* A RATE, so its move is in POINTS. It is also the one tile here whose
           counter has a start date inside living memory, so the comparison
           drops out entirely rather than reporting the deploy as a surge —
           `rangeDelta` returns null the moment either window holds a day the
           counter was not running for. */
        label: 'Measured per active day', color: PC.reading, smallValue: true,
        value: measured.available ? fmtPct(measured.pct) : '–',
        deltaPts: measuredPrev === null || !measured.available
          ? null : measured.pct - measuredPrev,
        meta: measured.available
          ? fmtInt(measured.readings) + ' readings over ' + fmtInt(measured.active) +
            ' install-days on the app across ' + measured.days + ' day' + (measured.days === 1 ? '' : 's') +
            (measured.blind ? ' · ' + measured.blind + ' day' + (measured.blind === 1 ? '' : 's') +
              ' predate the counter and are left out' : '')
          : 'the reading counter has no days in this range'
      })
    ].join('');

    /* By install AGE, pooled over every cohort old enough to have reached the
       day being asked about. None of these move when the date range does, and
       none of them has a "previous range" to be read against — a retention
       curve is a claim about cohorts, not about a fortnight. */
    document.getElementById('pgTilesLife').innerHTML = [
      tile({ label: 'D1 retention', color: PC.fresh, smallValue: true, value: fmtRate(d1), meta: rateMeta(d1) }),
      tile({ label: 'D7 retention', color: PC.trial, smallValue: true, value: fmtRate(d7),
             meta: 'last day of the trial · ' + rateMeta(d7) }),
      tile({ label: 'D14 retention', color: PC.postTrial, smallValue: true, value: fmtRate(d14),
             meta: 'last day of full history · ' + rateMeta(d14) }),
      tile({ label: 'D30 retention', color: PC.wall, smallValue: true, value: fmtRate(d30), meta: rateMeta(d30) }),
      tile({
        label: 'Activated on day 0', color: PC.activation, smallValue: true, value: fmtRate(act0),
        meta: 'first reading on the install day · ' + rateMeta(act0)
      }),
      tile({
        label: 'Activated by D7', color: PC.activation, smallValue: true, value: fmtRate(act7),
        meta: rateMeta(act7)
      }),
      tile({
        label: 'Conversion by D7', color: PC.subs, smallValue: true, value: fmtRate(conv7),
        meta: rateMeta(conv7)
      }),
      tile({
        label: 'Conversion by D30', color: PC.subs, smallValue: true, value: fmtRate(conv30),
        meta: rateMeta(conv30)
      })
    ].join('');

    renderFilterNote(ix, days);
  }

  /**
   * What a strict slice left out.
   *
   * Picking iOS shows the pings that said iOS and nothing else, so the number
   * on the tile is true — and, right now, small. What it cannot do is leave the
   * rest unmentioned: with most of the population still on builds that predate
   * the platform marker, a slice showing 1 beside a combined 30 raises exactly
   * as much doubt as the old pooled 23 did, for the opposite reason.
   *
   * So the note states the decomposition in this view's own numbers, names the
   * total it adds up to, and gives the share of the range that cannot be
   * assigned — which is what says how much a per-store comparison is worth at
   * all today. It renders only with a filter on and unattributed pings present,
   * because that is the only case where anything was left out.
   */
  function renderFilterNote(ix, days) {
    var host = document.getElementById('pgFilterNote');
    if (!host) return;

    var unattr = A.unattributedOn(ix, ix.last);
    if (ix.platform === 'all' || !unattr) { host.innerHTML = ''; return; }

    var shown = A.activeOn(ix, ix.last);
    var split = A.platformsOn(ix, ix.last);      // always unfiltered
    var total = (split.I || 0) + (split.A || 0) + (split.U || 0);
    var other = ix.platform === 'ios' ? (split.A || 0) : (split.I || 0);
    var otherName = ix.platform === 'ios' ? 'Android' : 'iOS';
    var here = ix.platform === 'ios' ? 'iOS' : 'Android';

    /* Over the range too, since every chart below this is range-scoped and the
       newest day alone can be unrepresentative. */
    var rangeUnattr = 0, rangeShown = 0;
    (days || []).forEach(function (d) {
      rangeUnattr += A.unattributedOn(ix, d);
      rangeShown += A.activeOn(ix, d);
    });
    var pool = rangeShown + rangeUnattr;
    var share = pool ? (rangeUnattr / pool) * 100 : 0;

    host.innerHTML =
      '<div class="card warn-note" style="margin-bottom:16px">' +
      '<p><b>' + esc(here) + ' only — ' + fmtInt(unattr) + ' installs are not in this slice.</b> ' +
        'Of the ' + fmtInt(total) + ' active on ' + esc(labelDay(ix.last)) + ', ' +
        fmtInt(shown) + ' named ' + esc(here) + ', ' + fmtInt(other) + ' named ' + esc(otherName) + ', and <b>' +
        fmtInt(unattr) + '</b> named no store at all. The three add up to the combined total; this slice is the ' +
        'first of them.</p>' +
      '<p class="hint" style="margin:8px 0 0">A ping carries no store when it comes from a build that shipped ' +
        'before the platform marker existed, so it is an install whose store was never recorded rather than an ' +
        'install on a third platform. Those are only ever counted under <b>Combined</b> — putting them in both ' +
        'stores instead, which this view used to do, made iOS and Android sum to more than the total and hid the ' +
        'two real numbers behind the same shared pool. ' +
        (share >= 50
          ? '<b>' + fmtPct(share) + ' of this range names no store</b>, so a per-store comparison is barely worth ' +
            'making until those installs update: most of the population is in neither slice, and a quiet store ' +
            'here means "not measured yet" rather than "nobody there".'
          : fmtPct(share) + ' of this range names no store.') +
      '</p></div>';
  }

  /* Which store the day's pings came from.
   *
   * Deliberately unfiltered even when the filter bar is on one platform: this
   * tile is what the rest of the view is a slice OF. `unknown` is the honest
   * bucket for builds that shipped before the ping carried a platform marker,
   * so it is shown when it is non-zero rather than folded into either store.
   *
   * The iOS share is of the KNOWN pings only, which is why the meta line has to
   * say so the moment there are unknown ones: "62% iOS" computed over a day
   * that is half pre-marker is a claim about a fraction of the day, and reads
   * as a claim about all of it. With a platform filter in force those same
   * pings are also counted INTO the filtered view (see rowsToMap), so the line
   * says that too — otherwise the tile and the numbers beside it disagree with
   * no visible reason. */
  /* The two halves every store split needs, so an open tile and a purchase tile
     cannot disagree about what "no store" means. `split` is a raw `{I,A,U}` map
     and is always the UNFILTERED one — see platformsOn / subPlatformsOn. */
  function storeSplit(split) {
    var parts = [
      { name: 'iOS', color: ENTITY.ios, value: fmtInt(split.I || 0) },
      { name: 'Android', color: ENTITY.android, value: fmtInt(split.A || 0) }
    ];
    if (split.U) parts.push({ name: 'no store', color: COLOR.muted, value: fmtInt(split.U) });
    return parts;
  }
  /* Capture-method colours. Fixed, never assigned by rank — the same three
     sensors appear on a tile, in a chart and in a table on this page. */
  var METHOD_COLOR = { W: COLOR.s1, G: COLOR.s7, B: COLOR.s3, F: COLOR.s4, '?': COLOR.muted };

  /** A method split as tile parts, in the order the app offers the sensors. */
  function methodSplit(split) {
    return A.METHOD_ORDER.filter(function (k) { return split[k]; }).map(function (k) {
      return { name: A.methodName(k), color: METHOD_COLOR[k], value: fmtInt(split[k]) };
    });
  }
  /* Readings whose sensor letter we could not read: a build sending a letter
     this dashboard does not know, or — on the daily counter — a build that
     predates the letter entirely. Disclosed rather than silently pooled into
     one of the named sensors. */
  function methodSplitNote(split) {
    return split['?'] ? ' · ' + fmtInt(split['?']) + ' named no sensor' : '';
  }

  /* Appended to a tile's meta only when there is something to disclose: pings
     that named no store are in NEITHER half of the split, and with a filter on
     they are also counted into the filtered number the split sits under. */
  function storeSplitNote(ix, split) {
    if (!split.U) return '';
    return ' · ' + fmtInt(split.U) +
      (ix.platform === 'all' ? ' pre-marker, store unknown' : ' pre-marker, counted into every platform view');
  }

  function platformTile(ix) {
    var split = A.platformsOn(ix, ix.last);
    var ios = split.I || 0, android = split.A || 0, unknown = split.U || 0;
    var known = ios + android;
    var parts = storeSplit(split);

    var meta = 'of everything that pinged that day';
    if (unknown) {
      meta = 'of the ' + fmtInt(known) + ' that named a store · ' + fmtInt(unknown) +
        (ix.platform === 'all'
          ? ' pre-marker, store unknown'
          : ' pre-marker, in neither store\'s slice');
    }
    return tile({
      label: 'Platform on ' + labelDay(ix.last), color: ENTITY.ios,
      value: known ? Math.round((ios / known) * 100) + '% iOS' : '--',
      smallValue: true,
      meta: meta,
      split: parts
    });
  }

  /* ---------------------------------------------------------- 2. timeline */

  function renderTimeline(ix, days, marks) {
    var x = days.map(function (d) { return bucketLabel(d, 'day'); });
    var mode = pingUI.tlMode;
    var series = [];
    var fresh = [], back = [], dls = [], pv = [], subs = [];
    days.forEach(function (d) {
      fresh.push(A.newOn(ix, d));
      back.push(A.returningOn(ix, d));
      dls.push(dayRec('all', d).downloads);
      pv.push(dayRec('all', d).pageViews);
      subs.push(A.purchasesOn(ix, d));
    });

    if (mode !== 'acquisition') {
      series.push({ key: 'back', name: 'Returning', color: PC.back, type: 'bar', values: back });
      series.push({ key: 'fresh', name: 'First run', color: PC.fresh, type: 'bar', values: fresh });
    }
    if (mode !== 'usage') {
      series.push({ key: 'dl', name: 'Store downloads', color: PC.downloads, type: 'line', dashed: true, values: dls });
      if (mode === 'acquisition') {
        series.push({ key: 'pv', name: 'Product page views', color: PC.pageViews, type: 'line', dashed: true, values: pv });
      }
    }
    /* Purchases are two or three a day against hundreds of actives, so on this
       axis they are a flat line on the floor. They get their own section; here
       they ride the tooltip instead of pretending to be a series. */

    drawChart('pgTimeline', {
      x: x, series: series, stacked: mode !== 'acquisition', height: 330, format: fmtInt, xLabel: 'Day',
      marks: marks, onMarkClick: markClickFor(),
      tooltipNote: function (i) {
        var d = days[i];
        var bits = [];
        if (A.activeOn(ix, d)) bits.push(fmtInt(A.activeOn(ix, d)) + ' active installs');
        if (subs[i]) bits.push(fmtInt(subs[i]) + ' purchase' + (subs[i] === 1 ? '' : 's'));
        // Store reporting lags a day, so the newest columns are genuinely
        // incomplete on the acquisition side rather than a drop.
        if (d > asOf()) bits.push('store reporting has not landed yet');
        return bits.join(' · ') || 'no pings';
      }
    });
  }

  /* ------------------------------------------------------------- 3. curve */

  function renderCurve(ix) {
    var B = A.BOUNDARIES;
    var maxN = 60;
    var series = [];
    var len = 0;

    function toValues(curve) { return curve.map(function (p) { return p.pct; }); }

    if (pingUI.curveMode === 'split' && ix.cohorts.length >= 4) {
      // Split at the median cohort so "is retention improving?" has an answer
      // that does not depend on an arbitrary date.
      var half = Math.ceil(ix.cohorts.length / 2);
      var earlier = ix.cohorts.slice(0, half), recent = ix.cohorts.slice(half);
      var cE = A.curve(ix, earlier, maxN), cR = A.curve(ix, recent, maxN);
      len = Math.max(cE.length, cR.length);
      series.push({ key: 'earlier', name: 'Earlier cohorts', color: COLOR.muted, type: 'line', dashed: true, values: toValues(cE) });
      series.push({ key: 'recent', name: 'Recent cohorts', color: PC.fresh, type: 'line', values: toValues(cR) });
    } else {
      var c = A.curve(ix, ix.cohorts, maxN);
      len = c.length;
      series.push({ key: 'all', name: 'All mature cohorts', color: PC.fresh, type: 'area', values: toValues(c) });
    }

    var x = [];
    for (var i = 0; i < len; i++) x.push({ label: 'D' + i, full: 'Day ' + i });

    drawChart('pgCurve', {
      x: x, series: series, height: 300, format: fmtPct, xLabel: 'Days since install',
      emptyText: 'No cohort has reached its second day yet.',
      guides: [
        { index: B.trialLastDay, label: 'trial ends', color: PC.trial }
      ],
      tooltipNote: function (i) {
        var p = A.retentionAt(ix, ix.cohorts, i);
        var note = p.available ? 'over ' + p.cohorts + ' cohort' + (p.cohorts === 1 ? '' : 's') +
          ' · ' + fmtInt(p.kept) + ' of ' + fmtInt(p.of) : 'not yet available';
        if (i === B.firstPostTrial) note += ' · first day outside the trial';
        return note;
      }
    });
  }

  /* ---------------------------------------------------------- 3b. survival */

  function renderSurvival(ix) {
    var s = A.survival(ix, ix.cohorts);
    var labels = { 0: 'Install', 1: 'D1', 7: 'D7 (first week)', 14: 'D14 (last trial day)', 15: 'D15 (post-trial)', 30: 'D30' };
    var steps = s.steps.filter(function (p) { return p.available; });

    drawChart('pgSurvival', {
      x: steps.map(function (p) { return { label: 'D' + p.day, full: labels[p.day] || ('Day ' + p.day) }; }),
      series: [{ key: 'ret', name: 'Still active', color: PC.trial, type: 'bar', values: steps.map(function (p) { return p.pct; }) }],
      height: 220, format: fmtPct, legend: false,
      emptyText: 'No cohort has reached day 1 yet.',
      tooltipNote: function (i) {
        var p = steps[i];
        return fmtInt(p.kept) + ' of ' + fmtInt(p.of) + ' · ' + p.cohorts + ' cohort' + (p.cohorts === 1 ? '' : 's');
      }
    });

    function transitionHTML(t, title, why) {
      if (!t) {
        return '<div class="transition"><div class="t-title">' + esc(title) + '</div>' +
          '<div class="t-value na">Not yet measurable</div>' +
          '<div class="t-note">No cohort has reached the later day.</div></div>';
      }
      var cls = t.points < -1 ? 'down' : t.points > 1 ? 'up' : 'flat';
      var sign = t.points > 0 ? '+' : '';
      return '<div class="transition"><div class="t-title">' + esc(title) + '</div>' +
        '<div class="t-value ' + cls + '">' + sign + t.points.toFixed(1) + ' pts</div>' +
        '<div class="t-note">' + fmtPct(t.before.pct) + ' → ' + fmtPct(t.after.pct) +
        ' over ' + t.cohorts + ' cohort' + (t.cohorts === 1 ? '' : 's') + ' (' + fmtInt(t.after.of) + ' installs). ' +
        esc(why) + '</div></div>';
    }

    document.getElementById('pgTransitions').innerHTML =
      '<div class="transitions">' +
      transitionHTML(s.trialEnd,
        'Trial ends: D' + A.BOUNDARIES.trialLastDay + ' → D' + A.BOUNDARIES.firstPostTrial,
        'How many keep opening the app the day their trial runs out.') +
      '</div>';
  }

  /* ------------------------------------------------------------- 4. heatmap */

  function renderHeat(ix) {
    var byWeek = pingUI.heatGrain === 'week';
    var rows;
    if (byWeek) {
      rows = A.weeklyCohorts(ix, ix.cohorts).map(function (w) {
        return { key: w.key, label: 'Week of ' + labelDay(w.key), size: w.size, days: w.days,
                 cells: A.weekMilestones(ix, w, A.MILESTONES) };
      });
    } else {
      rows = ix.cohorts.map(function (c) {
        return { key: c, label: labelDay(c), size: A.cohortSize(ix, c), days: [c],
                 cells: A.milestoneRow(ix, c, A.MILESTONES) };
      });
    }
    rows.reverse();

    if (!rows.length) {
      document.getElementById('pgHeat').innerHTML = '<div class="empty">No cohort has a measurable day 0 yet.</div>';
      return;
    }

    var head = '<tr><th>Cohort</th><th>Installs</th>' + A.MILESTONES.map(function (n) {
      var cls = n === A.BOUNDARIES.firstPostTrial ? ' class="boundary"' : '';
      return '<th' + cls + '>D' + n + '</th>';
    }).join('') + '</tr>';

    var body = rows.map(function (row) {
      var small = row.size < A.SMALL_COHORT;
      var cells = row.cells.map(function (cell) {
        if (!cell.available) {
          return '<td class="heat immature" title="This cohort has not lived ' + cell.day + ' days yet — not zero, unknown"></td>';
        }
        var a = Math.min(1, Math.sqrt(Math.max(0, cell.pct) / 100)) * 0.85;
        var boundary = cell.day === A.BOUNDARIES.firstPostTrial;
        return '<td class="heat' + (boundary ? ' boundary' : '') + '" style="background:rgba(0,160,143,' + a.toFixed(3) + ')"' +
          ' title="' + fmtInt(cell.kept) + ' of ' + fmtInt(cell.of) + ' still active on day ' + cell.day +
          (cell.partial ? ' — some days of this week are still too young' : '') + '">' +
          (cell.pct >= 0.5 ? Math.round(cell.pct) + '%' : '·') + '</td>';
      }).join('');
      return '<tr data-cohort="' + esc(row.key) + '" class="heat-row' + (pingUI.cohort === row.key ? ' selected' : '') + '">' +
        '<td>' + esc(row.label) + '</td>' +
        '<td>' + fmtInt(row.size) + (small ? ' <span class="warn-small" title="Percentages over a handful of installs are noise">small</span>' : '') + '</td>' +
        cells + '</tr>';
    }).join('');

    document.getElementById('pgHeat').innerHTML =
      '<div class="table-scroll"><table class="grid-heat"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';

    document.getElementById('pgHeat').querySelectorAll('.heat-row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        pingUI.cohort = pingUI.cohort === tr.dataset.cohort ? null : tr.dataset.cohort;
        renderHeat(ix);
        renderCohortDetail(ix, rows);
      });
    });
    renderCohortDetail(ix, rows);
  }

  function renderCohortDetail(ix, rows) {
    var host = document.getElementById('pgCohortDetail');
    if (!pingUI.cohort) { host.innerHTML = ''; return; }
    var row = rows.filter(function (r) { return r.key === pingUI.cohort; })[0];
    if (!row) { host.innerHTML = ''; return; }

    var conv = A.conversion(ix, row.days, undefined);
    var d7 = A.retentionAt(ix, row.days, 7);
    var d15 = A.retentionAt(ix, row.days, 15);
    var age = A.maturity(ix, row.days[row.days.length - 1]);

    host.innerHTML = '<div class="cohort-detail">' +
      '<div class="cd-head"><b>' + esc(row.label) + '</b>' +
      '<span class="note">' + fmtInt(row.size) + ' installs · oldest member is ' + age + ' days old</span></div>' +
      '<div class="cd-grid">' +
      '<div><span class="cd-label">D7 retention</span><span class="cd-value">' + fmtRate(d7) + '</span><span class="cd-note">' + rateMeta(d7) + '</span></div>' +
      '<div><span class="cd-label">D15 retention</span><span class="cd-value">' + fmtRate(d15) + '</span><span class="cd-note">' + rateMeta(d15) + '</span></div>' +
      '<div><span class="cd-label">Purchases</span><span class="cd-value">' + fmtInt(conv.kept) + '</span><span class="cd-note">' + fmtRate(conv) + ' of this cohort, all time</span></div>' +
      '</div></div>';
  }

  /* -------------------------------------------------- 5. active by cohort */

  function renderActiveByCohort(ix, r) {
    /* "Who is using it today" means the latest day IN THE RANGE. On the default
       window that is simply the newest day the counter holds; on a custom range
       ending last month it is that range's last day, which is the only reading
       of "today" a date filter can honestly have. */
    var day = (r && r.to && ix.last && r.to < ix.last) ? r.to : ix.last;
    var abc = A.activeByCohort(ix, day);
    var rows = abc.rows.slice(0, 24);
    var B = A.BOUNDARIES;

    /* The boundary rules sit at an AGE, and a row is a cohort that happened to
       be active — with gaps, row index is not age. Find the first row at or
       past each boundary instead of assuming the two line up. */
    function guideAt(age, label, color) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].age >= age) return { index: i, label: label, color: color, atBandStart: true };
      }
      return null;
    }

    drawChart('pgActiveCohort', {
      x: rows.map(function (r) {
        return { label: 'D' + r.age, full: labelFull(r.cohort) + ' · ' + r.age + ' days old' };
      }),
      series: [{
        key: 'n', name: 'Active today', type: 'bar',
        color: PC.back,
        values: rows.map(function (r) { return r.count; })
      }],
      height: 240, format: fmtInt, legend: false, xLabel: 'Install age',
      emptyText: 'Nobody has pinged on the latest day yet.',
      guides: [guideAt(B.firstPostTrial, 'post-trial', PC.trial)].filter(Boolean),
      tooltipNote: function (i) {
        var r = rows[i];
        return fmtInt(r.count) + ' of today\'s ' + fmtInt(abc.total) + ' active installs' +
          (r.measurable ? '' : ' · installed before the counter, so no retention rate for it');
      }
    });

    renderOlderInstalls(ix);
  }

  /**
   * Installs older than the counter get their own list rather than a footnote.
   *
   * They are the most-established users the app has, and on a counter that is
   * days old they are most of what there is to look at. Everything here is
   * genuinely known — the install date rode in on the ping — so the only thing
   * withheld is the retention percentage, which has no denominator and never
   * will: nobody counted how many installed that day.
   */
  function renderOlderInstalls(ix) {
    var host = document.getElementById('pgOlderInstalls');
    if (!host) return;
    var rows = A.preTrackingCohorts(ix);
    if (!rows.length) { host.innerHTML = ''; return; }

    var B = A.BOUNDARIES;
    host.innerHTML =
      '<p class="hint" style="margin:12px 0 6px"><b>Installed before the counter existed.</b> ' +
      'Their install date arrived with the ping, so their age is exact. Their cohort size was never ' +
      'observed, so they carry no retention percentage and are left out of every rate above.</p>' +
      '<div class="table-scroll"><table><thead><tr><th>Installed</th><th>Age</th><th>Stage</th>' +
      '<th>Active on ' + esc(labelDay(ix.last)) + '</th><th>Days seen</th><th>Last seen</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var stage = r.age <= B.trialLastDay ? '<span class="pill trial">In trial</span>'
          : '<span class="pill past14">Past trial</span>';
        return '<tr><td>' + esc(labelFull(r.cohort)) + '</td>' +
          '<td>D' + r.age + '</td>' +
          '<td style="text-align:left">' + stage + '</td>' +
          '<td>' + fmtInt(r.activeLatest) + '</td>' +
          '<td>' + fmtInt(r.days) + '</td>' +
          '<td>' + (r.lastSeen ? esc(labelDay(r.lastSeen)) : '–') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ----------------------------------------------------- 6. purchase timing */

  /* Below this many purchases the list is open on arrival; above it the
     histogram beside it is the better read and the list collapses behind a
     press. The number is "how many rows can be taken in at a glance", not a
     performance limit. */
  var PURCHASE_ROWS_OPEN_MAX = 12;

  /* Remembered for the session only, and deliberately not in `state`: which
     way a disclosure is currently facing is not worth syncing to another
     device, the same call the Edit data accordions make. */
  var purchaseRowsOpen = null;

  var STORE_LABEL = { I: 'iOS', A: 'Android', U: 'no store' };

  /**
   * Every subscribe ping, one row each.
   *
   * The histogram above needs a population to mean anything; this is what a
   * new app actually has. Three columns carry the whole of what a purchase
   * ping knows — when it arrived, when that install first ran, and which store
   * it was on — and the fourth, age, is the subtraction people actually want.
   *
   * The two annotations are the point of building it:
   *
   *   **the store**, because with the App Store still on a build that predates
   *   the platform marker, "no store" is a real and common answer here and it
   *   must not read as a third platform;
   *
   *   **"seen twice?"**, which flags a cohort key appearing on two adjacent
   *   days. That is the fingerprint of a ping the server counted and whose
   *   response was lost, re-sent on the next foreground — the one way this
   *   counter can overstate a purchase, and completely invisible in every
   *   aggregate on this page. It is worded as a question and changes no
   *   number: nothing here is authorised to decide that a purchase did not
   *   happen.
   */
  function renderPurchaseRows(ix) {
    var host = document.getElementById('pgPurchaseRows');
    if (!host) return;

    var rows = A.purchaseRows(ix);
    if (!rows.length) { host.innerHTML = ''; return; }

    var open = purchaseRowsOpen === null ? rows.length <= PURCHASE_ROWS_OPEN_MAX : purchaseRowsOpen;
    var flagged = A.suspectRetries(rows);
    var total = rows.reduce(function (a, x) { return a + x.count; }, 0);

    var body = rows.map(function (x) {
      var suspect = flagged[x.day + '|' + x.key];
      return '<tr' + (suspect ? ' class="warn-row"' : '') + '>' +
        '<td>' + esc(labelFull(x.day)) + '</td>' +
        '<td>' + esc(x.cohort ? labelFull(x.cohort) : '–') + '</td>' +
        '<td>' + (x.age === null ? '–' : 'D' + fmtInt(x.age)) + '</td>' +
        '<td>' + esc(STORE_LABEL[x.platform] || STORE_LABEL.U) + '</td>' +
        '<td>' + fmtInt(x.count) + '</td>' +
        '<td>' + (suspect ? '<span class="warn-small">seen twice?</span>' : '') + '</td>' +
        '</tr>';
    }).join('');

    host.innerHTML =
      '<div class="rows-head">' +
        '<button class="btn sm" id="pgPurchaseRowsToggle">' + (open ? 'Hide' : 'Show') + ' all ' +
          fmtInt(total) + ' ' + (total === 1 ? 'purchase' : 'purchases') + '</button>' +
      '</div>' +
      '<div id="pgPurchaseRowsTable" class="' + (open ? '' : 'hidden') + '" style="margin-top:10px">' +
        '<div class="table-scroll"><table><thead><tr>' +
          '<th>Paid</th><th>Installed</th><th>Age</th><th>Store</th><th>Count</th><th></th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div>' +
        (Object.keys(flagged).length
          ? '<p class="note" style="margin-top:8px">A row marked <b>seen twice?</b> shares its install day with a purchase one day either side of it. ' +
            'That is what a ping looks like when the server counted it and the reply was lost on the way back, so the app sent it again — ' +
            'the one way this counter can overstate a sale. It is a suspicion, not a correction: nothing above has been adjusted.</p>'
          : '') +
        '<p class="note" style="margin-top:8px">Subscribe pings, not store receipts. <b>Store</b> comes off the ping\'s own cohort key, so ' +
          '"no store" means a build that shipped before the platform marker rather than a third platform. This list is never filtered by ' +
          'the platform selector — the store is one of its columns.</p>' +
      '</div>';

    var btn = document.getElementById('pgPurchaseRowsToggle');
    if (btn) {
      btn.addEventListener('click', function () {
        purchaseRowsOpen = document.getElementById('pgPurchaseRowsTable').classList.contains('hidden');
        renderPurchaseRows(ix);
      });
    }
  }

  function renderPurchases(ix, r) {
    var ages = A.purchaseAges(ix);
    drawChart('pgPurchaseAge', {
      x: ages.buckets.map(function (b) { return { label: b.label, full: b.label + (b.note ? ' — ' + b.note : '') }; }),
      series: [{
        key: 'n', name: 'Purchases', color: PC.subs, type: 'bar',
        values: ages.buckets.map(function (b) { return b.count; })
      }],
      height: 220, format: fmtInt, legend: false, xLabel: 'Install age at purchase',
      emptyText: 'No purchases have been recorded yet.',
      guides: [{ index: 2, label: 'wall', color: PC.wall }],
      tooltipNote: function (i) {
        var b = ages.buckets[i];
        return ages.total ? pctOf(b.count, ages.total) + ' of all purchases' : '';
      }
    });

    renderPurchaseRows(ix);

    var conv7 = A.conversion(ix, ix.cohorts, 7);
    var conv30 = A.conversion(ix, ix.cohorts, 30);
    document.getElementById('pgConversion').innerHTML =
      '<div class="mini-rows">' +
      '<div><span>Bought by D7</span><b>' + fmtRate(conv7) + '</b><span class="note">' + rateMeta(conv7) + '</span></div>' +
      '<div><span>Bought by D30</span><b>' + fmtRate(conv30) + '</b><span class="note">' + rateMeta(conv30) + '</span></div>' +
      '</div>';
  }

  /* ------------------------------------------------------ 5c. activation

     The step between downloading and retaining. Two questions, one card each:
     WHEN a first reading happens (the wizard's own number is day 0; anything
     later is a recovery), and WITH WHAT.

     Both read the filtered index, unlike the platform chart below: "how do iOS
     users activate" is a question about the slice. Apple Watch is iOS-only, so
     its share of a combined view is a share of a population half of which was
     never offered it — which is exactly why the platform filter matters here
     and is said out loud under the chart. */
  function renderActivation(ix, days) {
    var ages = A.activationAges(ix);
    drawChart('pgActivationAge', {
      x: ages.buckets.map(function (b) { return { label: b.label, full: b.label }; }),
      series: [{
        key: 'n', name: 'First readings', color: PC.activation, type: 'bar',
        values: ages.buckets.map(function (b) { return b.count; })
      }],
      height: 220, format: fmtInt, legend: false, xLabel: 'Install age at first reading',
      emptyText: 'No first readings have been recorded yet.',
      tooltipNote: function (i) {
        var b = ages.buckets[i];
        return ages.total ? pctOf(b.count, ages.total) + ' of all activations' : '';
      }
    });

    var act0 = A.activation(ix, ix.cohorts, 0);
    var act1 = A.activation(ix, ix.cohorts, 1);
    var act7 = A.activation(ix, ix.cohorts, 7);
    document.getElementById('pgActivationRates').innerHTML =
      '<div class="mini-rows">' +
      '<div><span>Activated on day 0</span><b>' + fmtRate(act0) + '</b><span class="note">' + rateMeta(act0) + '</span></div>' +
      '<div><span>Activated by D1</span><b>' + fmtRate(act1) + '</b><span class="note">' + rateMeta(act1) + '</span></div>' +
      '<div><span>Activated by D7</span><b>' + fmtRate(act7) + '</b><span class="note">' + rateMeta(act7) + '</span></div>' +
      '</div>';

    /* Per day and stacked, the same shape the store split below uses: one band
       per sensor, so a shift between them is visible rather than only a total.
       A method with nothing in the whole range gets no band at all — an empty
       legend entry reads as "zero today" when it means "never". */
    var perDay = days.map(function (d) { return A.methodsOn(ix, d); });
    var split = A.methodsOver(ix, days);
    var keys = A.METHOD_ORDER.filter(function (k) { return split[k]; });
    var total = keys.reduce(function (a, k) { return a + split[k]; }, 0);
    drawChart('pgMethods', {
      x: days.map(labelDay), stacked: true, height: 220, format: fmtInt, xLabel: 'Day',
      series: keys.map(function (k) {
        return {
          key: k, name: A.methodName(k), color: METHOD_COLOR[k], type: 'area',
          values: perDay.map(function (m) { return m[k] || 0; })
        };
      }),
      emptyText: 'No first readings in this range.'
    });
    document.getElementById('pgMethodNote').innerHTML = !total ? '' :
      '<p class="note" style="margin-top:10px">' + fmtInt(total) + ' first reading' + (total === 1 ? '' : 's') +
      ' across this range' +
      rangeTrendNote(ix, days, function (d) { return A.activationsOn(ix, d); }) +
      methodSplitNote(split) +
      (ix.platform === 'all'
        ? ' · combined, so the Apple Watch share is a share of everyone including Android, which is never offered it'
        : ' · ' + (ix.platform === 'ios' ? 'iOS' : 'Android') + ' only') +
      '.</p>';
  }

  /* ------------------------------------------- 5d. which sensor, ongoing
   *
   * The first-reading split (5c) says how people START. These two say what they
   * KEEP using, and the pair is the only way this endpoint can be asked whether
   * a sensor holds anybody: there is no identifier, so the activation route and
   * the reading route cannot be joined per person, and the comparison left is
   * between their two MIXES.
   *
   * Both are silent before `hrvMethodFirst`. A reading row from before the
   * letter shipped names no sensor, and drawing those as an unknown band would
   * be a claim about the data ("we could not tell") standing in for a fact
   * about the instrument ("we were not asking"). Same rule as `hrvKnown`, one
   * level down. */
  function renderReadingMethods(ix, days) {
    var keysOf = function (split) {
      return A.METHOD_ORDER.filter(function (k) { return split[k]; });
    };
    /* The sensors we can actually name. '?' is a real bucket and is disclosed
       in the note, but it can never be the subject of a sentence about which
       sensor people use. */
    var named = function (keys) {
      return keys.filter(function (k) { return k !== '?'; });
    };

    /* ---- by date. Null (not 0) before the letter, so the stack breaks into a
       gap rather than drawing a floor of zeroes nobody measured on. */
    var pooled = A.hrvMethodsOver(ix, days);
    var keys = keysOf(pooled);
    var total = keys.reduce(function (a, k) { return a + pooled[k]; }, 0);

    drawChart('pgReadMethods', {
      x: days.map(labelDay), stacked: true, height: 220, format: fmtInt, xLabel: 'Day',
      series: keys.map(function (k) {
        return {
          key: k, name: A.methodName(k), color: METHOD_COLOR[k], type: 'area',
          values: days.map(function (d) {
            return A.hrvMethodKnown(ix, d) ? (A.hrvMethodsOn(ix, d)[k] || 0) : null;
          })
        };
      }),
      emptyText: 'No readings have named a sensor yet.',
      tooltipNote: function (i) {
        return A.hrvMethodKnown(ix, days[i]) ? '' : 'before the reading counter named its sensor';
      }
    });

    document.getElementById('pgReadMethodNote').innerHTML = !total
      ? '<p class="note" style="margin-top:10px">' +
        (ix.hrvMethodFirst
          ? 'No reading in this range named a sensor.'
          : 'Readings have not started naming their sensor yet. This fills from the first ' +
            'reading saved by a build that sends the letter.') + '</p>'
      : '<p class="note" style="margin-top:10px">' + fmtInt(total) + ' install-day' +
        (total === 1 ? '' : 's') + ' carried a reading in this range' +
        rangeTrendNote(ix, days, function (d) {
          return A.hrvKnown(ix, d) ? A.readingsOn(ix, d) : null;
        }) +
        methodSplitNote(pooled) +
        /* Named sensors only, and the segment drops out entirely when there are
           none — every reading in range naming no sensor is a real state (a
           build sending a letter this dashboard does not know), and it is
           already disclosed by methodSplitNote above. */
        named(keys).map(function (k) {
          return ' · ' + A.methodName(k) + ' ' + pctOf(pooled[k], total);
        }).join('') +
        (ix.hrvMethodFirst ? ' · counted from ' + esc(labelFull(ix.hrvMethodFirst)) : '') + '.</p>';

    /* ---- by install age, as SHARES. Counts would just redraw the retention
       curve — every sensor's line falling together says nothing about the mix,
       which is the whole question. Shares sum to 100% at every age, so a band
       that narrows as the ages rise is a sensor losing its place. */
    var curve = A.hrvMethodCurve(ix, ix.cohorts, 30);
    var ageKeys = keysOf(curve.reduce(function (acc, p) {
      Object.keys(p.methods).forEach(function (k) { acc[k] = (acc[k] || 0) + p.methods[k]; });
      return acc;
    }, {}));

    drawChart('pgReadMethodAge', {
      x: curve.map(function (p) { return { label: 'D' + p.day, full: 'Day ' + p.day }; }),
      stacked: true, height: 220, format: fmtPct, xLabel: 'Days since install',
      series: ageKeys.map(function (k) {
        return {
          key: k, name: A.methodName(k), color: METHOD_COLOR[k], type: 'area',
          values: curve.map(function (p) {
            return p.total ? ((p.methods[k] || 0) / p.total) * 100 : null;
          })
        };
      }),
      emptyText: 'No cohort has a reading with a sensor on it yet.',
      tooltipNote: function (i) {
        var p = curve[i];
        if (!p || !p.total) return 'no readings from these cohorts at that age';
        return fmtInt(p.total) + ' reading-day' + (p.total === 1 ? '' : 's') +
          ' from ' + fmtInt(p.cohorts) + ' cohort' + (p.cohorts === 1 ? '' : 's') +
          (p.blind ? ' · ' + p.blind + ' left out, before the sensor letter' : '');
      }
    });

    /* The one sentence worth drawing out: how each sensor's share at day 0
       compares with its share across the oldest ages that have data. Stated in
       percentage POINTS, and hedged, because a share of a handful of
       reading-days is not a trend and the leaving/upgrading ambiguity is real. */
    var first = curve[0];
    var tail = curve.filter(function (p) { return p.total && p.day >= 7; });
    var tailTotal = tail.reduce(function (a, p) { return a + p.total; }, 0);
    var note = document.getElementById('pgReadMethodAgeNote');
    if (!first || !first.total || !tailTotal || !named(ageKeys).length) {
      note.innerHTML = '<p class="note" style="margin-top:10px">' +
        'Not enough aged reading-days yet to compare the day-0 mix against a later one. ' +
        'This needs cohorts born after the sensor letter shipped to reach a week old.</p>';
    } else {
      var moves = named(ageKeys).map(function (k) {
        var d0 = ((first.methods[k] || 0) / first.total) * 100;
        var later = tail.reduce(function (a, p) { return a + (p.methods[k] || 0); }, 0) / tailTotal * 100;
        return { name: A.methodName(k), move: later - d0, d0: d0, later: later };
      });
      note.innerHTML = '<p class="note" style="margin-top:10px">' +
        'Day 0 against day 7+ (' + fmtInt(first.total) + ' reading-day' + (first.total === 1 ? '' : 's') +
        ' vs ' + fmtInt(tailTotal) + '): ' +
        moves.map(function (m) {
          return '<b>' + esc(m.name) + '</b> ' + fmtPct(m.d0) + ' → ' + fmtPct(m.later) +
            ' (' + (m.move >= 0 ? '+' : '') + m.move.toFixed(1) + ' pts)';
        }).join(' · ') + '.</p>' +
        '<p class="hint" style="margin:8px 0 0">A share that falls with age means that sensor is behind ' +
        'a smaller slice of later reading-days. It does <b>not</b> say those people left — they may have ' +
        'bought a strap — and nothing on this endpoint can separate the two.</p>';
    }
  }

  /* ------------------------------------------------------ 5e. measuring

     The counter's fourth route, and the one that answers the question every
     other card here can only circle: are the people who open the app actually
     using it?

     Retention says somebody launched. A journal app can be launched every
     morning to look at yesterday's number and never gain a new one, and that
     install is on its way out while drawing a perfect retention curve. The
     reading counter is capped at one per install per Eastern day by the same
     client rule the open counter runs, and bucketed on the same boundary, so
     the two are directly comparable and their ratio is a share of PEOPLE.

     Everything here is null before `hrvFirst` — the route shipped in a build of
     its own, and a day the counter was not running is unknown, not zero. */
  function renderMeasuring(ix, days) {
    var known = days.filter(function (d) { return A.hrvKnown(ix, d); });

    /* Actives and readings on one axis, and the share as its own line on the
       right of the tooltip rather than a second y-axis — the two counts are the
       same kind of thing (people that day) and the share is a reading OF them,
       not a third series to be compared against them by height. */
    var active = days.map(function (d) { return A.activeOn(ix, d); });
    var read = days.map(function (d) { return A.hrvKnown(ix, d) ? A.readingsOn(ix, d) : null; });

    drawChart('pgMeasureDaily', {
      x: days.map(labelDay), height: 280, format: fmtInt, xLabel: 'Day',
      series: [
        { key: 'active', name: 'Opened the app', color: PC.active, type: 'area', values: active },
        { key: 'read', name: 'Took a reading', color: PC.reading, type: 'line', values: read }
      ],
      emptyText: 'No pings in this range.',
      tooltipNote: function (i) {
        var share = A.measureShare(ix, days[i]);
        if (share === null) {
          return A.hrvKnown(ix, days[i]) ? 'nobody opened the app' : 'before the reading counter shipped';
        }
        return fmtPct(share) + ' of the day\'s installs measured';
      }
    });

    /* Over the WHOLE range, not over `known`: measureRate does its own
       filtering and it is the one that knows how many days it had to leave out.
       Handing it the pre-filtered list would report `blind: 0` and quietly drop
       the sentence that says the window straddles the counter's release. */
    var rate = A.measureRate(ix, days);
    var host = document.getElementById('pgMeasureNote');
    if (!rate.available) {
      host.innerHTML = '<p class="note" style="margin-top:10px">' +
        (ix.hrvFirst
          ? 'No day in this range is covered by the reading counter, which started on ' +
            esc(labelFull(ix.hrvFirst)) + '.'
          : 'The reading counter has not been heard from yet. It starts filling the first time a build ' +
            'carrying it saves a reading.') + '</p>';
    } else {
      /* The comparison that makes the rate mean something: the second half of
         the window against the first. Both are pooled install-days, so this is
         "is the habit spreading or thinning", and it is stated in percentage
         POINTS because a ratio of two ratios is not a thing anybody can read. */
      var half = Math.ceil(known.length / 2);
      var early = A.measureRate(ix, known.slice(0, half));
      var late = A.measureRate(ix, known.slice(half));
      var move = (early.available && late.available && known.length >= 6)
        ? late.pct - early.pct : null;

      host.innerHTML = '<p class="note" style="margin-top:10px">' +
        '<b>' + fmtPct(rate.pct) + '</b> of install-days on the app carried a reading — ' +
        fmtInt(rate.readings) + ' of ' + fmtInt(rate.active) + ' across ' + rate.days +
        ' counted day' + (rate.days === 1 ? '' : 's') +
        (rate.blind ? ', with ' + rate.blind + ' earlier day' + (rate.blind === 1 ? '' : 's') +
          ' left out because the counter was not running yet' : '') + '. ' +
        (move === null ? ''
          : 'Second half of the window against the first: <b>' +
            (move >= 0 ? '+' : '') + move.toFixed(1) + ' points</b> (' +
            fmtPct(early.pct) + ' → ' + fmtPct(late.pct) + ').') +
        '</p>' +
        '<p class="hint" style="margin:8px 0 0">Both counters are one per install per Eastern day, so this is a ' +
        'share of the people who were there and not of the pings. It can read above 100% on a day when a ' +
        'reading landed without its open ping — a launch made offline, or a reading saved either side of ' +
        'midnight Eastern — and it is shown as it comes out rather than clamped, because that gap is the only ' +
        'thing that says the two counters have drifted.</p>';
    }

    /* The habit curve: retention and measuring on one axis, by install age.
       The gap between them IS the finding — every point of it is an install
       that opened the app that day and did not measure. */
    var maxN = 60;
    var open = A.curve(ix, ix.cohorts, maxN);
    var meas = A.measuringCurve(ix, ix.cohorts, maxN);
    var len = Math.max(open.length, meas.length);
    var x = [];
    for (var i = 0; i < len; i++) x.push({ label: 'D' + i, full: 'Day ' + i });

    drawChart('pgMeasureCurve', {
      x: x, height: 280, format: fmtPct, xLabel: 'Days since install',
      series: [
        { key: 'open', name: 'Opened', color: PC.active, type: 'line',
          values: open.map(function (p) { return p.pct; }) },
        { key: 'meas', name: 'Measured', color: PC.reading, type: 'area',
          values: meas.map(function (p) { return p.pct; }) }
      ],
      emptyText: 'No cohort has a measurable day yet.',
      guides: [{ index: A.BOUNDARIES.trialLastDay, label: 'trial ends', color: PC.trial }],
      tooltipNote: function (i) {
        var m = A.measuringAt(ix, ix.cohorts, i);
        if (!m.available) {
          return m.blind ? 'the reading counter had not shipped by day ' + i + ' for these cohorts'
            : 'not yet available';
        }
        return fmtInt(m.kept) + ' of ' + fmtInt(m.of) + ' over ' + m.cohorts +
          ' cohort' + (m.cohorts === 1 ? '' : 's') +
          (m.blind ? ' · ' + m.blind + ' outside the counter' : '');
      }
    });

    document.getElementById('pgMeasureRates').innerHTML =
      '<div class="mini-rows">' +
      [0, 1, 7, 14, 30].map(function (n) {
        var m = A.measuringAt(ix, ix.cohorts, n);
        return '<div><span>Measured on D' + n + '</span><b>' + fmtRate(m) + '</b>' +
          '<span class="note">' + measureMeta(m) + '</span></div>';
      }).join('') +
      '</div>';

    renderReadingMethods(ix, days);
  }

  /* ------------------------------------------------ 5d2. the capture funnel

     The pair that makes abandonment visible. Everything here obeys the rule the
     two counters were built on: they fire at the START and the COMPLETION of a
     reading and never at the save, so "completed" means a measurement exists,
     whether or not the user then filed it.

     The per-sensor rows are the point of the card. A pooled completion rate is
     a number to worry about; "camera readings finish 61% of the time and strap
     readings 92%" is a decision about which sensor to put in front of a new
     user. */
  function renderCaptureFunnel(ix, days) {
    var started = days.map(function (d) { return A.kindKnown(ix, 'cap', d) ? A.eventsOn(ix, 'cap', d) : null; });
    var done = days.map(function (d) { return A.kindKnown(ix, 'hrv', d) ? A.eventsOn(ix, 'hrv', d) : null; });

    drawChart('pgFunnel', {
      x: days.map(labelDay), height: 280, format: fmtInt, xLabel: 'Day',
      series: [
        { key: 'start', name: 'Started a reading', color: PC.active, type: 'area', values: started },
        { key: 'done', name: 'Finished one', color: PC.reading, type: 'line', values: done }
      ],
      emptyText: 'No captures in this range.',
      tooltipNote: function (i) {
        var f = A.captureFunnel(ix, [days[i]]);
        if (!f.available) {
          return f.blind ? 'before the capture counters shipped' : 'nobody started a reading';
        }
        return fmtPct(f.pct) + ' finished · ' + fmtInt(f.abandoned) + ' walked away';
      }
    });

    var all = A.captureFunnel(ix, days);
    var host = document.getElementById('pgFunnelNote');
    if (!all.available) {
      host.innerHTML = '<p class="note" style="margin-top:10px">' +
        (ix.firstDay && ix.firstDay.cap
          ? 'No reading was started in this range.'
          : 'The capture counters have not been heard from yet. They start filling the first time a ' +
            'build carrying them runs a reading.') + '</p>';
      return;
    }

    /* Per sensor, ranked by how much of the total it is — the biggest source
       first, because that is the one whose completion rate matters most. A
       sensor nobody used in the range gets no row at all: an empty rate reads
       as a bad one. */
    var rows = A.METHOD_ORDER.map(function (k) {
      return { k: k, f: A.captureFunnel(ix, days, k) };
    }).filter(function (r) { return r.f.started > 0; })
      .sort(function (a, b) { return b.f.started - a.f.started; })
      .map(function (r) {
        return '<div><span>' + esc(A.methodName(r.k)) + '</span><b>' + fmtPct(r.f.pct) + '</b>' +
          '<span class="note">' + fmtInt(r.f.completed) + ' of ' + fmtInt(r.f.started) +
          ' finished' + (r.f.abandoned ? ' · ' + fmtInt(r.f.abandoned) + ' walked away' : '') +
          '</span></div>';
      }).join('');

    host.innerHTML = '<p class="note" style="margin-top:10px">' +
      '<b>' + fmtPct(all.pct) + '</b> of started readings were finished — ' +
      fmtInt(all.completed) + ' of ' + fmtInt(all.started) + ' across ' + all.days +
      ' counted day' + (all.days === 1 ? '' : 's') +
      (all.blind ? ', with ' + all.blind + ' earlier day' + (all.blind === 1 ? '' : 's') +
        ' left out because the counters were not running yet' : '') + '. ' +
      fmtInt(all.abandoned) + ' reading' + (all.abandoned === 1 ? ' was' : 's were') +
      ' begun and walked away from.</p>' +
      (rows ? '<div class="mini-rows">' + rows + '</div>' : '') +
      '<p class="hint" style="margin:8px 0 0">Both counters are one per install per Eastern day, so this is a ' +
      'rate over install-days: of the days somebody began a reading, the share on which they finished one. It ' +
      'can read above 100% on a day when a reading begun before midnight Eastern finished after it, and it is ' +
      'shown as it comes out rather than clamped.</p>';
  }

  /* ------------------------------------------------------ 5f. the paywall

     The counter's fifth route. Everything here obeys the same two rules the
     reading counter taught: a day before the route shipped is a GAP and not a
     zero, and a once-a-day cap means these are people, not events.

     The rule this card adds is the one about what a surface split can claim.
     The cap names the FIRST wall of the day, so this is a ranking of front
     doors and not of lock frequency: a surface people always meet second is
     invisible here however often it fires. The hint on the card says so, and
     nothing in this function may be written as though it were a count of how
     often each feature is locked. */
  var SURFACE_COLOR = {
    R: COLOR.s1, I: COLOR.s7, P: COLOR.s3, O: COLOR.s4,
    M: COLOR.s2, N: COLOR.s5, S: COLOR.muted, '?': COLOR.muted
  };

  function renderPaywall(ix, days) {
    var active = days.map(function (d) { return A.activeOn(ix, d); });
    var walls = days.map(function (d) { return A.payKnown(ix, d) ? A.paywallsOn(ix, d) : null; });

    drawChart('pgPayDaily', {
      x: days.map(labelDay), height: 280, format: fmtInt, xLabel: 'Day',
      series: [
        { key: 'active', name: 'Opened the app', color: PC.active, type: 'area', values: active },
        { key: 'wall', name: 'Met the paywall', color: PC.wall, type: 'line', values: walls }
      ],
      emptyText: 'No pings in this range.',
      tooltipNote: function (i) {
        var share = A.paywallShare(ix, days[i]);
        if (share === null) {
          return A.payKnown(ix, days[i]) ? 'nobody opened the app' : 'before the paywall counter shipped';
        }
        return fmtPct(share) + ' of the day\'s installs met a wall';
      }
    });

    /* Pooled as install-DAYS, the same way `measureRate` pools, and stated
       beside the purchases in the same window — the pair is the point. A wall
       share that climbs while purchases sit still is not a funnel. */
    var known = days.filter(function (d) { return A.payKnown(ix, d); });
    var host = document.getElementById('pgPayNote');
    if (!known.length) {
      host.innerHTML = '<p class="note" style="margin-top:10px">' +
        (ix.payFirst
          ? 'No day in this range is covered by the paywall counter, which started on ' +
            esc(labelFull(ix.payFirst)) + '.'
          : 'The paywall counter has not been heard from yet. It starts filling the first time a build ' +
            'carrying it raises the card.') + '</p>';
    } else {
      var wallDays = known.reduce(function (a, d) { return a + A.paywallsOn(ix, d); }, 0);
      var openDays = known.reduce(function (a, d) { return a + A.activeOn(ix, d); }, 0);
      var bought = known.reduce(function (a, d) { return a + A.purchasesOn(ix, d); }, 0);
      var blind = days.length - known.length;
      host.innerHTML = '<p class="note" style="margin-top:10px">' +
        '<b>' + (openDays ? fmtPct((wallDays / openDays) * 100) : '—') +
        '</b> of install-days on the app met the paywall — ' + fmtInt(wallDays) + ' of ' +
        fmtInt(openDays) + ' across ' + known.length + ' counted day' + (known.length === 1 ? '' : 's') +
        (blind ? ', with ' + blind + ' earlier day' + (blind === 1 ? '' : 's') +
          ' left out because the counter was not running yet' : '') +
        /* Walls met, this range against the one before it. Null — and so
           absent — whenever either window holds a day the counter was not
           running for, which is most ranges while this counter is young. */
        rangeTrendNote(ix, days, function (d) {
          return A.payKnown(ix, d) ? A.paywallsOn(ix, d) : null;
        }) + '. ' +
        fmtInt(bought) + ' purchase' + (bought === 1 ? '' : 's') + ' landed in the same window.</p>' +
        '<p class="hint" style="margin:8px 0 0">One ping per install per Eastern day, so this is the share of the ' +
        'people who were there and not the number of times a lock fired. The two numbers are worth reading ' +
        'together and not as a rate: the walls are people who were asked, the purchases are people who said yes, ' +
        'and they are rarely the same people in the same window.</p>';
    }

    renderSurfaces(ix, days);
  }

  /* WHICH wall — the activation card's twin over the paywall counter.

     `S` (the Upgrade button in Settings) is split out of the ranking rather
     than listed in it. It is the one entry that is not a lock somebody walked
     into, and a "top wall" list with a deliberate tap sitting in it answers
     neither question it looks like it answers. */
  function renderSurfaces(ix, days) {
    var perDay = days.map(function (d) { return A.payKnown(ix, d) ? A.surfacesOn(ix, d) : {}; });
    var split = A.surfacesOver(ix, days);
    var keys = A.SURFACE_ORDER.filter(function (k) { return split[k]; });
    var total = keys.reduce(function (a, k) { return a + split[k]; }, 0);
    var sought = split.S || 0;
    var walls = total - sought;

    drawChart('pgSurfaces', {
      x: days.map(labelDay), stacked: true, height: 280, format: fmtInt, xLabel: 'Day',
      series: keys.map(function (k) {
        return {
          key: k, name: A.surfaceName(k), color: SURFACE_COLOR[k], type: 'area',
          values: perDay.map(function (m) { return m[k] || 0; })
        };
      }),
      emptyText: 'No paywalls in this range.',
      tooltipNote: function (i) {
        return A.payKnown(ix, days[i]) ? '' : 'before the paywall counter shipped';
      }
    });

    var ranked = A.WALL_ORDER.filter(function (k) { return k !== '?' && split[k]; })
      .sort(function (a, b) { return split[b] - split[a]; });
    document.getElementById('pgSurfaceNote').innerHTML = !total ? '' :
      '<p class="note" style="margin-top:10px">' +
      (ranked.length
        ? 'The app\'s front door to Pro is <b>' + esc(A.surfaceName(ranked[0])) + '</b>' +
          (walls ? ', ' + fmtPct((split[ranked[0]] / walls) * 100) + ' of the walls met' : '') + '.'
        : 'No wall in this range named a surface.') +
      (sought ? ' A further ' + fmtInt(sought) + ' went looking for it in Settings, which is not a wall ' +
        'and is kept out of that ranking.' : '') +
      '</p>';
  }

  /* --------------------------------------------- 5h. offers and events

     Everything on the per-letter routes. The cap there is per LETTER, not per
     route, which is what makes each line below a headcount for its own thing —
     and what makes the route TOTAL meaningless, so nothing here divides by one.

     The offer funnel's one rule: `accepted` is a tap on the card's buy button
     and not a purchase. `sub` is where money is counted, and the gap between the
     two is the store sheet — abandoned, or declined. Naming this "converted"
     would quietly close that gap. */
  var OFFER_COLOR = { A: ENTITY.sales, F: COLOR.gold, '?': COLOR.muted };

  function renderOffers(ix, days) {
    var letters = ['A', 'F'].filter(function (k) { return A.slotOver(ix, 'osh', days, k) > 0; });

    drawChart('pgOffers', {
      x: days.map(labelDay), stacked: true, height: 240, format: fmtInt, xLabel: 'Day',
      series: letters.map(function (k) {
        return {
          key: k, name: A.slotName('osh', k), color: OFFER_COLOR[k], type: 'area',
          values: days.map(function (d) {
            return A.kindKnown(ix, 'osh', d) ? A.slotOn(ix, 'osh', d, k) : 0;
          })
        };
      }),
      emptyText: 'No offers shown in this range.',
      tooltipNote: function (i) {
        return A.kindKnown(ix, 'osh', days[i]) ? '' : 'before the offer counters shipped';
      }
    });

    var host = document.getElementById('pgOfferNote');
    if (!letters.length) {
      host.innerHTML = '<p class="note" style="margin-top:10px">' +
        (ix.firstDay && ix.firstDay.osh
          ? 'No offer was shown in this range. Both are paced — the annual window opens at 30, 90, 180 and ' +
            '365 days since install, and the founding-member card lives for a single day.'
          : 'The offer counters have not been heard from yet.') + '</p>';
      return;
    }

    host.innerHTML = '<div class="mini-rows">' + letters.map(function (k) {
      var f = A.offerFunnel(ix, days, k);
      /* How many of this offer were RAISED, this range against the one before
         it. On the count, never on the accept rate: an offer shown three times
         and taken once is 33%, and a percentage over three events moves in
         thirty-point jumps that mean nothing. */
      var trend = rangeTrendNote(ix, days, function (d) {
        return A.kindKnown(ix, 'osh', d) ? A.slotOn(ix, 'osh', d, k) : null;
      });
      return '<div><span>' + esc(A.slotName('osh', k)) + '</span><b>' + fmtPct(f.acceptPct) + '</b>' +
        '<span class="note">' + fmtInt(f.accepted) + ' accepted of ' + fmtInt(f.shown) + ' shown' +
        trend + ' · ' + fmtInt(f.dismissed) + ' dismissed · ' + fmtInt(f.ignored) + ' ignored</span></div>';
    }).join('') + '</div>' +
      '<p class="hint" style="margin:8px 0 0"><b>Accepted</b> is a tap on the card\'s buy button, not a ' +
      'completed purchase — compare it with the subscribe counter, and the difference is the store sheet. ' +
      'Ignored is the outcome with no gesture attached to it, and usually the largest.</p>';
  }

  /* The remaining per-letter routes on one axis. They are drawn together
     because they are all "somebody did a thing today" and are read for shape
     rather than against each other — and separately from the funnels above,
     which ARE read against each other and would be misleading stacked. */
  var EVENT_LINES = [
    { kind: 'see', slot: 'I', name: 'Opened Insights', color: COLOR.s7 },
    { kind: 'see', slot: 'P', name: 'Opened Progress', color: COLOR.s1 },
    { kind: 'pot', slot: 'T', name: 'Stand test', color: COLOR.s3 },
    { kind: 'pot', slot: 'E', name: 'POTS episode', color: COLOR.s8 },
    { kind: 'not', slot: 'M', name: 'Reminder on', color: COLOR.s4 },
    { kind: 'not', slot: 'C', name: 'Crash warning on', color: COLOR.s2 }
  ];

  function renderEvents(ix, days) {
    var lines = EVENT_LINES.map(function (L) {
      return {
        L: L,
        values: days.map(function (d) {
          return A.kindKnown(ix, L.kind, d) ? A.slotOn(ix, L.kind, d, L.slot) : null;
        }),
        total: A.slotOver(ix, L.kind, days, L.slot)
      };
    });
    /* A line that is flat zero across the whole range is dropped rather than
       drawn: an empty band in a legend reads as "none today" when it means
       "never", and six of them make the two that moved unreadable. */
    var live = lines.filter(function (l) { return l.total > 0; });

    drawChart('pgEvents', {
      x: days.map(labelDay), height: 240, format: fmtInt, xLabel: 'Day',
      series: live.map(function (l) {
        return { key: l.L.kind + l.L.slot, name: l.L.name, color: l.L.color, type: 'line', values: l.values };
      }),
      emptyText: 'No product events in this range.'
    });

    /* Views get a share of actives beside them, because "how many people opened
       Insights" only means something against how many were in the app at all.
       The others are counts: a stand test is an event, not a rate. */
    var last = days[days.length - 1];
    var rows = live.map(function (l) {
      var share = l.L.kind === 'see' ? A.slotShare(ix, 'see', last, l.L.slot) : null;
      return '<div><span>' + esc(l.L.name) + '</span><b>' + fmtInt(l.total) + '</b>' +
        '<span class="note">' +
        (share === null ? 'over ' + days.length + ' day' + (days.length === 1 ? '' : 's')
          : fmtPct(share) + ' of the last day\'s actives') +
        '</span></div>';
    }).join('');

    /* And the error counter, which is not a daily event at all: it fires once
       per install ever, so this is a population and the running total IS the
       number of phones that have had something go wrong. It says nothing about
       WHAT — there is no tag in the ping — and the honest next step is the
       support dump from the user's own device. */
    var err = A.errorInstalls(ix, days);
    var errRow = !err.available ? '' :
      '<div><span>Installs reporting a failure</span><b>' + fmtInt(err.installs) + '</b>' +
      '<span class="note">once per install, ever · no tag, no message</span></div>';

    document.getElementById('pgEventNote').innerHTML =
      (rows || errRow ? '<div class="mini-rows">' + rows + errRow + '</div>' : '') +
      '<p class="hint" style="margin:8px 0 0">These routes are capped per install per day <b>per line</b>, so ' +
      'each number is a headcount for that one thing and the lines must not be added together. The failure ' +
      'row is different again: once per install ever, so it is a running population — and it carries no tag ' +
      'and no message, only a count of phones worth asking for a support dump.</p>';
  }

  /* ------------------------------------------------- 5g. tier and build

     Two fields every route carries, so both of these can be read off any
     counter. `kind` is always named at the call site for that reason: a tier
     split off the wrong counter is the easiest mistake here to make and the
     hardest to notice afterwards.

     `?` is drawn, never dropped and never folded into Free. Every ping sent
     before these fields shipped lands there, and a build that could not say
     what it was is not a free user — an adoption or a Pro share computed
     without that band is a share of the builds that can talk. */
  var TIER_COLOR = { P: ENTITY.sales, T: COLOR.gold, F: COLOR.s1, '?': COLOR.muted };

  function renderTierBuild(ix, days) {
    var perDay = days.map(function (d) { return A.tiersOn(ix, d, 'open'); });
    var split = A.tiersOver(ix, days, 'open');
    var keys = A.TIER_ORDER.filter(function (k) { return split[k]; });

    drawChart('pgTiers', {
      x: days.map(labelDay), stacked: true, height: 260, format: fmtInt, xLabel: 'Day',
      series: keys.map(function (k) {
        return {
          key: k, name: A.tierName(k), color: TIER_COLOR[k], type: 'area',
          values: perDay.map(function (m) { return m[k] || 0; })
        };
      }),
      emptyText: 'No pings in this range.',
      tooltipNote: function (i) {
        var pro = A.proShare(ix, days[i], 'open');
        return pro === null ? 'no ping that day named a tier' : fmtPct(pro) + ' of the day\'s actives were paid';
      }
    });

    /* The comparison the card exists for: the same split read off three
       different counters. Opens is the population, readings is who measures,
       paywalls is who is being asked — and a Pro share on the paywall row is
       not a curiosity, it is the paywall coming up for somebody who has
       already paid. */
    var last = days[days.length - 1];
    var rows = [
      { label: 'Pro share of actives', kind: 'open' },
      { label: 'Pro share of the people measuring', kind: 'hrv' },
      { label: 'Pro share of the people meeting walls', kind: 'pay' }
    ].map(function (r) {
      var t = A.tiersOver(ix, days, r.kind);
      var named = A.TIER_ORDER.reduce(function (a, k) { return k === '?' ? a : a + (t[k] || 0); }, 0);
      var meta = named
        ? fmtInt(t.P || 0) + ' of ' + fmtInt(named) + ' ping' + (named === 1 ? '' : 's') + ' naming a tier'
        : 'no ping in this range named a tier';
      return '<div><span>' + r.label + '</span><b>' +
        (named ? fmtPct(((t.P || 0) / named) * 100) : '—') + '</b>' +
        '<span class="note">' + meta + '</span></div>';
    }).join('');
    document.getElementById('pgTierNote').innerHTML =
      '<div class="mini-rows">' + rows + '</div>' +
      (A.tierKnown(ix, last, 'open') ? '' :
        '<p class="note" style="margin-top:10px">Nothing in this range names a tier yet. The field ships with a ' +
        'build, so every ping before it says <b>not stated</b> — which is not the same as Free.</p>');

    renderBuilds(ix, days);
  }

  /* Newest build first, so the release being watched keeps the same colour as
     long as it is the newest thing out there. `?` is always muted. */
  var BUILD_RING = [COLOR.s3, COLOR.s1, COLOR.s7, COLOR.s4, COLOR.s2, COLOR.s5, COLOR.s8];

  /* Version adoption. Deliberately a share of EVERY ping including the ones
     that could not name a build: a release that has reached a fifth of the
     userbase reads as a fifth, not as "100% of the builds new enough to say". */
  function renderBuilds(ix, days) {
    var versions = A.versionsOver(ix, days, 'open');
    var perDay = days.map(function (d) { return A.buildsOn(ix, d, 'open'); });
    var pooled = A.buildsOver(ix, days, 'open');
    var total = versions.reduce(function (a, v) { return a + pooled[v].total; }, 0);

    drawChart('pgBuilds', {
      x: days.map(labelDay), stacked: true, height: 260, format: fmtInt, xLabel: 'Day',
      series: versions.map(function (v, i) {
        return {
          key: v, name: v === '?' ? 'Not stated' : v,
          color: v === '?' ? COLOR.muted : BUILD_RING[i % BUILD_RING.length], type: 'area',
          values: perDay.map(function (m) { return (m[v] && m[v].total) || 0; })
        };
      }),
      emptyText: 'No pings in this range.'
    });

    /* The same bands as SHARES of each day's own total. Counts alone cannot
       answer "is the release spreading": the stack's height is the day's active
       count, so a new build can be reaching more phones every day and still
       draw a narrower band across a quiet weekend. Shares sum to 100% at every
       day, which makes the climb the only thing moving.

       A day with no ping at all is NULL, not 0 — a gap in the line rather than
       a day on which nobody ran the new build. */
    var dayTotals = perDay.map(function (m) {
      return Object.keys(m).reduce(function (a, v) { return a + (m[v].total || 0); }, 0);
    });
    drawChart('pgBuildShare', {
      x: days.map(labelDay), stacked: true, height: 260, format: fmtPct, xLabel: 'Day',
      series: versions.map(function (v, i) {
        return {
          key: v, name: v === '?' ? 'Not stated' : v,
          color: v === '?' ? COLOR.muted : BUILD_RING[i % BUILD_RING.length], type: 'area',
          values: perDay.map(function (m, j) {
            return dayTotals[j] ? (((m[v] && m[v].total) || 0) / dayTotals[j]) * 100 : null;
          })
        };
      }),
      emptyText: 'No pings in this range.',
      tooltipNote: function (i) {
        return dayTotals[i] ? fmtInt(dayTotals[i]) + ' active' : 'no pings this day';
      }
    });

    /* How long the newest build took to get where it is — the one number the
       share chart is read for, stated rather than eyeballed off the curve.
       Measured from the first day it appeared at all, and it says "so far"
       because a release still climbing has no final figure. */
    var newest = versions.filter(function (v) { return v !== '?'; })[0];
    var firstSeen = null, latestShare = null;
    if (newest) {
      perDay.forEach(function (m, j) {
        if (firstSeen === null && m[newest] && m[newest].total > 0) firstSeen = j;
      });
      for (var j = perDay.length - 1; j >= 0; j -= 1) {
        if (dayTotals[j]) {
          latestShare = (((perDay[j][newest] && perDay[j][newest].total) || 0) / dayTotals[j]) * 100;
          break;
        }
      }
    }
    document.getElementById('pgBuildShareNote').innerHTML = !total || !newest ? '' :
      '<p class="note" style="margin-top:10px"><b>' + esc(newest) + '</b> is on ' +
      (latestShare === null ? '—' : fmtPct(latestShare)) + ' of the latest day with pings' +
      (firstSeen === null ? '' :
        ' · first seen ' + esc(labelFull(days[firstSeen])) + ', ' +
        (days.length - firstSeen) + ' day' + (days.length - firstSeen === 1 ? '' : 's') +
        ' ago so far') +
      '.</p>';

    document.getElementById('pgBuildNote').innerHTML = !total ? '' :
      '<p class="note" style="margin-top:10px">' +
      (newest
        ? '<b>' + esc(newest) + '</b> is on ' + fmtPct((pooled[newest].total / total) * 100) +
          ' of the pings in this range'
        : 'No ping in this range named a build') +
      (pooled['?'] ? ' · ' + fmtPct((pooled['?'].total / total) * 100) +
        ' came from builds too old to say' : '') +
      '.</p>';
  }

  /* `rateMeta`'s twin, plus the one thing a reading rate can be short of that a
     retention rate cannot: cohorts whose day N fell before the counter existed.
     They are neither churned nor too young, and calling them either would be a
     claim about people made out of a deploy date. */
  function measureMeta(m) {
    if (!m.available) {
      if (m.blind) return m.blind + ' cohort' + (m.blind === 1 ? '' : 's') + ' predate the reading counter';
      return m.immature ? m.immature + ' cohort' + (m.immature === 1 ? '' : 's') + ' still too young'
        : 'not enough history yet';
    }
    return fmtInt(m.kept) + ' of ' + fmtInt(m.of) + ' installs' +
      (m.immature ? ' · ' + m.immature + ' too young' : '') +
      (m.blind ? ' · ' + m.blind + ' before the counter' : '') +
      (m.small ? ' · <span class="warn-small">small sample</span>' : '');
  }

  /* ------------------------------------------------------ 6b. platforms

     The split the filter bar can only ever show you one side of.

     Deliberately drawn from the UNFILTERED split (`platformsOn`, which counts
     before the filter is applied), because this chart is what the rest of the
     view is a slice of: filtering it would leave one band and nothing to
     compare it against.

     The third band is the one worth understanding. Builds that shipped before
     the ping carried a platform marker send a bare cohort with no letter, and
     they read back as U. Those are real installs whose STORE we failed to
     record — not installs on some third platform — so they are shown as their
     own band here, counted into BOTH platform views everywhere else, and never
     folded into either store. Excluding them instead is what made a dashboard
     whose history predates the marker read as "no pings at all" the moment a
     platform filter was switched on. */
  function renderPingPlatforms(ix, days) {
    var split = days.map(function (d) { return A.platformsOn(ix, d); });
    var totals = { I: 0, A: 0, U: 0 };
    split.forEach(function (p) {
      totals.I += p.I || 0; totals.A += p.A || 0; totals.U += p.U || 0;
    });

    var series = [
      { key: 'I', name: 'iOS', color: ENTITY.ios, type: 'area', values: split.map(function (p) { return p.I || 0; }) },
      { key: 'A', name: 'Android', color: ENTITY.android, type: 'area', values: split.map(function (p) { return p.A || 0; }) }
    ];
    if (totals.U) {
      series.push({ key: 'U', name: 'No store recorded', color: COLOR.muted, type: 'area',
        values: split.map(function (p) { return p.U || 0; }) });
    }

    drawChart('pgPlatforms', {
      x: days.map(labelDay), stacked: true, height: 260, format: fmtInt, xLabel: 'Day',
      series: series,
      emptyText: 'No pings in this range.'
    });

    var known = totals.I + totals.A;
    var all = known + totals.U;

    /* How much of the picture can be split at all.
    *
    * This is the number that answers "why is there no Android?", and it has to
    * be stated outright rather than left to be inferred from a grey band. The
    * platform letter arrived in a specific release, so an install that has not
    * updated yet keeps sending pings with no store on them — which means a
    * newly-shipped marker reads exactly like an empty Android userbase, and the
    * two are indistinguishable from the chart alone. Coverage climbing over the
    * following weeks is what tells them apart. */
    var coverage = all ? (known / all) * 100 : null;
    var verdict = coverage === null
      ? 'No pings in this range.'
      : coverage >= 99
        ? 'Effectively every ping in this range names its store, so the split above is the whole picture.'
        : '<b>' + fmtPct(coverage) + ' of pings in this range name a store.</b> The rest come from builds ' +
          'that shipped before the platform marker existed, and they will keep arriving until those installs ' +
          'update. Until this figure climbs, a quiet store here means "not measured yet" rather than ' +
          '"nobody is there" — the two look identical from the chart alone, and only coverage tells them apart.';

    document.getElementById('pgPlatformNote').innerHTML =
      '<div class="mini-rows" style="margin-top:12px">' +
      '<div><span>iOS</span><b>' + fmtInt(totals.I) + '</b><span class="note">' +
        (known ? fmtPct((totals.I / known) * 100) + ' of the pings that named a store' : 'nothing named a store yet') + '</span></div>' +
      '<div><span>Android</span><b>' + fmtInt(totals.A) + '</b><span class="note">' +
        (known ? fmtPct((totals.A / known) * 100) + ' of the pings that named a store' : '') + '</span></div>' +
      (totals.U
        ? '<div><span>No store</span><b>' + fmtInt(totals.U) + '</b><span class="note">pre-marker builds' +
          (ix.platform === 'all' ? ' — store unknown' : ' — counted under Combined only, not in either store\'s slice') +
          '</span></div>'
        : '') +
      '<div><span>Coverage</span><b>' + (coverage === null ? '–' : fmtPct(coverage)) +
        '</b><span class="note">of pings can be attributed to a store</span></div>' +
      '</div>' +
      '<p class="hint" style="margin:10px 0 0">' + verdict + '</p>';
  }

  /* --------------------------------------------------------- 7. weekday */

  function renderPingWeekday(ix, days) {
    var plat = pingPlatform();
    var dl = A.byWeekday(days, function (d) { return dayRec('all', d).downloads; });
    var fresh = A.byWeekday(days, function (d) { return A.newOn(ix, d); });
    var ret = A.byWeekday(days, function (d) { return A.returningOn(ix, d); });
    /* The two purchase measures, side by side on purpose. `buys` is the sales
       ledger — what actually happened, as recorded from the store report — and
       `subs` is the app's own subscribe ping, which fires on the launch AFTER
       the subscription starts. They count the same event at different moments,
       so they should track and never match; charting only one of them is how a
       weekday pattern in the LAG gets read as a weekday pattern in buying.
       The ledger is sliced by the same platform filter the ping index is, or
       the two bars would be answering about different populations. */
    var salesDaily = Sales.dailyTotals(salesList());
    var buys = A.byWeekday(days, function (d) {
      var rec = salesDaily[plat === 'all' ? 'all' : plat][d];
      return rec ? rec.sales : 0;
    });
    var subs = A.byWeekday(days, function (d) { return A.purchasesOn(ix, d); });
    /* Readings alongside first runs and returning, because "which day do people
       measure on" is a different question from "which day do they open the app
       on" and the answer moves the morning-reminder time. Days the counter was
       not running contribute nothing rather than a zero, which is what handing
       `byWeekday` a null does — it skips them and divides by the days it saw. */
    var reads = A.byWeekday(days, function (d) {
      return A.hrvKnown(ix, d) ? A.readingsOn(ix, d) : null;
    });

    drawChart('pgWeekday', {
      x: WD.map(function (w) { return { label: w, full: WD_LONG[WD.indexOf(w)] }; }),
      /* Grouped bars, never a line. On a 7-point axis a line degenerates into
         disconnected dots that are trivial to miss, and every quantity here is
         a count of people — the same kind of thing, so the same kind of mark. */
      series: [
        { key: 'dl', name: 'Store downloads', color: PC.downloads, type: 'bar', values: dl.map(function (s) { return s.avg; }) },
        { key: 'fresh', name: 'First runs', color: PC.fresh, type: 'bar', values: fresh.map(function (s) { return s.avg; }) },
        { key: 'ret', name: 'Returning', color: PC.back, type: 'bar', values: ret.map(function (s) { return s.avg; }) },
        { key: 'reads', name: 'Readings', color: PC.reading, type: 'bar', values: reads.map(function (s) { return s.avg; }) },
        { key: 'buys', name: 'Purchases (ledger)', color: PC.subs, type: 'bar', values: buys.map(function (s) { return s.avg; }) },
        { key: 'subs', name: 'Subscribe pings', color: COLOR.s4, type: 'bar', values: subs.map(function (s) { return s.avg; }) }
      ],
      height: 260, format: function (v) { return v === null ? '–' : v.toFixed(1); }, xLabel: 'Weekday',
      tooltipNote: function (i) { return 'average per ' + WD_LONG[i] + ' over ' + dl[i].days + ' of them'; }
    });

    // The harder question: are midweek installs actually better?
    var d7 = A.retentionByInstallWeekday(ix, ix.cohorts, 7);
    var any = d7.some(function (s) { return s.available; });
    document.getElementById('pgWeekdayRetention').innerHTML = !any
      ? '<p class="hint" style="margin:10px 0 0">No cohort has reached D7 yet, so there is nothing to say about whether install weekday predicts retention.</p>'
      : '<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>Install weekday</th><th>Installs</th><th>D7 retention</th><th>Cohorts</th></tr></thead><tbody>' +
        d7.map(function (s) {
          return '<tr><td>' + WD_LONG[s.weekday] + '</td><td>' + fmtInt(s.installs) + '</td>' +
            '<td>' + fmtRate(s) + (s.small ? ' <span class="warn-small">small</span>' : '') + '</td>' +
            '<td>' + s.cohorts + (s.immature ? ' <span class="note">(' + s.immature + ' too young)</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
  }

  /* ---------------------------------------------------------- 8. events */

  /**
   * The events editor, which lives under Edit data.
   *
   * Events are RECORDED here and READ on the Timeline — the same split every
   * other collection on this dashboard has, and the reason the list moved off
   * the Timeline: that view is for reading a metric against the flags under it,
   * and a form to fill in is not a thing you read. The analysis half
   * (`renderEventAnalysis`) stayed behind, because comparing the fortnights
   * either side of an event is a reading question.
   */
  function renderEventList() {
    var list = events().slice().reverse();
    var host = document.getElementById('pgEventList');
    if (!host) return;
    host.innerHTML = list.length
      ? '<div class="event-list">' + list.map(function (ev) {
          var cat = A.EVENT_CATEGORIES[ev.category] || {};
          return '<div class="event-row' + (pingUI.event === ev.id ? ' selected' : '') + '" data-id="' + esc(ev.id) + '">' +
            '<span class="event-dot" style="background:' + A.eventColor(ev) + '"></span>' +
            '<span class="event-date">' + esc(labelFull(ev.date)) + '</span>' +
            '<span class="event-title">' + esc(ev.title) + '</span>' +
            '<span class="event-type">' + esc((cat.label || '') + (ev.type ? ' · ' + ev.type : '')) + '</span>' +
            '<span class="event-amount">' + (ev.amount !== undefined ? fmtMoney(ev.amount) : '') + '</span>' +
            '<button class="btn sm" data-edit="' + esc(ev.id) + '">Edit</button>' +
            '</div>';
        }).join('') + '</div>'
      : '<div class="empty">No events recorded yet. Add a store change, a press mention or anything else that might move the numbers, and it is drawn on every calendar chart in the dashboard.</div>';

    /* A row here opens the editor rather than selecting the event for
       comparison: the comparison is drawn on the Timeline, and a selection made
       on a tab that cannot show it would look like nothing happened. */
    host.querySelectorAll('.event-row').forEach(function (row) {
      row.addEventListener('click', function () { openEventForm(row.dataset.id); });
    });
    host.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openEventForm(btn.dataset.edit);
      });
    });
  }

  function openEventForm(id) {
    var ev = id ? eventById(id) : null;
    // Releases come from the app's own log; this dashboard does not own them.
    if (ev && ev.derived) { toast('Releases come from the app\'s release log and are not edited here.'); return; }
    pingUI.editing = id || 'new';
    var host = revealCard(document.getElementById('pgEventForm'));
    host.classList.remove('hidden');

    var catOptions = Object.keys(A.EVENT_CATEGORIES).map(function (k) {
      return '<option value="' + k + '"' + (ev && ev.category === k ? ' selected' : '') + '>' +
        esc(A.EVENT_CATEGORIES[k].label) + '</option>';
    }).join('');

    host.innerHTML =
      '<div class="event-form">' +
      '<div class="field"><label for="evDate">Date</label><input type="date" id="evDate" value="' + esc(ev ? ev.date : asOf()) + '"></div>' +
      '<div class="field"><label for="evCategory">Category</label><select id="evCategory">' + catOptions + '</select></div>' +
      '<div class="field"><label for="evType">Type</label><select id="evType"></select></div>' +
      '<div class="field grow"><label for="evTitle">Title</label><input type="text" id="evTitle" maxlength="200" placeholder="v1.24 — new paywall copy" value="' + esc(ev ? ev.title : '') + '"></div>' +
      '<div class="field"><label for="evAmount">Spend (optional)</label><input type="number" id="evAmount" step="0.01" min="0" value="' + (ev && ev.amount !== undefined ? ev.amount : '') + '"></div>' +
      '<div class="field grow"><label for="evUrl">Link (optional)</label><input type="text" id="evUrl" placeholder="https://" value="' + esc(ev && ev.url ? ev.url : '') + '"></div>' +
      '<div class="field full"><label for="evNote">Notes</label><textarea id="evNote" rows="2" maxlength="2000">' + esc(ev && ev.note ? ev.note : '') + '</textarea></div>' +
      '<div class="event-form-actions">' +
      '<button class="btn primary" id="evSave">' + (ev ? 'Save event' : 'Add event') + '</button>' +
      '<button class="btn" id="evCancel">Cancel</button>' +
      (ev ? '<span class="spacer"></span><button class="btn danger" id="evDelete">Delete</button>' : '') +
      '</div></div>';

    function fillTypes() {
      var cat = A.EVENT_CATEGORIES[document.getElementById('evCategory').value];
      var sel = document.getElementById('evType');
      sel.innerHTML = (cat ? cat.types : []).map(function (t) {
        return '<option value="' + esc(t) + '"' + (ev && ev.type === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
    }
    fillTypes();
    document.getElementById('evCategory').addEventListener('change', fillTypes);

    document.getElementById('evCancel').addEventListener('click', closeEventForm);
    if (ev) {
      document.getElementById('evDelete').addEventListener('click', function () {
        removeEvent(ev.id);
        closeEventForm();
        /* renderAll, not renderTimelineView: the editor lives on Edit data now,
           and drawing a chart into a hidden view measures it at zero width. */
        renderAll();
      });
    }
    document.getElementById('evSave').addEventListener('click', function () {
      var title = document.getElementById('evTitle').value.trim();
      var date = document.getElementById('evDate').value;
      if (!date) { toast('An event needs a date.'); return; }
      if (!title) { toast('An event needs a title.'); return; }
      var amount = document.getElementById('evAmount').value;
      putEvent({
        id: ev ? ev.id : newEventId(),
        date: date,
        category: document.getElementById('evCategory').value,
        type: document.getElementById('evType').value,
        title: title,
        note: document.getElementById('evNote').value.trim(),
        url: document.getElementById('evUrl').value.trim(),
        amount: amount === '' ? undefined : Number(amount)
      });
      closeEventForm();
      renderAll();
    });
    document.getElementById('evTitle').focus();
  }

  function closeEventForm() {
    pingUI.editing = null;
    var host = document.getElementById('pgEventForm');
    host.classList.add('hidden');
    host.innerHTML = '';
  }

  /* ------------------------------------------------- 9. before / after */

  function renderEventAnalysis(ix) {
    var host = document.getElementById('pgEventAnalysis');
    if (!pingUI.event) { host.innerHTML = ''; return; }
    var ev = eventById(pingUI.event);
    if (!ev) { host.innerHTML = ''; return; }

    /* The purchase and money rows read the LEDGER, sliced to the same platform
       the ping index is, so the table cannot compare an iOS release against
       both stores' money. */
    var ba = A.beforeAfter(ix, db.entries, ev, 14,
      Sales.dailyTotals(salesList())[pingPlatform()]);
    var rows = ba.metrics.map(function (m) {
      if (!m.available) {
        return '<tr><td>' + esc(m.label) + '</td><td class="na">–</td><td class="na">–</td>' +
          '<td class="na" colspan="2">not enough mature data on both sides</td></tr>';
      }
      var fmt = m.kind === 'pct' ? fmtPct
        : m.kind === 'money' ? fmtMoney
        : function (v) { return fmtInt(Math.round(v * 10) / 10); };
      var cls = m.delta > 0 ? 'up' : m.delta < 0 ? 'down' : 'flat';
      var deltaTxt = m.kind === 'pct'
        ? (m.delta > 0 ? '+' : '') + m.delta.toFixed(1) + ' pts'
        : m.kind === 'money'
          ? (m.delta > 0 ? '+' : '') + fmtMoney(m.delta)
          : (m.delta > 0 ? '+' : '') + fmtInt(Math.round(m.delta * 10) / 10);
      return '<tr><td>' + esc(m.label) + '</td>' +
        '<td>' + fmt(m.before) + '</td><td>' + fmt(m.after) + '</td>' +
        '<td class="delta ' + cls + '">' + deltaTxt + '</td>' +
        '<td class="' + cls + '">' + (m.relative === null ? '–' : (m.relative > 0 ? '+' : '') + m.relative.toFixed(0) + '%') + '</td></tr>';
    }).join('');

    host.innerHTML =
      '<div class="event-analysis">' +
      '<div class="ea-head"><b>' + esc(ev.title) + '</b> <span class="note">' + esc(labelFull(ev.date)) +
      ' · 14 days either side</span>' +
      '<span class="spacer"></span><button class="btn sm" id="eaClose">Close</button></div>' +
      (ev.note ? '<p class="hint">' + esc(ev.note) + '</p>' : '') +
      '<div class="table-scroll"><table><thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th><th>Relative</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<p class="hint warn-observational">This is a comparison of two windows, not evidence that the event caused anything. ' +
      'Other things moved in the same fortnight. Retention rows only count cohorts old enough for the milestone on both sides, ' +
      'so a recent event will honestly report D14 as unavailable rather than guess.</p>' +
      '</div>';

    document.getElementById('eaClose').addEventListener('click', function () {
      pingUI.event = null;
      renderTimelineView();
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function wirePingView() {
    function segment(id, key, after) {
      var host = document.getElementById(id);
      if (!host) return;
      host.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          pingUI[key] = b.dataset.v;
          host.querySelectorAll('button').forEach(function (o) {
            o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
          });
          if (after) after();
        });
      });
    }
    segment('pgTlMode', 'tlMode', renderPing);
    segment('pgCurveMode', 'curveMode', renderPing);
    segment('pgHeatGrain', 'heatGrain', function () { pingUI.cohort = null; renderPing(); });
    segment('tlMetric', 'tlMetric', renderTimelineView);
    segment('pgRawKind', 'rawKind', renderPings);

    var rawExport = document.getElementById('pgRawExport');
    if (rawExport) rawExport.addEventListener('click', function () {
      var ix = A.index(pings.report, pingPlatform());
      var rows = rawPingRows(ix.days && ix.days.length ? pingRange(ix) : null);
      if (!rows.length) { toast('Nothing to export yet.'); return; }
      /* The CSV is the WHOLE filtered set, never the capped 500 the table
         draws — the cap is a rendering budget, and an export that silently
         inherited it would be the same lie the table's footnote exists to
         avoid. */
      var out = ['route,arrived,cohort,age_days,platform,sensor,surface,label,tier,key,count'];
      rows.forEach(function (x) {
        out.push([
          x.kind, x.arrived, x.cohort, x.age,
          A.platformName(x.platform),
          x.method ? A.methodName(x.method) : '',
          x.surface ? A.surfaceName(x.surface) : '',
          x.label || '',
          x.tier ? A.tierName(x.tier) : '',
          x.key, x.count
        ].join(','));
      });
      download('autonomic-pings.csv', out.join('\n'), 'text/csv');
    });

    document.getElementById('pgEventAdd').addEventListener('click', function () {
      if (pingUI.editing) closeEventForm(); else openEventForm(null);
    });

    document.getElementById('pgHeatExport').addEventListener('click', function () {
      var ix = A.index(pings.report, pingPlatform());
      if (!ix.cohorts.length) { toast('Nothing to export yet.'); return; }
      var out = ['cohort,installs,' + A.MILESTONES.map(function (n) { return 'D' + n; }).join(',')];
      var rows = pingUI.heatGrain === 'week'
        ? A.weeklyCohorts(ix, ix.cohorts).map(function (w) { return { key: w.key, size: w.size, cells: A.weekMilestones(ix, w, A.MILESTONES) }; })
        : ix.cohorts.map(function (c) { return { key: c, size: A.cohortSize(ix, c), cells: A.milestoneRow(ix, c, A.MILESTONES) }; });
      rows.forEach(function (row) {
        out.push([row.key, row.size].concat(row.cells.map(function (c) {
          // an immature cell exports as empty, never as 0 — the distinction has
          // to survive leaving the dashboard
          return c.available ? c.pct.toFixed(1) : '';
        })).join(','));
      });
      download('autonomic-cohort-retention.csv', out.join('\n'), 'text/csv');
    });
  }
  /* ----------------------------------------------------- view: timeline */

  /* What we changed, against what happened.
   *
   * Events are recorded here and annotated everywhere; releases are read from
   * the app's own log rather than entered. The metric on the chart is one at a
   * time on purpose — the point is to read a single line against the flags
   * underneath it, not to build a comparison surface. */

  var TL_METRICS = {
    active: { label: 'Daily active', color: PC.active, type: 'bar', fmt: fmtInt,
              of: function (ix, d) { return A.activeOn(ix, d); } },
    returning: { label: 'Returning', color: PC.back, type: 'bar', fmt: fmtInt,
                 of: function (ix, d) { return A.returningOn(ix, d); } },
    fresh: { label: 'First runs', color: PC.fresh, type: 'bar', fmt: fmtInt,
             of: function (ix, d) { return A.newOn(ix, d); } },
    downloads: { label: 'Store downloads', color: PC.downloads, type: 'bar', fmt: fmtInt, store: true,
                 of: function (ix, d) { return dayRec('all', d).downloads; } },
    pageViews: { label: 'Product page views', color: PC.pageViews, type: 'bar', fmt: fmtInt, store: true,
                 of: function (ix, d) { return dayRec('all', d).pageViews; } },
    /* Store sales, not subscribe pings. The ping fires when the app next
       notices an entitlement, which can be a launch or two after the purchase;
       the store's number is the transaction itself, and it is the one to read
       against an ad spot or a release. The ping-derived view lives on App usage,
       where it is being used for a different question (purchase age by cohort). */
    purchases: { label: 'Purchases', color: PC.subs, type: 'bar', fmt: fmtInt, store: true,
                 of: function (ix, d) { return dayRec('all', d).sales; } },
    revenue: { label: 'Revenue', color: ENTITY.revenue, type: 'bar', fmt: fmtMoney, store: true,
               of: function (ix, d) { return dayRec('all', d).revenue; } },
    /* Not a store metric: spend is entered by hand on the Costs tab, so it is
       complete for today in a way downloads never are. */
    spend: { label: 'Spend', color: CS.CATEGORIES.ADS.color, type: 'bar', fmt: fmtMoney,
             of: function (ix, d) { return spendOnDay(d); } }
  };

  /* One expansion of every recurring cost per render, cached on the day set the
     chart asked for — recomputing it inside `of()` would re-expand the whole
     cost list 400 times for one chart. */
  var spendDayCache = { key: '', byDay: {} };
  function primeSpendDays(from, to) {
    var key = from + '|' + to + '|' + revision;
    if (spendDayCache.key === key) return;
    spendDayCache = { key: key, byDay: CS.daily(spendList(), from, to).byDay };
  }
  function spendOnDay(d) { return spendDayCache.byDay[d] || 0; }

  function renderTimelineView() {
    var ix = A.index(pings.report, pingPlatform());
    var m = TL_METRICS[pingUI.tlMetric] || TL_METRICS.active;

    /* The counter and the store cover different spans, so the axis is the union
       of the selected range and whatever data exists, clamped to the store's
       start when the metric is a store one. */
    var sel = activeRange();
    var to = sel.to;
    if (ix.last && ix.last > to) to = ix.last;
    var from = sel.from;
    if (state.range !== 'custom' && state.range !== 'all') {
      from = addDays(to, -((parseInt(state.range, 10) || 30) - 1));
    }
    var days = A.range(from, to);
    primeSpendDays(from, to);
    var marks = marksFor(days);

    drawChart('tlChart', {
      x: days.map(function (d) { return bucketLabel(d, 'day'); }),
      series: [{ key: 'v', name: m.label, color: m.color, type: m.type,
                 values: days.map(function (d) { return m.of(ix, d); }) }],
      height: 340, format: m.fmt, legend: false, xLabel: 'Day',
      marks: marks, onMarkClick: markClickFor(),
      emptyText: 'Nothing recorded in this range yet.',
      tooltipNote: function (i) {
        var d = days[i];
        // Store reporting lands a day late, so the newest columns of a
        // store-sourced metric are incomplete rather than a collapse.
        if (m.store && d > asOf()) return 'store reporting has not landed for this day yet';
        var here = A.eventsBetween(timelineItems(), d, d);
        return here.length ? here.map(function (e) { return e.title; }).join(' · ') : '';
      }
    });

    renderEventAnalysis(ix);
    renderStoreVersions();
    renderReleases();
  }

  /* ------------------------------------------------- what is live in the stores

     Read by the Lambda, not by this page: Apple's lookup endpoint sends no CORS
     headers and Google's listing is an HTML page. `sls/lambdas/api/storeVersions.js`
     holds both, and the whole of the reasoning about how far each can be
     trusted.

     The rule that shapes everything below: **an unreadable version is reported
     as unreadable.** The Android side is a scrape of a page Google never
     promised us, so it will break; the failure mode has to be a sentence
     saying so, never a number left over from the last time it worked. That is
     the one thing this card exists to get right — it is read to answer "did
     the release I cut actually go live", and a stale number answers that
     question incorrectly and with total confidence. */

  var STORE_KEY = KEY + '.stores';
  var stores = { status: 'idle', data: null, error: '' };

  function loadStoreCache() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p && (p.ios || p.android)) { stores.data = p; stores.status = 'ready'; }
    } catch (e) { /* unreadable cache is no cache */ }
  }

  function storeLoad(force) {
    if (stores.status === 'loading') return Promise.resolve();
    /* Once per session unless forced. The cached copy from localStorage does
       NOT count as fetched, so arriving on the Timeline always goes and looks —
       cheaply, since the Lambda answers from its own cache. */
    if (stores.fetched && !force) return Promise.resolve();
    stores.status = 'loading';
    /* `force` is only ever passed by the button on the card. The five-minute
       auto-refresh does not: the Lambda caches for half an hour, and a store
       that publishes a new build a few times a month does not need asking
       every five minutes from every open device. */
    return window.Api.call('STORE_VERSIONS', force ? { force: true } : {}).then(function (res) {
      stores.data = res || null;
      stores.status = 'ready';
      stores.fetched = true;
      stores.error = '';
      try { localStorage.setItem(STORE_KEY, JSON.stringify(res)); } catch (e) { /* ignore */ }
      if (state.view === 'timeline') renderStoreVersions();
    }).catch(function (err) {
      stores.status = 'error';
      stores.error = (err && err.message) || 'Could not reach the stores.';
      if (state.view === 'timeline') renderStoreVersions();
    });
  }

  /** The newest version the app's own release log knows about. */
  function newestRelease() {
    var list = (window.RELEASES || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    return list[list.length - 1] || null;
  }

  /* Version strings compared as numbers, segment by segment, so 1.24.1 is
     newer than 1.9 — which a string comparison gets backwards, and which is
     exactly the pair this app is at. */
  function cmpVersion(a, b) {
    var pa = String(a || '').split('.').map(Number);
    var pb = String(b || '').split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  /* The release log carries `1.24` where a build carries `1.24.1`, so the
     comparison is "is the store at or past the newest logged version" rather
     than string equality. */
  var STORE_ERRORS = {
    'not-listed': 'Not listed in this store yet.',
    ambiguous: 'The listing page no longer says which value is the version.',
    'not-found': 'Google has changed the listing page — no version could be read from it.',
    unreachable: 'Could not reach the store.',
    unreadable: 'The store answered with something unreadable.',
    http: 'The store refused the request.'
  };

  function storeRowHTML(o) {
    var newest = newestRelease();
    var body;

    if (!o.info) {
      body = '<span class="store-miss">Not checked yet.</span>';
    } else if (o.info.error) {
      body = '<span class="store-miss">' + esc(STORE_ERRORS[o.info.error] || 'Could not read a version.') +
        (o.info.detail ? ' <span class="store-why">' + esc(o.info.detail) + '</span>' : '') + '</span>';
    } else {
      var v = o.info.version;
      var cmp = newest ? cmpVersion(v, newest.version) : 0;
      /* Three states worth telling apart, and the middle one is the reason to
         look: a version BEHIND the log is a release that has not gone live
         (or a rollout still in progress), which is not visible anywhere else
         on this dashboard. */
      var against = !newest ? ''
        : cmp >= 0 ? '<span class="store-ok">current</span>'
        : '<span class="store-behind">v' + esc(newest.version) + ' shipped ' + esc(labelDay(newest.date)) +
          ' and is not live here yet</span>';
      body = '<span class="store-version">v' + esc(v) + '</span>' +
        (o.info.released ? '<span class="store-when">' + esc(labelFull(o.info.released)) + '</span>' : '') +
        against;
    }

    return '<div class="store-row">' +
      '<span class="store-name">' + esc(o.name) + '</span>' +
      body +
      /* The destination is carried as data and applied to `.href` after the
         markup lands, rather than being concatenated into an href attribute.
         Two reasons, and the second is the load-bearing one: the URL comes
         from an external API, so it is checked for an https scheme before it
         becomes a link; and the built page is scanned for RELATIVE src/href
         attributes (tests/master-gate.test.mjs), a rule that exists because a
         relative URL here breaks /master when it is reached without a trailing
         slash — and an href attribute opened in source and closed by a
         concatenation is indistinguishable from a relative one to that
         scanner, which reads the shipped text rather than the rendered DOM. */
      (o.info && o.info.url ? '<a class="store-link" data-url="' + esc(o.info.url) + '" target="_blank" rel="noopener">Open</a>' : '') +
      '</div>';
  }

  function renderStoreVersions() {
    var host = document.getElementById('tlStores');
    if (!host) return;

    var age = document.getElementById('tlStoreAge');
    if (age) {
      age.textContent = !stores.data || !stores.data.at ? ''
        : 'checked ' + relTime(stores.data.at);
    }

    if (!stores.data && stores.status === 'loading') {
      host.innerHTML = '<div class="skel-bar title" style="width:60%"></div>';
      return;
    }
    if (!stores.data && stores.status === 'error') {
      host.innerHTML = '<div class="empty">' + esc(stores.error) + '</div>';
      return;
    }

    var d = stores.data || {};
    host.innerHTML =
      storeRowHTML({ name: 'App Store', info: d.ios }) +
      storeRowHTML({ name: 'Google Play', info: d.android }) +
      /* Said once, under the rows, rather than repeated in the Android row on
         every render: the asymmetry is a property of the two stores, not of
         today's answer. */
      '<p class="note" style="margin:10px 0 0">Apple\'s figure comes from its public lookup API. Google publishes none, so the Play row is read off the listing page — ' +
      '<a href="https://play.google.com/console" target="_blank" rel="noopener">Play Console</a> is the authority when the two disagree.</p>';

    host.querySelectorAll('.store-link[data-url]').forEach(function (a) {
      var url = a.dataset.url || '';
      // Only an absolute https link, because this came off a store's API.
      if (/^https:\/\//.test(url)) a.href = url;
      else a.remove();
    });
  }

  /** "4 minutes ago" — only ever used for how old a store check is. */
  function relTime(ms) {
    var s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000));
    if (s < 90) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' minute' + (m === 1 ? '' : 's') + ' ago';
    var h = Math.round(m / 60);
    if (h < 36) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
    return Math.round(h / 24) + ' days ago';
  }

  function renderReleases() {
    var list = releaseEvents().slice().reverse();
    var host = document.getElementById('tlReleases');
    if (!host) return;
    host.innerHTML = list.length
      ? '<div class="event-list">' + list.map(function (r) {
          return '<div class="event-row' + (pingUI.event === r.id ? ' selected' : '') + '" data-id="' + esc(r.id) + '">' +
            '<span class="event-dot" style="background:' + A.eventColor(r) + '"></span>' +
            '<span class="event-date">' + esc(labelFull(r.date)) + '</span>' +
            '<span class="event-title">' + esc(r.title) + '</span>' +
            '<span class="event-type">' + esc((r.note || '').slice(0, 110)) + '</span>' +
            '</div>';
        }).join('') + '</div>'
      : '<div class="empty">No releases found. Run <code>npm run releases</code> in landing/ to read them from the app\'s release log.</div>';

    host.querySelectorAll('.event-row').forEach(function (row) {
      row.addEventListener('click', function () {
        pingUI.event = pingUI.event === row.dataset.id ? null : row.dataset.id;
        renderTimelineView();
      });
    });
  }

  /* ---------------------------------------------------- view: platforms */

  function renderPlatforms() {
    var r = activeRange();
    var ios = summarize('ios', r.from, r.to), and = summarize('android', r.from, r.to);
    var metrics = [
      ['First-time downloads (range)', 'downloads', fmtInt],
      ['Impressions (range)', 'impressions', fmtInt],
      ['Product page views (range)', 'pageViews', fmtInt],
      ['Updates (range)', 'updates', fmtInt],
      ['Store conversion', 'storeConv', fmtPct],
      ['Page-view conversion', 'ppvConv', fmtPct],
      ['Installs (all time)', 'totalInstalls', fmtInt],
      ['Out of trial (all time)', 'outOfTrial', fmtInt],
      ['Paid conversions (all time)', 'totalSales', fmtInt],
      ['Convert rate — past trial', 'convOfOutOfTrial', fmtPct],
      ['Revenue (range)', 'revenue', fmtMoney],
      ['Revenue (all time)', 'totalRevenue', fmtMoney],
      ['Revenue per paying user', 'arppu', fmtMoney],
      ['Revenue per install', 'rpi', fmtMoney]
    ];
    var html = '<table><thead><tr><th>Metric</th>' +
      '<th><span class="swatch" style="background:' + ENTITY.ios + '"></span> iOS</th>' +
      '<th><span class="swatch" style="background:' + ENTITY.android + '"></span> Android</th>' +
      '<th>Combined</th><th>iOS share</th></tr></thead><tbody>';
    metrics.forEach(function (m) {
      var a = ios[m[1]], b = and[m[1]], f = m[2];
      var isRate = f === fmtPct || f === fmtMoney && /per /.test(m[0]);
      var comb = isRate ? null : num(a) + num(b);
      var share = (!isRate && (num(a) + num(b))) ? pctOf(num(a), num(a) + num(b)) : '–';
      html += '<tr><td>' + esc(m[0]) + '</td><td>' + f(a) + '</td><td>' + f(b) + '</td><td>' +
        (comb === null ? '–' : f(comb)) + '</td><td>' + share + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('pfTable').innerHTML = html;

    var iosRows = buildBuckets('ios', r.from, r.to);
    var andRows = buildBuckets('android', r.from, r.to);
    var x = xAxis(iosRows);
    var specs = [
      { id: 'pfDownloads', title: 'First-time downloads', field: 'downloads', fmt: fmtInt, type: 'line' },
      { id: 'pfWall', title: 'Users finishing the ' + trialDays() + '-day trial', field: 'trialEnd', fmt: fmtInt, type: 'line' },
      { id: 'pfSales', title: 'Paid conversions', field: 'sales', fmt: fmtInt, type: 'bar' },
      { id: 'pfConv', title: 'Cumulative convert rate past the trial', field: 'paidOfTrial', fmt: fmtPct, type: 'line' },
      { id: 'pfRevenue', title: 'Revenue', field: 'revenue', fmt: fmtMoney, type: 'line' },
      { id: 'pfImpr', title: 'Impressions', field: 'impressions', fmt: fmtInt, type: 'line' }
    ];
    var host = document.getElementById('pfCharts');
    host.innerHTML = specs.map(function (sp) {
      return '<div class="card"><header><h2>' + esc(sp.title) + '</h2><span class="spacer"></span>' +
        '<button class="btn sm" data-table-toggle="' + sp.id + '">Table</button></header>' +
        '<div id="' + sp.id + '"></div><div id="' + sp.id + '-table" class="hidden" style="margin-top:12px"></div></div>';
    }).join('');
    specs.forEach(function (sp) {
      var series = [
        mk(iosRows, 'ios', sp.field, 'iOS', ENTITY.ios, sp.type),
        mk(andRows, 'android', sp.field, 'Android', ENTITY.android, sp.type)
      ];
      series.forEach(function (s) { s.format = sp.fmt; });
      drawChart(sp.id, {
        x: x, series: series, height: 240, format: sp.fmt,
        yTickFormat: sp.fmt === fmtPct ? function (v) { return v.toFixed(v < 10 ? 1 : 0) + '%'; } : undefined
      });
    });
  }

  /* ======================================================== sales ledger

     The purchase ledger and the Sales view over it.

     Every number here is arithmetic from sales.js, which is pure and tested;
     this half is entry and rendering. Three things are worth knowing before
     reading on.

     ONE. This view answers a question the rest of the dashboard cannot. Sales
     used to be two columns on a store entry — a count and an amount, summed per
     day — and both of the facts that matter about a subscription are invisible
     in that shape: the PLAN, because an annual sale at 29.99 and a monthly one
     at 4.99 are wildly different recurring revenue, and the BUYER'S INSTALL
     DATE, because "how long after installing did they pay?" is a property of a
     person and a daily total has averaged the people away.

     TWO. Cash and MRR are shown side by side and never blended. `Bookings` is
     money that arrived. `MRR` is the rate the book runs at. A month with one
     annual sale is a record on one and an ordinary month on the other, and both
     readings are true — a single "revenue" number that silently picked one is
     the thing this view exists to stop.

     THREE. What the ledger does not know, it says. Rows migrated from the old
     daily columns carry `plan: 'unknown'`: real money of an unknown term, so
     they sit in bookings and out of MRR, and every tile that is affected
     discloses it rather than quietly shrinking. Same for the days-to-purchase
     histogram, which is drawn only from purchases carrying an install date and
     reports what share of purchases that is. */

  function salesList() { return db.sales || (db.sales = []); }
  function saleById(id) {
    var l = salesList();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function putSale(rec) {
    var l = salesList(), ex = saleById(rec.id);
    if (ex) Object.assign(ex, rec); else l.push(rec);
    sortSales();
    save(); invalidate();
  }
  function removeSale(id) {
    db.sales = salesList().filter(function (s) { return s.id !== id; });
    save(); invalidate();
  }
  /* Newest first, which is the order the management table reads in and the
     order every other id-keyed collection here is kept in. sales.js re-sorts
     ascending for its own series, so this is presentation only. */
  function sortSales() {
    salesList().sort(function (a, b) {
      return a.date === b.date ? String(b.id).localeCompare(String(a.id)) : (a.date < b.date ? 1 : -1);
    });
  }

  /* The ledger, sliced by the filter bar. `compare` has no single answer, so it
     reads as combined and the plan/platform tables carry the split instead. */
  function salesPlatform() {
    return (state.platform === 'ios' || state.platform === 'android') ? state.platform : 'all';
  }
  function salesIndex() { return Sales.index(salesList(), salesPlatform()); }

  /**
   * The one-shot migration out of the old daily columns.
   *
   * Guarded by `settings.salesMigrated`, and it must stay guarded: running it
   * twice would double every historical sale, and the entries it reads from are
   * rewritten in the same pass so a second run would find nothing to migrate
   * only by luck. It runs after load AND after a hydrate, because the server's
   * copy is what a second browser sees first and it may still be carrying the
   * old shape.
   *
   * Nothing is invented. Each (date, platform) with a count or an amount
   * becomes one row of `plan: 'unknown'` holding the count as `qty` and the
   * average price — which is the whole of what the old shape knew. The plan and
   * the buyer's install date were never recorded, so they are absent rather
   * than guessed, and the view says how much of its history that leaves
   * unclassified.
   */
  function migrateSales() {
    if (db.settings.salesMigrated) return 0;
    var rows = Sales.migrateEntries(db.entries, function (date, platform) {
      return 'sale-legacy-' + date + '-' + (platform || 'ios');
    });
    /* An id already in the ledger means a previous attempt got as far as
       writing rows but not as far as stamping the flag. Skip those rather than
       adding a second copy. */
    var have = {};
    salesList().forEach(function (s) { have[s.id] = true; });
    rows = rows.filter(function (r) { return !have[r.id]; });
    rows.forEach(function (r) { salesList().push(r); });

    db.entries.forEach(function (e) {
      if (!e) return;
      delete e.sales;
      delete e.revenue;
    });
    db.settings.salesMigrated = true;
    sortSales();
    save(); invalidate();
    return rows.length;
  }

  /* ---------------------------------------------------------- view: sales */

  /* Plan colours come from sales.js so the legend, the mix table and the stacked
     areas cannot disagree about which green is annual. */
  function planColor(k) { return (Sales.PLANS[k] || {}).color || COLOR.muted; }
  function planLabel(k) { return (Sales.PLANS[k] || {}).label || k; }

  function renderSales() {
    var ix = salesIndex();
    var r = activeRange();
    var prevTo = addDays(r.from, -1);
    var prevFrom = addDays(prevTo, -diffDays(r.from, r.to));
    /* The same rule the Overview sets, restated here because the flag is shared
       and defaults to true: a delta against a window that predates the first
       purchase is not a comparison, it is division by whatever happened to be
       there. Landing straight on this tab without visiting the Overview first
       would otherwise show one. */
    deltaOK = ix.first !== null && prevFrom >= ix.first;
    var s = Sales.summarize(ix, r.from, r.to);
    var prev = Sales.summarize(ix, prevFrom, prevTo);

    document.getElementById('slScope').textContent =
      labelFull(r.from) + ' → ' + labelFull(r.to) +
      (ix.platform === 'all' ? '' : ' · ' + PLATFORMS[ix.platform]);

    renderSalesTiles(ix, s, prev, r);
    renderMrrChart(ix, r);
    renderNewSubs(ix, r);
    renderBookingsChart(ix, r);
    renderPurchaseAges(ix, r);
    renderInstallCohorts(ix);
    renderPlanMix(s);
  }

  function renderSalesTiles(ix, s, prev, r) {
    var unknownNote = s.activeByPlan.unknown.count
      ? ' · ' + fmtInt(s.activeByPlan.unknown.count) + ' unclassified sales carry no term and are not in it'
      : '';
    var churnNote = s.churnedMrr
      ? fmtMoney(s.churnedMrr) + ' cancelled in range'
      : 'nothing marked cancelled — MRR assumes every subscription still runs';

    document.getElementById('slTiles').innerHTML = [
      tile({
        label: 'MRR on ' + labelDay(r.to), color: ENTITY.revenue, value: fmtMoney(s.mrr),
        meta: churnNote + unknownNote,
        split: [
          { name: 'Monthly', color: planColor('monthly'), value: fmtMoney(s.activeByPlan.monthly.mrr) },
          { name: 'Annual', color: planColor('annual'), value: fmtMoney(s.activeByPlan.annual.mrr) }
        ]
      }),
      tile({
        /* Full size, matching MRR. `smallValue` marks a SECONDARY figure — a
           rate, a per-unit derivation, texture rather than headline — and ARR
           is neither: it is MRR annualised, the same quantity on a different
           clock. Rendering it one step smaller than the number it is twelve
           times made it read as the lesser of the two, which is the opposite of
           true and the first thing anyone noticed about this strip. The rule
           for the rest of the tiles below: the five that say how big the book
           is are full size, the three that describe its texture are small. */
        label: 'ARR', color: ENTITY.revenue, value: fmtMoney(s.arr),
        meta: 'MRR × 12, at the rate the book runs at today'
      }),
      tile({
        label: 'Bookings in range', color: ENTITY.sales, value: fmtMoney(s.bookings),
        delta: pctDelta(s.bookings, prev.bookings),
        meta: 'cash that arrived · ' + fmtMoney(s.bookings * (1 - storeCut() / 100)) + ' after the ' + storeCut() + '% store cut'
      }),
      tile({
        label: 'New MRR in range', color: planColor('monthly'), value: fmtMoney(s.newMrr),
        delta: pctDelta(s.newMrr, prev.newMrr),
        meta: s.annualMrrShare === null ? 'nothing recurring sold in range'
          : fmtPct(s.annualMrrShare) + ' of it from annual plans'
      }),
      tile({
        label: 'Active subscriptions', color: ENTITY.trialEnd, value: fmtInt(s.active),
        meta: 'recurring plans live on ' + labelDay(r.to) + ' · ' + fmtInt(s.units) + ' sold in range' +
          (s.activeOther ? ' · ' + fmtInt(s.activeOther) + ' lifetime or unclassified purchases are not subscriptions and sit outside this' : ''),
        split: Sales.PLAN_KEYS.filter(function (k) { return s.activeByPlan[k].count; }).map(function (k) {
          return { name: planLabel(k), color: planColor(k), value: fmtInt(s.activeByPlan[k].count) };
        })
      }),
      tile({
        label: 'Average price', value: s.arpu === null ? '–' : fmtMoney(s.arpu), smallValue: true,
        meta: 'per purchase in range, across every plan'
      }),
      tile({
        label: 'Annual share', color: planColor('annual'),
        value: s.annualUnitShare === null ? '–' : fmtPct(s.annualUnitShare), smallValue: true,
        meta: 'of the recurring plans sold in range, by count'
      }),
      tile({
        label: 'Refunds in range', color: ENTITY.wallHit,
        value: s.refundedCount ? fmtMoney(s.refunds) : '–', smallValue: true,
        meta: s.refundedCount ? fmtInt(s.refundedCount) + ' refunded, removed from every figure here'
          : 'nothing marked refunded'
      })
    ].join('');
  }

  /* MRR over time, stacked by plan. Stacked rather than grouped because the
     parts genuinely sum to the whole — that is what MRR is — and the reader's
     question is how much of the total is the annual base. */
  function renderMrrChart(ix, r) {
    var rows = Sales.mrrSeries(ix, r.from, r.to);
    drawChart('slMrr', {
      x: rows.map(function (m) { return labelDay(m.date); }),
      stacked: true, height: 300, format: fmtMoney, xLabel: 'Day',
      yTickFormat: moneyTick,
      series: [
        { key: 'monthly', name: 'Monthly plans', color: planColor('monthly'), type: 'area',
          values: rows.map(function (m) { return m.monthly; }) },
        { key: 'annual', name: 'Annual plans', color: planColor('annual'), type: 'area',
          values: rows.map(function (m) { return m.annual; }) }
      ],
      emptyText: 'No subscriptions on the books in this range yet.'
    });
  }

  /* New purchases per bucket, GROUPED by plan rather than stacked: the question
     here is which plan people are choosing, which is a comparison between the
     bars and not a total. */
  function renderNewSubs(ix, r) {
    var grain = state.grain === 'day' ? 'day' : state.grain;
    var buckets = bareBuckets(r.from, r.to, grain);
    var counts = buckets.map(function (b) {
      var acc = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
      ix.rows.forEach(function (row) {
        if (row.date >= b.start && row.date <= b.end && !row.refunded) acc[row.plan] += row.qty;
      });
      return acc;
    });
    var live = Sales.PLAN_KEYS.filter(function (k) {
      return counts.some(function (c) { return c[k] > 0; });
    });
    drawChart('slNew', {
      x: xAxis(buckets, grain), height: 260, format: fmtInt, xLabel: 'Purchases',
      series: (live.length ? live : ['monthly', 'annual']).map(function (k) {
        return { key: k, name: planLabel(k), color: planColor(k), type: 'bar',
          values: counts.map(function (c) { return c[k]; }) };
      }),
      emptyText: 'No purchases in this range.'
    });
  }

  /**
   * Bookings against recognised revenue, per month.
   *
   * The gap between the two lines IS the annual book: cash lands the day the
   * plan is bought and the revenue it represents belongs to the twelve months
   * after. Reading either one alone is how an annual-heavy month gets called a
   * record or a collapse depending on which number happened to be on screen.
   */
  function renderBookingsChart(ix, r) {
    var rows = Sales.monthlyRevenue(ix, r.from, r.to);
    drawChart('slBookings', {
      x: rows.map(function (m) { return bucketLabel(m.key, 'month'); }),
      height: 280, format: fmtMoney, xLabel: 'Month', yTickFormat: moneyTick,
      series: [
        { key: 'bookings', name: 'Bookings (cash in)', color: ENTITY.sales, type: 'bar',
          values: rows.map(function (m) { return m.bookings; }) },
        { key: 'recognised', name: 'Recognised revenue', color: ENTITY.downloads, type: 'line',
          values: rows.map(function (m) { return m.recognised; }) }
      ],
      emptyText: 'No purchases in this range.'
    });
  }

  /**
   * Days from install to purchase.
   *
   * Drawn only from purchases that carry an install date — see rule FOUR in
   * sales.js — so the hint under it says what share of purchases that is. A
   * histogram over a third of the sales is a real answer about a third of the
   * sales, and the one thing it must not do is look like an answer about all of
   * them.
   */
  function renderPurchaseAges(ix, r) {
    var ages = Sales.purchaseAges(ix, r.from, r.to);
    var live = Sales.PLAN_KEYS.filter(function (k) {
      return ages.buckets.some(function (b) { return b[k] > 0; });
    });
    drawChart('slAges', {
      x: ages.buckets.map(function (b) { return { label: b.label, full: b.label + ' after installing' }; }),
      stacked: true, height: 260, format: fmtInt, xLabel: 'Days from install to purchase',
      series: (live.length ? live : ['monthly', 'annual']).map(function (k) {
        return { key: k, name: planLabel(k), color: planColor(k), type: 'bar',
          values: ages.buckets.map(function (b) { return b[k]; }) };
      }),
      emptyText: 'No purchase yet carries the buyer’s install date.',
      guides: [{ index: 3, label: 'wall', color: COLOR.red }],
      tooltipNote: function (i) {
        var b = ages.buckets[i];
        return ages.total ? pctOf(b.count, ages.total) + ' of the purchases this is drawn from' : '';
      }
    });

    var byPlan = Sales.ageByPlan(ix, r.from, r.to).filter(function (p) { return p.n; });
    document.getElementById('slAgeMeta').innerHTML = !ages.total
      ? '<p class="hint" style="margin:10px 0 0">Add the buyer’s install date to a purchase and it appears here. Nothing else in the dashboard can supply it — a ping carries a cohort but no identity, so it can never be matched to a sale.</p>'
      : '<div class="mini-rows">' +
        '<div><span>Median</span><b>' + ages.median + ' days</b><span class="note">the typical buyer’s decision</span></div>' +
        byPlan.map(function (p) {
          return '<div><span>' + esc(p.label) + '</span><b>' + p.median + ' days</b>' +
            '<span class="note">from ' + fmtInt(p.n) + ' purchase' + (p.n === 1 ? '' : 's') + '</span></div>';
        }).join('') +
        '<div><span>Coverage</span><b>' + fmtPct(ages.coverage) + '</b><span class="note">' +
          fmtInt(ages.total) + ' of ' + fmtInt(ages.total + ages.withoutCohort) +
          ' purchases carry an install date</span></div>' +
        '</div>';
  }

  /**
   * Which intake actually paid — purchases grouped by the buyer's INSTALL
   * month, not the month the money landed.
   *
   * A young cohort has not finished buying, so its row is not comparable to a
   * mature one and the table says how old each is rather than leaving the
   * reader to work out that last month's zero is not a failure yet.
   */
  function renderInstallCohorts(ix) {
    var rows = Sales.byInstallMonth(ix, asOf());
    var host = document.getElementById('slCohorts');
    if (!rows.length) {
      host.innerHTML = '<div class="empty">No purchase yet carries the buyer’s install date, so there is nothing to group by intake.</div>';
      drawChart('slCohortChart', { x: [], series: [], emptyText: 'Waiting for a purchase with an install date.' });
      return;
    }
    drawChart('slCohortChart', {
      x: rows.map(function (m) { return bucketLabel(m.key, 'month'); }),
      stacked: true, height: 240, format: fmtInt, xLabel: 'Install month',
      series: ['monthly', 'annual', 'lifetime', 'unknown'].filter(function (k) {
        return rows.some(function (m) { return m[k] > 0; });
      }).map(function (k) {
        return { key: k, name: planLabel(k), color: planColor(k), type: 'bar',
          values: rows.map(function (m) { return m[k]; }) };
      })
    });
    host.innerHTML = '<div class="table-scroll"><table><thead><tr>' +
      '<th>Install month</th><th>Purchases</th><th>Bookings</th><th>MRR</th><th>Maturity</th>' +
      '</tr></thead><tbody>' +
      rows.slice().reverse().map(function (m) {
        var young = m.maturityDays !== null && m.maturityDays < 60;
        return '<tr><td>' + bucketLabel(m.key, 'month').full + '</td>' +
          '<td>' + fmtInt(m.count) + '</td>' +
          '<td>' + fmtMoney(m.bookings) + '</td>' +
          '<td>' + fmtMoney(m.mrr) + '</td>' +
          '<td>' + (m.maturityDays === null ? '–' : fmtInt(m.maturityDays) + ' days' +
            (young ? ' <span class="warn-small">still buying</span>' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderPlanMix(s) {
    var total = s.bookings || 0;
    document.getElementById('slMix').innerHTML =
      '<div class="table-scroll"><table><thead><tr>' +
      '<th>Plan</th><th>Purchases</th><th>Bookings</th><th>Share of bookings</th><th>New MRR</th><th>Live now</th>' +
      '</tr></thead><tbody>' +
      Sales.PLAN_KEYS.filter(function (k) { return s.byPlan[k].units || s.activeByPlan[k].count; })
        .map(function (k) {
          var p = s.byPlan[k];
          return '<tr><td><span class="swatch" style="background:' + planColor(k) + '"></span> ' + esc(planLabel(k)) + '</td>' +
            '<td>' + fmtInt(p.units) + '</td>' +
            '<td>' + fmtMoney(p.bookings) + '</td>' +
            '<td>' + (total ? fmtPct((p.bookings / total) * 100) : '–') + '</td>' +
            '<td>' + (Sales.isRecurring(k) ? fmtMoney(p.mrr) : '<span class="note">no term</span>') + '</td>' +
            '<td>' + fmtInt(s.activeByPlan[k].count) + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      (s.unknownCount
        ? '<p class="hint" style="margin:10px 0 0">' + fmtInt(s.unknownCount) + ' unclassified purchase' +
          (s.unknownCount === 1 ? '' : 's') + ' worth ' + fmtMoney(s.unknownBookings) +
          ' came from the old daily sales columns, which recorded no plan. They count as revenue and as conversions everywhere, and they are left out of MRR because nothing recorded the term — set a plan on them under Edit data and they join it.</p>'
        : '');
  }

  /* ------------------------------------------------- sales entry (Edit data)

     The form stays open with the last purchase's plan, price and platform
     pre-filled rather than resetting to blank. Entering sales is a batch job —
     you sit down with the store report and type six of them — and a form that
     clears its plan and price between rows makes you re-choose the same two
     answers every time. */

  var lastSale = null;

  function renderSaleEntry() {
    renderSaleForm(null);
    renderSaleTable();
  }

  function saleFormDefaults() {
    return lastSale || { platform: 'ios', plan: 'monthly', price: '' };
  }

  function renderSaleForm(id) {
    var host = document.getElementById('slSaleForm');
    if (!host) return;
    var sale = id ? saleById(id) : null;
    var d = sale || saleFormDefaults();
    var plans = Sales.PLAN_KEYS.map(function (k) {
      return '<option value="' + k + '"' + (d.plan === k ? ' selected' : '') + '>' + esc(planLabel(k)) + '</option>';
    }).join('');
    var plats = [['ios', 'iOS'], ['android', 'Android']].map(function (p) {
      return '<option value="' + p[0] + '"' + (d.platform === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('');

    host.innerHTML = '<div class="event-form">' +
      '<div class="field"><label for="slDate">Purchase date</label>' +
        '<input type="date" id="slDate" value="' + esc(sale ? sale.date : today()) + '"></div>' +
      '<div class="field"><label for="slPlatform">Store</label><select id="slPlatform">' + plats + '</select></div>' +
      '<div class="field"><label for="slPlan">Plan</label><select id="slPlan">' + plans + '</select></div>' +
      '<div class="field"><label for="slPrice">Price paid</label>' +
        '<input type="number" id="slPrice" min="0" step="0.01" placeholder="0.00" value="' +
        esc(sale ? sale.price : (d.price === '' ? '' : d.price)) + '"></div>' +
      '<div class="field"><label for="slQty">Count</label>' +
        '<input type="number" id="slQty" min="1" step="1" value="' + esc(sale ? sale.qty : 1) + '"></div>' +
      '<div class="field"><label for="slCohort">Install date (optional)</label>' +
        '<input type="date" id="slCohort" value="' + esc(sale && sale.cohort ? sale.cohort : '') + '"></div>' +
      '<div class="field"><label for="slCancelled">Cancelled on (optional)</label>' +
        '<input type="date" id="slCancelled" value="' + esc(sale && sale.cancelled ? sale.cancelled : '') + '"></div>' +
      '<div class="field"><label for="slRefunded">Refunded</label>' +
        '<select id="slRefunded"><option value="">No</option><option value="1"' +
        (sale && sale.refunded ? ' selected' : '') + '>Yes — remove from every money figure</option></select></div>' +
      '<div class="field grow"><label for="slNote">Note</label>' +
        '<input type="text" id="slNote" maxlength="200" value="' + esc(sale && sale.note ? sale.note : '') + '"></div>' +
      '<div class="event-form-actions">' +
      '<button class="btn primary" id="slSave">' + (sale ? 'Save purchase' : 'Add purchase') + '</button>' +
      (sale ? '<button class="btn" id="slCancelEdit">Cancel</button>' +
        '<span class="spacer"></span><button class="btn danger" id="slDelete">Delete</button>' : '') +
      '</div>' +
      '<p class="note" id="slFormHint" style="margin:0"></p>' +
      '</div>';

    /* The count field is the migration's shape, not a shape you should be
       entering new sales in: a row of four buyers cannot carry one install
       date, so the cohort input disables itself the moment the count leaves 1
       rather than accepting a value the ledger would then drop. */
    var qty = document.getElementById('slQty');
    var cohort = document.getElementById('slCohort');
    function syncQty() {
      var many = (+qty.value || 1) > 1;
      cohort.disabled = many;
      if (many) cohort.value = '';
      document.getElementById('slFormHint').textContent = many
        ? 'A row of more than one purchase has no single buyer, so it carries no install date and stays out of the days-to-purchase chart.'
        : '';
    }
    qty.addEventListener('input', syncQty);
    syncQty();

    if (sale) {
      document.getElementById('slCancelEdit').addEventListener('click', function () { renderSaleForm(null); });
      document.getElementById('slDelete').addEventListener('click', function () {
        if (!confirm('Delete the ' + fmtMoney(sale.price) + ' purchase on ' + labelFull(sale.date) + '?')) return;
        removeSale(sale.id);
        renderSaleEntry();
        renderAll();
        toast('Purchase deleted.');
      });
    }

    document.getElementById('slSave').addEventListener('click', function () {
      var date = document.getElementById('slDate').value;
      var price = document.getElementById('slPrice').value;
      if (!date) { toast('A purchase needs a date.'); return; }
      if (price === '' || !isFinite(+price)) { toast('A purchase needs a price — enter 0 for a free conversion.'); return; }
      var n = Math.max(1, Math.round(+document.getElementById('slQty').value || 1));
      var cohortVal = document.getElementById('slCohort').value;
      var cancelledVal = document.getElementById('slCancelled').value;
      if (cohortVal && cohortVal > date) { toast('The install date is after the purchase date.'); return; }
      if (cancelledVal && cancelledVal < date) { toast('The cancellation is before the purchase.'); return; }

      var rec = {
        id: sale ? sale.id : newId('sale'),
        date: date,
        platform: document.getElementById('slPlatform').value,
        plan: document.getElementById('slPlan').value,
        price: +price,
        qty: n,
        cohort: (n === 1 && cohortVal) ? cohortVal : undefined,
        cancelled: cancelledVal || undefined,
        refunded: !!document.getElementById('slRefunded').value,
        note: document.getElementById('slNote').value.trim() || undefined
      };
      putSale(rec);
      lastSale = { platform: rec.platform, plan: rec.plan, price: rec.price };
      renderSaleEntry();
      renderAll();
      toast(sale ? 'Purchase saved.' : 'Purchase added.');
    });
  }

  function renderSaleTable() {
    var list = salesList();
    var host = document.getElementById('slSaleTable');
    if (!host) return;
    document.getElementById('slSaleCount').textContent = list.length
      ? list.length + ' purchase' + (list.length === 1 ? '' : 's') + ' on record' : '';
    if (!list.length) {
      host.innerHTML = '<div class="empty">No purchases recorded yet. Add one above, or paste a batch.</div>';
      return;
    }
    host.innerHTML = '<table><thead><tr><th>Date</th><th>Store</th><th>Plan</th>' +
      '<th class="money">Price</th><th class="money">Count</th><th class="money">MRR</th>' +
      '<th>Installed</th><th>Age</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (raw) {
        var s = Sales.normalize(raw);
        if (!s) return '';
        var age = Sales.cohortDayOf(s);
        var status = s.refunded ? '<span class="pill red">refunded</span>'
          : s.cancelled ? '<span class="note">cancelled ' + esc(labelDay(s.cancelled)) + '</span>'
          : Sales.isRecurring(s.plan) ? '<span class="pill green">live</span>' : '';
        return '<tr><td>' + esc(labelFull(s.date)) + '</td>' +
          '<td><span class="pill ' + s.platform + '">' + PLATFORMS[s.platform] + '</span></td>' +
          '<td><span class="swatch" style="background:' + planColor(s.plan) + '"></span> ' + esc(planLabel(s.plan)) + '</td>' +
          '<td class="money">' + fmtMoney(s.price) + '</td>' +
          '<td class="money">' + fmtInt(s.qty) + '</td>' +
          '<td class="money">' + (Sales.isRecurring(s.plan) ? fmtMoney(Sales.mrrOf(s)) : '<span class="na">–</span>') + '</td>' +
          '<td>' + (s.cohort ? esc(labelDay(s.cohort)) : '<span class="na">–</span>') + '</td>' +
          '<td>' + (age === null ? '<span class="na">–</span>' : age + 'd') + '</td>' +
          '<td>' + status + '</td>' +
          '<td><button class="btn sm" data-sale-edit="' + esc(s.id) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table>';

    host.querySelectorAll('[data-sale-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        renderSaleForm(b.dataset.saleEdit);
        document.getElementById('slSaleForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  /* The positional shape the hint documents. A header line overrides it, which
     is what lets "Export CSV" below round-trip back through this box: that file
     carries `qty` and `refunded` too, and read positionally its columns would
     land one apart — a count read as an install date, a refund read as a note. */
  var SALE_PASTE_COLS = ['date', 'platform', 'plan', 'price', 'cohort', 'cancelled', 'note'];
  var SALE_COL_ALIASES = {
    date: 'date', purchased: 'date', platform: 'platform', store: 'platform',
    plan: 'plan', term: 'plan', price: 'price', amount: 'price', proceeds: 'price',
    qty: 'qty', quantity: 'qty', count: 'qty', units: 'qty',
    cohort: 'cohort', installdate: 'cohort', installed: 'cohort', install: 'cohort',
    cancelled: 'cancelled', canceled: 'cancelled', churned: 'cancelled',
    refunded: 'refunded', refund: 'refunded', note: 'note', notes: 'note'
  };

  function splitSaleLine(line) {
    var sep = line.indexOf('\t') !== -1 ? '\t' : ',';
    return line.split(sep).map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
  }

  /* A header maps names to positions; without one every line reads positionally.
     Returns null when the first line is data, which is the common case — one
     purchase pasted out of a spreadsheet row. */
  function saleHeaderMap(cells) {
    var map = {}, hits = 0;
    cells.forEach(function (cell, i) {
      var key = SALE_COL_ALIASES[cell.toLowerCase().replace(/[^a-z]/g, '')];
      if (key && map[key] === undefined) { map[key] = i; hits++; }
    });
    return (hits >= 2 && map.date !== undefined && !normalizeDate(cells[0] || '')) ? map : null;
  }

  /**
   * Parse the paste box.
   *
   * Returns rows AND the lines it could not read, because a silent drop is the
   * worst outcome here: you paste thirty purchases, twenty-eight land, and the
   * two that did not are indistinguishable from two you never made until the
   * numbers stop matching the store report months later.
   */
  function parseSalePaste(text) {
    var rows = [], bad = [];
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var header = null;
    for (var h = 0; h < lines.length; h++) {
      if (!lines[h].trim()) continue;
      header = saleHeaderMap(splitSaleLine(lines[h]));
      break;
    }
    var headerSeen = false;
    lines.forEach(function (line, i) {
      if (!line.trim()) return;
      if (header && !headerSeen) { headerSeen = true; return; }
      var c = splitSaleLine(line);
      function col(name) {
        var at = header ? header[name] : SALE_PASTE_COLS.indexOf(name);
        return (at === undefined || at < 0) ? '' : (c[at] || '');
      }
      var date = normalizeDate(col('date'));
      if (!date) {
        bad.push({ line: i + 1, text: line, why: 'no readable date in the ' + (header ? 'date column' : 'first column') });
        return;
      }
      var plat = /and|goog|play/i.test(col('platform')) ? 'android' : 'ios';
      var planRaw = col('plan').toLowerCase();
      var plan = /ann|year|yr/.test(planRaw) ? 'annual'
        : /life|perm|forever/.test(planRaw) ? 'lifetime'
        : /unknown|unclass/.test(planRaw) ? 'unknown'
        : /month|mo\b/.test(planRaw) ? 'monthly'
        : planRaw ? 'monthly' : 'unknown';
      var priceRaw = col('price');
      var price = cleanNum(priceRaw);
      if (priceRaw !== '' && !isFinite(price)) {
        bad.push({ line: i + 1, text: line, why: 'the price did not read as a number' });
        return;
      }
      /* A count comes back only from a file that carries one. Several buyers do
         not share an install date, so a qty above one drops the cohort rather
         than attributing one person's install to all of them — the same rule
         Sales.normalize enforces, applied here so the box cannot offer a row
         the ledger would then silently strip. */
      var qty = Math.max(1, Math.round(cleanNum(col('qty')) || 1));
      var cohort = normalizeDate(col('cohort'));
      var cancelled = normalizeDate(col('cancelled'));
      var refunded = /^(y|t|1|yes|true|refunded)$/i.test(col('refunded').trim());
      var note = col('note');
      rows.push({
        date: date, platform: plat, plan: plan, price: price, qty: qty,
        cohort: (qty === 1 && cohort && cohort <= date) ? cohort : undefined,
        cancelled: (cancelled && cancelled >= date) ? cancelled : undefined,
        refunded: refunded || undefined,
        note: note ? String(note).slice(0, 200) : undefined
      });
    });
    return { rows: rows, bad: bad };
  }

  function salesCSV() {
    var cols = ['date', 'platform', 'plan', 'price', 'qty', 'cohort', 'cancelled', 'refunded', 'note'];
    var lines = [cols.join(',')];
    salesList().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (raw) {
      var s = Sales.normalize(raw);
      if (!s) return;
      lines.push(cols.map(function (c) {
        var v = s[c];
        if (c === 'refunded') v = s.refunded ? 'yes' : '';
        if (v === null || v === undefined) v = '';
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    return lines.join('\n');
  }

  function wireSales() {
    document.getElementById('slPasteClear').addEventListener('click', function () {
      document.getElementById('slPaste').value = '';
      document.getElementById('slPasteStatus').textContent = '';
    });
    document.getElementById('slPasteGo').addEventListener('click', function () {
      var box = document.getElementById('slPaste');
      var out = parseSalePaste(box.value);
      if (!out.rows.length && !out.bad.length) { toast('Nothing to add — paste some rows first.'); return; }
      out.rows.forEach(function (r) {
        r.id = newId('sale');
        salesList().push(r);
      });
      if (out.rows.length) { sortSales(); save(); invalidate(); }
      /* The unreadable lines are left in the box rather than cleared, so the
         fix is a correction in place instead of a hunt through the source. */
      box.value = out.bad.map(function (b) { return b.text; }).join('\n');
      document.getElementById('slPasteStatus').textContent =
        'Added ' + out.rows.length + ' purchase' + (out.rows.length === 1 ? '' : 's') +
        (out.bad.length ? ' · ' + out.bad.length + ' line' + (out.bad.length === 1 ? '' : 's') +
          ' left in the box: ' + out.bad[0].why : '');
      renderSaleEntry();
      renderAll();
      toast('Added ' + out.rows.length + ' purchases.');
    });
    document.getElementById('slExport').addEventListener('click', function () {
      download('autonomic-sales.csv', salesCSV(), 'text/csv');
    });
  }

  /* -------------------------------------------------------- view: costs

     What the app costs to run, against what it earns.

     Every number here is arithmetic from costs.js, which is pure and tested;
     this half is entry and rendering. Two things about it are worth knowing
     before reading on.

     The platform filter does NOT apply. A hosting bill is not iOS or Android,
     and splitting acquisition cost by store would need per-store spend that no
     network reports the same way. The view always reads both stores combined,
     and says so in the filter bar.

     Money comes from two collections. `ads` are AD SPOTS — one purchase each,
     carrying their own price, impressions, clicks and the platform they ran on.
     `costs` is everything else the app costs to run. Nothing is entered twice
     and nothing is spread across dates: a spot's price lands whole on the day
     it starts, and `spendList()` is the one place the two are put together. */

  function ads() { return db.ads || (db.ads = []); }
  function costList() { return db.costs || (db.costs = []); }
  /** Every cost there is, ad spots projected into cost rows. Read-only. */
  function spendList() { return CS.allCosts(ads(), costList()); }
  function adById(id) {
    return ads().filter(function (a) { return a.id === id; })[0] || null;
  }
  function storeCut() {
    var v = Number(db.settings.storeCutPct);
    return (isFinite(v) && v >= 0 && v <= 100) ? v : 15;
  }
  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function putAd(ad) {
    var list = ads(), at = -1;
    list.forEach(function (a, i) { if (a.id === ad.id) at = i; });
    if (at >= 0) list[at] = ad; else list.push(ad);
    sortAds();
    /* A spot carries its own money, so writing one moves every derived total
       exactly as writing a cost does — and it can predate every store entry,
       which is what the derived cache is keyed on. */
    save(); invalidate();
  }

  /* Deleting an ad spot deletes its money with it — the spot IS the line item
     now, so there is nothing left behind to detach. The delete button says the
     amount out loud for exactly that reason. */
  function removeAd(id) {
    db.ads = ads().filter(function (a) { return a.id !== id; });
    save(); invalidate();
  }

  function putCost(c) {
    var list = costList(), at = -1;
    list.forEach(function (x, i) { if (x.id === c.id) at = i; });
    if (at >= 0) list[at] = c; else list.push(c);
    list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    /* A cost can predate every store entry, and base() folds cost dates into
       the date spine — so the derived cache has to go, exactly as it does on
       an entry write. Without this the first cost on a fresh account is filed
       outside the range that was computed before it existed, and vanishes. */
    save(); invalidate();
  }
  function removeCost(id) {
    db.costs = costList().filter(function (c) { return c.id !== id; });
    save(); invalidate();
  }

  /**
   * The one-shot move from campaigns to ad spots.
   *
   * The old shape was a campaign (a name, a channel, the days it ran) plus one
   * ADS cost row per day it spent money on. The new one is a single line item
   * holding its own price. So each campaign collapses into one spot: its rows'
   * amounts, impressions, clicks and reported installs are summed, and the
   * charge date becomes the campaign's start.
   *
   * Nothing is invented and nothing is thrown away. An ADS row that belonged to
   * no campaign (its campaign was deleted, back when that detached the money)
   * becomes a spot of its own on the day it was charged, so the totals before
   * and after this migration are identical — which is the only property that
   * matters, since every all-time figure on the dashboard is built from them.
   *
   * A recurring ADS row is expanded to its occurrences first: it was N charges
   * and it stays N charges' worth of money.
   *
   * Guarded by `settings.adSpotsMigrated`, and it must stay guarded — a second
   * run over already-migrated spots would find no ADS rows and quietly zero
   * nothing, but the guard is what stops a half-finished first run from being
   * repeated. It runs after the sync adopt, like migrateSales(), or the rewrite
   * would never leave the browser.
   */
  function migrateAdSpots() {
    if (db.settings.adSpotsMigrated) return 0;
    var ALL_FROM = '2000-01-01', ALL_TO = '2099-12-31';
    var byAd = {}, orphans = [];
    var moved = 0;

    costList().forEach(function (c) {
      if (!c || c.category !== 'ADS') return;
      var hits = CS.occurrences(c, ALL_FROM, ALL_TO);
      if (!hits.length) return;
      var bucket = c.adId ? (byAd[c.adId] || (byAd[c.adId] = { amount: 0, impressions: 0, clicks: 0, installs: 0, first: null })) : null;
      if (!bucket) {
        orphans.push({
          id: newId('ad'),
          name: c.label || 'Advertising',
          platform: 'Other',
          start: hits[0],
          amount: num(c.amount) * hits.length,
          impressions: num(c.impressions) * hits.length || undefined,
          clicks: num(c.clicks) * hits.length || undefined,
          installs: num(c.installs) * hits.length || undefined,
          note: c.note
        });
        return;
      }
      bucket.amount += num(c.amount) * hits.length;
      bucket.impressions += num(c.impressions) * hits.length;
      bucket.clicks += num(c.clicks) * hits.length;
      bucket.installs += num(c.installs) * hits.length;
      if (!bucket.first || hits[0] < bucket.first) bucket.first = hits[0];
    });

    ads().forEach(function (a) {
      if (!a || a.amount !== undefined) return;      // already a spot
      var b = byAd[a.id] || { amount: 0, impressions: 0, clicks: 0, installs: 0, first: null };
      /* The channel was where it ran; that is what "platform" means now. The
         old `platform` was iOS/Android targeting, which nothing ever read. */
      a.platform = a.channel || 'Other';
      delete a.channel;
      a.amount = b.amount;
      if (b.impressions) a.impressions = b.impressions;
      if (b.clicks) a.clicks = b.clicks;
      if (b.installs) a.installs = b.installs;
      moved++;
    });

    orphans.forEach(function (o) { ads().push(o); });
    db.costs = costList().filter(function (c) { return !c || c.category !== 'ADS'; });
    db.settings.adSpotsMigrated = true;
    sortAds();
    save(); invalidate();
    return moved + orphans.length;
  }

  function sortAds() {
    ads().sort(function (a, b) { return (a.start || '') < (b.start || '') ? 1 : -1; });
  }

  /* ----------------------------------------------------------- buckets */

  /* Costs can exist before any store data does — the developer programme is
     usually the first thing anyone pays for. buildBuckets returns nothing
     without store entries, so the spine is built here when it has to be. */
  function bareBuckets(from, to, grain) {
    var order = [], map = {};
    for (var d = from; d <= to; d = addDays(d, 1)) {
      var k = grain === 'week' ? weekStart(d) : grain === 'month' ? monthStart(d) : d;
      var row = map[k];
      if (!row) {
        row = map[k] = { key: k, start: d, end: d, downloads: 0, sales: 0, revenue: 0 };
        order.push(row);
      }
      row.end = d;
    }
    return order;
  }

  /** Per-bucket money: store side from buildBuckets, cost side folded in. */
  function costRows(from, to, grain) {
    grain = grain || state.grain;
    var rows = buildBuckets('all', from, to, grain);
    if (!rows.length) rows = bareBuckets(from, to, grain);
    var d = CS.daily(spendList(), from, to);
    var cut = storeCut();

    rows.forEach(function (row) {
      row.spend = 0; row.marketing = 0; row.byCategory = {};
      for (var day = row.start; day <= row.end; day = addDays(day, 1)) {
        row.spend += d.byDay[day] || 0;
        row.marketing += d.marketingByDay[day] || 0;
        CS.CATEGORY_KEYS.forEach(function (k) {
          var v = d.byCategory[k][day];
          if (v) row.byCategory[k] = (row.byCategory[k] || 0) + v;
        });
      }
      row.netRevenue = CS.netRevenue(row.revenue, cut);
      row.profit = row.netRevenue - row.spend;
      row.cpi = row.downloads ? row.marketing / row.downloads : null;
      row.cpa = row.sales ? row.marketing / row.sales : null;
      row.loadedCpa = row.sales ? row.spend / row.sales : null;
    });
    return rows;
  }

  /** Range economics, shared by the Costs tiles and the Overview strip. */
  function costSummary(r) {
    var s = summarize('all', r.from, r.to);
    return CS.summary({
      costs: spendList(), from: r.from, to: r.to, storeCutPct: storeCut(),
      store: { revenue: s.revenue, downloads: s.downloads, sales: s.sales }
    });
  }

  /* ------------------------------------------------------------ render */

  function renderCosts() {
    var r = activeRange();
    var sum = costSummary(r);
    var rows = costRows(r.from, r.to);
    var cut = storeCut();

    /* ---- tiles ---- */
    var profitTile = tile({
      label: 'Net profit in range', color: sum.profit >= 0 ? COLOR.s3 : COLOR.red,
      value: fmtMoney(sum.profit), smallValue: true,
      meta: fmtMoney(sum.netRevenue) + ' net revenue − ' + fmtMoney(sum.spend) + ' spend · ' +
        fmtMoney(sum.grossRevenue) + ' gross before the ' + cut + '% store cut'
    });
    document.getElementById('csTiles').innerHTML = [
      tile({
        label: 'Total spend', color: COLOR.s2, value: fmtMoney(sum.spend), smallValue: true,
        meta: fmtMoney(sum.marketing) + ' marketing · ' + fmtMoney(sum.other) + ' everything else',
        spark: Chart.sparkline(rows.map(function (x) { return x.spend; }), COLOR.s2)
      }),
      profitTile,
      tile({
        label: 'Cost per install', value: fmtMoney(sum.costPerInstall), smallValue: true,
        meta: 'blended — marketing spend ÷ every store download in range'
      }),
      tile({
        label: 'Cost per paid conversion', value: fmtMoney(sum.costPerPaid), smallValue: true,
        meta: sum.loadedCostPerPaid === null ? 'no paid conversions in range'
          : 'marketing only · ' + fmtMoney(sum.loadedCostPerPaid) + ' with every cost loaded in'
      }),
      tile({
        label: 'Return on ad spend', value: sum.roas === null ? '–' : sum.roas.toFixed(2) + '×',
        smallValue: true,
        meta: sum.roas === null ? 'no marketing spend in range'
          : 'net revenue ÷ marketing spend · ' + fmtMoney(sum.revenuePerInstall) + ' net per install'
      }),
      tile({
        label: 'Margin', value: fmtPct(sum.margin), smallValue: true,
        meta: 'of net revenue, after every cost in range'
      })
    ].join('') + allTimeTiles();

    /* ---- spend against revenue ---- */
    var x = rows.map(function (row) { return bucketLabel(row.key); });
    var marks = marksForRows(rows);
    var used = CS.CATEGORY_KEYS.filter(function (k) {
      return rows.some(function (row) { return row.byCategory[k]; });
    });
    var series = used.map(function (k) {
      return {
        key: k, name: CS.CATEGORIES[k].label, color: CS.CATEGORIES[k].color, type: 'bar',
        format: fmtMoney, values: rows.map(function (row) { return row.byCategory[k] || 0; })
      };
    });
    series.push({
      key: 'net', name: 'Net revenue', color: ENTITY.revenue, type: 'line', format: fmtMoney,
      values: rows.map(function (row) { return row.netRevenue; })
    });
    drawChart('csChart', {
      x: x, series: series, height: 320, stacked: true, format: fmtMoney,
      yTickFormat: moneyTick, marks: marks, onMarkClick: markClickFor(),
      emptyText: 'No costs recorded in this range yet.',
      tooltipNote: function (i) {
        var row = rows[i];
        if (!row) return '';
        return 'Profit ' + fmtMoney(row.profit);
      }
    });

    renderBreakeven();

    /* ---- cost per acquisition ---- */
    drawChart('csCpa', {
      x: x, height: 280, format: fmtMoney, yTickFormat: moneyTick,
      series: [
        { key: 'cpi', name: 'Per install (blended)', color: ENTITY.downloads, type: 'line',
          format: fmtMoney, values: rows.map(function (row) { return row.cpi; }) },
        { key: 'cpa', name: 'Per paid conversion (blended)', color: ENTITY.sales, type: 'line',
          format: fmtMoney, values: rows.map(function (row) { return row.cpa; }) },
        { key: 'loaded', name: 'Per paid conversion, all costs', color: COLOR.muted, type: 'line',
          format: fmtMoney, dashed: true, values: rows.map(function (row) { return row.loadedCpa; }) }
      ],
      emptyText: 'Nothing to divide yet.'
    });

    renderCostTables(r, sum);
    renderAdTable('csAdPerf', r, false);
  }

  /* The entry half, which lives under Edit data. Split from renderCosts so the
     analysis tab never rebuilds a list the reader is working in, and the entry
     tab never recomputes four charts nobody is looking at. */
  function renderCostEntry() {
    renderAdTable('csAdTable', EVER, true);
    renderCostList();
  }

  /* Flags land on the bucket that CONTAINS the event, not on a bucket whose
     first day happens to equal the event's date. At week or month grain the
     latter drops every event that did not fall on a Monday. */
  function marksForRows(rows) {
    var idx = {}, all = [];
    rows.forEach(function (row, i) {
      for (var d = row.start; d <= row.end; d = addDays(d, 1)) { idx[d] = i; all.push(d); }
    });
    return marksFor(all, function (d) { return idx[d]; });
  }

  function moneyTick(v) { return (db.settings.currency || '$') + Chart.fmtCompact(v); }

  /* All-time is a different question from the selected range, and the one that
     decides whether this was worth doing. It ignores the filter bar on purpose. */
  function allTimeTiles() {
    var b = base();
    var from = b.dates.length ? b.start : asOf();
    var to = asOf();
    var s = summarize('all', from, to);
    var spend = CS.spend(spendList(), from, to);
    var net = CS.netRevenue(s.revenue, storeCut());
    var be = breakevenSeries();
    return [
      tile({
        label: 'All-time net', value: fmtMoney(net - spend), smallValue: true,
        color: net - spend >= 0 ? COLOR.s3 : COLOR.red,
        meta: fmtMoney(net) + ' net revenue − ' + fmtMoney(spend) + ' spent, since ' + labelFull(from)
      }),
      tile({
        label: 'Breakeven', value: be.at ? labelDay(be.at) : '–', smallValue: true,
        meta: be.at
          ? 'the day cumulative net revenue first passed cumulative spend'
          : (be.spend - be.revenue > 0
            ? fmtMoney(be.spend - be.revenue) + ' still to make back'
            : 'nothing spent yet')
      })
    ].join('');
  }

  function breakevenSeries() {
    var b = base();
    var from = b.dates.length ? b.start : asOf();
    var to = asOf();
    var cut = storeCut();
    var netByDay = {};
    CS.days(from, to).forEach(function (d) {
      netByDay[d] = CS.netRevenue(dayRec('all', d).revenue, cut);
    });
    var out = CS.breakeven(spendList(), netByDay, from, to);
    out.from = from; out.to = to;
    return out;
  }

  function renderBreakeven() {
    var be = breakevenSeries();
    var days = be.series.map(function (p) { return p.date; });
    document.getElementById('csCumHint').innerHTML = be.at
      ? 'Cumulative net revenue passed cumulative spend on <b>' + esc(labelFull(be.at)) +
        '</b>, and the gap since is profit. Runs over all of history rather than the selected range — breakeven happens once, and a rolling window would announce it every month.'
      : 'Cumulative spend against cumulative net revenue, over all of history rather than the selected range. They have not crossed yet: ' +
        '<b>' + esc(fmtMoney(be.spend - be.revenue)) + '</b> still to make back.';

    drawChart('csCum', {
      x: days.map(function (d) { return bucketLabel(d, 'day'); }),
      height: 300, format: fmtMoney, yTickFormat: moneyTick, xLabel: 'Day',
      series: [
        { key: 'spend', name: 'Cumulative spend', color: COLOR.s2, type: 'line', format: fmtMoney,
          values: be.series.map(function (p) { return p.spend; }) },
        { key: 'rev', name: 'Cumulative net revenue', color: ENTITY.revenue, type: 'line', format: fmtMoney,
          values: be.series.map(function (p) { return p.revenue; }) }
      ],
      guides: be.at ? [{ index: days.indexOf(be.at), label: 'breakeven', color: COLOR.s3 }] : [],
      marks: marksFor(days), onMarkClick: markClickFor(),
      emptyText: 'Nothing recorded yet.',
      tooltipNote: function (i) {
        var p = be.series[i];
        return p ? (p.profit >= 0 ? 'Ahead by ' : 'Behind by ') + fmtMoney(Math.abs(p.profit)) : '';
      }
    });
  }

  function renderCostTables(r, sum) {
    var downloads = summarize('all', r.from, r.to).downloads;
    var rowsHtml = CS.CATEGORY_KEYS.filter(function (k) { return sum.byCategory[k]; })
      .sort(function (a, b) { return sum.byCategory[b] - sum.byCategory[a]; })
      .map(function (k) {
        var v = sum.byCategory[k];
        var perInstall = downloads ? v / downloads : null;
        return '<tr><td><span class="cat-dot" style="background:' + CS.CATEGORIES[k].color + '"></span>' +
          esc(CS.CATEGORIES[k].label) + (CS.CATEGORIES[k].marketing ? ' <span class="note">marketing</span>' : '') + '</td>' +
          '<td class="money">' + fmtMoney(v) + '</td>' +
          '<td class="money">' + (sum.spend ? ((v / sum.spend) * 100).toFixed(1) + '%' : '–') + '</td>' +
          '<td class="money">' + fmtMoney(perInstall) + '</td></tr>';
      }).join('');
    document.getElementById('csCategoryTable').innerHTML = rowsHtml
      ? '<table><thead><tr><th>Category</th><th class="money">Spend</th><th class="money">Share</th>' +
        '<th class="money">Per install</th></tr></thead><tbody>' + rowsHtml +
        '<tr><td><b>Total</b></td><td class="money"><b>' + fmtMoney(sum.spend) + '</b></td>' +
        '<td class="money">100%</td><td class="money"><b>' +
        fmtMoney(downloads ? sum.spend / downloads : null) + '</b></td></tr>' +
        '</tbody></table>'
      : '<div class="empty">No costs in this range.</div>';

    var plats = CS.perPlatform(ads(), r.from, r.to);
    document.getElementById('csChannelTable').innerHTML = plats.length
      ? '<table><thead><tr><th>Platform</th><th class="money">Spots</th><th class="money">Spend</th>' +
        '<th class="money">Impressions</th><th class="money">Clicks</th><th class="money">CTR</th>' +
        '<th class="money">Cost per click</th></tr></thead><tbody>' +
        plats.map(function (c) {
          return '<tr><td>' + esc(c.platform) + '</td><td class="money">' + fmtInt(c.ads) + '</td>' +
            '<td class="money">' + fmtMoney(c.spend) + '</td>' +
            '<td class="money">' + (c.impressions ? fmtInt(c.impressions) : '<span class="na">–</span>') + '</td>' +
            '<td class="money">' + (c.clicks ? fmtInt(c.clicks) : '<span class="na">–</span>') + '</td>' +
            '<td class="money">' + (c.ctr === null ? '<span class="na">–</span>' : c.ctr.toFixed(2) + '%') + '</td>' +
            '<td class="money">' + fmtMoney(c.cpc) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="empty">No ad spots bought in this range.</div>';
  }

  /**
   * The ad-spot table, drawn twice from one function.
   *
   * On Edit data it is the management list: editable, and unbounded in time,
   * because that view has no filter bar and a spot bought today for next month
   * must still appear in the list you manage it from. On the Costs tab it is
   * read-only and scoped to the selected range, which is the reading question.
   * Same numbers, two jobs, one place they are computed.
   */
  function renderAdTable(hostId, r, editable) {
    var per = CS.perAd(ads(), r.from, r.to);
    var day = asOf();
    var host = document.getElementById(hostId);
    if (!host) return;
    if (!per.rows.length) {
      host.innerHTML = '<div class="empty">' + (editable
        ? 'No ad spots yet. Add one — a spot is a single thing you bought, with its own price.'
        : 'No ad spots bought in this range. They are entered under Edit data.') + '</div>';
      return;
    }
    host.innerHTML = '<table><thead><tr><th>Ad spot</th><th>Platform</th><th>Ran</th><th>Status</th>' +
      '<th class="money">Cost</th><th class="money">Share</th>' +
      '<th class="money">Impressions</th><th class="money">Clicks</th><th class="money">CTR</th>' +
      '<th class="money">Cost per click</th>' +
      (editable ? '<th></th>' : '') + '</tr></thead><tbody>' +
      per.rows.map(function (row) {
        var st = CS.adStatus(row.ad, day);
        return '<tr><td>' + esc(row.name) + '</td>' +
          '<td>' + esc(row.platform || '–') + '</td>' +
          '<td>' + esc(labelDay(row.start)) +
          (row.end ? ' – ' + esc(labelDay(row.end)) : ' <span class="note">no end yet</span>') + '</td>' +
          '<td><span class="pill ' + st + '">' + st + '</span></td>' +
          '<td class="money">' + fmtMoney(row.spend) + '</td>' +
          '<td class="money">' + (row.share === null ? '–' : row.share.toFixed(1) + '%') + '</td>' +
          '<td class="money">' + (row.impressions ? fmtInt(row.impressions) : '<span class="na">–</span>') + '</td>' +
          '<td class="money">' + (row.clicks ? fmtInt(row.clicks) : '<span class="na">–</span>') + '</td>' +
          '<td class="money">' + (row.ctr === null ? '<span class="na">–</span>' : row.ctr.toFixed(2) + '%') + '</td>' +
          '<td class="money">' + fmtMoney(row.cpc) + '</td>' +
          (editable ? '<td><button class="btn sm" data-ad-edit="' + esc(row.id) + '">Edit</button></td>' : '') +
          '</tr>';
      }).join('') +
      '<tr><td><b>Total</b></td><td></td><td></td><td></td><td class="money"><b>' + fmtMoney(per.total) + '</b></td>' +
      '<td colspan="' + (editable ? 6 : 5) + '"></td></tr></tbody></table>';

    if (!editable) return;
    host.querySelectorAll('[data-ad-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openAdForm(b.dataset.adEdit); });
    });
  }

  /** Everything ever recorded — the window the management tables read. */
  function allTimeRange() {
    var b = base();
    return { from: b.dates.length ? b.start : asOf(), to: asOf() };
  }

  /* Wider than all-time: a spot can be bought today to start next month, and a
     management list that hid it would be a list you could not correct. */
  var EVER = { from: '2000-01-01', to: '2099-12-31' };

  function openAdForm(id) {
    var ad = id ? adById(id) : null;
    var host = revealCard(document.getElementById('csAdForm'));
    host.classList.remove('hidden');
    var plats = CS.PLATFORMS.map(function (c) {
      return '<option value="' + esc(c) + '"' + (ad && ad.platform === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var n = function (v) { return v === undefined || v === null ? '' : v; };

    host.innerHTML = '<div class="event-form">' +
      '<div class="field grow"><label for="adName">What you bought</label>' +
      '<input type="text" id="adName" maxlength="120" placeholder="Newsletter sponsorship — August issue" value="' + esc(ad ? ad.name : '') + '"></div>' +
      '<div class="field"><label for="adPlatform">Platform</label><select id="adPlatform">' + plats + '</select></div>' +
      '<div class="field"><label for="adAmount">Cost</label>' +
      '<input type="number" id="adAmount" step="0.01" min="0" value="' + esc(String(n(ad && ad.amount))) + '"></div>' +
      '<div class="field"><label for="adStart">Starts (charged)</label><input type="date" id="adStart" value="' + esc(ad ? ad.start : asOf()) + '"></div>' +
      '<div class="field"><label for="adEnd">Ends (blank = ongoing)</label><input type="date" id="adEnd" value="' + esc(ad && ad.end ? ad.end : '') + '"></div>' +
      '<div class="field"><label for="adImpressions">Impressions</label>' +
      '<input type="number" id="adImpressions" step="1" min="0" placeholder="optional" value="' + esc(String(n(ad && ad.impressions))) + '"></div>' +
      '<div class="field"><label for="adClicks">Clicks</label>' +
      '<input type="number" id="adClicks" step="1" min="0" placeholder="optional" value="' + esc(String(n(ad && ad.clicks))) + '"></div>' +
      '<div class="field"><label for="adInstalls">Reported installs</label>' +
      '<input type="number" id="adInstalls" step="1" min="0" placeholder="optional" value="' + esc(String(n(ad && ad.installs))) + '"></div>' +
      '<div class="field grow"><label for="adUrl">Link (optional)</label><input type="text" id="adUrl" placeholder="https://" value="' + esc(ad && ad.url ? ad.url : '') + '"></div>' +
      '<div class="field full"><label for="adNote">Notes</label><textarea id="adNote" rows="2" maxlength="2000">' + esc(ad && ad.note ? ad.note : '') + '</textarea></div>' +
      '<div class="event-form-actions">' +
      '<button class="btn primary" id="adSave">' + (ad ? 'Save ad spot' : 'Add ad spot') + '</button>' +
      '<button class="btn" id="adCancel">Cancel</button>' +
      (ad ? '<span class="spacer"></span><button class="btn danger" id="adDelete">Delete</button>' : '') +
      '</div></div>';

    document.getElementById('adCancel').addEventListener('click', closeAdForm);
    if (ad) {
      document.getElementById('adDelete').addEventListener('click', function () {
        /* The spot IS the money now, so deleting it removes the spend from
           every total. Say the amount rather than let it go quietly. */
        if (!confirm('Delete "' + ad.name + '"? Its ' + fmtMoney(num(ad.amount)) +
          ' comes off every spend, profit and breakeven figure.')) return;
        removeAd(ad.id);
        closeAdForm();
        renderAll();
        toast('Ad spot deleted.');
      });
    }
    document.getElementById('adSave').addEventListener('click', function () {
      var name = document.getElementById('adName').value.trim();
      var start = document.getElementById('adStart').value;
      var end = document.getElementById('adEnd').value;
      var amount = document.getElementById('adAmount').value;
      if (!name) { toast('An ad spot needs a name.'); return; }
      if (!start) { toast('An ad spot needs a start date — that is the day its cost lands.'); return; }
      if (amount === '') { toast('An ad spot needs a cost. Enter 0 if it was free.'); return; }
      if (end && end < start) { toast('The end date is before the start date.'); return; }
      var count = function (id) {
        var v = document.getElementById(id).value;
        return v === '' ? undefined : Math.round(cleanNum(v));
      };
      putAd({
        id: ad ? ad.id : newId('ad'),
        name: name,
        platform: document.getElementById('adPlatform').value,
        start: start,
        end: end || undefined,
        amount: cleanNum(amount),
        impressions: count('adImpressions'),
        clicks: count('adClicks'),
        installs: count('adInstalls'),
        url: document.getElementById('adUrl').value.trim() || undefined,
        note: document.getElementById('adNote').value.trim() || undefined
      });
      closeAdForm();
      renderAll();
      toast(ad ? 'Ad spot saved.' : 'Ad spot added.');
    });
    document.getElementById('adName').focus();
  }

  function closeAdForm() {
    var host = document.getElementById('csAdForm');
    host.classList.add('hidden');
    host.innerHTML = '';
  }

  /* ------------------------------------------------------- the cost list */

  /* The ledger of everything that is NOT an ad spot: hosting, tools, developer
     programmes, contract work. Every row, newest first, unscoped — this is the
     list you check a charge against, and a cost filtered out by a range
     selected on another tab is a cost you would swear you had entered. */
  function renderCostList() {
    var list = costList();
    var host = document.getElementById('csCostTable');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="empty">No other costs recorded yet.</div>';
      return;
    }
    var r = allTimeRange();

    host.innerHTML = '<table><thead><tr><th>Date</th><th>Category</th><th>What</th>' +
      '<th class="money">Amount</th><th class="money">Charged so far</th><th></th></tr></thead><tbody>' +
      list.map(function (c) {
        var cat = CS.CATEGORIES[c.category] || CS.CATEGORIES.OTHER;
        var hits = CS.occurrences(c, r.from, r.to).length;
        var rec = c.recurrence && c.recurrence !== 'none' ? CS.RECURRENCES[c.recurrence] : null;
        return '<tr><td>' + esc(labelFull(c.date)) +
          (rec ? '<br><span class="repeats">' + esc(rec.label.toLowerCase()) +
            (c.until ? ' until ' + esc(labelDay(c.until)) : '') + '</span>' : '') + '</td>' +
          '<td><span class="cat-dot" style="background:' + cat.color + '"></span>' + esc(cat.label) + '</td>' +
          '<td>' + esc(c.label || '–') +
          (c.note ? '<br><span class="note">' + esc(c.note) + '</span>' : '') + '</td>' +
          '<td class="money">' + fmtMoney(c.amount) + '</td>' +
          '<td class="money">' + (hits ? fmtMoney(num(c.amount) * hits) + (hits > 1 ? ' <span class="note">×' + hits + '</span>' : '') : '<span class="na">–</span>') + '</td>' +
          '<td><button class="btn sm" data-cost-edit="' + esc(c.id) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table>';

    host.querySelectorAll('[data-cost-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openCostForm(b.dataset.costEdit); });
    });
  }

  function openCostForm(id) {
    var c = id ? costList().filter(function (x) { return x.id === id; })[0] : null;
    var host = revealCard(document.getElementById('csCostForm'));
    host.classList.remove('hidden');

    var cats = CS.ENTRY_CATEGORY_KEYS.map(function (k) {
      return '<option value="' + k + '"' + (c && c.category === k ? ' selected' : (!c && k === 'INFRA' ? ' selected' : '')) + '>' +
        esc(CS.CATEGORIES[k].label) + '</option>';
    }).join('');
    var recs = Object.keys(CS.RECURRENCES).map(function (k) {
      return '<option value="' + k + '"' + (c && c.recurrence === k ? ' selected' : '') + '>' +
        esc(CS.RECURRENCES[k].label) + '</option>';
    }).join('');
    host.innerHTML = '<div class="event-form">' +
      '<div class="field"><label for="coDate">Date charged</label><input type="date" id="coDate" value="' + esc(c ? c.date : asOf()) + '"></div>' +
      '<div class="field"><label for="coCategory">Category</label><select id="coCategory">' + cats + '</select></div>' +
      '<div class="field grow"><label for="coLabel">What it was</label>' +
      '<input type="text" id="coLabel" maxlength="200" placeholder="Apple Developer Program" value="' + esc(c && c.label ? c.label : '') + '"></div>' +
      '<div class="field"><label for="coAmount">Amount</label><input type="number" id="coAmount" step="0.01" value="' + (c && c.amount !== undefined ? c.amount : '') + '"></div>' +
      '<div class="field"><label for="coRecurrence">Repeats</label><select id="coRecurrence">' + recs + '</select></div>' +
      '<div class="field"><label for="coUntil">Repeat until (blank = still paying)</label><input type="date" id="coUntil" value="' + esc(c && c.until ? c.until : '') + '"></div>' +
      '<div class="field full"><label for="coNote">Notes</label><textarea id="coNote" rows="2" maxlength="2000">' + esc(c && c.note ? c.note : '') + '</textarea></div>' +
      '<div class="event-form-actions">' +
      '<button class="btn primary" id="coSave">' + (c ? 'Save cost' : 'Add cost') + '</button>' +
      '<button class="btn" id="coCancel">Cancel</button>' +
      (c ? '<span class="spacer"></span><button class="btn danger" id="coDelete">Delete</button>' : '') +
      '</div></div>';

    document.getElementById('coCancel').addEventListener('click', closeCostForm);
    if (c) {
      document.getElementById('coDelete').addEventListener('click', function () {
        if (!confirm('Delete this ' + fmtMoney(c.amount) + ' cost?')) return;
        removeCost(c.id);
        closeCostForm();
        renderAll();
        toast('Cost deleted.');
      });
    }
    document.getElementById('coSave').addEventListener('click', function () {
      var date = document.getElementById('coDate').value;
      var amount = document.getElementById('coAmount').value;
      if (!date) { toast('A cost needs the date it was charged.'); return; }
      if (amount === '') { toast('A cost needs an amount.'); return; }
      var until = document.getElementById('coUntil').value;
      if (until && until < date) { toast('The repeat-until date is before the first charge.'); return; }
      var rec = document.getElementById('coRecurrence').value;
      putCost({
        id: c ? c.id : newId('co'),
        date: date,
        category: document.getElementById('coCategory').value,
        label: document.getElementById('coLabel').value.trim() || undefined,
        amount: Number(amount),
        recurrence: rec === 'none' ? undefined : rec,
        until: rec === 'none' || !until ? undefined : until,
        note: document.getElementById('coNote').value.trim() || undefined
      });
      closeCostForm();
      renderAll();
      toast(c ? 'Cost saved.' : 'Cost added.');
    });
    document.getElementById('coLabel').focus();
  }

  function closeCostForm() {
    var host = document.getElementById('csCostForm');
    host.classList.add('hidden');
    host.innerHTML = '';
  }

  /* --------------------------------------------------------------- csv */

  function csvLine(cols, row) {
    return cols.map(function (k) {
      var v = String(row[k] === undefined || row[k] === null ? '' : row[k]);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }

  /* Two exports, because there are two collections and folding an ad spot into
     a cost row would throw away the platform, the run window and the counts —
     the whole reason a spot is its own thing. */
  function costsCSV() {
    var cols = ['date', 'category', 'label', 'amount', 'recurrence', 'until', 'note'];
    var lines = [cols.join(',')];
    costList().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (c) {
      lines.push(csvLine(cols, {
        date: c.date, category: c.category, label: c.label || '', amount: num(c.amount),
        recurrence: c.recurrence || 'none', until: c.until || '', note: c.note || ''
      }));
    });
    return lines.join('\n');
  }

  function adsCSV() {
    var cols = ['start', 'end', 'name', 'platform', 'cost', 'impressions', 'clicks',
      'reported_installs', 'ctr', 'cost_per_click', 'url', 'note'];
    var lines = [cols.join(',')];
    CS.perAd(ads(), EVER.from, EVER.to).rows.slice().sort(function (a, b) {
      return a.start < b.start ? -1 : 1;
    }).forEach(function (r) {
      lines.push(csvLine(cols, {
        start: r.start, end: r.end || '', name: r.name, platform: r.platform,
        cost: r.spend, impressions: r.impressions || '', clicks: r.clicks || '',
        reported_installs: r.installs || '',
        ctr: r.ctr === null ? '' : r.ctr.toFixed(2),
        cost_per_click: r.cpc === null ? '' : r.cpc.toFixed(2),
        url: r.ad.url || '', note: r.ad.note || ''
      }));
    });
    return lines.join('\n');
  }

  /* ------------------------------------------------------------ wiring */

  /* A <summary> toggles its card when clicked, including when the click landed
     on a button inside it — so "New ad spot" would open the form and close the
     card it opens into. Cancelling the default keeps the button's own listener
     (preventDefault stops the toggle, not the propagation). */
  /* Opening a form inside a collapsed accordion would render it where nobody
     can see it, and the press would read as "nothing happened". */
  function revealCard(el) {
    var d = el && el.closest ? el.closest('details.acc') : null;
    if (d) d.open = true;
    return el;
  }

  function wireAccordions() {
    document.querySelectorAll('details.acc > summary').forEach(function (sum) {
      sum.addEventListener('click', function (ev) {
        if (ev.target.closest('button, input, select, a')) ev.preventDefault();
      });
    });
  }

  function wireCosts() {
    document.getElementById('csGoEdit').addEventListener('click', function () {
      setView('data');
      var head = revealCard(document.getElementById('csAdTable'));
      if (head) setTimeout(function () { head.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
    });
    document.getElementById('csAdAdd').addEventListener('click', function () {
      if (document.getElementById('csAdForm').innerHTML) closeAdForm(); else openAdForm(null);
    });
    document.getElementById('csCostAdd').addEventListener('click', function () {
      if (document.getElementById('csCostForm').innerHTML) closeCostForm(); else openCostForm(null);
    });
    document.getElementById('csExport').addEventListener('click', function () {
      download('autonomic-costs-' + today() + '.csv', costsCSV(), 'text/csv');
    });
    document.getElementById('csAdExport').addEventListener('click', function () {
      download('autonomic-ad-spots-' + today() + '.csv', adsCSV(), 'text/csv');
    });
  }

  function wireLinks() {
    var add = document.getElementById('lkAdd');
    if (add) add.addEventListener('click', function () {
      if (document.getElementById('lkForm').innerHTML) closeLinkForm(); else openLinkForm(null);
    });
    var again = document.getElementById('lkRepublish');
    if (again) again.addEventListener('click', republishLinks);
  }

  /* --------------------------------------------------------- view: data */

  function entryKey(date, plat) { return date + '|' + plat; }
  function findEntry(date, plat) {
    for (var i = 0; i < db.entries.length; i++) {
      if (db.entries[i].date === date && db.entries[i].platform === plat) return db.entries[i];
    }
    return null;
  }
  function upsert(rec) {
    var e = findEntry(rec.date, rec.platform);
    if (e) Object.assign(e, rec);
    else db.entries.push(rec);
    db.entries.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.platform < b.platform ? -1 : 1; });
    save(); invalidate();
  }

  /* The Data view is the bulk grid plus the single-day form — the grid is built
     once by wireBulk() and only rebuilt when the store changes underneath it,
     so switching tabs never discards half-typed rows. */
  function renderData() {
    if (!bulkRows.length) buildBulkGrid();
    renderSaleEntry();
    renderCostEntry();
    renderEventList();
    /* Permission can be revoked in the browser's own settings while the page
       is open, so the line is re-read on arrival rather than written once. */
    syncNotifyUI();
  }

  /* ------------------------------------------------------ view: forecast */

  /**
   * 'monthly' used to be the default, so every saved UI carries it whether or
   * not anyone chose it — and leaving those on a single-price model is exactly
   * the thing the ledger was added to fix. A model the user never pressed a
   * button for is upgraded to the mix once; `modelChosen` is stamped the moment
   * they do press one, so a deliberate "all monthly" is never overridden.
   */
  function fcModel() {
    var fc = state.fc || (state.fc = {});
    if (!fc.modelChosen && fc.model === 'monthly') fc.model = 'mix';
    return fc.model || 'mix';
  }
  function fcIsSub() { return fcModel() !== 'onetime'; }

  function renderForecastControls(a) {
    var host = document.getElementById('fcControls');
    var model = fcModel();
    host.innerHTML = FC_CONTROLS.filter(function (c) {
      if (c.subsOnly && !fcIsSub()) return false;
      if (c.only && c.only.indexOf(model) === -1) return false;
      return true;
    }).map(function (c) {
      var v = fcValue(c.key, a), act = fcActualFor(c.key, a);
      var min = c.min(a), max = c.max(a);
      if (v > max) max = Math.ceil(v);
      return '<div class="ctrl' + (fcIsOverridden(c.key) ? ' modified' : '') + '">' +
        '<div class="ctrl-head"><label for="fc_' + c.key + '">' + esc(c.label) + '</label>' +
        '<span class="ctrl-unit">' + esc(c.unit || '') + '</span>' +
        '<input class="ctrl-val" type="number" data-fc-num="' + c.key + '" step="' + c.step +
          '" value="' + (Math.round(v * 100) / 100) + '" aria-label="' + esc(c.label) + '">' +
        '</div>' +
        '<input type="range" id="fc_' + c.key + '" data-fc="' + c.key + '" min="' + min + '" max="' + max +
          '" step="' + c.step + '" value="' + v + '">' +
        '<div class="ctrl-foot">' +
          (c.note ? esc(c.note)
            : (c.derived && c.derived(a) ? esc(c.derived(a))
              : (c.needsSales && !a.hasSales ? 'no sales on record yet — assumption'
                : 'from your data: ' + c.fmt(act)))) +
          (fcIsOverridden(c.key) ? ' <button class="linkbtn" data-fc-reset="' + c.key + '">reset</button>' : '') +
        '</div></div>';
    }).join('');
  }

  function renderForecast(opts) {
    var sc = fcScenarios();
    var a = sc.actuals, exp = sc.expected, bear = sc.bear, bull = sc.bull;
    var model = fcModel(), months = sc.assume.months;
    var cur = db.settings.currency || '$';

    if (!(opts && opts.keepControls)) renderForecastControls(a);
    document.getElementById('fcLagNote').textContent = wallExit();
    document.getElementById('fcScope').textContent =
      labelFull(addDays(asOf(), 1)) + ' → ' + labelFull(fcEndDate()) +
      (fcPlatform() === 'all' ? '' : ' · ' + platName(fcPlatform()));
    ['fcHorizon', 'fcModel'].forEach(function (id) {
      var hostEl = document.getElementById(id);
      var want = id === 'fcHorizon' ? String(months) : model;
      Array.prototype.forEach.call(hostEl.children, function (c) {
        c.setAttribute('aria-pressed', c.dataset.v === want ? 'true' : 'false');
      });
    });

    var mrrLabel = model === 'onetime' ? 'Monthly revenue' : 'MRR';
    document.getElementById('fcMrrTitle').textContent = mrrLabel;
    document.getElementById('fcMrrHint').textContent = model === 'onetime'
      ? 'One-time purchases do not recur, so this is the revenue earned in each month rather than a recurring base.'
      : model === 'annual'
        ? 'Annual plans are shown as monthly recurring revenue — the yearly price spread across twelve months. Cash arrives a year at a time; the cumulative chart above shows both.'
        : model === 'mix'
          ? 'Recurring revenue at the end of each month, from both plans: an annual buyer contributes a twelfth of the yearly price each month, exactly like the Sales view. Monthly plans churn continuously; annual ones are only tested at their renewal, because someone who has paid for a year cannot leave in month three.'
          : 'Recurring revenue at the end of each month, after churn.';

    /* ---- tiles ---- */
    var rangeMeta = function (lo, hi, f) { return 'range ' + f(lo) + ' – ' + f(hi); };
    document.getElementById('fcTiles').innerHTML = [
      tile({
        label: mrrLabel + ' in ' + fcEndLabel(), color: ENTITY.revenue, value: fmtMoney(exp.endMrr),
        meta: rangeMeta(bear.endMrr, bull.endMrr, fmtMoney)
      }),
      tile({
        label: model === 'onetime' ? 'Annual run-rate' : 'ARR in ' + fcEndLabel(),
        color: ENTITY.revenue, value: fmtMoney(exp.endMrr * 12),
        meta: rangeMeta(bear.endMrr * 12, bull.endMrr * 12, fmtMoney)
      }),
      tile({
        label: 'Cash through ' + fcEndLabel(), color: ENTITY.sales, value: fmtMoney(exp.totalBookings),
        meta: rangeMeta(bear.totalBookings, bull.totalBookings, fmtMoney) +
          (model === 'onetime' ? '' : ' · ' + fmtMoney(exp.totalRevenue) + ' of it recognised in the window')
      }),
      tile({
        label: 'Cash, next 30 days', value: fmtMoney(exp.bookingsNext30), smallValue: true,
        meta: rangeMeta(bear.bookingsNext30, bull.bookingsNext30, fmtMoney)
      }),
      tile({
        label: (model === 'onetime' ? 'Buyers in ' : 'Paying users in ') + fcEndLabel(),
        color: ENTITY.trialEnd, value: fmtInt(model === 'onetime' ? a.payers + exp.totalConv : exp.endPayers),
        meta: model === 'onetime'
          ? 'starting from ' + fmtInt(a.payers) + ' today'
          : rangeMeta(bear.endPayers, bull.endPayers, fmtInt) + ' · from ' +
            fmtInt(a.startMonthly + a.startAnnual) + ' on the books today',
        split: model === 'mix' ? [
          { name: 'Monthly', color: planColor('monthly'), value: fmtInt(exp.endMonthly) },
          { name: 'Annual', color: planColor('annual'), value: fmtInt(exp.endAnnual) }
        ] : null
      }),
      tile({
        label: 'New installs through ' + fcEndLabel(), color: ENTITY.downloads, value: fmtInt(exp.totalInstalls),
        meta: rangeMeta(bear.totalInstalls, bull.totalInstalls, fmtInt)
      }),
      tile({
        label: 'New conversions', color: ENTITY.wallHit, value: fmtInt(exp.totalConv),
        meta: rangeMeta(bear.totalConv, bull.totalConv, fmtInt)
      }),
      tile({
        label: 'Revenue per install', value: fmtMoney(exp.totalInstalls ? exp.totalRevenue / exp.totalInstalls : 0),
        smallValue: true, meta: 'over the whole forecast window'
      })
    ].join('');

    /* ---- charts ---- */
    var x = exp.months.map(function (m) { return bucketLabel(m.key, 'month'); });
    var pick = function (run, field) { return run.months.map(function (m) { return m[field]; }); };
    var moneyTick = function (v) { return cur + Chart.fmtCompact(v); };

    function bandChart(id, field, fmt, tickFmt) {
      drawChart(id, {
        x: x, height: id === 'fcRevenue' ? 340 : 260, format: fmt, xLabel: 'Month',
        yTickFormat: tickFmt,
        series: [
          { key: 'band', name: 'Bear – optimistic', color: ENTITY.revenue, type: 'band',
            values: pick(bull, field), base: pick(bear, field), format: fmt },
          { key: 'exp', name: 'Expected', color: ENTITY.downloads, type: 'line',
            values: pick(exp, field), format: fmt }
        ]
      });
    }
    bandChart('fcRevenue', 'cumRevenue', fmtMoney, moneyTick);
    /* Cash rides on the revenue chart rather than getting a card of its own:
       the two are the same quantity counted at different moments, and the gap
       between them only means anything when you can see both at once. */
    if (model !== 'onetime') {
      var cfg = chartCfgs.fcRevenue;
      cfg.series.push({
        key: 'cash', name: 'Cash collected', color: ENTITY.sales, type: 'line', dashed: true,
        values: pick(exp, 'cumBookings'), format: fmtMoney
      });
      drawChart('fcRevenue', cfg);
    }
    bandChart('fcMrr', 'mrr', fmtMoney, moneyTick);
    bandChart('fcPayers', 'payers', fmtInt);

    drawChart('fcInstalls', {
      x: x, height: 260, format: fmtInt,
      series: [{ key: 'inst', name: 'New installs', color: ENTITY.downloads, type: 'bar', values: pick(exp, 'installs') }]
    });
    drawChart('fcConv', {
      x: x, height: 260, format: fmtInt,
      series: [{ key: 'conv', name: 'New paying users', color: ENTITY.sales, type: 'bar', values: pick(exp, 'conv') }]
    });

    /* ---- month table ---- */
    var head = '<tr><th>Month</th><th>New installs</th><th>New paying</th>' +
      (model === 'mix' ? '<th>New monthly</th><th>New annual</th>' : '') +
      '<th>' + (fcIsSub() ? 'Paying users' : 'Buyers') + '</th><th>' + esc(mrrLabel) + '</th>' +
      '<th>Recognised</th><th>Cash in</th><th>Cumulative cash</th><th>Range (cumulative)</th></tr>';
    var body = exp.months.map(function (m, i) {
      return '<tr><td>' + bucketLabel(m.key, 'month').full + '</td>' +
        '<td>' + fmtInt(m.installs) + '</td>' +
        '<td>' + fmtInt(m.conv) + '</td>' +
        (model === 'mix' ? '<td>' + fmtInt(m.newMonthly) + '</td><td>' + fmtInt(m.newAnnual) + '</td>' : '') +
        '<td>' + fmtInt(m.payers) + '</td>' +
        '<td>' + fmtMoney(m.mrr) + '</td>' +
        '<td>' + fmtMoney(m.revenue) + '</td>' +
        '<td>' + fmtMoney(m.bookings) + '</td>' +
        '<td>' + fmtMoney(m.cumBookings) + '</td>' +
        '<td>' + fmtMoney(bear.months[i] ? bear.months[i].cumRevenue : 0) + ' – ' +
          fmtMoney(bull.months[i] ? bull.months[i].cumRevenue : 0) + '</td></tr>';
    }).join('');
    document.getElementById('fcTable').innerHTML =
      '<div class="table-scroll full"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';

    return sc;
  }

  function fcExportText() {
    var sc = fcScenarios(), exp = sc.expected, bear = sc.bear, bull = sc.bull;
    var o = sc.assume, model = fcModel();
    var L = [];
    L.push('# Autonomic — forecast');
    L.push('Base date: ' + labelFull(asOf()) + ' · through ' + fcEndLabel() + ' · ' +
      (model === 'onetime' ? 'one-time purchase'
        : model === 'annual' ? 'annual subscription only'
        : model === 'monthly' ? 'monthly subscription only'
        : 'plan mix — monthly and annual'));
    L.push('Platform: ' + (o.platform === 'all' ? 'combined' : platName(o.platform)));
    L.push('');
    L.push('## Assumptions (expected case)');
    L.push('New installs/day        ' + fmtInt(o.installs));
    L.push('Install growth/month    ' + (o.growth * 100).toFixed(1) + '%');
    L.push('Convert rate at wall    ' + (o.conv * 100).toFixed(2) + '%');
    if (model === 'onetime') {
      L.push('Price per buyer         ' + fmtMoney(o.price));
    } else {
      if (model !== 'annual') L.push('Monthly plan price      ' + fmtMoney(o.monthlyPrice));
      if (model !== 'monthly') L.push('Annual plan price       ' + fmtMoney(o.annualPrice));
      if (model === 'mix') L.push('Choose annual           ' + (o.annualShare * 100).toFixed(0) + '%');
      L.push('Monthly churn           ' + (o.churn * 100).toFixed(2) + '%');
      L.push('Starting monthly subs   ' + fmtInt(o.startMonthly));
      L.push('Starting annual subs    ' + fmtInt(o.startAnnual));
    }
    L.push('Scenario spread         ±' + fcValue('spread', sc.actuals) + '%');
    L.push('');
    L.push('## Outcome by ' + fcEndLabel() + ' (bear / expected / optimistic)');
    L.push((model === 'onetime' ? 'Monthly revenue  ' : 'MRR              ') +
      fmtMoney(bear.endMrr) + ' / ' + fmtMoney(exp.endMrr) + ' / ' + fmtMoney(bull.endMrr));
    L.push('ARR              ' + fmtMoney(bear.endMrr * 12) + ' / ' + fmtMoney(exp.endMrr * 12) + ' / ' + fmtMoney(bull.endMrr * 12));
    L.push('Cash collected   ' + fmtMoney(bear.totalBookings) + ' / ' + fmtMoney(exp.totalBookings) + ' / ' + fmtMoney(bull.totalBookings));
    L.push('Recognised rev   ' + fmtMoney(bear.totalRevenue) + ' / ' + fmtMoney(exp.totalRevenue) + ' / ' + fmtMoney(bull.totalRevenue));
    L.push('Paying users     ' + fmtInt(bear.endPayers) + ' / ' + fmtInt(exp.endPayers) + ' / ' + fmtInt(bull.endPayers));
    L.push('New installs     ' + fmtInt(bear.totalInstalls) + ' / ' + fmtInt(exp.totalInstalls) + ' / ' + fmtInt(bull.totalInstalls));
    L.push('New conversions  ' + fmtInt(bear.totalConv) + ' / ' + fmtInt(exp.totalConv) + ' / ' + fmtInt(bull.totalConv));
    L.push('');
    L.push('## Month by month (expected)');
    L.push(pad2('month', 12) + padL('installs', 10) + padL('new paying', 12) +
      padL('paying', 9) + padL('mrr', 12) + padL('recognised', 12) + padL('cash in', 12) +
      padL('cum cash', 13));
    exp.months.forEach(function (m) {
      L.push(pad2(m.key.slice(0, 7), 12) + padL(fmtInt(m.installs), 10) + padL(fmtInt(m.conv), 12) +
        padL(fmtInt(m.payers), 9) + padL(fmtMoney(m.mrr), 12) + padL(fmtMoney(m.revenue), 12) +
        padL(fmtMoney(m.bookings), 12) + padL(fmtMoney(m.cumBookings), 13));
    });
    return L.join('\n');
  }

  function wireForecast() {
    var host = document.getElementById('fcControls');
    host.addEventListener('input', function (ev) {
      var slider = ev.target.closest('input[data-fc]');
      var box = ev.target.closest('input[data-fc-num]');
      var key = slider ? slider.dataset.fc : box ? box.dataset.fcNum : null;
      if (!key) return;
      var v = +ev.target.value;
      if (isNaN(v)) return;
      state.fc = state.fc || {};
      state.fc[key] = v;
      saveUI();
      // mirror the value into the sibling control without rebuilding the grid,
      // which would yank the slider out from under the pointer mid-drag
      var ctrl = ev.target.closest('.ctrl');
      if (ctrl) {
        ctrl.classList.add('modified');
        var other = slider ? ctrl.querySelector('input[data-fc-num]') : ctrl.querySelector('input[data-fc]');
        if (other && other !== document.activeElement) other.value = Math.round(v * 100) / 100;
      }
      renderForecast({ keepControls: true });
    });

    // once the drag or edit finishes it is safe to rebuild (new max, reset link)
    host.addEventListener('change', function (ev) {
      if (ev.target.closest('input[data-fc], input[data-fc-num]')) renderForecast();
    });

    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-fc-reset]');
      if (!b) return;
      if (state.fc) state.fc[b.dataset.fcReset] = null;
      saveUI();
      renderForecast();
    });

    document.body.addEventListener('click', function (ev) {
      var b = ev.target.closest('#fcHorizon button, #fcModel button');
      if (!b) return;
      state.fc = state.fc || {};
      state.fc[b.parentElement.id === 'fcHorizon' ? 'horizon' : 'model'] =
        b.parentElement.id === 'fcHorizon' ? +b.dataset.v : b.dataset.v;
      if (b.parentElement.id === 'fcModel') state.fc.modelChosen = true;
      saveUI();
      renderForecast();
    });

    document.getElementById('fcReset').addEventListener('click', function () {
      state.fc = { horizon: (state.fc && state.fc.horizon) || 12, model: fcModel() };
      saveUI();
      renderForecast();
      toast('Assumptions reset to the values derived from your data.');
    });

    document.getElementById('fcExport').addEventListener('click', function () {
      copyText(fcExportText())
        .then(function () { toast('Forecast copied to the clipboard.'); })
        .catch(function () { toast('Could not reach the clipboard — check the browser permission.'); });
    });
  }

  /* ---------------------------------------------------- bulk entry grid */

  var BULK_COLS = [
    { f: 'downloads', label: 'Downloads' },
    { f: 'impressions', label: 'Impressions' },
    { f: 'pageViews', label: 'Page views' },
    { f: 'updates', label: 'Updates' },
    { f: 'notes', label: 'Note', text: true }
  ];
  var MAX_BULK_ROWS = 400;
  var bulkRows = [];        // [{date, platform, existing}]
  var lastBulkCell = null;  // {r, c} — where "fill down" starts

  function bulkPlatforms() {
    var v = document.getElementById('bPlatform').value;
    return v === 'both' ? ['ios', 'android'] : [v];
  }

  function buildBulkGrid() {
    var from = document.getElementById('bFrom').value;
    var to = document.getElementById('bTo').value;
    if (!from || !to) { toast('Pick a from and to date.'); return; }
    if (from > to) { var t = from; from = to; to = t;
      document.getElementById('bFrom').value = from; document.getElementById('bTo').value = to; }

    var plats = bulkPlatforms();
    bulkRows = [];
    var truncated = false;
    for (var d = from; d <= to; d = addDays(d, 1)) {
      for (var i = 0; i < plats.length; i++) {
        if (bulkRows.length >= MAX_BULK_ROWS) { truncated = true; break; }
        bulkRows.push({ date: d, platform: plats[i], existing: !!findEntry(d, plats[i]) });
      }
      if (truncated) break;
    }
    lastBulkCell = null;

    var head = '<tr><th>Date</th><th style="text-align:left">Platform</th>' +
      BULK_COLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '<th></th></tr>';

    var body = bulkRows.map(function (row, r) {
      var e = findEntry(row.date, row.platform) || {};
      return '<tr' + (row.existing ? ' class="existing"' : '') + '>' +
        '<td>' + labelFull(row.date) + '</td>' +
        '<td style="text-align:left"><span class="pill ' + row.platform + '">' + PLATFORMS[row.platform] + '</span></td>' +
        BULK_COLS.map(function (c, ci) {
          var v = e[c.f];
          v = (v === null || v === undefined || v === '') ? '' : v;
          return '<td>' + (c.text
            ? '<input type="text" class="note-cell" data-r="' + r + '" data-c="' + ci + '" value="' + esc(v) + '">'
            : '<input type="number" step="any" min="0" data-r="' + r + '" data-c="' + ci + '" value="' + esc(v) + '">') + '</td>';
        }).join('') +
        '<td>' + (row.existing
          ? '<button class="btn sm danger" data-del="' + entryKey(row.date, row.platform) + '">Delete</button>'
          : '') + '</td></tr>';
    }).join('');

    document.getElementById('bulkGrid').innerHTML = bulkRows.length
      ? '<div class="table-scroll"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      : '<div class="empty">That range produced no rows.</div>';

    var already = bulkRows.filter(function (x) { return x.existing; }).length;
    document.getElementById('bulkCount').textContent =
      bulkRows.length + ' rows' + (already ? ' · ' + already + ' already have data (marked •)' : '') +
      (truncated ? ' · capped at ' + MAX_BULK_ROWS : '');
    document.getElementById('bStatus').textContent = '';
  }

  function bulkCell(r, c) {
    return document.querySelector('#bulkGrid input[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function bulkPaste(ev) {
    var input = ev.target.closest('input[data-r]');
    if (!input) return;
    var text = (ev.clipboardData || window.clipboardData).getData('text');
    if (!text) return;
    // a single plain value: let the browser handle it normally
    if (!/[\t\n\r]/.test(text) && text.indexOf(',') === -1) return;
    ev.preventDefault();

    var lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    var sep = text.indexOf('\t') !== -1 ? '\t' : ',';
    var r0 = +input.dataset.r, c0 = +input.dataset.c, filled = 0;

    lines.forEach(function (line, dr) {
      line.split(sep).forEach(function (cell, dc) {
        var el = bulkCell(r0 + dr, c0 + dc);
        if (!el) return;
        var val = cell.trim().replace(/^"|"$/g, '');
        el.value = el.type === 'number' ? (val === '' ? '' : String(cleanNum(val))) : val;
        el.classList.add('dirty');
        filled++;
      });
    });
    document.getElementById('bStatus').textContent = 'Pasted ' + filled + ' cells — not saved yet.';
  }

  function bulkFillDown() {
    var cols = lastBulkCell ? [lastBulkCell.c] : BULK_COLS.map(function (c, i) { return i; });
    var startR = lastBulkCell ? lastBulkCell.r : 0;
    var n = 0;
    cols.forEach(function (c) {
      var src = bulkCell(startR, c);
      if (!src || src.value === '') return;
      for (var r = startR + 1; r < bulkRows.length; r++) {
        var el = bulkCell(r, c);
        if (!el) continue;
        el.value = src.value;
        el.classList.add('dirty');
        n++;
      }
    });
    document.getElementById('bStatus').textContent = n
      ? 'Filled ' + n + ' cells down' + (lastBulkCell ? ' from the selected cell' : ' from the first row') + ' — not saved yet.'
      : 'Nothing to fill down — put a value in a cell first.';
  }

  function bulkSave() {
    if (!bulkRows.length) { toast('Build a grid first.'); return; }
    var saved = 0, skipped = 0;
    bulkRows.forEach(function (row, r) {
      var rec = { date: row.date, platform: row.platform };
      var any = false;
      BULK_COLS.forEach(function (c, ci) {
        var el = bulkCell(r, ci);
        var raw = el ? el.value.trim() : '';
        if (raw !== '') any = true;
        if (c.text) rec.notes = raw;
        else rec[c.f] = raw === '' ? 0 : cleanNum(raw);
      });
      // a row left completely blank is not an entry — don't create an empty day
      if (!any && !row.existing) { skipped++; return; }
      if (!any && row.existing) { skipped++; return; }
      upsertQuiet(rec);
      saved++;
    });
    finishBulk();
    toast('Saved ' + saved + ' days.');
    buildBulkGrid();   // rebuild first — it resets the status line
    document.getElementById('bStatus').textContent =
      'Saved ' + saved + ' rows' + (skipped ? ' · ' + skipped + ' blank rows skipped' : '') + '.';
    renderData();
  }

  /* the grid caches entry values, so rebuild it after anything that rewrites the store */
  function refreshBulk() { if (bulkRows.length) buildBulkGrid(); }

  function wireBulk() {
    var end = asOf();
    document.getElementById('bTo').value = end;
    document.getElementById('bFrom').value = addDays(end, -6);

    document.getElementById('bBuild').addEventListener('click', buildBulkGrid);
    document.getElementById('bPlatform').addEventListener('change', buildBulkGrid);
    ['bFrom', 'bTo'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', buildBulkGrid);
    });
    document.getElementById('bSave').addEventListener('click', bulkSave);
    document.getElementById('bFillDown').addEventListener('click', bulkFillDown);
    document.getElementById('bClearVals').addEventListener('click', function () {
      document.querySelectorAll('#bulkGrid input[data-r]').forEach(function (el) {
        el.value = ''; el.classList.remove('dirty');
      });
      document.getElementById('bStatus').textContent = 'Grid cleared — nothing saved yet.';
    });

    var grid = document.getElementById('bulkGrid');
    grid.addEventListener('paste', bulkPaste);
    grid.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-del]');
      if (!b) return;
      var parts = b.dataset.del.split('|');
      if (!confirm('Delete the ' + PLATFORMS[parts[1]] + ' entry for ' + labelFull(parts[0]) + '?')) return;
      db.entries = db.entries.filter(function (e) { return !(e.date === parts[0] && e.platform === parts[1]); });
      save(); invalidate();
      buildBulkGrid();
      document.getElementById('bStatus').textContent = 'Deleted ' + labelFull(parts[0]) + ' · ' + PLATFORMS[parts[1]] + '.';
      toast('Entry deleted.');
    });
    grid.addEventListener('focusin', function (ev) {
      var i = ev.target.closest('input[data-r]');
      if (i) lastBulkCell = { r: +i.dataset.r, c: +i.dataset.c };
    });
    grid.addEventListener('input', function (ev) {
      var i = ev.target.closest('input[data-r]');
      if (i) i.classList.add('dirty');
    });
    grid.addEventListener('keydown', function (ev) {
      var i = ev.target.closest('input[data-r]');
      if (!i) return;
      var r = +i.dataset.r, c = +i.dataset.c, next = null;
      if (ev.key === 'Enter' || ev.key === 'ArrowDown') next = bulkCell(r + 1, c);
      else if (ev.key === 'ArrowUp') next = bulkCell(r - 1, c);
      else return;
      ev.preventDefault();
      if (next) { next.focus(); next.select(); }
    });

    buildBulkGrid();
  }

  /* ==================================================================== forecast

     The model is a daily simulation rather than a monthly one, because the trial
     lag matters: conversions in the first `wallExit` days of the forecast come
     from installs that have ALREADY happened, so the near term is grounded in
     recorded data instead of projected. */

  var DPM = 30.4375;                      // days per average month
  var FC_WINDOW = 28;                     // lookback used to derive the defaults

  /* which platform the forecast runs on — compare mode has no single answer, so combined */
  function fcPlatform() { var k = platKeys(); return k.length === 1 ? k[0] : 'all'; }

  /* Run through the END of the month `months` ahead, so the final bucket is a whole
     month rather than a stub bar. Only the first month is partial. */
  function fcHorizonMonths() { return (state.fc && +state.fc.horizon) || 12; }
  function fcEndDate() {
    var d = parseISO(asOf());
    d.setMonth(d.getMonth() + fcHorizonMonths() + 1, 0);   // day 0 of the next month = last day
    return toISO(d);
  }
  function fcEndLabel() { return labelMonth(fcEndDate()); }

  /* Assumption defaults read straight off the data. */
  function fcActuals() {
    var p = fcPlatform(), end = asOf(), b = base();
    var recent = summarize(p, addDays(end, -(FC_WINDOW - 1)), end);
    var prior = summarize(p, addDays(end, -(2 * FC_WINDOW - 1)), addDays(end, -FC_WINDOW));
    var all = summarize(p, b.dates.length ? b.start : end, end);

    /* Average over the days actually covered by data, not a flat 28 — otherwise a
       brand-new dataset (say one day with 30 installs) reads as ~1/day. */
    var covered = b.dates.length ? Math.min(FC_WINDOW, diffDays(b.start, end) + 1) : FC_WINDOW;
    covered = Math.max(1, covered);
    var priorCovered = b.dates.length
      ? Math.max(0, Math.min(FC_WINDOW, diffDays(b.start, addDays(end, -FC_WINDOW)) + 1)) : 0;

    /* Growth needs a real prior window to compare against; with a week or less of
       history the ratio is noise, so stay flat rather than invent a trend. */
    var growth = 0;
    if (priorCovered >= 7 && prior.downloads > 0 && recent.downloads > 0) {
      growth = Math.pow((recent.downloads / covered) / (prior.downloads / priorCovered), DPM / FC_WINDOW) - 1;
      growth = Math.max(-0.5, Math.min(1, growth));
    }
    var hasSales = all.totalSales > 0;

    /* Plan-level defaults come from the LEDGER, not from `all.arppu`: an
       average across a monthly and an annual sale is a price nobody paid, and
       feeding it to a model that then divides by twelve is how an annual-heavy
       book forecasts a twelfth of its real MRR. `basis` returns null for
       anything it has not seen enough of, and null is what makes the slider
       say "assumption" instead of "from your data". */
    var six = Sales.forecastBasis(salesIndex(), addDays(end, -179), end);
    var live = Sales.summarize(salesIndex(), addDays(end, -(FC_WINDOW - 1)), end);

    return {
      installs: recent.downloads / covered,
      growth: growth * 100,
      conv: hasSales && all.convOfWall ? all.convOfWall : 3,
      /* Kept for the one-time model and for anything still reading a single
         price. The mix model never uses it. */
      price: hasSales && all.arppu ? all.arppu : 4.99,
      monthlyPrice: six.monthlyPrice === null ? 4.99 : six.monthlyPrice,
      annualPrice: six.annualPrice === null ? 39.99 : six.annualPrice,
      annualShare: six.annualShare === null ? 25 : six.annualShare,
      churn: six.churnPct,
      payers: all.totalSales,
      /* The book the forecast starts from, split by plan, so month one opens
         at the MRR you actually have rather than at payers × one price. */
      startMonthly: live.activeByPlan.monthly.count,
      startAnnual: live.activeByPlan.annual.count,
      startMrr: live.mrr,
      hasSales: hasSales,
      hasPlans: six.units > 0,
      unknownSales: six.unknownCount,
      platform: p
    };
  }

  var FC_CONTROLS = [
    { key: 'installs', label: 'New installs / day', step: 1, fmt: function (v) { return fmtInt(v); },
      min: function () { return 0; },
      max: function (a) { return Math.max(250, Math.ceil(a.installs * 5 / 50) * 50); } },
    { key: 'growth', label: 'Install growth / month', step: 0.5, fmt: function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; },
      min: function () { return -50; }, max: function () { return 100; } },
    { key: 'conv', needsSales: true, label: 'Convert rate at the wall', step: 0.05, fmt: function (v) { return v.toFixed(2) + '%'; },
      min: function () { return 0; },
      max: function (a) { return Math.max(40, Math.ceil(a.conv * 3)); } },
    { key: 'price', needsSales: true, label: 'Price per paying user', step: 0.5, fmt: fmtMoney,
      only: ['onetime'],
      min: function () { return 0; },
      max: function (a) { return Math.max(100, Math.ceil(a.price * 4)); } },
    { key: 'monthlyPrice', label: 'Monthly plan price', step: 0.5, fmt: fmtMoney,
      only: ['mix', 'monthly'],
      min: function () { return 0; },
      max: function (a) { return Math.max(50, Math.ceil(a.monthlyPrice * 4)); },
      derived: function (a) { return a.hasPlans ? null : 'no monthly plan sold yet — assumption'; } },
    { key: 'annualPrice', label: 'Annual plan price', step: 1, fmt: fmtMoney,
      only: ['mix', 'annual'],
      min: function () { return 0; },
      max: function (a) { return Math.max(200, Math.ceil(a.annualPrice * 4)); },
      derived: function (a) { return a.hasPlans ? null : 'no annual plan sold yet — assumption'; } },
    /* The lever that makes this forecast different from the old one. An annual
       buyer is worth twelve months of cash today and the same MRR as a monthly
       buyer, so moving this changes the cash curve steeply and the MRR curve
       not at all — which is exactly the trade the number is there to show. */
    { key: 'annualShare', label: 'Share who choose annual', step: 1,
      fmt: function (v) { return v.toFixed(0) + '%'; },
      only: ['mix'],
      min: function () { return 0; }, max: function () { return 100; },
      derived: function (a) { return a.hasPlans ? null : 'nothing recurring sold yet — assumption'; } },
    { key: 'churn', label: 'Monthly churn', step: 0.25, fmt: function (v) { return v.toFixed(2) + '%'; },
      min: function () { return 0; }, max: function () { return 40; }, subsOnly: true,
      derived: function (a) {
        return a.churn === null ? 'nothing marked cancelled yet — assumption' : null;
      } },
    { key: 'spread', label: 'Scenario spread', step: 5, fmt: function (v) { return '±' + v.toFixed(0) + '%'; },
      min: function () { return 5; }, max: function () { return 80; },
      note: 'width of the bear / optimistic band' }
  ];
  /* What a control falls back to when the data cannot answer it. `churn` is
     here rather than on the actuals because a measured 0% and an unmeasurable
     one are different claims, and only the second may be replaced by 5. */
  var FC_FALLBACK = { spread: 35 };
  var FC_ASSUMED = { churn: 5 };

  /* a control's live value: the user's override if set, else the derived actual */
  function fcValue(key, a) {
    var v = state.fc && state.fc[key];
    if (v !== null && v !== undefined && !isNaN(v)) return +v;
    if (key in FC_FALLBACK) return FC_FALLBACK[key];
    var actual = a[key];
    if (actual === null || actual === undefined || isNaN(actual)) return FC_ASSUMED[key] || 0;
    return actual;
  }
  function fcIsOverridden(key) {
    var v = state.fc && state.fc[key];
    return v !== null && v !== undefined && !isNaN(v);
  }
  function fcActualFor(key, a) {
    if (key in FC_FALLBACK) return FC_FALLBACK[key];
    var v = a[key];
    return (v === null || v === undefined || isNaN(v)) ? (FC_ASSUMED[key] || 0) : v;
  }

  /**
   * One scenario run. Returns per-calendar-month rollups plus end-state totals.
   *
   * The two pools are the point. A monthly buyer and an annual buyer are the
   * same MRR at the same price per month and completely different CASH: the
   * annual one pays twelve months up front and then nothing until the plan
   * renews. Running them as one pool with one average price — which is what
   * this model did while sales were a daily total — gets both curves wrong in
   * opposite directions the moment the mix is not what the average assumed.
   *
   * `revenue` is recognised revenue, the month's share of what was sold.
   * `bookings` is cash. They differ by the annual book, and both are reported
   * rather than one of them being called "revenue" and left to be misread.
   */
  function fcRun(o) {
    var days = o.days;
    var gDaily = Math.pow(1 + o.growth, 1 / DPM) - 1;
    var churnDaily = o.model === 'onetime' ? 0 : 1 - Math.pow(1 - o.churn, 1 / DPM);
    var lag = wallExit();
    var start = asOf();

    /* Annual plans churn on the renewal, not continuously — someone who has
       paid for a year cannot leave in month three however unhappy they are, and
       applying a monthly churn to them understates MRR for eleven months out of
       twelve. They are held whole and tested once a year instead. */
    var annualRenewal = Math.pow(1 - o.churn, 12);

    var installs = new Array(days + 1);
    for (var t = 1; t <= days; t++) installs[t] = o.installs * Math.pow(1 + gDaily, t);

    var share = o.model === 'mix' ? o.annualShare
      : o.model === 'annual' ? 1
      : 0;                                    // monthly and one-time buy no annual plans
    var monthlyPrice = o.monthlyPrice;
    var annualPrice = o.annualPrice;

    var moPayers = o.model === 'onetime' ? 0 : o.startMonthly;
    var anPayers = o.model === 'onetime' ? 0 : o.startAnnual;
    /* Annual cohorts, by the day they were bought, so each can renew (or not)
       exactly a year later instead of decaying every day. */
    var anCohorts = [];

    var months = {}, order = [];
    var cumRev = 0, cumBook = 0, totInstalls = 0, totConv = 0, rev30 = 0, book30 = 0;

    for (var t2 = 1; t2 <= days; t2++) {
      var date = addDays(start, t2);
      var srcT = t2 - lag;
      // before the lag is up, the cohort hitting the wall is one we already recorded
      var wall = srcT >= 1 ? installs[srcT] : dayRec(o.platform, addDays(start, srcT)).downloads;
      var conv = wall * o.conv;
      var newAnnual = conv * share;
      var newMonthly = conv - newAnnual;

      var bookings = 0;
      if (o.model === 'onetime') {
        bookings = conv * o.price;
      } else {
        moPayers = moPayers * (1 - churnDaily) + newMonthly;
        anPayers += newAnnual;
        anCohorts.push({ day: t2, n: newAnnual });
        bookings = newMonthly * monthlyPrice + newAnnual * annualPrice;
        /* A year on, an annual cohort renews at whatever survives the annual
           churn, and the renewal is cash again. */
        for (var ci = 0; ci < anCohorts.length; ci++) {
          var c = anCohorts[ci];
          if (t2 - c.day === 365) {
            var kept = c.n * annualRenewal;
            anPayers -= (c.n - kept);
            bookings += kept * annualPrice;
            c.n = kept;
            c.day = t2;
          }
        }
      }

      var mrr = o.model === 'onetime' ? 0
        : moPayers * monthlyPrice + anPayers * (annualPrice / 12);
      /* Recognised revenue for the day: a twelfth of a month of MRR-worth. */
      var rev = o.model === 'onetime' ? conv * o.price : mrr / DPM;

      cumRev += rev; cumBook += bookings;
      totInstalls += installs[t2]; totConv += conv;
      if (t2 <= 30) { rev30 += rev; book30 += bookings; }

      var key = monthStart(date);
      var m = months[key];
      if (!m) { m = months[key] = { key: key, installs: 0, conv: 0, revenue: 0, bookings: 0, newAnnual: 0, newMonthly: 0 }; order.push(m); }
      m.installs += installs[t2];
      m.conv += conv;
      m.revenue += rev;
      m.bookings += bookings;
      m.newAnnual += newAnnual;
      m.newMonthly += newMonthly;
      m.payers = moPayers + anPayers;
      m.monthlyPayers = moPayers;
      m.annualPayers = anPayers;
      m.cumRevenue = cumRev;
      m.cumBookings = cumBook;
      m.mrr = o.model === 'onetime' ? m.revenue : mrr;
    }

    return {
      months: order,
      endPayers: moPayers + anPayers,
      endMonthly: moPayers,
      endAnnual: anPayers,
      endMrr: order.length ? order[order.length - 1].mrr : 0,
      totalRevenue: cumRev,
      totalBookings: cumBook,
      totalInstalls: totInstalls,
      totalConv: totConv,
      revenueNext30: rev30,
      bookingsNext30: book30
    };
  }

  /* Expected / bear / optimistic from one set of assumptions. */
  function fcScenarios() {
    var a = fcActuals();
    var f = fcValue('spread', a) / 100;
    var model = fcModel();
    var months = (state.fc && +state.fc.horizon) || 12;
    var o = {
      months: months, days: diffDays(asOf(), fcEndDate()), model: model,
      platform: a.platform,
      startPayers: a.payers, startMonthly: a.startMonthly, startAnnual: a.startAnnual,
      installs: fcValue('installs', a),
      growth: fcValue('growth', a) / 100,
      conv: fcValue('conv', a) / 100,
      price: fcValue('price', a),
      monthlyPrice: fcValue('monthlyPrice', a),
      annualPrice: fcValue('annualPrice', a),
      annualShare: fcValue('annualShare', a) / 100,
      churn: fcValue('churn', a) / 100
    };
    function variant(dir) {   // dir = -1 bear, +1 optimistic
      /* Conversion is the lever this dashboard exists to move, so it takes the full
         spread. Growth compounds over the whole horizon, so it gets a much smaller
         swing — at full spread it would dominate everything else and produce a band
         too wide to be worth reading. */
      return {
        months: o.months, days: o.days, model: o.model, platform: o.platform,
        startPayers: o.startPayers, startMonthly: o.startMonthly, startAnnual: o.startAnnual,
        installs: Math.max(0, o.installs * (1 + dir * f / 3)),
        growth: o.growth + dir * f / 8,
        conv: Math.max(0, o.conv * (1 + dir * f)),
        price: o.price,
        monthlyPrice: o.monthlyPrice,
        annualPrice: o.annualPrice,
        /* Price and mix are NOT scenario levers. They are decisions, not
           outcomes: you know what you charge and roughly who picks what, and
           swinging them alongside conversion would widen the band with
           uncertainty that is not actually there. */
        annualShare: o.annualShare,
        churn: Math.max(0, o.churn * (1 - dir * f / 2))
      };
    }
    return { assume: o, actuals: a, expected: fcRun(o), bear: fcRun(variant(-1)), bull: fcRun(variant(1)) };
  }

  /* ------------------------------------------------- export as a text prompt */

  function monthsBack(iso, k) {
    var d = parseISO(iso), day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() - k);
    // clamp to the end of the shorter month (Mar 31 - 1 month = Feb 28/29)
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISO(d);
  }
  function yearsBack(iso, k) {
    var d = parseISO(iso);
    d.setFullYear(d.getFullYear() - k);
    return toISO(d);
  }

  /* the window the export covers, always ending on the newest reportable day */
  function exportRange() {
    var to = asOf(), n = Math.max(1, Math.round(num(state.exportN) || 1)), from;
    if (state.exportUnit === 'weeks') from = addDays(to, -(7 * n - 1));
    else if (state.exportUnit === 'months') from = addDays(monthsBack(to, n), 1);
    else if (state.exportUnit === 'years') from = addDays(yearsBack(to, n), 1);
    else from = addDays(to, -(n - 1));
    var b = base();
    if (b.dates.length && from < b.start) from = b.start;
    return { from: from, to: to };
  }

  function exportScopeText() {
    var n = Math.max(1, Math.round(num(state.exportN) || 1));
    var unit = state.exportUnit === 'weeks' ? 'week' : state.exportUnit === 'months' ? 'month'
      : state.exportUnit === 'years' ? 'year' : 'day';
    return n + ' ' + unit + (n === 1 ? '' : 's');
  }

  function pad2(s, w) { s = String(s); return s.length >= w ? s : s + new Array(w - s.length + 1).join(' '); }
  function padL(s, w) { s = String(s); return s.length >= w ? s : new Array(w - s.length + 1).join(' ') + s; }

  function buildExportText() {
    var r = exportRange();
    var days = diffDays(r.from, r.to) + 1;
    // keep the prompt readable — long windows roll up rather than emitting thousands of rows
    var grain = days <= 92 ? 'day' : days <= 730 ? 'week' : 'month';
    var all = summarize('all', r.from, r.to);
    var ios = summarize('ios', r.from, r.to);
    var and = summarize('android', r.from, r.to);
    var cur = db.settings.currency || '$';
    var L = [];

    L.push('# Autonomic — app analytics export');
    L.push('Window: ' + labelFull(r.from) + ' → ' + labelFull(r.to) + '  (' + days + (days === 1 ? ' day)' : ' days)'));
    L.push('Data through: ' + labelFull(asOf()) + '  (store reporting lags, so the current day is never included)');
    L.push('Currency: ' + cur);
    L.push('');
    L.push('## How the app works');
    L.push('Every install gets a ' + trialDays() + '-day free trial of everything. After that the app stays');
    L.push('free to journal and measure in, but the analysis features (Progress ranges, the whole');
    L.push('Insights tab, the AI report) need Pro, and the free Day view is clipped to the last');
    L.push(trialDays() + ' days.');
    L.push('The limit is inclusive: a user is still in the trial on day ' + trialDays() +
      ' and leaves on day ' + trialExit() + '.');
    L.push('Sales are recorded on the day of purchase and are NOT attributed back to an install cohort,');
    L.push('so conversion rates below are population ratios rather than true cohort retention.');
    L.push('');
    L.push('## Totals for the window');
    [['Impressions', 'impressions', fmtInt], ['Product page views', 'pageViews', fmtInt],
     ['First-time downloads', 'downloads', fmtInt], ['Updates', 'updates', fmtInt],
     ['Sales (count)', 'sales', fmtInt], ['Revenue', 'revenue', fmtMoney]].forEach(function (m) {
      L.push(pad2(m[0], 22) + padL(m[2](all[m[1]]), 12) +
        '   (iOS ' + m[2](ios[m[1]]) + ' · Android ' + m[2](and[m[1]]) + ')');
    });
    L.push(pad2('Impression → install', 22) + padL(fmtPct(all.storeConv), 12));
    L.push(pad2('Page view → install', 22) + padL(fmtPct(all.ppvConv), 12));
    L.push(pad2('Impression → page view', 22) + padL(fmtPct(all.tapThrough), 12));
    L.push('');
    L.push('## Cohort state as of ' + labelFull(asOf()) + ' (all time, not just the window)');
    [['Installs, all time', 'totalInstalls', fmtInt],
     ['Still in trial (day 0–' + trialDays() + ')', 'inTrial', fmtInt],
     ['Past the trial (day ' + trialExit() + '+)', 'outOfTrial', fmtInt],
     ['Paid conversions', 'totalSales', fmtInt],
     ['Revenue, all time', 'totalRevenue', fmtMoney],
     ['Convert % of past-trial', 'convOfOutOfTrial', fmtPct],
     ['Revenue per paying user', 'arppu', fmtMoney],
     ['Revenue per install', 'rpi', fmtMoney]].forEach(function (m) {
      L.push(pad2(m[0], 30) + padL(m[2](all[m[1]]), 12) +
        '   (iOS ' + m[2](ios[m[1]]) + ' · Android ' + m[2](and[m[1]]) + ')');
    });
    L.push('');

    var grainWord = grain === 'day' ? 'Daily' : grain === 'week' ? 'Weekly' : 'Monthly';
    L.push('## ' + grainWord + ' figures' + (grain === 'day' ? '' : ' (rolled up to keep this readable)'));
    L.push('Columns: period, platform, downloads, impressions, page views, updates, sales, revenue,');
    L.push('left-trial (cohort that passed day ' + trialDays() + ' in that period).');
    L.push('');
    L.push(pad2('period', 15) + pad2('platform', 9) + padL('dl', 7) + padL('impr', 9) +
      padL('views', 8) + padL('upd', 7) + padL('sales', 7) + padL('revenue', 10) +
      padL('left-trial', 11));
    ['ios', 'android'].forEach(function (p) {
      buildBuckets(p, r.from, r.to, grain).forEach(function (row) {
        L.push(pad2(row.key, 15) + pad2(PLATFORMS[p], 9) +
          padL(fmtInt(row.downloads), 7) + padL(fmtInt(row.impressions), 9) +
          padL(fmtInt(row.pageViews), 8) + padL(fmtInt(row.updates), 7) +
          padL(fmtInt(row.sales), 7) + padL(fmtMoney(row.revenue), 10) +
          padL(fmtInt(row.trialEnd), 11));
      });
    });

    exportMoney(L, r);
    exportSales(L, r);
    exportCosts(L, r);
    exportUsage(L, r);
    exportEvents(L, r);
    exportForecast(L);
    exportWeekday(L, r);

    return L.join('\n');
  }

  /* ------------------------------------------------- export: the rest of it

     Everything below is a section of `buildExportText`, split out one function
     per subject because the whole of it in one body is unreadable and because
     each one has a different rule about when it has nothing to say.

     The export is a PROMPT — it is copied into a chat window to be reasoned
     about — so the shape of every section is the same: what the numbers are,
     then the sentence a reader needs in order not to misread them. That second
     half is the part worth protecting. "MRR 41.30" invites a model to add it to
     bookings; "MRR is a rate, bookings are cash, and an annual plan is a year
     of one and a twelfth of the other" does not. Every caveat this dashboard
     enforces on screen is restated here, because a number pasted somewhere else
     has left every one of them behind.

     A section that has nothing to report emits NOTHING — not a heading with
     zeroes under it. An empty book should produce a short export, and a heading
     over six dashes reads as data that failed to load. */

  /* How many individual purchase rows the export prints before it starts
     summarising. A real book is nowhere near this; a demo month is well past
     it, which is exactly the case that showed the cap was needed. */
  var MAX_LEDGER_ROWS = 400;

  function exportMoney(L, r) {
    var money = costSummary(r);
    var s = Sales.summarize(Sales.index(salesList(), 'all'), r.from, r.to);
    if (!money.spend && !money.grossRevenue && !s.bookings && !s.mrr) return;

    var be = breakevenSeries();
    L.push('');
    L.push('## Money in the window (both stores — costs are never per-store)');
    L.push('Revenue is entered at the customer-facing price and the store keeps ' + storeCut() + '%.');
    L.push('Profit is always struck against the NET figure; both are given so the cut is visible.');
    L.push('');
    [['Gross revenue', money.grossRevenue], ['Store commission', -money.commission],
     ['Net revenue', money.netRevenue], ['Spend', -money.spend],
     ['  of which marketing', -money.marketing], ['  of which everything else', -money.other],
     ['Net profit', money.profit]].forEach(function (m) {
      L.push(pad2(m[0], 28) + padL(fmtMoney(m[1]), 14));
    });
    L.push(pad2('Margin', 28) + padL(fmtPct(money.margin), 14));
    L.push(pad2('Cost per install (blended)', 28) + padL(fmtMoney(money.costPerInstall), 14) +
      '   marketing ÷ EVERY install, organic included — the honest ceiling');
    L.push(pad2('Cost per paid (blended)', 28) + padL(fmtMoney(money.costPerPaid), 14));
    L.push(pad2('Cost per paid (loaded)', 28) + padL(fmtMoney(money.loadedCostPerPaid), 14) +
      '   all spend, not only marketing');
    L.push(pad2('Revenue per install', 28) + padL(fmtMoney(money.revenuePerInstall), 14));
    L.push(pad2('Return on ad spend', 28) + padL(money.roas === null ? '–' : money.roas.toFixed(2) + '×', 14));
    L.push('');
    L.push('All time, since ' + labelFull(be.from) + ':');
    L.push(pad2('  Net revenue', 28) + padL(fmtMoney(be.revenue), 14));
    L.push(pad2('  Spend', 28) + padL(fmtMoney(be.spend), 14));
    L.push(pad2('  Net', 28) + padL(fmtMoney(be.revenue - be.spend), 14));
    L.push(pad2('  Breakeven', 28) + padL(be.at ? labelFull(be.at) : 'not yet', 14) +
      (be.at ? '' : !be.spend ? '   nothing spent yet'
        : '   ' + fmtMoney(be.spend - be.revenue) + ' still to make back'));
  }

  function exportSales(L, r) {
    var rows = salesList();
    if (!rows.length) return;
    var ix = Sales.index(rows, 'all');
    var s = Sales.summarize(ix, r.from, r.to);

    L.push('');
    L.push('## Subscriptions (the purchase ledger — one row per purchase)');
    L.push('CASH and RECURRING REVENUE are different numbers and are never blended: an annual');
    L.push('plan at ' + fmtMoney(s.byPlan.annual.units ? s.byPlan.annual.bookings / s.byPlan.annual.units : 0) +
      ' is that much BOOKINGS on the day it sells and a twelfth of it in MRR');
    L.push('every month for a year. A plan whose term is unknown (rows migrated from the old');
    L.push('daily columns) counts in bookings and in every rate, and is excluded from MRR —');
    L.push('spreading it over an assumed term would invent the one fact that is missing.');
    L.push('A subscription is assumed to still run until it is marked cancelled: the stores');
    L.push('tell this dashboard nothing about churn, so none is inferred. A refund is counted');
    L.push('in nothing but its own two fields.');
    L.push('');
    [['Purchases (units)', fmtInt(s.units)], ['Bookings (cash)', fmtMoney(s.bookings)],
     ['New MRR in window', fmtMoney(s.newMrr)], ['Churned MRR in window', fmtMoney(s.churnedMrr)],
     ['MRR at ' + r.to, fmtMoney(s.mrr)], ['ARR at ' + r.to, fmtMoney(s.arr)],
     ['Active subscriptions', fmtInt(s.active)],
     ['Active without a term', fmtInt(s.activeOther)],
     ['Average price paid', fmtMoney(s.arpu)],
     ['Refunds', fmtMoney(s.refunds) + ' over ' + fmtInt(s.refundedCount)],
     ['Annual share of new MRR', fmtPct(s.annualMrrShare)],
     ['Annual share of units', fmtPct(s.annualUnitShare)]].forEach(function (m) {
      L.push(pad2(m[0], 28) + padL(m[1], 18));
    });

    L.push('');
    L.push('By plan (in window):');
    L.push(pad2('  plan', 14) + padL('units', 8) + padL('bookings', 12) + padL('new mrr', 11) + padL('active', 9));
    Sales.PLAN_KEYS.forEach(function (k) {
      var p = s.byPlan[k];
      if (!p.units && !s.activeByPlan[k].count) return;
      L.push(pad2('  ' + ((Sales.PLANS[k] || {}).label || k), 14) + padL(fmtInt(p.units), 8) +
        padL(fmtMoney(p.bookings), 12) + padL(fmtMoney(p.mrr), 11) + padL(fmtInt(s.activeByPlan[k].count), 9));
    });

    L.push('');
    L.push('By store (in window):');
    Object.keys(s.byPlatform).forEach(function (k) {
      var p = s.byPlatform[k];
      L.push(pad2('  ' + (PLATFORMS[k] || k), 14) + padL(fmtInt(p.units), 8) +
        padL(fmtMoney(p.bookings), 12) + padL(fmtMoney(p.mrr), 11));
    });

    /* Days-to-purchase only ever counts purchases that carry an install date.
       A row without one is not a zero and not an average — it is left out, and
       the share it is of the whole is stated rather than implied. */
    var ages = Sales.purchaseAges(ix, r.from, r.to);
    if (ages && ages.total) {
      L.push('');
      L.push('Days from install to purchase — drawn from ' + fmtInt(ages.total) + ' of ' +
        fmtInt(ages.total + ages.withoutCohort) + ' purchases (' + fmtPct(ages.coverage) + ').');
      L.push('The rest carry no install date and are LEFT OUT rather than averaged in: an');
      L.push('aggregated row cannot have one, since several buyers do not share an install day.');
      L.push('Median ' + fmtInt(ages.median) + ' days; the median rather than the mean, because one');
      L.push('buyer who installed a year ago and finally paid drags a mean past the wall.');
      (ages.buckets || []).forEach(function (b) {
        if (!b.count) return;
        L.push(pad2('  ' + b.label, 16) + padL(fmtInt(b.count), 8));
      });
    }

    /* Every row in the window, verbatim. This is the point of "exhaustive": a
       ledger summarised is a ledger you cannot re-derive anything from. */
    var inWindow = rows.filter(function (x) { return x.date >= r.from && x.date <= r.to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (inWindow.length) {
      L.push('');
      /* The one cap in the export, and it says so out loud. A silent
         truncation reads as "that is all the purchases there were", which is
         the single most misleading thing a ledger dump could do. */
      var shown = inWindow;
      if (inWindow.length > MAX_LEDGER_ROWS) {
        shown = inWindow.slice(-MAX_LEDGER_ROWS);
        L.push('The most recent ' + fmtInt(MAX_LEDGER_ROWS) + ' of ' + fmtInt(inWindow.length) +
          ' purchases in the window — the older ' + fmtInt(inWindow.length - MAX_LEDGER_ROWS) +
          ' are counted in every total above but not listed here:');
      } else {
        L.push('Every purchase in the window:');
      }
      L.push(pad2('  date', 14) + pad2('store', 9) + pad2('plan', 10) + padL('price', 9) +
        padL('qty', 5) + '  ' + pad2('installed', 12) + pad2('cancelled', 12) + 'note');
      shown.forEach(function (x) {
        L.push(pad2('  ' + x.date, 14) + pad2(PLATFORMS[x.platform] || x.platform, 9) +
          pad2(x.refunded ? x.plan + ' (refunded)' : x.plan, 10) + padL(fmtMoney(x.price), 9) +
          padL(fmtInt(x.qty || 1), 5) + '  ' + pad2(x.cohort || '–', 12) +
          pad2(x.cancelled || '–', 12) + (x.note || ''));
      });
    }
  }

  function exportCosts(L, r) {
    var spend = spendList();
    if (!spend.length) return;
    var d = CS.daily(spend, r.from, r.to);
    if (!d.total && !ads().length) return;

    L.push('');
    L.push('## What it costs to run');
    L.push('A cost lands on the day it is CHARGED, never smeared across the days between');
    L.push('charges: a yearly developer fee is one whole charge on one day, not a twelfth of');
    L.push('itself every month. An ad spot is one line item bought once, so its whole price');
    L.push('lands on its start date — the end date describes the booking, not the money.');
    L.push('');
    L.push('By category, in the window:');
    CS.CATEGORY_KEYS.forEach(function (k) {
      var v = d.totals[k];
      if (!v) return;
      L.push(pad2('  ' + ((CS.CATEGORIES[k] || {}).label || k), 22) + padL(fmtMoney(v), 12) +
        (CS.isMarketing(k) ? '   marketing' : ''));
    });
    L.push(pad2('  Total', 22) + padL(fmtMoney(d.total), 12));

    var perAd = CS.perAd(ads(), r.from, r.to);
    if (perAd && perAd.rows.length) {
      L.push('');
      L.push('Ad spots whose money landed in the window. Impressions / clicks / installs are');
      L.push('what the NETWORK reported — the network marking its own homework — so the cost per');
      L.push('install here is REPORTED, not blended, and the two are never mixed.');
      L.push(pad2('  spot', 24) + pad2('network', 14) + padL('spend', 10) +
        padL('impr', 10) + padL('clicks', 9) + padL('installs', 10) + padL('cpi', 9));
      perAd.rows.forEach(function (a) {
        L.push(pad2('  ' + String(a.name || '').slice(0, 22), 24) + pad2(String(a.platform || '–').slice(0, 12), 14) +
          padL(fmtMoney(a.spend), 10) + padL(fmtInt(a.impressions), 10) + padL(fmtInt(a.clicks), 9) +
          padL(fmtInt(a.installs), 10) + padL(a.cpi === null ? '–' : fmtMoney(a.cpi), 9));
      });
    }

    var ledger = costList().filter(function (c) { return c && c.date >= r.from && c.date <= r.to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (ledger.length) {
      L.push('');
      L.push('Cost ledger rows dated in the window (recurring rows are listed once, at the row');
      L.push('you entered; their later occurrences are in the category totals above):');
      ledger.forEach(function (c) {
        L.push(pad2('  ' + c.date, 14) + pad2((CS.CATEGORIES[c.category] || {}).label || c.category, 16) +
          padL(fmtMoney(c.amount), 11) + '  ' + (c.label || '') +
          (c.recurrence ? ' (' + c.recurrence + ')' : ''));
      });
    }
  }

  function exportUsage(L, r) {
    if (!pings.report) return;
    var ix = A.index(pings.report, 'all');
    if (!ix.last) return;

    var days = A.range(r.from < ix.first ? ix.first : r.from, r.to > ix.last ? ix.last : r.to);
    if (!days.length) return;

    L.push('');
    L.push('## App usage (the app\'s own anonymous counter, not the stores)');
    L.push('Each install asks a counter to add one, at most once per US Eastern day, carrying');
    L.push('nothing but the day that install FIRST ran and one letter for its store. There is no');
    L.push('device id, so COUNTS CAN BE COMPARED ACROSS DAYS BUT NEVER SUMMED INTO ONE: adding');
    L.push('seven daily numbers counts the same person seven times. There is no weekly or');
    L.push('monthly active figure below for exactly that reason. A first run is the closest');
    L.push('thing to a live download here; the store\'s own download number arrives a day late');
    L.push('in a CSV and the two are never added together.');
    L.push('');

    var active = 0, fresh = 0, back = 0, subs = 0, acts = 0;
    days.forEach(function (d) {
      active += A.activeOn(ix, d);
      fresh += A.newOn(ix, d);
      back += A.returningOn(ix, d);
      subs += A.purchasesOn(ix, d);
      acts += A.activationsOn(ix, d);
    });
    var measured = A.measureRate(ix, days);
    var n = days.length;
    L.push(pad2('Newest day counted', 26) + padL(labelFull(ix.last), 16));
    L.push(pad2('Active on that day', 26) + padL(fmtInt(A.activeOn(ix, ix.last)), 16));
    L.push(pad2('Active per day (mean)', 26) + padL(fmtInt(Math.round(active / n)), 16));
    L.push(pad2('First runs per day (mean)', 26) + padL(fmtInt(Math.round(fresh / n)), 16));
    L.push(pad2('Returning per day (mean)', 26) + padL(fmtInt(Math.round(back / n)), 16));
    L.push(pad2('First runs in window', 26) + padL(fmtInt(fresh), 16) +
      '   (a sum of DISTINCT people: each is born once)');
    L.push(pad2('Subscribe pings in window', 26) + padL(fmtInt(subs), 16) +
      '   (the app notices a purchase on its NEXT launch, so this lags the ledger)');
    L.push(pad2('First readings in window', 26) + padL(fmtInt(acts), 16) +
      '   (activation: one per install, ever — so this IS a count of people)');
    if (measured.available) {
      L.push(pad2('Readings in window', 26) + padL(fmtInt(measured.readings), 16) +
        '   (install-DAYS carrying a reading, one per install per day)');
      L.push(pad2('Measured per active day', 26) + padL(fmtPct(measured.pct), 16) +
        '   (' + fmtInt(measured.readings) + ' of ' + fmtInt(measured.active) +
        ' install-days on the app' +
        (measured.blind ? '; ' + measured.blind + ' earlier days predate the counter' : '') + ')');
    }

    /* The reading counter beside the open one, by install age. Retention says
       somebody launched the app; this says they used it. The gap between the
       two columns is the part of the userbase drifting out while still showing
       up, which is invisible in every other figure here. */
    if (ix.hrvFirst) {
      L.push('');
      L.push('Opened vs measured, by install age. The second column is the share of the same cohorts');
      L.push('that saved a READING on that day — both counters fire once per install per Eastern day,');
      L.push('so the gap between them is people opening the app without using it. A cohort whose day N');
      L.push('fell before the reading counter shipped (' + labelFull(ix.hrvFirst) + ') is left out of it, not');
      L.push('counted as a zero.');
      L.push(pad2('  day', 8) + padL('opened', 9) + padL('measured', 11) + '   over');
      [0, 1, 7, 14, 30].forEach(function (k) {
        var o = A.retentionAt(ix, ix.cohorts, k);
        var m = A.measuringAt(ix, ix.cohorts, k);
        if (!o.available && !m.available) return;
        L.push(pad2('  D' + k, 8) + padL(o.available ? fmtPct(o.pct) : '–', 9) +
          padL(m.available ? fmtPct(m.pct) : '–', 11) + '   ' +
          (m.available ? fmtInt(m.kept) + ' of ' + fmtInt(m.of) + ' installs' : 'not knowable yet') +
          (m.blind ? ' · ' + m.blind + ' cohorts before the counter' : ''));
      });
    }

    L.push('');
    L.push('Retention, exact rather than modelled — day N\'s count over the cohort\'s day 0:');
    [1, 3, 7, 14, 30, 60, 90].forEach(function (k) {
      var rr = A.retentionAt(ix, ix.cohorts, k);
      if (!rr || rr.pct === null) return;
      L.push(pad2('  D' + k, 8) + padL(fmtPct(rr.pct), 9) + '   ' + fmtInt(rr.kept) + ' of ' + fmtInt(rr.of) +
        (rr.immature ? ' · ' + rr.immature + ' cohorts too young to count' : ''));
    });

    [7, 30].forEach(function (k) {
      var c = A.conversion(ix, ix.cohorts, k);
      if (!c || c.pct === null) return;
      L.push(pad2('  Convert by D' + k, 18) + padL(fmtPct(c.pct), 9) + '   ' + fmtInt(c.kept) + ' of ' + fmtInt(c.of));
    });

    /* Activation is the step BEFORE retention, and it is the one onboarding
       owns: an install with no first reading has no score and no reason to
       return, so a retention number read without this one blames the product
       for a wizard that never finished. */
    L.push('');
    L.push('Activation — the share of a cohort that ever saved a FIRST HRV reading. Fires once');
    L.push('per install, so these rows count people. Day 0 is the onboarding\'s own number;');
    L.push('anything later is someone coming back for it.');
    [0, 1, 7, 30].forEach(function (k) {
      var a = A.activation(ix, ix.cohorts, k);
      if (!a || a.pct === null) return;
      L.push(pad2('  ' + (k === 0 ? 'On day 0' : 'By D' + k), 18) + padL(fmtPct(a.pct), 9) +
        '   ' + fmtInt(a.kept) + ' of ' + fmtInt(a.of) +
        (a.immature ? ' · ' + a.immature + ' cohorts too young to count' : ''));
    });
    var mSplit = A.methodsOver(ix, days);
    var mKeys = A.METHOD_ORDER.filter(function (k) { return mSplit[k]; });
    if (mKeys.length) {
      L.push('Which sensor those FIRST readings used (Apple Watch is offered on iOS only):');
      mKeys.forEach(function (k) {
        L.push(pad2('  ' + A.methodName(k), 18) + padL(fmtInt(mSplit[k]), 9) +
          '   ' + fmtPct((mSplit[k] / acts) * 100));
      });
    }

    /* And the same question of the DAILY counter: not what people start on, but
       what they keep measuring with. One ping per install per Eastern day, so a
       row counts install-days and names each day's first reading. */
    var rSplit = A.hrvMethodsOver(ix, days);
    var rKeys = A.METHOD_ORDER.filter(function (k) { return rSplit[k]; });
    var rTotal = rKeys.reduce(function (a, k) { return a + rSplit[k]; }, 0);
    if (rTotal) {
      L.push('');
      L.push('What the DAILY readings were taken with — install-days, one per install per Eastern');
      L.push('day, so each row names that day\'s first reading rather than every sensor used:');
      rKeys.forEach(function (k) {
        L.push(pad2('  ' + A.methodName(k), 18) + padL(fmtInt(rSplit[k]), 9) +
          '   ' + fmtPct((rSplit[k] / rTotal) * 100));
      });
    }

    var live = A.lifecycleActive(ix, ix.last);
    L.push('');
    L.push('Where the people active on ' + labelFull(ix.last) + ' are in the lifecycle:');
    L.push(pad2('  In trial (day 0–' + trialDays() + ')', 26) + padL(fmtInt(live.inTrial), 9));
    L.push(pad2('  Past the trial', 26) + padL(fmtInt(live.postTrial), 9));

    /* The store split is always unfiltered, and a ping that names no store is
       an install whose store we failed to record — a build older than the
       platform marker — rather than an install on a third platform. */
    var split = A.platformsOn(ix, ix.last);
    L.push('');
    L.push('Store split on ' + labelFull(ix.last) + ': iOS ' + fmtInt(split.I || 0) +
      ' · Android ' + fmtInt(split.A || 0) +
      ((split.U || 0) ? ' · ' + fmtInt(split.U) + ' from builds that predate the store marker' : ''));

    L.push('');
    L.push('Day by day (active / first runs / returning / readings / subscribe pings):');
    L.push(pad2('  day', 14) + padL('active', 9) + padL('first', 8) + padL('return', 9) +
      padL('read', 7) + padL('subs', 7));
    days.forEach(function (d) {
      L.push(pad2('  ' + d, 14) + padL(fmtInt(A.activeOn(ix, d)), 9) + padL(fmtInt(A.newOn(ix, d)), 8) +
        padL(fmtInt(A.returningOn(ix, d)), 9) +
        padL(A.hrvKnown(ix, d) ? fmtInt(A.readingsOn(ix, d)) : '–', 7) +
        padL(fmtInt(A.purchasesOn(ix, d)), 7));
    });
  }

  function exportEvents(L, r) {
    var items = timelineItems().filter(function (e) { return e.date >= r.from && e.date <= r.to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!items.length) return;
    L.push('');
    L.push('## What happened in the window');
    L.push('Releases and ad spots flag themselves from the release log and the spend ledger;');
    L.push('everything else was entered by hand. This is the context a shape in the numbers');
    L.push('above needs before it is read as a trend.');
    items.forEach(function (e) {
      L.push(pad2('  ' + e.date, 14) + pad2(e.category || 'EVENT', 11) + (e.title || '') +
        (e.note ? ' — ' + e.note : ''));
    });
  }

  function exportForecast(L) {
    if (!salesList().length && !db.entries.length) return;
    L.push('');
    L.push('## Forecast');
    L.push('Modelled, not measured. Everything above this line happened; nothing below it has.');
    L.push('');
    L.push(fcExportText().split('\n').slice(1).join('\n'));
  }

  function exportWeekday(L, r) {
    if (!base().dates.length) return;
    L.push('');
    L.push('## By weekday, averaged across the window');
    L.push(pad2('  day', 12) + padL('downloads', 11) + padL('page views', 12) +
      padL('sales', 8) + padL('revenue', 11));
    var stats = {};
    ['downloads', 'pageViews', 'sales', 'revenue'].forEach(function (f) {
      stats[f] = weekdayStats('all', r.from, r.to, f);
    });
    var mean = function (w) { return w.count ? w.sum / w.count : 0; };
    WD_LONG.forEach(function (name, i) {
      L.push(pad2('  ' + name, 12) + padL(fmtInt(mean(stats.downloads[i])), 11) +
        padL(fmtInt(mean(stats.pageViews[i])), 12) + padL(fmtInt(mean(stats.sales[i])), 8) +
        padL(fmtMoney(mean(stats.revenue[i])), 11));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error('copy blocked'));
    });
  }

  function syncExportUI() {
    var lbl = document.getElementById('exportScopeLabel');
    if (lbl) lbl.textContent = exportScopeText();
    var n = document.getElementById('exportN');
    if (n && n !== document.activeElement) n.value = Math.max(1, Math.round(num(state.exportN) || 1));
    var host = document.getElementById('exportUnit');
    if (host) Array.prototype.forEach.call(host.children, function (c) {
      c.setAttribute('aria-pressed', c.dataset.v === state.exportUnit ? 'true' : 'false');
    });
    var rng = document.getElementById('exportRange');
    if (rng) {
      var r = exportRange();
      rng.textContent = r.from === r.to ? labelFull(r.to) : labelFull(r.from) + ' → ' + labelFull(r.to);
    }
  }

  function wireExport() {
    var pop = document.getElementById('exportPop');
    var toggle = document.getElementById('exportToggle');

    function setOpen(open) {
      pop.classList.toggle('hidden', !open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    document.getElementById('exportMain').addEventListener('click', function () {
      /* Purchases are data too: a book with sales and no store CSV pasted in
         yet still has a range worth copying. */
      if (!db.entries.length && !salesList().length) { toast('No data to export yet.'); return; }
      var r = exportRange();
      var scope = r.from === r.to ? labelFull(r.to) : labelFull(r.from) + ' → ' + labelFull(r.to);
      copyText(buildExportText())
        .then(function () { toast('Copied ' + exportScopeText() + ' (' + scope + ') to the clipboard.'); })
        .catch(function () { toast('Could not reach the clipboard — check the browser permission.'); });
      setOpen(false);
    });

    toggle.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setOpen(pop.classList.contains('hidden'));
      syncExportUI();
    });
    pop.addEventListener('click', function (ev) { ev.stopPropagation(); });
    document.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') setOpen(false); });

    pop.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-step]');
      if (b) {
        state.exportN = Math.min(999, Math.max(1, Math.round(num(state.exportN) || 1) + (+b.dataset.step)));
        saveUI(); syncExportUI(); return;
      }
      var u = ev.target.closest('#exportUnit button');
      if (u) { state.exportUnit = u.dataset.v; saveUI(); syncExportUI(); }
    });
    document.getElementById('exportN').addEventListener('input', function () {
      state.exportN = Math.min(999, Math.max(1, Math.round(+this.value || 1)));
      saveUI(); syncExportUI();
    });

    syncExportUI();
  }

  /* ------------------------------------------------------------- refresh

     The header's refresh, which exists so reading a new number never costs a
     page reload (and with it the sign-in round trip and every open card).

     It does three things in order. Push first: pulling the server's copy over
     the top of unsaved local edits would lose them, and `Sync.flush` resolves
     once there is nothing outstanding. Then pull and hydrate, keeping the
     current view rather than adopting whatever another device last looked at.
     Then re-fetch the view's own source — the ping counter is a separate call
     with its own cache, and a refresh that left it stale would be a lie on the
     two views that read it.

     The spin runs for at least MIN_SPIN_MS even when the network answers in
     40ms: a control that flashes reads as broken rather than fast. */

  var MIN_SPIN_MS = 480;
  var refreshing = false;

  /**
   * `opts.silent` suppresses the "Refreshed." confirmation, and nothing else.
   * It is what the five-minute auto-refresh below passes: a toast every five
   * minutes for a thing nobody asked for is furniture, the same reason the sync
   * pill went away. A refresh that FAILS still says so however it was started —
   * that one is worth interrupting for, and it can only appear once per cycle.
   *
   * `opts.keepScreen` pulls and hydrates without re-rendering, and exists for
   * exactly one case: an unattended refresh landing on **Edit data**. That view
   * is not a dashboard, it is a set of forms, and `renderData` rebuilds the
   * purchase form from its defaults — so a timer firing while you were halfway
   * through typing a sale would empty the fields under your hands, or throw
   * away an edit-in-progress by replacing the form with a blank one. The store
   * is still updated, the counter is still fetched and the alerts still fire;
   * only the repaint waits until you leave. A refresh you PRESSED always
   * renders, on every view, because you asked for it.
   */
  function refreshView(opts) {
    if (refreshing) return;
    var silent = !!(opts && opts.silent);
    var keepScreen = !!(opts && opts.keepScreen);
    var btn = document.getElementById('btnRefresh');
    refreshing = true;
    lastAutoAt = Date.now();
    if (btn) btn.dataset.busy = 'true';
    var startedAt = Date.now();

    var work = Promise.resolve(window.Sync ? window.Sync.flush() : null)
      .then(function () { return window.Sync ? window.Sync.pull() : null; })
      .then(function (remote) {
        hydrate(remote, true);
        var store = { db: db, state: state };
        if (window.Sync) window.Sync.adopt(store.db, store.state);
        // After the adopt, never before — see the note in hydrate().
        migrateSales();
        migrateAdSpots();
      });

    /* The counter is refetched on EVERY view, not only on the two that draw
       it. It is the source the live alerts are computed from, and gating the
       fetch on the view meant a sale that landed while you were reading the
       Costs page was announced whenever you next happened to open App usage —
       by which time it was not news, and the confetti was for something that
       had happened an hour ago. It is one small GET every five minutes. */
    work = work.then(function () { return pingLoad(true); });

    /* The stores, on the view that shows them. A refresh you PRESSED forces a
       real check; the five-minute one takes whatever the Lambda's half-hour
       cache holds, because a store that publishes a few times a month does not
       need asking every five minutes from every open device. */
    if (state.view === 'timeline') {
      work = work.then(function () { return storeLoad(!silent); });
    }

    work.then(function () {
      if (!keepScreen) renderAll();
      if (!silent) toast('Refreshed.');
    }).catch(function (err) {
      toast('Could not refresh: ' + ((err && err.message) || 'no answer from the server') + '.');
    }).then(function () {
      var wait = Math.max(0, MIN_SPIN_MS - (Date.now() - startedAt));
      setTimeout(function () {
        refreshing = false;
        if (btn) btn.dataset.busy = 'false';
      }, wait);
    });
  }

  /* -------------------------------------------------------- auto-refresh

     The dashboard refetches itself every FIVE minutes while it is ON SCREEN,
     on every view, so a tab left open beside your work keeps up on its own —
     and so `alerts.js` has a new ping report to compare with the last one. Two
     conditions, both load-bearing:

     - **Visible only.** `document.hidden` is checked on every tick rather than
       relied on through `setInterval` throttling: a backgrounded tab that is
       still allowed to run would otherwise burn a full pull-and-hydrate every
       five minutes for a screen nobody is looking at. Coming back to the tab
       checks immediately, so a laptop reopened after an hour is current within
       a frame rather than up to five minutes stale. (A notification, unlike the
       confetti, is deliberately allowed to fire into a window that is on screen
       but not focused — see pwa.js.)
     - **Signed in only.** The gate is up before any of this exists; a pull
       behind it would 401 and toast at somebody who has not typed their code
       yet.

     It used to be gated on the view as well — the counter being the only source
     that changes on its own, the other views had nothing to say. That was true
     of the CHARTS and false of the alerts: a sale arriving while the Costs view
     was open went unannounced until you wandered onto App usage. Every view
     refetches everything now, and `refreshView` fetches the counter regardless
     of what is on screen. Edit data is the one view where the refresh happens
     without a repaint (`keepScreen`), because a timer must not rebuild a form
     you are typing into — see the note on `refreshView`.

     The clock is a timestamp compared on a 30-second tick, not a five-minute
     interval, because an interval cannot be paused for the hours the tab spent
     in the background — it would fire the moment it came back and then again on
     its old cadence. Any refresh, including one you pressed, resets it. */

  var AUTO_REFRESH_MS = 5 * 60 * 1000;
  var AUTO_TICK_MS = 30 * 1000;
  var lastAutoAt = 0;

  function autoRefreshDue() {
    if (document.hidden) return false;
    if (document.body.classList.contains('gated')) return false;
    return Date.now() - lastAutoAt >= AUTO_REFRESH_MS;
  }

  function autoRefreshTick() {
    if (!autoRefreshDue()) return;
    refreshView({ silent: true, keepScreen: state.view === 'data' });
  }

  function initAutoRefresh() {
    lastAutoAt = Date.now();
    setInterval(autoRefreshTick, AUTO_TICK_MS);
    document.addEventListener('visibilitychange', autoRefreshTick);
  }

  /* ------------------------------------------------------------ skeleton

     What a view looks like before its data has arrived.

     The honest thing to say about this is that it should almost never be seen.
     Every view except App usage and Timeline is drawn from `db`, which is in
     localStorage before the page finishes parsing, so the ordinary open paints
     real numbers in one frame and skips this entirely. The skeleton is for the
     two cases where there genuinely is nothing yet: a browser signing in for
     the first time (or after "Delete all data"), and the two ping-fed views on
     a device that has never fetched the counter.

     It reproduces a view's SHAPE — the tile strip, the wide charts, the
     two-column grid — and nothing else. It is deliberately not a rebuild of
     each card's interior: a placeholder that guesses at content is a
     placeholder that jumps when the content lands, and the shape is the whole
     of what the reader needs to know that the page is not broken. */

  var SKELETON = {
    overview:  { tiles: 10, wide: [320, 260], half: 5 },
    ping:      { tiles: 9,  wide: [300, 260], half: 8 },
    timeline:  { tiles: 0,  wide: [340, 240], half: 1 },
    trial:     { tiles: 6,  wide: [300, 260], half: 2 },
    cohorts:   { tiles: 4,  wide: [300], half: 2 },
    platforms: { tiles: 6,  wide: [280], half: 4 },
    sales:     { tiles: 8,  wide: [280, 260], half: 3 },
    costs:     { tiles: 8,  wide: [300, 260], half: 3 },
    forecast:  { tiles: 4,  wide: [320, 240], half: 0 },
    pings:     { tiles: 5,  wide: [420], half: 0 },
    data:      { tiles: 0,  wide: [200, 200], half: 0 }
  };

  var skeletonOn = false;

  function skeletonHTML(view) {
    var s = SKELETON[view] || SKELETON.overview;
    var out = [];
    if (s.tiles) {
      out.push('<div class="grid cards">');
      for (var i = 0; i < s.tiles; i++) out.push('<div class="skel-tile"><span class="skel-bar sm"></span><span class="skel-bar lg"></span><span class="skel-bar md"></span></div>');
      out.push('</div>');
    }
    (s.wide || []).forEach(function (h) {
      out.push('<div class="skel-card" style="margin-bottom:14px"><span class="skel-bar title"></span>' +
        '<span class="skel-plot" style="height:' + h + 'px"></span></div>');
    });
    if (s.half) {
      out.push('<div class="grid two-col">');
      for (var j = 0; j < s.half; j++) {
        out.push('<div class="skel-card"><span class="skel-bar title"></span><span class="skel-plot" style="height:200px"></span></div>');
      }
      out.push('</div>');
    }
    return out.join('');
  }

  function showSkeleton(on) {
    var host = document.getElementById('skeleton');
    if (!host) return;
    skeletonOn = !!on;
    if (skeletonOn) {
      host.innerHTML = skeletonHTML(state.view);
      /* The views are markup, not a template: `#view-overview` ships its card
         shells in body.html and is visible until something hides it. Before
         `renderAll` has ever run — which is exactly when the boot skeleton is
         up — that means a page of empty headed cards sitting underneath it. */
      document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
    }
    host.classList.toggle('hidden', !skeletonOn);
  }

  /**
   * Is there nothing to draw yet?
   *
   * Two conditions, and neither is "the network is busy" — a refetch over data
   * we already hold never brings the skeleton back, or every five minutes the
   * whole page would blink.
   */
  function needsSkeleton() {
    if (bootPending) return true;
    if ((state.view === 'ping' || state.view === 'timeline' || state.view === 'pings') &&
        !pings.report && pings.status !== 'error') return true;
    return false;
  }

  /* ------------------------------------------------------------- render */

  var VIEW_TITLES = {
    overview: 'Overview', ping: 'App usage', timeline: 'Timeline', trial: 'Trial & conversion', cohorts: 'Cohorts',
    platforms: 'iOS vs Android', sales: 'Sales', costs: 'Costs', forecast: 'Forecast',
    pings: 'Pings', links: 'Links', data: 'Edit data'
  };

  function renderAll() {
    invalidate();
    if (!VIEW_TITLES[state.view]) state.view = 'overview';
    document.title = (VIEW_TITLES[state.view] || 'Overview') + ' | Autonomic';
    // don't clobber a field the user is currently typing into
    [['fTrial', trialDays()],
      ['fStoreCut', storeCut()], ['fCurrency', db.settings.currency || '$']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el && el !== document.activeElement) el.value = pair[1];
    });
    /* Neither Edit data nor Links reads a range or a platform: one is a set of
       forms, the other is a list of URLs. A filter bar over either is a control
       that changes nothing. */
    document.getElementById('filterbar').classList.toggle('hidden',
      state.view === 'data' || state.view === 'links');
    // the forecast is driven by its own assumptions — only the platform filter applies
    ['fgRange', 'fgGrain'].forEach(function (id) {
      var g = document.getElementById(id);
      if (g) g.classList.toggle('hidden', state.view === 'forecast');
    });
    // App usage is per-day by nature: daily actives can't be added into a week
    // without knowing who is who, which is exactly what the ping refuses to
    // carry. Hiding the grain is more honest than silently ignoring it.
    var grainGroup = document.getElementById('fgGrain');
    if (grainGroup && (state.view === 'ping' || state.view === 'timeline' || state.view === 'pings')) {
      grainGroup.classList.add('hidden');
    }
    /* Costs are not per-store — a hosting bill belongs to neither, and no ad
       network reports spend split the way the stores report downloads. The view
       always reads both combined, so the filter is hidden rather than ignored. */
    var platGroup = document.getElementById('fgPlatform');
    if (platGroup) platGroup.classList.toggle('hidden', state.view === 'costs');
    document.getElementById('btnEditData').textContent =
      state.view === 'data' ? '← Back' : 'Edit data';
    syncExportUI();
    syncSegments();

    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('hidden', v.id !== 'view-' + state.view);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.setAttribute('aria-selected', t.dataset.view === state.view ? 'true' : 'false');
    });

    /* Nothing to draw yet — the shape of the view, and the fetch that will fill
       it, are already running. The ping-fed views still ask for their counter
       from here, or the skeleton would be all there ever was. */
    if (needsSkeleton()) {
      showSkeleton(true);
      document.getElementById('view-' + state.view).classList.add('hidden');
      document.getElementById('emptyState').classList.add('hidden');
      if (state.view === 'ping' || state.view === 'timeline' || state.view === 'pings') pingLoad();
      return;
    }
    showSkeleton(false);

    // App usage and Timeline have their own data sources, so both stand up with
    // no store CSVs at all.
    /* Sales stands up with no store CSVs for the same reason Costs does: the
       ledger is entered here, not pasted from a store report, so a dashboard
       with purchases and no downloads has plenty to show. */
    /* Links stands up on a dashboard with no store data at all, for the same
       reason Edit data does: it is not a reading of the numbers. A campaign
       link is usually the FIRST thing set up, before there is anything to
       count. */
    var empty = !db.entries.length && !salesList().length && state.view !== 'data' &&
      state.view !== 'ping' && state.view !== 'timeline' && state.view !== 'costs' &&
      state.view !== 'sales' && state.view !== 'pings' && state.view !== 'links';
    document.getElementById('emptyState').classList.toggle('hidden', !empty);
    if (empty) {
      document.getElementById('view-' + state.view).classList.add('hidden');
      document.getElementById('filterbar').classList.add('hidden');
      return;
    }

    if (state.view === 'overview') renderOverview();
    else if (state.view === 'ping') { pingLoad(); renderPing(); }
    else if (state.view === 'timeline') { pingLoad(); storeLoad(); renderTimelineView(); }
    else if (state.view === 'trial') renderTrial();
    else if (state.view === 'cohorts') renderCohorts();
    else if (state.view === 'platforms') renderPlatforms();
    else if (state.view === 'sales') renderSales();
    else if (state.view === 'costs') renderCosts();
    else if (state.view === 'forecast') renderForecast();
    else if (state.view === 'pings') { pingLoad(); renderPings(); }
    else if (state.view === 'links') renderLinks();
    else if (state.view === 'data') renderData();

    layoutTiles();
  }

  /* ------------------------------------------------------- view: pings ----
   *
   * The counter with nothing done to it.
   *
   * Every other ping-fed card on the dashboard is an ANSWER — retention pooled
   * over mature cohorts, activation rates, a weekday shape. This one is the
   * evidence those answers are computed from, one row per stored key, because
   * the question "is that number wrong, or was that day genuinely strange?" has
   * no answer anywhere else on the page. It is also the only place a route that
   * has stopped firing is visible as a route rather than as a flat line.
   *
   * It is deliberately not a chart. A diagnostic view that rounds, buckets or
   * pools has reintroduced exactly the layer you opened it to look underneath.
   */

  var RAW_KINDS = [
    { key: 'open', label: 'Open', color: PC.active, note: 'app launched' },
    { key: 'sub', label: 'Subscribe', color: PC.subs, note: 'entitlement seen' },
    { key: 'act', label: 'Activation', color: PC.activation, note: 'first HRV reading saved' },
    { key: 'hrv', label: 'Reading', color: PC.reading, note: 'a reading saved that day' },
    { key: 'cap', label: 'Started', color: PC.active, note: 'a reading begun that day' },
    { key: 'pay', label: 'Paywall', color: PC.wall, note: 'met the paywall that day' },
    { key: 'not', label: 'Notification', color: COLOR.s4, note: 'turned one on that day' },
    { key: 'pot', label: 'POTS', color: COLOR.s3, note: 'a POTS capture finished' },
    { key: 'see', label: 'View', color: COLOR.s7, note: 'opened a gated view' },
    { key: 'err', label: 'Failure', color: COLOR.red, note: 'once per install, ever' },
    { key: 'osh', label: 'Offer shown', color: ENTITY.sales, note: 'an offer was shown' },
    { key: 'odm', label: 'Offer dismissed', color: COLOR.muted, note: 'and turned down' },
    { key: 'oac', label: 'Offer accepted', color: COLOR.green, note: 'buy button tapped' }
  ];

  /**
   * Flatten the report into one row per (route, arrival day, cohort key).
   *
   * The range filter is applied to the ARRIVAL day, not to the cohort: this
   * view is a log of what came in, so "last 30 days" has to mean the pings that
   * arrived in the last 30 days. That is the opposite of `scopeToRange` above,
   * where the question is about the installs themselves — and the difference is
   * worth keeping straight, because the two windows genuinely disagree (a ping
   * that arrived today can belong to a cohort from March).
   */
  function rawPingRows(r) {
    var letter = { ios: 'I', android: 'A' }[state.platform] || null;
    var out = [];
    RAW_KINDS.forEach(function (k) {
      if (pingUI.rawKind !== 'all' && pingUI.rawKind !== k.key) return;
      var rows = (pings.report && pings.report[k.key]) || [];
      rows.forEach(function (day) {
        if (r && r.from && day.day < r.from) return;
        if (r && r.to && day.day > r.to) return;
        (day.cohorts || []).forEach(function (c) {
          if (letter && c.platform !== letter) return;
          out.push({
            kind: k.key, kindLabel: k.label, color: k.color,
            arrived: day.day,
            key: c.key,
            cohort: c.cohort,
            platform: c.platform,
            /* The 8th character means different things on different routes —
               a sensor on the reading ones, a surface on the paywall one — so
               the row carries both under the names the endpoint gives them,
               and the table prints whichever the row actually has. */
            method: c.method,
            surface: c.surface,
            /* Whatever the letter is called on this route — the endpoint
               resolves it, so the table can print a name without holding a copy
               of every alphabet. */
            label: c.label,
            tier: c.tier,
            /* Age can legitimately be negative by a day: the cohort date is the
               install's own local day and the arrival day is stamped US
               Eastern, so an install west of Eastern that opens the app late
               can stamp tomorrow's cohort onto today's arrival. Shown as it is
               rather than clamped — this is the view where an oddity should be
               visible, not tidied. */
            age: A.ageBetween ? A.ageBetween(c.cohort, day.day) : diffDays(c.cohort, day.day),
            count: c.count
          });
        });
      });
    });
    /* Newest arrival first, then biggest count — a diagnostic list is read from
       the top and the top should be the most recent thing that happened. */
    out.sort(function (a, b) {
      if (a.arrived !== b.arrived) return a.arrived < b.arrived ? 1 : -1;
      if (a.count !== b.count) return b.count - a.count;
      return a.key < b.key ? -1 : 1;
    });
    return out;
  }

  function renderPings() {
    document.getElementById('pgRawStatus').innerHTML = pingStatusHTML();
    var retry = document.getElementById('pgRetry');
    if (retry) retry.addEventListener('click', function () { pingLoad(true); });

    var ready = pings.status === 'ready' || !!pings.report;
    if (!ready) {
      document.getElementById('pgRawTiles').innerHTML = '';
      document.getElementById('pgRawTable').innerHTML = '';
      return;
    }

    var ix = A.index(pings.report, pingPlatform());
    var r = ix.days && ix.days.length ? pingRange(ix) : null;
    var rows = rawPingRows(r);

    /* Tiles count PINGS, not installs: a row's `count` is how many pings shared
       that key, so summing them is the only figure here that is not a rate. */
    var byKind = {};
    RAW_KINDS.forEach(function (k) { byKind[k.key] = 0; });
    var keys = {};
    rows.forEach(function (x) { byKind[x.kind] = (byKind[x.kind] || 0) + x.count; keys[x.key] = true; });

    document.getElementById('pgRawTiles').innerHTML = [
      tile({
        label: 'Ping rows', value: fmtInt(rows.length), smallValue: true,
        meta: r ? labelFull(r.from) + ' → ' + labelFull(r.to) : 'all time'
      }),
      tile({ label: 'Open pings', color: PC.active, value: fmtInt(byKind.open), meta: 'app launches counted' }),
      tile({ label: 'Subscribe pings', color: PC.subs, value: fmtInt(byKind.sub), meta: 'once per install, ever' }),
      tile({ label: 'Activation pings', color: PC.activation, value: fmtInt(byKind.act), meta: 'first HRV reading saved' }),
      tile({ label: 'Reading pings', color: PC.reading, value: fmtInt(byKind.hrv), meta: 'once per install per day' }),
      tile({ label: 'Paywall pings', color: PC.wall, value: fmtInt(byKind.pay), meta: 'once per install per day' }),
      tile({
        label: 'Distinct cohort keys', value: fmtInt(Object.keys(keys).length), smallValue: true,
        meta: 'cohort day + platform'
          + (pingUI.rawKind === 'act' || pingUI.rawKind === 'hrv' ? ' + sensor' : '')
          + (pingUI.rawKind === 'pay' ? ' + surface' : '')
          + ' + tier'
      })
    ].join('');

    var host = document.getElementById('pgRawTable');
    if (!rows.length) {
      host.innerHTML = '<div class="empty">No pings in this range' +
        (state.platform === 'ios' || state.platform === 'android' ? ' for this platform' : '') + '.</div>';
      return;
    }

    /* Capped, and the cap is SAID. A year of opens is thousands of rows, and a
       table that silently stops at 500 reads as "that is all there is" — which
       on a diagnostic view is the one lie that matters. */
    var CAP = 500;
    var shown = rows.slice(0, CAP);

    host.innerHTML =
      '<div class="table-scroll"><table><thead><tr>' +
      '<th style="text-align:left">Route</th><th>Arrived</th><th>Cohort</th><th>Age</th>' +
      '<th style="text-align:left">Platform</th><th style="text-align:left">Sensor / surface</th>' +
      '<th style="text-align:left">Tier</th><th style="text-align:left">Key</th><th>Count</th>' +
      '</tr></thead><tbody>' +
      shown.map(function (x) {
        return '<tr>' +
          '<td style="text-align:left"><span class="swatch" style="background:' + x.color + '"></span>' + esc(x.kindLabel) + '</td>' +
          '<td>' + esc(labelDay(x.arrived)) + '</td>' +
          '<td>' + esc(labelDay(x.cohort)) + '</td>' +
          '<td>D' + x.age + '</td>' +
          '<td style="text-align:left">' + esc(A.platformName(x.platform)) + '</td>' +
          '<td style="text-align:left">' +
            (x.method ? esc(A.methodName(x.method))
              : x.surface ? esc(A.surfaceName(x.surface))
              : x.label ? esc(x.label)
              : '<span class="na">–</span>') + '</td>' +
          '<td style="text-align:left">' +
            (x.tier ? esc(A.tierName(x.tier)) : '<span class="na">–</span>') + '</td>' +
          '<td style="text-align:left"><code>' + esc(x.key) + '</code></td>' +
          '<td>' + fmtInt(x.count) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      (rows.length > CAP
        ? '<p class="hint" style="margin-top:8px">Showing the ' + fmtInt(CAP) + ' most recent of ' +
          fmtInt(rows.length) + ' rows. Narrow the range, or export the CSV for all of them.</p>'
        : '');
  }


  /* ------------------------------------------------------- view: links ----
   *
   * Campaign download links.
   *
   * This is the only view on the dashboard that WRITES to the public site.
   * Everything else here reads numbers; saving a campaign here publishes a real
   * page at autonomic.care/download/<slug> — the API renders it and puts it in
   * the bucket, with both destination URLs baked in, the moment the sync lands.
   * See sls/lambdas/api/links.js.
   *
   * The slug is the identity, not a generated id, which is what makes editing
   * the path a delete-and-create rather than a rename. The form says so, and
   * the confirm says the old link stops working: a campaign link is printed in
   * a video description or under a QR code, where a dead URL is not
   * recoverable.
   */

  function linkList() { return db.links || (db.links = []); }

  function linkBySlug(slug) {
    return linkList().filter(function (l) { return l.slug === slug; })[0] || null;
  }

  var LINK_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
  /* `index` is the object /download itself is served from. The rest are what a
     browser or a crawler asks for underneath a path. */
  var LINK_RESERVED = ['index', 'index.html', 'favicon.ico', 'robots.txt', 'sitemap.xml'];

  function linkUrl(slug) { return 'https://autonomic.care/download/' + slug; }

  /* Mirrors storeUrl() in landing/src/lib/site.ts. Duplicated rather than
     imported — that file is TypeScript inside a Vite build and this dashboard
     has no build step — so if the app id or the provider token ever change,
     both copies move. Apple attributes a campaign only when `pt` AND `ct` are
     both present; Play has no account token and carries the whole campaign in
     one URL-encoded `referrer`. */
  var APPLE_PROVIDER_TOKEN = '126963570';
  var APPLE_APP_ID = '6789786971';
  var PLAY_PACKAGE = 'com.autonomic.journal';

  /* Apple's campaign token is free-form and capped at 40 characters, so it can
     be the campaign's real name. Google's is a utm triple parsed out of one
     referrer string, and a utm value with spaces and punctuation in it is a
     mess in every report that groups on it — so the two are fed different
     things on purpose: Apple gets the name, Play and GA get the slug. */
  function suggestedIosUrl(name) {
    return 'https://apps.apple.com/app/apple-store/id' + APPLE_APP_ID +
      '?pt=' + APPLE_PROVIDER_TOKEN + '&ct=' + encodeURIComponent(name.slice(0, 40)) + '&mt=8';
  }

  function suggestedAndroidUrl(tag) {
    var referrer = 'utm_source=' + tag + '&utm_medium=referral&utm_campaign=' + tag;
    return 'https://play.google.com/store/apps/details?id=' + PLAY_PACKAGE +
      '&referrer=' + encodeURIComponent(referrer);
  }

  function suggestedWebUrl(tag) {
    return 'https://autonomic.care/?utm_source=' + tag +
      '&utm_medium=referral&utm_campaign=' + tag;
  }

  /* A campaign name reduced to something that can sit in a URL unencoded. Also
     what the New link form offers as a path when only a name has been typed. */
  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  function validLinkUrl(v) {
    return v === '' || /^https?:\/\/[^\s"'<>]+$/i.test(v);
  }

  function putLink(link) {
    var list = linkList(), at = -1;
    list.forEach(function (l, i) { if (l.slug === link.slug) at = i; });
    if (at >= 0) list[at] = link; else list.push(link);
    list.sort(function (a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; });
    /* No invalidate(): a campaign link is not in any derived series. It moves
       the site, not the numbers. */
    save();
  }

  function removeLink(slug) {
    db.links = linkList().filter(function (l) { return l.slug !== slug; });
    save();
  }

  function renderLinks() {
    var list = linkList();
    var host = document.getElementById('lkTable');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="empty">No campaign links yet. ' +
        '<code>/download</code> still works on its own — add one here when a campaign needs its own attribution.</div>';
      return;
    }
    host.innerHTML = '<table><thead><tr><th>Link</th><th>Campaign</th>' +
      '<th>iPhone</th><th>Android</th><th>Desktop</th><th></th></tr></thead><tbody>' +
      list.map(function (l) {
        var cell = function (v, fallback) {
          return v
            ? '<span class="note" title="' + esc(v) + '">' + esc(v.length > 44 ? v.slice(0, 44) + '…' : v) + '</span>'
            : '<span class="na">' + fallback + '</span>';
        };
        return '<tr><td><a href="' + esc(linkUrl(l.slug)) + '" target="_blank" rel="noreferrer">/download/' +
            esc(l.slug) + '</a></td>' +
          '<td>' + esc(l.label || '–') +
            (l.note ? '<br><span class="note">' + esc(l.note) + '</span>' : '') + '</td>' +
          '<td>' + cell(l.ios, 'default') + '</td>' +
          '<td>' + cell(l.android, 'default') + '</td>' +
          '<td>' + cell(l.web, 'home page') + '</td>' +
          '<td><button class="btn sm" data-link-copy="' + esc(l.slug) + '">Copy</button> ' +
            '<button class="btn sm" data-link-edit="' + esc(l.slug) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table>';

    host.querySelectorAll('[data-link-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openLinkForm(b.dataset.linkEdit); });
    });
    host.querySelectorAll('[data-link-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        copyText(linkUrl(b.dataset.linkCopy)).then(function () { toast('Link copied.'); });
      });
    });
  }

  function openLinkForm(slug) {
    var link = slug ? linkBySlug(slug) : null;
    var host = revealCard(document.getElementById('lkForm'));
    host.classList.remove('hidden');
    var v = function (x) { return x || ''; };

    host.innerHTML = '<div class="event-form">' +
      '<div class="field"><label for="lkSlug">Path (after /download/)</label>' +
      '<input type="text" id="lkSlug" maxlength="48" placeholder="facebook" value="' + esc(v(link && link.slug)) + '"></div>' +
      '<div class="field grow"><label for="lkLabel">Campaign name</label>' +
      '<input type="text" id="lkLabel" maxlength="120" placeholder="Facebook ads — August" value="' + esc(v(link && link.label)) + '"></div>' +
      '<div class="field full"><label for="lkIos">iPhone / iPad goes to</label>' +
      '<input type="text" id="lkIos" placeholder="blank = /download, the site default" value="' + esc(v(link && link.ios)) + '"></div>' +
      '<div class="field full"><label for="lkAndroid">Android goes to</label>' +
      '<input type="text" id="lkAndroid" placeholder="blank = /download, the site default" value="' + esc(v(link && link.android)) + '"></div>' +
      '<div class="field full"><label for="lkWeb">Desktop / anything else goes to</label>' +
      '<input type="text" id="lkWeb" placeholder="blank = autonomic.care" value="' + esc(v(link && link.web)) + '"></div>' +
      '<div class="field full"><label for="lkNote">Notes</label>' +
      '<textarea id="lkNote" rows="2" maxlength="2000">' + esc(v(link && link.note)) + '</textarea></div>' +
      '<div class="event-form-actions">' +
      '<button class="btn primary" id="lkSave">' + (link ? 'Save & publish' : 'Publish link') + '</button>' +
      '<button class="btn" id="lkFill">Fill in tagged store URLs</button>' +
      '<button class="btn" id="lkCancel">Cancel</button>' +
      (link ? '<span class="spacer"></span><button class="btn danger" id="lkDelete">Delete</button>' : '') +
      '</div>' +
      '<p class="hint full" id="lkPreview"></p>' +
      '</div>';

    var slugEl = document.getElementById('lkSlug');
    var preview = document.getElementById('lkPreview');
    function drawPreview() {
      var s = slugEl.value.trim().toLowerCase();
      preview.innerHTML = s
        ? 'Publishes at <b>' + esc(linkUrl(s)) + '</b>'
        : 'Enter a path to see the link.';
    }
    /* Typing a name fills the path in, until the path is typed in by hand.
       The path is the thing that has to be right — it is the printed URL — so
       it is offered rather than derived: once touched it is never rewritten
       under the reader, and an existing link's path is never touched at all. */
    var slugTouched = !!link;
    slugEl.addEventListener('input', function () { slugTouched = true; drawPreview(); });
    document.getElementById('lkLabel').addEventListener('input', function () {
      if (slugTouched) return;
      slugEl.value = slugify(this.value);
      drawPreview();
    });
    drawPreview();

    /* Builds the store URLs the site would build for a campaign of this name,
       so the ordinary case is a name and one press rather than two URLs
       assembled by hand in App Store Connect's own format. Fills only what is
       empty — it must never quietly overwrite a URL that was pasted in. */
    document.getElementById('lkFill').addEventListener('click', function () {
      var name = document.getElementById('lkLabel').value.trim() || slugEl.value.trim();
      var tag = slugify(slugEl.value.trim() || name);
      if (!name || !tag) { toast('Give the campaign a name or a path first.'); return; }
      var pairs = [['lkIos', suggestedIosUrl(name)], ['lkAndroid', suggestedAndroidUrl(tag)],
        ['lkWeb', suggestedWebUrl(tag)]];
      var filled = 0;
      pairs.forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (el.value.trim()) return;
        el.value = pair[1];
        filled += 1;
      });
      toast(filled ? 'Filled in ' + filled + ' tagged URL' + (filled === 1 ? '' : 's') + '.'
        : 'Every destination is already set — clear one to refill it.');
    });

    document.getElementById('lkCancel').addEventListener('click', closeLinkForm);

    if (link) {
      document.getElementById('lkDelete').addEventListener('click', function () {
        if (!confirm('Delete ' + linkUrl(link.slug) + '?\n\nThe page comes down. Anyone who follows the link after that gets an error, so only do this if it is not printed anywhere.')) return;
        removeLink(link.slug);
        closeLinkForm();
        renderAll();
        toast('Link deleted. The page is coming down.');
      });
    }

    document.getElementById('lkSave').addEventListener('click', function () {
      var next = slugEl.value.trim().toLowerCase();
      if (!LINK_SLUG.test(next)) {
        toast('The path can hold lowercase letters, numbers and hyphens, and cannot start with one.');
        return;
      }
      if (LINK_RESERVED.indexOf(next) >= 0) { toast('"' + next + '" is reserved. Pick another path.'); return; }
      var clash = linkBySlug(next);
      if (clash && (!link || clash.slug !== link.slug)) { toast('/download/' + next + ' is already taken.'); return; }

      var urls = {};
      var bad = false;
      [['ios', 'lkIos'], ['android', 'lkAndroid'], ['web', 'lkWeb']].forEach(function (pair) {
        var raw = document.getElementById(pair[1]).value.trim();
        if (!validLinkUrl(raw)) { bad = true; return; }
        if (raw) urls[pair[0]] = raw;
      });
      if (bad) { toast('Destinations must be full http:// or https:// URLs.'); return; }

      /* Editing the path is a delete and a create, because the slug IS the
         URL: the old page has to come down or a retired campaign keeps
         redirecting. Said out loud rather than done quietly — the old link may
         be printed under a QR code. */
      if (link && link.slug !== next) {
        if (!confirm('Change the path from /download/' + link.slug + ' to /download/' + next + '?\n\nThe old link stops working immediately. If it is already printed anywhere, add a second link instead.')) return;
        removeLink(link.slug);
      }

      putLink({
        slug: next,
        label: document.getElementById('lkLabel').value.trim() || undefined,
        ios: urls.ios,
        android: urls.android,
        web: urls.web,
        note: document.getElementById('lkNote').value.trim() || undefined,
        created: (link && link.created) || today()
      });
      closeLinkForm();
      renderAll();
      toast(link ? 'Saved. The page is being republished.' : 'Published at /download/' + next + '.');
    });

    slugEl.focus();
  }

  function closeLinkForm() {
    var host = document.getElementById('lkForm');
    if (!host) return;
    host.classList.add('hidden');
    host.innerHTML = '';
  }

  /* The repair button. The stored campaigns are the record and the pages are a
     rendering of them, so rewriting every page is always safe — which is what
     makes it the answer to a page that has gone missing. */
  function republishLinks() {
    var status = document.getElementById('lkRepublishStatus');
    if (!linkList().length) { if (status) status.textContent = 'No links to publish.'; return; }
    if (status) status.textContent = 'Publishing…';
    /* Flush first: a link saved seconds ago is still in the debounce window,
       and republishing what the server has not been told about yet would
       report a page it never wrote. */
    var wait = window.Sync ? window.Sync.flush() : Promise.resolve();
    wait.then(function () {
      return window.Api.call('LINKS_REPUBLISH');
    }).then(function (res) {
      if (!status) return;
      status.textContent = res && res.configured === false
        ? 'The server has no site bucket configured, so nothing was published.'
        : 'Republished ' + (res && res.published) + ' page' + ((res && res.published) === 1 ? '' : 's') + '.';
    }).catch(function (err) {
      if (status) status.textContent = 'Could not republish: ' + (err && err.message ? err.message : 'request failed');
    });
  }

  function setView(v) {
    if (v === 'data' && state.view !== 'data') state.lastView = state.view;
    state.view = v; saveUI();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------- I/O */

  function toCSV() {
    var cols = ['date', 'platform', 'downloads', 'impressions', 'pageViews', 'updates', 'notes'];
    var lines = [cols.join(',')];
    db.entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (e) {
      lines.push(cols.map(function (c) {
        var v = e[c];
        if (v === null || v === undefined) v = '';
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    return lines.join('\n');
  }

  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }

  function importCSV(text) {
    var rows = parseCSV(text);
    if (!rows.length) return 0;
    var head = rows[0].map(function (h) { return h.trim().toLowerCase().replace(/[^a-z]/g, ''); });
    var idx = function (names) {
      for (var i = 0; i < names.length; i++) {
        var j = head.indexOf(names[i]);
        if (j !== -1) return j;
      }
      return -1;
    };
    var map = {
      date: idx(['date', 'day']),
      platform: idx(['platform', 'os', 'store']),
      downloads: idx(['downloads', 'firsttimedownloads', 'installs', 'firsttime']),
      impressions: idx(['impressions']),
      pageViews: idx(['pageviews', 'productpageviews', 'views']),
      updates: idx(['updates']),
      sales: idx(['sales', 'salescount', 'purchases', 'paid']),
      revenue: idx(['revenue', 'amount', 'salesamount', 'proceeds']),
      notes: idx(['notes', 'note'])
    };
    if (map.date === -1) throw new Error('CSV needs a "date" column.');
    var count = 0, legacySales = [];
    rows.slice(1).forEach(function (r) {
      var date = normalizeDate((r[map.date] || '').trim());
      if (!date) return;
      var rawP = ((map.platform !== -1 ? r[map.platform] : '') || '').trim().toLowerCase();
      var plat = /and|goog|play/.test(rawP) ? 'android' : 'ios';
      var rec = { date: date, platform: plat, notes: map.notes !== -1 ? (r[map.notes] || '') : '' };
      ['downloads', 'impressions', 'pageViews', 'updates'].forEach(function (f) {
        rec[f] = map[f] !== -1 ? cleanNum(r[map[f]]) : 0;
      });
      upsertQuiet(rec); count++;
      /* A store export still carries sales columns, and dropping them on the
         floor because the dashboard's own shape moved would lose real money
         without saying so. They land in the ledger as unclassified purchases —
         the same thing the migration made of the old daily columns — so they
         count everywhere except MRR, and the Sales view says how many there
         are and how to classify them. */
      var n = Math.round(map.sales !== -1 ? cleanNum(r[map.sales]) : 0);
      var amount = map.revenue !== -1 ? cleanNum(r[map.revenue]) : 0;
      if (n || amount) {
        var qty = Math.max(1, n || 1);
        legacySales.push({
          id: 'sale-csv-' + date + '-' + plat, date: date, platform: plat,
          plan: 'unknown', price: amount / qty, qty: qty,
          note: 'Imported from a CSV sales column'
        });
      }
    });
    /* Keyed by day and store so re-importing the same export corrects those
       days rather than adding a second copy of every sale on them. */
    var have = {};
    salesList().forEach(function (x, i) { have[x.id] = i; });
    legacySales.forEach(function (row) {
      if (have[row.id] !== undefined) salesList()[have[row.id]] = row;
      else salesList().push(row);
    });
    if (legacySales.length) sortSales();
    finishBulk();
    return count;
  }

  var bulkDirty = false;
  function upsertQuiet(rec) {
    var e = findEntry(rec.date, rec.platform);
    if (e) Object.assign(e, rec); else db.entries.push(rec);
    bulkDirty = true;
  }
  function finishBulk() {
    if (!bulkDirty) return;
    db.entries.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.platform < b.platform ? -1 : 1; });
    save(); invalidate(); bulkDirty = false;
  }

  function cleanNum(v) {
    if (v === null || v === undefined) return 0;
    var s = String(v).replace(/[^0-9.\-]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function normalizeDate(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US m/d/y
    if (m) return m[3] + '-' + pad(+m[1]) + '-' + pad(+m[2]);
    var d = new Date(s);
    return isNaN(d) ? null : toISO(d);
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /**
   * Demo data, in the shape the dashboard actually reads.
   *
   * Store days carry only what a store report carries. The money is a LEDGER,
   * one row per purchase, because that is the only place `base()` looks for it:
   * writing `sales` / `revenue` back onto the days — which this used to do —
   * produced a demo whose Overview, Costs, forecast and Sales view all read
   * zero, and did it silently, since the columns still parse and still sync.
   *
   * The rows are the fixture the Sales view exists for: a plan mix rather than
   * one price, install dates so days-to-purchase has something to draw, a few
   * cancellations so MRR is not a straight line, and the odd refund.
   */
  function loadDemo() {
    if ((db.entries.length || salesList().length) &&
        !confirm('Replace the current data — store days and purchases — with demo data?')) return;
    db.entries = [];
    db.sales = [];
    var days = 120;
    var start = addDays(reportDay(), -(days - 1));
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    var saleNo = 0;
    for (var i = 0; i < days; i++) {
      var d = addDays(start, i);
      var dow = parseISO(d).getDay();
      var wk = (dow === 0 || dow === 6) ? 1.25 : 1;
      var growth = 1 + i / 90;
      ['ios', 'android'].forEach(function (p) {
        var scale = p === 'ios' ? 1 : 0.62;
        var impressions = Math.round((900 + rnd() * 500) * growth * wk * scale);
        var pageViews = Math.round(impressions * (0.16 + rnd() * 0.06));
        var downloads = Math.round(pageViews * (0.26 + rnd() * 0.1));
        db.entries.push({
          date: d, platform: p,
          downloads: downloads, impressions: impressions, pageViews: pageViews,
          updates: Math.round(downloads * (2 + rnd() * 3)),
          notes: ''
        });
        var buys = Math.round(downloads * (p === 'ios' ? 0.05 : 0.032) * (0.5 + rnd()));
        for (var s = 0; s < buys; s++) {
          var roll = rnd();
          var plan = roll < 0.62 ? 'monthly' : roll < 0.94 ? 'annual' : 'lifetime';
          var price = plan === 'monthly' ? (p === 'ios' ? 4.99 : 3.99)
            : plan === 'annual' ? (p === 'ios' ? 39.99 : 34.99)
              : 79.99;
          /* Most buyers decide inside the trial; a long tail comes back weeks
             later, which is the shape the days-to-purchase chart is for. A
             cohort earlier than the fixture's first day is left off rather than
             clamped onto day one, exactly like a buyer you cannot match. */
          var lag = Math.round(Math.pow(rnd(), 2) * 45);
          var cohort = addDays(d, -lag);
          var row = {
            id: 'sale-demo-' + (++saleNo),
            date: d, platform: p, plan: plan, price: price, qty: 1
          };
          if (cohort >= start) row.cohort = cohort;
          /* Churn is a date on the row, never something derived: the stores
             tell this dashboard nothing about it. */
          if (plan === 'monthly' && rnd() < 0.18) {
            var lived = 30 + Math.round(rnd() * 120);
            if (addDays(d, lived) <= reportDay()) row.cancelled = addDays(d, lived);
          }
          if (rnd() < 0.015) row.refunded = true;
          salesList().push(row);
        }
      });
    }
    db.entries.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    sortSales();
    /* Nothing here is in the old shape, so there is nothing to migrate — and
       leaving the flag off would run the migration over the demo on the next
       render just to discover that. */
    db.settings.salesMigrated = true;
    save(); invalidate();
    toast('Loaded 120 days of demo data — ' + saleNo + ' purchases across both stores.');
    refreshBulk();
    renderSaleEntry();
    renderAll();
  }

  /* -------------------------------------------------------------- toast */

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ------------------------------------------------------ notifications

     The settings card under Edit data. `pwa.js` owns the capability and the
     honesty about what it can do; this is only the two buttons and the line of
     status under them, which is written to say what to do next in every state
     rather than to report an enum. */

  var NOTE_COPY = {
    granted: 'On. A download or a sale raises a notification while the dashboard is open and you are looking at something else.',
    denied: 'Blocked by the browser. Turn notifications back on for autonomic.care in your browser or system settings — the page cannot ask twice.',
    'default': 'Not asked yet.',
    'needs-install': 'Add the dashboard to your home screen first (Safari → Share → Add to Home Screen), then open it from there and come back here. iOS only allows an installed app to ask.',
    unsupported: 'This browser has no notification support.'
  };

  function syncNotifyUI() {
    var host = document.getElementById('ntStatus');
    if (!host || !window.Pwa) return;
    var st = window.Pwa.state();
    host.textContent = NOTE_COPY[st] || NOTE_COPY.unsupported;
    var enable = document.getElementById('ntEnable');
    var test = document.getElementById('ntTest');
    if (enable) enable.disabled = st === 'granted' || st === 'denied' || st === 'unsupported';
    /* A test button that only works in a window you are not looking at would
       be untestable, so the test passes `force` — it is the one notification
       allowed to appear over the page that asked for it. */
    if (test) test.classList.toggle('hidden', st !== 'granted');
  }

  /* ------------------------------------------------- background alerts
   *
   * The half that reaches a closed phone. Three states worth telling apart,
   * and the copy names the next action in each rather than reporting an enum:
   *
   *   the server has no keys        nothing can subscribe; say so plainly, and
   *                                 do not offer a button that cannot work
   *   this browser cannot           a desktop tab, or iOS Safari not installed
   *   subscribed / not subscribed   the only two that are about a choice
   *
   * `bgKey` is fetched once and cached for the session. It is the VAPID PUBLIC
   * key — the thing `pushManager.subscribe` signs against, meant to be handed
   * to the browser — and asking for it again on every render would be a
   * round trip per settings open for a value that changes when the keypair is
   * rotated and never otherwise.
   */
  var bgKey = null;          // { configured, publicKey } once loaded
  var bgSubscribed = false;  // does THIS browser hold a subscription

  function bgLoadKey() {
    if (bgKey) return Promise.resolve(bgKey);
    return window.Api.call('PUSH_KEY').then(function (r) {
      bgKey = { configured: !!r.configured, publicKey: r.publicKey || '' };
      return bgKey;
    }).catch(function () {
      /* A failed lookup is not the same as "not configured", and must not be
         reported as it — the difference is whether Austin has a key to set. */
      return null;
    });
  }

  function bgSay(msg) {
    var host = document.getElementById('bgStatus');
    if (host) host.textContent = msg;
  }

  function bgSyncUI() {
    var enable = document.getElementById('bgEnable');
    var test = document.getElementById('bgTest');
    var off = document.getElementById('bgOff');
    if (!enable || !window.Pwa) return;

    var canPush = window.Pwa.pushSupported();
    var st = window.Pwa.state();

    /* Order matters: the most actionable blocker wins the line. Telling
       somebody on an iPhone that their browser "has no push support" when the
       real answer is "add it to your home screen" is the difference between a
       fixable state and a dead end. */
    if (st === 'needs-install') {
      enable.disabled = true;
      test.classList.add('hidden');
      off.classList.add('hidden');
      bgSay('Add the dashboard to your home screen first (Safari → Share → Add to Home Screen), then open it from there. iOS only delivers push to an installed app.');
      return;
    }
    if (!canPush) {
      enable.disabled = true;
      test.classList.add('hidden');
      off.classList.add('hidden');
      bgSay('This browser has no push support.');
      return;
    }
    if (bgKey && !bgKey.configured) {
      enable.disabled = true;
      test.classList.add('hidden');
      off.classList.add('hidden');
      bgSay('The server has no push keys set, so nothing can subscribe yet. See sls/README.md — one SSM parameter and a redeploy.');
      return;
    }
    if (st === 'denied') {
      enable.disabled = true;
      test.classList.add('hidden');
      off.classList.add('hidden');
      bgSay('Notifications are blocked for autonomic.care. Turn them back on in Settings → Notifications and reopen this page — the page cannot ask twice.');
      return;
    }

    enable.disabled = bgSubscribed;
    enable.textContent = bgSubscribed ? 'Background alerts are on' : 'Turn on background alerts';
    test.classList.toggle('hidden', !bgSubscribed);
    off.classList.toggle('hidden', !bgSubscribed);
    bgSay(bgSubscribed
      ? 'On for this device. The counter is checked hourly and one notification is sent per hour that brought a sale or a new install.'
      : 'Off for this device. Nothing is sent until you turn it on here, on each device you want woken.');
  }

  function bgRefresh() {
    if (!window.Pwa || !window.Pwa.pushSupported()) { bgSyncUI(); return; }
    /* The BROWSER is the source of truth for whether this device is
       subscribed, never our own remembered flag: a subscription is revoked by
       deleting the PWA or withdrawing the permission, neither of which tells
       the page anything. */
    window.Pwa.currentSubscription().then(function (sub) {
      bgSubscribed = !!sub;
      return bgLoadKey();
    }).then(bgSyncUI).catch(bgSyncUI);
  }

  function wireBackgroundAlerts() {
    var enable = document.getElementById('bgEnable');
    var test = document.getElementById('bgTest');
    var off = document.getElementById('bgOff');
    if (!enable || !window.Pwa) return;

    enable.addEventListener('click', function () {
      enable.disabled = true;
      bgSay('Asking…');
      bgLoadKey().then(function (key) {
        if (!key || !key.configured) { bgSyncUI(); return null; }
        return window.Pwa.subscribePush(key.publicKey).then(function (res) {
          if (!res.ok) {
            bgSubscribed = false;
            bgSyncUI();
            if (res.reason === 'dismissed') bgSay('The permission prompt was dismissed — press the button again to retry.');
            else if (res.reason === 'failed') bgSay('Could not subscribe: ' + (res.message || 'the browser refused.'));
            return null;
          }
          /* The row is written server-side BEFORE the UI claims success. A
             browser holding a subscription the server never stored is the one
             state that looks on and is silent forever. */
          return window.Api.call('PUSH_SUBSCRIBE', {
            subscription: res.subscription,
            ua: window.navigator.userAgent
          }).then(function (r) {
            if (!r.ok) throw new Error(r.error || 'The server refused the subscription.');
            bgSubscribed = true;
            bgSyncUI();
            toast('Background alerts on for this device.');
          });
        });
      }).catch(function (e) {
        bgSubscribed = false;
        bgSyncUI();
        bgSay('Could not turn these on: ' + ((e && e.message) || 'unknown error') + '.');
      });
    });

    off.addEventListener('click', function () {
      bgSay('Turning off…');
      window.Pwa.unsubscribePush().then(function (res) {
        /* Tell the server even when the browser's own unsubscribe failed: the
           endpoint is what it keys on, and a row left behind is an hourly send
           to a device that has stopped listening. */
        if (!res.endpoint) return null;
        return window.Api.call('PUSH_UNSUBSCRIBE', { endpoint: res.endpoint });
      }).then(function () {
        bgSubscribed = false;
        bgSyncUI();
        toast('Background alerts off for this device.');
      }).catch(function () {
        bgRefresh();
        bgSay('Could not fully turn these off — try again, or remove the permission in your browser settings.');
      });
    });

    test.addEventListener('click', function () {
      bgSay('Sending…');
      /* Through the SERVER, not through `Pwa.notify`. A local notification
         proves the permission and nothing else; the failure this button exists
         to catch is a keypair that does not match the stored subscription, and
         only a real encrypted send from the sender can surface that. */
      window.Api.call('PUSH_TEST').then(function (r) {
        if (r.ok) bgSay('Sent. It should arrive within a few seconds — lock the screen to see it as a banner.');
        else bgSay('Not sent: ' + (r.error || 'the push service rejected it.'));
      }).catch(function (e) {
        bgSay('Not sent: ' + ((e && e.message) || 'the request failed.'));
      });
    });

    bgRefresh();
  }

  function wireNotifications() {
    var enable = document.getElementById('ntEnable');
    var test = document.getElementById('ntTest');
    if (!enable || !window.Pwa) return;

    enable.addEventListener('click', function () {
      window.Pwa.enable().then(function (p) {
        syncNotifyUI();
        if (p === 'granted') toast('Notifications on.');
        else if (p === 'denied') toast('The browser said no — turn them on in its settings.');
        else toast('Notifications were not enabled.');
      });
    });

    if (test) {
      test.addEventListener('click', function () {
        window.Pwa.notify({
          title: 'Autonomic', body: 'Notifications are working.', tag: 'autonomic-test', force: true
        }).then(function (ok) {
          if (!ok) toast('Could not show a notification — check the browser permission.');
        });
      });
    }

    syncNotifyUI();
    wireBackgroundAlerts();
  }

  /* -------------------------------------------------------------- wiring */

  /* segmented controls live inside re-rendered cards, so clicks are delegated */
  var SEGMENTS = {
    fPlatform: 'platform', fGrain: 'grain', ovMode: 'ovMode',
    cohGrain: 'cohGrain', dowMetric: 'dowMetric'
  };

  function syncSegments() {
    Object.keys(SEGMENTS).forEach(function (id) {
      var host = document.getElementById(id);
      if (!host) return;
      Array.prototype.forEach.call(host.children, function (c) {
        c.setAttribute('aria-pressed', c.dataset.v === state[SEGMENTS[id]] ? 'true' : 'false');
      });
    });
  }

  function wireSegments() {
    document.body.addEventListener('click', function (ev) {
      var b = ev.target.closest('.segmented button');
      if (!b) return;
      var host = b.parentElement;
      var key = SEGMENTS[host.id];
      if (!key) return;
      state[key] = b.dataset.v;
      saveUI();
      renderAll();
    });
  }

  function init() {
    /* The counter's last answer, so App usage and Timeline open on numbers
       rather than on "Reading the counter…". It is refetched immediately below
       whatever this finds. */
    loadPingCache();
    loadStoreCache();
    bootPending = false;

    /* The one-shot move of sales out of the daily columns and into the ledger.
       It runs HERE because boot.js calls `Sync.adopt` before `Dashboard.start`,
       so by now the server's own shape is the sync baseline and the rewrite
       below reads as a real change that gets pushed. Run any earlier — inside
       hydrate, say — and the adopt would swallow it and the migration would
       repeat, invisibly, on every device forever. The same is true of the move
       from campaigns to ad spots. */
    migrateSales();
    migrateAdSpots();

    document.querySelector('.tabs').addEventListener('click', function (ev) {
      var t = ev.target.closest('.tab');
      if (t) setView(t.dataset.view);
    });

    var rangeSel = document.getElementById('fRange');
    rangeSel.value = state.range;
    rangeSel.addEventListener('change', function () {
      state.range = rangeSel.value;
      document.getElementById('customRange').classList.toggle('hidden', state.range !== 'custom');
      if (state.range === 'custom') {
        var b = base();
        if (!state.from) state.from = document.getElementById('fFrom').value || addDays(b.end, -29);
        if (!state.to) state.to = document.getElementById('fTo').value || b.end;
        document.getElementById('fFrom').value = state.from;
        document.getElementById('fTo').value = state.to;
      }
      saveUI(); renderAll();
    });
    document.getElementById('customRange').classList.toggle('hidden', state.range !== 'custom');
    if (state.from) document.getElementById('fFrom').value = state.from;
    if (state.to) document.getElementById('fTo').value = state.to;
    ['fFrom', 'fTo'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        state[id === 'fFrom' ? 'from' : 'to'] = this.value;
        saveUI(); renderAll();
      });
    });

    wireSegments();

    document.getElementById('goData').addEventListener('click', function () { setView('data'); });
    document.getElementById('goDemo').addEventListener('click', loadDemo);

    document.getElementById('fStoreCut').addEventListener('change', function () {
      var v = Number(this.value);
      if (!isFinite(v) || v < 0 || v > 100) { this.value = storeCut(); toast('Commission has to be between 0 and 100%.'); return; }
      db.settings.storeCutPct = v;
      save(); renderAll();
      toast('Store commission set to ' + v + '% — every profit figure now nets revenue down by it.');
    });
    document.getElementById('fCurrency').addEventListener('change', function () {
      var v = this.value.trim().slice(0, 4) || '$';
      db.settings.currency = v;
      this.value = v;
      save(); renderAll();
    });

    var trialInput = document.getElementById('fTrial');
    if (trialInput) trialInput.addEventListener('change', function () {
      db.settings.trialDays = Math.max(1, Math.round(+this.value || 1));
      save(); renderAll();
      toast('Trial ' + trialDays() + ' days — cohorts leave on day ' + trialExit() + '.');
    });

    /* table-view toggles (delegated — cards are re-rendered) */
    document.body.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-table-toggle]');
      if (!b) return;
      var id = b.dataset.tableToggle;
      var t = document.getElementById(id + '-table');
      if (!t) return;
      var showing = t.classList.toggle('hidden');
      b.textContent = showing ? 'Table' : 'Hide table';
      if (!showing && chartCfgs[id]) t.innerHTML = Chart.tableHTML(chartCfgs[id]);
    });

    document.getElementById('cohExport').addEventListener('click', function () {
      var r = activeRange();
      var main = isCompare() ? 'all' : platKeys()[0];
      var rows = buildBuckets(main, r.from, r.to, state.cohGrain).filter(function (x) { return x.downloads > 0; });
      var out = ['cohort,age_days,status,installs'];
      rows.forEach(function (x) {
        var age = diffDays(x.start, asOf());
        var st = age >= trialExit() ? 'past_trial' : 'in_trial';
        out.push([bucketLabel(x.key, state.cohGrain).full, age, st, x.downloads].join(','));
      });
      download('autonomic-cohorts.csv', out.join('\n'), 'text/csv');
    });

    wirePingView();
    wireCosts();
    wireLinks();
    wireAccordions();

    /* "Check now" on the store-versions card. It forces a real round trip to
       Apple and Google past the Lambda's cache, which is what you want from a
       button pressed right after hitting Release. */
    var storeBtn = document.getElementById('tlStoreRefresh');
    if (storeBtn) {
      storeBtn.addEventListener('click', function () {
        storeBtn.disabled = true;
        storeLoad(true).then(function () {
          storeBtn.disabled = false;
          if (stores.status === 'error') toast(stores.error);
        });
      });
    }

    /* Wrapped rather than passed straight in: the listener would hand the click
       event to `refreshView` as its options object. */
    document.getElementById('btnRefresh').addEventListener('click', function () { refreshView(); });
    if (window.Alerts) window.Alerts.init();
    initAutoRefresh();
    wireNotifications();

    /* A new worker means the document on disk is no longer the one running.
       Say so and let the reader choose the moment: an automatic reload here
       would throw away every open card, the scroll position and any half-typed
       row in the entry forms. */
    if (window.Pwa) {
      window.Pwa.onUpdate(function () { toast('A new version of the dashboard is ready — reload when you like.'); });
    }

    /* The counter, on whatever view we came up on. It is what the live alerts
       diff against, so it is fetched at boot everywhere rather than on arrival
       at App usage — otherwise the first thing a session hears about a sale is
       nothing at all. */
    pingLoad();

    /* --- data entry --- */
    wireBulk();
    wireSales();
    wireExport();
    wireForecast();
    document.getElementById('eDate').value = asOf();

    document.getElementById('eSave').addEventListener('click', function () {
      var date = document.getElementById('eDate').value;
      if (!date) { toast('Pick a date first.'); return; }
      var rec = {
        date: date,
        platform: document.getElementById('ePlatform').value,
        downloads: cleanNum(document.getElementById('eDownloads').value),
        impressions: cleanNum(document.getElementById('eImpressions').value),
        pageViews: cleanNum(document.getElementById('ePageViews').value),
        updates: cleanNum(document.getElementById('eUpdates').value),
        notes: document.getElementById('eNotes').value
      };
      upsert(rec);
      document.getElementById('eStatus').textContent =
        'Saved ' + labelFull(date) + ' · ' + PLATFORMS[rec.platform];
      toast('Saved ' + labelFull(date) + ' (' + PLATFORMS[rec.platform] + ')');
      renderData();
    });

    document.getElementById('eClear').addEventListener('click', function () {
      ['eDownloads', 'eImpressions', 'ePageViews', 'eUpdates', 'eNotes']
        .forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('eStatus').textContent = '';
    });

    /* prefill the form when the date/platform pair already exists */
    ['eDate', 'ePlatform'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        var e = findEntry(document.getElementById('eDate').value, document.getElementById('ePlatform').value);
        var st = document.getElementById('eStatus');
        if (!e) { st.textContent = 'New entry'; return; }
        document.getElementById('eDownloads').value = e.downloads ?? '';
        document.getElementById('eImpressions').value = e.impressions ?? '';
        document.getElementById('ePageViews').value = e.pageViews ?? '';
        document.getElementById('eUpdates').value = e.updates ?? '';
        document.getElementById('eNotes').value = e.notes || '';
        st.textContent = 'Editing an existing entry — saving overwrites it.';
      });
    });

    document.getElementById('btnEditData').addEventListener('click', function () {
      if (state.view === 'data') { setView(state.lastView || 'overview'); return; }
      setView('data');
      document.getElementById('eDate').value = asOf();
      document.getElementById('eDate').dispatchEvent(new Event('change'));
    });

    /* --- import / export --- */
    document.getElementById('ioExportCsv').addEventListener('click', function () {
      download('autonomic-data-' + today() + '.csv', toCSV(), 'text/csv');
    });
    document.getElementById('ioExportJson').addEventListener('click', function () {
      download('autonomic-backup-' + today() + '.json', JSON.stringify(db, null, 2), 'application/json');
    });
    document.getElementById('ioImport').addEventListener('click', function () {
      document.getElementById('ioFile').click();
    });
    document.getElementById('ioFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result);
        try {
          var n;
          if (/\.json$/i.test(f.name) || text.trim()[0] === '{') {
            var parsed = JSON.parse(text);
            var list = Array.isArray(parsed) ? parsed : parsed.entries;
            if (!Array.isArray(list)) throw new Error('JSON has no "entries" array.');
            list.forEach(function (e) {
              if (!e.date) return;
              e.date = normalizeDate(e.date);
              e.platform = e.platform === 'android' ? 'android' : 'ios';
              upsertQuiet(e);
            });
            if (parsed.settings) { Object.assign(db.settings, parsed.settings); migrateSettings(db.settings); }
            // A JSON backup is the whole store, so a restore has to bring the
            // ad spots, costs and purchases back too — not just the store days.
            // Merged by id, like every other collection, so restoring an old
            // backup over a newer ledger adds to it rather than truncating it.
            ['ads', 'costs', 'sales', 'events'].forEach(function (name) {
              if (!Array.isArray(parsed[name])) return;
              var into = db[name] || (db[name] = []);
              parsed[name].forEach(function (row) {
                if (!row || !row.id) return;
                var at = -1;
                into.forEach(function (x, i) { if (x.id === row.id) at = i; });
                if (at >= 0) into[at] = row; else into.push(row);
              });
            });

            /* Campaign links merge by SLUG, not by id — they have none, the
               slug is the identity. Restored links republish themselves: the
               sync diff sees rows the server does not have and the save path
               writes their pages, the same as typing them in. */
            if (Array.isArray(parsed.links)) {
              var intoLinks = db.links || (db.links = []);
              parsed.links.forEach(function (row) {
                if (!row || !row.slug) return;
                var at = -1;
                intoLinks.forEach(function (x, i) { if (x.slug === row.slug) at = i; });
                if (at >= 0) intoLinks[at] = row; else intoLinks.push(row);
              });
            }

            /* THE ROLLBACK PATH. A backup taken before sales moved out of the
               daily columns holds entries that still carry `sales` / `revenue`
               and settings that carry no `salesMigrated` — and `base()` no
               longer reads those columns, so restoring one onto a migrated
               account would put the money back on disk and nowhere on screen.
               Clearing the flag when a restored entry still carries them makes
               the migration run again over exactly those rows, which is what
               turns the backup into a real undo rather than a file you cannot
               use. The migrated id is derived from the day and store, so a row
               already in the ledger is skipped rather than added twice — and a
               purchase you have since classified by hand keeps that
               classification instead of being reset to unclassified. */
            if (list.some(function (e) { return e && (e.sales !== undefined || e.revenue !== undefined); })) {
              db.settings.salesMigrated = false;
            }
            /* Same rollback path for the move off campaigns: a backup taken
               before it holds campaigns with no price and ADS cost rows that
               carry it, and restoring one onto a migrated account would list
               every campaign at $0.00. Re-running collapses exactly those rows,
               and a spot that already has an `amount` is left alone. */
            if ((parsed.costs || []).some(function (c) { return c && c.category === 'ADS'; }) ||
                (parsed.ads || []).some(function (a) { return a && a.amount === undefined; })) {
              db.settings.adSpotsMigrated = false;
            }
            finishBulk();
            var restored = migrateSales();
            if (restored) toast('Restored ' + restored + ' days of sales into the ledger as unclassified purchases.');
            migrateAdSpots();
            n = list.length;
          } else {
            n = importCSV(text);
          }
          document.getElementById('ioStatus').textContent = 'Imported ' + n + ' rows from ' + f.name + '.';
          refreshBulk();
          toast('Imported ' + n + ' rows.');
          renderAll();
        } catch (err) {
          document.getElementById('ioStatus').textContent = 'Import failed: ' + err.message;
          toast('Import failed: ' + err.message);
        }
      };
      reader.readAsText(f);
      this.value = '';
    });
    document.getElementById('ioDemo').addEventListener('click', loadDemo);
    document.getElementById('ioReset').addEventListener('click', function () {
      if (!confirm('Delete every store entry and every purchase on your account? Costs, ad spots and events are kept. This cannot be undone — export a backup first if you want one.')) return;
      db.entries = [];
      /* Sales left behind by a wipe would come back as revenue with no
         downloads under it, which reads as a bug rather than as a choice. */
      db.sales = [];
      save(); invalidate(); renderAll();
      refreshBulk();
      // A wipe is the one case where the server should be told outright rather
      // than handed a diff of two thousand deletes.
      if (window.Sync) window.Sync.replaceAll().catch(function () {});
      toast('All data deleted.');
    });

    /* Redraw charts on resize — but ONLY when the WIDTH moved.

       Every chart here is an SVG sized to its container's width, so a resize is
       worth a re-render when the page got wider or narrower and never when it
       only got shorter. On a phone that distinction is the whole thing: the
       address bar collapses as you scroll down, which fires `resize` with a
       new innerHeight, which re-rendered every chart on the page mid-scroll.
       The document's height changes under the scroll position while the
       browser is still settling it, and the reader gets thrown back up a
       quarter of the page — reliably, at the bottom of the longest views,
       which is exactly where the collapse happens. Height-only resizes are
       therefore ignored outright; nothing on this page is laid out against the
       viewport's height. */
    var rt;
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (state.view !== 'data') renderAll(); else layoutTiles();
      }, 180);
    });

    watchTileRows();
    renderAll();
  }

  /* The dashboard no longer boots itself: index.html resolves sign-in and pulls
     the server's copy first, then hands it here. Painting the localStorage
     cache before the pull would flash stale numbers on a second device. */
  /**
   * Swap in the server's copy.
   *
   * `keepUi` is set by the header's refresh: a mid-session refetch must not
   * yank the reader back to whichever view another device last looked at.
   */
  function hydrate(remote, keepUi) {
    if (!remote) return;
    if (Array.isArray(remote.entries)) db.entries = remote.entries;
    if (Array.isArray(remote.events)) db.events = remote.events;
    if (Array.isArray(remote.ads)) db.ads = remote.ads;
    if (Array.isArray(remote.costs)) db.costs = remote.costs;
    if (Array.isArray(remote.sales)) db.sales = remote.sales;
    if (Array.isArray(remote.links)) db.links = remote.links;
    if (remote.settings) { Object.assign(db.settings, remote.settings); migrateSettings(db.settings); }
    if (remote.ui && !keepUi) Object.assign(state, remote.ui);
    if (state.platform === 'compare') state.platform = 'combined';
    // A session saved before Explore was replaced still names it. An unknown
    // view hides every section and leaves a blank page with no way back.
    if (!VIEW_TITLES[state.view]) state.view = 'overview';
    if (!VIEW_TITLES[state.lastView]) state.lastView = 'overview';
    /* NOTE: the sales migration deliberately does NOT run here.
       Every caller of hydrate() follows it with `Sync.adopt`, which makes what
       is in memory the baseline the next push diffs against — so a migration
       run inside hydrate would be adopted as though the server had sent it, and
       the rewritten entries and the new ledger rows would never leave the
       browser. It runs in init() and in refreshView(), both of which are AFTER
       the adopt. */
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
    try { localStorage.setItem(KEY + '.ui', JSON.stringify(state)); } catch (e) {}
    invalidate();
  }

  /**
   * The pull landed on a page that was already painted from the cache.
   *
   * Everything here has to happen AFTER `Sync.adopt` — the migrations for the
   * reason spelled out in hydrate(), the render because it is what puts the
   * server's copy on screen over the top of the cached one.
   */
  function adopted() {
    migrateSales();
    migrateAdSpots();
    renderAll();
  }

  /** boot.js's half of the cache-first open: no cache, so draw the shape. */
  function skeleton(on) {
    bootPending = !!on;
    showSkeleton(!!on);
    /* The filter bar scopes data there is none of yet, and unlike the views it
       is never hidden by `renderAll` on the way in. Only the BOOT skeleton
       takes it down — a view-level one (App usage waiting on the counter) leaves
       it alone, since taking a row out and putting it back is a jump. */
    var bar = document.getElementById('filterbar');
    if (bar) bar.classList.toggle('hidden', !!on);
  }

  window.Dashboard = {
    hydrate: hydrate,
    /** What sync.js diffs against. */
    store: function () { return { db: db, state: state }; },
    start: init,
    /* alerts.js says the same line in the corner card and in the toast, and
       the toast is the one that works wherever the reader is on the page. */
    toast: toast,
    hasCache: hasCache,
    skeleton: skeleton,
    adopted: adopted
  };
})();
