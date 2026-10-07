/* What each metric card says, at rest and opened. Pure: a snapshot and a
 * date in, card specs out. At a glance cards are RANGE totals from the
 * store funnel, so they are compared against the previous range of the same
 * length, the per-day average and the best day, and broken down by store.
 * (App usage builds its own, in features/UsageView.tsx.)
 */
import type { MetricSpec, Change, Comparison } from '../components/MetricTiles';
import type { Part } from '../components/charts';
import type { Snapshot } from '../lib/data';
import { addDays, shortDate } from '../lib/dates';
import { int, money } from '../lib/format';
import type { Series } from '../lib/metrics';
import { buildBase, cumAt, dayRec, summarize, trialExit, type Field, type StoreBase, type StoreFilter, type Summary } from '../lib/store';
import { C } from '../theme';

const fmtPct = (v: number | null) => (v === null ? '–' : `${v.toFixed(1)}%`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

const COUNT_COLOR = C.series;

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

function best(sr: Series, fmt: (n: number) => string, upTo?: string | null): string {
  let top: { day: string; value: number } | null = null;
  sr.forEach((p) => {
    if (upTo && p.day > upTo) return;
    if (!top || p.value > top.value) top = p;
  });
  const t = top as { day: string; value: number } | null;
  return t && t.value > 0 ? `${fmt(t.value)} · ${shortDate(t.day)}` : '–';
}

export function glanceSpecs(snap: Snapshot | null, platform: StoreFilter, b: StoreBase, w: GlanceWindow): MetricSpec[] {
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
  const sales = field('sales');
  const revenue = field('revenue');
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
      chart: { title: 'Per day', series: downloads, format: int, color: COUNT_COLOR, unknownAfter },
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
      chart: { title: 'Crossing per day', series: series(w.from, w.to, (d) => dayRec(b, addDays(d, -T)).downloads), format: int, color: COUNT_COLOR, unknownAfter },
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
        { label: 'All-time revenue', value: $(s.totalRevenue) },
      ],
      splits: split('By store', (x) => x.sales, int),
      chart: { title: 'Per day', series: sales, format: int, color: '#199e70' },
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
      key: 'revenue',
      label: 'Revenue',
      value: $(s.revenue),
      change: ch(s.revenue, ps.revenue),
      comparisons: [
        { label: prevLabel, change: ch(s.revenue, ps.revenue) },
        { label: 'Per day', value: $(s.revenue / n) },
        { label: 'Best day', value: best(revenue, $) },
        { label: 'Per paying user, all time', value: s.arppu === null ? '–' : $(s.arppu) },
      ],
      splits: split('By store', (x) => x.revenue, $),
      chart: { title: 'Per day', series: revenue, format: $, color: '#c98500' },
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
      ],
      chart: { title: 'Per day', series: ratio('downloads', 'impressions'), format: fmtPct, color: COUNT_COLOR, unknownAfter },
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
      ],
      chart: { title: 'Per day', series: ratio('downloads', 'pageViews'), format: fmtPct, color: '#3987e5', unknownAfter },
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
      ],
      chart: { title: 'Per day', series: ratio('pageViews', 'impressions'), format: fmtPct, color: '#d95926', unknownAfter },
    },
  ];
}
