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
  var SLOTS = [COLOR.s1, COLOR.s2, COLOR.s3, COLOR.s4, COLOR.s5, COLOR.s6, COLOR.s7, COLOR.s8];

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
    var d = { entries: [], settings: { trialDays: 7, wallDays: 14, currency: '$' } };
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.entries)) d.entries = p.entries;
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
    exType: 'line',
    exMetrics: ['downloads', 'trialEnd', 'wallHit'],
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

  /* ------------------------------------------------------ view: explore */

  var METRICS = [
    { key: 'downloads', label: 'First-time downloads', group: 'count' },
    { key: 'impressions', label: 'Impressions', group: 'count' },
    { key: 'pageViews', label: 'Product page views', group: 'count' },
    { key: 'updates', label: 'Updates', group: 'count' },
    { key: 'sales', label: 'Sales (count)', group: 'count' },
    { key: 'revenue', label: 'Revenue', group: 'count', fmt: fmtMoney },
    { key: 'trialEnd', label: 'Left the trial', group: 'count', dyn: 'trial' },
    { key: 'wallHit', label: 'Hit the wall', group: 'count', dyn: 'wall' },
    { key: 'cumDownloads', label: 'Cumulative installs', group: 'count' },
    { key: 'cumSales', label: 'Cumulative paid', group: 'count' },
    { key: 'cumRevenue', label: 'Cumulative revenue', group: 'count', fmt: fmtMoney },
    { key: 'inTrial', label: 'Currently in trial', group: 'count' },
    { key: 'pastTrial', label: 'Past trial, charts open', group: 'count' },
    { key: 'pastWall', label: 'Past the wall', group: 'count' },
    { key: 'convRate', label: 'Store conversion rate', group: 'rate', fmt: fmtPct },
    { key: 'ppvConv', label: 'Page view → install', group: 'rate', fmt: fmtPct },
    { key: 'tapThrough', label: 'Impression → page view', group: 'rate', fmt: fmtPct },
    { key: 'paidOfTrial', label: 'Paid % of past-trial', group: 'rate', fmt: fmtPct },
    { key: 'paidOfWall', label: 'Paid % of wall-hitters', group: 'rate', fmt: fmtPct },
    { key: 'paidOfInstalls', label: 'Paid % of installs', group: 'rate', fmt: fmtPct },
    { key: 'arppu', label: 'Revenue per paying user', group: 'rate', fmt: fmtMoney },
    { key: 'rpi', label: 'Revenue per install', group: 'rate', fmt: fmtMoney }
  ];
  function metricDef(k) { return METRICS.filter(function (m) { return m.key === k; })[0]; }
  function metricLabel(m) {
    if (m.dyn === 'trial') return 'Left the trial (past day ' + trialDays() + ')';
    if (m.dyn === 'wall') return 'Hit the wall (past day ' + wallDays() + ')';
    return m.label;
  }

  /* colour follows the entity: a metric keeps its slot while it is on screen */
  var slotMap = {};
  function assignSlots() {
    Object.keys(slotMap).forEach(function (k) {
      if (state.exMetrics.indexOf(k) === -1) delete slotMap[k];
    });
    state.exMetrics.forEach(function (k) {
      if (slotMap[k] !== undefined) return;
      for (var i = 0; i < SLOTS.length; i++) {
        var taken = Object.keys(slotMap).some(function (o) { return slotMap[o] === i; });
        if (!taken) { slotMap[k] = i; return; }
      }
      slotMap[k] = 0;
    });
  }

  function renderExplore() {
    var r = activeRange();
    var box = document.getElementById('exMetrics');
    box.innerHTML = METRICS.map(function (m) {
      var on = state.exMetrics.indexOf(m.key) !== -1;
      return '<label><input type="checkbox" data-metric="' + m.key + '"' + (on ? ' checked' : '') + '> ' +
        esc(metricLabel(m)) + '</label>';
    }).join('');

    assignSlots();
    var keys = platKeys();
    var rowsByPlat = {};
    keys.forEach(function (p) { rowsByPlat[p] = buildBuckets(p, r.from, r.to); });
    var x = xAxis(rowsByPlat[keys[0]]);

    var counts = [], rates = [];
    state.exMetrics.forEach(function (k) {
      var m = metricDef(k);
      if (!m) return;
      keys.forEach(function (p, pi) {
        var color = SLOTS[slotMap[k]];
        // in compare mode the second platform is drawn dashed so the pair stays distinguishable
        var s = mk(rowsByPlat[p], p, k, metricLabel(m) + (keys.length > 1 ? ' · ' + platName(p) : ''),
          color, state.exType === 'line' ? 'line' : 'bar', pi === 1);
        s.format = m.fmt || fmtInt;
        (m.group === 'rate' ? rates : counts).push(s);
      });
    });

    var type = state.exType;
    if (type !== 'line') counts.forEach(function (s) { s.type = 'bar'; });
    drawChart('exChart', {
      x: x, series: counts, height: 340, stacked: type === 'stacked',
      format: fmtInt, emptyText: 'Pick one or more count metrics above.'
    });

    var rateCard = document.getElementById('exRateCard');
    rateCard.classList.toggle('hidden', rates.length === 0);
    if (rates.length) {
      rates.forEach(function (s) { s.type = type === 'line' ? 'line' : 'bar'; });
      drawChart('exRate', {
        x: x, series: rates, height: 300, format: fmtPct,
        yTickFormat: function (v) { return v.toFixed(v < 10 ? 1 : 0) + '%'; }
      });
    }
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
  function renderData() { if (!bulkRows.length) buildBulkGrid(); }

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

  /* ------------------------------------------------------------- render */

  var VIEW_TITLES = {
    overview: 'Overview', trial: 'Trial & conversion', cohorts: 'Cohorts',
    platforms: 'iOS vs Android', explore: 'Explore', forecast: 'Forecast', data: 'Edit data'
  };

  function renderAll() {
    invalidate();
    document.title = (VIEW_TITLES[state.view] || 'Overview') + ' | Autonomic';
    // don't clobber a field the user is currently typing into
    [['fTrial', trialDays()], ['fWall', wallDays()]].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el && el !== document.activeElement) el.value = pair[1];
    });
    document.getElementById('filterbar').classList.toggle('hidden', state.view === 'data');
    // the forecast is driven by its own assumptions — only the platform filter applies
    ['fgRange', 'fgGrain', 'fgThrough'].forEach(function (id) {
      var g = document.getElementById(id);
      if (g) g.classList.toggle('hidden', state.view === 'forecast');
    });
    document.getElementById('reportDayValue').textContent = labelFull(asOf());
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

    var empty = !db.entries.length && state.view !== 'data';
    document.getElementById('emptyState').classList.toggle('hidden', !empty);
    if (empty) {
      document.getElementById('view-' + state.view).classList.add('hidden');
      document.getElementById('filterbar').classList.add('hidden');
      return;
    }

    if (state.view === 'overview') renderOverview();
    else if (state.view === 'trial') renderTrial();
    else if (state.view === 'cohorts') renderCohorts();
    else if (state.view === 'platforms') renderPlatforms();
    else if (state.view === 'explore') renderExplore();
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
    cohGrain: 'cohGrain', exType: 'exType', dowMetric: 'dowMetric'
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

    /* explore metric checkboxes */
    document.getElementById('exMetrics').addEventListener('change', function (ev) {
      var cb = ev.target.closest('input[data-metric]');
      if (!cb) return;
      var k = cb.dataset.metric;
      if (cb.checked) {
        if (state.exMetrics.length >= 8) {
          cb.checked = false;
          toast('Eight metrics is the limit — colours stay distinguishable up to eight.');
          return;
        }
        state.exMetrics.push(k);
      } else {
        state.exMetrics = state.exMetrics.filter(function (m) { return m !== k; });
      }
      saveUI(); renderExplore();
    });
    document.getElementById('exExport').addEventListener('click', function () {
      var cfg = chartCfgs.exChart;
      if (!cfg) return;
      var lines = ['period,' + cfg.series.map(function (s) { return '"' + s.name.replace(/"/g, '""') + '"'; }).join(',')];
      cfg.x.forEach(function (x, i) {
        lines.push('"' + (x.full || x.label) + '",' + cfg.series.map(function (s) {
          var v = s.values[i]; return (v === null || v === undefined || isNaN(v)) ? '' : v;
        }).join(','));
      });
      download('autonomic-explore.csv', lines.join('\n'), 'text/csv');
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
  window.Dashboard = {
    /** Swap in the server's state ahead of the first render. */
    hydrate: function (remote) {
      if (!remote) return;
      if (Array.isArray(remote.entries)) db.entries = remote.entries;
      if (remote.settings) Object.assign(db.settings, remote.settings);
      if (remote.ui) Object.assign(state, remote.ui);
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
      try { localStorage.setItem(KEY + '.ui', JSON.stringify(state)); } catch (e) {}
      invalidate();
    },
    /** What sync.js diffs against. */
    store: function () { return { db: db, state: state }; },
    start: init
  };
})();
