/* Sales: the subscription ledger, read the way the web dashboard's Sales view
 * reads it (lib/sales.ts keeps its rules: cash and MRR are never one number,
 * an unknown term never counts toward MRR, a subscription runs until marked
 * cancelled, renewals are always "estimated").
 *
 * The range and store filter come from the floating filter bar; the range
 * ends on the selected date. Tap a purchase to edit or delete it.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BarChart, SplitBar } from '../components/charts';
import { MetricTiles, type Change, type MetricSpec } from '../components/MetricTiles';
import { StackedBars, type Key } from '../components/series';
import { Card, Divider, Dot, Empty, Pill } from '../components/ui';
import { useData } from '../lib/data';
import { addDays, shortDate } from '../lib/dates';
import { int, money } from '../lib/format';
import { bookOn, bookingsOf, daysToBuy, ledger, mrrOf, PLANS, renewals, summarize, type PlanKey, type Renewal, type SalesFilter } from '../lib/sales';
import type { Sale } from '../lib/types';
import { rangeDays } from '../lib/usage';
import { C, num } from '../theme';
import { SaleEditor } from './AddSheet';

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
    const upcoming = renewals(l, addDays(dk, 1), addDays(dk, 30));
    // Already charged: the 30 days ending on the selected date, newest first.
    const recent = renewals(l, addDays(dk, -29), dk).reverse();
    const ios = platform === 'all' ? bookOn(ledger(snap?.load?.sales, [], 'ios'), dk) : null;
    const android = platform === 'all' ? bookOn(ledger(snap?.load?.sales, [], 'android'), dk) : null;
    // Days for short ranges, months for long ones, so the bars stay readable.
    const monthly = days.length > 120;
    const buckets = monthly
      ? [...new Set(days.map((d) => `${d.slice(0, 7)}-01`))]
      : days;
    const inBucket = (d: string, b: string) => (monthly ? d.slice(0, 7) === b.slice(0, 7) : d === b);
    return { l, from, days, prevOK, book, book30, s, ps, ren, renPrev, upcoming, recent, ios, android, buckets, inBucket, monthly };
  }, [snap, dk, range, platform]);

  const ch = (a: number, b: number): Change => (m.prevOK ? { value: a, base: b } : null);
  const renTotal = m.ren.reduce((t, r) => t + r.amount, 0);
  const renPrevTotal = m.renPrev.reduce((t, r) => t + r.amount, 0);

  const specs: MetricSpec[] = [
    {
      key: 'mrr',
      label: 'MRR',
      value: $(m.book.mrr),
      change: { value: m.book.mrr, base: m.book30.mrr },
      note: 'The rate the book runs at: an annual plan counts as a twelfth of its price. Net of churn.',
      comparisons: [
        { label: `vs ${shortDate(addDays(m.from, -1))}`, change: { value: m.book.mrr, base: m.book30.mrr } },
        { label: 'ARR', value: $(m.book.arr) },
        { label: 'Monthly plans', value: $(m.book.byPlan.monthly) },
        { label: 'Annual plans', value: $(m.book.byPlan.annual) },
      ],
      splits: m.ios && m.android ? [{ title: 'By store', parts: [{ key: 'I', label: 'iOS', value: m.ios.mrr, color: C.ios }, { key: 'A', label: 'Android', value: m.android.mrr, color: C.android }], format: $ }] : undefined,
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
      ],
    },
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
      ],
      splits: [{ title: 'By plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: m.s.bookings[p.key], color: p.color })), format: $ }],
    },
    {
      key: 'renew',
      label: 'Renewals (est.)',
      value: $(renTotal),
      change: ch(renTotal, renPrevTotal),
      note: 'Nothing reports renewals, so every subscription not marked cancelled is assumed to renew each term.',
      comparisons: [
        { label: 'Charges', value: int(m.ren.length) },
        { label: 'Last 30 days', value: $(m.recent.reduce((t, r) => t + r.amount, 0)) },
        { label: 'Next 30 days', value: $(m.upcoming.reduce((t, r) => t + r.amount, 0)) },
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
      ],
    },
    {
      key: 'purchases',
      label: 'Purchases',
      value: int(m.s.totalUnits),
      change: ch(m.s.totalUnits, m.ps.totalUnits),
      splits: [{ title: 'By plan', parts: PLANS.map((p) => ({ key: p.key, label: p.label, value: m.s.units[p.key], color: p.color })), format: int }],
    },
  ];

  const mrrRows = m.days.map((d) => {
    const b = bookOn(m.l, d);
    return { x: d, values: { monthly: b.byPlan.monthly, annual: b.byPlan.annual } };
  });
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
  const xl = (x: string) => (m.monthly ? `${shortDate(x).split(' ')[0]} ${x.slice(2, 4)}` : shortDate(x));
  const buy = daysToBuy(m.l, m.from, dk);
  const list = [...m.l.rows].filter((r) => r.date >= m.from && r.date <= dk).reverse();

  return (
    <>
      <MetricTiles specs={specs} />

      <Card>
        <StackedBars title="Monthly recurring revenue" keys={planKeys(['monthly', 'annual'])} rows={mrrRows} xLabel={shortDate} format={$} summary={$(m.book.mrr)} />
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
        <StackedBars title="Purchases by plan" keys={planKeys(['monthly', 'annual', 'lifetime', 'unknown'])} rows={unitRows} xLabel={xl} summary={`${int(m.s.totalUnits)} purchases`} />
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

      <Card title="Renewals">
        <Text style={s.subhead}>
          Upcoming · next 30 days{m.upcoming.length ? ` · ${int(m.upcoming.length)} · ${$(m.upcoming.reduce((t, r) => t + r.amount, 0))}` : ''}
        </Text>
        <RenewalList list={m.upcoming} format={$} empty="Nothing due in the next 30 days." />
        <Text style={s.subhead}>
          Renewed · {shortDate(addDays(dk, -29))} – {shortDate(dk)}
          {m.recent.length ? ` · ${int(m.recent.length)} · ${$(m.recent.reduce((t, r) => t + r.amount, 0))}` : ''}
        </Text>
        <RenewalList list={m.recent} format={$} empty="Nothing renewed in these 30 days." />
        <Text style={s.note}>
          Estimated: each subscription not marked cancelled renewing on its own date. Pick an earlier day in the calendar to see older renewals.
        </Text>
      </Card>

      <Card>
        <BarChart
          title="How long people take to buy"
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

      <SaleEditor sale={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** One line per renewal charge: plan dot, date, plan · store, amount. */
function RenewalList({ list, format, empty }: { list: Renewal[]; format: (n: number) => string; empty: string }) {
  const [all, setAll] = useState(false);
  if (!list.length) return <Empty>{empty}</Empty>;
  const shown = all ? list : list.slice(0, RENEWALS_SHOWN);
  return (
    <View>
      {shown.map((r, i) => (
        <View key={`${r.sale.id}-${r.date}`}>
          {i ? <Divider /> : null}
          <View style={s.row}>
            <Dot color={PLANS.find((p) => p.key === r.plan)?.color || C.dim} />
            <Text style={s.rowTitle}>{shortDate(r.date)}</Text>
            <Text style={s.rowSub}>
              {r.plan === 'annual' ? 'Annual' : 'Monthly'} · {r.sale.platform === 'ios' ? 'iOS' : 'Android'}
            </Text>
            <Text style={[s.rowValue, num]}>{format(r.amount)}</Text>
          </View>
        </View>
      ))}
      {list.length > RENEWALS_SHOWN ? (
        <Pressable hitSlop={8} onPress={() => setAll((a) => !a)} style={({ pressed }) => [s.more, pressed && { opacity: 0.6 }]}>
          <Text style={s.moreText}>{all ? 'Show fewer' : `Show all ${int(list.length)}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const RENEWALS_SHOWN = 10;

const s = StyleSheet.create({
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  subhead: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '500' },
  rowSub: { color: C.muted, fontSize: 12, flexShrink: 1 },
  rowValue: { color: C.text, fontSize: 15, fontWeight: '600', marginLeft: 'auto' },
  more: { paddingVertical: 8, alignItems: 'center' },
  moreText: { color: C.series, fontSize: 13, fontWeight: '700' },
});
