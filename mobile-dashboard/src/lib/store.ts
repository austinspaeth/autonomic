/* The store funnel, as the web Overview computes it (landing/master/app.js:
 * base / buildBuckets / summarize / weekdayStats). Pure; both stores combined
 * unless a platform filter narrows it to one.
 *
 * Downloads, impressions and page views come from the imported store
 * entries; sales and revenue come from the sales LEDGER (a unit count and
 * gross bookings at the customer-facing price, refunds excluded), never from
 * an entry. Trial maths: the trial limit is inclusive, so a cohort leaves the
 * trial on the day AFTER it (`trialExit = trialDays + 1`). */
import { addDays } from './dates';
import type { Snapshot } from './data';
import type { Platform } from './types';

export type DayRec = { downloads: number; impressions: number; pageViews: number; sales: number; revenue: number };
export type Field = keyof DayRec;

const blank = (): DayRec => ({ downloads: 0, impressions: 0, pageViews: 0, sales: 0, revenue: 0 });

export type StoreBase = {
  byDay: Map<string, DayRec>;
  /** Sorted day keys with any record, for the cumulative lookups. */
  days: string[];
  /** Running totals after each day in `days`. */
  cum: DayRec[];
  min: string | null;
  /** The last day a store REPORT covers (entries only, not sales). Days after
   *  it are not yet reported, which is not the same as zero. */
  lastReported: string | null;
  trialDays: number;
};

export type StoreFilter = 'all' | Platform;

/** `platform` narrows every number to one store; 'all' is both combined. */
export function buildBase(snap: Snapshot | null, platform: StoreFilter = 'all'): StoreBase {
  const keep = (p: Platform) => platform === 'all' || p === platform;
  const byDay = new Map<string, DayRec>();
  const rec = (d: string) => {
    let r = byDay.get(d);
    if (!r) byDay.set(d, (r = blank()));
    return r;
  };
  let lastReported: string | null = null;
  (snap?.load?.entries || []).forEach((e) => {
    if (!keep(e.platform)) return;
    if (!lastReported || e.date > lastReported) lastReported = e.date;
    const r = rec(e.date);
    r.downloads += e.downloads || 0;
    r.impressions += e.impressions || 0;
    r.pageViews += e.pageViews || 0;
  });
  (snap?.load?.sales || []).forEach((s) => {
    if (!keep(s.platform)) return;
    const r = rec(s.date);
    if (!s.refunded) {
      r.sales += s.qty;
      r.revenue += s.price * s.qty;
    }
  });
  const days = [...byDay.keys()].sort();
  const cum: DayRec[] = [];
  const run = blank();
  days.forEach((d) => {
    const r = byDay.get(d)!;
    (Object.keys(run) as Field[]).forEach((k) => (run[k] += r[k]));
    cum.push({ ...run });
  });
  return {
    byDay,
    days,
    cum,
    min: days[0] ?? null,
    lastReported,
    trialDays: Math.max(1, Number(snap?.load?.settings?.trialDays) || 14),
  };
}

export const dayRec = (b: StoreBase, d: string): DayRec => b.byDay.get(d) || blank();

/** All-time running total of `field` through day `d` (0 before the data). */
export function cumAt(b: StoreBase, d: string, field: Field): number {
  // Binary search for the last recorded day <= d.
  let lo = 0;
  let hi = b.days.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (b.days[mid] <= d) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return at < 0 ? 0 : b.cum[at][field];
}

export const trialExit = (b: StoreBase) => b.trialDays + 1;

export type Summary = DayRec & {
  totalInstalls: number;
  totalSales: number;
  totalRevenue: number;
  outOfTrial: number;
  inTrial: number;
  convOfOutOfTrial: number | null;
  storeConv: number | null;
  ppvConv: number | null;
  tapThrough: number | null;
  arppu: number | null;
};

/** Totals over [from, to], plus all-time state at `to`. */
export function summarize(b: StoreBase, from: string, to: string): Summary {
  const s = blank();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = dayRec(b, d);
    (Object.keys(s) as Field[]).forEach((k) => (s[k] += r[k]));
  }
  const totalInstalls = cumAt(b, to, 'downloads');
  const totalSales = cumAt(b, to, 'sales');
  const totalRevenue = cumAt(b, to, 'revenue');
  const outOfTrial = cumAt(b, addDays(to, -trialExit(b)), 'downloads');
  return {
    ...s,
    totalInstalls,
    totalSales,
    totalRevenue,
    outOfTrial,
    inTrial: totalInstalls - outOfTrial,
    convOfOutOfTrial: outOfTrial ? (totalSales / outOfTrial) * 100 : null,
    storeConv: s.impressions ? (s.downloads / s.impressions) * 100 : null,
    ppvConv: s.pageViews ? (s.downloads / s.pageViews) * 100 : null,
    tapThrough: s.impressions ? (s.pageViews / s.impressions) * 100 : null,
    arppu: totalSales ? totalRevenue / totalSales : null,
  };
}

/** Week starts on Monday, as the web dashboard's do. */
export function weekStart(d: string): string {
  const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(d, -wd);
}

export type Bucket = { key: string; start: string; end: string; downloads: number; cumDownloads: number };

/** Downloads per bucket (day or week) over [from, to], with the all-time running total at each bucket's end. */
export function downloadBuckets(b: StoreBase, from: string, to: string, grain: 'day' | 'week'): Bucket[] {
  const out: Bucket[] = [];
  let cur: Bucket | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = grain === 'week' ? weekStart(d) : d;
    if (!cur || cur.key !== k) {
      cur = { key: k, start: d, end: d, downloads: 0, cumDownloads: 0 };
      out.push(cur);
    }
    cur.end = d;
    cur.downloads += dayRec(b, d).downloads;
  }
  out.forEach((x) => (x.cumDownloads = cumAt(b, x.end, 'downloads')));
  return out;
}

export type WeekdayStat = { avg: number | null; count: number; last: number | null; lastDate: string | null };

/** Monday-first: the average per weekday over [from, to], and its most recent occurrence. */
export function weekdayStats(b: StoreBase, from: string, to: string, field: Field): WeekdayStat[] {
  const acc = Array.from({ length: 7 }, () => ({ sum: 0, count: 0, last: null as number | null, lastDate: null as string | null }));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = acc[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
    const v = dayRec(b, d)[field];
    w.sum += v;
    w.count += 1;
    w.last = v; // days ascend, so this ends on the latest one
    w.lastDate = d;
  }
  return acc.map((w) => ({ avg: w.count ? w.sum / w.count : null, count: w.count, last: w.last, lastDate: w.lastDate }));
}
