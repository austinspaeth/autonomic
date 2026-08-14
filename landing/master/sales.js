/* sales.js — the subscription ledger, and every number derived from it.
 *
 * Pure arithmetic over one collection: `sales`, a row per PURCHASE rather than
 * a daily total. No DOM, no globals beyond the one it hangs off — app.js owns
 * the rendering, tests/sales.test.mjs pins the numbers.
 *
 * Sales used to be two columns on a store entry, `sales` (a count) and
 * `revenue` (an amount), summed per day per platform. That shape cannot answer
 * the two questions this file exists for, because both of them are properties
 * of a purchase and not of a day:
 *
 *   - a monthly subscription and an annual one are different prices and very
 *     different recurring revenue, so a day's takings say nothing about MRR;
 *   - "how long after installing did they pay?" needs the buyer's own install
 *     date, which a daily total has averaged away.
 *
 * Four rules run through the whole file.
 *
 * ONE. **Cash and recurring revenue are never the same number.** An annual plan
 * at 29.99 is 29.99 of BOOKINGS on the day it is bought and 2.49 of MRR every
 * month for a year. Reporting either one as "revenue" makes an annual-heavy
 * month look like a blowout or a collapse depending which you picked, so this
 * file always returns both and never a blend: `bookings` is money that arrived,
 * `mrr` is the monthly rate the book is running at, `recognised` is the slice
 * of bookings that belongs to a given month.
 *
 * TWO. **A plan we do not know the term of is not counted in MRR.** Rows
 * migrated from the old daily columns carry `plan: 'unknown'` — real money, of
 * an unknown term. They count in bookings, in conversion and in every
 * per-install rate, and they are excluded from MRR and reported separately
 * (`unknownMrrRows` / `unknownBookings`) so a view can disclose how much of the
 * picture it is not describing. Spreading them over an assumed term would be
 * inventing the one fact that is missing.
 *
 * THREE. **A subscription is assumed to still run until it is marked
 * cancelled.** The stores do not tell this dashboard about churn, so there is
 * nothing to derive it from; assuming a monthly plan lapses after 30 days would
 * make MRR decay on its own and read as churn we never observed. `cancelled`
 * is a date the user types, `refunded` removes the row from money entirely, and
 * `activeMrrOn` says so wherever it is shown.
 *
 * FOUR. **Cohort-day statistics only count rows that carry an install date.**
 * `cohortDay` is `purchase date − install date`, exact and per buyer. A row
 * without one (every migrated row, and any purchase whose buyer you could not
 * match) is not a zero and not an average — it is unknown, so it is left out of
 * the histogram and counted in `withoutCohort` so the view can say what share
 * of purchases the histogram is drawn from.
 */
window.Sales = (function () {
  'use strict';

  /* Plans are fixed rather than free text: each is a colour, a term in months
     and a row in the mix table, and a typo would silently become a new plan.
     `termMonths` is the whole difference between them — it is what turns a
     price into MRR, and `null` is what "we do not know" looks like. */
  var PLANS = {
    monthly: { key: 'monthly', label: 'Monthly', termMonths: 1, color: '#3987e5' },
    annual: { key: 'annual', label: 'Annual', termMonths: 12, color: '#199e70' },
    lifetime: { key: 'lifetime', label: 'Lifetime', termMonths: 0, color: '#c98500' },
    unknown: { key: 'unknown', label: 'Unclassified', termMonths: null, color: '#898781' }
  };
  var PLAN_KEYS = ['monthly', 'annual', 'lifetime', 'unknown'];

  /* The plans that produce recurring revenue. Lifetime is a real subscription
     product and real cash, but its MRR is zero by definition — a one-time
     purchase does not recur, and rolling it into MRR is the oldest way to make
     a SaaS number flattering. It sits in bookings and in the mix, never in the
     rate. */
  function isRecurring(plan) { return plan === 'monthly' || plan === 'annual'; }

  var PLATFORMS = { ios: 'iOS', android: 'Android' };

  /* ---------------------------------------------------------------- dates */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return toISO(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function monthStart(s) { return String(s).slice(0, 7) + '-01'; }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function num(v) { return (v === null || v === undefined || v === '' || isNaN(v)) ? 0 : +v; }

  /* ------------------------------------------------------------ normalize */

  /**
   * A stored row, cleaned into the shape everything below assumes.
   *
   * `qty` exists only because the migration from the old daily columns has to
   * put four sales of one day into one row it cannot split into four buyers.
   * A hand-entered purchase is qty 1, and `cohort` is refused on anything
   * larger: four buyers do not share one install date, and letting them would
   * put a fabricated four-count spike into the days-to-purchase histogram.
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!isDate(raw.date)) return null;
    var plan = PLANS[raw.plan] ? raw.plan : 'unknown';
    var qty = Math.max(1, Math.round(num(raw.qty) || 1));
    var out = {
      id: String(raw.id || ''),
      date: raw.date,
      platform: PLATFORMS[raw.platform] ? raw.platform : 'ios',
      plan: plan,
      price: num(raw.price),
      qty: qty,
      refunded: !!raw.refunded
    };
    if (qty === 1 && isDate(raw.cohort) && raw.cohort <= raw.date) out.cohort = raw.cohort;
    if (isDate(raw.cancelled) && raw.cancelled >= raw.date) out.cancelled = raw.cancelled;
    if (raw.note) out.note = String(raw.note);
    return out.id ? out : null;
  }

  function normalizeAll(list) {
    return (list || []).map(normalize).filter(Boolean)
      .sort(function (a, b) { return a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date); });
  }

  /* --------------------------------------------------------------- money */

  /** Cash the purchase brought in on its own day. A refund never happened. */
  function bookingsOf(s) { return s.refunded ? 0 : s.price * s.qty; }

  /**
   * The monthly recurring revenue one row represents while it is live.
   *
   * Annual is the yearly price over twelve, which is the only division in this
   * file and the reason annual and monthly can share an axis at all. A plan
   * with no known term contributes nothing — see rule TWO.
   */
  function mrrOf(s) {
    if (s.refunded || !isRecurring(s.plan)) return 0;
    var term = PLANS[s.plan].termMonths;
    return (s.price * s.qty) / term;
  }

  /** Was this subscription still running on `day`? */
  function isLiveOn(s, day) {
    if (s.refunded) return false;
    if (s.date > day) return false;
    if (s.cancelled && s.cancelled <= day) return false;
    return true;
  }

  /* --------------------------------------------------------------- index */

  /**
   * Build the queryable index once per render pass.
   *
   * `platform` is the filter in force, stated on the index the way the ping
   * index states its own, so a view can never show a filtered number under an
   * unfiltered label. `all` keeps every row.
   */
  function index(list, platform) {
    var rows = normalizeAll(list).filter(function (s) {
      return !PLATFORMS[platform] || s.platform === platform;
    });
    var byDay = {};
    rows.forEach(function (s) { (byDay[s.date] || (byDay[s.date] = [])).push(s); });
    var days = Object.keys(byDay).sort();
    return {
      rows: rows,
      byDay: byDay,
      days: days,
      first: days[0] || null,
      last: days[days.length - 1] || null,
      platform: PLATFORMS[platform] ? platform : 'all'
    };
  }

  /* ------------------------------------------------------------ roll-ups */

  /**
   * Everything about one window, as one pass.
   *
   * Note which figures are WINDOW quantities and which are AS-OF ones, because
   * mixing them is the easiest mistake to make here: `bookings`, `newMrr`,
   * `count` and the plan split are what happened between `from` and `to`;
   * `mrr`, `arr` and `active` are the state of the book on `to`, which counts
   * every subscription ever sold that is still running, including ones bought
   * long before the window opened.
   */
  function summarize(ix, from, to) {
    var s = {
      count: 0, units: 0, bookings: 0, newMrr: 0, churnedMrr: 0,
      refunds: 0, refundedCount: 0,
      byPlan: {}, byPlatform: {},
      mrr: 0, arr: 0, active: 0, activeOther: 0, activeByPlan: {},
      unknownBookings: 0, unknownCount: 0,
      withCohort: 0, withoutCohort: 0
    };
    PLAN_KEYS.forEach(function (k) {
      s.byPlan[k] = { count: 0, units: 0, bookings: 0, mrr: 0 };
      s.activeByPlan[k] = { count: 0, mrr: 0 };
    });

    ix.rows.forEach(function (r) {
      var inWindow = r.date >= from && r.date <= to;
      if (inWindow) {
        /* A refund did not happen, so it is counted in NOTHING but its own two
           fields. Leaving it in the unit counts is subtle and wrong in two
           places at once: the average price divides real money by a sale that
           returned none (three 4.99 subscriptions and one refund read as 3.74
           each), and the annual share is computed over a denominator holding a
           purchase nobody made. Both feed the forecast's defaults. */
        if (r.refunded) { s.refundedCount += r.qty; s.refunds += r.price * r.qty; return; }
        s.count += 1;
        s.units += r.qty;
        s.bookings += bookingsOf(r);
        s.newMrr += mrrOf(r);
        var p = s.byPlan[r.plan];
        p.count += 1; p.units += r.qty; p.bookings += bookingsOf(r); p.mrr += mrrOf(r);
        var pl = s.byPlatform[r.platform] || (s.byPlatform[r.platform] = { count: 0, units: 0, bookings: 0, mrr: 0 });
        pl.count += 1; pl.units += r.qty; pl.bookings += bookingsOf(r); pl.mrr += mrrOf(r);
        if (r.plan === 'unknown') { s.unknownBookings += bookingsOf(r); s.unknownCount += r.qty; }
        if (r.cohort) s.withCohort += 1; else s.withoutCohort += 1;
      }
      /* Churn is booked against the CANCELLATION's window, not the purchase's,
         and so it sits outside the block above. Almost everything that churns
         was bought before the window it churns in — that is what churn is — so
         testing the purchase date here counted only the subscriptions that were
         sold and cancelled inside the same window, which on a monthly window is
         approximately none of them. The forecast read the resulting 0 as "no
         churn to measure" and fell back to its 5% assumption forever. */
      if (r.cancelled && !r.refunded && r.cancelled >= from && r.cancelled <= to) {
        s.churnedMrr += mrrOf(r);
      }
      if (isLiveOn(r, to)) {
        s.mrr += mrrOf(r);
        /* `active` counts SUBSCRIPTIONS — the recurring plans, the ones that
           can still be cancelled. A lifetime purchase is not a subscription and
           an unclassified row has no term to still be running, so counting
           either would make "13 active subscriptions" sit beside an MRR of zero
           and mean nothing. Both stay visible in `activeByPlan`, which is what
           the tile's split is drawn from. */
        if (isRecurring(r.plan)) s.active += r.qty;
        else s.activeOther += r.qty;
        var a = s.activeByPlan[r.plan];
        a.count += r.qty; a.mrr += mrrOf(r);
      }
    });

    s.arr = s.mrr * 12;
    s.arpu = s.units ? s.bookings / s.units : null;
    /* Share of the window's new MRR that came from annual plans. Of MRR and not
       of units, because that is the question a forecast asks: annual buyers are
       rarer and worth more, so a unit share would understate them. */
    s.annualMrrShare = s.newMrr ? (s.byPlan.annual.mrr / s.newMrr) * 100 : null;
    s.annualUnitShare = (s.byPlan.annual.units + s.byPlan.monthly.units)
      ? (s.byPlan.annual.units / (s.byPlan.annual.units + s.byPlan.monthly.units)) * 100 : null;
    return s;
  }

  /* ------------------------------------------------------------- series */

  function range(from, to) {
    var out = [];
    if (!from || !to || from > to) return out;
    for (var d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  /** MRR live on each day of a window, split by plan. The book's running rate. */
  function mrrSeries(ix, from, to) {
    return range(from, to).map(function (d) {
      var row = { date: d, total: 0 };
      PLAN_KEYS.forEach(function (k) { row[k] = 0; });
      ix.rows.forEach(function (r) {
        if (!isLiveOn(r, d)) return;
        var m = mrrOf(r);
        row[r.plan] += m;
        row.total += m;
      });
      return row;
    });
  }

  /**
   * Bookings and recognised revenue, per calendar month.
   *
   * `bookings` is the cash that arrived that month. `recognised` is the slice of
   * every purchase that belongs to that month — an annual plan contributes one
   * twelfth of its price to each of the twelve months from its purchase date.
   * The two only agree on an all-monthly book, and the gap between them is the
   * whole reason this view exists: a month with one annual sale looks like a
   * record on bookings and an ordinary month on recognised revenue, and both
   * readings are true about different things.
   */
  function monthlyRevenue(ix, from, to) {
    var months = {}, order = [];
    function bucket(key) {
      var m = months[key];
      if (!m) { m = months[key] = { key: key, bookings: 0, recognised: 0, units: 0 }; order.push(m); }
      return m;
    }
    var cursor = monthStart(from);
    while (cursor <= to) {
      bucket(cursor);
      var d = parse(cursor); d.setMonth(d.getMonth() + 1);
      cursor = toISO(d);
    }

    ix.rows.forEach(function (r) {
      if (r.refunded) return;
      var start = monthStart(r.date);
      if (start >= monthStart(from) && start <= to) {
        var b = bucket(start);
        b.bookings += bookingsOf(r);
        b.units += r.qty;
      }
      /* Recognition. A lifetime purchase is recognised entirely on its own
         month — there is no term to spread it over, and spreading it over an
         invented one is exactly the fiction rule TWO refuses. Unclassified rows
         are recognised on their own month for the same reason. */
      var term = isRecurring(r.plan) ? PLANS[r.plan].termMonths : 1;
      var per = bookingsOf(r) / term;
      for (var i = 0; i < term; i++) {
        var d2 = parse(monthStart(r.date));
        d2.setMonth(d2.getMonth() + i);
        var key = toISO(d2);
        if (key < monthStart(from) || key > to) continue;
        /* A cancelled subscription stops being recognised the month it ends. */
        if (r.cancelled && key > monthStart(r.cancelled)) break;
        bucket(key).recognised += per;
      }
    });

    order.sort(function (a, b) { return a.key.localeCompare(b.key); });
    return order;
  }

  /* --------------------------------------------------------- cohort days */

  /**
   * Days between install and purchase, per buyer. See rule FOUR — a row with no
   * install date is not in here at all.
   */
  function cohortDayOf(s) {
    return s.cohort ? diffDays(s.cohort, s.date) : null;
  }

  /* Buckets, not raw days: with a handful of sales a per-day histogram is a row
     of ones, and the question ("do people buy at the wall, or months later?")
     is about the shape and not about day 23 specifically. The edges are the
     ones the rest of the dashboard already thinks in — the trial, the wall, the
     first month. */
  var AGE_BUCKETS = [
    { label: 'Same day', min: 0, max: 0 },
    { label: '1–3 days', min: 1, max: 3 },
    { label: '4–7 days', min: 4, max: 7 },
    { label: '8–14 days', min: 8, max: 14 },
    { label: '15–30 days', min: 15, max: 30 },
    { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: Infinity }
  ];

  /**
   * The days-to-purchase histogram, split by plan.
   *
   * `coverage` is the point of `withoutCohort`: a histogram drawn from a third
   * of the purchases is a real answer about a third of the purchases, and the
   * view has to say which third. Reporting it as though it covered everything
   * is the mistake this return shape exists to prevent.
   */
  function purchaseAges(ix, from, to) {
    var buckets = AGE_BUCKETS.map(function (b) {
      var row = { label: b.label, min: b.min, max: b.max, count: 0, bookings: 0 };
      PLAN_KEYS.forEach(function (k) { row[k] = 0; });
      return row;
    });
    var ages = [], withCohort = 0, withoutCohort = 0;

    ix.rows.forEach(function (r) {
      if (from && (r.date < from || r.date > to)) return;
      /* A refund is not a purchase, so it is not a data point about how long
         people take to buy — and it must not be counted into `withoutCohort`
         either, or it would quietly lower the coverage figure. */
      if (r.refunded) return;
      var age = cohortDayOf(r);
      if (age === null || age < 0) { withoutCohort += 1; return; }
      withCohort += 1;
      ages.push(age);
      for (var i = 0; i < buckets.length; i++) {
        if (age >= buckets[i].min && age <= buckets[i].max) {
          buckets[i].count += 1;
          buckets[i][r.plan] += 1;
          buckets[i].bookings += bookingsOf(r);
          break;
        }
      }
    });

    ages.sort(function (a, b) { return a - b; });
    return {
      buckets: buckets,
      total: withCohort,
      withoutCohort: withoutCohort,
      coverage: (withCohort + withoutCohort) ? (withCohort / (withCohort + withoutCohort)) * 100 : null,
      median: median(ages),
      mean: ages.length ? ages.reduce(function (a, b) { return a + b; }, 0) / ages.length : null
    };
  }

  /* The median, not the mean: one buyer who installed a year ago and finally
     paid drags a mean of six purchases past the wall, and the answer people act
     on is "when does the typical buyer decide". */
  function median(sorted) {
    if (!sorted.length) return null;
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** Median days-to-purchase per plan, and how many rows each is drawn from. */
  function ageByPlan(ix, from, to) {
    var acc = {};
    PLAN_KEYS.forEach(function (k) { acc[k] = []; });
    ix.rows.forEach(function (r) {
      if (from && (r.date < from || r.date > to)) return;
      if (r.refunded) return;
      var age = cohortDayOf(r);
      if (age === null || age < 0) return;
      acc[r.plan].push(age);
    });
    return PLAN_KEYS.map(function (k) {
      var v = acc[k].sort(function (a, b) { return a - b; });
      return { plan: k, label: PLANS[k].label, n: v.length, median: median(v) };
    });
  }

  /**
   * Purchases grouped by the buyer's INSTALL month rather than their purchase
   * month — "which intake actually paid", which is a different question from
   * "when did the money land" and the one that says whether a campaign brought
   * in buyers or just installs.
   *
   * Each row is left open-ended on purpose: a cohort three weeks old has not
   * finished buying, so `maturityDays` travels with the count and the view is
   * expected to say so rather than reading a young cohort as a bad one.
   */
  function byInstallMonth(ix, asOf) {
    var months = {};
    ix.rows.forEach(function (r) {
      if (!r.cohort || r.refunded) return;
      var key = monthStart(r.cohort);
      var m = months[key] || (months[key] = {
        key: key, count: 0, bookings: 0, mrr: 0, monthly: 0, annual: 0, lifetime: 0, unknown: 0
      });
      m.count += 1;
      m.bookings += bookingsOf(r);
      m.mrr += mrrOf(r);
      m[r.plan] += 1;
    });
    return Object.keys(months).sort().map(function (k) {
      var m = months[k];
      m.maturityDays = asOf ? diffDays(k, asOf) : null;
      return m;
    });
  }

  /* --------------------------------------------------------------- daily */

  /**
   * Per-day totals in the shape the rest of the dashboard already speaks, so
   * `base()` in app.js can fold the ledger into the same `sales` / `revenue`
   * fields the store entries used to carry and every existing consumer —
   * Overview, Costs, Trial & conversion, the weekday chart — keeps working off
   * one source of truth rather than two that can disagree.
   *
   * `sales` is a UNIT count (a qty-4 migrated row is four sales) and `revenue`
   * is gross bookings at the customer-facing price, which is exactly what those
   * two columns meant before.
   */
  function dailyTotals(list) {
    var out = { ios: {}, android: {}, all: {} };
    normalizeAll(list).forEach(function (r) {
      [r.platform, 'all'].forEach(function (p) {
        var d = out[p][r.date] || (out[p][r.date] = { sales: 0, revenue: 0, mrr: 0, annual: 0, monthly: 0 });
        d.sales += r.refunded ? 0 : r.qty;
        d.revenue += bookingsOf(r);
        d.mrr += mrrOf(r);
        if (r.plan === 'annual') d.annual += r.qty;
        if (r.plan === 'monthly') d.monthly += r.qty;
      });
    });
    return out;
  }

  /* ----------------------------------------------------------- migration */

  /**
   * The old daily columns, as ledger rows.
   *
   * Called once, guarded by `settings.salesMigrated` — this rewrites stored
   * entries, so running it twice would double every historical sale. Each
   * (date, platform) with a sales count or an amount becomes ONE row of
   * `plan: 'unknown'` carrying the count as `qty` and the average price, which
   * is everything the old shape knew. It knew no plan and no install date, and
   * this does not invent either: that is what `unknown` and the missing
   * `cohort` are for, and it is why the Sales view can say how much of its own
   * history it cannot classify.
   *
   * A day with an amount but no count is one sale of that amount; a day with a
   * count but no amount is that many sales at zero, which is a free
   * conversion and a real thing the store reports.
   */
  function migrateEntries(entries, mkId) {
    var rows = [];
    (entries || []).forEach(function (e) {
      if (!e || !isDate(e.date)) return;
      var count = Math.round(num(e.sales));
      var amount = num(e.revenue);
      if (!count && !amount) return;
      var qty = Math.max(1, count || 1);
      rows.push({
        id: mkId(e.date, e.platform),
        date: e.date,
        platform: PLATFORMS[e.platform] ? e.platform : 'ios',
        plan: 'unknown',
        price: amount / qty,
        qty: qty,
        note: 'Migrated from the daily sales columns'
      });
    });
    return rows;
  }

  /* --------------------------------------------------------------- forecast */

  /**
   * The assumptions a forecast should start from, read off real sales.
   *
   * Every field can be null, and null means "we have not sold enough to say" —
   * never a plausible-looking default dressed up as data. The forecast is
   * responsible for choosing what to assume in that case, and for labelling it
   * as an assumption; a made-up 4.99 returned from here would be indistinguishable
   * from a measured one by the time it reached the slider.
   */
  function forecastBasis(ix, from, to) {
    var s = summarize(ix, from, to);
    var mo = s.byPlan.monthly, an = s.byPlan.annual;

    /* Churn we actually saw, as a monthly rate: MRR cancelled in the window
       over the MRR that was live when it opened, scaled to 30 days. Null unless
       something was actually cancelled — a 0% churn reported from a window in
       which nobody could have cancelled yet is a claim, not a measurement, and
       the forecast's own fallback says "assumption" where this says nothing. */
    var churnPct = null;
    var opening = 0;
    ix.rows.forEach(function (r) { if (isLiveOn(r, from)) opening += mrrOf(r); });
    if (opening > 0 && s.churnedMrr > 0) {
      var days = Math.max(1, diffDays(from, to) + 1);
      churnPct = Math.min(100, (s.churnedMrr / opening) * (30 / days) * 100);
    }

    return {
      monthlyPrice: mo.units ? mo.bookings / mo.units : null,
      annualPrice: an.units ? an.bookings / an.units : null,
      annualShare: s.annualUnitShare,
      churnPct: churnPct,
      units: mo.units + an.units,
      unknownCount: s.unknownCount
    };
  }

  return {
    PLANS: PLANS, PLAN_KEYS: PLAN_KEYS, PLATFORMS: PLATFORMS, AGE_BUCKETS: AGE_BUCKETS,
    isRecurring: isRecurring,
    normalize: normalize, normalizeAll: normalizeAll,
    bookingsOf: bookingsOf, mrrOf: mrrOf, isLiveOn: isLiveOn, cohortDayOf: cohortDayOf,
    index: index, summarize: summarize,
    mrrSeries: mrrSeries, monthlyRevenue: monthlyRevenue,
    purchaseAges: purchaseAges, ageByPlan: ageByPlan, byInstallMonth: byInstallMonth,
    dailyTotals: dailyTotals, migrateEntries: migrateEntries, forecastBasis: forecastBasis,
    median: median, range: range
  };
})();
