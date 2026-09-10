/* The all-time-high badge on the App usage day tiles, rendered against a
   fixture long enough for the word "ever" to mean anything.

   Its own file, and that is the point of it. Every other App usage fixture here
   is a handful of days built to pin some other arithmetic exactly, and a record
   needs a FORTNIGHT of history before `A.dayRecord` will claim one — so
   stretching one of those to reach the bar would move every hand-computed
   number in it, and shrinking the bar to fit one would test a rule the product
   does not have. analytics.test.mjs pins what a record IS. This file's job is
   the other half: that the badge lands on the right tile, that it says what it
   beat, and — the part that actually bites — that it stays off the tiles whose
   record would be a lie.

   The fixture, relative to today, one cohort born per day so the day series is
   the arithmetic itself:

     opens       20 days: sixteen quiet days at 4, then 9, 5, 14, 20 — so
                 today is the highest day this app has ever had, past a 14.
     installs    flat 4 every day INCLUDING today, so today TIES the best day
                 there has ever been and must not be called a high.
     purchases   0 every day but today's 2 — a genuine record off a floor of
                 nothing, which is what a first sale looks like.
     activations 1 a day with one spike of 5 a week ago, and 1 today: an
                 ordinary day, with a full history behind it and no badge.
     readings    the counter only starts 4 days ago, so today is the best day
                 it has ever seen and STILL cannot say so — three days of
                 history is not "ever".                                     */
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

const DAYS = 20;                                  // T-19 .. T-0
const ACTIVE = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 5, 14, 20];
const HRV_FROM = 3;                               // the reading counter's birthday

/* day -> cohort -> count. Each day's actives are pinned on that day's own
   cohort, so `activeOn` reads the series above straight back. */
const OPEN = {};
const SUB = {};
const ACT = {};
const HRV = {};
for (let i = 0; i < DAYS; i++) {
  const back = DAYS - 1 - i;
  const day = T(back);
  /* Four first runs every day, plus the returners that make up the active
     count — so `newOn` is flat at 4 while `activeOn` carries the shape. */
  OPEN[day] = { [day]: 4 };
  if (ACTIVE[i] > 4) OPEN[day][T(DAYS - 1)] = ACTIVE[i] - 4;
  /* Nothing sold until today, which is the shape of a first sale: a record off
     a floor of zero is still a record, and it is the one worth being told. */
  if (back === 0) SUB[day] = { [day]: 2 };
  /* Activations tick along at 1 with one spike of 5 a week ago, and an
     ordinary 1 today — the case a record has to decline: plenty of history,
     and simply not the best of it. */
  ACT[day] = { [day]: { F: back === 7 ? 5 : 1 } };
  /* The reading counter starts four days ago and climbs every day it exists,
     so today is its best day and it has nowhere near enough history to say so. */
  if (back <= HRV_FROM) HRV[day] = { [day]: { B: HRV_FROM - back + 1 } };
}

const shape = (map) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce((a, b) => a + b, 0),
  cohorts: Object.keys(map[day]).map((cohort) => ({
    cohort,
    cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
    platform: 'I',
    count: map[day][cohort],
  })),
}));
const shapeSlot = (map, key) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce(
    (a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0),
  cohorts: Object.keys(map[day]).reduce((rows, cohort) => rows.concat(
    Object.keys(map[day][cohort]).map((letter) => ({
      cohort,
      cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
      platform: 'I',
      slot: letter,
      [key]: letter,
      count: map[day][cohort][letter],
    })),
  ), []),
}));

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
      settings: { trialDays: 14, currency: '$' },
      ui: { view: 'ping', range: '90' },
    });
  }
  if (body.action === 'PINGS') {
    return reply({
      since: body.payload.since,
      open: shape(OPEN),
      sub: shape(SUB),
      act: shapeSlot(ACT, 'method'),
      hrv: shapeSlot(HRV, 'method'),
      pay: [], cap: [],
      osh: [], oac: [], odm: [],
      see: [], pot: [], not: [], err: [],
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

window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 400));

/* Every tile in a host, by the label it wears. */
const tilesIn = (id) => {
  const out = {};
  [...$(id).querySelectorAll('.tile')].forEach((el) => {
    out[el.querySelector('.label').textContent.trim()] = {
      value: (el.querySelector('.value').textContent || '').trim(),
      meta: (el.querySelector('.meta') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
      ath: !!el.querySelector('.ath'),
      el,
    };
  });
  return out;
};
const today = tilesIn('pgTilesToday');
const byPrefix = (tiles, p) => tiles[Object.keys(tiles).find((k) => k.startsWith(p))];

/* ------------------------------------------------------------- the badge */

const active = byPrefix(today, 'Active on');
check('a day above every other day wears the badge',
  active && active.ath === true, active && (active.value + ' | ' + active.meta));

/* The badge is a glance and the meta line is the evidence. A badge with no
   stated previous best is a boast. */
check('and the tile says what it beat, and when',
  /best day yet, past 14 on /.test(active.meta), active.meta);

/* An ordinary day, with nineteen days of history behind it and simply not the
   best of them: one activation today against a 5 a week ago. */
const acts = byPrefix(today, 'First readings on');
check('an ordinary day gets no badge, however much history it has',
  acts && acts.value.startsWith('1') && acts.ath === false,
  acts && (acts.value + ' | ' + acts.meta));

/* Matching the best day is a tie, not an all-time high: installs have been flat
   at 4 for twenty days, so today equals the record and must not claim it. */
const installs = byPrefix(today, 'Installs on');
check('a day that only MATCHES the best is not called a high',
  installs && installs.value.startsWith('4') && installs.ath === false,
  installs && (installs.value + ' | ' + installs.meta));

/* A record off a floor of zero is still a record — a first sale is exactly the
   thing worth being told about — and it gets its own sentence. "Past 0 on Aug
   20" is true and reads as nonsense: it names whichever day happened to be
   first among a run of identical zeros, as though that day were the thing
   being beaten. */
const buys = byPrefix(today, 'Purchases on');
check('a first sale is a record, off a floor of nothing',
  buys && buys.ath === true, buys && (buys.value + ' | ' + buys.meta));
check('and a floor of nothing is said as such, never as a day that was beaten',
  /best day yet — nothing on any day before it/.test(buys.meta) && !/past 0/.test(buys.meta),
  buys.meta);

/* The reading counter is three days old and has climbed every day it existed,
   so today IS the best day it has ever seen — and it has nowhere near enough
   history to call that "ever". The third day a route ran is the best day it
   ever had, trivially and uselessly. */
const measured = byPrefix(today, 'Measured on');
check('a counter three days old claims nothing, however high the day is',
  measured && measured.value.startsWith('4') && measured.ath === false,
  measured && (measured.value + ' | ' + measured.meta));
check('and neither does the rate read off it',
  today['Measured of active'].ath === false, today['Measured of active'].value);

/* Only the TODAY tiles are eligible. A range tile is a window aggregate, where
   a record would mean the best thirty-day window ever — a different claim
   needing a rolling sweep — and the lifetime tiles are pooled over cohorts and
   are not a day series at all. */
check('no range tile claims a record', $('pgTilesRange').querySelectorAll('.ath').length === 0);
check('no lifetime tile claims a record', $('pgTilesLife').querySelectorAll('.ath').length === 0);

/* Opt-in, tile by tile, because a record is a CONGRATULATION and most numbers
   here are not the kind of thing to be congratulated on. A record iOS share is
   not good news, it is Android news; a record pile of people past the trial is
   a pile of people who did not convert. Both would wear the badge under any
   rule that simply looked for a maximum. */
check('the platform share is not eligible for one',
  byPrefix(today, 'Platform on').ath === false);
check('nor is the count of installs past the trial',
  today['Active past the trial'].ath === false);

/* On a phone a tile folds down to its label and its number, and the delta is
   hidden by an explicit rule. The badge must survive that: "the best we have
   ever had" is the one thing worth seeing without opening the tile. */
check('the badge rides in the value line, where the phone can still see it',
  !!active.el.querySelector('.value .ath'), active.el.querySelector('.value').innerHTML);

/* All time is ALL TIME, not the range on screen. Narrowing to a week leaves
   today as an ordinary 6 against a 14 it can still see. */
const fRange = $('fRange');
fRange.value = '7';
fRange.dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise((r) => setTimeout(r, 400));
const narrowed = tilesIn('pgTilesToday');
const narrowActive = byPrefix(narrowed, 'Active on');
check('narrowing the date range does not manufacture a record',
  narrowActive && narrowActive.ath === true, narrowActive && narrowActive.meta);
check('and the record it names is still the all-time one',
  /past 14 on /.test(narrowActive.meta), narrowActive.meta);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
if (errors.length) console.log('\nPage errors:\n' + errors.slice(0, 5).join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
