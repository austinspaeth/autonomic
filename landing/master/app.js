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
    // lifecycle stages — green while in trial, gold once past it, red past the wall
    green: '#00a08f', gold: '#c98500', red: '#c9403f',
    muted: '#898781', text: '#c3c2b7'
  };

  /* Entity colours — fixed, never assigned by rank.
     Downloads own slot 1, the 7-day threshold slot 2, the 14-day wall slot 3. */
  var ENTITY = {
    downloads: COLOR.s1,        // blue
    inTrial: COLOR.green,       // still inside the free trial
    trialEnd: COLOR.gold,       // past the trial
    wallHit: COLOR.red,         // past the wall
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
      entries: [], events: [], ads: [], costs: [],
      settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 }
    };
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.entries)) d.entries = p.entries;
        if (p && Array.isArray(p.events)) d.events = p.events;
        if (p && Array.isArray(p.ads)) d.ads = p.ads;
        if (p && Array.isArray(p.costs)) d.costs = p.costs;
        // conversion rate used to be an entered field; it is derived now, so drop
        // any stale values rather than carrying them into exports and backups
        d.entries.forEach(function (e) { if (e) delete e.conversionRate; });
        if (p && p.settings) Object.assign(d.settings, p.settings);
      }
    } catch (e) { console.warn('Could not read saved data', e); }
    return d;
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
    fc: { horizon: 12, model: 'monthly' }
  };
  try {
    var st = JSON.parse(localStorage.getItem(KEY + '.ui') || 'null');
    if (st) Object.assign(state, st);
  } catch (e) { /* ignore */ }
  function saveUI() {
    try { localStorage.setItem(KEY + '.ui', JSON.stringify(state)); } catch (e) {}
    if (window.Sync) window.Sync.schedule();
  }

  /* ---------------------------------------------------------------- dates */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function today() { return toISO(new Date()); }
  /* Store reporting always lags, so the current calendar day never has data.
     `reportDay` is the newest day the dashboard treats as real; `asOf` is the
     same thing but extended if entries somehow run later, so a manually entered
     day is never silently hidden. */
  function reportDay() { return addDays(toISO(new Date()), -1); }
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

  /* daily[platform][date] = summed record; built once per render pass */
  var cache = null;
  function invalidate() { cache = null; }

  function base() {
    if (cache) return cache;
    var byPlat = { ios: {}, android: {}, all: {} };
    var min = null, max = null;

    db.entries.forEach(function (e) {
      if (!e || !e.date || !PLATFORMS[e.platform]) return;
      [e.platform, 'all'].forEach(function (p) {
        var r = byPlat[p][e.date] || (byPlat[p][e.date] = {
          downloads: 0, impressions: 0, pageViews: 0, updates: 0, sales: 0, revenue: 0
        });
        r.downloads += num(e.downloads);
        r.impressions += num(e.impressions);
        r.pageViews += num(e.pageViews);
        r.updates += num(e.updates);
        r.sales += num(e.sales);
        r.revenue += num(e.revenue);
      });
      if (!min || e.date < min) min = e.date;
      if (!max || e.date > max) max = e.date;
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
        if (r) {
          run[p].downloads += r.downloads; run[p].impressions += r.impressions;
          run[p].pageViews += r.pageViews; run[p].updates += r.updates;
          run[p].sales += r.sales; run[p].revenue += r.revenue;
        }
        cum[p][d] = {
          downloads: run[p].downloads, impressions: run[p].impressions, pageViews: run[p].pageViews,
          updates: run[p].updates, sales: run[p].sales, revenue: run[p].revenue
        };
      });
    }
    function blank() { return { downloads: 0, impressions: 0, pageViews: 0, updates: 0, sales: 0, revenue: 0 }; }

    cache = { byPlat: byPlat, cum: cum, dates: dates, start: start, end: end, min: min, max: max };
    return cache;
  }

  function dayRec(p, d) {
    var r = base().byPlat[p][d];
    return r || { downloads: 0, impressions: 0, pageViews: 0, updates: 0, sales: 0, revenue: 0 };
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

  function trialDays() { return Math.max(1, num(db.settings.trialDays) || 7); }
  function wallDays() { return Math.max(trialDays(), num(db.settings.wallDays) || 14); }
  /* Day 7 is still inside the trial and day 14 is still inside the chart window —
     both limits are inclusive, so a cohort leaves on the day AFTER the limit.
     These are the shifts every threshold metric is derived with. */
  function trialExit() { return trialDays() + 1; }
  function wallExit() { return wallDays() + 1; }

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
      row.pastTrial = row.cumTrialEnd - row.cumWallHit;   // between trial end and the wall
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
    if (state.platform === 'compare') return ['ios', 'android'];
    return ['all'];
  }
  function platName(k) { return k === 'all' ? 'All platforms' : PLATFORMS[k]; }
  function platColor(k) { return k === 'all' ? ENTITY.downloads : ENTITY[k]; }
  function isCompare() { return state.platform === 'compare'; }

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

  function tile(o) {
    var delta = '';
    if (o.delta !== undefined && o.delta !== null && isFinite(o.delta)) {
      var cls = o.delta > 0.05 ? 'up' : o.delta < -0.05 ? 'down' : 'flat';
      if (o.invertDelta) cls = cls === 'up' ? 'down' : cls === 'down' ? 'up' : 'flat';
      var arrow = o.delta > 0.05 ? '▲' : o.delta < -0.05 ? '▼' : '■';
      delta = '<span class="delta ' + cls + '">' + arrow + ' ' + Math.abs(o.delta).toFixed(1) + '%</span>';
    }
    var split = '';
    if (o.split && o.split.length) {
      split = '<div class="split">' + o.split.map(function (s) {
        return '<span><span class="swatch" style="background:' + s.color + '"></span> ' + esc(s.name) + ' <b>' + s.value + '</b></span>';
      }).join('') + '</div>';
    }
    return '<div class="card tile">' +
      '<div class="label">' + (o.color ? '<span class="swatch" style="background:' + o.color + '"></span>' : '') + esc(o.label) + '</div>' +
      '<div class="value' + (o.smallValue ? ' small' : '') + '">' + o.value + (delta ? ' ' + delta : '') + '</div>' +
      (o.meta ? '<div class="meta">' + o.meta + '</div>' : '') +
      split +
      (o.spark ? '<div style="margin-top:8px">' + o.spark + '</div>' : '') +
      '</div>';
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
        label: 'Hit the ' + wallDays() + '-day wall', color: ENTITY.wallHit, value: fmtInt(s.hitWall),
        meta: pctOf(s.hitWall, s.totalInstalls) + ' of all installs · charts now locked for them',
        split: splitOf(function (x) { return fmtInt(x.hitWall); })
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
        label: 'Convert rate — hit the wall', value: fmtPct(s.convOfWall),
        meta: fmtInt(s.totalSales) + ' paid ÷ ' + fmtInt(s.hitWall) + ' who lost historical charts',
        split: splitOf(function (x) { return fmtPct(x.convOfWall); })
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

    /* Two lines from the Costs view, because revenue on its own is not a
       result. They are combined-platform whatever the filter says — costs are
       not per-store — so they are added only when there is spend to report,
       rather than sitting at a permanent zero beside eight per-store tiles. */
    var money = costSummary(r);
    if (money.spend) {
      tiles.push(tile({
        label: 'Net profit in range', color: money.profit >= 0 ? COLOR.s3 : COLOR.red,
        value: fmtMoney(money.profit), smallValue: true,
        meta: fmtMoney(money.spend) + ' spent · both stores, whatever the filter says'
      }));
      tiles.push(tile({
        label: 'Cost per install', value: fmtMoney(money.costPerInstall), smallValue: true,
        meta: 'blended · ' + fmtMoney(money.costPerPaid) + ' per paid conversion'
      }));
    }

    document.getElementById('ovTiles').innerHTML = tiles.join('');

    /* main chart — downloads with the two thresholds shaded underneath */
    var cumulative = state.ovMode === 'cumulative';
    document.getElementById('ovChartTitle').textContent =
      cumulative ? 'Cumulative downloads and thresholds' : 'Downloads over time';
    document.getElementById('ovChartHint').innerHTML = cumulative
      ? 'Everyone who has ever installed, and how many of them have since passed the ' + trialDays() +
        '-day trial and the ' + wallDays() + '-day chart wall. Paid conversions are on the same axis — '
        + 'same unit, so the gap between the wall line and the paid line is the conversion you are leaving on the table.'
      : 'The line is new installs. The shaded bands are the same installs re-plotted on the day they aged out of the ' +
        trialDays() + '-day trial and the day they hit the ' + wallDays() + '-day wall — so a spike moves right across the chart as that cohort matures.';

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
        mk(rowsMain, main, cumulative ? 'cumTrialEnd' : 'trialEnd', 'Past the ' + trialDays() + '-day trial', ENTITY.trialEnd, 'area'),
        mk(rowsMain, main, cumulative ? 'cumWallHit' : 'wallHit', 'Hit the ' + wallDays() + '-day wall', ENTITY.wallHit, 'area')
      ];
      // paid is the same unit (people), so it shares the axis honestly — it sits low
      // against the thresholds, which is exactly the comparison worth seeing
      if (cumulative) series.push(mk(rowsMain, main, 'cumSales', 'Paid', ENTITY.sales, 'line'));
    }
    drawChart('ovChart', {
      x: xAxis(rowsMain), series: series, height: 320, format: fmtInt, xLabel: 'Period',
      ariaLabel: 'Downloads over time with trial and wall thresholds',
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
        mk(rowsMain, main, 'pastTrial', 'Past trial, charts still open', ENTITY.trialEnd, 'area'),
        mk(rowsMain, main, 'pastWall', 'Past day ' + wallDays() + ' — charts locked', ENTITY.wallHit, 'area')
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
        label: 'Crossed day ' + wallDays() + ' in range', color: ENTITY.wallHit, value: fmtInt(s.wallHit),
        meta: 'reached day ' + wallExit() + ' during this range — the harder wall, where historical charts close',
        split: splitOf(function (x) { return fmtInt(x.wallHit); })
      }),
      tile({
        label: 'Paid in range', color: ENTITY.sales, value: fmtInt(s.sales),
        meta: fmtMoney(s.revenue) + ' · ' + fmtMoney(s.arppu) + ' per paying user',
        split: splitOf(function (x) { return fmtInt(x.sales); })
      }),
      tile({
        label: 'In-range convert rate at the wall', value: fmtPct(s.wallHit ? (s.sales / s.wallHit) * 100 : null),
        meta: fmtInt(s.sales) + ' paid ÷ ' + fmtInt(s.wallHit) + ' who crossed day ' + wallExit() + ' in this range',
        split: splitOf(function (x) { return fmtPct(x.wallHit ? (x.sales / x.wallHit) * 100 : null); })
      }),
      tile({
        label: 'Lifetime convert — past trial', value: fmtPct(s.convOfOutOfTrial),
        meta: 'all-time paid ÷ everyone all-time past day ' + trialDays(),
        split: splitOf(function (x) { return fmtPct(x.convOfOutOfTrial); })
      }),
      tile({
        label: 'Lifetime convert — at the wall', value: fmtPct(s.convOfWall),
        meta: 'all-time paid ÷ everyone all-time past day ' + wallDays(),
        split: splitOf(function (x) { return fmtPct(x.convOfWall); })
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
      { name: 'Now past day ' + wallDays(), sub: 'of those installs, day ' + wallExit() + '+ by now',
        v: s.cohortPastWall, color: ENTITY.wallHit },
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
          mk(rows, main, 'wallHit', 'Past day ' + wallDays(), ENTITY.wallHit, 'bar'),
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
          mk(rows, main, 'paidOfTrial', 'of everyone past day ' + trialDays(), ENTITY.trialEnd, 'line'),
          mk(rows, main, 'paidOfWall', 'of everyone past day ' + wallDays(), ENTITY.wallHit, 'line')
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
      if (age >= Wd) matured.wall += x.downloads;
      else if (age >= T) matured.trial += x.downloads;
      else matured.young += x.downloads;
    });

    document.getElementById('cohTiles').innerHTML = [
      tile({ label: 'Cohorts in range', value: fmtInt(rows.length), smallValue: true, meta: 'grouped by ' + grain }),
      tile({ label: 'Installs in these cohorts', color: ENTITY.downloads, value: fmtInt(totalCohort) }),
      tile({ label: 'Fully past the wall', color: ENTITY.wallHit, value: fmtInt(matured.wall), meta: pctOf(matured.wall, totalCohort) + ' of these installs' }),
      tile({ label: 'Still inside the trial', color: ENTITY.inTrial, value: fmtInt(matured.young), meta: 'too young to judge — ' + pctOf(matured.young, totalCohort) + ' of these installs' })
    ].join('');

    var head = '<tr><th>Cohort</th><th>Age (days)</th><th style="text-align:left">Status</th><th>Installs</th><th>iOS</th><th>Android</th>' +
      '<th>Share</th><th>Cumulative</th></tr>';
    var run = 0;
    var body = rows.slice().reverse().map(function (x) {
      var age = diffDays(x.start, now);
      var status = age >= Wd ? '<span class="pill past14">Past the ' + wallDays() + '-day window</span>'
        : age >= T ? '<span class="pill past7">Past trial</span>'
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
    var young = [], mid = [], old = [];
    rows.forEach(function (x) {
      var age = diffDays(x.start, now);
      young.push(age < T ? x.downloads : 0);
      mid.push(age >= T && age < Wd ? x.downloads : 0);
      old.push(age >= Wd ? x.downloads : 0);
    });
    drawChart('cohChart', {
      x: rows.map(function (x) { return bucketLabel(x.key, grain); }),
      series: [
        { key: 'young', name: 'Still in trial', color: ENTITY.inTrial, type: 'bar', values: young },
        { key: 'mid', name: 'Past trial, charts open', color: ENTITY.trialEnd, type: 'bar', values: mid },
        { key: 'old', name: 'Past the ' + wallDays() + '-day wall', color: ENTITY.wallHit, type: 'bar', values: old }
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
  var pings = { status: 'idle', report: null, at: null, error: '' };
  var pingUI = { tlMode: 'usage', tlMetric: 'active', curveMode: 'all', heatGrain: 'week', cohort: null, event: null, editing: null };

  var PC = {
    fresh: COLOR.green,        // first run — an install the counter had not seen
    back: COLOR.s1,            // returning
    active: COLOR.s1,
    downloads: COLOR.s2,       // store-sourced, deliberately not the blue above
    pageViews: COLOR.s5,
    subs: ENTITY.sales,        // violet, as "paid" is everywhere else
    trial: COLOR.green,
    postTrial: COLOR.gold,
    wall: COLOR.red
  };

  /* Both ping-fed views repaint when the fetch lands. Naming only one of them
     here is how the Timeline tab ended up rendering an empty chart: the data
     arrived, and nothing asked the view to draw it again. */
  function repaintPingViews() {
    if (state.view === 'ping') renderPing();
    else if (state.view === 'timeline') renderTimelineView();
  }

  /* The filter bar's platform, as the ping index speaks it. `compare` has no
     meaning here — a retention matrix is one population, not two side by side —
     so it reads as "all", and the platform tile carries the split instead. */
  function pingPlatform() {
    return (state.platform === 'ios' || state.platform === 'android') ? state.platform : 'all';
  }

  function pingLoad(force) {
    if (pings.status === 'loading') return Promise.resolve();
    if (pings.status === 'ready' && !force) return Promise.resolve();
    pings.status = 'loading';
    pings.error = '';
    /* Only repaint into the loading state when there is nothing on screen to
       keep. A refetch holds the numbers it already has and swaps them when the
       new ones land — tearing the view down and rebuilding it is the whole
       reason the page used to blink on every refresh. */
    if (!pings.report) repaintPingViews();
    return window.Api.call('PINGS', { since: addDays(today(), -PING_DAYS) }).then(function (res) {
      pings.report = res || { open: [], sub: [] };
      pings.at = new Date();
      pings.status = 'ready';
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
   * Campaigns, as annotations. Same argument as releases: the Costs view
   * already knows the day each one started and stopped, so a hand-entered
   * MARKETING event beside it would be a second copy free to drift. They are
   * derived and therefore not editable from the event form — the campaign
   * itself is edited on the Costs tab.
   */
  function adEvents() {
    return CS.adMarks(ads()).map(function (m) {
      return {
        id: m.id,
        date: m.date,
        category: 'MARKETING',
        type: m.ad.channel || 'Campaign',
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

  /* Clicking a flag anywhere in the dashboard opens its before/after, which
     lives on the Timeline tab — so a click from another view switches to it
     rather than rendering the analysis somewhere it does not belong. */
  function onMarkClick(mark) {
    pingUI.event = mark.id;
    if (state.view !== 'timeline') { setView('timeline'); return; }
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

    var hosts = ['pgTiles', 'pgTilesB', 'pgHeat', 'pgCohortDetail', 'pgTransitions', 'pgConversion', 'pgWeekdayRetention'];
    if (!ready || blank) hosts.forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.innerHTML = '';
    });
    if (!ready) return;

    document.getElementById('pgAsOf').textContent = blank ? '' :
      'counter data through ' + labelFull(ix.last) + (ix.last === today() ? ' · today still running' : '');

    if (blank) {
      document.getElementById('pgHeat').innerHTML =
        '<div class="empty">No pings yet. The counter starts filling the first time a build carrying it is opened.</div>';
      ['pgTimeline', 'pgCurve', 'pgSurvival', 'pgActiveCohort', 'pgPurchaseAge', 'pgWeekday'].forEach(function (id) {
        drawChart(id, { x: [], series: [], emptyText: 'Waiting for the first ping.' });
      });
      return;
    }

    var r = pingRange(ix);
    var days = A.range(r.from, r.to);
    var marks = marksFor(days);

    renderPingTiles(ix, r, days);
    renderTimeline(ix, days, marks);
    renderCurve(ix);
    renderSurvival(ix);
    renderHeat(ix);
    renderActiveByCohort(ix);
    renderPurchases(ix, r);
    renderPingWeekday(ix, days);
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

  function renderPingTiles(ix, r, days) {
    var latest = ix.last;
    var activeToday = A.activeOn(ix, latest);
    var returningToday = A.returningOn(ix, latest);

    var avg = 0, avgRet = 0;
    days.forEach(function (d) { avg += A.activeOn(ix, d); avgRet += A.returningOn(ix, d); });
    avg = days.length ? avg / days.length : 0;
    avgRet = days.length ? avgRet / days.length : 0;

    // previous window of equal length, only when the counter covered all of it
    var prevTo = addDays(r.from, -1), prevFrom = addDays(prevTo, -(days.length - 1));
    var covered = ix.first && prevFrom >= ix.first;
    var prevAvg = 0, prevAvgRet = 0;
    if (covered) {
      A.range(prevFrom, prevTo).forEach(function (d) { prevAvg += A.activeOn(ix, d); prevAvgRet += A.returningOn(ix, d); });
      prevAvg /= days.length; prevAvgRet /= days.length;
    }
    var dActive = covered && prevAvg ? ((avg - prevAvg) / prevAvg) * 100 : null;
    var dRet = covered && prevAvgRet ? ((avgRet - prevAvgRet) / prevAvgRet) * 100 : null;

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
    var conv7 = A.conversion(ix, ix.cohorts, 7);
    var conv30 = A.conversion(ix, ix.cohorts, 30);

    document.getElementById('pgTiles').innerHTML = [
      tile({
        label: 'Active on ' + labelDay(ix.last), color: PC.active, value: fmtInt(activeToday),
        delta: dActive,
        meta: fmtInt(Math.round(avg)) + '/day across this range',
        split: [{ name: 'returning', color: PC.back, value: fmtInt(returningToday) },
                { name: 'first run', color: PC.fresh, value: fmtInt(A.newOn(ix, ix.last)) }]
      }),
      tile({
        label: 'Returning / day', color: PC.back, value: fmtInt(Math.round(avgRet)), delta: dRet,
        meta: 'the number that says the product is holding people'
      }),
      tile({ label: 'D1 retention', color: PC.fresh, smallValue: true, value: fmtRate(d1), meta: rateMeta(d1) }),
      tile({ label: 'D7 retention', color: PC.trial, smallValue: true, value: fmtRate(d7),
             meta: 'last day of the trial · ' + rateMeta(d7) }),
      tile({ label: 'D14 retention', color: PC.postTrial, smallValue: true, value: fmtRate(d14),
             meta: 'last day of full history · ' + rateMeta(d14) }),
      tile({ label: 'D30 retention', color: PC.wall, smallValue: true, value: fmtRate(d30), meta: rateMeta(d30) })
    ].join('');

    document.getElementById('pgTilesB').innerHTML = [
      tile({
        label: 'Active in trial', color: PC.trial, value: fmtInt(live.inTrial),
        meta: 'day 0–7 · ' + fmtInt(started.inTrial) + ' started a trial in that window'
      }),
      tile({
        label: 'Active past the trial', color: PC.postTrial, value: fmtInt(live.postTrial),
        meta: 'day 8–14: free, full history still open'
      }),
      tile({
        label: 'Active past the wall', color: PC.wall, value: fmtInt(live.pastWall),
        meta: 'day 15+: older history needs Pro'
      }),
      tile({
        label: 'Purchases in range', color: PC.subs, value: fmtInt(subsRange),
        meta: 'subscribe pings, not store receipts'
      }),
      tile({
        label: 'Conversion by D7', color: PC.subs, smallValue: true, value: fmtRate(conv7),
        meta: rateMeta(conv7)
      }),
      tile({
        label: 'Conversion by D30', color: PC.subs, smallValue: true, value: fmtRate(conv30),
        meta: rateMeta(conv30)
      }),
      platformTile(ix)
    ].join('');
  }

  /* Which store the day's pings came from.
   *
   * Deliberately unfiltered even when the filter bar is on one platform: this
   * tile is what the rest of the view is a slice OF. `unknown` is the honest
   * bucket for builds that shipped before the ping carried a platform marker,
   * so it is shown when it is non-zero rather than folded into either store. */
  function platformTile(ix) {
    var split = A.platformsOn(ix, ix.last);
    var ios = split.I || 0, android = split.A || 0, unknown = split.U || 0;
    var known = ios + android;
    var parts = [
      { name: 'iOS', color: ENTITY.ios, value: fmtInt(ios) },
      { name: 'Android', color: ENTITY.android, value: fmtInt(android) }
    ];
    if (unknown) parts.push({ name: 'pre-marker', color: COLOR.muted, value: fmtInt(unknown) });
    return tile({
      label: 'Platform on ' + labelDay(ix.last), color: ENTITY.ios,
      value: known ? Math.round((ios / known) * 100) + '% iOS' : '--',
      smallValue: true,
      meta: 'of everything that pinged that day',
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
      marks: marks, onMarkClick: onMarkClick,
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
        { index: B.trialLastDay, label: 'trial ends', color: PC.trial },
        { index: B.firstWallDay, label: 'history wall', color: PC.wall }
      ],
      tooltipNote: function (i) {
        var p = A.retentionAt(ix, ix.cohorts, i);
        var note = p.available ? 'over ' + p.cohorts + ' cohort' + (p.cohorts === 1 ? '' : 's') +
          ' · ' + fmtInt(p.kept) + ' of ' + fmtInt(p.of) : 'not yet available';
        if (i === B.firstPostTrial) note += ' · first day outside the trial';
        if (i === B.firstWallDay) note += ' · first day the history wall applies';
        return note;
      }
    });
  }

  /* ---------------------------------------------------------- 3b. survival */

  function renderSurvival(ix) {
    var s = A.survival(ix, ix.cohorts);
    var labels = { 0: 'Install', 1: 'D1', 7: 'D7 (last trial day)', 8: 'D8 (post-trial)', 14: 'D14 (history open)', 15: 'D15 (wall)', 30: 'D30' };
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
      transitionHTML(s.trialEnd, 'Trial ends: D7 → D8', 'How many keep opening the app the day their trial runs out.') +
      transitionHTML(s.historyWall, 'History wall: D14 → D15', 'How many keep opening it the day older history closes.') +
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
      var cls = n === A.BOUNDARIES.firstPostTrial || n === A.BOUNDARIES.firstWallDay ? ' class="boundary"' : '';
      return '<th' + cls + '>D' + n + '</th>';
    }).join('') + '</tr>';

    var body = rows.map(function (row) {
      var small = row.size < A.SMALL_COHORT;
      var cells = row.cells.map(function (cell) {
        if (!cell.available) {
          return '<td class="heat immature" title="This cohort has not lived ' + cell.day + ' days yet — not zero, unknown"></td>';
        }
        var a = Math.min(1, Math.sqrt(Math.max(0, cell.pct) / 100)) * 0.85;
        var boundary = cell.day === A.BOUNDARIES.firstPostTrial || cell.day === A.BOUNDARIES.firstWallDay;
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

  function renderActiveByCohort(ix) {
    var abc = A.activeByCohort(ix, ix.last);
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
      guides: [guideAt(B.firstPostTrial, 'post-trial', PC.trial),
               guideAt(B.firstWallDay, 'wall', PC.wall)].filter(Boolean),
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
          : r.age < B.firstWallDay ? '<span class="pill past7">Past trial</span>'
          : '<span class="pill past14">Past the wall</span>';
        return '<tr><td>' + esc(labelFull(r.cohort)) + '</td>' +
          '<td>D' + r.age + '</td>' +
          '<td style="text-align:left">' + stage + '</td>' +
          '<td>' + fmtInt(r.activeLatest) + '</td>' +
          '<td>' + fmtInt(r.days) + '</td>' +
          '<td>' + (r.lastSeen ? esc(labelDay(r.lastSeen)) : '–') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ----------------------------------------------------- 6. purchase timing */

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

    var conv7 = A.conversion(ix, ix.cohorts, 7);
    var conv30 = A.conversion(ix, ix.cohorts, 30);
    document.getElementById('pgConversion').innerHTML =
      '<div class="mini-rows">' +
      '<div><span>Bought by D7</span><b>' + fmtRate(conv7) + '</b><span class="note">' + rateMeta(conv7) + '</span></div>' +
      '<div><span>Bought by D30</span><b>' + fmtRate(conv30) + '</b><span class="note">' + rateMeta(conv30) + '</span></div>' +
      '</div>';
  }

  /* --------------------------------------------------------- 7. weekday */

  function renderPingWeekday(ix, days) {
    var dl = A.byWeekday(days, function (d) { return dayRec('all', d).downloads; });
    var fresh = A.byWeekday(days, function (d) { return A.newOn(ix, d); });
    var ret = A.byWeekday(days, function (d) { return A.returningOn(ix, d); });

    drawChart('pgWeekday', {
      x: WD.map(function (w) { return { label: w, full: WD_LONG[WD.indexOf(w)] }; }),
      /* Three grouped bars per weekday, not two bars and a line. On a 7-point
         axis a line degenerates into disconnected dots that are trivial to
         miss, and the comparison here is between three counts of people — the
         same kind of quantity, so they should carry the same kind of mark. */
      series: [
        { key: 'dl', name: 'Store downloads', color: PC.downloads, type: 'bar', values: dl.map(function (s) { return s.avg; }) },
        { key: 'fresh', name: 'First runs', color: PC.fresh, type: 'bar', values: fresh.map(function (s) { return s.avg; }) },
        { key: 'ret', name: 'Returning', color: PC.back, type: 'bar', values: ret.map(function (s) { return s.avg; }) }
      ],
      height: 240, format: function (v) { return v === null ? '–' : v.toFixed(1); }, xLabel: 'Weekday',
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

  function renderEvents(ix) {
    var list = events().slice().reverse();
    var host = document.getElementById('pgEventList');
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
      : '<div class="empty">No events recorded yet. Add the last release or campaign and it will appear on every chart above.</div>';

    host.querySelectorAll('.event-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.dataset.edit) return;
        pingUI.event = pingUI.event === row.dataset.id ? null : row.dataset.id;
        renderTimelineView();
      });
    });
    host.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openEventForm(btn.dataset.edit);
      });
    });

    renderEventAnalysis(ix);
  }

  function openEventForm(id) {
    var ev = id ? eventById(id) : null;
    // Releases come from the app's own log; this dashboard does not own them.
    if (ev && ev.derived) { toast('Releases come from the app\'s release log and are not edited here.'); return; }
    pingUI.editing = id || 'new';
    var host = document.getElementById('pgEventForm');
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
        renderTimelineView();
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
      renderTimelineView();
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

    var ba = A.beforeAfter(ix, db.entries, ev, 14);
    var rows = ba.metrics.map(function (m) {
      if (!m.available) {
        return '<tr><td>' + esc(m.label) + '</td><td class="na">–</td><td class="na">–</td>' +
          '<td class="na" colspan="2">not enough mature data on both sides</td></tr>';
      }
      var fmt = m.kind === 'pct' ? fmtPct : function (v) { return fmtInt(Math.round(v * 10) / 10); };
      var cls = m.delta > 0 ? 'up' : m.delta < 0 ? 'down' : 'flat';
      var deltaTxt = m.kind === 'pct'
        ? (m.delta > 0 ? '+' : '') + m.delta.toFixed(1) + ' pts'
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
       against a campaign or a release. The ping-derived view lives on App usage,
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
    var key = from + '|' + to + '|' + costList().length;
    if (spendDayCache.key === key) return;
    spendDayCache = { key: key, byDay: CS.daily(costList(), from, to).byDay };
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
      marks: marks, onMarkClick: onMarkClick,
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

    renderEvents(ix);
    renderReleases();
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
      ['Hit the wall (all time)', 'hitWall', fmtInt],
      ['Paid conversions (all time)', 'totalSales', fmtInt],
      ['Convert rate — past trial', 'convOfOutOfTrial', fmtPct],
      ['Convert rate — at the wall', 'convOfWall', fmtPct],
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
      { id: 'pfWall', title: 'Users hitting the ' + wallDays() + '-day wall', field: 'wallHit', fmt: fmtInt, type: 'line' },
      { id: 'pfSales', title: 'Paid conversions', field: 'sales', fmt: fmtInt, type: 'bar' },
      { id: 'pfConv', title: 'Cumulative convert rate at the wall', field: 'paidOfWall', fmt: fmtPct, type: 'line' },
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

  /* -------------------------------------------------------- view: costs

     What the app costs to run, against what it earns.

     Every number here is arithmetic from costs.js, which is pure and tested;
     this half is entry and rendering. Two things about it are worth knowing
     before reading on.

     The platform filter does NOT apply. A hosting bill is not iOS or Android,
     and splitting acquisition cost by store would need per-store spend that no
     network reports the same way. The view always reads both stores combined,
     and says so in the filter bar.

     Ad spend is stored as ordinary cost rows — one per campaign per day, with
     category ADS and an `adId`. The grid and the spread box are two ways of
     writing the same rows, which is why either can correct the other. */

  function ads() { return db.ads || (db.ads = []); }
  function costList() { return db.costs || (db.costs = []); }
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
    list.sort(function (a, b) { return (a.start || '') < (b.start || '') ? 1 : -1; });
    save(); invalidate();
  }

  /* Deleting a campaign keeps its money. The spend happened whether or not the
     campaign is still on the books, so its rows are detached rather than
     removed — they carry on as unattributed advertising and the totals do not
     move. Silently deleting a few thousand of spend to tidy a list would be the
     worst kind of helpful. */
  function removeAd(id) {
    var detached = 0;
    costList().forEach(function (c) {
      if (c.adId === id) { delete c.adId; detached++; }
    });
    db.ads = ads().filter(function (a) { return a.id !== id; });
    save(); invalidate();
    return detached;
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

  /** The one-off ad row for a campaign on a day, if it exists. */
  function adCostOn(adId, date) {
    var found = null;
    costList().forEach(function (c) {
      if (c.category !== 'ADS' || c.adId !== adId || c.date !== date) return;
      if (c.recurrence && c.recurrence !== 'none') return;   // the grid never edits a recurring row
      found = c;
    });
    return found;
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
    var d = CS.daily(costList(), from, to);
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
      costs: costList(), from: r.from, to: r.to, storeCutPct: storeCut(),
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
      yTickFormat: moneyTick, marks: marks, onMarkClick: onMarkClick,
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
     analysis tab never rebuilds a grid the reader is typing into, and the entry
     tab never recomputes four charts nobody is looking at. */
  function renderCostEntry() {
    renderAdTable('csAdTable', allTimeRange(), true);
    renderCostList();
    syncSpreadAds();
    if (!document.getElementById('csGrid').innerHTML) buildAdGrid();
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
    var spend = CS.spend(costList(), from, to);
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
    var out = CS.breakeven(costList(), netByDay, from, to);
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
      marks: marksFor(days), onMarkClick: onMarkClick,
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

    var chans = CS.perChannel(ads(), costList(), r.from, r.to);
    document.getElementById('csChannelTable').innerHTML = chans.length
      ? '<table><thead><tr><th>Channel</th><th class="money">Campaigns</th><th class="money">Spend</th>' +
        '<th class="money">Reported installs</th><th class="money">Reported CPI</th></tr></thead><tbody>' +
        chans.map(function (c) {
          return '<tr><td>' + esc(c.channel) + '</td><td class="money">' + fmtInt(c.ads) + '</td>' +
            '<td class="money">' + fmtMoney(c.spend) + '</td>' +
            '<td class="money">' + (c.installs ? fmtInt(c.installs) : '<span class="na">–</span>') + '</td>' +
            '<td class="money">' + fmtMoney(c.cpi) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="empty">No advertising spend in this range.</div>';
  }

  /**
   * The campaign table, drawn twice from one function.
   *
   * On Edit data it is the management list: editable, and all-time, because
   * that view has no filter bar and "spend on this campaign" is a lifetime
   * question when you are deciding whether to keep running it. On the Costs tab
   * it is read-only and scoped to the selected range, which is the reading
   * question. Same numbers, two jobs, one place they are computed.
   */
  function renderAdTable(hostId, r, editable) {
    var per = CS.perAd(ads(), costList(), r.from, r.to);
    var day = asOf();
    var host = document.getElementById(hostId);
    if (!host) return;
    if (!ads().length && !per.rows.length) {
      host.innerHTML = '<div class="empty">' + (editable
        ? 'No campaigns yet. Add one and its daily spend can be entered in the grid below.'
        : 'No campaigns yet. Add one under Edit data.') + '</div>';
      return;
    }
    host.innerHTML = '<table><thead><tr><th>Campaign</th><th>Channel</th><th>Status</th>' +
      '<th class="money">Spend</th><th class="money">Share</th><th class="money">Reported clicks</th>' +
      '<th class="money">Reported installs</th><th class="money">Reported CPI</th>' +
      (editable ? '<th></th>' : '') + '</tr></thead><tbody>' +
      per.rows.map(function (row) {
        var st = row.ad ? CS.adStatus(row.ad, day) : null;
        return '<tr><td>' + esc(row.name) +
          (row.ad && row.ad.platform && row.ad.platform !== 'all'
            ? ' <span class="note">' + esc(PLATFORMS[row.ad.platform] || row.ad.platform) + '</span>' : '') +
          '</td>' +
          '<td>' + esc(row.channel || '–') + '</td>' +
          '<td>' + (st ? '<span class="pill ' + st + '">' + st + '</span>' : '<span class="note">detached</span>') + '</td>' +
          '<td class="money">' + fmtMoney(row.spend) + '</td>' +
          '<td class="money">' + (row.share === null ? '–' : row.share.toFixed(1) + '%') + '</td>' +
          '<td class="money">' + (row.clicks ? fmtInt(row.clicks) : '<span class="na">–</span>') + '</td>' +
          '<td class="money">' + (row.installs ? fmtInt(row.installs) : '<span class="na">–</span>') + '</td>' +
          '<td class="money">' + fmtMoney(row.cpi) + '</td>' +
          (editable
            ? '<td>' + (row.id ? '<button class="btn sm" data-ad-edit="' + esc(row.id) + '">Edit</button>' : '') + '</td>'
            : '') +
          '</tr>';
      }).join('') +
      '<tr><td><b>Total</b></td><td></td><td></td><td class="money"><b>' + fmtMoney(per.total) + '</b></td>' +
      '<td colspan="' + (editable ? 5 : 4) + '"></td></tr></tbody></table>';

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

  function openAdForm(id) {
    var ad = id ? adById(id) : null;
    var host = document.getElementById('csAdForm');
    host.classList.remove('hidden');
    var channels = CS.CHANNELS.map(function (c) {
      return '<option value="' + esc(c) + '"' + (ad && ad.channel === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var plats = [['all', 'Both stores'], ['ios', 'iOS'], ['android', 'Android']].map(function (p) {
      return '<option value="' + p[0] + '"' + (ad && ad.platform === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
    }).join('');

    host.innerHTML = '<div class="event-form">' +
      '<div class="field grow"><label for="adName">Campaign name</label>' +
      '<input type="text" id="adName" maxlength="120" placeholder="Search Ads — POTS keywords" value="' + esc(ad ? ad.name : '') + '"></div>' +
      '<div class="field"><label for="adChannel">Channel</label><select id="adChannel">' + channels + '</select></div>' +
      '<div class="field"><label for="adPlatform">Store</label><select id="adPlatform">' + plats + '</select></div>' +
      '<div class="field"><label for="adStart">Started</label><input type="date" id="adStart" value="' + esc(ad ? ad.start : asOf()) + '"></div>' +
      '<div class="field"><label for="adEnd">Ended (blank = running)</label><input type="date" id="adEnd" value="' + esc(ad && ad.end ? ad.end : '') + '"></div>' +
      '<div class="field grow"><label for="adUrl">Link (optional)</label><input type="text" id="adUrl" placeholder="https://" value="' + esc(ad && ad.url ? ad.url : '') + '"></div>' +
      '<div class="field full"><label for="adNote">Notes</label><textarea id="adNote" rows="2" maxlength="2000">' + esc(ad && ad.note ? ad.note : '') + '</textarea></div>' +
      '<div class="event-form-actions">' +
      '<button class="btn primary" id="adSave">' + (ad ? 'Save campaign' : 'Add campaign') + '</button>' +
      '<button class="btn" id="adCancel">Cancel</button>' +
      (ad ? '<span class="spacer"></span><button class="btn danger" id="adDelete">Delete</button>' : '') +
      '</div></div>';

    document.getElementById('adCancel').addEventListener('click', closeAdForm);
    if (ad) {
      document.getElementById('adDelete').addEventListener('click', function () {
        var spent = CS.spend(costList(), '0000-01-01', '9999-12-31', function (c) { return c.adId === ad.id; });
        if (!confirm('Delete "' + ad.name + '"? Its ' + fmtMoney(spent) +
          ' of recorded spend is kept and reported as unattributed advertising.')) return;
        var n = removeAd(ad.id);
        closeAdForm();
        renderAll();
        toast(n ? 'Campaign deleted — ' + n + ' cost row' + (n === 1 ? '' : 's') + ' kept as unattributed.' : 'Campaign deleted.');
      });
    }
    document.getElementById('adSave').addEventListener('click', function () {
      var name = document.getElementById('adName').value.trim();
      var start = document.getElementById('adStart').value;
      var end = document.getElementById('adEnd').value;
      if (!name) { toast('A campaign needs a name.'); return; }
      if (!start) { toast('A campaign needs a start date.'); return; }
      if (end && end < start) { toast('The end date is before the start date.'); return; }
      putAd({
        id: ad ? ad.id : newId('ad'),
        name: name,
        channel: document.getElementById('adChannel').value,
        platform: document.getElementById('adPlatform').value,
        start: start,
        end: end || undefined,
        url: document.getElementById('adUrl').value.trim() || undefined,
        note: document.getElementById('adNote').value.trim() || undefined
      });
      closeAdForm();
      buildAdGrid();
      renderAll();
      toast(ad ? 'Campaign saved.' : 'Campaign added.');
    });
    document.getElementById('adName').focus();
  }

  function closeAdForm() {
    var host = document.getElementById('csAdForm');
    host.classList.add('hidden');
    host.innerHTML = '';
  }

  /* ------------------------------------------------------- the cost list */

  /* The ledger. Every row, newest first, unscoped — this is the list you check
     a charge against, and a cost filtered out by a range selected on another
     tab is a cost you would swear you had entered. */
  function renderCostList() {
    var list = costList();
    var host = document.getElementById('csCostTable');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="empty">No costs recorded yet.</div>';
      return;
    }
    var r = allTimeRange();

    host.innerHTML = '<table><thead><tr><th>Date</th><th>Category</th><th>What</th>' +
      '<th class="money">Amount</th><th class="money">Charged so far</th><th></th></tr></thead><tbody>' +
      list.map(function (c) {
        var cat = CS.CATEGORIES[c.category] || CS.CATEGORIES.OTHER;
        var hits = CS.occurrences(c, r.from, r.to).length;
        var rec = c.recurrence && c.recurrence !== 'none' ? CS.RECURRENCES[c.recurrence] : null;
        var ad = c.adId ? adById(c.adId) : null;
        return '<tr><td>' + esc(labelFull(c.date)) +
          (rec ? '<br><span class="repeats">' + esc(rec.label.toLowerCase()) +
            (c.until ? ' until ' + esc(labelDay(c.until)) : '') + '</span>' : '') + '</td>' +
          '<td><span class="cat-dot" style="background:' + cat.color + '"></span>' + esc(cat.label) + '</td>' +
          '<td>' + esc(c.label || (ad ? ad.name : '') || '–') +
          (ad ? ' <span class="note">' + esc(ad.channel || 'campaign') + '</span>' : '') +
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
    var host = document.getElementById('csCostForm');
    host.classList.remove('hidden');

    var cats = CS.CATEGORY_KEYS.map(function (k) {
      return '<option value="' + k + '"' + (c && c.category === k ? ' selected' : (!c && k === 'INFRA' ? ' selected' : '')) + '>' +
        esc(CS.CATEGORIES[k].label) + '</option>';
    }).join('');
    var recs = Object.keys(CS.RECURRENCES).map(function (k) {
      return '<option value="' + k + '"' + (c && c.recurrence === k ? ' selected' : '') + '>' +
        esc(CS.RECURRENCES[k].label) + '</option>';
    }).join('');
    var adOpts = '<option value="">Not a campaign</option>' + ads().map(function (a) {
      return '<option value="' + esc(a.id) + '"' + (c && c.adId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>';
    }).join('');

    host.innerHTML = '<div class="event-form">' +
      '<div class="field"><label for="coDate">Date charged</label><input type="date" id="coDate" value="' + esc(c ? c.date : asOf()) + '"></div>' +
      '<div class="field"><label for="coCategory">Category</label><select id="coCategory">' + cats + '</select></div>' +
      '<div class="field grow"><label for="coLabel">What it was</label>' +
      '<input type="text" id="coLabel" maxlength="200" placeholder="Apple Developer Program" value="' + esc(c && c.label ? c.label : '') + '"></div>' +
      '<div class="field"><label for="coAmount">Amount</label><input type="number" id="coAmount" step="0.01" value="' + (c && c.amount !== undefined ? c.amount : '') + '"></div>' +
      '<div class="field"><label for="coRecurrence">Repeats</label><select id="coRecurrence">' + recs + '</select></div>' +
      '<div class="field"><label for="coUntil">Repeat until (blank = still paying)</label><input type="date" id="coUntil" value="' + esc(c && c.until ? c.until : '') + '"></div>' +
      '<div class="field"><label for="coAd">Campaign</label><select id="coAd">' + adOpts + '</select></div>' +
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
      var adId = document.getElementById('coAd').value;
      putCost({
        id: c ? c.id : newId('co'),
        date: date,
        category: document.getElementById('coCategory').value,
        label: document.getElementById('coLabel').value.trim() || undefined,
        amount: Number(amount),
        recurrence: rec === 'none' ? undefined : rec,
        until: rec === 'none' || !until ? undefined : until,
        adId: adId || undefined,
        note: document.getElementById('coNote').value.trim() || undefined,
        // network-reported counts survive an edit through this form
        impressions: c ? c.impressions : undefined,
        clicks: c ? c.clicks : undefined,
        installs: c ? c.installs : undefined
      });
      closeCostForm();
      buildAdGrid();
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

  /* --------------------------------------------------------- spend grid */

  var gridDays = [];      // rows: ISO dates
  var gridAds = [];       // columns: campaigns
  var gridFields = ['amount'];

  var GRID_FIELDS = {
    amount: { label: 'Spend', step: '0.01' },
    impressions: { label: 'Impressions', step: '1' },
    clicks: { label: 'Clicks', step: '1' },
    installs: { label: 'Installs', step: '1' }
  };

  /* Columns are the campaigns that could plausibly have spent money in the
     window: anything running in it, plus anything that already has a row there.
     A campaign that ended last year is not offered a column it would only be
     scrolled past. */
  function gridCampaigns(from, to) {
    return ads().filter(function (a) {
      if (!a.start || a.start > to) return false;
      if (a.end && a.end < from) {
        return costList().some(function (c) {
          return c.adId === a.id && c.date >= from && c.date <= to;
        });
      }
      return true;
    });
  }

  function buildAdGrid() {
    var fromEl = document.getElementById('csGridFrom');
    var toEl = document.getElementById('csGridTo');
    if (!fromEl.value) fromEl.value = addDays(asOf(), -13);
    if (!toEl.value) toEl.value = asOf();
    var from = fromEl.value, to = toEl.value;
    if (from > to) { var t = from; from = to; to = t; }

    gridFields = document.getElementById('csGridExtra').value === 'all'
      ? ['amount', 'impressions', 'clicks', 'installs'] : ['amount'];
    gridDays = CS.days(from, to).reverse();     // newest first, like every other list here
    gridAds = gridCampaigns(from, to);

    var host = document.getElementById('csGrid');
    var count = document.getElementById('csGridCount');
    if (!gridAds.length) {
      host.innerHTML = '<div class="empty">No campaigns ran in this window. Add one above, or widen the dates.</div>';
      count.textContent = '';
      return;
    }
    if (!gridDays.length) { host.innerHTML = '<div class="empty">Pick a date range.</div>'; return; }

    var head = '<tr><th class="day-col" rowspan="' + (gridFields.length > 1 ? 2 : 1) + '">Day</th>' +
      gridAds.map(function (a) {
        return '<th class="ad-head" colspan="' + gridFields.length + '">' + esc(a.name) +
          '<span class="sub">' + esc(a.channel || '') + '</span></th>';
      }).join('') + '</tr>';
    if (gridFields.length > 1) {
      head += '<tr>' + gridAds.map(function () {
        return gridFields.map(function (f) { return '<th class="ad-head">' + GRID_FIELDS[f].label + '</th>'; }).join('');
      }).join('') + '</tr>';
    }

    var body = gridDays.map(function (day, ri) {
      var wd = dow(day);
      var cells = '';
      gridAds.forEach(function (a, ai) {
        var existing = adCostOn(a.id, day);
        gridFields.forEach(function (f, fi) {
          var c = ai * gridFields.length + fi;
          var v = existing ? existing[f] : undefined;
          cells += '<td class="num-edit"><input type="number" step="' + GRID_FIELDS[f].step + '" min="0" ' +
            'data-r="' + ri + '" data-c="' + c + '" data-day="' + day + '" data-ad="' + esc(a.id) + '" ' +
            'data-field="' + f + '" value="' + (v === undefined || v === null ? '' : v) + '"></td>';
        });
      });
      return '<tr' + (wd >= 5 ? ' class="weekend"' : '') + '><td class="day-col">' +
        WD[wd] + ' ' + esc(labelDay(day)) + '</td>' + cells + '</tr>';
    }).join('');

    host.innerHTML = '<div class="table-scroll full"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    count.textContent = gridDays.length + ' days × ' + gridAds.length + ' campaign' + (gridAds.length === 1 ? '' : 's');
  }

  function gridCell(r, c) {
    return document.querySelector('#csGrid input[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function saveAdGrid() {
    var inputs = document.querySelectorAll('#csGrid input[data-day]');
    var touched = {};
    inputs.forEach(function (el) {
      var key = el.dataset.ad + '|' + el.dataset.day;
      var rec = touched[key] || (touched[key] = { adId: el.dataset.ad, day: el.dataset.day, fields: {} });
      rec.fields[el.dataset.field] = el.value === '' ? null : cleanNum(el.value);
    });

    var written = 0, removed = 0;
    Object.keys(touched).forEach(function (key) {
      var rec = touched[key];
      var existing = adCostOn(rec.adId, rec.day);
      var amount = rec.fields.amount;
      var hasExtras = ['impressions', 'clicks', 'installs'].some(function (f) {
        return rec.fields[f] !== undefined && rec.fields[f] !== null && rec.fields[f] !== 0;
      });

      /* A blanked spend cell means "this day cost nothing", which is a deletion
         rather than a zero — a wall of zero rows would make the cost list
         unreadable and change none of the totals. Reported counts on their own
         are not enough to keep a row: they describe spend that is not there. */
      if ((amount === null || amount === 0) && !hasExtras) {
        if (existing) { removeCost(existing.id); removed++; }
        return;
      }
      var next = existing ? Object.assign({}, existing) : {
        id: newId('co'), date: rec.day, category: 'ADS', adId: rec.adId
      };
      next.amount = amount === null ? 0 : amount;
      ['impressions', 'clicks', 'installs'].forEach(function (f) {
        if (rec.fields[f] === undefined) return;
        if (rec.fields[f] === null || rec.fields[f] === 0) delete next[f];
        else next[f] = rec.fields[f];
      });
      var before = existing ? JSON.stringify(existing) : null;
      if (before !== JSON.stringify(next)) { putCost(next); written++; }
    });

    document.getElementById('csGridStatus').textContent =
      written || removed
        ? 'Saved ' + written + ' day' + (written === 1 ? '' : 's') +
          (removed ? ', cleared ' + removed : '') + '.'
        : 'Nothing changed.';
    if (written || removed) toast('Ad spend saved.');
    buildAdGrid();
    renderAll();
  }

  function gridPaste(ev) {
    var input = ev.target.closest('#csGrid input[data-r]');
    if (!input) return;
    var text = (ev.clipboardData || window.clipboardData).getData('text');
    if (!text) return;
    if (!/[\t\n\r]/.test(text) && text.indexOf(',') === -1) return;
    ev.preventDefault();

    var lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    var sep = text.indexOf('\t') !== -1 ? '\t' : ',';
    var r0 = +input.dataset.r, c0 = +input.dataset.c, filled = 0;
    lines.forEach(function (line, dr) {
      line.split(sep).forEach(function (cell, dc) {
        var el = gridCell(r0 + dr, c0 + dc);
        if (!el) return;
        // currency symbols and thousands separators come along with a paste from
        // any ad network's export; strip them rather than reject the row
        var val = cell.trim().replace(/^"|"$/g, '').replace(/[^0-9.\-]/g, '');
        el.value = val === '' ? '' : String(cleanNum(val));
        filled++;
      });
    });
    document.getElementById('csGridStatus').textContent = 'Pasted ' + filled + ' cells — not saved yet.';
  }

  /* ----------------------------------------------------- spread a total */

  function syncSpreadAds() {
    var sel = document.getElementById('csSpreadAd');
    var keep = sel.value;
    sel.innerHTML = ads().length
      ? ads().map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('')
      : '<option value="">No campaigns yet</option>';
    if (keep) sel.value = keep;
  }

  function spreadTotal() {
    var adId = document.getElementById('csSpreadAd').value;
    var from = document.getElementById('csSpreadFrom').value;
    var to = document.getElementById('csSpreadTo').value;
    var total = document.getElementById('csSpreadTotal').value;
    var installs = document.getElementById('csSpreadInstalls').value;
    var status = document.getElementById('csSpreadStatus');

    if (!adId) { toast('Add a campaign first.'); return; }
    if (!from || !to) { toast('Pick both dates.'); return; }
    if (from > to) { var t = from; from = to; to = t; }
    if (total === '') { toast('Enter the total spent.'); return; }

    var days = CS.days(from, to);
    var cents = Math.round(cleanNum(total) * 100);
    var per = Math.floor(cents / days.length);
    var remainder = cents - per * days.length;
    var inst = installs === '' ? null : Math.round(cleanNum(installs));
    var perInst = inst === null ? null : Math.floor(inst / days.length);
    var instRemainder = inst === null ? 0 : inst - perInst * days.length;

    days.forEach(function (day, i) {
      var last = i === days.length - 1;
      var existing = adCostOn(adId, day);
      var next = existing ? Object.assign({}, existing) : { id: newId('co'), date: day, category: 'ADS', adId: adId };
      next.amount = (per + (last ? remainder : 0)) / 100;
      if (inst !== null) {
        var v = perInst + (last ? instRemainder : 0);
        if (v) next.installs = v; else delete next.installs;
      }
      putCost(next);
    });

    status.textContent = 'Wrote ' + days.length + ' daily rows totalling ' +
      fmtMoney(cents / 100) + ' — the grid above can correct any of them.';
    toast('Spread ' + fmtMoney(cents / 100) + ' over ' + days.length + ' days.');
    buildAdGrid();
    renderAll();
  }

  /* --------------------------------------------------------------- csv */

  function costsCSV() {
    var cols = ['date', 'category', 'label', 'amount', 'recurrence', 'until', 'campaign', 'channel',
      'impressions', 'clicks', 'installs', 'note'];
    var lines = [cols.join(',')];
    costList().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (c) {
      var ad = c.adId ? adById(c.adId) : null;
      var row = {
        date: c.date, category: c.category, label: c.label || '', amount: num(c.amount),
        recurrence: c.recurrence || 'none', until: c.until || '',
        campaign: ad ? ad.name : '', channel: ad ? (ad.channel || '') : '',
        impressions: c.impressions || '', clicks: c.clicks || '', installs: c.installs || '',
        note: c.note || ''
      };
      lines.push(cols.map(function (k) {
        var v = String(row[k] === undefined || row[k] === null ? '' : row[k]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    return lines.join('\n');
  }

  /* ------------------------------------------------------------ wiring */

  function wireCosts() {
    document.getElementById('csGoEdit').addEventListener('click', function () {
      setView('data');
      var head = document.getElementById('csAdTable');
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

    document.getElementById('csGridBuild').addEventListener('click', buildAdGrid);
    document.getElementById('csGridExtra').addEventListener('change', buildAdGrid);
    ['csGridFrom', 'csGridTo'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', buildAdGrid);
    });
    document.getElementById('csGridSave').addEventListener('click', saveAdGrid);

    var grid = document.getElementById('csGrid');
    grid.addEventListener('paste', gridPaste);
    grid.addEventListener('keydown', function (ev) {
      var i = ev.target.closest('input[data-r]');
      if (!i) return;
      var r = +i.dataset.r, c = +i.dataset.c, next = null;
      if (ev.key === 'Enter' || ev.key === 'ArrowDown') next = gridCell(r + 1, c);
      else if (ev.key === 'ArrowUp') next = gridCell(r - 1, c);
      else return;
      ev.preventDefault();
      if (next) { next.focus(); next.select(); }
    });

    document.getElementById('csSpreadGo').addEventListener('click', spreadTotal);
    document.getElementById('csSpreadTo').value = asOf();
    document.getElementById('csSpreadFrom').value = addDays(asOf(), -6);
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
    renderCostEntry();
  }

  /* ------------------------------------------------------ view: forecast */

  function fcModel() { return (state.fc && state.fc.model) || 'monthly'; }
  function fcIsSub() { return fcModel() !== 'onetime'; }

  function renderForecastControls(a) {
    var host = document.getElementById('fcControls');
    host.innerHTML = FC_CONTROLS.filter(function (c) {
      return !(c.subsOnly && !fcIsSub());
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
            : (c.needsSales && !a.hasSales ? 'no sales on record yet — assumption'
              : 'from your data: ' + c.fmt(act))) +
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
        ? 'Annual plans are shown as monthly recurring revenue — the yearly price spread across twelve months.'
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
        label: 'Revenue through ' + fcEndLabel(), color: ENTITY.sales, value: fmtMoney(exp.totalRevenue),
        meta: rangeMeta(bear.totalRevenue, bull.totalRevenue, fmtMoney)
      }),
      tile({
        label: 'Revenue, next 30 days', value: fmtMoney(exp.revenueNext30), smallValue: true,
        meta: rangeMeta(bear.revenueNext30, bull.revenueNext30, fmtMoney)
      }),
      tile({
        label: (model === 'onetime' ? 'Buyers in ' : 'Paying users in ') + fcEndLabel(),
        color: ENTITY.trialEnd, value: fmtInt(model === 'onetime' ? a.payers + exp.totalConv : exp.endPayers),
        meta: model === 'onetime'
          ? 'starting from ' + fmtInt(a.payers) + ' today'
          : rangeMeta(bear.endPayers, bull.endPayers, fmtInt) + ' · from ' + fmtInt(a.payers) + ' today'
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
    var head = '<tr><th>Month</th><th>New installs</th><th>New paying</th><th>' +
      (fcIsSub() ? 'Paying users' : 'Buyers') + '</th><th>' + esc(mrrLabel) + '</th><th>Revenue</th>' +
      '<th>Cumulative</th><th>Range (cumulative)</th></tr>';
    var body = exp.months.map(function (m, i) {
      return '<tr><td>' + bucketLabel(m.key, 'month').full + '</td>' +
        '<td>' + fmtInt(m.installs) + '</td>' +
        '<td>' + fmtInt(m.conv) + '</td>' +
        '<td>' + fmtInt(m.payers) + '</td>' +
        '<td>' + fmtMoney(m.mrr) + '</td>' +
        '<td>' + fmtMoney(m.revenue) + '</td>' +
        '<td>' + fmtMoney(m.cumRevenue) + '</td>' +
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
      (model === 'onetime' ? 'one-time purchase' : model === 'annual' ? 'annual subscription' : 'monthly subscription'));
    L.push('Platform: ' + (o.platform === 'all' ? 'combined' : platName(o.platform)));
    L.push('');
    L.push('## Assumptions (expected case)');
    L.push('New installs/day        ' + fmtInt(o.installs));
    L.push('Install growth/month    ' + (o.growth * 100).toFixed(1) + '%');
    L.push('Convert rate at wall    ' + (o.conv * 100).toFixed(2) + '%');
    L.push('Price per paying user   ' + fmtMoney(o.price));
    if (model !== 'onetime') L.push('Monthly churn           ' + (o.churn * 100).toFixed(2) + '%');
    L.push('Starting paying users   ' + fmtInt(o.startPayers));
    L.push('Scenario spread         ±' + fcValue('spread', sc.actuals) + '%');
    L.push('');
    L.push('## Outcome by ' + fcEndLabel() + ' (bear / expected / optimistic)');
    L.push((model === 'onetime' ? 'Monthly revenue  ' : 'MRR              ') +
      fmtMoney(bear.endMrr) + ' / ' + fmtMoney(exp.endMrr) + ' / ' + fmtMoney(bull.endMrr));
    L.push('ARR              ' + fmtMoney(bear.endMrr * 12) + ' / ' + fmtMoney(exp.endMrr * 12) + ' / ' + fmtMoney(bull.endMrr * 12));
    L.push('Total revenue    ' + fmtMoney(bear.totalRevenue) + ' / ' + fmtMoney(exp.totalRevenue) + ' / ' + fmtMoney(bull.totalRevenue));
    L.push('Paying users     ' + fmtInt(bear.endPayers) + ' / ' + fmtInt(exp.endPayers) + ' / ' + fmtInt(bull.endPayers));
    L.push('New installs     ' + fmtInt(bear.totalInstalls) + ' / ' + fmtInt(exp.totalInstalls) + ' / ' + fmtInt(bull.totalInstalls));
    L.push('New conversions  ' + fmtInt(bear.totalConv) + ' / ' + fmtInt(exp.totalConv) + ' / ' + fmtInt(bull.totalConv));
    L.push('');
    L.push('## Month by month (expected)');
    L.push(pad2('month', 12) + padL('installs', 10) + padL('new paying', 12) +
      padL('paying', 9) + padL('mrr', 12) + padL('revenue', 12) + padL('cumulative', 13));
    exp.months.forEach(function (m) {
      L.push(pad2(m.key.slice(0, 7), 12) + padL(fmtInt(m.installs), 10) + padL(fmtInt(m.conv), 12) +
        padL(fmtInt(m.payers), 9) + padL(fmtMoney(m.mrr), 12) + padL(fmtMoney(m.revenue), 12) +
        padL(fmtMoney(m.cumRevenue), 13));
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
    { f: 'sales', label: 'Sales' },
    { f: 'revenue', label: 'Amount' },
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
    return {
      installs: recent.downloads / covered,
      growth: growth * 100,
      conv: hasSales && all.convOfWall ? all.convOfWall : 3,
      price: hasSales && all.arppu ? all.arppu : 4.99,
      payers: all.totalSales,
      hasSales: hasSales,
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
      min: function () { return 0; },
      max: function (a) { return Math.max(100, Math.ceil(a.price * 4)); } },
    { key: 'churn', label: 'Monthly churn', step: 0.25, fmt: function (v) { return v.toFixed(2) + '%'; },
      min: function () { return 0; }, max: function () { return 40; }, subsOnly: true,
      note: 'no churn data yet — assumption' },
    { key: 'spread', label: 'Scenario spread', step: 5, fmt: function (v) { return '±' + v.toFixed(0) + '%'; },
      min: function () { return 5; }, max: function () { return 80; },
      note: 'width of the bear / optimistic band' }
  ];
  var FC_FALLBACK = { churn: 5, spread: 35 };

  /* a control's live value: the user's override if set, else the derived actual */
  function fcValue(key, a) {
    var v = state.fc && state.fc[key];
    if (v !== null && v !== undefined && !isNaN(v)) return +v;
    if (key in FC_FALLBACK) return FC_FALLBACK[key];
    return a[key];
  }
  function fcIsOverridden(key) {
    var v = state.fc && state.fc[key];
    return v !== null && v !== undefined && !isNaN(v);
  }
  function fcActualFor(key, a) { return key in FC_FALLBACK ? FC_FALLBACK[key] : a[key]; }

  /* One scenario run. Returns per-calendar-month rollups plus end-state totals. */
  function fcRun(o) {
    var days = o.days;
    var gDaily = Math.pow(1 + o.growth, 1 / DPM) - 1;
    var churnDaily = o.model === 'onetime' ? 0 : 1 - Math.pow(1 - o.churn, 1 / DPM);
    var lag = wallExit();
    var start = asOf();

    var installs = new Array(days + 1);
    for (var t = 1; t <= days; t++) installs[t] = o.installs * Math.pow(1 + gDaily, t);

    var payers = o.model === 'onetime' ? 0 : o.startPayers;
    var months = {}, order = [];
    var cumRev = 0, totInstalls = 0, totConv = 0, rev30 = 0;

    for (var t2 = 1; t2 <= days; t2++) {
      var date = addDays(start, t2);
      var srcT = t2 - lag;
      // before the lag is up, the cohort hitting the wall is one we already recorded
      var wall = srcT >= 1 ? installs[srcT] : dayRec(o.platform, addDays(start, srcT)).downloads;
      var conv = wall * o.conv;
      payers = payers * (1 - churnDaily) + conv;

      var rev = o.model === 'onetime' ? conv * o.price
        : o.model === 'annual' ? (payers * o.price) / 365.25
        : (payers * o.price) / DPM;

      cumRev += rev; totInstalls += installs[t2]; totConv += conv;
      if (t2 > days - 30) rev30 += rev;

      var key = monthStart(date);
      var m = months[key];
      if (!m) { m = months[key] = { key: key, installs: 0, conv: 0, revenue: 0 }; order.push(m); }
      m.installs += installs[t2];
      m.conv += conv;
      m.revenue += rev;
      m.payers = payers;
      m.cumRevenue = cumRev;
      m.mrr = o.model === 'monthly' ? payers * o.price
        : o.model === 'annual' ? (payers * o.price) / 12
        : m.revenue;   // one-time has no recurring revenue — show the month's take
    }

    return {
      months: order,
      endPayers: payers,
      endMrr: order.length ? order[order.length - 1].mrr : 0,
      totalRevenue: cumRev,
      totalInstalls: totInstalls,
      totalConv: totConv,
      revenueNext30: (function () {
        var r = 0;
        // recompute the FIRST 30 days rather than the last
        var pv = o.model === 'onetime' ? 0 : o.startPayers, cd = churnDaily;
        for (var t3 = 1; t3 <= Math.min(30, days); t3++) {
          var st = t3 - lag;
          var w = st >= 1 ? installs[st] : dayRec(o.platform, addDays(start, st)).downloads;
          var c = w * o.conv;
          pv = pv * (1 - cd) + c;
          r += o.model === 'onetime' ? c * o.price
            : o.model === 'annual' ? (pv * o.price) / 365.25 : (pv * o.price) / DPM;
        }
        return r;
      })()
    };
  }

  /* Expected / bear / optimistic from one set of assumptions. */
  function fcScenarios() {
    var a = fcActuals();
    var f = fcValue('spread', a) / 100;
    var model = (state.fc && state.fc.model) || 'monthly';
    var months = (state.fc && +state.fc.horizon) || 12;
    var o = {
      months: months, days: diffDays(asOf(), fcEndDate()), model: model,
      platform: a.platform, startPayers: a.payers,
      installs: fcValue('installs', a),
      growth: fcValue('growth', a) / 100,
      conv: fcValue('conv', a) / 100,
      price: fcValue('price', a),
      churn: fcValue('churn', a) / 100
    };
    function variant(dir) {   // dir = -1 bear, +1 optimistic
      /* Conversion is the lever this dashboard exists to move, so it takes the full
         spread. Growth compounds over the whole horizon, so it gets a much smaller
         swing — at full spread it would dominate everything else and produce a band
         too wide to be worth reading. */
      return {
        months: o.months, days: o.days, model: o.model, platform: o.platform,
        startPayers: o.startPayers,
        installs: Math.max(0, o.installs * (1 + dir * f / 3)),
        growth: o.growth + dir * f / 8,
        conv: Math.max(0, o.conv * (1 + dir * f)),
        price: o.price,
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
    L.push('Every install gets a ' + trialDays() + '-day free trial. After that the app stays free, but');
    L.push('features are limited — and past day ' + wallDays() + ' the user can no longer see charts older than');
    L.push(wallDays() + ' days, which is the hard wall where paying becomes the only way forward.');
    L.push('Both limits are inclusive: a user is still in the trial on day ' + trialDays() + ' and leaves on day ' +
      trialExit() + ';');
    L.push('they still have full charts on day ' + wallDays() + ' and hit the wall on day ' + wallExit() + '.');
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
     ['Past the wall (day ' + wallExit() + '+)', 'hitWall', fmtInt],
     ['Paid conversions', 'totalSales', fmtInt],
     ['Revenue, all time', 'totalRevenue', fmtMoney],
     ['Convert % of past-trial', 'convOfOutOfTrial', fmtPct],
     ['Convert % of wall-hitters', 'convOfWall', fmtPct],
     ['Revenue per paying user', 'arppu', fmtMoney],
     ['Revenue per install', 'rpi', fmtMoney]].forEach(function (m) {
      L.push(pad2(m[0], 30) + padL(m[2](all[m[1]]), 12) +
        '   (iOS ' + m[2](ios[m[1]]) + ' · Android ' + m[2](and[m[1]]) + ')');
    });
    L.push('');

    var grainWord = grain === 'day' ? 'Daily' : grain === 'week' ? 'Weekly' : 'Monthly';
    L.push('## ' + grainWord + ' figures' + (grain === 'day' ? '' : ' (rolled up to keep this readable)'));
    L.push('Columns: period, platform, downloads, impressions, page views, updates, sales, revenue,');
    L.push('left-trial (cohort that passed day ' + trialDays() + ' in that period), hit-wall (passed day ' + wallDays() + ').');
    L.push('');
    L.push(pad2('period', 15) + pad2('platform', 9) + padL('dl', 7) + padL('impr', 9) +
      padL('views', 8) + padL('upd', 7) + padL('sales', 7) + padL('revenue', 10) +
      padL('left-trial', 11) + padL('hit-wall', 10));
    ['ios', 'android'].forEach(function (p) {
      buildBuckets(p, r.from, r.to, grain).forEach(function (row) {
        L.push(pad2(row.key, 15) + pad2(PLATFORMS[p], 9) +
          padL(fmtInt(row.downloads), 7) + padL(fmtInt(row.impressions), 9) +
          padL(fmtInt(row.pageViews), 8) + padL(fmtInt(row.updates), 7) +
          padL(fmtInt(row.sales), 7) + padL(fmtMoney(row.revenue), 10) +
          padL(fmtInt(row.trialEnd), 11) + padL(fmtInt(row.wallHit), 10));
      });
    });
    return L.join('\n');
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
      if (!db.entries.length) { toast('No data to export yet.'); return; }
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

  function refreshView() {
    if (refreshing) return;
    var btn = document.getElementById('btnRefresh');
    refreshing = true;
    if (btn) btn.dataset.busy = 'true';
    var startedAt = Date.now();

    var work = Promise.resolve(window.Sync ? window.Sync.flush() : null)
      .then(function () { return window.Sync ? window.Sync.pull() : null; })
      .then(function (remote) {
        hydrate(remote, true);
        var store = { db: db, state: state };
        if (window.Sync) window.Sync.adopt(store.db, store.state);
      });

    // The counter is only worth a round trip on the views that show it.
    if (state.view === 'ping' || state.view === 'timeline') {
      work = work.then(function () { return pingLoad(true); });
    }

    work.then(function () {
      renderAll();
      toast('Refreshed.');
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

  /* ------------------------------------------------------------- render */

  var VIEW_TITLES = {
    overview: 'Overview', ping: 'App usage', timeline: 'Timeline', trial: 'Trial & conversion', cohorts: 'Cohorts',
    platforms: 'iOS vs Android', costs: 'Costs', forecast: 'Forecast', data: 'Edit data'
  };

  function renderAll() {
    invalidate();
    if (!VIEW_TITLES[state.view]) state.view = 'overview';
    document.title = (VIEW_TITLES[state.view] || 'Overview') + ' | Autonomic';
    // don't clobber a field the user is currently typing into
    [['fTrial', trialDays()], ['fWall', wallDays()],
      ['fStoreCut', storeCut()], ['fCurrency', db.settings.currency || '$']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el && el !== document.activeElement) el.value = pair[1];
    });
    document.getElementById('filterbar').classList.toggle('hidden', state.view === 'data');
    // the forecast is driven by its own assumptions — only the platform filter applies
    ['fgRange', 'fgGrain'].forEach(function (id) {
      var g = document.getElementById(id);
      if (g) g.classList.toggle('hidden', state.view === 'forecast');
    });
    // App usage is per-day by nature: daily actives can't be added into a week
    // without knowing who is who, which is exactly what the ping refuses to
    // carry. Hiding the grain is more honest than silently ignoring it.
    var grainGroup = document.getElementById('fgGrain');
    if (grainGroup && (state.view === 'ping' || state.view === 'timeline')) grainGroup.classList.add('hidden');
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

    // App usage and Timeline have their own data sources, so both stand up with
    // no store CSVs at all.
    var empty = !db.entries.length && state.view !== 'data' &&
      state.view !== 'ping' && state.view !== 'timeline' && state.view !== 'costs';
    document.getElementById('emptyState').classList.toggle('hidden', !empty);
    if (empty) {
      document.getElementById('view-' + state.view).classList.add('hidden');
      document.getElementById('filterbar').classList.add('hidden');
      return;
    }

    if (state.view === 'overview') renderOverview();
    else if (state.view === 'ping') { pingLoad(); renderPing(); }
    else if (state.view === 'timeline') { pingLoad(); renderTimelineView(); }
    else if (state.view === 'trial') renderTrial();
    else if (state.view === 'cohorts') renderCohorts();
    else if (state.view === 'platforms') renderPlatforms();
    else if (state.view === 'costs') renderCosts();
    else if (state.view === 'forecast') renderForecast();
    else if (state.view === 'data') renderData();
  }

  function setView(v) {
    if (v === 'data' && state.view !== 'data') state.lastView = state.view;
    state.view = v; saveUI();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------- I/O */

  function toCSV() {
    var cols = ['date', 'platform', 'downloads', 'impressions', 'pageViews', 'updates', 'sales', 'revenue', 'notes'];
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
    var count = 0;
    rows.slice(1).forEach(function (r) {
      var date = normalizeDate((r[map.date] || '').trim());
      if (!date) return;
      var rawP = ((map.platform !== -1 ? r[map.platform] : '') || '').trim().toLowerCase();
      var plat = /and|goog|play/.test(rawP) ? 'android' : 'ios';
      var rec = { date: date, platform: plat, notes: map.notes !== -1 ? (r[map.notes] || '') : '' };
      ['downloads', 'impressions', 'pageViews', 'updates', 'sales'].forEach(function (f) {
        rec[f] = map[f] !== -1 ? cleanNum(r[map[f]]) : 0;
      });
      rec.revenue = map.revenue !== -1 ? cleanNum(r[map.revenue]) : 0;
      upsertQuiet(rec); count++;
    });
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

  function loadDemo() {
    if (db.entries.length && !confirm('Replace the current data with demo data?')) return;
    db.entries = [];
    var days = 120;
    var start = addDays(reportDay(), -(days - 1));
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
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
        var sales = Math.round(downloads * (p === 'ios' ? 0.05 : 0.032) * (0.5 + rnd()));
        db.entries.push({
          date: d, platform: p,
          downloads: downloads, impressions: impressions, pageViews: pageViews,
          updates: Math.round(downloads * (2 + rnd() * 3)),
          sales: sales,
          revenue: +(sales * (p === 'ios' ? 9.99 : 7.99)).toFixed(2),
          notes: ''
        });
      });
    }
    db.entries.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    save(); invalidate();
    toast('Loaded 120 days of demo data for both platforms.');
    refreshBulk();
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

    ['fTrial', 'fWall'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        var v = Math.max(1, Math.round(+this.value || 1));
        db.settings[id === 'fTrial' ? 'trialDays' : 'wallDays'] = v;
        if (db.settings.wallDays < db.settings.trialDays) db.settings.wallDays = db.settings.trialDays;
        save(); renderAll();
        toast('Trial ' + trialDays() + ' days · chart window ' + wallDays() +
          ' days — cohorts leave on day ' + trialExit() + ' and hit the wall on day ' + wallExit() + '.');
      });
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
        var st = age >= wallExit() ? 'past_wall' : age >= trialExit() ? 'past_trial' : 'in_trial';
        out.push([bucketLabel(x.key, state.cohGrain).full, age, st, x.downloads].join(','));
      });
      download('autonomic-cohorts.csv', out.join('\n'), 'text/csv');
    });

    wirePingView();
    wireCosts();

    document.getElementById('btnRefresh').addEventListener('click', refreshView);

    /* --- data entry --- */
    wireBulk();
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
        sales: cleanNum(document.getElementById('eSales').value),
        revenue: cleanNum(document.getElementById('eRevenue').value),
        notes: document.getElementById('eNotes').value
      };
      upsert(rec);
      document.getElementById('eStatus').textContent =
        'Saved ' + labelFull(date) + ' · ' + PLATFORMS[rec.platform];
      toast('Saved ' + labelFull(date) + ' (' + PLATFORMS[rec.platform] + ')');
      renderData();
    });

    document.getElementById('eClear').addEventListener('click', function () {
      ['eDownloads', 'eImpressions', 'ePageViews', 'eUpdates', 'eSales', 'eRevenue', 'eNotes']
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
        document.getElementById('eSales').value = e.sales ?? '';
        document.getElementById('eRevenue').value = e.revenue ?? '';
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
            if (parsed.settings) Object.assign(db.settings, parsed.settings);
            // A JSON backup is the whole store, so a restore has to bring the
            // campaigns and costs back too — not just the store days. Merged by
            // id, like every other collection, so restoring an old backup over
            // a newer ledger adds to it rather than truncating it.
            [['ads', 'ads'], ['costs', 'costs']].forEach(function (pair) {
              if (!Array.isArray(parsed[pair[0]])) return;
              var into = db[pair[1]] || (db[pair[1]] = []);
              parsed[pair[0]].forEach(function (row) {
                if (!row || !row.id) return;
                var at = -1;
                into.forEach(function (x, i) { if (x.id === row.id) at = i; });
                if (at >= 0) into[at] = row; else into.push(row);
              });
            });
            finishBulk();
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
      if (!confirm('Delete every entry on your account? This cannot be undone — export a backup first if you want one.')) return;
      db.entries = [];
      save(); invalidate(); renderAll();
      refreshBulk();
      // A wipe is the one case where the server should be told outright rather
      // than handed a diff of two thousand deletes.
      if (window.Sync) window.Sync.replaceAll().catch(function () {});
      toast('All data deleted.');
    });

    /* redraw charts on resize */
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (state.view !== 'data') renderAll(); }, 180);
    });

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
    if (remote.settings) Object.assign(db.settings, remote.settings);
    if (remote.ui && !keepUi) Object.assign(state, remote.ui);
    // A session saved before Explore was replaced still names it. An unknown
    // view hides every section and leaves a blank page with no way back.
    if (!VIEW_TITLES[state.view]) state.view = 'overview';
    if (!VIEW_TITLES[state.lastView]) state.lastView = 'overview';
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
    try { localStorage.setItem(KEY + '.ui', JSON.stringify(state)); } catch (e) {}
    invalidate();
  }

  window.Dashboard = {
    hydrate: hydrate,
    /** What sync.js diffs against. */
    store: function () { return { db: db, state: state }; },
    start: init
  };
})();
