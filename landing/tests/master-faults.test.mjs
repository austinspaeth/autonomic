/* The Failures view, rendered against a fixture worked out by hand below.

   What this file is really protecting is the difference between the two things
   the dashboard now calls a failure. `/ping/err` fires ONCE PER INSTALL EVER
   and carries no tag: it is a population and can never say what broke.
   `/fault` carries a tag and a redacted message and is stored per (day, call
   site, failure). It reports EVERY OCCURRENCE — the client buffers them and a
   report carries the count it accumulated — so a row has two numbers, and the
   pair is the point: occurrences alone cannot tell one phone in a retry loop
   from a bug everybody has, and install-days alone cannot tell a single glitch
   from a storm. Neither is a phone count, because there is no identifier
   anywhere in this system.

   Every assertion below is one of those two claims, or the arithmetic that
   depends on getting them right.

   The fixture, relative to today (the view anchors to the newest ping day):

     health.check "timeout after <n>ms"
       T-2: 3 installs / 3 times   T-1: 4/4   T-0: 2/2   = 9 installs, 9 times
       ...spread across two builds, so it is NOT a regression
     store.persist "disk full"
       T-0: 5 installs / 5 times                         = 5 installs, 5 times
       ...all on 1.26.0, brand new, so it IS one
     widgets.sync "write failed"
       T-0: 2 installs / 840 times                       = 2 installs, 840 times
       ...a RETRY LOOP: barely anybody, constantly. It must rank BELOW the two
       above by default (breadth decides a hotfix) and top the Most-often list.
     uncaught.fatal "boom"
       T-1: 1 install / 1 time                           = a crash, and stale  */
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

/* Opens, so the failure lines have a population to be read against. Comfortably
   larger than the fault counts on every day: the failing-installs tile is a
   share of the people who were in the app, and a fixture where the numerator
   exceeded the denominator would enshrine a rate over 100% as expected. */
const OPEN = {
  [T(4)]: { [T(4)]: 24 },
  [T(3)]: { [T(4)]: 22 },
  [T(2)]: { [T(4)]: 21 },
  [T(1)]: { [T(4)]: 20 },
  [T(0)]: { [T(4)]: 20 },
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
const fault = (day, tag, msg, opts) => ({
  key: `${day}#${tag}#${(opts.hash || 'aaaaaaaa')}${opts.fatal ? '!' : ''}`,
  day, tag, msg, fatal: !!opts.fatal,
  /* Two numbers. `installs` is install-days and `occurrences` is times. */
  installs: opts.installs, occurrences: opts.occurrences,
  firstAt: `${day}T08:00:00Z`, lastAt: `${day}T20:00:00Z`,
  /* platforms / versions / tiers are INSTALL-DAYS and each sums to `installs`
     — weighting them by occurrences would let one looping phone report
     whichever build it runs as the whole of a failure. `occPlatforms` is
     occurrences and sums to `occurrences`; it exists so a platform slice can
     narrow both numbers together. */
  platforms: opts.platforms, occPlatforms: opts.occPlatforms,
  versions: opts.versions, tiers: opts.tiers,
});

const FAULTS = [
  fault(T(2), 'health.check', 'timeout after <n>ms', {
    installs: 3, occurrences: 3,
    platforms: { I: 2, A: 1 }, occPlatforms: { I: 2, A: 1 },
    versions: { '1.25.1': 3 }, tiers: { F: 3 },
  }),
  fault(T(1), 'health.check', 'timeout after <n>ms', {
    installs: 4, occurrences: 4,
    platforms: { I: 3, A: 1 }, occPlatforms: { I: 3, A: 1 },
    versions: { '1.25.1': 2, '1.26.0': 2 }, tiers: { F: 4 },
  }),
  fault(T(0), 'health.check', 'timeout after <n>ms', {
    installs: 2, occurrences: 2,
    platforms: { I: 2 }, occPlatforms: { I: 2 },
    versions: { '1.26.0': 2 }, tiers: { P: 2 },
  }),
  /* Brand new, on the last day, entirely on the newest build. This is the row
     the whole view exists for. */
  fault(T(0), 'store.persist', 'disk full', {
    hash: 'bbbbbbbb', installs: 5, occurrences: 5,
    platforms: { A: 5 }, occPlatforms: { A: 5 },
    versions: { '1.26.0': 5 }, tiers: { F: 5 },
  }),
  /* THE RETRY LOOP. Two phones, 840 occurrences — 420 apiece. Every one of them
     is counted, which is the whole point of the change, and the two numbers
     have to stay legible side by side: this is a battery and data problem for
     two users, not a bug that reached 840 people. */
  fault(T(0), 'widgets.sync', 'write failed', {
    hash: 'dddddddd', installs: 2, occurrences: 840,
    platforms: { A: 2 }, occPlatforms: { A: 840 },
    versions: { '1.26.0': 2 }, tiers: { F: 2 },
  }),
  /* A crash, and a stale one: last seen the day before. */
  fault(T(1), 'uncaught.fatal', 'boom', {
    hash: 'cccccccc', fatal: true, installs: 1, occurrences: 1,
    platforms: { I: 1 }, occPlatforms: { I: 1 },
    versions: { '?': 1 }, tiers: { F: 1 },
  }),
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

/* Four distinct failures. 9 + 5 + 840 + 1 = 855 occurrences across
   9 + 5 + 2 + 1 = 17 install-days. BOTH numbers are stated, because 855 alone
   reads as a catastrophe and 17 alone hides a phone burning its battery. */
check('distinct failures are counted, not occurrences',
  /Distinctfailures4/.test(flat('fltTiles')), text('fltTiles'));
check('every occurrence is counted, and stated as times',
  /855times/.test(flat('fltTiles')), text('fltTiles'));
check('install-days are stated beside them, never instead of them',
  /across17install-days/.test(flat('fltTiles')), text('fltTiles'));

/* Two of the four were first seen on the last day (disk full, write failed).
   This is the number worth reacting to: a backlog of known failures and a
   release going wrong look identical in a total. */
check('a failure first seen on the last day is called new',
  /2first seen that day/.test(text('fltTiles')), text('fltTiles'));

/* Three of the four were reported on the last day; the crash was not.
   "Still happening" and "new" are different questions and give different
   answers. */
check('still-happening and new are different numbers',
  /Stillhappening3/.test(flat('fltTiles')), text('fltTiles'));

check('a crash is counted apart from a caught error',
  /Crashes1/.test(flat('fltTiles')), text('fltTiles'));

/* 9 failing install-days on the last day (2 + 5 + 2) against 20 opens = 45.0%.
   The numerator is install-days and NOT occurrences on purpose: 847 occurrences
   against 20 opens would render as 4,235%, which is not a rate at all. */
check('the last day is read against the people who were in the app',
  /45\.0%ofthe20intheapp/.test(flat('fltTiles')), text('fltTiles'));

check('and says the count is install-days rather than phones',
  /install-days, not phones/.test(text('fltTiles')), text('fltTiles'));

check('the daily chart drew both lines', $('fltDaily').querySelectorAll('path, rect').length > 0);

/* ------------------------------------------------------------ the table */

const table = () => text('fltTable');

/* BREADTH RANKS FIRST. `timeout` (9 installs, 9 times) leads `disk full`
   (5, 5), which leads the retry loop (2 installs, 840 times). Ranking by
   occurrences would put the loop on top — two users' battery above a bug that
   reached nine — and that is the wrong first thing to fix. */
check('the widest failure leads the table, not the loudest',
  table().indexOf('timeout after <n>ms') < table().indexOf('disk full')
  && table().indexOf('disk full') < table().indexOf('write failed'), table().slice(0, 300));

check('a failure is grouped across the days it spanned, not listed per day',
  /timeout after <n>ms/.test(table())
  && table().split('timeout after <n>ms').length === 2, table().slice(0, 300));

check('the message is shown as it was stored — already redacted',
  /timeout after <n>ms/.test(table()), table().slice(0, 200));

check('the call site is shown beside it', /health\.check/.test(table()));

/* A row where a handful of phones account for hundreds of occurrences is a
   loop, and the two columns are the only way to see it. 840 / 2 = 420. */
check('both numbers are in the table',
  /Installs/.test(table()) && /Times/.test(table()), table().slice(0, 120));
check('a retry loop is called out as one',
  /420× per install/.test(table()), table().slice(0, 600));
check('...and an ordinary failure is not',
  table().split('× per install').length === 2, table());

/* The load-bearing one. `disk full` is 5 of 5 on 1.26.0, so it is a regression
   that shipped; `timeout` is split across 1.25.1 (5) and 1.26.0 (4), so it is
   not, and calling it one would send somebody to revert the wrong release. */
check('a failure concentrated on one build is called out',
  /only this build/.test(table()), table().slice(0, 600));
check('a failure spread across builds is NOT',
  !table().slice(table().indexOf('timeout after <n>ms'), table().indexOf('disk full'))
    .includes('only this build'), table().slice(0, 400));

/* Nor is a failure that only two builds' worth of installs could speak for.
   `write failed` is 100% on 1.26.0 — but on two install-days, which is not
   enough to call a regression, and a flag that fires on two devices is a flag
   nobody trusts by the third time they see it. */
check('...and neither is one whose "100%" rests on almost no installs',
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

/* Most often is the view for finding a loop: the same rows, ranked by how hard
   they are hitting rather than by how wide they reached. */
window.document.querySelector('#fltSort button[data-v="often"]').click();
await new Promise((r) => setTimeout(r, 200));
check('Most often puts the retry loop on top',
  table().indexOf('write failed') < table().indexOf('timeout after <n>ms'), table().slice(0, 300));

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

check('the view says every occurrence is counted',
  /every occurrence is counted/i.test(page()), page().slice(0, 500));

check('the view says a request is NOT made per occurrence',
  /a request is not made for each one/i.test(page()), page().slice(0, 600));

check('the view says a deferred report never loses a count',
  /it never discards a count/.test(page()), page());

check('the view refuses to claim a phone count',
  /nine install-days may be nine phones once each or one phone for nine days/.test(page()),
  page().slice(0, 600));

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
