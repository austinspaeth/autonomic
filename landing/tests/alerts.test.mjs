/* Unit tests for landing/master/alerts.js — the arithmetic behind the live
   alerts. No DOM, no audio: the module is loaded with a `window` shim, which
   also pins the rule that nothing in it may touch `document` at load time.

   What is being protected here is the honesty of a celebration. A fanfare for a
   sale that did not happen is worse than a missed one, so every case below is a
   way the counter can move WITHOUT anything having been bought, downloaded or
   opened. */
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../master/alerts.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const AL = sandbox.window.Alerts;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

/* A report is `{ open: [{ day, total, cohorts: [{cohort, platform, count}] }], sub: [...] }`.
   `row` keeps the fixtures below readable. */
const row = (day, cohorts) => ({
  day,
  total: cohorts.reduce((a, c) => a + c[2], 0),
  cohorts: cohorts.map(([cohort, platform, count]) => ({ cohort, platform, count }))
});

const D1 = '2026-08-12', D2 = '2026-08-13', D3 = '2026-08-14';

/* Day 1: 3 fresh iOS installs, 2 fresh Android, plus 4 returning from an older
   cohort. Day 2: 1 fresh iOS, 6 returning. One sale on day 2, from iOS. */
const BASE = {
  open: [
    row(D1, [[D1, 'I', 3], [D1, 'A', 2], ['2026-08-01', 'I', 4]]),
    row(D2, [[D2, 'I', 1], ['2026-08-01', 'I', 4], [D1, 'A', 2]])
  ],
  sub: [row(D2, [[D1, 'I', 1]])]
};

/* --------------------------------------------------------------- snapshot */

const s0 = AL.snapshot(BASE);

check('opens count every ping, fresh and returning alike',
  s0.opens === 16, String(s0.opens));
check('a download is a first run: cohort key === the day it arrived',
  s0.downloads === 6, String(s0.downloads));
check('first runs carry their own store, not the whole day\'s split',
  JSON.stringify(s0.downloadsBy) === JSON.stringify({ I: 4, A: 2 }),
  JSON.stringify(s0.downloadsBy));
check('a sale is a subscribe ping, and its store comes off the same key',
  s0.sales === 1 && s0.salesBy.I === 1, JSON.stringify(s0.salesBy));
check('an empty report is a zeroed snapshot, not a crash',
  AL.snapshot(null).opens === 0 && AL.snapshot({}).downloads === 0);

/* Returning traffic is the case most likely to be mistaken for an install:
   day 2 above carries 4 + 2 returning pings and exactly one new one. */
check('returning installs are never counted as downloads',
  s0.downloads === 6 && s0.opens - s0.downloads === 10, String(s0.opens - s0.downloads));

/* A build that predates the platform marker sends no letter. It is an install
   whose STORE we failed to record, not an install on a third platform. */
const noMarker = AL.snapshot({ open: [row(D3, [[D3, undefined, 2]])], sub: [] });
check('a ping with no platform reads as the unknown store, not as iOS',
  noMarker.downloadsBy.U === 2 && !noMarker.downloadsBy.I,
  JSON.stringify(noMarker.downloadsBy));
check('the unknown store is named in copy rather than folded into a real one',
  AL.storeLine({ I: 2, U: 1 }) === '2 on iOS · 1 on unknown store',
  AL.storeLine({ I: 2, U: 1 }));
check('the store line keeps a fixed order however the map was built',
  AL.storeLine({ A: 1, I: 3 }) === '3 on iOS · 1 on Android',
  AL.storeLine({ A: 1, I: 3 }));

/* ------------------------------------------------------------------- diff */

/* A quiet ten minutes: the same report comes back. */
check('an unchanged report is not news',
  AL.diff(s0, AL.snapshot(BASE)).any === false);

/* Two more opens on day 2, one of them a brand new Android install, and a
   second sale — this time from Android. */
const NEXT = {
  open: [
    BASE.open[0],
    row(D2, [[D2, 'I', 1], [D2, 'A', 1], ['2026-08-01', 'I', 5], [D1, 'A', 2]])
  ],
  sub: [row(D2, [[D1, 'I', 1], [D2, 'A', 1]])]
};
const d = AL.diff(s0, AL.snapshot(NEXT));
check('a rise in opens is reported as visitors', d.visitors === 2, String(d.visitors));
check('only the NEW first run counts as a download', d.downloads === 1, String(d.downloads));
check('the download names the store it came from',
  JSON.stringify(d.downloadsBy) === JSON.stringify({ A: 1 }), JSON.stringify(d.downloadsBy));
check('the sale names the store that paid, not the one that already had',
  d.sales === 1 && JSON.stringify(d.salesBy) === JSON.stringify({ A: 1 }),
  JSON.stringify(d.salesBy));

/* The report is a sliding 400-day window, so the oldest day leaves it as the
   calendar turns and every total can fall without anything having happened. */
const SHRUNK = { open: [BASE.open[1]], sub: [] };
const drop = AL.diff(s0, AL.snapshot(SHRUNK));
check('a falling total is never announced as a negative event',
  drop.any === false && drop.visitors === 0 && drop.sales === 0,
  JSON.stringify(drop));

/* A day that gains returning pings only. */
const RETURNS = {
  open: [BASE.open[0], row(D2, [[D2, 'I', 1], ['2026-08-01', 'I', 9], [D1, 'A', 2]])],
  sub: BASE.sub
};
const back = AL.diff(s0, AL.snapshot(RETURNS));
check('returning traffic pings as visitors and nothing else',
  back.visitors === 5 && back.downloads === 0 && back.sales === 0, JSON.stringify(back));
/* And is counted in its OWN right, which is what carries the platform: the old
   `visitors - downloads` subtraction agrees on the number and throws the store
   away, and a store is half of what makes a return readable. */
check('a return is counted as a return, not inferred from a subtraction',
  back.returns === 5, String(back.returns));
/* All five came back on iOS: the Android cohort in that row is unchanged from
   the baseline, so it is not a rise and is not news. */
check('and keeps the store it came back on',
  JSON.stringify(back.returnsBy) === JSON.stringify({ I: 5 }), JSON.stringify(back.returnsBy));
check('which reads as a store line',
  AL.storeLine(back.returnsBy) === '5 on iOS', AL.storeLine(back.returnsBy));
/* A first run is an open too, and must never be counted twice. */
check('a fresh install is a download and never also a return',
  AL.snapshot(RETURNS).days[D2].returns === 11 && AL.snapshot(RETURNS).days[D2].downloads === 1,
  JSON.stringify(AL.snapshot(RETURNS).days[D2]));

/* A baseline stored before returns were counted separately. The count survives
   as the subtraction it always was; only the store split is unavailable, and an
   empty map renders as no store line rather than as a wrong one. */
const noRet = AL.snapshot(BASE);
delete noRet.returns;
Object.keys(noRet.days).forEach((k) => { delete noRet.days[k].returns; delete noRet.days[k].returnsBy; });
const dNoRet = AL.diff(noRet, AL.snapshot(RETURNS));
check('an older baseline still reports the returns it can infer',
  dNoRet.returns === dNoRet.visitors - dNoRet.downloads && dNoRet.returns > 0, JSON.stringify(dNoRet));
check('but claims no store for them',
  AL.storeLine(dNoRet.returnsBy) === '', JSON.stringify(dNoRet.returnsBy));

/* -------------------------------------------------------------- baseline */

/* `sync` is the shell's entry point, but its first-call rule is arithmetic:
   with no previous snapshot there is no delta, so a sign-in cannot open with a
   fanfare for a month of history. It reaches no DOM on that path. */
check('the first report of a session seeds the baseline instead of alerting',
  AL.sync(BASE) === null);
check('the second report is compared against the first',
  (() => { const r = AL.sync(NEXT); return !!r && r.sales === 1 && r.downloads === 1; })());
AL.reset();
check('reset drops the baseline, so the next report seeds again',
  AL.sync(NEXT) === null);

/* ---------------------------------------------------------- activations */

/* An activation row carries a sensor letter as well as a store one. */
const arow = (day, cohorts) => ({
  day,
  total: cohorts.reduce((a, c) => a + c[3], 0),
  cohorts: cohorts.map(([cohort, platform, method, count]) => ({ cohort, platform, method, count }))
});

const ACT_BASE = Object.assign({}, BASE, {
  act: [
    arow(D1, [[D1, 'I', 'B', 2], [D1, 'A', 'F', 1]]),
    arow(D2, [[D2, 'I', 'W', 1]])
  ]
});

const a0 = AL.snapshot(ACT_BASE);
check('activations are counted whole', a0.activations === 4, String(a0.activations));
check('and split by SENSOR, not by store',
  JSON.stringify(a0.activationsBy) === JSON.stringify({ B: 2, F: 1, W: 1 }),
  JSON.stringify(a0.activationsBy));
check('a report with no act rows has zero activations, not undefined',
  AL.snapshot(BASE).activations === 0 && JSON.stringify(AL.snapshot(BASE).activationsBy) === '{}');
check('an unreadable sensor letter is still an activation',
  AL.snapshot({ open: [], sub: [], act: [arow(D1, [[D1, 'I', 'Z', 3]])] }).activationsBy['?'] === 3);

const ACT_MORE = Object.assign({}, BASE, {
  act: ACT_BASE.act.concat([arow(D3, [[D1, 'I', 'F', 2]])])
});
const dAct = AL.diff(a0, AL.snapshot(ACT_MORE));
check('a new activation day is news', dAct.activations === 2, String(dAct.activations));
check('and names the sensor it used', AL.sensorLine(dAct.activationsBy) === '2 phone camera',
  AL.sensorLine(dAct.activationsBy));
check('activations alone are enough to be an event', dAct.any === true);

/* The same clamp every other counter obeys: the report is a sliding window, so
   a day dropping off the back is not a fall. */
check('a lost activation day is never a negative',
  AL.diff(a0, AL.snapshot(BASE)).activations === 0);

/* THE DEPLOY CASE. A baseline stored by the previous version has no
   `activations` at all, and every day in it would otherwise read as a rise
   from zero — announcing the whole back catalogue of first readings as news on
   the first refresh after this shipped. */
const legacyBase = AL.snapshot(BASE);
delete legacyBase.activations;
delete legacyBase.activationsBy;
Object.keys(legacyBase.days).forEach((k) => {
  delete legacyBase.days[k].activations;
  delete legacyBase.days[k].activationsBy;
});
const dLegacy = AL.diff(legacyBase, a0);
check('a baseline that predates the counter announces no activations',
  dLegacy.activations === 0, String(dLegacy.activations));
check('and does not become an event on their account alone',
  dLegacy.any === false, JSON.stringify(dLegacy));

/* Once the baseline knows about them, the next arrival is news as normal. */
check('the baseline written in its place does see the next one',
  AL.diff(a0, AL.snapshot(ACT_MORE)).activations === 2);

/* ------------------------------------------------------------- readings

   The daily counter: not a first reading, a reading. It fires again tomorrow,
   so a row counts install-DAYS, and its sensor letter names each install's
   first reading of that day. Everything the activation counter learned applies
   again, including the deploy case — and it needs its OWN gate, because the two
   counters shipped on different days and one flag cannot answer for both. */

const HRV_BASE = Object.assign({}, ACT_BASE, {
  hrv: [
    arow(D1, [[D1, 'I', 'G', 2], [D1, 'A', 'F', 1]]),
    arow(D2, [[D1, 'I', 'B', 4]])
  ]
});

const h0 = AL.snapshot(HRV_BASE);
check('readings are counted whole', h0.readings === 7, String(h0.readings));
check('and split by sensor, Garmin included',
  JSON.stringify(h0.readingsBy) === JSON.stringify({ G: 2, F: 1, B: 4 }),
  JSON.stringify(h0.readingsBy));
check('a report with no hrv rows has zero readings, not undefined',
  AL.snapshot(BASE).readings === 0 && JSON.stringify(AL.snapshot(BASE).readingsBy) === '{}');
check('a reading from a build that predates the sensor letter still counts',
  AL.snapshot({ open: [], sub: [], hrv: [arow(D1, [[D1, 'I', null, 3]])] }).readingsBy['?'] === 3);

const HRV_MORE = Object.assign({}, HRV_BASE, {
  hrv: HRV_BASE.hrv.concat([arow(D3, [[D1, 'I', 'W', 3]])])
});
const dHrv = AL.diff(h0, AL.snapshot(HRV_MORE));
check('a new reading day is news', dHrv.readings === 3, String(dHrv.readings));
check('and names the sensor', AL.sensorLine(dHrv.readingsBy) === '3 Apple Watch',
  AL.sensorLine(dHrv.readingsBy));
check('readings alone are enough to be an event', dHrv.any === true);
check('a lost reading day is never a negative',
  AL.diff(h0, AL.snapshot(ACT_BASE)).readings === 0);

/* The deploy case, one counter down: a baseline that knows about activations
   and not about readings must stay silent on readings and keep announcing
   activations, which a single shared flag could not do. */
const halfLegacy = AL.snapshot(ACT_BASE);
delete halfLegacy.readings;
delete halfLegacy.readingsBy;
Object.keys(halfLegacy.days).forEach((k) => {
  delete halfLegacy.days[k].readings;
  delete halfLegacy.days[k].readingsBy;
});
const HALF_NEXT = Object.assign({}, HRV_MORE, { act: ACT_MORE.act });
const dHalf = AL.diff(halfLegacy, AL.snapshot(HALF_NEXT));
check('a baseline that predates the reading counter announces no readings',
  dHalf.readings === 0, String(dHalf.readings));
check('and still hears the counter it does know about',
  dHalf.activations === 2, JSON.stringify(dHalf));

/* ------------------------------------------------------ install age

   Every announcement says how old the installs behind it are. The age is
   measured from the cohort (install) day to the day the ping ARRIVED. */

/* The map is keyed per INSTALL — cohort, store, tier, sensor — because that is
   what a card draws one row per. A cohort that pinged from two stores is two
   entries here and two rows on the card; under the old cohort-only key it was
   one row that could not say which store was which. */
check('a returning visit knows which cohort came back, and how old it was',
  JSON.stringify(back.who.returns) === JSON.stringify({
    '2026-08-01|I|?|?': {
      n: 5, age: 12, day: D2,
      cohort: '2026-08-01', platform: 'I', tier: '?', slot: '?', version: '',
    },
  }),
  JSON.stringify(back.who));
check('which reads as one install day and an age',
  AL.cohortLine(back.who.returns) === 'installed Aug 1, 12 days ago', AL.cohortLine(back.who.returns));
check('a first run is never a returning visit',
  !('2026-08-13' in s0.days[D2].who.returns), JSON.stringify(s0.days[D2].who.returns));
check('a sale from an install born that day reads as today',
  AL.cohortLine(d.who.sales) === 'installed today', AL.cohortLine(d.who.sales));
check('a first reading carries its install age too',
  AL.cohortLine(dAct.who.activations) === 'installed Aug 12, 2 days ago', AL.cohortLine(dAct.who.activations));
check('and so does a reading',
  AL.cohortLine(dHrv.who.readings) === 'installed Aug 12, 2 days ago', AL.cohortLine(dHrv.who.readings));
check('an age of one day is yesterday',
  AL.cohortLine({ '2026-08-12': { n: 1, age: 1, day: D2 } }) === 'installed Aug 12, yesterday');

const many = {
  '2025-11-01': { n: 3, age: 313, day: '2026-09-10' },
  '2026-08-29': { n: 2, age: 12, day: '2026-09-10' },
  '2025-12-01': { n: 1, age: 283, day: '2026-09-10' },
  '2026-09-08': { n: 1, age: 2, day: '2026-09-10' }
};
check('several cohorts list youngest first, with a count, a year when it differs, and the rest folded',
  AL.cohortLine(many) === 'installed Sep 8 (2d), Aug 29 (12d) ×2, Dec 1 2025 (283d), +3 more',
  AL.cohortLine(many));
check('nothing known is an empty line, not a crash',
  AL.cohortLine({}) === '' && AL.cohortLine(undefined) === '');

/* A baseline stored before cohort maps existed. Its counts still diff; its
   cohort detail must not, or every cohort already there would read as new. */
const noWho = AL.snapshot(BASE);
Object.keys(noWho.days).forEach((k) => { delete noWho.days[k].who; });
const dNoWho = AL.diff(noWho, AL.snapshot(RETURNS));
check('a baseline without cohort maps still counts the visitors',
  dNoWho.visitors === 5, String(dNoWho.visitors));
check('but claims no install age for them',
  AL.cohortLine(dNoWho.who.returns) === '', JSON.stringify(dNoWho.who.returns));

/* The stored baseline only keeps cohort maps for recent days. */
const OLD = { open: [row('2026-06-01', [['2026-05-01', 'I', 2]]), row(D2, [['2026-08-01', 'I', 1]])], sub: [] };
const sOld = AL.snapshot(OLD);
check('a day well outside the catch-up window keeps no cohort map',
  !sOld.days['2026-06-01'].who && !!sOld.days[D2].who, JSON.stringify(sOld.days));

/* ------------------------------------------------- confetti arithmetic

   The canvas ranks nothing — all three celebrations run at once — so the only
   thing left to pin here is how a COUNT becomes a duration. It halves each
   time: two sales are 20s + 10s, three are 20 + 10 + 5. The series converges,
   which is what stops a hundred of them wedging the canvas on for an hour. */
check('a sale is twenty seconds, a new install ten, a return three',
  AL.DURATION.sale === 20000 && AL.DURATION.download === 10000 && AL.DURATION.visit === 3000,
  JSON.stringify(AL.DURATION));
check('one event is its own base duration', AL.stackedMs(20000, 0, 1) === 20000);
check('two stack at half', AL.stackedMs(20000, 0, 2) === 30000);
check('three stack at half again', AL.stackedMs(20000, 0, 3) === 35000);
check('an event landing on a celebration already counting two picks up the decay',
  AL.stackedMs(20000, 2, 1) === 5000, String(AL.stackedMs(20000, 2, 1)));
check('and the total can never exceed twice the base, however many arrive',
  AL.stackedMs(20000, 0, 500) <= 40000, String(AL.stackedMs(20000, 0, 500)));

/* ------------------------------------------- the per-install breakdown

   A card lists the installs behind its count. Tier and store ride inside the
   ping's own cohort key and so belong to the install that pinged; the VERSION
   does not, and everything below is about not pretending otherwise. */

/* A report row carrying the tier letter, and the separate `builds` map the
   lambda counts versions in (platform x tier x version). */
const trow = (day, cohorts, builds) => ({
  day,
  total: cohorts.reduce((a, c) => a + c[2], 0),
  cohorts: cohorts.map(([cohort, platform, count, tier, method]) =>
    ({ cohort, platform, count, tier, method })),
  builds: (builds || []).map(([platform, tier, version, count]) => ({ platform, tier, version, count })),
});

const T0 = {
  open: [trow(D2, [['2026-08-01', 'I', 2, 'F'], ['2026-08-05', 'A', 1, 'P']],
               [['I', 'F', '1.26.0', 2], ['A', 'P', '1.26.0', 1]])],
};
const T1 = {
  open: [trow(D2, [['2026-08-01', 'I', 3, 'F'], ['2026-08-05', 'A', 1, 'P'], ['2026-08-01', 'I', 1, 'P']],
               [['I', 'F', '1.26.0', 3], ['A', 'P', '1.26.0', 1], ['I', 'P', '1.25.2', 1]])],
};
const dT = AL.diff(AL.snapshot(T0), AL.snapshot(T1));
const tRows = dT.rows.returns;

check('a row is raised per install, not per cohort',
  tRows.length === 2, JSON.stringify(tRows));
check('and carries the tier the ping was sent on',
  tRows.map((r) => r.tier).sort().join(',') === 'F,P', JSON.stringify(tRows.map((r) => r.tier)));
check('the same cohort on two tiers is two rows, not one',
  tRows.every((r) => r.cohort === '2026-08-01'), JSON.stringify(tRows.map((r) => r.cohort)));
check('a build is attributed when its platform+tier group ran exactly one version',
  tRows.find((r) => r.tier === 'P').version === '1.25.2',
  JSON.stringify(tRows.map((r) => [r.tier, r.version])));
check('the tier split reads with Pro spelled the way the app spells it',
  AL.tierLine(tRows) === '1 Pro · 1 free', AL.tierLine(tRows));
check('and the build line names what was attributed',
  AL.buildLine(tRows) === '1.25.2 · 1.26.0', AL.buildLine(tRows));

/* Two versions inside ONE platform+tier group. Which of them a given install
   ran is simply not in the data — the lambda counts versions against
   platform x tier and never against the cohort — so the row must say nothing
   rather than pick the bigger one. */
const A0 = { open: [trow(D2, [['2026-08-01', 'I', 1, 'F']], [['I', 'F', '1.26.0', 1]])] };
const A1 = {
  open: [trow(D2, [['2026-08-01', 'I', 2, 'F'], ['2026-08-02', 'I', 1, 'F']],
               [['I', 'F', '1.26.0', 2], ['I', 'F', '1.25.2', 1]])],
};
const dA = AL.diff(AL.snapshot(A0), AL.snapshot(A1));
check('an ambiguous platform+tier group attributes no build to any of its rows',
  dA.rows.returns.every((r) => r.version === null), JSON.stringify(dA.rows.returns.map((r) => r.version)));
/* The note is an ADMISSION and has to read as one: "builds: 1.25.2 · 1.26.0"
   on a card about one returning visitor read as a claim that the install was
   on two builds at once. It leads with what happened, and joins the
   candidates with "or" because they are alternatives for one install. */
check('and the card footers the candidates instead',
  dA.notes.returns === 'Build not identified — 1.25.2 or 1.26.0', dA.notes.returns);
check('a build too old to name itself is named in words, not as a symbol',
  AL.buildNote({ open: { 'I|F': { '?': 2, '1.26.0': 1 } } }, 'open',
    [{ platform: 'I', tier: 'F', version: null }]) === 'Build not identified — an older build or 1.26.0',
  AL.buildNote({ open: { 'I|F': { '?': 2, '1.26.0': 1 } } }, 'open',
    [{ platform: 'I', tier: 'F', version: null }]));
check('past three candidates it counts them instead of listing them',
  AL.buildNote({ open: { 'I|F': { '1.26.0': 1, '1.25.2': 1, '1.24.0': 1, '1.23.0': 1 } } }, 'open',
    [{ platform: 'I', tier: 'F', version: null }]) === 'Build not identified — 4 builds pinged',
  AL.buildNote({ open: { 'I|F': { '1.26.0': 1, '1.25.2': 1, '1.24.0': 1, '1.23.0': 1 } } }, 'open',
    [{ platform: 'I', tier: 'F', version: null }]));
check('a card whose rows all got a build says nothing at all',
  AL.buildNote({ open: { 'I|F': { '1.26.0': 1 } } }, 'open',
    [{ platform: 'I', tier: 'F', version: '1.26.0' }]) === '');
check('a row with no build contributes nothing to the build line',
  AL.buildLine(dA.rows.returns) === '', AL.buildLine(dA.rows.returns));

/* A ping from a build older than the tier and version tokens. Unknown is
   reported as unknown, never folded into free or into a version. */
const U0 = { open: [trow(D2, [['2026-08-01', 'I', 1]], [])] };
const U1 = { open: [trow(D2, [['2026-08-01', 'I', 2]], [])] };
const dU = AL.diff(AL.snapshot(U0), AL.snapshot(U1));
check('a ping with no tier letter is unknown, not free',
  dU.rows.returns[0].tier === '?', JSON.stringify(dU.rows.returns[0]));
check('and reads as unknown in the tier line',
  AL.tierLine(dU.rows.returns) === '1 tier unknown', AL.tierLine(dU.rows.returns));
check('a build that cannot name itself is an empty version, never a guess',
  dU.rows.returns[0].version === '', JSON.stringify(dU.rows.returns[0].version));

/* A baseline in the old key shape keeps its COUNTS and is skipped for detail,
   so the first refresh after the deploy cannot announce a month of history as
   a month of rows. */
const legacyShape = AL.snapshot(T0);
delete legacyShape.v;
const dOldKeys = AL.diff(legacyShape, AL.snapshot(T1));
check('an older baseline still counts what arrived',
  dOldKeys.returns === 2, String(dOldKeys.returns));
check('but draws no rows for it, rather than rows from nothing',
  dOldKeys.rows.returns.length === 0, JSON.stringify(dOldKeys.rows.returns));

/* -------------------------------------------- first readings fold in

   `act` fires once per install ever and `hrv` once per install per Eastern
   day, both the moment a reading completes — so an install's first reading
   raises both, and announcing them separately announces one event twice. */

const FR = (day, hrv, act) => ({
  hrv: [trow(day, hrv, [])],
  act: [trow(day, act, [])],
});
const f0 = AL.snapshot(FR(D2, [['2026-08-12', 'I', 1, 'F', 'B']], [['2026-08-12', 'I', 0, 'F', 'B']]));
const f1 = AL.snapshot(FR(D2, [['2026-08-12', 'I', 2, 'F', 'B']], [['2026-08-12', 'I', 1, 'F', 'B']]));
const dF = AL.diff(f0, f1);
const m1 = AL.mergeFirsts(dF.rows.readings, dF.rows.activations);
check('a reading that is also an activation is tagged, not announced twice',
  m1.rows.length === 1 && m1.rows[0].first === true && m1.rows[0].n === 1 && m1.extra === 0,
  JSON.stringify(m1));

/* Two readings in one group, one of them a first. With `hrv` capped once per
   install per day those are two different installs, so the group SPLITS. */
const g0 = AL.snapshot(FR(D2, [['2026-08-12', 'I', 0, 'F', 'B']], [['2026-08-12', 'I', 0, 'F', 'B']]));
const g1 = AL.snapshot(FR(D2, [['2026-08-12', 'I', 2, 'F', 'B']], [['2026-08-12', 'I', 1, 'F', 'B']]));
const m2 = AL.mergeFirsts(AL.diff(g0, g1).rows.readings, AL.diff(g0, g1).rows.activations);
check('a part-first group splits rather than claiming all of it was a first',
  m2.rows.length === 2 &&
  m2.rows.filter((r) => r.first).reduce((a, r) => a + r.n, 0) === 1 &&
  m2.rows.filter((r) => !r.first).reduce((a, r) => a + r.n, 0) === 1,
  JSON.stringify(m2.rows));
check('and the first is listed above the one that is not',
  m2.rows[0].first === true, JSON.stringify(m2.rows.map((r) => r.first)));

/* An activation whose reading ping did not land in the same diff. The reading
   happened; it is kept, and counted, rather than shown above a headline that
   does not cover it. */
const h1 = AL.snapshot(FR(D2, [['2026-08-12', 'I', 0, 'F', 'B']], [['2026-08-12', 'I', 1, 'F', 'B']]));
const dH = AL.diff(g0, h1);
const m3 = AL.mergeFirsts(dH.rows.readings, dH.rows.activations);
check('an activation with no reading beside it is kept and counted as extra',
  m3.rows.length === 1 && m3.rows[0].first === true && m3.extra === 1, JSON.stringify(m3));
check('nothing at all merges to nothing, not to a crash',
  AL.mergeFirsts(null, null).rows.length === 0 && AL.mergeFirsts(null, null).extra === 0);

/* ----------------------------------------------- subscriptions: sub/rst/lap */

/* A subscription row carries a PLAN letter in the slot from the plan-letter
   release on. `sub` now means a purchase made on this install; `rst` is an
   existing subscription arriving on a new one; `lap` is one going away. Only
   `sub` may ever be a sale — and a letterless `sub` (an older build, whose ping
   meant "found a subscription") must still be one, exactly as before. */
const prow = (day, cohorts) => ({
  day,
  total: cohorts.reduce((a, c) => a + c[3], 0),
  cohorts: cohorts.map(([cohort, platform, plan, count]) =>
    ({ cohort, platform, plan, slot: plan, tier: 'P', count }))
});
const SUB0 = { open: [], sub: [], rst: [], lap: [] };
const sBase = AL.snapshot(SUB0);

const dPlanned = AL.diff(sBase, AL.snapshot({ ...SUB0, sub: [prow(D2, [[D1, 'I', 'Y', 1], [D1, 'A', 'F', 1]])] }));
check('a planned sub row is a sale',
  dPlanned.sales === 2 && dPlanned.any === true, JSON.stringify({ s: dPlanned.sales }));
check('and each sale row carries its plan, not a sensor',
  dPlanned.rows.sales.map((r) => r.plan).sort().join() === 'F,Y' &&
    dPlanned.rows.sales.every((r) => r.slot === '?'),
  JSON.stringify(dPlanned.rows.sales));
check('the plan names read the way a store order does',
  AL.planLine(dPlanned.rows.sales) === '1 Yearly · 1 Founder year', AL.planLine(dPlanned.rows.sales));
check('two sales differing only in plan are two rows, not one ×2',
  AL.diff(sBase, AL.snapshot({ ...SUB0, sub: [prow(D2, [[D1, 'I', 'Y', 1], [D1, 'I', 'M', 1]])] })).rows.sales.length === 2);

const dLegacySub = AL.diff(sBase, AL.snapshot({ ...SUB0, sub: [prow(D2, [[D1, 'I', null, 1]])] }));
check('a letterless (legacy) sub row is still a sale',
  dLegacySub.sales === 1 && dLegacySub.salesBy.I === 1, JSON.stringify(dLegacySub.salesBy));
check('which says it cannot name the plan, and why',
  dLegacySub.rows.sales[0].plan === '?' && /older build/.test(dLegacySub.notes.sales) &&
    AL.planLine(dLegacySub.rows.sales) === '1 plan unknown',
  JSON.stringify({ row: dLegacySub.rows.sales[0], note: dLegacySub.notes.sales }));

const dRst = AL.diff(sBase, AL.snapshot({ ...SUB0, rst: [prow(D2, [[D1, 'I', 'Y', 2]])] }));
check('a restore is news but never a sale',
  dRst.any === true && dRst.restores === 2 && dRst.sales === 0 && dRst.rows.sales.length === 0,
  JSON.stringify({ r: dRst.restores, s: dRst.sales }));
check('and its rows carry the plan',
  dRst.rows.restores.length === 1 && dRst.rows.restores[0].plan === 'Y', JSON.stringify(dRst.rows.restores));
const dLap = AL.diff(sBase, AL.snapshot({ ...SUB0, lap: [prow(D2, [[D1, 'A', 'M', 1]])] }));
check('a lapse is news but never a sale',
  dLap.any === true && dLap.lapses === 1 && dLap.sales === 0 && dLap.lapsesBy.A === 1,
  JSON.stringify({ l: dLap.lapses, s: dLap.sales }));

/* A baseline written before rst/lap were counted must not announce their whole
   history on the first refresh after the deploy — the activation rule. */
const preRst = AL.snapshot(SUB0);
delete preRst.restores; delete preRst.lapses;
const HIST = { ...SUB0, rst: [prow(D1, [[D1, 'I', 'Y', 3]])], lap: [prow(D1, [[D1, 'I', 'M', 2]])] };
const dHist = AL.diff(preRst, AL.snapshot(HIST));
check('a baseline without rst/lap announces none of their history',
  dHist.restores === 0 && dHist.lapses === 0 && dHist.any === false &&
    dHist.rows.restores.length === 0 && dHist.rows.lapses.length === 0,
  JSON.stringify({ r: dHist.restores, l: dHist.lapses }));
const oldShape = AL.snapshot(HIST); oldShape.v = 2;
const dShape = AL.diff(oldShape, AL.snapshot({ ...HIST, sub: [prow(D2, [[D1, 'I', 'Y', 1]])] }));
check('a baseline in the old key shape keeps the sale count but draws no rows for one refresh',
  dShape.sales === 1 && dShape.rows.sales.length === 0, JSON.stringify(dShape.rows.sales));

/* ---------------------------------------------------- history headings */

check('a day heading reads as a date a person would write',
  AL.dayHeading('2026-09-01') === 'September 1, 2026', AL.dayHeading('2026-09-01'));
check('an unreadable day key is passed through rather than guessed at',
  AL.dayHeading('') === '' && AL.dayHeading('nope') === 'nope');

/* -------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
