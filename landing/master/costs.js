/* costs.js — what the app costs to run, and what that makes each install worth.
 *
 * Pure arithmetic over two collections the dashboard stores alongside its store
 * entries: `ads` (a campaign: a name, a channel, the days it ran) and `costs`
 * (a dated amount, optionally attributed to an ad). No DOM, no globals beyond
 * the one it hangs off — app.js owns the rendering, tests/costs.test.mjs pins
 * the numbers.
 *
 * Two rules run through the whole file.
 *
 * ONE. A cost lands on the day it is charged. A recurring row is expanded into
 * its occurrence dates rather than smeared across the days between them: an
 * annual developer fee is a real 99 on one day, and pretending it is 0.27 a day
 * would make every daily chart lie in a small way to make itself prettier.
 *
 * TWO. Reported and blended acquisition costs are never mixed. `spend ÷ store
 * downloads` is blended: it charges every install to marketing, including the
 * ones that arrived from search. `spend ÷ the installs the ad network claims`
 * is reported, and the network is marking its own homework. Both are useful,
 * neither is the truth, and a single "CPI" that quietly switched between them
 * would be worse than either.
 */
window.Costs = (function () {
  'use strict';

  /* Categories are fixed rather than free text: they are a colour on a stacked
     chart and a row in a table, and a typo would silently become a new one. */
  var CATEGORIES = {
    ADS: { label: 'Advertising', marketing: true, color: '#d95926' },
    CREATIVE: { label: 'Creative & content', marketing: true, color: '#c98500' },
    INFRA: { label: 'Infrastructure & hosting', color: '#3987e5' },
    TOOLS: { label: 'Tools & subscriptions', color: '#9085e9' },
    FEES: { label: 'Developer fees', color: '#d55181' },
    SERVICES: { label: 'Contract & services', color: '#199e70' },
    HARDWARE: { label: 'Hardware', color: '#008300' },
    OTHER: { label: 'Other', color: '#898781' }
  };
  var CATEGORY_KEYS = Object.keys(CATEGORIES);

  /* Where the money went, for ads. Free text would fragment the per-channel
     roll-up the first time "meta" was typed instead of "Meta". */
  var CHANNELS = [
    'Apple Search Ads', 'Google Ads', 'Meta', 'Reddit', 'TikTok', 'X',
    'YouTube', 'Newsletter', 'Influencer', 'Podcast', 'Other'
  ];

  var RECURRENCES = {
    none: { label: 'One-off' },
    weekly: { label: 'Every week' },
    monthly: { label: 'Every month' },
    quarterly: { label: 'Every quarter' },
    yearly: { label: 'Every year' }
  };

  /* A recurring row could otherwise walk forever on a bad `until`. */
  var MAX_OCCURRENCES = 4000;

  /* ------------------------------------------------------------- dates */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return toISO(d); }

  /**
   * Add whole months, clamping the day rather than spilling into the next
   * month. A bill first charged on the 31st recurs on the 28th of February and
   * on the 31st again in March — stepping from the ORIGINAL day each time, not
   * from the clamped one, so a single short month cannot drag the whole series
   * down to the 28th forever.
   */
  function addMonthsFrom(iso, n) {
    var d = parse(iso);
    var day = d.getDate();
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, lastDay));
    return toISO(t);
  }

  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  /** Every day from `from` to `to` inclusive. */
  function days(from, to) {
    var out = [];
    if (!isDate(from) || !isDate(to) || from > to) return out;
    for (var d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  function num(v) {
    var n = Number(v);
    return (v === null || v === undefined || v === '' || !isFinite(n)) ? 0 : n;
  }

  /* -------------------------------------------------------- occurrences */

  /**
   * The days inside [from, to] on which this cost is actually charged.
   *
   * A one-off is its own date. A recurring row starts on its date and repeats
   * until `until` (inclusive) or forever — "forever" being clamped to `to`,
   * since a subscription with no end date is still being paid today.
   */
  function occurrences(cost, from, to) {
    if (!cost || !isDate(cost.date)) return [];
    var rec = cost.recurrence;
    if (!rec || rec === 'none' || !RECURRENCES[rec]) {
      return (cost.date >= from && cost.date <= to) ? [cost.date] : [];
    }
    var stop = to;
    if (isDate(cost.until) && cost.until < stop) stop = cost.until;
    var out = [];
    var at = cost.date;
    for (var i = 0; at <= stop && i < MAX_OCCURRENCES; i++) {
      if (at >= from) out.push(at);
      at = rec === 'weekly' ? addDays(cost.date, (i + 1) * 7)
        : rec === 'monthly' ? addMonthsFrom(cost.date, i + 1)
          : rec === 'quarterly' ? addMonthsFrom(cost.date, (i + 1) * 3)
            : addMonthsFrom(cost.date, (i + 1) * 12);
    }
    return out;
  }

  function isMarketing(cost) {
    var cat = CATEGORIES[cost && cost.category];
    return !!(cat && cat.marketing);
  }

  /* ------------------------------------------------------------ rollups */

  /**
   * Spend per day over [from, to] — total, per category, and marketing-only.
   *
   * Returns `{ byDay: { date: total }, byCategory: { cat: { date: n } },
   * marketingByDay, totals: { cat: n }, total, marketing, other }`. One pass
   * feeds every chart and tile on the view, so a cost is expanded once.
   */
  function daily(costs, from, to) {
    var byDay = {}, marketingByDay = {}, byCategory = {}, totals = {};
    var total = 0, marketing = 0;
    days(from, to).forEach(function (d) { byDay[d] = 0; marketingByDay[d] = 0; });
    CATEGORY_KEYS.forEach(function (k) { byCategory[k] = {}; totals[k] = 0; });

    (costs || []).forEach(function (c) {
      var amount = num(c && c.amount);
      if (!amount) return;
      var cat = CATEGORIES[c.category] ? c.category : 'OTHER';
      var mk = isMarketing({ category: cat });
      occurrences(c, from, to).forEach(function (d) {
        byDay[d] = (byDay[d] || 0) + amount;
        byCategory[cat][d] = (byCategory[cat][d] || 0) + amount;
        totals[cat] += amount;
        total += amount;
        if (mk) {
          marketingByDay[d] = (marketingByDay[d] || 0) + amount;
          marketing += amount;
        }
      });
    });

    return {
      byDay: byDay, byCategory: byCategory, marketingByDay: marketingByDay,
      totals: totals, total: total, marketing: marketing, other: total - marketing
    };
  }

  /** Total spend over [from, to], optionally only what an `accept` fn keeps. */
  function spend(costs, from, to, accept) {
    var sum = 0;
    (costs || []).forEach(function (c) {
      if (accept && !accept(c)) return;
      var amount = num(c && c.amount);
      if (!amount) return;
      sum += amount * occurrences(c, from, to).length;
    });
    return sum;
  }

  /* ------------------------------------------------------------ per ad */

  /**
   * One row per ad: what it cost over the window, and whatever the network
   * reported alongside. `installs` here is the ad network's claim, never a
   * store download — see rule TWO at the top of this file.
   *
   * ADS only, not everything marked marketing. Creative work is marketing
   * spend and belongs in cost-per-install, but it bought no clicks and ran on
   * no channel, so listing it in a campaign table as "unattributed
   * advertising" would invent a campaign that never existed. The unattributed
   * row here is real ad money whose campaign was deleted.
   */
  function perAd(ads, costs, from, to) {
    var rows = (ads || []).map(function (ad) {
      return {
        ad: ad, id: ad.id, name: ad.name, channel: ad.channel,
        platform: ad.platform || 'all',
        spend: 0, impressions: 0, clicks: 0, installs: 0,
        days: 0, cpi: null, cpc: null, cpm: null, ctr: null, share: null
      };
    });
    var index = {};
    rows.forEach(function (r) { index[r.id] = r; });
    var unattributed = { id: null, name: 'Unattributed advertising', spend: 0, impressions: 0, clicks: 0, installs: 0, days: 0 };

    (costs || []).forEach(function (c) {
      if (!c || c.category !== 'ADS') return;
      var hits = occurrences(c, from, to).length;
      if (!hits) return;
      var row = c.adId && index[c.adId] ? index[c.adId] : unattributed;
      row.spend += num(c.amount) * hits;
      row.impressions += num(c.impressions) * hits;
      row.clicks += num(c.clicks) * hits;
      row.installs += num(c.installs) * hits;
      row.days += hits;
    });

    var all = rows.concat(unattributed.spend || unattributed.days ? [unattributed] : []);
    var total = all.reduce(function (a, r) { return a + r.spend; }, 0);
    all.forEach(function (r) {
      r.cpi = r.installs ? r.spend / r.installs : null;
      r.cpc = r.clicks ? r.spend / r.clicks : null;
      r.cpm = r.impressions ? (r.spend / r.impressions) * 1000 : null;
      r.ctr = r.impressions ? (r.clicks / r.impressions) * 100 : null;
      r.share = total ? (r.spend / total) * 100 : null;
    });
    all.sort(function (a, b) { return b.spend - a.spend; });
    return { rows: all, total: total };
  }

  /** Spend rolled up by channel rather than by campaign. */
  function perChannel(ads, costs, from, to) {
    var byAd = perAd(ads, costs, from, to);
    var map = {};
    byAd.rows.forEach(function (r) {
      var key = r.channel || 'Unattributed';
      var row = map[key] || (map[key] = { channel: key, spend: 0, installs: 0, clicks: 0, impressions: 0, ads: 0 });
      row.spend += r.spend; row.installs += r.installs;
      row.clicks += r.clicks; row.impressions += r.impressions;
      if (r.id) row.ads += 1;
    });
    return Object.keys(map).map(function (k) {
      var r = map[k];
      r.cpi = r.installs ? r.spend / r.installs : null;
      return r;
    }).sort(function (a, b) { return b.spend - a.spend; });
  }

  /* ----------------------------------------------------------- the money */

  /**
   * Net revenue after the store's commission.
   *
   * The dashboard records the customer-facing price, which is not what lands in
   * the bank: Apple and Google keep 15% under their small-business programmes
   * and 30% outside them. Every profit number here is built on the net figure
   * and reports the gross one beside it, so the cut is visible rather than
   * quietly applied.
   */
  function netRevenue(gross, cutPct) {
    var cut = num(cutPct);
    if (cut < 0) cut = 0;
    if (cut > 100) cut = 100;
    return num(gross) * (1 - cut / 100);
  }

  /**
   * The window's economics.
   *
   * `store` is what the store reported over the same window:
   * `{ revenue, downloads, sales }`. Rates come back as null rather than 0 when
   * their denominator is empty — "no installs yet" is not "free".
   */
  function summary(opts) {
    var o = opts || {};
    var store = o.store || {};
    var d = daily(o.costs, o.from, o.to);
    var gross = num(store.revenue);
    var net = netRevenue(gross, o.storeCutPct);
    var downloads = num(store.downloads);
    var sales = num(store.sales);

    return {
      spend: d.total,
      marketing: d.marketing,
      other: d.other,
      byCategory: d.totals,
      grossRevenue: gross,
      netRevenue: net,
      commission: gross - net,
      profit: net - d.total,
      /* Blended: every install in the window is charged to marketing, organic
         ones included. Understates what a campaign really costs. */
      costPerInstall: downloads ? d.marketing / downloads : null,
      costPerPaid: sales ? d.marketing / sales : null,
      /* Fully loaded: the whole business divided by the paying customers it
         produced. The number that has to come down under revenue per customer
         for any of this to work. */
      loadedCostPerPaid: sales ? d.total / sales : null,
      revenuePerInstall: downloads ? net / downloads : null,
      roas: d.marketing ? net / d.marketing : null,
      margin: net ? ((net - d.total) / net) * 100 : null
    };
  }

  /**
   * Cumulative net revenue against cumulative spend, day by day, and the first
   * day the first overtakes the second.
   *
   * Both run from the earliest day either side has anything, not from the
   * selected range: breakeven is an all-time question, and a 30-day window
   * would announce it every month.
   */
  function breakeven(costs, dailyNet, from, to) {
    var out = [];
    var spendSoFar = 0, revSoFar = 0, at = null;
    var d = daily(costs, from, to);
    days(from, to).forEach(function (day) {
      spendSoFar += d.byDay[day] || 0;
      revSoFar += num(dailyNet && dailyNet[day]);
      if (at === null && revSoFar >= spendSoFar && spendSoFar > 0) at = day;
      out.push({ date: day, spend: spendSoFar, revenue: revSoFar, profit: revSoFar - spendSoFar });
    });
    return { series: out, at: at, spend: spendSoFar, revenue: revSoFar, profit: revSoFar - spendSoFar };
  }

  /**
   * The days an ad was live, for annotating a chart. An ad with no end date is
   * still running, so only its start is flagged.
   */
  function adMarks(ads) {
    var out = [];
    (ads || []).forEach(function (ad) {
      if (!ad || !isDate(ad.start)) return;
      out.push({ id: 'ad-' + ad.id + '-start', adId: ad.id, date: ad.start, edge: 'start', ad: ad });
      if (isDate(ad.end) && ad.end >= ad.start) {
        out.push({ id: 'ad-' + ad.id + '-end', adId: ad.id, date: ad.end, edge: 'end', ad: ad });
      }
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  /** Is the ad running on `day`? Drives the status pill, nothing numeric. */
  function adStatus(ad, day) {
    if (!ad || !isDate(ad.start)) return 'draft';
    if (ad.start > day) return 'scheduled';
    if (isDate(ad.end) && ad.end < day) return 'ended';
    return 'running';
  }

  return {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    CHANNELS: CHANNELS,
    RECURRENCES: RECURRENCES,
    addDays: addDays,
    addMonthsFrom: addMonthsFrom,
    days: days,
    occurrences: occurrences,
    isMarketing: isMarketing,
    daily: daily,
    spend: spend,
    perAd: perAd,
    perChannel: perChannel,
    netRevenue: netRevenue,
    summary: summary,
    breakeven: breakeven,
    adMarks: adMarks,
    adStatus: adStatus
  };
})();
