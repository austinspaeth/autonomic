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
 * THREE-AND-A-HALF. **Churn you cannot attach to a purchase is its own
 * ledger.** Marking `cancelled` needs to know WHICH subscription ended, and a
 * store report does not say — it says "you lost four subscribers last month and
 * about $20 a month with them". That is a real, knowable fact and the old shape
 * had nowhere to put it, so churn read as zero forever and the forecast fell
 * back to its 5% assumption. `churn` is a second collection, a row per
 * OCCURRENCE rather than per subscription: a date, the MRR that stopped and
 * optionally how many subscriptions and which plan. It subtracts from the book
 * from its date forward. Two rules keep it honest. It is a RATE fact and never
 * a CASH one — it moves MRR, ARR, the active count and the churn rate, and it
 * does NOT touch bookings or recognised revenue, because money that already
 * arrived does not un-arrive (that is what `refunded` is for) and there is no
 * purchase here whose recognition schedule could be stopped. And the book is
 * FLOORED at zero: unattached churn is an estimate typed by hand, and an
 * estimate that overshoots the measured book must read as "everything churned",
 * never as negative MRR. `mrrOn` reports `churnFloored` when it has clamped, so
 * a view can say the estimate has outrun the ledger instead of quietly showing
 * a plausible number.
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

  /* ---------------------------------------------------------- churn rows */

  /**
   * One unattached churn event, cleaned.
   *
   * `mrr` is the monthly recurring revenue that STOPPED, in the same units
   * `mrrOf` returns — an annual plan's twelfth, not its yearly price. It is the
   * only field this row exists for and the only one that has to be there.
   *
   * `units` (how many subscriptions ended) and `plan` are both optional and
   * both genuinely unknown when absent, which is why they are absent rather
   * than defaulted: a store report that says "$20/mo lost" and nothing else
   * must not become a claim about four monthly subscribers. `plan: 'unknown'`
   * is the honest label and it is what the stacked MRR chart draws it under.
   *
   * `platform` is optional for the same reason. A churn figure you cannot
   * attribute to a store belongs in the combined view and NOWHERE in a filtered
   * one — `index` drops it under a store filter rather than guessing, and the
   * view says how much it dropped.
   */
  function normalizeChurn(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!isDate(raw.date)) return null;
    var out = {
      id: String(raw.id || ''),
      date: raw.date,
      mrr: Math.max(0, num(raw.mrr))
    };
    if (!out.id) return null;
    if (PLATFORMS[raw.platform]) out.platform = raw.platform;
    out.plan = PLANS[raw.plan] && raw.plan !== 'lifetime' ? raw.plan : 'unknown';
    var units = Math.round(num(raw.units));
    if (units > 0) out.units = units;
    if (raw.note) out.note = String(raw.note);
    return out;
  }

  function normalizeChurnAll(list) {
    return (list || []).map(normalizeChurn).filter(Boolean)
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
  function index(list, platform, churnList) {
    var rows = normalizeAll(list).filter(function (s) {
      return !PLATFORMS[platform] || s.platform === platform;
    });
    var allChurn = normalizeChurnAll(churnList);
    /* A churn row with no store is not in EITHER store, so a filtered index
       drops it. `churnUnattributed` is how many it dropped and what they were
       worth, so a filtered view can disclose the hole rather than report a
       smaller churn figure under a store's name as though that were the whole
       of it. */
    var filtered = PLATFORMS[platform] ? platform : null;
    var churn = allChurn.filter(function (c) {
      return !filtered || c.platform === filtered;
    });
    var unattributed = { count: 0, mrr: 0 };
    if (filtered) {
      allChurn.forEach(function (c) {
        if (!c.platform) { unattributed.count += 1; unattributed.mrr += c.mrr; }
      });
    }
    var byDay = {};
    rows.forEach(function (s) { (byDay[s.date] || (byDay[s.date] = [])).push(s); });
    var days = Object.keys(byDay).sort();
    var churnDays = churn.map(function (c) { return c.date; }).sort();
    return {
      rows: rows,
      churn: churn,
      churnUnattributed: unattributed,
      byDay: byDay,
      days: days,
      first: days[0] || null,
      last: days[days.length - 1] || null,
      /* The ledger's own first and last day, churn included — a book whose only
         event in a window is a cancellation still has something to draw. */
      firstEvent: [days[0], churnDays[0]].filter(Boolean).sort()[0] || null,
      platform: PLATFORMS[platform] ? platform : 'all'
    };
  }

  /* ------------------------------------------------------ unattached churn */

  /** MRR that unattached churn has removed from the book on or before `day`. */
  function churnMrrThrough(ix, day) {
    var t = 0;
    (ix.churn || []).forEach(function (c) { if (c.date <= day) t += c.mrr; });
    return t;
  }

  /** Subscriptions unattached churn has removed on or before `day`. */
  function churnUnitsThrough(ix, day) {
    var t = 0;
    (ix.churn || []).forEach(function (c) { if (c.date <= day) t += (c.units || 0); });
    return t;
  }

  /**
   * The book's MRR on one day, purchases and unattached churn together.
   *
   * `gross` is what the purchase rows alone say, `churned` is what the churn
   * ledger removes, `mrr` is the two netted and floored at zero, and
   * `churnFloored` is true when the flooring actually bit — see rule
   * THREE-AND-A-HALF: a hand-typed estimate that overshoots must say so rather
   * than report a negative book as a small one.
   */
  function mrrOn(ix, day) {
    var gross = 0;
    var byPlan = {};
    PLAN_KEYS.forEach(function (k) { byPlan[k] = 0; });
    ix.rows.forEach(function (r) {
      if (!isLiveOn(r, day)) return;
      var m = mrrOf(r);
      gross += m;
      byPlan[r.plan] += m;
    });
    var churned = churnMrrThrough(ix, day);
    /* Charged against the plan the churn row names, and what that plan cannot
       absorb spills onto the rest — the stacked chart has to sum to the netted
       total whatever plan the estimate was filed under, and a negative band is
       not a thing that can be drawn. */
    var spill = 0;
    (ix.churn || []).forEach(function (c) {
      if (c.date > day) return;
      var take = Math.min(c.mrr, byPlan[c.plan] || 0);
      byPlan[c.plan] -= take;
      spill += c.mrr - take;
    });
    PLAN_KEYS.forEach(function (k) {
      if (spill <= 0) return;
      var take = Math.min(spill, byPlan[k]);
      byPlan[k] -= take;
      spill -= take;
    });
    return {
      gross: gross, churned: churned,
      mrr: Math.max(0, gross - churned),
      byPlan: byPlan,
      churnFloored: churned > gross + 1e-9
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
      /* The two halves of churn, kept apart because they are different
         evidence: `cancelledMrr` is subscriptions you could point at, and
         `unattachedMrr` is a figure off a store report with no purchase behind
         it. `churnedMrr` is their sum and is what everything downstream reads;
         the split exists so a view can say which kind it is looking at. */
      cancelledMrr: 0, unattachedMrr: 0,
      cancelledCount: 0, unattachedCount: 0, churnedUnits: 0, churnUnitsKnown: 0,
      refunds: 0, refundedCount: 0,
      byPlan: {}, byPlatform: {},
      mrr: 0, grossMrr: 0, churnDrag: 0, churnFloored: false,
      arr: 0, active: 0, activeOther: 0, activeByPlan: {},
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
        s.cancelledMrr += mrrOf(r);
        s.cancelledCount += r.qty;
        s.churnedUnits += r.qty;
      }
      if (isLiveOn(r, to)) {
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

    /* Unattached churn, booked against the window it happened in — the same
       rule the block above follows for a cancellation, and for the same
       reason. */
    (ix.churn || []).forEach(function (c) {
      if (c.date < from || c.date > to) return;
      s.unattachedMrr += c.mrr;
      s.unattachedCount += 1;
      if (c.units) { s.churnedUnits += c.units; s.churnUnitsKnown += c.units; }
    });
    s.churnedMrr = s.cancelledMrr + s.unattachedMrr;

    /* The book on `to`, netted. `grossMrr` is what the purchase rows alone say
       and `churnDrag` the gap, so a view can show the estimate's weight rather
       than only its result. */
    var book = mrrOn(ix, to);
    s.grossMrr = book.gross;
    s.mrr = book.mrr;
    s.churnDrag = book.churned;
    s.churnFloored = book.churnFloored;
    PLAN_KEYS.forEach(function (k) { s.activeByPlan[k].mrr = book.byPlan[k]; });
    /* The active COUNT nets out only the churn rows that said how many
       subscriptions they were, because a row that named a dollar figure and no
       count is not evidence about the headcount. Floored at zero for the same
       reason the MRR is. */
    var lostUnits = churnUnitsThrough(ix, to);
    s.activeGross = s.active;
    s.active = Math.max(0, s.active - lostUnits);
    s.activeChurned = Math.min(lostUnits, s.activeGross);

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

  /** MRR live on each day of a window, split by plan. The book's running rate.
   *  Net of unattached churn, which is what makes the line fall on a day
   *  nothing was cancelled on: `gross` and `churned` travel alongside so a
   *  chart can draw the drag rather than only the result. */
  function mrrSeries(ix, from, to) {
    return range(from, to).map(function (d) {
      var book = mrrOn(ix, d);
      var row = { date: d, total: book.mrr, gross: book.gross, churned: book.churned };
      PLAN_KEYS.forEach(function (k) { row[k] = book.byPlan[k]; });
      return row;
    });
  }

  /** Churned MRR per day, for the window. Unattached rows plus the
   *  cancellations you could point at, which is the whole of churn. */
  function churnSeries(ix, from, to) {
    var byDay = {};
    function bump(day, mrr, units, kind) {
      var r = byDay[day] || (byDay[day] = { date: day, mrr: 0, units: 0, cancelled: 0, unattached: 0 });
      r.mrr += mrr; r.units += units; r[kind] += mrr;
    }
    ix.rows.forEach(function (r) {
      if (r.refunded || !r.cancelled) return;
      if (r.cancelled < from || r.cancelled > to) return;
      bump(r.cancelled, mrrOf(r), r.qty, 'cancelled');
    });
    (ix.churn || []).forEach(function (c) {
      if (c.date < from || c.date > to) return;
      bump(c.date, c.mrr, c.units || 0, 'unattached');
    });
    return range(from, to).map(function (d) {
      return byDay[d] || { date: d, mrr: 0, units: 0, cancelled: 0, unattached: 0 };
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
   * "when did the money land" and the one that says whether an ad spot brought
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

    /* Churn we actually saw, as a monthly rate: MRR that left the window over
       the MRR that was AT RISK across it, scaled to 30 days. Null unless
       something actually churned — a 0% churn reported from a window in which
       nobody could have cancelled yet is a claim, not a measurement, and the
       forecast's own fallback says "assumption" where this says nothing.
       Cancellations and unattached churn both count; they are the same event
       recorded with different evidence.

       THE DENOMINATOR IS THE MEAN DAILY BOOK, not the book on the opening day,
       and the difference is not academic. The forecast reads a 180-day window.
       An account whose first sale is inside that window has an opening book of
       ZERO, so an opening-MRR rate is undefined and the projection fell back to
       its 5% assumption forever — which is every young account, and exactly the
       one the churn ledger was built for. On a book that grew several times
       over inside the window it is worse than undefined: dividing a whole
       window's losses by the handful of subscriptions that existed on day one
       reports a churn rate several times the real one, and the forecast then
       projects the book into the ground. The mean is the MRR the window's churn
       actually had to come out of, it is defined whenever the book was ever
       non-empty, and it does not jump because one purchase happens to fall
       either side of the window's edge. Net of churn already recorded, so a
       book that has been churning for a while is not measured against a gross
       one it never had. */
    var churnPct = null;
    var atRisk = 0, coveredDays = 0;
    range(from, to).forEach(function (d) {
      atRisk += mrrOn(ix, d).mrr;
      coveredDays += 1;
    });
    var meanBook = coveredDays ? atRisk / coveredDays : 0;
    if (meanBook > 0 && s.churnedMrr > 0) {
      churnPct = Math.min(100, (s.churnedMrr / meanBook) * (30 / coveredDays) * 100);
    }

    return {
      monthlyPrice: mo.units ? mo.bookings / mo.units : null,
      annualPrice: an.units ? an.bookings / an.units : null,
      annualShare: s.annualUnitShare,
      churnPct: churnPct,
      /* The book the rate was struck against, so a view can show its own
         denominator rather than asking the reader to trust a percentage. */
      meanBook: meanBook,
      /* What the rate was measured from, so the forecast can say whether it is
         reading cancellations it can point at or a hand-entered estimate. */
      churnedMrr: s.churnedMrr,
      cancelledMrr: s.cancelledMrr,
      unattachedMrr: s.unattachedMrr,
      units: mo.units + an.units,
      unknownCount: s.unknownCount
    };
  }

  return {
    PLANS: PLANS, PLAN_KEYS: PLAN_KEYS, PLATFORMS: PLATFORMS, AGE_BUCKETS: AGE_BUCKETS,
    isRecurring: isRecurring,
    normalize: normalize, normalizeAll: normalizeAll,
    normalizeChurn: normalizeChurn, normalizeChurnAll: normalizeChurnAll,
    bookingsOf: bookingsOf, mrrOf: mrrOf, isLiveOn: isLiveOn, cohortDayOf: cohortDayOf,
    index: index, summarize: summarize,
    mrrOn: mrrOn, churnMrrThrough: churnMrrThrough, churnUnitsThrough: churnUnitsThrough,
    mrrSeries: mrrSeries, churnSeries: churnSeries, monthlyRevenue: monthlyRevenue,
    purchaseAges: purchaseAges, ageByPlan: ageByPlan, byInstallMonth: byInstallMonth,
    dailyTotals: dailyTotals, migrateEntries: migrateEntries, forecastBasis: forecastBasis,
    median: median, range: range
  };
})();
