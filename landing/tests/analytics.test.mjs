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

// purchases: one inside the trial, one on D15 (the wall), one late
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
  unavailable.join(',') === '3,7,8,14,15,21,30,60,90', unavailable.join(','));
check('unavailable cells carry null, never 0',
  row.filter((x) => !x.available).every((x) => x.pct === null));

/* ---------------------------------------------- weekly cohort grouping */

const weeks = A.weeklyCohorts(ix, ix.cohorts);
check('cohorts group into weeks by Monday', weeks.length === 3, weeks.map((w) => w.key).join(','));
check('a week\'s size is the sum of its days (each install born once)',
  weeks.reduce((a, w) => a + w.size, 0) === 170, String(weeks.reduce((a, w) => a + w.size, 0)));

/* ------------------------------------------------- trial / wall boundaries */

check('boundaries are the product\'s, not round numbers',
  A.BOUNDARIES.trialLastDay === 7 && A.BOUNDARIES.firstPostTrial === 8 &&
  A.BOUNDARIES.historyLastDay === 14 && A.BOUNDARIES.firstWallDay === 15);

const s = A.survival(ix, ix.cohorts);
// D7->D8 over cohorts mature for D8 (C1, C2): (40+20)/150 = 40% -> (30+18)/150 = 32%
check('D7→D8 compares both sides over the same installs',
  near(s.trialEnd.before.pct, 40) && near(s.trialEnd.after.pct, 32), JSON.stringify(s.trialEnd && s.trialEnd.after));
check('D7→D8 change is in percentage points', near(s.trialEnd.points, -8), String(s.trialEnd && s.trialEnd.points));
// D14->D15 is only C1 (C2 is 15 days old at LAST, so D15 exists for it too)
check('D14→D15 is available and negative', s.historyWall && s.historyWall.points < 0,
  JSON.stringify(s.historyWall && s.historyWall.points));

const life = A.lifecycleNow(ix, ix.cohorts);
check('trials-started buckets every measurable install exactly once',
  life.inTrial + life.postTrial + life.pastWall === 170, JSON.stringify(life));
check('the 2-day-old cohort counts as a trial started', life.inTrial === 20, JSON.stringify(life));

/* The usage-based lifecycle is what the tiles show, because it can see every
   active install — including ones older than the counter, whose cohort size was
   never observed but whose age is exact. The only cohort pinging on LAST is the
   pre-counter one, 7 installs at 60 days old — squarely past the wall. Under
   the old cohort-size lifecycle those 7 were invisible, which is exactly the
   bug: the most established users the app had, counted as nothing. */
const liveNow = A.lifecycleActive(ix, LAST);
check('active lifecycle counts everyone who pinged, not just measurable cohorts',
  liveNow.inTrial + liveNow.postTrial + liveNow.pastWall === liveNow.total,
  JSON.stringify(liveNow));
check('a pre-counter install lands in the right stage by its age',
  liveNow.pastWall === 7 && liveNow.total === 7, JSON.stringify(liveNow));
check('...which lifecycleNow alone would have missed',
  A.lifecycleNow(ix, ix.cohorts).pastWall !== liveNow.pastWall);

/* --------------------------------------------------------- monetization */

const ages = A.purchaseAges(ix);
const byKey = {};
ages.buckets.forEach((b) => { byKey[b.key] = b.count; });
check('purchase at D5 lands in the trial bucket', byKey.d0_7 === 2, JSON.stringify(byKey));
check('purchase at D15 gets its own bucket (the wall)', byKey.d15 === 3, JSON.stringify(byKey));
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

/* A platform slice keeps its own store's counts AND the pings that named no
   store at all: 12 + 5 iOS on PDAY, plus the 2 pre-marker. Excluding those 2
   would put them in NO view, which is how a dashboard whose whole history
   predates the marker came to read as empty under a filter. */
const pios = A.index(preport, 'ios');
check('the iOS slice keeps iOS counts plus the unattributed ones',
  A.cohortSize(pios, PC1) === 30 && A.activeOn(pios, PDAY) === 19,
  A.cohortSize(pios, PC1) + ' / ' + A.activeOn(pios, PDAY));
check('the iOS slice retains at 40%', near(A.retentionAt(pios, [PC1], 1).pct, 40),
  String(A.retentionAt(pios, [PC1], 1).pct));
check('a slice reports how much of its count named no store',
  A.unattributedOn(pios, PDAY) === 2, String(A.unattributedOn(pios, PDAY)));
check('an unfiltered index attributes nothing, so it has no unattributed count',
  A.unattributedOn(pix, PDAY) === 0, String(A.unattributedOn(pix, PDAY)));

const pand = A.index(preport, 'android');
check('the Android slice keeps Android counts plus the same unattributed ones',
  A.cohortSize(pand, PC1) === 10 && A.activeOn(pand, PDAY) === 5,
  A.cohortSize(pand, PC1) + ' / ' + A.activeOn(pand, PDAY));
/* The deliberate consequence, asserted so nobody "fixes" it silently: the two
   slices overlap by the unattributed pings, so they sum past the day's total.
   The platform tile is what discloses it. */
check('the slices overlap by exactly the unattributed count',
  A.activeOn(pios, PDAY) + A.activeOn(pand, PDAY) - A.unattributedOn(pios, PDAY)
    === A.activeOn(pix, PDAY),
  A.activeOn(pios, PDAY) + ' + ' + A.activeOn(pand, PDAY) + ' vs ' + A.activeOn(pix, PDAY));
check('a filtered index says what it is a slice of', pand.platform === 'android', pand.platform);

check('the split is counted before the filter, so a slice can still show it',
  JSON.stringify(A.platformsOn(pand, PDAY)) === JSON.stringify({ I: 17, A: 3, U: 2 }),
  JSON.stringify(A.platformsOn(pand, PDAY)));
check('the split still books unattributed pings under U, never under a store',
  pix.platformSplit.open.U === 2 && pix.platformSplit.sub.A === 1,
  JSON.stringify(pix.platformSplit));
check('the unfiltered index is unchanged by the split',
  pix.platform === 'all' && A.activeOn(pix, PDAY) === 22, String(A.activeOn(pix, PDAY)));

/* -------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
