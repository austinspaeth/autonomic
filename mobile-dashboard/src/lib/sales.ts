/* The subscription ledger, and every number derived from it. A port of the
 * parts of landing/master/sales.js the phone shows, with its four rules:
 *
 *  ONE   Cash and recurring revenue are never the same number. `bookings` is
 *        money that arrived; `mrr` is the monthly rate the book runs at.
 *  TWO   A plan of unknown term is real money and is never counted in MRR.
 *  THREE A subscription runs until it is marked cancelled. Unattached churn
 *        (a store report's "you lost $20 of MRR") subtracts from the book from
 *        its date on, and the book is floored at zero.
 *  FOUR  Days-to-buy only counts rows that carry an install date.
 *
 * A ledger row is a FIRST payment. Renewals are never typed in; they are
 * derived (every live subscription is charged again each term) and always
 * called estimated.
 */
import { addDays } from './dates';
import type { Churn, Platform, Sale } from './types';

export type PlanKey = 'monthly' | 'annual' | 'lifetime' | 'unknown';
export const PLANS: { key: PlanKey; label: string; color: string; term: number | null }[] = [
  { key: 'monthly', label: 'Monthly', color: '#2563eb', term: 1 },
  { key: 'annual', label: 'Annual', color: '#199e70', term: 12 },
  { key: 'lifetime', label: 'Lifetime', color: '#c98500', term: 0 },
  { key: 'unknown', label: 'Unclassified', color: '#8a8a90', term: null },
];

export type SalesFilter = 'all' | Platform;

export const isRecurring = (plan: string) => plan === 'monthly' || plan === 'annual';
export const bookingsOf = (s: Sale) => (s.refunded ? 0 : s.price * s.qty);
export const termOf = (plan: string) => (plan === 'annual' ? 12 : 1);
export function mrrOf(s: Sale) {
  if (s.refunded || !isRecurring(s.plan)) return 0;
  return (s.price * s.qty) / termOf(s.plan);
}
export const isLiveOn = (s: Sale, day: string) => !s.refunded && s.date <= day && !(s.cancelled && s.cancelled <= day);

/** Calendar months later, clamped to the month's last day (Jan 31 + 1 = Feb 28). */
export function addMonths(day: string, n: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + n;
  const d = Number(day.slice(8, 10));
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yy, mm, Math.min(d, last))).toISOString().slice(0, 10);
}

export type Ledger = { rows: Sale[]; churn: Churn[]; platform: SalesFilter };

export function ledger(sales: Sale[] | undefined, churn: Churn[] | undefined, platform: SalesFilter = 'all'): Ledger {
  const keep = (p?: Platform) => platform === 'all' || p === platform;
  return {
    rows: [...(sales || [])].filter((s) => keep(s.platform)).sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date))),
    // Unattached churn with no store applies to the combined view only.
    churn: [...(churn || [])].filter((c) => (platform === 'all' ? true : c.platform === platform)),
    platform,
  };
}

/** The book on `day`: MRR by plan (net of churn, floored), active count by plan. */
export function bookOn(l: Ledger, day: string) {
  const byPlan: Record<PlanKey, number> = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
  const active: Record<PlanKey, number> = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
  let gross = 0;
  l.rows.forEach((r) => {
    if (!isLiveOn(r, day) || !isRecurring(r.plan)) return;
    const m = mrrOf(r);
    gross += m;
    byPlan[r.plan as PlanKey] += m;
    active[r.plan as PlanKey] += r.qty;
  });
  let churned = 0;
  let churnedUnits = 0;
  let spill = 0;
  l.churn.forEach((c) => {
    if (c.date > day) return;
    churned += c.mrr;
    churnedUnits += c.units || 0;
    const plan = (c.plan === 'monthly' || c.plan === 'annual' ? c.plan : 'monthly') as PlanKey;
    const take = Math.min(c.mrr, byPlan[plan]);
    byPlan[plan] -= take;
    spill += c.mrr - take;
  });
  (['monthly', 'annual'] as PlanKey[]).forEach((k) => {
    const take = Math.min(spill, byPlan[k]);
    byPlan[k] -= take;
    spill -= take;
  });
  const mrr = Math.max(0, gross - churned);
  return {
    gross,
    mrr,
    arr: mrr * 12,
    byPlan,
    active: Math.max(0, active.monthly + active.annual - churnedUnits),
    activeByPlan: active,
    churnFloored: churned > gross + 1e-9,
  };
}

/** MRR on each day, by plan, for a chart. */
export function mrrSeries(l: Ledger, days: string[]) {
  return days.map((d) => ({ x: d, ...bookOn(l, d) }));
}

/** Summary of a window [from, to]: first-payment bookings, units, churn. */
export function summarize(l: Ledger, from: string, to: string) {
  const units: Record<PlanKey, number> = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
  const bookings: Record<PlanKey, number> = { monthly: 0, annual: 0, lifetime: 0, unknown: 0 };
  let refunds = 0;
  l.rows.forEach((r) => {
    if (r.date < from || r.date > to) return;
    if (r.refunded) {
      refunds += r.qty;
      return;
    }
    units[r.plan as PlanKey] += r.qty;
    bookings[r.plan as PlanKey] += r.price * r.qty;
  });
  let cancelledMrr = 0;
  let cancelledUnits = 0;
  l.rows.forEach((r) => {
    if (r.cancelled && r.cancelled >= from && r.cancelled <= to && !r.refunded) {
      cancelledMrr += mrrOf(r);
      cancelledUnits += r.qty;
    }
  });
  let unattachedMrr = 0;
  l.churn.forEach((c) => {
    if (c.date >= from && c.date <= to) unattachedMrr += c.mrr;
  });
  const recurringUnits = units.monthly + units.annual;
  return {
    units,
    bookings,
    totalUnits: units.monthly + units.annual + units.lifetime + units.unknown,
    totalBookings: bookings.monthly + bookings.annual + bookings.lifetime + bookings.unknown,
    refunds,
    cancelledMrr,
    cancelledUnits,
    unattachedMrr,
    churnedMrr: cancelledMrr + unattachedMrr,
    annualUnitShare: recurringUnits ? (units.annual / recurringUnits) * 100 : null,
  };
}

export type Renewal = { date: string; plan: PlanKey; amount: number; sale: Sale };

/** Every renewal charge the ledger implies in [from, to] (estimated: nothing reports them). */
export function renewals(l: Ledger, from: string, to: string): Renewal[] {
  const out: Renewal[] = [];
  l.rows.forEach((r) => {
    if (r.refunded || !isRecurring(r.plan)) return;
    const term = termOf(r.plan);
    for (let k = 1; k < 600; k += 1) {
      const d = addMonths(r.date, term * k);
      if (d > to) break;
      if (r.cancelled && d >= r.cancelled) break;
      if (d >= from) out.push({ date: d, plan: r.plan as PlanKey, amount: r.price * r.qty, sale: r });
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Install -> purchase, in days, for rows that carry an install date (rule FOUR). */
export function daysToBuy(l: Ledger, from: string, to: string) {
  const buckets = [
    { label: 'D0', lo: 0, hi: 0 },
    { label: 'D1–3', lo: 1, hi: 3 },
    { label: 'D4–7', lo: 4, hi: 7 },
    { label: 'D8–14', lo: 8, hi: 14 },
    { label: 'D15', lo: 15, hi: 15 },
    { label: 'D16–30', lo: 16, hi: 30 },
    { label: 'D31+', lo: 31, hi: Infinity },
  ];
  const counts = buckets.map(() => 0);
  let without = 0;
  let total = 0;
  l.rows.forEach((r) => {
    if (r.date < from || r.date > to || r.refunded) return;
    total += r.qty;
    if (!r.cohort) {
      without += r.qty;
      return;
    }
    const age = Math.round((Date.parse(r.date) - Date.parse(r.cohort)) / 864e5);
    const i = buckets.findIndex((b) => age >= b.lo && age <= b.hi);
    if (i >= 0) counts[i] += r.qty;
  });
  return { buckets: buckets.map((b, i) => ({ label: b.label, value: counts[i] })), without, total };
}

/**
 * The forecast's defaults, from the last 180 days of the ledger: what each plan
 * actually sold for, the share who chose annual, and the churn actually seen
 * as a monthly rate struck against the MEAN daily book (an opening-day book is
 * zero for any young account and reports nonsense). Null where nothing was seen.
 */
export function forecastBasis(l: Ledger, from: string, to: string) {
  const s = summarize(l, from, to);
  let atRisk = 0;
  let covered = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    atRisk += bookOn(l, d).mrr;
    covered += 1;
  }
  const meanBook = covered ? atRisk / covered : 0;
  const churnPct = meanBook > 0 && s.churnedMrr > 0 ? Math.min(100, (s.churnedMrr / meanBook) * (30 / covered) * 100) : null;
  return {
    monthlyPrice: s.units.monthly ? s.bookings.monthly / s.units.monthly : null,
    annualPrice: s.units.annual ? s.bookings.annual / s.units.annual : null,
    annualShare: s.annualUnitShare,
    churnPct,
    cancelledMrr: s.cancelledMrr,
    unattachedMrr: s.unattachedMrr,
    units: s.units.monthly + s.units.annual,
  };
}
