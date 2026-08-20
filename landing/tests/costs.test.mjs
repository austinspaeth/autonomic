/* Unit tests for landing/master/costs.js — the money arithmetic behind the
   Costs view. No DOM; the module is loaded with a `window` shim, the same way
   analytics.test.mjs loads its subject.

   The fixture is a small, hand-checkable year:

     APPLE   99 a year, first charged 2026-01-15
     HOST    12 a month, first charged 2026-01-31 (a date that tests clamping)
     LAPTOP  1500 one-off on 2026-03-10
     SPOT-A  250 of Apple Search Ads, starting 2026-06-01, ended 2026-06-05
     SPOT-B  200 on Reddit, starting 2026-06-03, no end date yet

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
  { id: 'a', name: 'Search Ads — POTS', platform: 'Apple Search Ads', start: '2026-06-01', end: '2026-06-05',
    amount: 250, impressions: 25000, clicks: 500, installs: 50 },
  { id: 'b', name: 'Reddit test', platform: 'Reddit', start: '2026-06-03',
    amount: 200, impressions: 40000, clicks: 800, installs: 25 },
];

const ENTERED = [
  { id: 'apple', date: '2026-01-15', amount: 99, category: 'FEES', recurrence: 'yearly', label: 'Apple Developer' },
  { id: 'host', date: '2026-01-31', amount: 12, category: 'INFRA', recurrence: 'monthly', label: 'Hosting' },
  { id: 'laptop', date: '2026-03-10', amount: 1500, category: 'HARDWARE', label: 'Laptop' },
];

/* What every rollup actually reads: the entered costs with the ad spots
   projected in. Nothing in this file may sum the two by hand — allCosts is the
   one place they are put together, in the app as well as here. */
const COSTS = C.allCosts(ADS, ENTERED);

/* --------------------------------------------------------- occurrences */

check('a one-off lands on its own day only',
  C.occurrences(ENTERED[2], '2026-03-01', '2026-03-31').join() === '2026-03-10');
check('a one-off outside the window contributes nothing',
  C.occurrences(ENTERED[2], '2026-04-01', '2026-04-30').length === 0);

const hostH1 = C.occurrences(ENTERED[1], '2026-01-01', '2026-06-30');
check('a monthly bill recurs once a month', hostH1.length === 6, hostH1.join(' '));
/* Jan 31 → Feb 28 → Mar 31. The clamp is per-occurrence: stepping from the
   ORIGINAL day, not the clamped one, is what stops February dragging the whole
   series down to the 28th forever. */
check('a monthly bill clamps short months without drifting',
  hostH1[1] === '2026-02-28' && hostH1[2] === '2026-03-31' && hostH1[3] === '2026-04-30',
  hostH1.join(' '));

check('a yearly fee charges once in a year',
  C.occurrences(ENTERED[0], '2026-01-01', '2026-12-31').length === 1);
check('a yearly fee charges again the next year',
  C.occurrences(ENTERED[0], '2026-01-01', '2027-12-31').join() === '2026-01-15,2027-01-15');

const until = { id: 'u', date: '2026-01-10', amount: 5, category: 'TOOLS', recurrence: 'monthly', until: '2026-03-31' };
check('`until` stops a recurrence',
  C.occurrences(until, '2026-01-01', '2026-12-31').join() === '2026-01-10,2026-02-10,2026-03-10');

/* A recurring cost with no end date is still being paid, so it runs to the end
   of the window asked about — not to some stored stop date it does not have. */
check('an open-ended recurrence runs to the end of the window',
  C.occurrences(ENTERED[1], '2026-01-01', '2026-03-01').length === 2);

/* ---------------------------------------------------------- daily roll */

const june = C.daily(COSTS, '2026-06-01', '2026-06-30');
// spot A's 250 lands on the 1st, spot B's 200 on the 3rd, hosting 12 on the 30th
check('a month totals every occurrence in it', near(june.total, 462), june.total);
check('marketing is separated from the rest', near(june.marketing, 450) && near(june.other, 12),
  june.marketing + ' / ' + june.other);
check('a spot charges its whole price on its start day, and no other day',
  near(june.byDay['2026-06-01'], 250) && near(june.byDay['2026-06-03'], 200) &&
  june.byDay['2026-06-02'] === 0 && june.byDay['2026-06-04'] === 0,
  JSON.stringify([june.byDay['2026-06-01'], june.byDay['2026-06-02'], june.byDay['2026-06-03']]));
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

/* A projected row is derived, never stored: it carries the spot's id so a
   filter can find it, and the entered ledger is left exactly as it was. */
check('projecting spots leaves the entered costs untouched',
  ENTERED.length === 3 && COSTS.length === 5 &&
  C.adCosts(ADS).every((c) => c.derived && c.category === 'ADS'));

/* ------------------------------------------------------------ ad spots */

const per = C.perAd(ADS, '2026-06-01', '2026-06-30');
const rowA = per.rows.find((r) => r.id === 'a');
const rowB = per.rows.find((r) => r.id === 'b');
check('a spot reports its own price', near(rowA.spend, 250) && near(rowB.spend, 200),
  rowA.spend + ' / ' + rowB.spend);
check('the counts are the ones entered on the spot',
  rowA.installs === 50 && rowA.clicks === 500 && rowB.installs === 25);
check('reported CPI is cost \u00f7 the platform\'s own installs',
  near(rowA.cpi, 5) && near(rowB.cpi, 8), rowA.cpi + ' / ' + rowB.cpi);
check('CPC and CTR come from the reported counts',
  near(rowB.cpc, 0.25) && near(rowB.ctr, 2), rowB.cpc + ' / ' + rowB.ctr);
check('share of spend adds to 100', near(rowA.share + rowB.share, 100));
check('rows are ordered by spend', per.rows[0].id === 'a');

/* The window test is the CHARGE, not the run. Spot A ran into June 5th and was
   paid for on the 1st: a window opening on the 2nd contains none of its money,
   and reporting it there would double-count it against the month that did. */
const late = C.perAd(ADS, '2026-06-02', '2026-06-30');
check('a spot belongs to the window its cost landed in',
  late.rows.length === 1 && late.rows[0].id === 'b', String(late.rows.length));
check('a spot outside the window is absent, not a zero row',
  C.perAd(ADS, '2026-07-01', '2026-07-31').rows.length === 0);

/* Creative work is marketing money — it counts towards cost per install — but
   it is not an ad spot: no platform, no clicks, nothing to attribute. */
const withCreative = COSTS.concat([{ id: 'art', date: '2026-06-08', amount: 400, category: 'CREATIVE', label: 'Screenshots' }]);
check('creative spend counts as marketing',
  near(C.daily(withCreative, '2026-06-01', '2026-06-30').marketing, 850));
check('but never appears as an ad spot', near(C.perAd(ADS, '2026-06-01', '2026-06-30').total, 450));

const plats = C.perPlatform(ADS, '2026-06-01', '2026-06-30');
check('platforms roll spots up', plats.length === 2 && near(plats[0].spend, 250) && plats[0].ads === 1);

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
check('a finished spot flags both ends', marks.filter((m) => m.adId === 'a').length === 2);
check('a spot with no end date flags only its start', marks.filter((m) => m.adId === 'b').length === 1);
check('marks come back in date order', marks.every((m, i) => i === 0 || marks[i - 1].date <= m.date));

check('status reads off the day asked about',
  C.adStatus(ADS[0], '2026-06-03') === 'running' &&
  C.adStatus(ADS[0], '2026-06-30') === 'ended' &&
  C.adStatus(ADS[0], '2026-05-01') === 'scheduled' &&
  C.adStatus(ADS[1], '2026-12-31') === 'ongoing');

/* Advertising is not offered as a cost category: the same money would then be
   enterable as a spot AND as a cost, and the two would not add up. */
check('the cost form is never offered the advertising category',
  C.ENTRY_CATEGORY_KEYS.indexOf('ADS') === -1 && C.CATEGORY_KEYS.indexOf('ADS') === 0);

/* ------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
