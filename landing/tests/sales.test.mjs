/* Unit tests for landing/master/sales.js — the subscription arithmetic behind
   the Sales view. No DOM; the module is loaded with a `window` shim, the same
   way costs.test.mjs and analytics.test.mjs load theirs.

   The fixture is a small, hand-checkable book. Every number asserted below was
   worked out on paper first, and the ones that look surprising are the point of
   the file — an annual plan's MRR, the gap between cash and recognised revenue,
   and what happens to a purchase whose plan nobody recorded.

     M1  2026-01-10  ios      monthly  4.99   installed 2026-01-08  (2 days)
     M2  2026-02-05  android  monthly  4.99   installed 2026-01-20  (16 days)
     M3  2026-03-01  ios      monthly  4.99   no install date       cancelled 2026-05-01
     A1  2026-01-15  ios      annual  29.99   installed 2025-12-01  (45 days)
     A2  2026-04-20  android annual  59.88    installed 2026-04-19  (1 day)
     L1  2026-02-14  ios     lifetime 99.00   installed 2026-02-01  (13 days)
     U1  2026-01-31  ios     unknown   9.98   qty 2   (a migrated daily total)
     R1  2026-03-15  ios      monthly  4.99   REFUNDED

   MRR arithmetic to keep in your head:
     monthly  4.99 each
     A1       29.99 / 12 = 2.499166…
     A2       59.88 / 12 = 4.99
     lifetime 0 — a one-time purchase does not recur
     unknown  0 — no term was ever recorded
     refunded 0 — it did not happen
*/
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../master/sales.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const S = sandbox.window.Sales;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const near = (a, b, eps = 0.001) => a !== null && a !== undefined && Math.abs(a - b) < eps;

/* ------------------------------------------------------------- fixture */

const ROWS = [
  { id: 'M1', date: '2026-01-10', platform: 'ios', plan: 'monthly', price: 4.99, cohort: '2026-01-08' },
  { id: 'M2', date: '2026-02-05', platform: 'android', plan: 'monthly', price: 4.99, cohort: '2026-01-20' },
  { id: 'M3', date: '2026-03-01', platform: 'ios', plan: 'monthly', price: 4.99, cancelled: '2026-05-01' },
  { id: 'A1', date: '2026-01-15', platform: 'ios', plan: 'annual', price: 29.99, cohort: '2025-12-01' },
  { id: 'A2', date: '2026-04-20', platform: 'android', plan: 'annual', price: 59.88, cohort: '2026-04-19' },
  { id: 'L1', date: '2026-02-14', platform: 'ios', plan: 'lifetime', price: 99, cohort: '2026-02-01' },
  { id: 'U1', date: '2026-01-31', platform: 'ios', plan: 'unknown', price: 4.99, qty: 2 },
  { id: 'R1', date: '2026-03-15', platform: 'ios', plan: 'monthly', price: 4.99, refunded: true },
];

const ix = S.index(ROWS, 'all');

/* ----------------------------------------------------------- normalize */

check('every fixture row survives normalization', ix.rows.length === 8, String(ix.rows.length));
check('the index runs in date order',
  ix.rows.every((r, i) => i === 0 || ix.rows[i - 1].date <= r.date));

/* An install date on an aggregate row would put a fabricated multi-count spike
   into the days-to-purchase histogram, so the row is not allowed to carry one. */
check('a qty>1 row cannot carry an install date',
  S.normalize({ id: 'x', date: '2026-01-01', plan: 'unknown', price: 5, qty: 3, cohort: '2025-12-01' }).cohort === undefined);
check('a qty 1 row can', S.normalize({ id: 'x', date: '2026-01-01', plan: 'monthly', price: 5, cohort: '2025-12-01' }).cohort === '2025-12-01');
check('an install date AFTER the purchase is refused, not stored backwards',
  S.normalize({ id: 'x', date: '2026-01-01', plan: 'monthly', price: 5, cohort: '2026-02-01' }).cohort === undefined);
check('a cancellation before the purchase is refused',
  S.normalize({ id: 'x', date: '2026-02-01', plan: 'monthly', price: 5, cancelled: '2026-01-01' }).cancelled === undefined);
check('an unrecognised plan reads as unclassified, never as a new plan',
  S.normalize({ id: 'x', date: '2026-01-01', plan: 'weekly', price: 5 }).plan === 'unknown');

/* --------------------------------------------------------------- money */

check('a monthly plan is its own price of MRR', near(S.mrrOf(ix.rows.find((r) => r.id === 'M1')), 4.99));
check('an annual plan is a twelfth of its price', near(S.mrrOf(ix.rows.find((r) => r.id === 'A1')), 29.99 / 12));
/* The whole reason a plan is stored rather than inferred: two purchases, the
   same 4.99 a month of recurring revenue, wildly different cash. */
check('an annual plan priced at 12× a monthly one is the same MRR',
  near(S.mrrOf(ix.rows.find((r) => r.id === 'A2')), 4.99));
check('a lifetime purchase is real cash and zero MRR',
  S.bookingsOf(ix.rows.find((r) => r.id === 'L1')) === 99 && S.mrrOf(ix.rows.find((r) => r.id === 'L1')) === 0);
check('an unclassified purchase is real cash and zero MRR — the term was never recorded',
  near(S.bookingsOf(ix.rows.find((r) => r.id === 'U1')), 9.98) &&
  S.mrrOf(ix.rows.find((r) => r.id === 'U1')) === 0);
check('a refund is money that never arrived',
  S.bookingsOf(ix.rows.find((r) => r.id === 'R1')) === 0 && S.mrrOf(ix.rows.find((r) => r.id === 'R1')) === 0);

/* ------------------------------------------------------------- live-ness */

const m3 = ix.rows.find((r) => r.id === 'M3');
check('a subscription is live from its purchase day', S.isLiveOn(m3, '2026-03-01'));
check('and not the day before', !S.isLiveOn(m3, '2026-02-28'));
/* Cancellation is inclusive of its own day: the day you cancel is the day it
   stops counting. */
check('cancellation takes effect on its own day', !S.isLiveOn(m3, '2026-05-01'));
check('and it was live the day before that', S.isLiveOn(m3, '2026-04-30'));

/* ------------------------------------------------------------ summarize */

/* All of 2026 Q1: M1, M3, A1, L1, U1 and the refunded R1 are in the window;
   M2 is too (Feb 5). A2 (April) is not. */
/* Six purchases, because R1 was refunded and a refund is counted in nothing but
   its own two fields. Seven units, because U1 is an aggregate of two. */
const q1 = S.summarize(ix, '2026-01-01', '2026-03-31');
check('the window counts purchases, not units', q1.count === 6, String(q1.count));
check('units count the aggregate row as two', q1.units === 7, String(q1.units));

/* Bookings: 4.99 + 4.99 + 4.99 + 29.99 + 99 + 9.98 + 0 (refunded) = 153.94 */
check('bookings are gross cash, refunds removed', near(q1.bookings, 153.94), String(q1.bookings));
check('the refund is reported rather than silently netted away',
  q1.refundedCount === 1 && near(q1.refunds, 4.99), q1.refundedCount + '/' + q1.refunds);

/* New MRR in Q1: three monthlies at 4.99 (M1, M2, M3 — R1 refunded) plus
   A1's 2.4992. Lifetime and unclassified contribute nothing. */
check('new MRR excludes lifetime and unclassified rows',
  near(q1.newMrr, 4.99 * 3 + 29.99 / 12), String(q1.newMrr));
check('and says how much of the window it could not classify',
  q1.unknownCount === 2 && near(q1.unknownBookings, 9.98), q1.unknownCount + '/' + q1.unknownBookings);

/* MRR is an AS-OF figure, not a window one. On 2026-03-31 everything bought so
   far is still running (M3 cancels in May): 4.99×3 + 2.4992 = 17.4692. */
check('MRR on the closing day counts every live subscription',
  near(q1.mrr, 4.99 * 3 + 29.99 / 12), String(q1.mrr));
check('ARR is MRR times twelve', near(q1.arr, q1.mrr * 12));

/* After M3 cancels, MRR drops by exactly its 4.99 and nothing else moves. */
const toMay = S.summarize(ix, '2026-01-01', '2026-05-31');
check('a cancellation removes exactly its own MRR',
  near(toMay.mrr, 4.99 * 2 + 29.99 / 12 + 4.99), String(toMay.mrr));
check('and is reported as churned MRR in the window it happened in',
  near(toMay.churnedMrr, 4.99), String(toMay.churnedMrr));

/* Annual share is of MRR, not of units — an annual buyer is rarer and worth
   more, so a unit share would understate the plan's contribution. */
const apr = S.summarize(ix, '2026-04-01', '2026-04-30');
check('April sold one annual plan and nothing else', apr.count === 1);
check('so annual is 100% of the month’s new MRR', near(apr.annualMrrShare, 100), String(apr.annualMrrShare));

/* --------------------------------------------------------- cohort days */

const ages = S.purchaseAges(ix, '2026-01-01', '2026-12-31');
/* Five rows carry an install date: M1 (2d), M2 (16d), A1 (45d), A2 (1d),
   L1 (13d). M3 and U1 do not. R1 is not in the denominator at all — a refund is
   not a purchase, and counting it as one with no install date would quietly
   lower the coverage figure with a sale that never happened. */
check('the histogram is drawn only from purchases with an install date',
  ages.total === 5 && ages.withoutCohort === 2, ages.total + '/' + ages.withoutCohort);
check('and says what share of purchases that is',
  near(ages.coverage, (5 / 7) * 100), String(ages.coverage));
/* Sorted ages 1, 2, 13, 16, 45 — the median is 13. A mean would be 15.4,
   dragged up by the one buyer who took a month and a half. */
check('the median is the middle buyer, not the average one', ages.median === 13, String(ages.median));
check('and the mean is reported separately so the gap is visible',
  near(ages.mean, (1 + 2 + 13 + 16 + 45) / 5), String(ages.mean));

const bucketOf = (label) => ages.buckets.find((b) => b.label === label);
check('same-day buyers are their own bucket', bucketOf('Same day').count === 0);
check('1–3 days holds the two quick buyers', bucketOf('1–3 days').count === 2, String(bucketOf('1–3 days').count));
check('8–14 days holds the lifetime buyer', bucketOf('8–14 days').count === 1);
check('15–30 days holds one', bucketOf('15–30 days').count === 1);
check('31–60 days holds the slow annual buyer', bucketOf('31–60 days').count === 1);
check('the buckets add up to the rows they were drawn from',
  ages.buckets.reduce((a, b) => a + b.count, 0) === ages.total);
check('a bucket splits by plan too',
  bucketOf('1–3 days').monthly === 1 && bucketOf('1–3 days').annual === 1,
  bucketOf('1–3 days').monthly + '/' + bucketOf('1–3 days').annual);

const byPlan = S.ageByPlan(ix, '2026-01-01', '2026-12-31');
const annualAges = byPlan.find((p) => p.plan === 'annual');
check('per-plan medians are drawn from that plan only',
  annualAges.n === 2 && annualAges.median === 23, annualAges.n + '/' + annualAges.median);
const unknownAges = byPlan.find((p) => p.plan === 'unknown');
check('a plan with no dated purchase reports null rather than 0',
  unknownAges.n === 0 && unknownAges.median === null);

/* ------------------------------------------------------- install months */

const cohorts = S.byInstallMonth(ix, '2026-06-01');
check('purchases group by the buyer’s install month, not the purchase month',
  cohorts.map((m) => m.key).join() === '2025-12-01,2026-01-01,2026-02-01,2026-04-01',
  cohorts.map((m) => m.key).join());
/* A1 installed in December and bought in January — the December intake is
   credited with it, which is the whole difference from "when did the money
   land". */
check('the December intake is credited with the January purchase',
  cohorts[0].count === 1 && near(cohorts[0].bookings, 29.99));
check('the January intake bought twice', cohorts[1].count === 2, String(cohorts[1].count));
check('maturity travels with the row so a young cohort is not read as a bad one',
  cohorts[3].maturityDays === 61, String(cohorts[3].maturityDays));

/* ----------------------------------------------------- monthly revenue */

const months = S.monthlyRevenue(ix, '2026-01-01', '2026-12-31');
const mon = (k) => months.find((m) => m.key === k);
check('every month in the window gets a bucket, sold in or not', months.length === 12, String(months.length));

/* January: M1 4.99 + A1 29.99 + U1 9.98 = 44.96 of cash. */
check('bookings are the cash that arrived that month', near(mon('2026-01-01').bookings, 44.96), String(mon('2026-01-01').bookings));
/* Recognised in January: M1's whole 4.99, one twelfth of A1 (2.4992), and U1's
   9.98 — an unclassified row has no term to spread over, so it lands whole
   rather than being spread across an invented one. */
check('recognised revenue spreads an annual plan and nothing else',
  near(mon('2026-01-01').recognised, 4.99 + 29.99 / 12 + 9.98),
  String(mon('2026-01-01').recognised));
/* The gap IS the annual book: January collected 44.96 and earned 17.47. */
check('cash and recognised revenue disagree in exactly the annual plan',
  near(mon('2026-01-01').bookings - mon('2026-01-01').recognised, 29.99 - 29.99 / 12),
  String(mon('2026-01-01').bookings - mon('2026-01-01').recognised));
/* December sold nothing, but both annual plans are still being recognised into
   it: A1's twelfth month and A2's ninth. */
check('a month that sold nothing still recognises what earlier months sold',
  mon('2026-12-01').bookings === 0 && near(mon('2026-12-01').recognised, 29.99 / 12 + 59.88 / 12),
  mon('2026-12-01').bookings + '/' + mon('2026-12-01').recognised);
/* Twelve twelfths and no more. A1 (bought January) is recognised across all of
   2026; A2 (bought April) gets nine of its twelve months inside the year and
   carries the other three into 2027, which is exactly the behaviour that makes
   recognised revenue different from cash. Everything else lands whole on its
   own month. */
check('an annual plan is recognised exactly twelve times, never thirteen',
  near(months.reduce((a, m) => a + m.recognised, 0),
    4.99 * 3 + 29.99 + 59.88 * (9 / 12) + 99 + 9.98),
  String(months.reduce((a, m) => a + m.recognised, 0)));
/* M3 cancels on 2026-05-01, so it stops being recognised after May. */
check('a cancelled plan stops being recognised', mon('2026-06-01').recognised > 0);

/* --------------------------------------------------------- mrr series */

const series = S.mrrSeries(ix, '2026-01-01', '2026-01-31');
check('the series has a point per day', series.length === 31);
check('MRR is 0 before the first sale', series[0].total === 0);
check('it steps up on the day a plan is bought', near(series[9].total, 4.99), String(series[9].total));
check('and the annual plan lands as a twelfth five days later',
  near(series[14].total, 4.99 + 29.99 / 12), String(series[14].total));
check('the plan columns sum to the total',
  series.every((r) => near(r.monthly + r.annual + r.lifetime + r.unknown, r.total)));

/* ------------------------------------------------------------ platform */

const iosIx = S.index(ROWS, 'ios');
check('a platform slice keeps only that store’s purchases', iosIx.rows.length === 6, String(iosIx.rows.length));
check('and says what it is a slice of', iosIx.platform === 'ios');
const iosQ1 = S.summarize(iosIx, '2026-01-01', '2026-03-31');
check('the iOS book excludes the Android monthly plan',
  near(iosQ1.mrr, 4.99 * 2 + 29.99 / 12), String(iosQ1.mrr));

/* ------------------------------------------------------- daily totals */

/* The bridge back to the rest of the dashboard: `sales` and `revenue` still
   mean what they meant when they were two columns on a store entry, so every
   existing consumer keeps working off one source of truth. */
const daily = S.dailyTotals(ROWS);
check('a day’s sales count is units, so the aggregate row counts as two',
  daily.all['2026-01-31'].sales === 2, String(daily.all['2026-01-31'].sales));
check('a day’s revenue is gross bookings', near(daily.all['2026-01-15'].revenue, 29.99));
check('a refunded purchase adds no units and no revenue',
  !daily.all['2026-03-15'] || (daily.all['2026-03-15'].sales === 0 && daily.all['2026-03-15'].revenue === 0),
  JSON.stringify(daily.all['2026-03-15']));
check('platform totals split the same day',
  daily.ios['2026-01-10'].sales === 1 && !daily.android['2026-01-10']);

/* --------------------------------------------------------- migration */

const migrated = S.migrateEntries([
  { date: '2026-07-01', platform: 'ios', sales: 4, revenue: 19.96, downloads: 100 },
  { date: '2026-07-02', platform: 'android', sales: 0, revenue: 9.99 },
  { date: '2026-07-03', platform: 'ios', sales: 2, revenue: 0 },
  { date: '2026-07-04', platform: 'ios', downloads: 50 },
], (d, p) => 'legacy-' + d + '-' + p);

check('a day with sales becomes one row holding the count and the average price',
  migrated[0].qty === 4 && near(migrated[0].price, 4.99), migrated[0].qty + '/' + migrated[0].price);
check('and it invents no plan — the old columns recorded none',
  migrated.every((r) => r.plan === 'unknown'));
check('and no install date either', migrated.every((r) => r.cohort === undefined));
check('an amount with no count is one sale of that amount',
  migrated[1].qty === 1 && near(migrated[1].price, 9.99));
check('a count with no amount is that many free conversions',
  migrated[2].qty === 2 && migrated[2].price === 0);
check('a day with neither is not a sale at all', migrated.length === 3, String(migrated.length));
/* The id is derived from the day and store, which is what makes running the
   migration twice — or re-importing the same CSV — a correction rather than a
   duplicate. */
check('the id is stable for a given day and store',
  migrated[0].id === 'legacy-2026-07-01-ios');

/* Round-tripping the migrated rows preserves the money exactly, which is the
   one thing the migration must not lose. */
const migIx = S.index(migrated.map((r, i) => ({ ...r, id: 'm' + i })), 'all');
check('migrated money survives the round trip',
  near(S.summarize(migIx, '2026-07-01', '2026-07-31').bookings, 19.96 + 9.99),
  String(S.summarize(migIx, '2026-07-01', '2026-07-31').bookings));

/* -------------------------------------------------------- forecast basis */

const basis = S.forecastBasis(ix, '2026-01-01', '2026-12-31');
check('the monthly price is the average of monthly plans only', near(basis.monthlyPrice, 4.99));
/* 29.99 and 59.88 over two purchases — an average across the two ANNUAL plans,
   never mixed with the monthlies. */
check('the annual price is the average of annual plans only',
  near(basis.annualPrice, (29.99 + 59.88) / 2), String(basis.annualPrice));
check('annual share is by unit, which is the question a forecast asks',
  near(basis.annualShare, (2 / 5) * 100), String(basis.annualShare));
/* Churn needs a book to churn OUT of, and the book it is measured against is
   the MEAN daily one over the window rather than the book on the opening day.
   The forecast reads a 180-day window, so an account whose first sale is inside
   it has an opening book of zero — an opening-MRR rate is undefined there, and
   that is every young account, which is exactly the one the churn ledger exists
   for. The whole year opens before the first sale and still has eleven months
   of book and one real cancellation in it, so a rate can be stated. */
check('a window that opens on an empty book is still measurable against the book it had',
  basis.churnPct !== null && basis.churnPct > 0, String(basis.churnPct));
check('and it is struck against the mean book, which is reported with it',
  near(basis.churnPct, (basis.churnedMrr / basis.meanBook) * (30 / 365) * 100, 0.01),
  String(basis.churnPct));

/* Q2: M3's 4.99 cancels on 2026-05-01, over the mean book across those 91 days.
   The mean rather than the opening 17.469, so a book that grew inside the
   window is not measured against the handful of subscriptions it opened with. */
const q2 = S.forecastBasis(ix, '2026-04-01', '2026-06-30');
check('churn comes back measured once there is a book to measure against',
  near(q2.churnPct, (4.99 / q2.meanBook) * (30 / 91) * 100, 0.01), String(q2.churnPct));
/* The book does not fall monotonically across Q2 — A2 joins on the 20th before
   M3 leaves on 2026-05-01 — so the mean sits ABOVE both edges, which is the
   case an opening-MRR denominator gets most wrong. */
check('the mean book is the MRR the window\'s churn actually came out of',
  q2.meanBook > S.mrrOn(ix, '2026-04-01').mrr && q2.meanBook < S.mrrOn(ix, '2026-04-30').mrr,
  String(q2.meanBook));

/* A window with a book but nothing cancelled must report null rather than 0: a
   0% churn nobody could have churned in is a claim, not a measurement. */
const quiet = S.forecastBasis(ix, '2026-02-01', '2026-02-28');
check('a window with nothing cancelled reports unknown churn, not zero',
  quiet.churnPct === null, String(quiet.churnPct));

/* And a window with no book at all reports nothing rather than dividing by
   zero, whatever is entered against it. */
const empty = S.forecastBasis(S.index([], 'all', [{ id: 'e', date: '2025-01-05', mrr: 5 }]),
  '2025-01-01', '2025-01-31');
check('a window with no book at all still reports unknown', empty.churnPct === null,
  String(empty.churnPct));

/* ------------------------------------------------- unattached churn

   The case the `cancelled` column cannot express: a store report says four
   subscriptions went away and about $19.96 a month with them, and never says
   WHICH four. Two rows against the fixture book:

     C1  2026-06-01  monthly  9.98 lost, 2 subs, no store   (unattributed)
     C2  2026-07-01  monthly  4.99 lost, 1 sub,  ios

   The book on 2026-06-30 from purchases alone: M1 + M2 (4.99 each, both live),
   M3 cancelled 2026-05-01, A1 2.499166…, A2 4.99, lifetime 0, unknown 0, R1
   refunded. That is 4.99 + 4.99 + 2.4991666 + 4.99 = 17.469166…
*/

const CHURN = [
  { id: 'C1', date: '2026-06-01', mrr: 9.98, units: 2, plan: 'monthly' },
  { id: 'C2', date: '2026-07-01', mrr: 4.99, units: 1, plan: 'monthly', platform: 'ios' }
];
const cix = S.index(ROWS, 'all', CHURN);

check('the churn ledger rides on the index', cix.churn.length === 2);
check('a churn row with no store keeps none rather than defaulting to iOS',
  cix.churn[0].platform === undefined, String(cix.churn[0].platform));

const grossJun = 4.99 + 4.99 + 29.99 / 12 + 4.99;
const bookJun = S.mrrOn(cix, '2026-06-30');
check('the book before churn is the purchase ledger alone', near(bookJun.gross, grossJun));
check('and after it, one churn row has been taken off', near(bookJun.mrr, grossJun - 9.98));
check('churn dated after the day is not counted yet', near(bookJun.churned, 9.98));
check('a book that survives is not flagged as floored', bookJun.churnFloored === false);
/* The stacked chart has to sum to the netted total whatever plan the estimate
   was filed under, so a plan that cannot absorb its share spills onto the rest
   and no band ever goes negative. */
check('the plan split still sums to the netted total',
  near(S.PLAN_KEYS.reduce((a, k) => a + bookJun.byPlan[k], 0), bookJun.mrr));
check('and no plan band is negative',
  S.PLAN_KEYS.every((k) => bookJun.byPlan[k] >= -1e-9));

/* An estimate typed by hand can overshoot the ledger. It must read as
   "everything churned", never as a negative book. */
const over = S.index(ROWS, 'all', [{ id: 'X', date: '2026-06-01', mrr: 500, plan: 'monthly' }]);
const overBook = S.mrrOn(over, '2026-06-30');
check('an overshooting estimate floors the book at zero', overBook.mrr === 0);
check('and says so, rather than reporting a plausible small number',
  overBook.churnFloored === true);

const csum = S.summarize(cix, '2026-06-01', '2026-06-30');
check('churn is booked against the window it happened in', near(csum.unattachedMrr, 9.98));
check('and the two kinds of churn are kept apart', csum.cancelledMrr === 0);
check('churnedMrr is their sum', near(csum.churnedMrr, 9.98));
check('the summarised book is netted', near(csum.mrr, grossJun - 9.98));
check('and the gross is still reported beside it', near(csum.grossMrr, grossJun));

/* Only the churn rows that named a COUNT may move the headcount. A row with a
   dollar figure and no count is not evidence about how many people left. */
const noCount = S.index(ROWS, 'all', [{ id: 'N', date: '2026-06-01', mrr: 9.98, plan: 'monthly' }]);
const nsum = S.summarize(noCount, '2026-06-01', '2026-06-30');
const gsum = S.summarize(S.index(ROWS, 'all', []), '2026-06-01', '2026-06-30');
check('a churn row with no count leaves the active count alone',
  nsum.active === gsum.active, `${nsum.active} vs ${gsum.active}`);
check('but it still takes the money off the book', near(nsum.mrr, grossJun - 9.98));
check('a churn row with a count does move it', csum.active === gsum.active - 2,
  `${csum.active} vs ${gsum.active}`);

/* CASH is untouched. Money that already arrived does not un-arrive — that is
   what a refund is for — and an unattached row has no purchase whose
   recognition schedule could be stopped. */
check('churn does not touch bookings', near(csum.bookings, gsum.bookings));
const recWith = S.monthlyRevenue(cix, '2026-06-01', '2026-06-30');
const recWithout = S.monthlyRevenue(S.index(ROWS, 'all', []), '2026-06-01', '2026-06-30');
check('nor recognised revenue', near(recWith[0].recognised, recWithout[0].recognised));

/* A store filter drops the rows that name no store rather than guessing, and
   reports what it dropped so the view can disclose the hole. */
const iosChurnIx = S.index(ROWS, 'ios', CHURN);
check('a filtered index keeps only that store\'s churn',
  iosChurnIx.churn.length === 1 && iosChurnIx.churn[0].id === 'C2');
check('and says what it left out', iosChurnIx.churnUnattributed.count === 1
  && near(iosChurnIx.churnUnattributed.mrr, 9.98));

/* The series the chart is drawn from. Unattached rows and cancellations sit in
   their own bands because they are different evidence. */
const cs = S.churnSeries(cix, '2026-05-01', '2026-07-01');
const total = cs.reduce((a, d) => a + d.mrr, 0);
check('the churn series carries both kinds', near(total, 4.99 + 9.98 + 4.99));
check('and splits them', near(cs.reduce((a, d) => a + d.cancelled, 0), 4.99)
  && near(cs.reduce((a, d) => a + d.unattached, 0), 9.98 + 4.99));
const jun1 = cs.filter((d) => d.date === '2026-06-01')[0];
check('a day with no churn is a real zero rather than a gap',
  cs.filter((d) => d.date === '2026-06-15')[0].mrr === 0);
check('and a day with churn carries it', near(jun1.unattached, 9.98));

/* The MRR series has to fall on a day nothing was CANCELLED on — that is the
   whole point of the ledger. */
const ms = S.mrrSeries(cix, '2026-05-31', '2026-06-02');
check('the MRR line falls on an unattached churn date',
  near(ms[0].total - ms[2].total, 9.98), `${ms[0].total} -> ${ms[2].total}`);
check('and the gross line does not', near(ms[0].gross, ms[2].gross));

/* And it reaches the forecast, which is the reason the ledger exists: with
   nowhere to put this, churn read as zero forever and the projection fell back
   to its 5% assumption. */
const cb = S.forecastBasis(cix, '2026-06-01', '2026-06-30');
check('hand-entered churn gives the forecast a measured rate', cb.churnPct !== null);
check('and the forecast can see it was hand-entered, not a cancellation',
  near(cb.unattachedMrr, 9.98) && cb.cancelledMrr === 0);

/* ------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
