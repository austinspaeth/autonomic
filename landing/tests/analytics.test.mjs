/* Unit tests for landing/master/analytics.js — the rules the dashboard is not
   allowed to break. No DOM involved; the module is loaded with a `window` shim.

   The fixture is a hand-built world with known answers:

     cohort 2026-05-31, 100 installs — 30 days old, mature through D30
     cohort 2026-06-15, 50 installs  — 15 days old, mature through D15
     cohort 2026-06-28, 20 installs  — 2 days old, mature for D0 and D1 only
     plus pings from a cohort of 2026-05-01, which predates the counter

   "today" is 2026-06-30. */
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../master/analytics.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const A = sandbox.window.Analytics;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const near = (a, b, eps = 0.001) => a !== null && Math.abs(a - b) < eps;

/* ------------------------------------------------------------- fixture */

const C1 = '2026-05-31', C2 = '2026-06-15', C3 = '2026-06-28', OLD = '2026-05-01';
const FIRST = '2026-05-31', LAST = '2026-06-30';

const open = {};   // day -> cohort -> count
const sub = {};
const put = (map, day, cohort, n) => { (map[day] = map[day] || {})[cohort] = n; };

// C1: 100 born, then a clean decay we can assert exactly
put(open, C1, C1, 100);
const c1Curve = { 1: 60, 3: 45, 7: 40, 8: 30, 14: 25, 15: 12, 21: 10, 29: 8 };
Object.keys(c1Curve).forEach((n) => put(open, A.addDays(C1, +n), C1, c1Curve[n]));

// C2: 50 born. Mature through D15, and nobody is left by then — a real zero.
put(open, C2, C2, 50);
const c2Curve = { 1: 30, 3: 24, 7: 20, 8: 18, 14: 9 };
Object.keys(c2Curve).forEach((n) => put(open, A.addDays(C2, +n), C2, c2Curve[n]));

// C3: 20 born two days ago, 12 came back on D1
put(open, C3, C3, 20);
put(open, A.addDays(C3, 1), C3, 12);

// installs older than the counter, phoning in on the last day
put(open, LAST, OLD, 7);

// purchases: one inside the trial, one on D15 (the day the trial ends), one late
put(sub, A.addDays(C1, 5), C1, 2);
put(sub, A.addDays(C1, 15), C1, 3);
put(sub, A.addDays(C1, 25), C1, 1);
put(sub, A.addDays(C2, 15), C2, 0);   // deliberately zero, not missing

const shape = (map) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce((a, b) => a + b, 0),
  cohorts: Object.keys(map[day]).map((cohort) => ({ cohort, count: map[day][cohort] })),
}));

const ix = A.index({ open: shape(open), sub: shape(sub) });

/* --------------------------------------------------------------- index */

check('first and last day found', ix.first === FIRST && ix.last === LAST, ix.first + '..' + ix.last);
check('measurable cohorts are the three with a day 0',
  ix.cohorts.join(',') === [C1, C2, C3].join(','), ix.cohorts.join(','));
check('pre-counter installs are tracked separately, not as a cohort',
  ix.preTracking.join(',') === OLD, ix.preTracking.join(','));

/* ----------------------------------------------------------- retention */

const d7 = A.retentionAt(ix, ix.cohorts, 7);
// C1 (40/100) and C2 (20/50) are mature for D7; C3 is not.
check('D7 pools only mature cohorts', d7.kept === 60 && d7.of === 150, JSON.stringify(d7));
check('D7 rate is 40%', near(d7.pct, 40), String(d7.pct));
check('D7 reports the immature cohort it skipped', d7.cohorts === 2 && d7.immature === 1, JSON.stringify(d7));

const d60 = A.retentionAt(ix, ix.cohorts, 60);
check('D60 is unavailable, not zero', d60.available === false && d60.pct === null, JSON.stringify(d60));
// D30 exists for exactly one cohort, and nobody from it came back that day:
// that is a real 0%, and must not be reported as "unavailable".
const d30 = A.retentionAt(ix, ix.cohorts, 30);
check('D30 is available from one cohort and reads 0%',
  d30.available === true && d30.pct === 0 && d30.cohorts === 1, JSON.stringify(d30));

const d1 = A.retentionAt(ix, ix.cohorts, 1);
// every cohort is mature for D1: (60 + 30 + 12) / 170
check('D1 uses all three cohorts', d1.of === 170 && d1.kept === 102, JSON.stringify(d1));
check('D1 rate is 60%', near(d1.pct, 60), String(d1.pct));

// a cohort that IS mature but genuinely had nobody return must read 0, not null
const zero = A.retentionAt(ix, [C1], 20);
check('a mature cohort with no returns is 0%, not unavailable',
  zero.available === true && zero.pct === 0, JSON.stringify(zero));

const c = A.curve(ix, ix.cohorts, 90);
check('the curve stops at the oldest cohort, not at 90', c.length === 31, String(c.length));
check('curve day 0 is always 100%', near(c[0].pct, 100), String(c[0].pct));

/* ------------------------------------------------------------ maturity */

check('maturity is measured to the newest day', A.maturity(ix, C1) === 30, String(A.maturity(ix, C1)));
check('a 2-day-old cohort is not mature for D7', A.isMature(ix, C3, 7) === false);
check('...but is for D1', A.isMature(ix, C3, 1) === true);

/* ------------------------------------------------------------ milestones */

const row = A.milestoneRow(ix, C3, A.MILESTONES);
const unavailable = row.filter((cell) => !cell.available).map((cell) => cell.day);
check('young cohort: only D0/D1 available, rest unavailable',
  unavailable.join(',') === '3,7,14,15,21,30,60,90', unavailable.join(','));
check('unavailable cells carry null, never 0',
  row.filter((x) => !x.available).every((x) => x.pct === null));

/* ---------------------------------------------- weekly cohort grouping */

const weeks = A.weeklyCohorts(ix, ix.cohorts);
check('cohorts group into weeks by Monday', weeks.length === 3, weeks.map((w) => w.key).join(','));
check('a week\'s size is the sum of its days (each install born once)',
  weeks.reduce((a, w) => a + w.size, 0) === 170, String(weeks.reduce((a, w) => a + w.size, 0)));

/* -------------------------------------------------------- trial boundary */

/* ONE boundary, not two. The app used to run a seven-day trial and then a
   separate history wall a week later; it now runs a single fourteen-day trial,
   and the free tier's history clip falls on the same day it ends. A second
   boundary here would draw the same moment twice. */
check('the boundary is the product\'s, not a round number',
  A.BOUNDARIES.trialLastDay === 14 && A.BOUNDARIES.firstPostTrial === 15);
check('the history wall is gone rather than coincident',
  A.BOUNDARIES.firstWallDay === undefined && A.BOUNDARIES.historyLastDay === undefined,
  JSON.stringify(A.BOUNDARIES));

const s = A.survival(ix, ix.cohorts);
// D14->D15 over cohorts mature for D15, both sides on the same installs
check('D14→D15 compares both sides over the same installs',
  s.trialEnd && s.trialEnd.before.available && s.trialEnd.after.available,
  JSON.stringify(s.trialEnd && s.trialEnd.after));
check('D14→D15 change is in percentage points and negative',
  s.trialEnd && s.trialEnd.points < 0, String(s.trialEnd && s.trialEnd.points));
check('there is no second transition to report', s.historyWall === undefined);

const life = A.lifecycleNow(ix, ix.cohorts);
check('trials-started buckets every measurable install exactly once',
  life.inTrial + life.postTrial === 170, JSON.stringify(life));
check('the 2-day-old cohort counts as a trial started', life.inTrial === 20, JSON.stringify(life));

/* The usage-based lifecycle is what the tiles show, because it can see every
   active install — including ones older than the counter, whose cohort size was
   never observed but whose age is exact. The only cohort pinging on LAST is the
   pre-counter one, 7 installs at 60 days old — squarely past the trial. Under
   the old cohort-size lifecycle those 7 were invisible, which is exactly the
   bug: the most established users the app had, counted as nothing. */
const liveNow = A.lifecycleActive(ix, LAST);
check('active lifecycle counts everyone who pinged, not just measurable cohorts',
  liveNow.inTrial + liveNow.postTrial === liveNow.total,
  JSON.stringify(liveNow));
check('a pre-counter install lands in the right stage by its age',
  liveNow.postTrial === 7 && liveNow.total === 7, JSON.stringify(liveNow));
check('...which lifecycleNow alone would have missed',
  A.lifecycleNow(ix, ix.cohorts).postTrial !== liveNow.postTrial);

/* --------------------------------------------------------- monetization */

const ages = A.purchaseAges(ix);
const byKey = {};
ages.buckets.forEach((b) => { byKey[b.key] = b.count; });
check('purchase at D5 lands in the trial bucket', byKey.d0_7 === 2, JSON.stringify(byKey));
check('purchase at D15 gets its own bucket (the day the trial ends)', byKey.d15 === 3, JSON.stringify(byKey));
check('purchase at D25 lands in D22–30', byKey.d22_30 === 1, JSON.stringify(byKey));
check('purchase ages total to every purchase seen', ages.total === 6, String(ages.total));

const conv30 = A.conversion(ix, ix.cohorts, 30);
// only C1 has had 30 days; 6 of its 100 bought within 30 days
check('30-day conversion only counts cohorts that had 30 days',
  conv30.of === 100 && conv30.cohorts === 1 && conv30.immature === 2, JSON.stringify(conv30));
check('30-day conversion is 6%', near(conv30.pct, 6), String(conv30.pct));

/* -------------------------------------------------------- active shape */

const abc = A.activeByCohort(ix, LAST);
check('active-by-cohort counts pre-counter installs', abc.preTracking === 7, JSON.stringify(abc.preTracking));
check('active-by-cohort rows carry the install age',
  abc.rows.every((r) => typeof r.age === 'number'));

/* An install older than the counter still knows its own age — the ping carries
   the install date. What is missing is its cohort's SIZE, so it can be charted
   and aged but never given a retention percentage. Losing the age along with
   the percentage is the bug this pins. */
const oldRow = abc.rows.filter((r) => r.cohort === OLD)[0];
check('a pre-counter install is charted, not dropped', !!oldRow, JSON.stringify(abc.rows.map((r) => r.cohort)));
check('...at its true age', oldRow && oldRow.age === 60, oldRow && String(oldRow.age));
check('...and flagged as unmeasurable', oldRow && oldRow.measurable === false, JSON.stringify(oldRow));
check('measurable cohorts are still marked measurable',
  abc.rows.filter((r) => r.cohort !== OLD).every((r) => r.measurable === true));
check('rows run youngest first', abc.rows.map((r) => r.age).every((a, i, arr) => i === 0 || arr[i - 1] <= a),
  abc.rows.map((r) => r.age).join(','));

const pre = A.preTrackingCohorts(ix);
check('pre-counter cohorts are listed on their own', pre.length === 1 && pre[0].cohort === OLD, JSON.stringify(pre));
check('with age, last-seen and active counts',
  pre[0].age === 60 && pre[0].lastSeen === LAST && pre[0].activeLatest === 7, JSON.stringify(pre[0]));
check('and they never leak into a retention denominator',
  A.retentionAt(ix, ix.cohorts, 1).of === 170);

check('returning excludes installs born that day',
  A.returningOn(ix, C3) === 0 && A.newOn(ix, C3) === 20,
  A.returningOn(ix, C3) + '/' + A.newOn(ix, C3));

// the floor never exceeds the cohort size, and never sums days
const floor = A.peakOver(ix, [C1], C1, LAST);
check('a window floor is a max, not a sum', floor === 100, String(floor));

/* ------------------------------------------------------------- funnel */

const f = A.funnel([
  { impressions: 1000, pageViews: 100, downloads: 10 },
  { impressions: 1000, pageViews: 100, downloads: 30 },
]);
check('funnel rates are computed on the totals',
  near(f.impToPage, 10) && near(f.pageToDownload, 20) && near(f.impToDownload, 2), JSON.stringify(f));
check('funnel of nothing yields null rates, not NaN', A.funnel([]).impToPage === null);

/* ------------------------------------------------------------- events */

const evs = [
  { id: 'a', date: '2026-06-10', category: 'RELEASE', title: 'v1.2' },
  { id: 'b', date: '2026-07-30', category: 'MARKETING', title: 'Meta on' },
];
check('events filter to the window', A.eventsBetween(evs, '2026-06-01', '2026-06-30').length === 1);
check('every category has a colour', Object.keys(A.EVENT_CATEGORIES)
  .every((k) => /^#[0-9a-f]{6}$/i.test(A.EVENT_CATEGORIES[k].color)));

const ba = A.beforeAfter(ix, [], { date: '2026-06-14' }, 7);
check('before/after excludes the event day itself',
  ba.before.to === '2026-06-13' && ba.after.from === '2026-06-15',
  ba.before.to + ' | ' + ba.after.from);
const d7metric = ba.metrics.filter((m) => m.label === 'D7 retention')[0];
check('before/after reports an unavailable retention rather than 0',
  d7metric && (d7metric.available === false || typeof d7metric.delta === 'number'),
  JSON.stringify(d7metric));

/* Money and purchase counts come from the LEDGER, and the subscribe ping keeps
   its own name beside them: the ping fires a launch or two after the
   transaction, so reading it as "purchases" books a shift in the LAG against
   the event. With no ledger passed there is nothing to say, and the rows are
   absent rather than zero. */
const baRow = (b, label) => b.metrics.filter((m) => m.label === label)[0];
check('the ping row is not called "purchases" any more',
  !baRow(ba, 'Purchases') && baRow(ba, 'Subscribe pings'),
  ba.metrics.map((m) => m.label).join(' | '));
check('and with no ledger there is no money row', !baRow(ba, 'Revenue'));
const baSales = A.beforeAfter(ix, [], { date: '2026-06-14' }, 7, {
  '2026-06-12': { sales: 1, revenue: 4.99 },
  '2026-06-16': { sales: 3, revenue: 29.97 },
});
check('the ledger fills the purchase row', baRow(baSales, 'Purchases').before === 1 &&
  baRow(baSales, 'Purchases').after === 3, JSON.stringify(baRow(baSales, 'Purchases')));
check('and the money row, as money', baRow(baSales, 'Revenue').kind === 'money' &&
  Math.abs(baRow(baSales, 'Revenue').delta - 24.98) < 0.001,
  JSON.stringify(baRow(baSales, 'Revenue')));
/* The event's own day is excluded from both windows for the ledger too — it is
   usually half a day of each. */
check('and the event day itself is in neither window',
  A.beforeAfter(ix, [], { date: '2026-06-14' }, 7, { '2026-06-14': { sales: 9, revenue: 90 } })
    .metrics.filter((m) => m.label === 'Purchases')[0].delta === 0);

/* ------------------------------------------------------------- platform */

/* One cohort day now arrives as two rows, one per platform. Everything above
   ran on a fixture with no platform at all, which is the shape the counter
   wrote before the marker existed — that it still indexes is the point. */
const PDAY = '2026-06-30', PC1 = '2026-06-29';
const prow = (day, cohorts) => ({
  day,
  total: cohorts.reduce((a, c) => a + c.count, 0),
  cohorts,
});
const preport = {
  open: [
    prow(PC1, [
      { cohort: PC1, platform: 'I', count: 30 },
      { cohort: PC1, platform: 'A', count: 10 },
    ]),
    prow(PDAY, [
      { cohort: PC1, platform: 'I', count: 12 },
      { cohort: PC1, platform: 'A', count: 3 },
      { cohort: PDAY, platform: 'I', count: 5 },
      { cohort: PDAY, count: 2 },                    // pre-marker build
    ]),
  ],
  sub: [prow(PDAY, [{ cohort: PC1, platform: 'A', count: 1 }])],
};

const pix = A.index(preport);
check('two platform rows for one cohort day are pooled, not overwritten',
  A.cohortSize(pix, PC1) === 40, String(A.cohortSize(pix, PC1)));
check('D1 pools both platforms', near(A.retentionAt(pix, [PC1], 1).pct, 37.5),
  String(A.retentionAt(pix, [PC1], 1).pct));

/* A PLATFORM SLICE IS STRICT. Pick iOS and you get the pings that said iOS:
   12 + 5 on PDAY, and not the 2 that named no store.

   This pooled the unattributed pings into every slice for a while, so that a
   pre-marker build still appeared somewhere rather than in no view at all. It
   was the right trade while unattributed was a small tail and the wrong one
   once it was the majority — at three-quarters unattributed, iOS read 23 and
   Android 29 against a combined 30, and the two numbers that were true (1 and
   7) were invisible behind the shared pool. Nothing is hidden by strictness,
   because COMBINED is the unfiltered index and still counts every ping. */
const pios = A.index(preport, 'ios');
check('the iOS slice is iOS pings and nothing else',
  A.cohortSize(pios, PC1) === 30 && A.activeOn(pios, PDAY) === 17,
  A.cohortSize(pios, PC1) + ' / ' + A.activeOn(pios, PDAY));
check('the iOS slice retains at 40%', near(A.retentionAt(pios, [PC1], 1).pct, 40),
  String(A.retentionAt(pios, [PC1], 1).pct));
check('a slice still reports what it left out',
  A.unattributedOn(pios, PDAY) === 2, String(A.unattributedOn(pios, PDAY)));
check('an unfiltered index leaves nothing out, so it has no unattributed count',
  A.unattributedOn(pix, PDAY) === 0, String(A.unattributedOn(pix, PDAY)));

const pand = A.index(preport, 'android');
check('the Android slice is Android pings and nothing else',
  A.cohortSize(pand, PC1) === 10 && A.activeOn(pand, PDAY) === 3,
  A.cohortSize(pand, PC1) + ' / ' + A.activeOn(pand, PDAY));

/* The property that makes the page checkable, and the whole reason for the
   change: the three buckets ADD UP to the combined total. They used to sum
   past it, by exactly the unattributed count, because that count was in both. */
check('the two slices plus the unattributed pings equal the combined total',
  A.activeOn(pios, PDAY) + A.activeOn(pand, PDAY) + A.unattributedOn(pios, PDAY)
    === A.activeOn(pix, PDAY),
  A.activeOn(pios, PDAY) + ' + ' + A.activeOn(pand, PDAY) + ' + ' +
    A.unattributedOn(pios, PDAY) + ' vs ' + A.activeOn(pix, PDAY));
check('and neither slice can exceed the combined total',
  A.activeOn(pios, PDAY) <= A.activeOn(pix, PDAY) && A.activeOn(pand, PDAY) <= A.activeOn(pix, PDAY));
/* Both slices report the same figure for what neither of them holds. */
check('what was left out is the same number whichever slice you are in',
  A.unattributedOn(pios, PDAY) === A.unattributedOn(pand, PDAY),
  A.unattributedOn(pios, PDAY) + ' vs ' + A.unattributedOn(pand, PDAY));
check('a filtered index says what it is a slice of', pand.platform === 'android', pand.platform);

check('the split is counted before the filter, so a slice can still show it',
  JSON.stringify(A.platformsOn(pand, PDAY)) === JSON.stringify({ I: 17, A: 3, U: 2 }),
  JSON.stringify(A.platformsOn(pand, PDAY)));
check('the split still books unattributed pings under U, never under a store',
  pix.platformSplit.open.U === 2 && pix.platformSplit.sub.A === 1,
  JSON.stringify(pix.platformSplit));
check('the unfiltered index is unchanged by the split',
  pix.platform === 'all' && A.activeOn(pix, PDAY) === 22, String(A.activeOn(pix, PDAY)));

/* ------------------------------------------------------- purchase rows

   The per-purchase list, which exists because every aggregate on the App usage
   view hides the two things you need at three purchases: which store each one
   was on, and whether two of them are the same ping counted twice. */

const R0 = '2026-08-11', R1 = '2026-08-12', R2 = '2026-08-13';
const rrow = (day, cohorts) => ({
  day,
  total: cohorts.reduce((a, c) => a + c.count, 0),
  cohorts: cohorts.map((c) => Object.assign({ key: c.cohort.replace(/^20(\d\d)-(\d\d)-(\d\d)$/, '$2$3$1') + (c.platform || 'U') }, c)),
});

/* Two buyers who installed on different days, plus one cohort that appears on
   two ADJACENT days — the retry fingerprint. */
const rix = A.index({
  open: [],
  sub: [
    rrow(R0, [{ cohort: '2026-07-30', platform: 'A', count: 1 }]),
    rrow(R1, [{ cohort: '2026-07-30', platform: 'A', count: 1 },
              { cohort: '2026-08-01', platform: 'U', count: 1 }]),
    rrow(R2, [{ cohort: '2026-06-01', platform: 'I', count: 2 }]),
  ],
});
const prows = A.purchaseRows(rix);

check('every purchase is a row of its own', prows.length === 4, String(prows.length));
check('newest arrival first, so the list reads as what just happened',
  prows[0].day === R2 && prows[prows.length - 1].day === R0,
  prows.map((r) => r.day).join(','));
check('a row carries the store the aggregate sums away',
  prows[0].platform === 'I' && prows.some((r) => r.platform === 'A'),
  prows.map((r) => r.platform).join(','));
check('a ping with no marker is "U", not folded into a store',
  prows.filter((r) => r.platform === 'U').length === 1,
  prows.map((r) => r.platform).join(','));
check('age is the exact gap between installing and paying',
  prows[0].age === A.ageDays('2026-06-01', R2), String(prows[0].age));
check('a count above one on a single row is kept, not split into rows',
  prows[0].count === 2, String(prows[0].count));

/* The suspicion, and — more importantly — what it must NOT accuse. */
const flagged = A.suspectRetries(prows);
check('the same cohort on two adjacent days is flagged as a possible retry',
  !!flagged[R0 + '|' + prows.find((r) => r.day === R0).key] &&
  !!flagged[R1 + '|' + prows.find((r) => r.day === R1 && r.platform === 'A').key],
  JSON.stringify(Object.keys(flagged)));
check('and only those two rows are flagged — a shared cohort alone is ordinary',
  Object.keys(flagged).length === 2, JSON.stringify(Object.keys(flagged)));

/* Two buyers born the same day who paid a fortnight apart are not a retry, and
   flagging them would tell the reader a real sale might not have happened. */
const far = A.purchaseRows(A.index({
  open: [],
  sub: [
    rrow('2026-08-01', [{ cohort: '2026-07-01', platform: 'I', count: 1 }]),
    rrow('2026-08-15', [{ cohort: '2026-07-01', platform: 'I', count: 1 }]),
  ],
}));
check('the same cohort far apart is never flagged',
  Object.keys(A.suspectRetries(far)).length === 0,
  JSON.stringify(A.suspectRetries(far)));

check('a zero count is not a purchase', A.purchaseRows(A.index({
  open: [], sub: [rrow('2026-08-01', [{ cohort: '2026-07-01', platform: 'I', count: 0 }])],
})).length === 0);
check('no subscribe rows is an empty list, not a throw',
  A.purchaseRows(A.index({ open: [], sub: [] })).length === 0);

/* The list is what the platform tiles are: always the whole picture, because
   the store is one of its own columns. */
const rslice = A.index({
  open: [],
  sub: [rrow(R1, [{ cohort: '2026-07-30', platform: 'A', count: 1 },
                  { cohort: '2026-08-01', platform: 'I', count: 1 }])],
}, 'ios');
check('the list ignores the platform filter, since store is a column of it',
  A.purchaseRows(rslice).length === 2, String(A.purchaseRows(rslice).length));

/* ---------------------------------------------------------- activation */

/* Activation is the one counter whose rows really do count people, since the
   app sends it once per install ever. The fixture:

     C1 (100 installs)  60 activate on day 0, 10 more on D3, 5 more on D20
     C2 (50 installs)   20 activate on day 0
     C3 (20 installs)   8 activate on day 0

   so day 0 is 88/170, by D7 is 98/170, and by D30 only C1 is old enough
   (75/100). Methods are counted across every row. */
const act = {};
const putM = (day, cohort, methods) => { (act[day] = act[day] || {})[cohort] = methods; };
putM(C1, C1, { B: 40, F: 15, W: 5 });
putM(A.addDays(C1, 3), C1, { F: 10 });
putM(A.addDays(C1, 20), C1, { W: 5 });
putM(C2, C2, { B: 12, F: 8 });
putM(C3, C3, { F: 8 });

const shapeAct = (map) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0),
  cohorts: Object.keys(map[day]).reduce((rows, cohort) => rows.concat(
    Object.keys(map[day][cohort]).map((method) => ({
      cohort, platform: 'I', method, count: map[day][cohort][method],
    })),
  ), []),
}));

const aix = A.index({ open: shape(open), sub: shape(sub), act: shapeAct(act) });

const a0 = A.activation(aix, aix.cohorts, 0);
check('activation on day 0 pools every cohort', a0.kept === 88 && a0.of === 170, JSON.stringify(a0));
check('and reads 51.76%', near(a0.pct, (88 / 170) * 100), String(a0.pct));

const a7 = A.activation(aix, aix.cohorts, 7);
// C3 is two days old, so it cannot have had seven days to activate.
check('D7 activation excludes the cohort too young for it',
  a7.of === 150 && a7.immature === 1, JSON.stringify(a7));
check('D7 activation counts C1\'s D3 stragglers but not its D20 ones',
  a7.kept === 70 + 20, JSON.stringify(a7));

const a30 = A.activation(aix, aix.cohorts, 30);
check('D30 activation is C1 alone, all 75 of them',
  a30.of === 100 && a30.kept === 75 && a30.cohorts === 1, JSON.stringify(a30));

check('activations on a day are counted whole', A.activationsOn(aix, C1) === 60, String(A.activationsOn(aix, C1)));
check('a day with no activation ping is 0, never a throw',
  A.activationsOn(aix, A.addDays(C1, 1)) === 0);

const split = A.methodsOver(aix, A.range(FIRST, LAST));
check('the method split pools every row',
  split.B === 52 && split.F === 41 && split.W === 10, JSON.stringify(split));

/* A platform slice is strict for activations exactly as it is for opens: the
   whole fixture says iOS, so Android sees none of it. */
const androidAct = A.index({ open: shape(open), sub: shape(sub), act: shapeAct(act) }, 'android');
check('an Android slice keeps none of an all-iOS activation set',
  A.activationsOn(androidAct, C1) === 0 && A.activation(androidAct, androidAct.cohorts, 0).kept === 0);

/* Day 0 is where a working onboarding puts nearly everything, so the age
   buckets have to separate it from the recoveries that follow. */
const actAges = A.activationAges(aix);
check('activation ages total every activation', actAges.total === 103, JSON.stringify(actAges.total));
check('and the first bucket holds the same-day ones plus C1\'s D3',
  actAges.buckets[0].count === 98, JSON.stringify(actAges.buckets));

/* A report with no `act` key at all — every dashboard cached before this
   shipped — must read as "no activations", never as a crash. */
const legacy = A.index({ open: shape(open), sub: shape(sub) });
check('a report with no activation rows is empty, not broken',
  A.activationsOn(legacy, C1) === 0 && A.activation(legacy, legacy.cohorts, 0).kept === 0);

/* ------------------------------------------------------------ measuring

   The reading counter (`hrv`), which shipped LATER than the other three. Its
   whole value is that it is the open counter's twin — both one per install per
   Eastern day — so their ratio is a share of people. Its whole risk is that the
   days before it existed look exactly like days on which nobody measured. */

const HRV_FIRST = '2026-06-16';
const hrv = {};
put(hrv, HRV_FIRST, C2, 9);                 // C2's D1: 9 of 50
put(hrv, '2026-06-21', C1, 4);              // C1's D21: 4 of 100
put(hrv, '2026-06-22', C2, 6);              // C2's D7: 6 of 50
put(hrv, C3, C3, 8);                        // C3's D0: 8 of 20
put(hrv, '2026-06-29', C3, 5);              // C3's D1: 5 of 20

const mix = A.index({ open: shape(open), sub: shape(sub), hrv: shape(hrv) });

check('the reading counter\'s own start day is found', mix.hrvFirst === HRV_FIRST, String(mix.hrvFirst));
check('a day before it is unknown, a day after it is known',
  A.hrvKnown(mix, '2026-06-15') === false && A.hrvKnown(mix, HRV_FIRST) === true);

/* The rule the whole module turns on: a busy day before the counter shipped is
   NOT a day on which nobody measured. C2's own day 0 had 50 installs on the
   app and no reading rows, and reporting that as 0% would be a claim about
   people made out of a deploy date. */
check('a pre-counter day with real actives reads null, never 0%',
  A.measureShare(mix, C2) === null && A.activeOn(mix, C2) === 62,
  String(A.activeOn(mix, C2)));
check('a covered day reports the share of the people who were there',
  near(A.measureShare(mix, '2026-06-21'), 40), String(A.measureShare(mix, '2026-06-21')));
check('a covered day on which nobody measured is a real 0%',
  A.measureShare(mix, '2026-06-18') === 0, String(A.measureShare(mix, '2026-06-18')));

const rate = A.measureRate(mix, A.range(FIRST, LAST));
check('the window rate pools install-days on both sides',
  rate.readings === 32 && rate.active === 158, JSON.stringify(rate));
check('and leaves the pre-counter days out of both, counting them',
  rate.days === 15 && rate.blind === 16, JSON.stringify(rate));
check('the pooled rate is readings over install-days', near(rate.pct, (32 / 158) * 100), String(rate.pct));

/* A share above 100% is information, not a bug: a reading saved either side of
   midnight Eastern, or on a launch whose open ping was lost offline, lands in a
   day without its open. Clamping it would hide the only signal that says the
   two counters have drifted. */
const drifted = A.index({
  open: shape({ [C3]: { [C3]: 4 } }),
  hrv: shape({ [C3]: { [C3]: 5 } }),
});
check('a drifted day is reported above 100%, not clamped',
  near(A.measureShare(drifted, C3), 125), String(A.measureShare(drifted, C3)));

/* Measuring at day N: retention's twin, with one extra exclusion nothing else
   here has — a cohort whose day N fell before the counter shipped is neither
   churned nor too young. */
const m0 = A.measuringAt(mix, mix.cohorts, 0);
check('D0 measuring counts only the cohort the counter could see',
  m0.kept === 8 && m0.of === 20 && m0.cohorts === 1 && m0.blind === 2, JSON.stringify(m0));
check('and reads 40%', near(m0.pct, 40), String(m0.pct));

const m1 = A.measuringAt(mix, mix.cohorts, 1);
check('D1 measuring pools the two covered cohorts',
  m1.kept === 14 && m1.of === 70 && m1.cohorts === 2 && m1.blind === 1, JSON.stringify(m1));

const m7 = A.measuringAt(mix, mix.cohorts, 7);
check('D7 measuring separates too-young from before-the-counter',
  m7.kept === 6 && m7.of === 50 && m7.immature === 1 && m7.blind === 1, JSON.stringify(m7));

const m21 = A.measuringAt(mix, mix.cohorts, 21);
check('D21 measuring is C1 alone', m21.kept === 4 && m21.of === 100 && m21.cohorts === 1, JSON.stringify(m21));

const mCurve = A.measuringCurve(mix, mix.cohorts, 60);
check('the habit curve starts at D0 and stops where nothing is knowable',
  mCurve.length > 0 && near(mCurve[0].pct, 40) && mCurve.length <= 31, String(mCurve.length));

/* The counter's start day is read UNFILTERED. Android shipped the route in its
   own release, so dating it from a platform slice would date it from the wrong
   build — and the slice itself is still strict. */
const iosMix = A.index({ open: shape(open), sub: shape(sub), hrv: shape(hrv) }, 'ios');
check('hrvFirst survives a platform slice that keeps none of the rows',
  iosMix.hrvFirst === HRV_FIRST && A.readingsOn(iosMix, '2026-06-21') === 0);

/* A report cached before the reading counter existed must read as "no readings
   yet", never as a crash and never as a wall of zero percents. */
check('a report with no hrv rows knows nothing rather than claiming zero',
  legacy.hrvFirst === null && A.hrvKnown(legacy, LAST) === false &&
  A.measureShare(legacy, LAST) === null && A.measureRate(legacy, [LAST]).available === false);

/* --------------------------------------------- what readings are taken with

   The daily counter carries the same sensor letter the activation route does.
   Two rules the UI leans on: the letter splits the KEY and never the count (so
   a day's readings still sum to what they always summed to), and a row written
   before the letter shipped is "no sensor", which is NOT the same as a day the
   counter itself was not running. */

const sensed = A.index({
  hrv: [
    { day: C3, total: 9, cohorts: [
      { cohort: C3, platform: 'I', method: 'W', count: 3 },
      { cohort: C3, platform: 'I', method: 'G', count: 2 },
      { cohort: C3, platform: 'A', method: 'F', count: 1 },
      // the same cohort+platform again with no letter: a build that predates it
      { cohort: C3, platform: 'I', method: null, count: 3 },
    ] },
    { day: A.addDays(C3, 1), total: 2, cohorts: [
      { cohort: C3, platform: 'I', method: 'B', count: 2 },
    ] },
  ],
});

check('the sensor letter does not change what a day counts',
  A.readingsOn(sensed, C3) === 9, String(A.readingsOn(sensed, C3)));
check('a day splits by sensor, with the letterless rows disclosed as unknown',
  JSON.stringify(A.hrvMethodsOn(sensed, C3)) === JSON.stringify({ W: 3, G: 2, F: 1, '?': 3 }),
  JSON.stringify(A.hrvMethodsOn(sensed, C3)));
check('Garmin is a sensor of its own',
  A.methodName('G') === 'Garmin watch' && A.METHOD_ORDER.indexOf('G') > -1);
check('the split pools over days',
  A.hrvMethodsOver(sensed, [C3, A.addDays(C3, 1)]).B === 2);
check('a day that named a sensor is separable from one that only has unknowns',
  A.hrvMethodKnown(sensed, C3) === true &&
  A.hrvMethodKnown(A.index({ hrv: [{ day: C3, total: 2, cohorts: [
    { cohort: C3, platform: 'I', method: null, count: 2 }] }] }), C3) === false);
check('a report whose hrv rows predate the letter still knows the counter ran',
  A.hrvKnown(sensed, C3) === true);

/* -------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
