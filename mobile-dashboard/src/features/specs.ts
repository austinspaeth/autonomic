/* What each metric card says, at rest and opened. Pure: a snapshot and a
 * date in, card specs out. At a glance cards are RANGE totals from the
 * store funnel, so they are compared against the previous range of the same
 * length, the per-day average and the best day, and broken down by store.
 * (App usage builds its own, in features/UsageView.tsx.)
 */
import { createElement } from 'react';
import type { ChartSpec, MetricSpec, Change, Comparison } from '../components/MetricTiles';
import { StackedBars } from '../components/series';
import { bookOn, daysToBuy, ledger, PLANS, renewals, summarize as summarizeLedger, type PlanKey } from '../lib/sales';
import { ConversionByDay } from './GlanceBodies';
import type { RevenueDay } from './RevenueDeepDive';
import type { Part } from '../components/charts';
import type { Snapshot } from '../lib/data';
import { addDays, dayDate, shortDate } from '../lib/dates';
import { int, money } from '../lib/format';
import type { Series } from '../lib/metrics';
import { buildBase, cumAt, dayRec, summarize, trialExit, type Field, type StoreBase, type StoreFilter, type Summary } from '../lib/store';
import { ledgerConversionReached, type UsageIndex } from '../lib/usage';
import { C } from '../theme';

const fmtPct = (v: number | null) => (v === null ? '–' : `${v.toFixed(1)}%`);
/** Two decimals: a share of impressions that paid is a fraction of a percent. */
const fmtPct2 = (v: number | null) => (v === null ? '–' : `${v.toFixed(2)}%`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

const COUNT_COLOR = C.series;
/** A day needs this much traffic before its rate is worth naming as a best or worst. */
const RATE_MIN_BASE = 20;

/* ----------------------------------------------------------- revenue */

/** Past this many days the revenue chart buckets by month. */
const MONTHLY_AFTER = 120;

/** Everything the Revenue card says: first payments from the ledger and the
 *  renewals it implies, for the window, the one before it, and by day. */
export function revenueOf(snap: Snapshot | null, platform: StoreFilter, w: GlanceWindow, n: number) {
  const l = ledger(snap?.load?.sales, snap?.load?.churn, platform);
  const cur = summarizeLedger(l, w.from, w.to);
  const prev = summarizeLedger(l, w.prevFrom, w.prevTo);
  const ren = renewals(l, w.from, w.to);
  const renPrev = renewals(l, w.prevFrom, w.prevTo);
  const sum = (rs: { amount: number }[]) => rs.reduce((t, r) => t + r.amount, 0);
  const upcoming = renewals(l, addDays(w.to, 1), addDays(w.to, 30));

  const byDay = new Map<string, RevenueDay>();
  const at = (day: string) => byDay.get(day) || byDay.set(day, { day, fresh: 0, renew: 0, purchases: 0, charges: 0 }).get(day)!;
  l.rows.forEach((r) => {
    if (r.refunded || r.date < w.from || r.date > w.to) return;
    const d = at(r.date);
    d.fresh += r.price * r.qty;
    d.purchases += r.qty;
  });
  const renewByPlan: Record<PlanKey, number> = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
  ren.forEach((r) => {
    const d = at(r.date);
    d.renew += r.amount;
    d.charges += 1;
    renewByPlan[r.plan] += r.amount;
  });
  const days = [...byDay.values()].filter((d) => d.fresh + d.renew > 0).sort((a, b) => b.day.localeCompare(a.day));
  const best = days.reduce<RevenueDay | null>((m, d) => (!m || d.fresh + d.renew > m.fresh + m.renew ? d : m), null);

  const monthly = n > MONTHLY_AFTER;
  const buckets: { x: string; fresh: number; renew: number }[] = [];
  for (let d = w.from; d <= w.to; d = addDays(d, 1)) {
    const x = monthly ? `${d.slice(0, 7)}-01` : d;
    const last = buckets[buckets.length - 1];
    const b = last && last.x === x ? last : (buckets.push({ x, fresh: 0, renew: 0 }), buckets[buckets.length - 1]);
    const day = byDay.get(d);
    if (day) {
      b.fresh += day.fresh;
      b.renew += day.renew;
    }
  }

  /* Per store, only when both are on screen. Renewals follow their purchase's store. */
  const store = (p: 'ios' | 'android') => {
    const sl = ledger(snap?.load?.sales, [], p);
    return summarizeLedger(sl, w.from, w.to).totalBookings + sum(renewals(sl, w.from, w.to));
  };
  return {
    fresh: cur.totalBookings,
    renew: sum(ren),
    total: cur.totalBookings + sum(ren),
    prevFresh: prev.totalBookings,
    prevRenew: sum(renPrev),
    prevTotal: prev.totalBookings + sum(renPrev),
    purchases: cur.totalUnits,
    charges: ren.length,
    refunds: cur.refunds,
    byPlan: cur.bookings,
    renewByPlan,
    days,
    best,
    buckets,
    monthly,
    mrr: bookOn(l, w.to).mrr,
    upcoming: sum(upcoming),
    upcomingCharges: upcoming.length,
    cut: snap?.load?.settings?.storeCutPct ?? 0,
    stores: platform === 'all' ? { ios: store('ios'), android: store('android') } : null,
  };
}

/* ------------------------------------------------------------ glance */

export type GlanceWindow = {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** The previous window is fully covered by data, so a change is honest. */
  deltaOK: boolean;
};

function storeParts(i: number, a: number): Part[] {
  return [
    { key: 'I', label: 'iOS', value: i, color: C.ios },
    { key: 'A', label: 'Android', value: a, color: C.android },
  ];
}

function series(from: string, to: string, f: (d: string) => number): Series {
  const out: Series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, value: f(d) });
  return out;
}

/** A series' running total, for "how did the range build up". */
export function running(sr: Series): Series {
  let t = 0;
  return sr.map((p) => ({ day: p.day, value: (t += p.value) }));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** A daily series as its average on each weekday, Monday first. Days after `upTo` are unreported and left out. */
export function byWeekday(sr: Series, upTo?: string | null): Series {
  const sum = WEEKDAYS.map(() => 0);
  const n = WEEKDAYS.map(() => 0);
  sr.forEach((p) => {
    if (upTo && p.day > upTo) return;
    const i = (new Date(`${p.day}T12:00:00Z`).getUTCDay() + 6) % 7;
    sum[i] += p.value;
    n[i] += 1;
  });
  return WEEKDAYS.map((day, i) => ({ day, value: n[i] ? sum[i] / n[i] : 0 }));
}
/** For a chart whose x keys are already words. */
export const asIs = (k: string) => k;
const avg = (n: number) => (n >= 10 ? int(n) : n.toFixed(1));

function best(sr: Series, fmt: (n: number) => string, upTo?: string | null): string {
  let top: { day: string; value: number } | null = null;
  sr.forEach((p) => {
    if (upTo && p.day > upTo) return;
    if (!top || p.value > top.value) top = p;
  });
  const t = top as { day: string; value: number } | null;
  return t && t.value > 0 ? `${fmt(t.value)} · ${shortDate(t.day)}` : '–';
}

/** The ping index for the filter on screen and, when that is both stores, one per store. */
export type GlanceUsage = { all: UsageIndex; ios: UsageIndex | null; android: UsageIndex | null };

export function glanceSpecs(snap: Snapshot | null, platform: StoreFilter, b: StoreBase, w: GlanceWindow, usage: GlanceUsage): MetricSpec[] {
  const cur = snap?.load?.settings?.currency || '$';
  const $ = (n: number) => money(n, cur);
  const s = summarize(b, w.from, w.to);
  const ps = summarize(b, w.prevFrom, w.prevTo);
  const n = daysBetween(w.from, w.to) + 1;
  const prevLabel = `vs previous ${n} days`;
  const ch = (a: number, p: number): Change => (w.deltaOK ? { value: a, base: p } : null);
  const T = trialExit(b);
  /* Store reports lag: after the last one, a day is unreported, not zero. */
  const reportedTo = b.lastReported && b.lastReported < w.to ? b.lastReported : w.to;
  const unknownAfter = reportedTo < w.to ? reportedTo : null;
  const reportedDays = Math.max(1, daysBetween(w.from, reportedTo) + 1);

  // Per-store halves, only when both stores are on screen.
  const both = platform === 'all';
  const bI = both ? buildBase(snap, 'ios') : null;
  const bA = both ? buildBase(snap, 'android') : null;
  const sI: Summary | null = bI ? summarize(bI, w.from, w.to) : null;
  const sA: Summary | null = bA ? summarize(bA, w.from, w.to) : null;
  /** Installs that finished the trial inside [from, to] (they installed T days earlier). */
  const crossed = (base: StoreBase, from: string, to: string) =>
    cumAt(base, addDays(to, -trialExit(base)), 'downloads') - cumAt(base, addDays(from, -1 - trialExit(base)), 'downloads');
  const split = (title: string, f: (x: Summary) => number, format?: (n: number) => string) =>
    sI && sA ? [{ title, parts: storeParts(f(sI), f(sA)), format }] : undefined;
  const rateRows = (f: (x: Summary) => number | null): Comparison[] =>
    sI && sA ? [{ label: 'iOS', value: fmtPct(f(sI)) }, { label: 'Android', value: fmtPct(f(sA)) }] : [];

  const field = (k: Field) => series(w.from, w.to, (d) => dayRec(b, d)[k]);
  const ratio = (num: Field, den: Field) =>
    series(w.from, w.to, (d) => {
      const r = dayRec(b, d);
      return r[den] ? (r[num] / r[den]) * 100 : 0;
    });

  const downloads = field('downloads');
  const crossing = series(w.from, w.to, (d) => dayRec(b, addDays(d, -T)).downloads);
  const sales = field('sales');
  const crossedNow = crossed(b, w.from, w.to);
  const crossedPrev = crossed(b, w.prevFrom, w.prevTo);
  /* Conversion in a window: paid in it over the installs that FINISHED THE
     TRIAL in it (the web's recent-conversion rule). A surge of installs only
     enters the denominator once it has had the whole trial to decide, so a
     spike in downloads cannot dilute the rate. Sales are by purchase date and
     cannot be tied to an install, so a surge that buys inside its trial lifts
     the rate early; that is said in the card. */
  const convIn = (sales: number, cross: number) => (cross ? (sales / cross) * 100 : null);
  const convNow = convIn(s.sales, crossedNow);
  const convPrev = convIn(ps.sales, crossedPrev);

  const l = ledger(snap?.load?.sales, snap?.load?.churn, platform);

  /* Converted by day N: of the installs that turned N days old in the range
     (the pings' cohort sizes), the share with a LEDGER sale carrying that
     install day, bought by then. Unlike the rate above it ties each purchase
     to its install. Each N is its own set of installs (only ones old enough
     for it), so the three are not one curve and a later one can read lower. */
  const lI = usage.ios ? ledger(snap?.load?.sales, snap?.load?.churn, 'ios').rows : null;
  const lA = usage.android ? ledger(snap?.load?.sales, snap?.load?.churn, 'android').rows : null;
  const undated = l.rows.filter((r) => !r.refunded && !r.cohort).reduce((t, r) => t + Math.max(1, r.qty || 1), 0);
  const byAge = [7, 14, 30].map((N) => {
    const now = ledgerConversionReached(usage.all, l.rows, w.from, w.to, N);
    const prev = ledgerConversionReached(usage.all, l.rows, w.prevFrom, w.prevTo, N);
    return {
      n: N,
      now,
      prev: w.deltaOK && prev.available ? prev : null,
      ios: usage.ios && lI ? ledgerConversionReached(usage.ios, lI, w.from, w.to, N) : null,
      android: usage.android && lA ? ledgerConversionReached(usage.android, lA, w.from, w.to, N) : null,
      series: series(w.from, w.to, (d) => ledgerConversionReached(usage.all, l.rows, d, d, N).pct ?? 0),
    };
  });
  const ls = summarizeLedger(l, w.from, w.to);
  const buy = daysToBuy(l, w.from, w.to);

  /* What every count card adds under its own chart: how the range built up,
     and which weekdays carry it. */
  const countCharts = (sr: Series, color: string, upTo: string | null, fmt: (n: number) => string = int): ChartSpec[] => [
    { title: 'Running total over the range', series: running(sr), format: fmt, color, unknownAfter: upTo },
    { title: 'Average by weekday', series: byWeekday(sr, upTo ?? undefined), format: avg, color, xLabel: asIs },
  ];
  /* What every rate card adds: the two counts the rate is made of, so a
     move in the rate can be traced to the side that moved. */
  const rateCharts = (top: string, num: Field, bottom: string, den: Field): ChartSpec[] => [
    { title: `${top} per day`, series: field(num), format: int, color: '#199e70', unknownAfter: num === 'sales' ? null : unknownAfter },
    { title: `${bottom} per day`, series: field(den), format: int, color: C.muted, unknownAfter },
  ];
  /** The rate's best and weakest day, over days with enough traffic to carry one. */
  const rateDays = (num: Field, den: Field, fmt: (v: number | null) => string): Comparison[] => {
    const days: { day: string; v: number }[] = [];
    for (let d = w.from; d <= reportedTo; d = addDays(d, 1)) {
      const r = dayRec(b, d);
      if (r[den] >= RATE_MIN_BASE) days.push({ day: d, v: (r[num] / r[den]) * 100 });
    }
    if (days.length < 2) return [];
    const hi = days.reduce((m, x) => (x.v > m.v ? x : m));
    const lo = days.reduce((m, x) => (x.v < m.v ? x : m));
    return [
      { label: 'Best day', value: `${fmt(hi.v)} · ${shortDate(hi.day)}` },
      { label: 'Weakest day', value: `${fmt(lo.v)} · ${shortDate(lo.day)}` },
    ];
  };

  /* The paid rates divide purchases by store traffic, so they stop where the
     store reports stop: a purchase on a day with no report yet has no
     impressions to be a share of. */
  const sr = reportedTo < w.to ? summarize(b, w.from, reportedTo) : s;
  const srOf = (base: StoreBase | null) => (base ? summarize(base, w.from, reportedTo) : null);
  const paidRate = (sales: number, traffic: number) => (traffic ? (sales / traffic) * 100 : null);
  const paidChange = (f: (x: Summary) => number | null): Change => {
    const now = f(sr);
    const before = f(ps);
    return now !== null && before !== null && w.deltaOK ? { value: now, base: before } : null;
  };
  const paidRows = (f: (x: Summary) => number | null): Comparison[] => {
    const i = srOf(bI);
    const a = srOf(bA);
    return i && a ? [{ label: 'iOS', value: fmtPct2(f(i)) }, { label: 'Android', value: fmtPct2(f(a)) }] : [];
  };
  const paidNote = 'Purchases in the range over store traffic in the range. A purchase usually follows its impression by days, so read it as a rate of flow, not of the same people.';

  return [
    {
      key: 'downloads',
      label: 'First-time downloads',
      value: int(s.downloads),
      change: ch(s.downloads, ps.downloads),
      comparisons: [
        { label: prevLabel, change: ch(s.downloads, ps.downloads) },
        { label: 'Per reported day', value: int(s.downloads / reportedDays) },
        { label: 'Best day', value: best(downloads, int, reportedTo) },
        { label: 'All time', value: int(s.totalInstalls) },
      ],
      splits: split('By store', (x) => x.downloads, int),
      body:
        bI && bA
          ? createElement(StackedBars, {
              title: 'By store, per day',
              keys: [
                { key: 'I', label: 'iOS', color: C.ios },
                { key: 'A', label: 'Android', color: C.android },
              ],
              rows: downloads.map((p) => ({ x: p.day, values: p.day > reportedTo ? null : { I: dayRec(bI, p.day).downloads, A: dayRec(bA, p.day).downloads } })),
              xLabel: dayDate,
              format: int,
              height: 96,
              summary: `${int(s.downloads)} in the range`,
            })
          : undefined,
      chart: { title: 'Per day', series: downloads, format: int, color: COUNT_COLOR, unknownAfter },
      charts: countCharts(downloads, COUNT_COLOR, unknownAfter),
    },
    {
      key: 'outOfTrial',
      label: `Out of trial (past day ${b.trialDays})`,
      value: int(crossedNow),
      change: ch(crossedNow, crossedPrev),
      note: `Installs that finished the ${b.trialDays}-day trial in this range, against the range before.`,
      comparisons: [
        { label: prevLabel, change: ch(crossedNow, crossedPrev) },
        { label: 'Out of trial, all time', value: int(s.outOfTrial) },
        { label: 'Share of all installs', value: s.totalInstalls ? fmtPct((s.outOfTrial / s.totalInstalls) * 100) : '–' },
        { label: 'Still in trial', value: int(s.inTrial) },
      ],
      splits: bI && bA ? [{ title: 'By store', parts: storeParts(crossed(bI, w.from, w.to), crossed(bA, w.from, w.to)), format: int }] : undefined,
      chart: { title: 'Crossing per day', series: crossing, format: int, color: COUNT_COLOR, unknownAfter },
      charts: [
        { title: 'Out of trial, all time', series: series(w.from, w.to, (d) => cumAt(b, addDays(d, -T), 'downloads')), format: int, color: COUNT_COLOR, unknownAfter },
        { title: 'Still in trial', series: series(w.from, w.to, (d) => cumAt(b, d, 'downloads') - cumAt(b, addDays(d, -T), 'downloads')), format: int, color: '#199e70', unknownAfter },
      ],
    },
    {
      key: 'paid',
      label: 'Paid conversions',
      value: int(s.sales),
      change: ch(s.sales, ps.sales),
      note: 'Sales in this range, against the range before.',
      comparisons: [
        { label: prevLabel, change: ch(s.sales, ps.sales) },
        { label: 'Best day', value: best(sales, int) },
        { label: 'All time', value: int(s.totalSales) },
        { label: 'Per day', value: avg(s.sales / n) },
        { label: 'First payments in range', value: $(s.revenue) },
        { label: 'Per purchase', value: s.sales ? $(s.revenue / s.sales) : '–' },
        { label: 'Days with a sale', value: `${int(sales.filter((p) => p.value > 0).length)} of ${int(n)}` },
        ...(ls.refunds ? [{ label: 'Refunded in range', value: int(ls.refunds) }] : []),
        { label: 'All-time revenue', value: $(s.totalRevenue) },
      ],
      splits: [
        ...(split('By store', (x) => x.sales, int) ?? []),
        { title: 'By plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: ls.units[p.key], color: p.color })), format: int },
      ],
      chart: { title: 'Per day', series: sales, format: int, color: '#199e70' },
      charts: [
        ...countCharts(sales, '#199e70', null),
        {
          title: 'Days from install to paying',
          series: buy.buckets.map((x) => ({ day: x.label, value: x.value })),
          format: int,
          color: '#c98500',
          xLabel: asIs,
          summary: buy.without ? `${int(buy.without)} with no install date` : '',
        },
      ],
    },
    {
      key: 'convert',
      label: 'Convert rate, past trial',
      value: fmtPct(convNow),
      change: convNow !== null && convPrev !== null && w.deltaOK ? { value: convNow, base: convPrev } : null,
      note: 'Sales in this range over the installs that finished the trial in it. Sales are by purchase date, so a burst that buys during its trial lifts it early.',
      comparisons: [
        { label: 'Paid in range', value: int(s.sales) },
        { label: 'Finished the trial in range', value: int(crossedNow) },
        { label: `Previous ${n} days`, value: fmtPct(convPrev) },
        { label: 'All time', value: fmtPct(s.convOfOutOfTrial) },
        ...(sI && sA && bI && bA
          ? [
              { label: 'iOS', value: fmtPct(convIn(sI.sales, crossed(bI, w.from, w.to))) },
              { label: 'Android', value: fmtPct(convIn(sA.sales, crossed(bA, w.from, w.to))) },
            ]
          : []),
      ],
      body: createElement(ConversionByDay, { items: byAge, undated }),
      charts: [
        { title: 'Paid per day', series: sales, format: int, color: '#199e70' },
        { title: 'Finished the trial per day', series: crossing, format: int, color: C.muted, unknownAfter },
      ],
      chart: {
        title: 'Running rate over the range',
        series: series(w.from, w.to, (d) => {
          const c = crossed(b, w.from, d);
          const paid = cumAt(b, d, 'sales') - cumAt(b, addDays(w.from, -1), 'sales');
          return c ? (paid / c) * 100 : 0;
        }),
        format: (v) => fmtPct(v),
        color: COUNT_COLOR,
      },
    },
    {
      key: 'impToInstall',
      label: 'Impression → install',
      value: fmtPct(s.storeConv),
      change: s.storeConv !== null && ps.storeConv !== null && w.deltaOK ? { value: s.storeConv, base: ps.storeConv } : null,
      comparisons: [
        { label: 'Impressions', value: int(s.impressions) },
        { label: 'Downloads', value: int(s.downloads) },
        { label: `Previous ${n} days`, value: fmtPct(ps.storeConv) },
        ...rateRows((x) => x.storeConv),
        ...rateDays('downloads', 'impressions', fmtPct),
      ],
      chart: { title: 'Per day', series: ratio('downloads', 'impressions'), format: fmtPct, color: COUNT_COLOR, unknownAfter },
      charts: rateCharts('Downloads', 'downloads', 'Impressions', 'impressions'),
    },
    {
      key: 'impToPv',
      label: 'Impression → page view',
      value: fmtPct(s.tapThrough),
      change: s.tapThrough !== null && ps.tapThrough !== null && w.deltaOK ? { value: s.tapThrough, base: ps.tapThrough } : null,
      comparisons: [
        { label: 'Impressions', value: int(s.impressions) },
        { label: 'Product page views', value: int(s.pageViews) },
        { label: `Previous ${n} days`, value: fmtPct(ps.tapThrough) },
        ...rateRows((x) => x.tapThrough),
        ...rateDays('pageViews', 'impressions', fmtPct),
      ],
      chart: { title: 'Per day', series: ratio('pageViews', 'impressions'), format: fmtPct, color: '#d95926', unknownAfter },
      charts: rateCharts('Page views', 'pageViews', 'Impressions', 'impressions'),
    },
    {
      key: 'pvToInstall',
      label: 'Page view → install',
      value: fmtPct(s.ppvConv),
      change: s.ppvConv !== null && ps.ppvConv !== null && w.deltaOK ? { value: s.ppvConv, base: ps.ppvConv } : null,
      comparisons: [
        { label: 'Product page views', value: int(s.pageViews) },
        { label: 'Downloads', value: int(s.downloads) },
        { label: `Previous ${n} days`, value: fmtPct(ps.ppvConv) },
        ...rateRows((x) => x.ppvConv),
        ...rateDays('downloads', 'pageViews', fmtPct),
      ],
      chart: { title: 'Per day', series: ratio('downloads', 'pageViews'), format: fmtPct, color: '#3987e5', unknownAfter },
      charts: rateCharts('Downloads', 'downloads', 'Page views', 'pageViews'),
    },
    {
      key: 'pvToPaid',
      label: 'Page view → paid',
      value: fmtPct2(paidRate(sr.sales, sr.pageViews)),
      change: paidChange((x) => paidRate(x.sales, x.pageViews)),
      note: paidNote,
      comparisons: [
        { label: 'Product page views', value: int(sr.pageViews) },
        { label: 'Purchases', value: int(sr.sales) },
        { label: 'Page views per purchase', value: sr.sales ? int(sr.pageViews / sr.sales) : '–' },
        { label: `Previous ${n} days`, value: fmtPct2(paidRate(ps.sales, ps.pageViews)) },
        ...paidRows((x) => paidRate(x.sales, x.pageViews)),
        ...rateDays('sales', 'pageViews', fmtPct2),
      ],
      chart: { title: 'Per day', series: ratio('sales', 'pageViews'), format: fmtPct2, color: '#199e70', unknownAfter },
      charts: rateCharts('Purchases', 'sales', 'Page views', 'pageViews'),
    },
  ];
}
