/* Pure derivations over a Snapshot. No React, no fetches.
 *
 * Two money rules carried over from landing/master/sales.js: bookings (cash
 * that arrived) and MRR (the rate the book runs at) are never the same number,
 * and a plan with no known term contributes nothing to MRR. A subscription is
 * live until it is marked cancelled; unattached churn rows subtract from the
 * book from their date forward, floored at zero. */
import { addDays, dayRange } from './dates';
import type { Fault, PingKind, PingPlatform, PingReport, PingRow, Sale } from './types';
import type { Snapshot } from './data';

export type Series = { day: string; value: number }[];

export function pingRows(report: PingReport | null | undefined, kind: PingKind): Map<string, PingRow> {
  const map = new Map<string, PingRow>();
  (report?.[kind] || []).forEach((r) => map.set(r.day, r));
  return map;
}

/** The first day this route has any row at all: before it, a day is UNKNOWN, not zero. */
export function firstDay(report: PingReport | null | undefined, kind: PingKind): string | null {
  const rows = report?.[kind] || [];
  let min: string | null = null;
  rows.forEach((r) => {
    if (!min || r.day < min) min = r.day;
  });
  return min;
}

export function pingTotal(report: PingReport | null | undefined, kind: PingKind, day: string): number {
  return pingRows(report, kind).get(day)?.total ?? 0;
}

export function pingSeries(report: PingReport | null | undefined, kind: PingKind, days: string[]): Series {
  const rows = pingRows(report, kind);
  return days.map((day) => ({ day, value: rows.get(day)?.total ?? 0 }));
}

/** Installs that opened for the first time on `day` (cohort == arrival day). */
export function newInstallSeries(report: PingReport | null | undefined, days: string[]): Series {
  const rows = pingRows(report, 'open');
  return days.map((day) => ({
    day,
    value: (rows.get(day)?.cohorts || []).reduce((t, c) => (c.cohort === day ? t + c.count : t), 0),
  }));
}

export function platformSplit(
  report: PingReport | null | undefined,
  kind: PingKind,
  days: string[],
): Record<PingPlatform, number> {
  const rows = pingRows(report, kind);
  const out: Record<PingPlatform, number> = { I: 0, A: 0, U: 0 };
  days.forEach((d) => (rows.get(d)?.cohorts || []).forEach((c) => (out[c.platform] = (out[c.platform] || 0) + c.count)));
  return out;
}

export function slotSplit(report: PingReport | null | undefined, kind: PingKind, days: string[]): Record<string, number> {
  const rows = pingRows(report, kind);
  const out: Record<string, number> = {};
  days.forEach((d) =>
    (rows.get(d)?.cohorts || []).forEach((c) => {
      const k = c.slot || '?';
      out[k] = (out[k] || 0) + c.count;
    }),
  );
  return out;
}

export function tierSplit(report: PingReport | null | undefined, kind: PingKind, days: string[]): Record<string, number> {
  const rows = pingRows(report, kind);
  const out: Record<string, number> = {};
  days.forEach((d) =>
    (rows.get(d)?.cohorts || []).forEach((c) => {
      const k = c.tier || '?';
      out[k] = (out[k] || 0) + c.count;
    }),
  );
  return out;
}

export function mean(series: Series): number {
  return series.length ? series.reduce((t, p) => t + p.value, 0) / series.length : 0;
}

export function sum(series: Series): number {
  return series.reduce((t, p) => t + p.value, 0);
}

/* ------------------------------------------------------------- money */

const bookingsOf = (s: Sale) => (s.refunded ? 0 : s.price * s.qty);

function mrrOf(s: Sale): number {
  if (s.refunded) return 0;
  if (s.plan === 'monthly') return s.price * s.qty;
  if (s.plan === 'annual') return (s.price * s.qty) / 12;
  return 0;
}

const isLiveOn = (s: Sale, day: string) =>
  !s.refunded && s.date <= day && !(s.cancelled && s.cancelled <= day);

export function mrrOn(snap: Snapshot | null, day: string): { mrr: number; active: number } {
  const sales = snap?.load?.sales || [];
  const churn = snap?.load?.churn || [];
  let gross = 0;
  let active = 0;
  sales.forEach((s) => {
    if (!isLiveOn(s, day) || (s.plan !== 'monthly' && s.plan !== 'annual')) return;
    gross += mrrOf(s);
    active += s.qty;
  });
  let churned = 0;
  let churnedUnits = 0;
  churn.forEach((c) => {
    if (c.date <= day) {
      churned += c.mrr;
      churnedUnits += c.units || 0;
    }
  });
  return { mrr: Math.max(0, gross - churned), active: Math.max(0, active - churnedUnits) };
}

export function bookingsSeries(snap: Snapshot | null, days: string[]): Series {
  const by = new Map<string, number>();
  (snap?.load?.sales || []).forEach((s) => by.set(s.date, (by.get(s.date) || 0) + bookingsOf(s)));
  return days.map((day) => ({ day, value: by.get(day) || 0 }));
}

export function salesCountSeries(snap: Snapshot | null, days: string[]): Series {
  const by = new Map<string, number>();
  (snap?.load?.sales || []).forEach((s) => {
    if (!s.refunded) by.set(s.date, (by.get(s.date) || 0) + s.qty);
  });
  return days.map((day) => ({ day, value: by.get(day) || 0 }));
}

export function mrrSeries(snap: Snapshot | null, days: string[]): Series {
  return days.map((day) => ({ day, value: mrrOn(snap, day).mrr }));
}

export function recentSales(snap: Snapshot | null, n = 5): Sale[] {
  return [...(snap?.load?.sales || [])]
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
    .slice(0, n);
}

/** Spend in a window: one-off costs on their date, recurring ones on each occurrence. */
export function costsBetween(snap: Snapshot | null, from: string, to: string): number {
  let total = 0;
  const step: Record<string, number> = { weekly: 7, monthly: 0, quarterly: 0, yearly: 0 };
  const months: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
  (snap?.load?.costs || []).forEach((c) => {
    if (!c.recurrence) {
      if (c.date >= from && c.date <= to) total += c.amount;
      return;
    }
    let d = c.date;
    let i = 0;
    const stop = c.until && c.until < to ? c.until : to;
    while (d <= stop && i < 2000) {
      if (d >= from) total += c.amount;
      i += 1;
      if (step[c.recurrence]) d = addDays(c.date, step[c.recurrence] * i);
      else {
        const base = new Date(`${c.date}T12:00:00Z`);
        base.setUTCMonth(base.getUTCMonth() + months[c.recurrence] * i);
        d = base.toISOString().slice(0, 10);
      }
    }
  });
  return total;
}

/* ------------------------------------------------------------- store */

export function downloadsSeries(snap: Snapshot | null, days: string[]): Series {
  const by = new Map<string, number>();
  (snap?.load?.entries || []).forEach((e) => by.set(e.date, (by.get(e.date) || 0) + (e.downloads || 0)));
  return days.map((day) => ({ day, value: by.get(day) || 0 }));
}

/** The last day any store entry has been recorded (store reports lag). */
export function lastEntryDay(snap: Snapshot | null): string | null {
  const entries = snap?.load?.entries || [];
  return entries.length ? entries[entries.length - 1].date : null;
}

/* ------------------------------------------------------------ faults */

export type FaultGroup = {
  tag: string;
  msg: string;
  fatal: boolean;
  installs: number;
  occurrences: number;
  lastDay: string;
};

/** Faults over a window, grouped by tag+message, ranked by breadth (install-days). */
export function faultGroups(report: PingReport | null | undefined, days: string[]): FaultGroup[] {
  const want = new Set(days);
  const by = new Map<string, FaultGroup>();
  (report?.faults || []).forEach((f: Fault) => {
    if (!want.has(f.day)) return;
    const k = `${f.tag}|${f.msg}`;
    const g = by.get(k) || { tag: f.tag, msg: f.msg, fatal: f.fatal, installs: 0, occurrences: 0, lastDay: f.day };
    g.installs += f.installs;
    g.occurrences += f.occurrences;
    g.fatal = g.fatal || f.fatal;
    if (f.day > g.lastDay) g.lastDay = f.day;
    by.set(k, g);
  });
  return [...by.values()].sort((a, b) => b.installs - a.installs || b.occurrences - a.occurrences);
}

export function windowDays(end: string, n: number) {
  return dayRange(end, n);
}

/* ------------------------------------------------------------ labels */

export const SENSOR: Record<string, string> = { W: 'Apple Watch', B: 'Strap', F: 'Camera', G: 'Garmin', '?': 'Unknown' };
export const TIER: Record<string, string> = { F: 'Free', T: 'Trial', P: 'Pro', '?': 'Unknown' };
export const PLAN: Record<string, string> = { Y: 'Yearly', M: 'Monthly', P: 'Promo year', F: 'Founder', '?': 'Unknown' };
export const WALL: Record<string, string> = {
  R: 'Progress range', I: 'Insights', P: 'POTS', B: 'Pacing', O: 'Outlook AI', M: 'Metric AI', N: 'AI report',
  S: 'Settings upgrade', '?': 'Unknown',
};

