/* "Who is using it today" — the card that charts every active install by how
   old it is.

   It exists as its own file because the one rule it has to keep needs a world
   the other ping fixture does not have: MANY cohorts alive at once. The card
   used to chart the 24 youngest, which on a fixture of three cohorts is
   invisible and on a real dashboard silently dropped the app's most
   established users — the very install an activity toast names.

   The fixture is forty consecutive cohorts, one per day, every one of them
   still opening the app today, plus one that predates the counter. */
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

const AGES = 40;                       // cohorts born T-39 … T-0
const OLD = T(400);                    // older than the counter's first day

/* day -> cohort -> count. Every cohort installs 12, then decays the way a real
   one does — never more active than it was born with — and none of them ever
   goes silent, so today holds one bar per cohort at every age 0…39. */
const SIZE = 12;
const held = (age) => Math.max(1, SIZE - Math.floor(age * 1.5) - (age % 3));
const OPEN = {};
const put = (day, cohort, n) => { (OPEN[day] = OPEN[day] || {})[cohort] = n; };
for (let born = AGES - 1; born >= 0; born--) {
  const cohort = T(born);
  put(cohort, cohort, SIZE);
  for (let d = born - 1; d >= 0; d--) put(T(d), cohort, held(born - d));
}
for (let d = AGES - 1; d >= 0; d--) put(T(d), OLD, 2);

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
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};

window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });
  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') {
    return reply({ entries: [], events: [], settings: { trialDays: 7, wallDays: 14, currency: '$' }, ui: { view: 'ping' } });
  }
  if (body.action === 'PINGS') return reply({ since: body.payload.since, open: shape(OPEN), sub: [], act: [], hrv: [] });
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
await new Promise((r) => setTimeout(r, 400));

window.document.querySelector('.tab[data-view="ping"]').click();
await new Promise((r) => setTimeout(r, 400));

/* ------------------------------------------------------------- every bar */

/* The default range is 30 days, and the chart is deliberately NOT scoped to
   it: it is a picture of one day's active installs by age, so a 39-day-old
   install opening the app today belongs on it whatever the filter says. */
window.document.querySelector('[data-table-toggle="pgActiveCohort"]').click();
await new Promise((r) => setTimeout(r, 100));
const tableRows = [...$('pgActiveCohort-table').querySelectorAll('tbody tr')];

check('every active cohort is charted, not the youngest 24',
  tableRows.length === AGES + 1, tableRows.length + ' rows');
check('...including installs older than the counter',
  tableRows.some((tr) => /39 days old|400 days old/.test(tr.textContent)),
  tableRows.map((tr) => tr.children[0].textContent).slice(-3).join(' | '));

/* The oldest bar is the one the cap used to eat, and it is also the one a
   reader is looking for when a toast says somebody long-established is back. */
const oldest = tableRows[tableRows.length - 1].textContent;
check('the oldest install is the last row, at its true age', /400 days old/.test(oldest), oldest);

/* Each row names the DAY it installed, not only the age. An age is what the
   chart is shaped by; the date is what a toast says. */
check('a row names the install date as well as the age',
  tableRows.every((tr) => /\w{3} \d+, \d{4} · \d+ days? old/.test(tr.children[0].textContent)),
  tableRows[0].children[0].textContent);

/* ------------------------------------------------------- a bar's own normal */

/* The tooltip answers "is this a strong day for THESE people". Keyboard access
   mirrors hover and needs no layout, which is the only way to open it here. */
const svg = $('pgActiveCohort').querySelector('svg');
svg.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
/* Read the tooltip out of the wrap that keypress actually drove, rather than
   looking the card up again by id: the view redraws when fresh ping data
   lands, and the redraw leaves an identical, empty tooltip in its place. */
const tipNote = ((svg.parentNode.querySelector('.tooltip') || {}).textContent) || '';

check('a bar opens on its own count for the day', /of \d+ active installs on /.test(tipNote), tipNote);

/* BLOCK ONE: down this cohort's own life. */
check('it says how many installed', /This cohort · \d+ installed/.test(tipNote), tipNote);
check('...and how much of that is left', /Still here\d+ of \d+ · \d+%/.test(tipNote), tipNote);
check('...against the day before', /vs the day before/.test(tipNote), tipNote);
check('...against its own average', /vs its own average/.test(tipNote), tipNote);
check('...over a stated number of days', /over \d+ days/.test(tipNote), tipNote);
check('...and against its own best day', /Its best day\d+ on D\d+/.test(tipNote), tipNote);

/* BLOCK TWO: across cohorts, at the same age. The comparison the chart's shape
   invites and none of its numbers used to make. */
const age = (tipNote.match(/(D\d+) across cohorts/) || [])[1];
check('it compares the age slot across cohorts', !!age, tipNote);
check('...against the bar that stood there yesterday',
  age && tipNote.includes('The ' + age + ' bar yesterday'), tipNote);
check('...against the usual bar for that age',
  age && new RegExp('The usual ' + age + ' bar\\d+(\\.\\d)? → \\d+.*median of \\d+').test(tipNote), tipNote);
check('...and as a retention rate, which is what makes cohorts comparable',
  age && new RegExp(age + ' retention\\d+% vs \\d+% typical, over \\d+ cohorts').test(tipNote), tipNote);

/* A decaying cohort can never hold more than it was born with, so nothing here
   may print a share above 100% off this fixture. */
check('no share exceeds what the cohort started with',
  !/\b[1-9]\d\d+%/.test(tipNote), tipNote);

/* On counts this small `pctChange` refuses to divide, and a row falls back to
   the two numbers rather than printing a percentage off a base of one. The
   comparison still has to be THERE — that is the whole ask — so the arrow is
   optional and the pair is not. */
check('a comparison off a tiny base still shows both numbers',
  /vs the day before\d+(\.\d)? → \d+/.test(tipNote), tipNote);

/* ----------------------------------------------------- the lifecycle tiles */

const tiles = {};
$('pgTilesToday').querySelectorAll('.tile').forEach((t) => {
  tiles[t.querySelector('.label').textContent.trim()] = [].slice.call(t.querySelectorAll('.deltas > div'))
    .map((d) => d.textContent.replace(/\s+/g, ' ').trim());
});
check('"Active in trial" is read against the days around it',
  (tiles['Active in trial'] || []).length > 0, JSON.stringify(tiles['Active in trial']));
check('"Active past the trial" too',
  (tiles['Active past the trial'] || []).length > 0, JSON.stringify(tiles['Active past the trial']));
check('...with the same three comparisons every other today tile carries',
  (tiles['Active in trial'] || []).join(' ').includes('the day before') &&
  (tiles['Active in trial'] || []).join(' ').includes('range average'),
  JSON.stringify(tiles['Active in trial']));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
if (errors.length) console.log('\nPage errors:\n' + errors.slice(0, 5).join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
