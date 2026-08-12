/* Unit tests for landing/master/costs.js — the money arithmetic behind the
   Costs view. No DOM; the module is loaded with a `window` shim, the same way
   analytics.test.mjs loads its subject.

   The fixture is a small, hand-checkable year:

     APPLE   99 a year, first charged 2026-01-15
     HOST    12 a month, first charged 2026-01-31 (a date that tests clamping)
     ADS-A   50 a day for the five days 2026-06-01..05, on campaign A
     ADS-B   a single 200 on 2026-06-03, on campaign B, with reported counts
     LAPTOP  1500 one-off on 2026-03-10

   Where a number below is asserted, it was worked out by hand first. */
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../master/costs.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const C = sandbox.window.Costs;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const near = (a, b, eps = 0.001) => a !== null && a !== undefined && Math.abs(a - b) < eps;

/* ------------------------------------------------------------- fixture */

const ADS = [
  { id: 'a', name: 'Search Ads — POTS', channel: 'Apple Search Ads', platform: 'ios', start: '2026-06-01', end: '2026-06-05' },
  { id: 'b', name: 'Reddit test', channel: 'Reddit', platform: 'all', start: '2026-06-03' },
];

const COSTS = [
  { id: 'apple', date: '2026-01-15', amount: 99, category: 'FEES', recurrence: 'yearly', label: 'Apple Developer' },
  { id: 'host', date: '2026-01-31', amount: 12, category: 'INFRA', recurrence: 'monthly', label: 'Hosting' },
  { id: 'laptop', date: '2026-03-10', amount: 1500, category: 'HARDWARE', label: 'Laptop' },
  { id: 'b1', date: '2026-06-03', amount: 200, category: 'ADS', adId: 'b', impressions: 40000, clicks: 800, installs: 25 },
];
['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'].forEach((d, i) => {
  COSTS.push({ id: 'a' + i, date: d, amount: 50, category: 'ADS', adId: 'a', clicks: 100, installs: 10 });
});

/* --------------------------------------------------------- occurrences */

check('a one-off lands on its own day only',
  C.occurrences(COSTS[2], '2026-03-01', '2026-03-31').join() === '2026-03-10');
check('a one-off outside the window contributes nothing',
  C.occurrences(COSTS[2], '2026-04-01', '2026-04-30').length === 0);

const hostH1 = C.occurrences(COSTS[1], '2026-01-01', '2026-06-30');
check('a monthly bill recurs once a month', hostH1.length === 6, hostH1.join(' '));
/* Jan 31 → Feb 28 → Mar 31. The clamp is per-occurrence: stepping from the
   ORIGINAL day, not the clamped one, is what stops February dragging the whole
   series down to the 28th forever. */
check('a monthly bill clamps short months without drifting',
  hostH1[1] === '2026-02-28' && hostH1[2] === '2026-03-31' && hostH1[3] === '2026-04-30',
  hostH1.join(' '));

check('a yearly fee charges once in a year',
  C.occurrences(COSTS[0], '2026-01-01', '2026-12-31').length === 1);
check('a yearly fee charges again the next year',
  C.occurrences(COSTS[0], '2026-01-01', '2027-12-31').join() === '2026-01-15,2027-01-15');

const until = { id: 'u', date: '2026-01-10', amount: 5, category: 'TOOLS', recurrence: 'monthly', until: '2026-03-31' };
check('`until` stops a recurrence',
  C.occurrences(until, '2026-01-01', '2026-12-31').join() === '2026-01-10,2026-02-10,2026-03-10');

/* A recurring cost with no end date is still being paid, so it runs to the end
   of the window asked about — not to some stored stop date it does not have. */
check('an open-ended recurrence runs to the end of the window',
  C.occurrences(COSTS[1], '2026-01-01', '2026-03-01').length === 2);

/* ---------------------------------------------------------- daily roll */

const june = C.daily(COSTS, '2026-06-01', '2026-06-30');
// 5 × 50 ads + 200 ads + one hosting charge on the 30th = 450 + 12
check('a month totals every occurrence in it', near(june.total, 462), june.total);
check('marketing is separated from the rest', near(june.marketing, 450) && near(june.other, 12),
  june.marketing + ' / ' + june.other);
check('the 3rd carries both ad rows', near(june.byDay['2026-06-03'], 250), june.byDay['2026-06-03']);
check('a day with nothing on it is 0, not undefined', june.byDay['2026-06-20'] === 0);
check('categories roll up separately',
  near(june.totals.ADS, 450) && near(june.totals.INFRA, 12) && june.totals.HARDWARE === 0);

const q1 = C.daily(COSTS, '2026-01-01', '2026-03-31');
// 99 Apple + 3 hosting (Jan 31, Feb 28, Mar 31) + 1500 laptop
check('a quarter picks up every recurrence and one-off', near(q1.total, 99 + 36 + 1500), q1.total);
check('nothing in that quarter is marketing', near(q1.marketing, 0));

check('spend() agrees with daily()', near(C.spend(COSTS, '2026-06-01', '2026-06-30'), 462));
check('spend() can be filtered',
  near(C.spend(COSTS, '2026-06-01', '2026-06-30', (c) => c.adId === 'a'), 250));

/* -------------------------------------------------------------- per ad */

const per = C.perAd(ADS, COSTS, '2026-06-01', '2026-06-30');
const rowA = per.rows.find((r) => r.id === 'a');
const rowB = per.rows.find((r) => r.id === 'b');
check('per-ad spend splits by campaign', near(rowA.spend, 250) && near(rowB.spend, 200),
  rowA.spend + ' / ' + rowB.spend);
check('reported counts accumulate per campaign',
  rowA.installs === 50 && rowA.clicks === 500 && rowB.installs === 25);
check('reported CPI is spend ÷ the network\'s own installs',
  near(rowA.cpi, 5) && near(rowB.cpi, 8), rowA.cpi + ' / ' + rowB.cpi);
check('CPC and CTR come from the reported counts',
  near(rowB.cpc, 0.25) && near(rowB.ctr, 2), rowB.cpc + ' / ' + rowB.ctr);
check('share of spend adds to 100', near(rowA.share + rowB.share, 100));
check('rows are ordered by spend', per.rows[0].id === 'a');

/* Money whose campaign was deleted still counts — see removeAd() in app.js. */
const orphan = COSTS.concat([{ id: 'o', date: '2026-06-07', amount: 75, category: 'ADS' }]);
const withOrphan = C.perAd(ADS, orphan, '2026-06-01', '2026-06-30');
check('advertising with no campaign is reported, not dropped',
  near(withOrphan.total, 525) &&
  withOrphan.rows.some((r) => r.id === null && near(r.spend, 75)),
  String(withOrphan.total));

/* A campaign with no spend in the window is still a row, at zero, rather than
   vanishing — "we ran it and it cost nothing" and "we did not run it" are
   different answers and the table has to be able to show the first. */
const quiet = C.perAd(ADS, [], '2026-06-01', '2026-06-30');
check('a campaign with no spend is still listed', quiet.rows.length === 2 && quiet.rows[0].spend === 0);
check('a rate with no denominator is null, never zero', quiet.rows[0].cpi === null);

/* Creative work is marketing money — it counts towards cost per install — but
   it is not a campaign: no channel, no clicks, nothing to attribute. */
const withCreative = COSTS.concat([{ id: 'art', date: '2026-06-08', amount: 400, category: 'CREATIVE', label: 'Screenshots' }]);
check('creative spend counts as marketing',
  near(C.daily(withCreative, '2026-06-01', '2026-06-30').marketing, 850));
check('but never appears as a campaign',
  near(C.perAd(ADS, withCreative, '2026-06-01', '2026-06-30').total, 450));

const chans = C.perChannel(ADS, COSTS, '2026-06-01', '2026-06-30');
check('channels roll campaigns up', chans.length === 2 && near(chans[0].spend, 250));

/* --------------------------------------------------------- the money */

check('net revenue takes the store cut off', near(C.netRevenue(1000, 15), 850));
check('a zero cut is honoured, not treated as missing', near(C.netRevenue(1000, 0), 1000));
check('an absurd cut is clamped rather than inverting the sign',
  near(C.netRevenue(1000, 150), 0) && near(C.netRevenue(1000, -20), 1000));

const sum = C.summary({
  costs: COSTS, from: '2026-06-01', to: '2026-06-30', storeCutPct: 15,
  store: { revenue: 1000, downloads: 500, sales: 40 },
});
check('summary nets revenue before subtracting spend', near(sum.netRevenue, 850) && near(sum.commission, 150));
check('profit is net revenue minus every cost', near(sum.profit, 850 - 462), sum.profit);
check('blended cost per install charges marketing across every download',
  near(sum.costPerInstall, 450 / 500), sum.costPerInstall);
check('blended cost per paid uses marketing spend only', near(sum.costPerPaid, 450 / 40));
check('the loaded figure uses every cost', near(sum.loadedCostPerPaid, 462 / 40));
check('ROAS is net revenue over marketing spend', near(sum.roas, 850 / 450));
check('margin is profit as a share of net revenue', near(sum.margin, ((850 - 462) / 850) * 100));

const dry = C.summary({ costs: COSTS, from: '2026-06-01', to: '2026-06-30', storeCutPct: 15, store: {} });
check('no installs means no cost per install, not a zero one',
  dry.costPerInstall === null && dry.costPerPaid === null && dry.roas !== null);

/* ----------------------------------------------------------- breakeven */

/* 10 a day of net revenue against a single 100 spend on day 3. Cumulative
   revenue passes cumulative spend on day 10: 100 in, 100 out. */
const netByDay = {};
C.days('2026-07-01', '2026-07-20').forEach((d) => { netByDay[d] = 10; });
const be = C.breakeven([{ id: 'x', date: '2026-07-03', amount: 100, category: 'OTHER' }],
  netByDay, '2026-07-01', '2026-07-20');
check('breakeven is the first day revenue catches spend', be.at === '2026-07-10', String(be.at));
check('breakeven reports the final position', near(be.profit, 200 - 100));
check('the series is cumulative on both sides',
  near(be.series[2].spend, 100) && near(be.series[2].revenue, 30));

const never = C.breakeven([{ id: 'x', date: '2026-07-03', amount: 5000, category: 'OTHER' }],
  netByDay, '2026-07-01', '2026-07-20');
check('breakeven that has not happened reports null, not day one', never.at === null);

/* Spending nothing is not breaking even. Without the guard, day one of an empty
   ledger reports 0 >= 0 and the tile announces a triumph that never happened. */
const nothing = C.breakeven([], netByDay, '2026-07-01', '2026-07-20');
check('no spend at all is not a breakeven date', nothing.at === null);

/* --------------------------------------------------------- annotations */

const marks = C.adMarks(ADS);
check('a finished campaign flags both ends', marks.filter((m) => m.adId === 'a').length === 2);
check('a running campaign flags only its start', marks.filter((m) => m.adId === 'b').length === 1);
check('marks come back in date order', marks.every((m, i) => i === 0 || marks[i - 1].date <= m.date));

check('status reads off the day asked about',
  C.adStatus(ADS[0], '2026-06-03') === 'running' &&
  C.adStatus(ADS[0], '2026-06-30') === 'ended' &&
  C.adStatus(ADS[0], '2026-05-01') === 'scheduled' &&
  C.adStatus(ADS[1], '2026-12-31') === 'running');

/* ------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
