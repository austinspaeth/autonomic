/* The Failures view, rendered against a fixture worked out by hand below.

   What this file is really protecting is the difference between the two things
   the dashboard now calls a failure. `/ping/err` fires ONCE PER INSTALL EVER
   and carries no tag: it is a population and can never say what broke.
   `/fault` carries a tag and a redacted message, is stored per (day, call site,
   failure), and is reported once per install per day — so its numbers are
   INSTALL-DAYS and not occurrences, and not phones either, because there is no
   identifier anywhere in this system.

   Every assertion below is one of those two claims, or the arithmetic that
   depends on getting them right.

   The fixture, relative to today (the view anchors to the newest ping day):

     health.check "timeout after <n>ms"   T-2:3  T-1:4  T-0:2   = 9 install-days
       ...spread across two builds, so it is NOT a regression
     store.persist "disk full"            T-0:5                 = 5, brand new,
       ...all on 1.26.0, so it IS one
     uncaught.fatal "boom"                T-1:1                 = 1, a crash,
       ...and stale: not seen on the last day                                */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first.`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return iso(d); };

/* Opens, so the failure lines have a population to be read against. 40
   install-days over five days. */
const OPEN = {
  [T(4)]: { [T(4)]: 10 },
  [T(3)]: { [T(4)]: 8 },
  [T(2)]: { [T(4)]: 8 },
  [T(1)]: { [T(4)]: 7 },
  [T(0)]: { [T(4)]: 7 },
};

const shapeOpen = () => Object.keys(OPEN).sort().map((day) => ({
  day,
  total: Object.values(OPEN[day]).reduce((a, b) => a + b, 0),
  cohorts: Object.keys(OPEN[day]).map((cohort) => ({
    key: cohort, cohort,
    cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
    platform: 'I', slot: null, method: null, surface: null, tier: 'F',
    count: OPEN[day][cohort],
  })),
  builds: [],
}));

/* Once per install ever — three phones have joined that population. It is
   deliberately a DIFFERENT number from anything in the fault rows, so a test
   that mixed the two would fail rather than coincide. */
const ERR = {
  [T(3)]: { [T(4)]: 2 },
  [T(0)]: { [T(4)]: 1 },
};
const shapeErr = () => Object.keys(ERR).sort().map((day) => ({
  day,
  total: Object.values(ERR[day]).reduce((a, b) => a + b, 0),
  cohorts: Object.keys(ERR[day]).map((cohort) => ({
    key: cohort, cohort,
    cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
    platform: 'I', slot: null, method: null, surface: null, tier: 'F',
    count: ERR[day][cohort],
  })),
  builds: [],
}));

/* The fault rows, in the shape sls/lambdas/ping/main.js returns them: one per
   (day, call site, failure), with the three splits as plain maps. */
const FAULTS = [
  {
    key: `${T(2)}#health.check#aaaaaaaa`, day: T(2), tag: 'health.check',
    msg: 'timeout after <n>ms', fatal: false, count: 3,
    firstAt: `${T(2)}T09:00:00Z`, lastAt: `${T(2)}T20:00:00Z`,
    platforms: { I: 2, A: 1 }, versions: { '1.25.1': 3 }, tiers: { F: 3 },
  },
  {
    key: `${T(1)}#health.check#aaaaaaaa`, day: T(1), tag: 'health.check',
    msg: 'timeout after <n>ms', fatal: false, count: 4,
    firstAt: `${T(1)}T08:00:00Z`, lastAt: `${T(1)}T21:00:00Z`,
    platforms: { I: 3, A: 1 }, versions: { '1.25.1': 2, '1.26.0': 2 }, tiers: { F: 4 },
  },
  {
    key: `${T(0)}#health.check#aaaaaaaa`, day: T(0), tag: 'health.check',
    msg: 'timeout after <n>ms', fatal: false, count: 2,
    firstAt: `${T(0)}T08:00:00Z`, lastAt: `${T(0)}T12:00:00Z`,
    platforms: { I: 2 }, versions: { '1.26.0': 2 }, tiers: { P: 2 },
  },
  /* Brand new, on the last day, entirely on the newest build. This is the row
     the whole view exists for. */
  {
    key: `${T(0)}#store.persist#bbbbbbbb`, day: T(0), tag: 'store.persist',
    msg: 'disk full', fatal: false, count: 5,
    firstAt: `${T(0)}T07:00:00Z`, lastAt: `${T(0)}T19:00:00Z`,
    platforms: { A: 5 }, versions: { '1.26.0': 5 }, tiers: { F: 5 },
  },
  /* A crash, and a stale one: last seen the day before. */
  {
    key: `${T(1)}#uncaught.fatal#cccccccc!`, day: T(1), tag: 'uncaught.fatal',
    msg: 'boom', fatal: true, count: 1,
    firstAt: `${T(1)}T10:00:00Z`, lastAt: `${T(1)}T10:00:00Z`,
    platforms: { I: 1 }, versions: { '?': 1 }, tiers: { F: 1 },
  },
];

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [b64u({ alg: 'RS256' }), b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }), 'sig'].join('.');

const dom = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};

window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });

  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') {
    return reply({
      entries: [], events: [],
      settings: { trialDays: 7, wallDays: 14, currency: '$' },
      ui: { view: 'ping' },
    });
  }
  if (body.action === 'PINGS') {
    return reply({
      since: body.payload.since,
      open: shapeOpen(),
      sub: [], act: [], hrv: [], cap: [], pay: [],
      not: [], pot: [], see: [], osh: [], odm: [], oac: [],
      err: shapeErr(),
      faults: FAULTS,
    });
  }
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await new Promise((r) => setTimeout(r, 150));
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));

const text = (id) => ($(id).textContent || '').replace(/\s+/g, ' ').trim();
const flat = (id) => text(id).replace(/\s+/g, '');

/* ------------------------------------------------------- the view exists */

const tab = window.document.querySelector('.tab[data-view="faults"]');
check('there is a Failures tab', !!tab);
tab.click();
await new Promise((r) => setTimeout(r, 400));

check('the Failures view is the one showing',
  !$('view-faults').classList.contains('hidden'));

/* ------------------------------------------------------------ the tiles */

/* Three distinct failures over 9 + 5 + 1 = 15 install-days. */
check('distinct failures are counted, not occurrences',
  /Distinctfailures3/.test(flat('fltTiles')), text('fltTiles'));
check('the install-day total is stated as install-days',
  /over15install-days/.test(flat('fltTiles')), text('fltTiles'));

/* One of the three was first seen on the last day. This is the number worth
   reacting to: a backlog of known failures and a release going wrong look
   identical in a total. */
check('a failure first seen on the last day is called new',
  /Newon.*1/.test(flat('fltTiles').replace(/Newon[A-Za-z0-9]+/, (m) => m + '|')), text('fltTiles'));

/* Two of the three were reported on the last day (health.check and
   store.persist); the crash was not. "Still happening" and "new" are different
   questions and must give different answers. */
check('still-happening and new are different numbers',
  /Stillhappening2/.test(flat('fltTiles')), text('fltTiles'));

check('a crash is counted apart from a caught error',
  /Crashes1/.test(flat('fltTiles')), text('fltTiles'));

/* 7 failing install-days on the last day (2 + 5) against 7 opens. The share is
   against the open counter, which is the same denominator every other rate on
   this dashboard uses. */
check('the last day is read against the people who were in the app',
  /ofthe7intheapp/.test(flat('fltTiles')), text('fltTiles'));

check('and says the count is install-days rather than phones',
  /install-days, not phones/.test(text('fltTiles')), text('fltTiles'));

check('the daily chart drew both lines', $('fltDaily').querySelectorAll('path, rect').length > 0);

/* ------------------------------------------------------------ the table */

const table = () => text('fltTable');

check('the worst failure leads the table',
  table().indexOf('timeout after <n>ms') < table().indexOf('disk full'), table().slice(0, 200));

check('a failure is grouped across the days it spanned, not listed per day',
  /timeout after <n>ms/.test(table())
  && table().split('timeout after <n>ms').length === 2, table().slice(0, 300));

check('the message is shown as it was stored — already redacted',
  /timeout after <n>ms/.test(table()), table().slice(0, 200));

check('the call site is shown beside it', /health\.check/.test(table()));

/* The load-bearing one. `disk full` is 5 of 5 on 1.26.0, so it is a regression
   that shipped; `timeout` is split across 1.25.1 (5) and 1.26.0 (4), so it is
   not, and calling it one would send somebody to revert the wrong release. */
check('a failure concentrated on one build is called out',
  /only this build/.test(table()), table().slice(0, 600));
check('a failure spread across builds is NOT',
  table().split('only this build').length === 2, table());

check('the top build is named with its share',
  /1\.26\.0/.test(table()) && /100\.0%/.test(table()), table().slice(0, 600));

/* The crash has one report from a build too old to name itself. That is a real
   and separate population — it must be disclosed, never folded into a version. */
check('reports from builds too old to say so are disclosed, not divided away',
  /1 from builds too old to say/.test(table()), table());

check('a crash is marked as one', /crash/.test(table()));
check('a failure first seen on the last day is marked new',
  /disk full new/.test(table()), table().slice(0, 300));

/* ------------------------------------------------------------ the filters */

/* "New" is a FILTER rather than a sort: a list that merely floated new rows to
   the top still buries the answer under a backlog once there is more than a
   screenful, and "did today's release break something" is the question. */
window.document.querySelector('#fltSort button[data-v="new"]').click();
await new Promise((r) => setTimeout(r, 200));
check('the New filter keeps only what appeared on the last day',
  /disk full/.test(table()) && !/timeout after <n>ms/.test(table()), table().slice(0, 300));

window.document.querySelector('#fltSort button[data-v="fatal"]').click();
await new Promise((r) => setTimeout(r, 200));
check('the Crashes filter keeps only the uncaught ones',
  /boom/.test(table()) && !/disk full/.test(table()), table().slice(0, 300));

window.document.querySelector('#fltSort button[data-v="installs"]').click();
await new Promise((r) => setTimeout(r, 200));

/* --------------------------------------------- what the view promises */

const page = () => ($('view-faults').textContent || '').replace(/\s+/g, ' ').trim();

check('the view says a count is install-days and not occurrences',
  /once per install per day/.test(page()), page().slice(0, 400));

check('the view refuses to claim a phone count',
  /nine install-days may be nine phones once each or one phone for nine days/.test(page()),
  page().slice(0, 400));

check('the view says the message is redacted twice',
  /redacted twice/.test(page()), page());

check('the view says what is NOT in a report',
  /no device id, no install id, no body, and no health or journal data/.test(page()), page());

/* ------------------------------- the counter next door still means itself */

window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 400));

/* Three installs have reported a FIRST failure, which is not 15 and not 3
   signatures — it is its own population, and the two must never be conflated.
   That it coincidentally equals the signature count in some other fixture is
   exactly the confusion this fixture is built to catch. */
check('the once-per-install counter is unchanged by any of this',
  /Installsreportingafirstfailure3/.test(flat('pgEventNote')), text('pgEventNote'));

check('and it points at the view that can say what broke',
  /What broke is the Failures tab/.test(text('pgEventNote')), text('pgEventNote'));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
if (errors.length) console.log('\nPage errors:\n' + errors.slice(0, 5).join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
