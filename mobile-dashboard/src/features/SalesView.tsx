/* Sales: the subscription ledger, read the way the web dashboard's Sales view
 * reads it (lib/sales.ts keeps its rules: cash and MRR are never one number,
 * an unknown term never counts toward MRR, a subscription runs until marked
 * cancelled, renewals are always "estimated").
 *
 * The range and store filter come from the floating filter bar; the range
 * ends on the selected date. Tap a purchase to edit or delete it.
 */
import { createElement, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BarChart, SplitBar } from '../components/charts';
import { MetricTiles, type Change, type ChartSpec, type MetricSpec } from '../components/MetricTiles';
import { StackedBars, type Key } from '../components/series';
import { Card, Divider, Dot, Empty, Pill } from '../components/ui';
import { DeepDive, DeepDiveGrid } from '../components/DeepDive';
import { RenewalCalendar } from './RenewalCalendar';
import { useData } from '../lib/data';
import { addDays, dayDate, shortDate } from '../lib/dates';
import { int, money } from '../lib/format';
import { addMonths, bookOn, bookingsOf, daysToBuy, ledger, LTV_MIN_DAYS, ltv, mrrOf, PLANS, renewals, summarize, type PlanKey, type SalesFilter } from '../lib/sales';
import type { Sale } from '../lib/types';
import { rangeDays } from '../lib/usage';
import { C, num } from '../theme';
import { SaleEditor } from './AddSheet';
import { RevenueBody } from './RevenueDeepDive';
import { asIs, byWeekday, revenueOf, running } from './specs';

const planKeys = (keys: PlanKey[]): Key[] => PLANS.filter((p) => keys.includes(p.key)).map((p) => ({ key: p.key, label: p.label, color: p.color }));

export function SalesView({ dk, range, platform }: { dk: string; range: '7' | '30' | '90' | 'all'; platform: SalesFilter }) {
  const { snap } = useData();
  const cur = snap?.load?.settings?.currency || '$';
  const $ = (n: number) => money(n, cur);
  const [editing, setEditing] = useState<Sale | null>(null);

  const m = useMemo(() => {
    const l = ledger(snap?.load?.sales, snap?.load?.churn, platform);
    const first = l.rows[0]?.date ?? dk;
    let from = range === 'all' ? first : addDays(dk, -(Number(range) - 1));
    if (from > dk) from = dk;
    const days = rangeDays(from, dk);
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days.length - 1));
    const prevOK = range !== 'all' && prevFrom >= first;
    const book = bookOn(l, dk);
    // Point-in-time figures compare against the book as the range began.
    const book30 = bookOn(l, addDays(from, -1));
    const s = summarize(l, from, dk);
    const ps = summarize(l, prevFrom, prevTo);
    const ren = renewals(l, from, dk);
    const renPrev = renewals(l, prevFrom, prevTo);
    // A year ahead: as far as one annual term can put a charge.
    const ahead = renewals(l, addDays(dk, 1), addDays(dk, 365));
    const upcoming = ahead.filter((x) => x.date <= addDays(dk, 30));
    const ios = platform === 'all' ? bookOn(ledger(snap?.load?.sales, [], 'ios'), dk) : null;
    const android = platform === 'all' ? bookOn(ledger(snap?.load?.sales, [], 'android'), dk) : null;
    // Days for short ranges, months for long ones, so the bars stay readable.
    const monthly = days.length > 120;
    const buckets = monthly
      ? [...new Set(days.map((d) => `${d.slice(0, 7)}-01`))]
      : days;
    const inBucket = (d: string, b: string) => (monthly ? d.slice(0, 7) === b.slice(0, 7) : d === b);
    const ltvMonthly = ltv(l, dk, 'monthly');
    const ltvMixed = ltv(l, dk, 'mixed');
    /* The book on every day of the range, and what moved it, for the cards' charts. */
    const books = days.map((d) => bookOn(l, d));
    const added = new Map<string, number>();
    const lost = new Map<string, number>();
    const fresh = new Map<string, number>();
    const units = new Map<string, number>();
    const renew = new Map<string, number>();
    const bump = (mp: Map<string, number>, d: string, n: number) => mp.set(d, (mp.get(d) || 0) + n);
    l.rows.forEach((r) => {
      if (r.refunded) return;
      bump(added, r.date, mrrOf(r));
      bump(fresh, r.date, r.price * r.qty);
      bump(units, r.date, r.qty);
      if (r.cancelled) bump(lost, r.cancelled, mrrOf(r));
    });
    l.churn.forEach((c) => bump(lost, c.date, c.mrr));
    ren.forEach((r) => bump(renew, r.date, r.amount));
    const rev = revenueOf(snap, platform, { from, to: dk, prevFrom, prevTo, deltaOK: prevOK }, days.length);
    return { rev, books, added, lost, fresh, units, renew, l, ltvMonthly, ltvMixed, from, days, prevOK, book, book30, s, ps, ren, renPrev, upcoming, ahead, ios, android, buckets, inBucket, monthly };
  }, [snap, dk, range, platform]);

  const ch = (a: number, b: number): Change => (m.prevOK ? { value: a, base: b } : null);
  const renTotal = m.ren.reduce((t, r) => t + r.amount, 0);
  const renPrevTotal = m.renPrev.reduce((t, r) => t + r.amount, 0);

  const netNew = m.book.mrr - m.book30.mrr;
  const [due, setDue] = useState<string | null>(null);
  const sum = (rs: { amount: number }[]) => rs.reduce((t, x) => t + x.amount, 0);
  const within = (n: number) => m.ahead.filter((x) => x.date <= addDays(dk, n));

  const cut = snap?.load?.settings?.storeCutPct ?? 0;
  /* Lifetime value reads the whole ledger, not the range, so it carries no
     change arrow: there is no "previous range" of a figure the range never cut. */
  const ltvSpec = (key: string, label: string, v: ReturnType<typeof ltv>, what: string, extra: MetricSpec['comparisons'] = []): MetricSpec => ({
    key,
    label,
    value: v.value === null ? '–' : $(v.value),
    note:
      v.value !== null
        ? `What ${what} pays over a whole stay: the monthly rate times the months the churn seen so far says they last. Estimated from the whole ledger, not the range.`
        : !v.units
          ? `No ${what === 'a monthly subscriber' ? 'monthly purchases' : 'subscriptions'} in the ledger yet.`
          : v.young
            ? `Needs ${LTV_MIN_DAYS} days of ledger before a lifetime can be estimated; it holds ${int(v.days)}.`
            : 'Nothing has churned yet, so a lifetime cannot be estimated. Collected so far is the floor.',
    comparisons: [
      { label: 'Pays per month', value: v.perMonth === null ? '–' : $(v.perMonth) },
      { label: 'Monthly churn', value: v.churnPct === null ? '–' : `${v.churnPct.toFixed(1)}%` },
      { label: 'Expected stay', value: v.months === null ? '–' : `${v.months.toFixed(1)} months` },
      ...(v.value !== null && cut ? [{ label: `After the stores' ${cut}%`, value: $(v.value * (1 - cut / 100)) }] : []),
      { label: 'Collected so far, each (est.)', value: v.collected === null ? '–' : $(v.collected) },
      { label: 'Subscribers counted', value: int(v.units) },
      ...extra,
    ],
  });

  /* The cards' charts. A point-in-time figure (the book) is drawn per day; a
     flow (money, purchases) is drawn per bucket, which is a month on a long range. */
  const xl = (x: string) => (m.monthly ? `${shortDate(x).split(' ')[0]} ${x.slice(2, 4)}` : dayDate(x));
  const daily = (f: (i: number) => number) => m.days.map((d, i) => ({ day: d, value: f(i) }));
  const perDay = (mp: Map<string, number>) => m.days.map((d) => ({ day: d, value: mp.get(d) || 0 }));
  const flow = (mp: Map<string, number>) => {
    const out: { day: string; value: number }[] = [];
    m.days.forEach((d) => {
      const k = m.monthly ? `${d.slice(0, 7)}-01` : d;
      const last = out[out.length - 1];
      if (last && last.day === k) last.value += mp.get(d) || 0;
      else out.push({ day: k, value: mp.get(d) || 0 });
    });
    return out;
  };
  const per = m.monthly ? 'By month' : 'Per day';
  const avgFmt = (n: number) => (n >= 10 ? int(n) : n.toFixed(1));
  const flowCharts = (mp: Map<string, number>, color: string, fmt: (n: number) => string, weekdayFmt = fmt): ChartSpec[] => [
    { title: per, series: flow(mp), format: fmt, color, xLabel: xl },
    { title: 'Running total over the range', series: running(perDay(mp)), format: fmt, color },
    { title: 'Average by weekday', series: byWeekday(perDay(mp)), format: weekdayFmt, color, xLabel: asIs },
  ];
  const peak = (sr: { day: string; value: number }[], fmt: (n: number) => string) => {
    const top = sr.reduce<{ day: string; value: number } | null>((a, x) => (!a || x.value > a.value ? x : a), null);
    return top && top.value > 0 ? `${fmt(top.value)} · ${shortDate(top.day)}` : '–';
  };
  const storeSplit = (f: (r: Sale) => number, format: (n: number) => string) => {
    if (platform !== 'all') return [];
    const by = { ios: 0, android: 0 };
    m.l.rows.forEach((r) => {
      if (!r.refunded && r.date >= m.from && r.date <= dk) by[r.platform] += f(r);
    });
    return [{ title: 'By store', parts: [{ key: 'I', label: 'iOS', value: by.ios, color: C.ios }, { key: 'A', label: 'Android', value: by.android, color: C.android }], format }];
  };
  const rev = m.rev;
  const buy = daysToBuy(m.l, m.from, dk);
  const n = m.days.length;
  const prevLabel = `vs previous ${n} days`;
  const collectedDaily = m.days.map((d) => ({ day: d, value: (m.fresh.get(d) || 0) + (m.renew.get(d) || 0) }));
  const mrrSr = daily((i) => m.books[i].mrr);
  const churnStart = m.book30.mrr;

  const mixed = m.ltvMixed;

  const specs: MetricSpec[] = [
    {
      key: 'collected',
      label: 'Total revenue collected',
      value: $(rev.total),
      change: ch(rev.total, rev.prevTotal),
      note: 'Every first payment in the range plus every renewal that fell in it, at the customer-facing price. Refunds are left out. Nothing reports a renewal, so each subscription not marked cancelled is assumed to renew on its term.',
      comparisons: [
        { label: prevLabel, change: ch(rev.total, rev.prevTotal), format: $ },
        { label: `New ${prevLabel}`, change: ch(rev.fresh, rev.prevFresh), format: $ },
        { label: `Renewals ${prevLabel}`, change: ch(rev.renew, rev.prevRenew), format: $ },
        { label: 'New purchases', value: `${$(rev.fresh)} · ${int(rev.purchases)}` },
        { label: 'Renewals (est.)', value: `${$(rev.renew)} · ${int(rev.charges)} ${rev.charges === 1 ? 'charge' : 'charges'}` },
        { label: 'Share from renewals', value: rev.total ? `${((rev.renew / rev.total) * 100).toFixed(0)}%` : '–' },
        { label: `After the stores' ${rev.cut}%`, value: $(rev.total * (1 - rev.cut / 100)) },
        { label: 'Per day', value: $(rev.total / n) },
        { label: 'Best day', value: rev.best ? `${$(rev.best.fresh + rev.best.renew)} · ${shortDate(rev.best.day)}` : '–' },
        { label: 'Days with revenue', value: `${int(rev.days.length)} of ${int(n)}` },
        { label: 'Per new purchase', value: rev.purchases ? $(rev.fresh / rev.purchases) : '–' },
        { label: 'Per renewal', value: rev.charges ? $(rev.renew / rev.charges) : '–' },
        ...(rev.refunds ? [{ label: 'Refunded purchases', value: int(rev.refunds) }] : []),
        { label: 'Renewals due, next 30 days', value: `${$(rev.upcoming)} · ${int(rev.upcomingCharges)}` },
      ],
      splits: [
        {
          title: 'Where it came from',
          parts: [
            { key: 'fresh', label: 'New', value: rev.fresh, color: '#c98500' },
            { key: 'renew', label: 'Renewals (est.)', value: rev.renew, color: '#199e70' },
          ],
          format: $,
        },
        { title: 'New, by plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: rev.byPlan[p.key], color: p.color })), format: $ },
        { title: 'Renewals, by plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: rev.renewByPlan[p.key], color: p.color })), format: $ },
        ...(rev.stores ? [{ title: 'By store', parts: [{ key: 'I', label: 'iOS', value: rev.stores.ios, color: C.ios }, { key: 'A', label: 'Android', value: rev.stores.android, color: C.android }], format: $ }] : []),
      ],
      body: createElement(RevenueBody, { buckets: rev.buckets, monthly: rev.monthly, days: rev.days, format: $, link: false }),
      charts: [
        { title: 'Collected so far, running', series: running(collectedDaily), format: $, color: '#c98500' },
        { title: 'Average by weekday', series: byWeekday(collectedDaily), format: $, color: '#c98500', xLabel: asIs },
        { title: `New purchases, ${per.toLowerCase()}`, series: flow(m.fresh), format: $, color: '#c98500', xLabel: xl },
        { title: `Renewals (est.), ${per.toLowerCase()}`, series: flow(m.renew), format: $, color: '#199e70', xLabel: xl },
      ],
    },
    {
      key: 'mrr',
      label: 'MRR',
      value: $(m.book.mrr),
      change: { value: m.book.mrr, base: m.book30.mrr },
      note: 'The rate the book runs at: an annual plan counts as a twelfth of its price. Net of churn.',
      comparisons: [
        { label: `vs ${shortDate(addDays(m.from, -1))}`, change: { value: m.book.mrr, base: m.book30.mrr }, format: $ },
        { label: 'ARR', value: $(m.book.arr) },
        { label: 'Monthly plans', value: $(m.book.byPlan.monthly) },
        { label: 'Annual plans', value: $(m.book.byPlan.annual) },
        { label: 'Per active subscription', value: m.book.active ? $(m.book.mrr / m.book.active) : '–' },
        { label: 'Highest in range', value: peak(mrrSr, $) },
        { label: 'Added in range', value: $(netNew + m.s.churnedMrr) },
        { label: 'Churned in range', value: $(m.s.churnedMrr) },
      ],
      splits: [
        { title: 'By plan', parts: [{ key: 'monthly', label: 'Monthly', value: m.book.byPlan.monthly, color: PLANS[0].color }, { key: 'annual', label: 'Annual', value: m.book.byPlan.annual, color: PLANS[1].color }], format: $ },
        ...(m.ios && m.android ? [{ title: 'By store', parts: [{ key: 'I', label: 'iOS', value: m.ios.mrr, color: C.ios }, { key: 'A', label: 'Android', value: m.android.mrr, color: C.android }], format: $ }] : []),
      ],
      chart: { title: 'MRR on each day', series: mrrSr, format: $ },
      charts: [
        { title: 'From monthly plans', series: daily((i) => m.books[i].byPlan.monthly), format: $, color: PLANS[0].color },
        { title: 'From annual plans', series: daily((i) => m.books[i].byPlan.annual), format: $, color: PLANS[1].color },
      ],
    },
    {
      key: 'arr',
      label: 'ARR',
      value: $(m.book.arr),
      change: { value: m.book.arr, base: m.book30.arr },
      note: 'MRR times twelve: what the book would bring in over a year if nothing changed.',
      comparisons: [
        { label: `vs ${shortDate(addDays(m.from, -1))}`, change: { value: m.book.arr, base: m.book30.arr }, format: $ },
        { label: 'From monthly plans', value: $(m.book.byPlan.monthly * 12) },
        { label: 'From annual plans', value: $(m.book.byPlan.annual * 12) },
        { label: 'Per active subscription', value: m.book.active ? $(m.book.arr / m.book.active) : '–' },
        { label: `After the stores' ${cut}%`, value: $(m.book.arr * (1 - cut / 100)) },
        { label: 'Highest in range', value: peak(daily((i) => m.books[i].arr), $) },
      ],
      splits: [{ title: 'By plan', parts: [{ key: 'monthly', label: 'Monthly', value: m.book.byPlan.monthly * 12, color: PLANS[0].color }, { key: 'annual', label: 'Annual', value: m.book.byPlan.annual * 12, color: PLANS[1].color }], format: $ }],
      chart: { title: 'ARR on each day', series: daily((i) => m.books[i].arr), format: $ },
    },
    {
      key: 'netNew',
      label: 'Net new MRR',
      value: `${netNew >= 0 ? '+' : ''}${$(netNew)}`,
      note: 'How far the book moved over the range: MRR added by new purchases, less what churned.',
      comparisons: [
        { label: `MRR on ${shortDate(addDays(m.from, -1))}`, value: $(m.book30.mrr) },
        { label: 'MRR now', value: $(m.book.mrr) },
        { label: 'Churned in range', value: $(m.s.churnedMrr) },
        { label: 'Added in range', value: $(netNew + m.s.churnedMrr) },
        { label: 'Per day', value: `${netNew >= 0 ? '+' : ''}${$(netNew / n)}` },
        { label: 'Growth over the range', value: m.book30.mrr ? `${netNew >= 0 ? '+' : ''}${((netNew / m.book30.mrr) * 100).toFixed(1)}%` : '–' },
      ],
      splits: [
        {
          title: 'Added against churned',
          parts: [
            { key: 'added', label: 'Added', value: Math.max(0, netNew + m.s.churnedMrr), color: '#199e70' },
            { key: 'lost', label: 'Churned', value: m.s.churnedMrr, color: '#e66767' },
          ],
          format: $,
        },
      ],
      chart: { title: `MRR added, ${per.toLowerCase()}`, series: flow(m.added), format: $, color: '#199e70', xLabel: xl },
      charts: [
        { title: `MRR churned, ${per.toLowerCase()}`, series: flow(m.lost), format: $, color: '#e66767', xLabel: xl },
        { title: 'MRR on each day', series: mrrSr, format: $ },
      ],
    },
    {
      key: 'active',
      label: 'Active subscriptions',
      value: int(m.book.active),
      change: { value: m.book.active, base: m.book30.active },
      comparisons: [
        { label: 'Monthly', value: int(m.book.activeByPlan.monthly) },
        { label: 'Annual', value: int(m.book.activeByPlan.annual) },
        { label: `On ${shortDate(addDays(m.from, -1))}`, value: int(m.book30.active) },
        { label: 'Net change in range', value: `${m.book.active - m.book30.active >= 0 ? '+' : ''}${int(m.book.active - m.book30.active)}` },
        { label: 'Started in range', value: int(m.s.units.monthly + m.s.units.annual) },
        { label: 'Cancelled in range', value: int(m.s.cancelledUnits) },
        { label: 'MRR per subscription', value: m.book.active ? $(m.book.mrr / m.book.active) : '–' },
      ],
      splits: [
        { title: 'By plan', parts: [{ key: 'monthly', label: 'Monthly', value: m.book.activeByPlan.monthly, color: PLANS[0].color }, { key: 'annual', label: 'Annual', value: m.book.activeByPlan.annual, color: PLANS[1].color }], format: int },
        ...(m.ios && m.android ? [{ title: 'By store', parts: [{ key: 'I', label: 'iOS', value: m.ios.active, color: C.ios }, { key: 'A', label: 'Android', value: m.android.active, color: C.android }], format: int }] : []),
      ],
      chart: { title: 'Active on each day', series: daily((i) => m.books[i].active), format: int },
      charts: [
        { title: 'Monthly subscriptions', series: daily((i) => m.books[i].activeByPlan.monthly), format: int, color: PLANS[0].color },
        { title: 'Annual subscriptions', series: daily((i) => m.books[i].activeByPlan.annual), format: int, color: PLANS[1].color },
      ],
    },
    // The same estimate over subscribers on either plan rides inside this card.
    ltvSpec('ltvMonthly', 'LTV, monthly', m.ltvMonthly, 'a monthly subscriber', [
      { label: 'LTV, monthly + yearly', value: mixed.value === null ? '–' : $(mixed.value) },
      ...(mixed.value !== null && cut ? [{ label: `Monthly + yearly, after the stores' ${cut}%`, value: $(mixed.value * (1 - cut / 100)) }] : []),
      { label: 'Monthly + yearly, pays per month', value: mixed.perMonth === null ? '–' : $(mixed.perMonth) },
      { label: 'Monthly + yearly, monthly churn', value: mixed.churnPct === null ? '–' : `${mixed.churnPct.toFixed(1)}%` },
      { label: 'Monthly + yearly, expected stay', value: mixed.months === null ? '–' : `${mixed.months.toFixed(1)} months` },
      { label: 'Monthly + yearly, collected so far, each (est.)', value: mixed.collected === null ? '–' : $(mixed.collected) },
      { label: 'Monthly + yearly, subscribers counted', value: int(mixed.units) },
      { label: 'Annual share of subscribers', value: mixed.units ? `${(((mixed.units - m.ltvMonthly.units) / mixed.units) * 100).toFixed(0)}%` : '–' },
    ]),
    {
      key: 'new',
      label: 'New revenue',
      value: $(m.s.totalBookings),
      change: ch(m.s.totalBookings, m.ps.totalBookings),
      note: 'First payments only: money that arrived from someone paying for the first time.',
      comparisons: [
        { label: 'Purchases', value: int(m.s.totalUnits) },
        ...(m.s.refunds ? [{ label: 'Refunded', value: int(m.s.refunds) }] : []),
        { label: 'Per purchase', value: m.s.totalUnits ? $(m.s.totalBookings / m.s.totalUnits) : '–' },
        { label: prevLabel, change: ch(m.s.totalBookings, m.ps.totalBookings), format: $ },
        { label: 'Per day', value: $(m.s.totalBookings / n) },
        { label: 'Best day', value: peak(perDay(m.fresh), $) },
        { label: `After the stores' ${cut}%`, value: $(m.s.totalBookings * (1 - cut / 100)) },
        { label: 'Share of everything collected', value: rev.total ? `${((rev.fresh / rev.total) * 100).toFixed(0)}%` : '–' },
      ],
      splits: [
        { title: 'By plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: m.s.bookings[p.key], color: p.color })), format: $ },
        ...storeSplit((r) => r.price * r.qty, $),
      ],
      charts: flowCharts(m.fresh, '#c98500', $),
    },
    {
      key: 'renew',
      label: 'Renewals (est.)',
      value: $(renTotal),
      change: ch(renTotal, renPrevTotal),
      note: 'Nothing reports renewals, so every subscription not marked cancelled is assumed to renew each term.',
      comparisons: [
        { label: 'Charges', value: int(m.ren.length) },
        { label: 'Next 30 days', value: $(m.upcoming.reduce((t, r) => t + r.amount, 0)) },
        { label: prevLabel, change: ch(renTotal, renPrevTotal), format: $ },
        { label: 'Per charge', value: m.ren.length ? $(renTotal / m.ren.length) : '–' },
        { label: 'Best day', value: peak(perDay(m.renew), $) },
        { label: 'Share of everything collected', value: rev.total ? `${((rev.renew / rev.total) * 100).toFixed(0)}%` : '–' },
        { label: 'Next 90 days', value: `${$(sum(within(90)))} · ${int(within(90).length)}` },
        { label: 'Next year', value: `${$(sum(within(365)))} · ${int(within(365).length)}` },
      ],
      splits: [{ title: 'By plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: rev.renewByPlan[p.key], color: p.color })), format: $ }],
      charts: [
        ...flowCharts(m.renew, '#199e70', $).slice(0, 2),
        { title: 'Coming up, next 30 days', series: Array.from({ length: 30 }, (_, i) => addDays(dk, i + 1)).map((d) => ({ day: d, value: sum(m.ahead.filter((x) => x.date === d)) })), format: $, color: '#5ac8fa' },
      ],
    },
    {
      key: 'churn',
      label: 'Churned MRR',
      value: $(m.s.churnedMrr),
      change: m.prevOK ? { value: m.s.churnedMrr, base: m.ps.churnedMrr } : null,
      note: 'Cancellations you marked on a purchase, plus churn entered from store reports.',
      comparisons: [
        { label: 'Cancellations', value: `${$(m.s.cancelledMrr)} · ${int(m.s.cancelledUnits)}` },
        { label: 'Entered from reports', value: $(m.s.unattachedMrr) },
        { label: `Of MRR on ${shortDate(addDays(m.from, -1))}`, value: churnStart ? `${((m.s.churnedMrr / churnStart) * 100).toFixed(1)}%` : '–' },
        { label: 'Added in the same range', value: $(netNew + m.s.churnedMrr) },
        { label: 'Worst day', value: peak(perDay(m.lost), $) },
        { label: 'A year of it', value: $(m.s.churnedMrr * 12) },
      ],
      splits: [
        {
          title: 'Where it was recorded',
          parts: [
            { key: 'cancelled', label: 'Cancellations', value: m.s.cancelledMrr, color: '#e66767' },
            { key: 'unattached', label: 'From store reports', value: m.s.unattachedMrr, color: '#c98500' },
          ],
          format: $,
        },
      ],
      charts: [
        { title: per, series: flow(m.lost), format: $, color: '#e66767', xLabel: xl },
        { title: 'Running total over the range', series: running(perDay(m.lost)), format: $, color: '#e66767' },
        { title: `MRR added, ${per.toLowerCase()}`, series: flow(m.added), format: $, color: '#199e70', xLabel: xl },
      ],
    },
    {
      key: 'purchases',
      label: 'Purchases',
      value: int(m.s.totalUnits),
      change: ch(m.s.totalUnits, m.ps.totalUnits),
      comparisons: [
        { label: prevLabel, change: ch(m.s.totalUnits, m.ps.totalUnits) },
        { label: 'Per day', value: avgFmt(m.s.totalUnits / n) },
        { label: 'Best day', value: peak(perDay(m.units), int) },
        { label: 'Days with a purchase', value: `${int(m.days.filter((d) => m.units.get(d)).length)} of ${int(n)}` },
        { label: 'Average price', value: m.s.totalUnits ? $(m.s.totalBookings / m.s.totalUnits) : '–' },
        { label: 'Annual share of subscriptions', value: m.s.annualUnitShare === null ? '–' : `${m.s.annualUnitShare.toFixed(0)}%` },
        ...(m.s.refunds ? [{ label: 'Refunded', value: int(m.s.refunds) }] : []),
      ],
      splits: [
        { title: 'By plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: m.s.units[p.key], color: p.color })), format: int },
        ...storeSplit((r) => r.qty, int),
      ],
      charts: [
        ...flowCharts(m.units, C.series, int, avgFmt),
        { title: 'Days from install to paying', series: buy.buckets.map((b) => ({ day: b.label, value: b.value })), format: int, color: '#199e70', xLabel: asIs, summary: buy.without ? `${int(buy.without)} with no install date` : '' },
      ],
    },
  ];

  const mrrRows = m.days.map((d, i) => ({ x: d, values: { monthly: m.books[i].byPlan.monthly, annual: m.books[i].byPlan.annual } }));
  const churnRows = m.buckets.map((b) => {
    let cancelled = 0;
    let unattached = 0;
    m.l.rows.forEach((r) => {
      if (r.cancelled && m.inBucket(r.cancelled, b) && !r.refunded) cancelled += mrrOf(r);
    });
    m.l.churn.forEach((c) => {
      if (m.inBucket(c.date, b)) unattached += c.mrr;
    });
    return { x: b, values: { cancelled, unattached } };
  });
  const cashRows = m.buckets.map((b) => ({
    x: b,
    values: {
      fresh: m.l.rows.filter((r) => m.inBucket(r.date, b)).reduce((t, r) => t + bookingsOf(r), 0),
      renew: m.ren.filter((r) => m.inBucket(r.date, b)).reduce((t, r) => t + r.amount, 0),
    },
  }));
  const unitRows = m.buckets.map((b) => {
    const v: Record<string, number> = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
    m.l.rows.forEach((r) => {
      if (!r.refunded && m.inBucket(r.date, b)) v[r.plan] += r.qty;
    });
    return { x: b, values: v };
  });
  const list = [...m.l.rows].filter((r) => r.date >= m.from && r.date <= dk).reverse();

  return (
    <>
      <MetricTiles specs={specs} />

      <Card>
        <StackedBars title="Monthly recurring revenue" keys={planKeys(['monthly', 'annual'])} rows={mrrRows} xLabel={dayDate} format={$} summary={$(m.book.mrr)} />
        <Text style={s.note}>The rate the book runs at on each day, stacked by plan and net of churn.</Text>
      </Card>

      <Card>
        <StackedBars
          title="Cash in"
          keys={[
            { key: 'fresh', label: 'New purchases', color: C.series },
            { key: 'renew', label: 'Renewals (est.)', color: '#5ac8fa' },
          ]}
          rows={cashRows}
          xLabel={xl}
          format={$}
          summary={$(m.s.totalBookings + renTotal)}
        />
        <Text style={s.note}>New money and estimated renewals, side by side and never folded together.</Text>
      </Card>

      <Card>
        <StackedBars
          title="Churn"
          keys={[
            { key: 'cancelled', label: 'Cancellations', color: '#e66767' },
            { key: 'unattached', label: 'From store reports', color: '#c98500' },
          ]}
          rows={churnRows}
          xLabel={xl}
          format={$}
          summary={`${$(m.s.churnedMrr)} of MRR`}
        />
      </Card>

      <DeepDiveGrid>
        <DeepDive icon="arrow.clockwise" title="Renewals" sub={`${$(sum(m.upcoming))} due in the next 30 days · ${int(m.upcoming.length)} ${m.upcoming.length === 1 ? 'charge' : 'charges'}`}>
          <Card>
            <View style={s.stats}>
              {([7, 30, 90, 365] as const).map((n) => (
                <View key={n} style={s.stat}>
                  <Text style={s.statLabel}>{n === 365 ? 'Next year' : `Next ${n} days`}</Text>
                  <Text style={[s.statValue, num]}>{$(sum(within(n)))}</Text>
                  <Text style={[s.statSub, num]}>{int(within(n).length)} due</Text>
                </View>
              ))}
            </View>
            <Text style={s.note}>Estimated: nothing reports a renewal, so each subscription not marked cancelled is assumed to renew on its own date.</Text>
          </Card>

          <Card>
            <BarChart
              title="Coming up, next 30 days"
              series={Array.from({ length: 30 }, (_, i) => addDays(dk, i + 1)).map((d) => ({ day: d, value: sum(m.ahead.filter((x) => x.date === d)) }))}
              summary={$(sum(m.upcoming))}
              format={$}
              color="#199e70"
            />
          </Card>

          <Card title="Renewal calendar">
            <RenewalCalendar from={dk} renewals={m.ahead} format={$} selected={due} onSelect={setDue} />
            <Text style={s.note}>Each day shows the dollars due on it. Tap one to see what is renewing.</Text>
          </Card>

          <Card>
            <BarChart
              title="By month, next 12 months"
              series={Array.from({ length: 12 }, (_, i) => addMonths(`${addDays(dk, 1).slice(0, 7)}-01`, i)).map((mo) => ({
                day: mo,
                value: sum(m.ahead.filter((x) => x.date.slice(0, 7) === mo.slice(0, 7))),
              }))}
              summary={$(sum(m.ahead))}
              format={$}
              color="#199e70"
              xLabel={(k) => `${shortDate(k).split(' ')[0]} ${k.slice(2, 4)}`}
            />
          </Card>

          <Card title="Upcoming renewals · next 30 days">
            {m.upcoming.length ? (
              m.upcoming.map((r, i) => (
                <View key={`${r.sale.id}-${r.date}`}>
                  {i ? <Divider /> : null}
                  <View style={s.row}>
                    <Dot color={PLANS.find((p) => p.key === r.plan)?.color || C.dim} />
                    <Text style={s.rowTitle}>{shortDate(r.date)}</Text>
                    <Text style={s.rowSub}>
                      {r.plan === 'annual' ? 'Annual' : 'Monthly'} · {r.sale.platform === 'ios' ? 'iOS' : 'Android'}
                    </Text>
                    <Text style={[s.rowValue, num]}>{$(r.amount)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Empty>Nothing due in the next 30 days.</Empty>
            )}
            <Text style={s.note}>Estimated: each live subscription renewing on its own date.</Text>
          </Card>

        </DeepDive>

        <DeepDive icon="cart" title="Purchases" sub={`${int(list.length)} in range · ${$(m.s.totalBookings)}`}>
          <Card>
            <StackedBars title="Purchases by plan" keys={planKeys(['monthly', 'annual', 'lifetime', 'unknown'])} rows={unitRows} xLabel={xl} summary={`${int(m.s.totalUnits)} purchases`} />
          </Card>

          <Card>
            <BarChart
              title="How long"
              series={buy.buckets.map((b) => ({ day: b.label, value: b.value }))}
              summary={`${int(buy.total - buy.without)} with an install date`}
              xLabel={(k) => k}
              color="#199e70"
            />
            <Text style={s.note}>
              Days between installing and paying.{buy.without ? ` ${int(buy.without)} of ${int(buy.total)} purchases carry no install date and are left out.` : ''}
            </Text>
          </Card>

          <Card title="Plan mix">
            <SplitBar parts={PLANS.map((p) => ({ key: p.key, label: p.label, value: m.s.units[p.key], color: p.color }))} format={int} />
            <Text style={s.subhead}>Live now</Text>
            <SplitBar
              parts={[
                { key: 'monthly', label: 'Monthly', value: m.book.activeByPlan.monthly, color: PLANS[0].color },
                { key: 'annual', label: 'Annual', value: m.book.activeByPlan.annual, color: PLANS[1].color },
              ]}
              format={int}
            />
          </Card>

          <Card title={`Every purchase in range · ${list.length}`}>
            {list.length ? (
              list.slice(0, 60).map((r, i) => (
                <View key={r.id}>
                  {i ? <Divider /> : null}
                  <Pressable onPress={() => setEditing(r)} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
                    <Dot color={r.platform === 'ios' ? C.ios : C.android} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>
                        {PLANS.find((p) => p.key === r.plan)?.label}
                        {r.qty > 1 ? ` ×${r.qty}` : ''}
                      </Text>
                      <Text style={s.rowSub}>
                        {[shortDate(r.date), r.cohort ? `installed ${shortDate(r.cohort)}` : null, r.cancelled ? `cancelled ${shortDate(r.cancelled)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    {r.refunded ? <Pill label="REFUNDED" color={C.down} /> : null}
                    <Text style={[s.rowValue, num]}>{$(r.price * r.qty)}</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Empty>No purchases in this range.</Empty>
            )}
          </Card>

          {/* Inside the card, so the editor can rise over it. */}
          <SaleEditor sale={editing} onClose={() => setEditing(null)} />
        </DeepDive>
      </DeepDiveGrid>
    </>
  );
}

const s = StyleSheet.create({
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  stat: { width: '50%' },
  statLabel: { color: C.dim, fontSize: 12 },
  statValue: { color: C.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginTop: 1 },
  statSub: { color: C.muted, fontSize: 12 },
  subhead: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '500' },
  rowSub: { color: C.muted, fontSize: 12, flexShrink: 1 },
  rowValue: { color: C.text, fontSize: 15, fontWeight: '600', marginLeft: 'auto' },
});
