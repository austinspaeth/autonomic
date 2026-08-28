/* The App usage view, rendered against a fixture whose answers are worked out
   by hand below. Runs against the BUILT page, because the view only exists once
   the route has inlined body.html, the stylesheet and the scripts in order.

   analytics.test.mjs already pins the arithmetic. This file's job is the other
   half: that the view puts those numbers on screen, keeps "unavailable" looking
   different from zero, and that events save, annotate and analyse.

   The fixture is relative to today, since the view anchors its range to the
   newest ping day rather than the store's lagging reporting day:

     Z  born T-10, 8 installs   old enough for D7 (nobody came back: a real 0%)
     A  born T-4,  10 installs  mid-life
     B  born T-3,  4 installs   young; D7 and beyond are unavailable for it   */
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

const OPEN = {
  [T(10)]: { [T(10)]: 8 },
  [T(9)]: { [T(10)]: 4 },
  [T(4)]: { [T(4)]: 10 },
  [T(3)]: { [T(4)]: 5, [T(3)]: 4 },
  [T(2)]: { [T(4)]: 3, [T(3)]: 2 },
  [T(1)]: { [T(10)]: 1, [T(4)]: 2, [T(3)]: 2 },
  [T(0)]: { [T(10)]: 1, [T(4)]: 2, [T(3)]: 1 },
};
const SUB = {
  [T(2)]: { [T(4)]: 2 },     // bought on its D2, inside the trial (one per store)
  [T(0)]: { [T(10)]: 1 },    // bought on its D10, past the trial
};

/* Activations — the first HRV reading an install ever saves, one per install
   ever, and each carrying the sensor it used. Cohort A (10 installs) activates
   6 on its own day 0 and 2 more the next day, so "on day 0" and "by D1" are
   different numbers over the same cohort — which is the whole point of the
   pair. Cohort Z activated 4 of its 8 on day 0, all on the camera. B is too
   young for anything past D1 and activates 1. */
const ACT = {
  [T(10)]: { [T(10)]: { F: 4 } },
  [T(4)]: { [T(4)]: { W: 3, B: 1, F: 2 } },
  [T(3)]: { [T(4)]: { B: 2 }, [T(3)]: { F: 1 } },
};

/* Readings — the daily counter, once per install per Eastern day. It shipped
   LATER than the other three routes, which is the case the whole card is built
   around: the fixture starts it at T-3, so T-10 through T-4 are days the app
   was demonstrably being opened and the counter simply was not running. Those
   must read as unknown, never as "nobody measured".

     T-3  A 3 of the 5 A-installs on the app, B 2 of its 4     (9 active)
     T-2  A 2                                                  (5 active)
     T-1  A 1, B 1                                             (5 active)
     T-0  A 1                                                  (4 active)

   10 readings over 23 install-days on the app = 43.5%.

   Each row also names the sensor, exactly as an activation row does. The counts
   are grouped so the platform arithmetic is unchanged by the split — every
   number below still has to come out the same as it did before the letter
   existed. */
const HRV = {
  [T(3)]: { [T(4)]: { G: 2, W: 1 }, [T(3)]: { F: 2 } },
  [T(2)]: { [T(4)]: { B: 2 } },
  [T(1)]: { [T(4)]: { W: 1 }, [T(3)]: { F: 1 } },
  [T(0)]: { [T(4)]: { G: 1 } },
};

/* Reading rows — both counters — carry a method letter as well as a platform
   one; the same iOS-takes-the-odd-half split keeps the platform arithmetic
   identical. */
const shapeAct = (map) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0),
  cohorts: Object.keys(map[day]).sort().reduce((rows, cohort) => rows.concat(
    Object.keys(map[day][cohort]).sort().reduce((out, method) => out.concat(
      split(map[day][cohort][method]).map(([platform, count]) => ({
        cohort,
        cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
        platform,
        method,
        count,
      })),
    ), []),
  ), []),
}));

/* Each cohort day arrives as it does from the counter: one row per platform,
   iOS taking the odd half. The totals are unchanged by the split, which is the
   point — every hand-worked number below still has to come out the same. */
const split = (n) => [['I', Math.ceil(n / 2)], ['A', n - Math.ceil(n / 2)]].filter((p) => p[1] > 0);

const shape = (map) => Object.keys(map).sort().map((day) => ({
  day,
  total: Object.values(map[day]).reduce((a, b) => a + b, 0),
  cohorts: Object.keys(map[day]).sort().reduce((rows, cohort) => rows.concat(
    split(map[day][cohort]).map(([platform, count]) => ({
      cohort,
      cohortDate: cohort.slice(5, 7) + cohort.slice(8, 10) + cohort.slice(2, 4),
      platform,
      count,
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
window.scrollTo = () => {};           // jsdom has no layout; setView calls it
window.Element.prototype.scrollIntoView = () => {};

const calls = [];
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  calls.push({ target, action: body.action, payload: body.payload });
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });

  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') {
    return reply({
      entries: [{ date: T(4), platform: 'ios', downloads: 20, impressions: 1000, pageViews: 100, sales: 1 }],
      events: [],
      settings: { trialDays: 7, wallDays: 14, currency: '$' },
      // Boot straight into the Timeline tab on purpose: it is the case where
      // the ping fetch resolves AFTER the view first renders, which is how the
      // chart once came up empty.
      ui: { view: 'timeline' },
    });
  }
  if (body.action === 'PINGS') return reply({ since: body.payload.since, open: shape(OPEN), sub: shape(SUB), act: shapeAct(ACT), hrv: shapeAct(HRV) });
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
await new Promise((r) => setTimeout(r, 250));

/* The view the session restored into must draw the ping data once it lands,
   not just the view that happened to request it. */
check('timeline booted straight in', !$('view-timeline').classList.contains('hidden'));
check('the timeline drew data that arrived after its first render',
  $('tlChart').querySelectorAll('path[fill]:not([fill="none"]), rect[rx="3"]').length > 0 ||
  [...$('tlChart').querySelectorAll('rect')].some((n) => Number(n.getAttribute('height')) > 1 && n.getAttribute('rx') !== '2'),
  String($('tlChart').querySelectorAll('rect').length) + ' rects');

window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 300));

check('view is showing', !$('view-ping').classList.contains('hidden'));
check('asked the API for pings', calls.some((c) => c.action === 'PINGS'));

/* ------------------------------------------------------------------ tiles */

const tiles = {};
['pgTiles', 'pgTilesB'].forEach((id) => {
  $(id).querySelectorAll('.tile').forEach((t) => {
    tiles[t.querySelector('.label').textContent.trim()] = {
      value: t.querySelector('.value').textContent.trim(),
      meta: (t.querySelector('.meta') || {}).textContent || '',
      deltas: [].slice.call(t.querySelectorAll('.deltas > div'))
        .map((d) => d.textContent.replace(/\s+/g, ' ').trim()),
      split: ((t.querySelector('.split') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
});
/* Twenty-one: sixteen, the three the reading counter added, and the two
   install tiles — the newest day's first runs and the range's. */
check('twenty-one KPI tiles', Object.keys(tiles).length === 21, Object.keys(tiles).join(' | '));

/* T(0) is 1 + 2 + 1 pings, which the fixture splits 3 iOS / 1 Android. The
   tile is what tells Austin which store phoned home; the numbers above it are
   the proof the split pooled back into the same totals. */
const platTile = [].slice.call($('pgTilesB').querySelectorAll('.tile'))
  .filter((t) => /^Platform on/.test(t.querySelector('.label').textContent))[0];
check('a platform tile names the day\'s split', !!platTile);
check('and reads it as a share of iOS',
  platTile && /75% iOS/.test(platTile.querySelector('.value').textContent),
  platTile && platTile.querySelector('.value').textContent);
check('with both stores counted out',
  platTile && /iOS 3/.test(platTile.querySelector('.split').textContent.replace(/\s+/g, ' '))
           && /Android 1/.test(platTile.querySelector('.split').textContent.replace(/\s+/g, ' ')),
  platTile && platTile.querySelector('.split').textContent.replace(/\s+/g, ' '));

// D1 pools all three cohorts: (4 + 5 + 2) / 22 = 50%
check('D1 retention is 50%', tiles['D1 retention'].value === '50.0%', tiles['D1 retention'].value);
check('D1 shows its denominator', /11 of 22/.test(tiles['D1 retention'].meta), tiles['D1 retention'].meta);

// only Z is old enough for D7, and none of its 8 returned that day: a real 0%
check('D7 is a real 0%, not a dash', tiles['D7 retention'].value === '0.00%', tiles['D7 retention'].value);
check('D7 names the trial boundary', /last day of the trial/.test(tiles['D7 retention'].meta), tiles['D7 retention'].meta);
check('D7 says how many cohorts were too young',
  /2 cohorts too young to count/.test(tiles['D7 retention'].meta), tiles['D7 retention'].meta);

// nobody is 14 or 30 days old: unavailable, and it must not read 0%
check('D14 is unavailable, not zero', tiles['D14 retention'].value === '–', tiles['D14 retention'].value);
check('D30 is unavailable, not zero', tiles['D30 retention'].value === '–', tiles['D30 retention'].value);

/* Lifecycle tiles are usage-based: what pinged on the latest day, bucketed by
   install age. On T that is Z(age 10, 1 active), A(age 4, 2), B(age 3, 1).
   The trial now runs to day 14 inclusive, so all four are inside it — and none
   of that depends on a cohort size, which is what lets installs older than the
   counter appear. */
check('active-in-trial counts today\'s actives aged 0-14',
  tiles['Active in trial'].value === '4', tiles['Active in trial'].value);
check('active-past-trial is 0 because nobody active is 15 days old',
  tiles['Active past the trial'].value === '0', tiles['Active past the trial'].value);
check('there is no third lifecycle tile — the history wall is gone',
  tiles['Active past the wall'] === undefined, JSON.stringify(Object.keys(tiles)));
check('the trial tile still quotes how many started one',
  /started a trial in that window/.test(tiles['Active in trial'].meta), tiles['Active in trial'].meta);

// today: Z 1 + A 2 + B 1 = 4 active, of which 4 are returning (nobody born today)
const activeTile = tiles[Object.keys(tiles).find((k) => k.startsWith('Active on'))];
check('active today is 4', activeTile.value.startsWith('4'));

check('purchases counted', tiles['Purchases in range'].value === '3', tiles['Purchases in range'].value);

/* ------------------------------------------------------- installs + deltas */

const splitOfTile = (host, prefix) => {
  const t = [].slice.call($(host).querySelectorAll('.tile'))
    .filter((x) => x.querySelector('.label').textContent.trim().indexOf(prefix) === 0)[0];
  return t && t.querySelector('.split') ? t.querySelector('.split').textContent.replace(/\s+/g, ' ') : '';
};

/* Nobody was born on T, so the newest day's install tile is a real 0 — and it
   is its own tile rather than a line in the active tile's split, because the
   question it answers ("which store did they come from") the split could not.
   Over the window: Z 8 + A 10 + B 4 = 22, and the fixture halves every cohort
   between the stores, so 11 apiece. */
const installsToday = tiles[Object.keys(tiles).find((k) => k.startsWith('Installs on'))];
check('the newest day\'s installs get their own tile', !!installsToday);
check('and read 0 on a day no cohort was born',
  installsToday && installsToday.value === '0', installsToday && installsToday.value);
check('installs over the range sum the cohorts born in it',
  tiles['Installs in range'].value === '22', tiles['Installs in range'].value);
const freshSplit = splitOfTile('pgTilesB', 'Installs in range');
check('and the range\'s installs are split by store',
  /iOS 11/.test(freshSplit) && /Android 11/.test(freshSplit), freshSplit);

/* Yesterday had 5 actives against today's 4, so the day tile carries a −20%.
   The other two comparisons are dropped rather than printed: T-7 is a day the
   fixture never pinged on, and the 11-day window averages 4.1 — both baselines
   are under the floor, and a percentage off a base that small is noise wearing
   a trend's clothes. */
check('a day tile is read against the day before',
  activeTile.deltas.some((d) => /vs the day before/.test(d) && /20\.0%/.test(d)),
  activeTile.deltas.join(' | '));
check('a comparison whose baseline is too small is dropped, not printed',
  !activeTile.deltas.some((d) => /last week|range average/.test(d)),
  activeTile.deltas.join(' | '));
check('and a tile with three tiny baselines carries no comparisons at all',
  tiles[Object.keys(tiles).find((k) => k.startsWith('Purchases on'))].deltas.length === 0,
  tiles[Object.keys(tiles).find((k) => k.startsWith('Purchases on'))].deltas.join(' | '));

/* A subscribe ping carries the buyer's store in the same cohort key an open
   ping does, so both purchase tiles say which store paid. In range: T(2) sold
   one on each store, T(0) sold one on iOS. On the newest day alone: 1 iOS. */
const rangeSplit = splitOfTile('pgTilesB', 'Purchases in range');
check('purchases in range are split by store', /iOS 2/.test(rangeSplit) && /Android 1/.test(rangeSplit), rangeSplit);

/* Every purchase as its own row, which is what a book with three of them can
   actually be read from. Open by default at this size: the histogram beside it
   is three bars of height one, and the store, the install day and any double
   count are only legible in the list. */
const rowCells = () => [].slice.call($('pgPurchaseRows').querySelectorAll('tbody tr'))
  .map((tr) => [].slice.call(tr.querySelectorAll('td')).map((td) => td.textContent.trim()));
check('every subscribe ping is a row of its own', rowCells().length === 3, String(rowCells().length));
check('and the list is open on arrival at this size',
  !$('pgPurchaseRows').querySelector('#pgPurchaseRowsTable').classList.contains('hidden'));
check('a row names the store, which every aggregate above sums away',
  rowCells().some((c) => c.indexOf('Android') >= 0) && rowCells().some((c) => c.indexOf('iOS') >= 0),
  JSON.stringify(rowCells()));
check('and the install age, which is the subtraction people want',
  rowCells().some((c) => c.indexOf('D10') >= 0), JSON.stringify(rowCells()));
check('nothing in this fixture looks like a double count',
  !/seen twice/.test($('pgPurchaseRows').textContent), $('pgPurchaseRows').textContent.slice(0, 120));
check('the list says it is pings rather than receipts',
  /not store receipts/.test($('pgPurchaseRows').textContent));
$('pgPurchaseRowsToggle').click();
check('and it collapses in one press',
  $('pgPurchaseRows').querySelector('#pgPurchaseRowsTable').classList.contains('hidden'));
$('pgPurchaseRowsToggle').click();

const buysToday = tiles[Object.keys(tiles).find((k) => k.startsWith('Purchases on'))];
check('a purchases tile covers the newest day only', buysToday && buysToday.value === '1', buysToday && buysToday.value);
const todaySplit = splitOfTile('pgTiles', 'Purchases on');
check('and splits that day by store too', /iOS 1/.test(todaySplit) && /Android 0/.test(todaySplit), todaySplit);
// conversion by D7 is measurable only for Z: 1 of its 8 bought within 7 days? no — it
// bought on D10, so within-7 is 0 of 8.
check('D7 conversion is 0% over the one eligible cohort',
  tiles['Conversion by D7'].value === '0.00%', tiles['Conversion by D7'].value);
check('D30 conversion is unavailable', tiles['Conversion by D30'].value === '–', tiles['Conversion by D30'].value);

/* ---------------------------------------------------------- activation */

/* Fixture arithmetic, by hand.
   Cohorts measurable: Z (8, born T-10), A (10, born T-4), B (4, born T-3).
   Activations on each cohort's own day 0: Z 4, A 6, B 1 → 11 of 22 = 50%.
   By D1, A picks up 2 more (T-3 row) → 13 of 22 = 59.09%.
   By D7 only Z is old enough: 4 of 8 = 50%.
   Methods across the range: W 3, B 3, F 7 — but the range is anchored to the
   newest ping day and clipped to the counter's first, so Z's day-0 row (T-10)
   is inside a 30-day window and all 13 are counted. */
const actToday = tiles[Object.keys(tiles).find((k) => k.startsWith('First readings on'))];
check('an activation tile covers the newest day only', actToday && actToday.value === '0', actToday && actToday.value);
check('activation on day 0 is measured over every cohort',
  tiles['Activated on day 0'].value === '50.0%', tiles['Activated on day 0'].value);
check('and D7 activation only over the cohort old enough for it',
  tiles['Activated by D7'].value === '50.0%', tiles['Activated by D7'].value);
check('D7 activation says how many cohorts were too young',
  /2 cohorts too young to count/.test(tiles['Activated by D7'].meta), tiles['Activated by D7'].meta);

const actRates = $('pgActivationRates').textContent;
check('the activation card repeats the rates with their denominators',
  /Activated on day 0/.test(actRates) && /59\.1%/.test(actRates), actRates.slice(0, 200));

const methodNote = $('pgMethodNote').textContent;
check('the method note counts every activation in range',
  /13 first readings/.test(methodNote), methodNote);
check('and says the Apple Watch share is a share of everyone while combined',
  /never offered it/.test(methodNote), methodNote);
check('the method chart drew a band per sensor used',
  $('pgMethods').querySelectorAll('path[fill]:not([fill="none"])').length >= 3,
  String($('pgMethods').querySelectorAll('path').length) + ' paths');

/* ------------------------------------------- the active tile's two splits

   One number, partitioned twice: who they were and which store they came from.
   Both pairs have to add up to the tile's own value or the row is lying — T(0)
   is 4 active, 3 iOS + 1 Android, and returning + first run makes 4 as well. */
check('the active tile still splits returning from first run',
  /returning/.test(activeTile.split) && /first run/.test(activeTile.split), activeTile.split);
check('and now carries the store split beside it',
  /iOS 3/.test(activeTile.split) && /Android 1/.test(activeTile.split), activeTile.split);
check('the store half of that split sums to the tile\'s own number',
  activeTile.value.startsWith('4'), activeTile.value);

/* --------------------------------------- which sensor, on EVERY reading

   The first-reading split says how people start; this says what they keep
   using. The fixture's ten reading-days name four different sensors, and the
   note has to read as install-DAYS rather than as readings: the counter is
   capped once per install per Eastern day, so a band is that install's first
   reading of the day and never a count of sessions. */
const readNote = $('pgReadMethodNote').textContent;
check('the reading-sensor note counts install-days, not readings',
  /10 install-days carried a reading/.test(readNote), readNote);
check('and says which day the letter started, so the gap is explained',
  /counted from/.test(readNote), readNote);
check('it reports each sensor as a share of those days',
  /Apple Watch 20\.0%/.test(readNote) && /Garmin watch 30\.0%/.test(readNote) &&
  /Chest strap 20\.0%/.test(readNote) && /Phone camera 30\.0%/.test(readNote), readNote);
check('the ongoing-sensor chart drew a band per sensor used',
  $('pgReadMethods').querySelectorAll('path[fill]:not([fill="none"])').length >= 2,
  String($('pgReadMethods').querySelectorAll('path').length) + ' paths');

/* The age card is honest about having nothing yet: no cohort born after the
   letter shipped has reached a week old in this fixture, so the day-0 vs day-7+
   comparison must decline to be drawn rather than divide by a handful. */
const ageNote = $('pgReadMethodAgeNote').textContent;
check('the sensor-by-age card says when it cannot compare yet',
  /Not enough aged reading-days/.test(ageNote), ageNote);

/* ------------------------------------------------------------ measuring */

/* Opening the app is not using it, and this is the pair that says so. Both
   counters are one per install per Eastern day, so the share is a share of
   people: 1 of the 4 installs active on T-0 saved a reading. */
const measToday = tiles[Object.keys(tiles).find((k) => k.startsWith('Measured on'))];
check('a reading tile covers the newest day', measToday && measToday.value === '1', measToday && measToday.value);
check('the share of actives who measured is stated as a share of people',
  tiles['Measured of active'].value === '25.0%', tiles['Measured of active'].value);
check('and names both sides of it',
  /1 of 4/.test(tiles['Measured of active'].meta), tiles['Measured of active'].meta);
check('the window rate pools install-days',
  tiles['Measured per active day'].value === '43.5%', tiles['Measured per active day'].value);
check('and says how many days predate the counter rather than counting them as zero',
  /7 days predate the counter/.test(tiles['Measured per active day'].meta),
  tiles['Measured per active day'].meta);

const measNote = $('pgMeasureNote').textContent;
check('the measuring note repeats the rate with its denominator',
  /10 of 23/.test(measNote), measNote.slice(0, 240));
check('and says the pre-counter days were left out, not zeroed',
  /counter was not running yet/.test(measNote), measNote.slice(0, 400));

/* B's own day 0 is the first day the counter existed, so D0 measuring is B
   alone — 2 of its 4 — while Z's and A's day 0 are before the counter and are
   excluded rather than counted as failures. */
const measRates = $('pgMeasureRates').textContent;
check('the habit rates are listed per install age',
  /Measured on D0/.test(measRates) && /50\.0%/.test(measRates), measRates.slice(0, 240));
check('and a cohort whose day N predates the counter is named as such, not churned',
  /before the counter/.test(measRates), measRates.slice(0, 400));

check('the opened-vs-measured chart drew both series',
  $('pgMeasureDaily').querySelectorAll('path').length >= 2,
  String($('pgMeasureDaily').querySelectorAll('path').length) + ' paths');
check('the habit curve drew something',
  $('pgMeasureCurve').querySelectorAll('path').length >= 1,
  String($('pgMeasureCurve').querySelectorAll('path').length) + ' paths');

/* ------------------------------------------- what readings are taken with

   The daily counter's sensor letter. The tile carries TWO split rows — which
   store, and which sensor — because they answer different questions about the
   same count and run together they read as one list that sums to nothing. */
const measTile = [].slice.call($('pgTiles').querySelectorAll('.tile'))
  .filter((t) => /^Measured on/.test(t.querySelector('.label').textContent))[0];
const measSplits = [].slice.call(measTile.querySelectorAll('.split'));
check('the reading tile carries a store split and a sensor split',
  measSplits.length === 2, String(measSplits.length));
check('and the sensor row names the device', /Garmin watch/.test(measSplits[1].textContent),
  measSplits[1].textContent);

const readMethodNote = $('pgReadMethodNote').textContent;
check('the readings-by-sensor card states its range total',
  /10 install-days carried a reading in this range/.test(readMethodNote), readMethodNote.slice(0, 200));
check('the readings-by-sensor chart drew a band per sensor',
  $('pgReadMethods').querySelectorAll('path').length >= 3,
  String($('pgReadMethods').querySelectorAll('path').length) + ' paths');

/* A tile with detail under it folds on a phone, which is the markup half of
   that: one wrapper to measure and animate, and a chevron OUTSIDE the label so
   the label stays readable as text. */
check('a tile with detail wraps it in one foldable block',
  measTile.classList.contains('has-more') && !!measTile.querySelector('.tile-more'));
check('and the fold marker is not part of the label',
  !!measTile.querySelector('.tile-chev') &&
  !/›/.test(measTile.querySelector('.label').textContent),
  measTile.querySelector('.label').textContent);

/* ----------------------------------------------------------- boundaries */

const transitions = $('pgTransitions').querySelectorAll('.transition');
/* ONE transition, not two: the history wall used to be a second boundary a week
   after the trial and now falls on the same day the trial ends, so drawing it
   would say the same thing twice. */
check('one boundary transition shown', transitions.length === 1, String(transitions.length));
check('the trial transition is named D14 → D15',
  /D14 → D15/.test(transitions[0].textContent), transitions[0].textContent.slice(0, 40));

/* -------------------------------------------------------------- heatmap */

check('heatmap has rows', $('pgHeat').querySelectorAll('tbody tr').length > 0);
check('immature cells are hatched, not shaded',
  $('pgHeat').querySelectorAll('td.heat.immature').length > 0);
check('immature cells are empty, never 0%',
  [...$('pgHeat').querySelectorAll('td.heat.immature')].every((td) => td.textContent.trim() === ''));
/* One boundary column now, D15 — the first day outside the trial. D8 stopped
   being a boundary when the trial went from seven days to fourteen. */
check('D15 is the one column marked as a boundary',
  $('pgHeat').querySelectorAll('th.boundary').length === 1,
  String($('pgHeat').querySelectorAll('th.boundary').length));

// switch to daily cohorts and select one
$('pgHeatGrain').querySelector('[data-v="day"]').click();
await new Promise((r) => setTimeout(r, 60));
const dayRows = $('pgHeat').querySelectorAll('tbody tr');
check('three daily cohorts', dayRows.length === 3, String(dayRows.length));
check('small cohorts are flagged', $('pgHeat').querySelectorAll('.warn-small').length > 0);
dayRows[0].click();
await new Promise((r) => setTimeout(r, 60));
check('clicking a cohort opens its detail', !!$('pgCohortDetail').querySelector('.cohort-detail'));

/* --------------------------------------------------------------- charts */

['pgTimeline', 'pgCurve', 'pgSurvival', 'pgActiveCohort', 'pgPurchaseAge', 'pgWeekday'].forEach((id) => {
  check(id + ' rendered', !!$(id).querySelector('svg'));
});
// The oldest cohort is 10 days old, so the curve's axis ends at D10: the trial
// boundary is drawable, the D15 wall is not, and drawing it anyway would put a
// rule on an axis that does not reach it.
/* The curve only draws a boundary its axis actually reaches, and in this
   fixture the oldest cohort is ten days old — so the D14 trial rule is off the
   end of the axis and must NOT be drawn. Before the trial doubled this asserted
   the opposite case (a D7 rule inside a D0–D10 axis); it is the same rule, and
   this is now the side of it worth pinning, because a guide drawn past the last
   plotted day is a claim about days that have not happened. */
check('a boundary beyond the axis is not drawn',
  $('pgCurve').querySelectorAll('line[stroke-dasharray="3 4"]').length === 0,
  String($('pgCurve').querySelectorAll('line[stroke-dasharray="3 4"]').length));
check('and no boundary label is printed with it',
  !/trial ends/.test($('pgCurve').textContent), $('pgCurve').textContent.slice(0, 80));

/* ------------------------------------------------------ timeline tab */

window.document.querySelector('.tab[data-view="timeline"]').click();
await new Promise((r) => setTimeout(r, 200));
check('timeline tab opens', !$('view-timeline').classList.contains('hidden'));
check('the metric chart renders', !!$('tlChart').querySelector('svg'));

// releases are derived from the app's own log, not entered here
const releaseRows = $('tlReleases').querySelectorAll('.event-row');
check('releases are listed from the app release log', releaseRows.length > 0, String(releaseRows.length));
check('a release is titled by version', /^v\d+\.\d+$/.test(
  releaseRows[0].querySelector('.event-title').textContent.trim()),
  releaseRows[0] && releaseRows[0].querySelector('.event-title').textContent);
check('releases carry no edit control', !$('tlReleases').querySelector('[data-edit]'));

// releases draw as full-height dashed rules, hoverable along their whole length
const relLines = [...$('tlChart').querySelectorAll('line[stroke-dasharray="6 4"]')];
check('releases are full-height dashed rules', relLines.length > 0, String(relLines.length));
check('...spanning the plot, not a stub',
  relLines.every((l) => Number(l.getAttribute('y2')) - Number(l.getAttribute('y1')) > 100),
  relLines[0] && (relLines[0].getAttribute('y1') + '->' + relLines[0].getAttribute('y2')));
check('every rule has a full-height hit target',
  $('tlChart').querySelectorAll('line[stroke="transparent"]').length >= relLines.length,
  String($('tlChart').querySelectorAll('line[stroke="transparent"]').length));

/* Hovering the rule must actually reach it. The crosshair layer is a
   transparent rect over the whole plot, and in SVG the last element painted
   takes the pointer — so the flags have to be appended after it. Asserting the
   elements exist proves nothing about that; dispatching the event does. */
const hitLines = [...$('tlChart').querySelectorAll('line[stroke="transparent"]')];
const crosshairRect = $('tlChart').querySelector('rect[fill="transparent"]');
/* The rule must be painted after the bars, or a full-height bar hides all of
   it but the sliver above its top — which is most of the chart on a busy day. */
const lastBar = [...$('tlChart').querySelectorAll('path[fill]')].pop();
check('rules are painted over the data, not under it',
  lastBar && (lastBar.compareDocumentPosition(relLines[0]) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  'a bar must come before the rule in document order');

check('mark hit targets are painted above the crosshair layer',
  crosshairRect && hitLines.length > 0 &&
  (crosshairRect.compareDocumentPosition(hitLines[0]) & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  'crosshair must come first in document order');
hitLines[0].dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
const tip = $('tlChart').querySelector('.tt-title');
check('hovering a rule names the release', tip && /^v\d+\.\d+$/.test(tip.textContent.trim()),
  tip && tip.textContent);

// purchases on this chart come from store sales, not subscribe pings: the
// fixture has 1 store sale and 2 subscribe pings, so the two are separable
$('tlMetric').querySelector('[data-v="purchases"]').click();
await new Promise((r) => setTimeout(r, 80));
$('tlChart').parentElement.querySelector('[data-table-toggle="tlChart"]').click();
const purchaseTotal = [...$('tlChart-table').querySelectorAll('tbody tr')]
  .reduce((a, tr) => a + (Number(tr.lastElementChild.textContent.replace(/[^0-9.]/g, '')) || 0), 0);
check('timeline purchases follow store sales, not pings',
  purchaseTotal === 1, purchaseTotal + ' (store sales 1, subscribe pings 3)');

// switching the metric redraws
$('tlMetric').querySelector('[data-v="downloads"]').click();
await new Promise((r) => setTimeout(r, 80));
check('metric switch redraws the chart', !!$('tlChart').querySelector('svg'));

/* --------------------------------------------------------------- events */

/* The editor moved to Edit data — events are RECORDED there and READ here,
   the same split every other collection on this dashboard has. */
check('the timeline no longer carries the editor', !$('pgEventList').closest('#view-timeline'));
$('btnEditData').click();
await new Promise((r) => setTimeout(r, 150));
check('empty state invites the first event', /No events recorded yet/.test($('pgEventList').textContent));

$('pgEventAdd').click();
await new Promise((r) => setTimeout(r, 60));
check('the add form opens', !$('pgEventForm').classList.contains('hidden'));
check('category types populate', $('evType').options.length > 0);

$('evDate').value = T(5);
$('evTitle').value = 'v1.24 paywall copy';
$('evCategory').value = 'RELEASE';
$('evCategory').dispatchEvent(new window.Event('change', { bubbles: true }));
$('evAmount').value = '250';
$('evSave').click();
await new Promise((r) => setTimeout(r, 60));

check('event saved into the list', /v1\.24 paywall copy/.test($('pgEventList').textContent));
check('the form closed after saving', $('pgEventForm').classList.contains('hidden'));
window.document.querySelector('.tab[data-view="timeline"]').click();
await new Promise((r) => setTimeout(r, 150));
check('the event is annotated onto the timeline chart',
  $('tlChart').querySelectorAll('rect[rx="2"]').length >= 1,
  String($('tlChart').querySelectorAll('rect[rx="2"]').length));
// the App usage charts draw the same annotations from the same store
window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 150));
check('the same event annotates the App usage charts too',
  $('pgTimeline').querySelectorAll('rect[rx="2"]').length >= 1,
  String($('pgTimeline').querySelectorAll('rect[rx="2"]').length));
window.document.querySelector('.tab[data-view="timeline"]').click();
await new Promise((r) => setTimeout(r, 150));

/* Selecting it opens the before/after comparison. The flag on the chart is the
   only way in now, which is the point: the comparison is drawn here, and a
   selection made on the tab you enter events from could not show it. */
$('tlChart').querySelector('rect[rx="2"]').dispatchEvent(new window.Event('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 120));
const analysis = $('pgEventAnalysis');
check('before/after analysis opens', !!analysis.querySelector('table'));
check('it is labelled observational, not causal',
  /not evidence that the event caused anything/.test(analysis.textContent));
check('retention rows that cannot be compared say so',
  /not enough mature data on both sides/.test(analysis.textContent), analysis.textContent.slice(0, 200));

// and it syncs like any other dashboard data
await new Promise((r) => setTimeout(r, 1200));
const push = calls.filter((c) => c.action === 'SYNC').pop();
check('the event pushed to the server', !!push && !!push.payload.eventUpserts, JSON.stringify(push && push.payload));
check('the pushed event carries its fields',
  push && push.payload.eventUpserts[0].title === 'v1.24 paywall copy' && push.payload.eventUpserts[0].amount === 250,
  JSON.stringify(push && push.payload.eventUpserts));

/* --- refreshing must not blank the page ------------------------------------
   The view used to repaint into its "Reading the counter…" state the moment a
   refetch started, which tore down every chart and rebuilt it a beat later.
   A refresh now holds what it has and swaps when the new numbers land. */
window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 300));
const heatBefore = $('pgHeat').innerHTML;
check('there is something on screen to keep', heatBefore.length > 0);

let releasePings;
const held = new Promise((r) => { releasePings = r; });
const beforeFetch = window.fetch;
window.fetch = (url, opts) => {
  const b = JSON.parse(opts.body || '{}');
  if (b.action === 'PINGS') {
    return held.then(() => ({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({ since: b.payload.since, open: shape(OPEN), sub: shape(SUB) })),
    }));
  }
  return beforeFetch(url, opts);
};

$('btnRefresh').click();
await new Promise((r) => setTimeout(r, 300));
check('the grid is still there mid-refresh', $('pgHeat').innerHTML.length > 0,
  String($('pgHeat').innerHTML.length));
check('no "reading the counter" banner over data we already have',
  !/Reading the counter/.test($('pgStatus').textContent), $('pgStatus').textContent);
check('the tiles survived the refresh too', $('pgTiles').querySelectorAll('.tile').length > 0);

releasePings();
await new Promise((r) => setTimeout(r, 700));
check('the refreshed data rendered', $('pgHeat').innerHTML.length > 0);
window.fetch = beforeFetch;

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
if (errors.length) console.log('\nPage errors:\n' + errors.slice(0, 5).join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
