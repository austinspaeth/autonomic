/* The forecast: a port of the web dashboard's "mix" model (app.js fcActuals /
 * fcRun / fcScenarios). Pure.
 *
 * Every assumption starts at the value read off this account's own data, with
 * installs held FLAT: that is "current pace", what happens if nothing changes.
 * The model runs day by day:
 *  - new installs per day, compounding monthly growth;
 *  - the cohort that installed `trialExit` days earlier reaches the wall and a
 *    share converts, split monthly / annual;
 *  - EVERY subscription (the live book from the ledger, then each new one) is a
 *    cohort charged again on its real renewal date, and churn is taken at the
 *    renewal, when a store subscription actually ends;
 *  - cash = new purchases + renewals; MRR = the book's monthly rate.
 * Bear / optimistic swing conversion by the full spread, installs by a third
 * of it and growth by an eighth (it compounds). Price and mix are decisions,
 * not outcomes, and never swing.
 */
import { addDays } from './dates';
import { addMonths, bookOn, forecastBasis, isLiveOn, isRecurring, type Ledger } from './sales';
import { cumAt, summarize as storeSummary, trialExit, type StoreBase } from './store';

export const DPM = 30.4375;
const WINDOW = 28;

export type Actuals = {
  installs: number;
  growth: number;
  conv: number;
  monthlyPrice: number;
  annualPrice: number;
  annualShare: number;
  churn: number | null;
  churnSource: 'cancellations' | 'entered' | 'both' | null;
  hasPlans: boolean;
  book: { plan: string; n: number; price: number; origin: string; stop: string | null }[];
  startMrr: number;
  end: string;
};

export type Levers = {
  installs: number;
  growth: number;
  conv: number;
  monthlyPrice: number;
  annualPrice: number;
  annualShare: number;
  churn: number;
  /** null = twelve months of the monthly churn. */
  annualRenew: number | null;
  spread: number;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

export function actuals(b: StoreBase, l: Ledger, end: string): Actuals {
  const start = b.min ?? end;
  const covered = Math.max(1, Math.min(WINDOW, daysBetween(start, end) + 1));
  const priorCovered = Math.max(0, Math.min(WINDOW, daysBetween(start, addDays(end, -WINDOW)) + 1));
  const recent = storeSummary(b, addDays(end, -(WINDOW - 1)), end);
  const prior = storeSummary(b, addDays(end, -(2 * WINDOW - 1)), addDays(end, -WINDOW));
  const all = storeSummary(b, start, end);
  let growth = 0;
  if (priorCovered >= 7 && prior.downloads > 0 && recent.downloads > 0) {
    growth = Math.pow(recent.downloads / covered / (prior.downloads / priorCovered), DPM / WINDOW) - 1;
    growth = Math.max(-0.5, Math.min(1, growth));
  }
  const six = forecastBasis(l, addDays(end, -179), end);
  const live = bookOn(l, end);
  const survival = live.gross > 0 ? live.mrr / live.gross : 1;
  return {
    installs: recent.downloads / covered,
    growth: growth * 100,
    conv: all.totalSales && all.convOfOutOfTrial ? all.convOfOutOfTrial : 3,
    monthlyPrice: six.monthlyPrice ?? 4.99,
    annualPrice: six.annualPrice ?? 39.99,
    annualShare: six.annualShare ?? 25,
    churn: six.churnPct,
    churnSource: six.churnPct === null ? null : six.unattachedMrr && !six.cancelledMrr ? 'entered' : six.unattachedMrr ? 'both' : 'cancellations',
    hasPlans: six.units > 0,
    book: l.rows
      .filter((r) => isRecurring(r.plan) && isLiveOn(r, end))
      .map((r) => ({ plan: r.plan, n: r.qty * survival, price: r.price, origin: r.date, stop: r.cancelled || null })),
    startMrr: live.mrr,
    end,
  };
}

/** Current pace: every lever at its measured value, growth held flat, churn 5% if unmeasured. */
export function paceLevers(a: Actuals): Levers {
  return {
    installs: a.installs,
    growth: 0,
    conv: a.conv,
    monthlyPrice: a.monthlyPrice,
    annualPrice: a.annualPrice,
    annualShare: a.annualShare,
    churn: a.churn ?? 5,
    annualRenew: null,
    spread: 35,
  };
}

export type Month = {
  key: string;
  days: number;
  installs: number;
  conv: number;
  bookings: number;
  freshCash: number;
  renewCash: number;
  mrr: number;
  payers: number;
  monthlyPayers: number;
  annualPayers: number;
  cumBookings: number;
};

export type Run = {
  months: Month[];
  endMrr: number;
  endPayers: number;
  totalBookings: number;
  totalInstalls: number;
  totalConv: number;
  bookingsNext30: number;
  plateauMrr: number | null;
};

type Cohort = { plan: string; n: number; price: number; origin: string; stop: string | null; k: number };

function run(o: {
  days: number;
  start: string;
  installs: number;
  growth: number;
  conv: number;
  monthlyPrice: number;
  annualPrice: number;
  annualShare: number;
  churn: number;
  annualRenew: number;
  book: Actuals['book'];
  lag: number;
  history: (d: string) => number;
}): Run {
  const gDaily = Math.pow(1 + o.growth, 1 / DPM) - 1;
  const installs: number[] = [];
  for (let t = 1; t <= o.days; t += 1) installs[t] = o.installs * Math.pow(1 + gDaily, t);

  const due: Record<number, { c: Cohort; kind: 'renew' | 'stop' }[]> = {};
  let moN = 0;
  let anN = 0;
  let mrr = 0;
  const keepMonthly = 1 - o.churn;
  const keepAnnual = o.annualRenew;
  const term = (c: Cohort) => (c.plan === 'annual' ? 12 : 1);
  const add = (c: Cohort) => {
    if (c.plan === 'annual') anN += c.n;
    else moN += c.n;
    mrr += (c.n * c.price) / term(c);
  };
  const remove = (c: Cohort, lost: number) => {
    if (c.plan === 'annual') anN -= lost;
    else moN -= lost;
    mrr -= (lost * c.price) / term(c);
    c.n -= lost;
  };
  const schedule = (c: Cohort) => {
    for (;;) {
      c.k += 1;
      const d = addMonths(c.origin, term(c) * c.k);
      if (c.stop && d >= c.stop) {
        const idx = daysBetween(o.start, c.stop);
        if (idx < 1) remove(c, c.n);
        else if (idx <= o.days) (due[idx] ||= []).push({ c, kind: 'stop' });
        return;
      }
      const idx = daysBetween(o.start, d);
      if (idx > o.days) return;
      if (idx >= 1) {
        (due[idx] ||= []).push({ c, kind: 'renew' });
        return;
      }
    }
  };

  o.book.forEach((bk) => {
    const c: Cohort = { ...bk, k: 0 };
    add(c);
    schedule(c);
  });

  const months: Month[] = [];
  let cum = 0;
  let totInstalls = 0;
  let totConv = 0;
  let next30 = 0;
  for (let t = 1; t <= o.days; t += 1) {
    const date = addDays(o.start, t);
    const src = t - o.lag;
    const wall = src >= 1 ? installs[src] : o.history(addDays(o.start, src));
    const conv = wall * o.conv;
    const newAnnual = conv * o.annualShare;
    const newMonthly = conv - newAnnual;
    let fresh = 0;
    let renew = 0;
    (due[t] || []).forEach((ev) => {
      if (ev.kind === 'stop') {
        remove(ev.c, ev.c.n);
        return;
      }
      remove(ev.c, ev.c.n * (1 - (ev.c.plan === 'annual' ? keepAnnual : keepMonthly)));
      renew += ev.c.n * ev.c.price;
      schedule(ev.c);
    });
    delete due[t];
    ([['monthly', newMonthly, o.monthlyPrice], ['annual', newAnnual, o.annualPrice]] as const).forEach(([plan, n, price]) => {
      if (!(n > 0)) return;
      const c: Cohort = { plan, n, price, origin: date, stop: null, k: 0 };
      add(c);
      schedule(c);
      fresh += n * price;
    });
    const bookings = fresh + renew;
    cum += bookings;
    totInstalls += installs[t];
    totConv += conv;
    if (t <= 30) next30 += bookings;
    const key = `${date.slice(0, 7)}-01`;
    let m = months[months.length - 1];
    if (!m || m.key !== key) {
      m = { key, days: 0, installs: 0, conv: 0, bookings: 0, freshCash: 0, renewCash: 0, mrr: 0, payers: 0, monthlyPayers: 0, annualPayers: 0, cumBookings: 0 };
      months.push(m);
    }
    m.days += 1;
    m.installs += installs[t];
    m.conv += conv;
    m.bookings += bookings;
    m.freshCash += fresh;
    m.renewCash += renew;
    m.mrr = mrr;
    m.payers = moN + anN;
    m.monthlyPayers = moN;
    m.annualPayers = anN;
    m.cumBookings = cum;
  }

  // Where the book levels off at today's install rate: monthly payers settle at
  // new-per-month / churn, annual at twelve months of buyers / the share not renewing.
  const flow = o.installs * DPM * o.conv;
  const flowA = flow * o.annualShare;
  const flowM = flow - flowA;
  const eqM = o.churn > 0 ? flowM / o.churn : null;
  const eqA = keepAnnual < 1 ? (12 * flowA) / (1 - keepAnnual) : null;
  const plateau = (flowM > 0 && eqM === null) || (flowA > 0 && eqA === null) ? null : (eqM || 0) * o.monthlyPrice + ((eqA || 0) * o.annualPrice) / 12;

  return {
    months,
    endMrr: months.length ? months[months.length - 1].mrr : 0,
    endPayers: moN + anN,
    totalBookings: cum,
    totalInstalls: totInstalls,
    totalConv: totConv,
    bookingsNext30: next30,
    plateauMrr: plateau,
  };
}

export type Scenarios = { expected: Run; bear: Run; optimistic: Run; end: string };

export function scenarios(b: StoreBase, a: Actuals, lv: Levers, horizonMonths: number): Scenarios {
  // Run through the END of the month `horizonMonths` ahead, so the last bar is whole.
  const endDate = (() => {
    const d = new Date(`${a.end}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + horizonMonths + 1, 0);
    return d.toISOString().slice(0, 10);
  })();
  const days = daysBetween(a.end, endDate);
  const churn = lv.churn / 100;
  const base = {
    days,
    start: a.end,
    installs: lv.installs,
    growth: lv.growth / 100,
    conv: lv.conv / 100,
    monthlyPrice: lv.monthlyPrice,
    annualPrice: lv.annualPrice,
    annualShare: lv.annualShare / 100,
    churn,
    annualRenew: lv.annualRenew === null ? Math.pow(1 - churn, 12) : lv.annualRenew / 100,
    book: a.book,
    lag: trialExit(b),
    history: (d: string) => cumAt(b, d, 'downloads') - cumAt(b, addDays(d, -1), 'downloads'),
  };
  const f = lv.spread / 100;
  const variant = (dir: 1 | -1) => ({
    ...base,
    installs: Math.max(0, base.installs * (1 + (dir * f) / 3)),
    growth: base.growth + (dir * f) / 8,
    conv: Math.max(0, base.conv * (1 + dir * f)),
  });
  return { expected: run(base), bear: run(variant(-1)), optimistic: run(variant(1)), end: endDate };
}
