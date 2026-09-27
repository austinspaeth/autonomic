/* The Trial & conversion view's "Recent conversion" card, driven in the BUILT
   page against a fixture shaped like the question it exists to answer: a
   SURGE of installs that has not finished its trial yet.

   Fixture (iOS, 14-day trial, so a cohort finishes on day 15), relative to the
   dashboard's report day T(1):

     downloads   10 a day, except the last 10 days at 60 — the surge.
     sales       1 a day, except the last 7 days at 2.

   So over the last 7 days: 14 paid; the people who finished the trial in that
   window installed 15 days earlier (T(16)..T(22)), all at 10 a day, so 70 —
   a 20% rate. The 7 days before: 7 paid over 70, 10%, so +10 pts. Paid ÷
   installs for the same window is 14 / 420 = 3.33%, the diluted read the card
   is there to get away from. Installs still inside the trial are the cohorts
   aged 0 to 14 — fifteen days, T(1)..T(15): 10 × 60 + 5 × 10 = 650, against
   150 the fifteen days before — a 4.3× surge. */
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

const entries = [];
for (let i = 1; i <= 120; i++) {
  entries.push({
    date: T(i), platform: 'ios',
    downloads: i <= 10 ? 60 : 10,
    impressions: 1000, pageViews: 200,
    sales: i <= 7 ? 2 : 1, revenue: i <= 7 ? 19.98 : 9.99,
  });
}

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

const server = {
  entries, events: [], ads: [], costs: [],
  settings: { trialDays: 14, currency: '$', storeCutPct: 15 },
  ui: { view: 'trial', range: '30' },
};
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });
  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') return reply(JSON.parse(JSON.stringify(server)));
  if (body.action === 'PINGS') return reply({ since: body.payload.since, open: [], sub: [] });
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await settle(150);
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await settle(400);

check('the trial view is showing', !$('view-trial').classList.contains('hidden'));

const rows = {};
$('trRecent').querySelectorAll('tbody tr').forEach((tr) => {
  const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
  rows[cells[0].split(' (')[0]] = cells;
});

check('one row per window', ['Last 7 days', 'Last 14 days', 'Last 30 days', 'Last 60 days', 'Last 90 days']
  .every((k) => rows[k]), Object.keys(rows).join(' | '));

const w7 = rows['Last 7 days'] || [];
check('7-day paid', w7[1] === '14', w7[1]);
check('7-day denominator is the people who FINISHED the trial, not the surge', w7[2] === '70', w7[2]);
check('7-day conversion is 20%', w7[3] === '20.0%', w7[3]);
check('7-day carries a 95% interval around it', /^\d+\.\d–\d+\.\d%$/.test(w7[4] || ''), w7[4]);
check('7-day moved +10 pts on the week before', /▲\s*10\.0 pts/.test(w7[5] || ''), w7[5]);
check('paid ÷ installs shows the diluted read', w7[6] === '3.33%', w7[6]);

/* 30 days: paid 7×2 + 23×1 = 37; finished the trial = installs T(16)..T(45),
   all 10 a day = 300 → 12.3%. */
const w30 = rows['Last 30 days'] || [];
check('30-day conversion', w30[1] === '37' && w30[2] === '300' && w30[3] === '12.3%', w30.join(' | '));

/* 90 days reaches T(90)..T(1); its trial crossings reach back to T(105), which
   the 120-day fixture covers, so the window is complete. The window BEFORE it
   runs off the start of the data, so it has no comparison. */
const w90 = rows['Last 90 days'] || [];
check('90-day window is complete', !/days of data/.test(w90[0] || ''), w90[0]);
check('a previous window that runs past the history is not compared', w90[5] === '–', w90[5]);

const note = $('trRecent').textContent;
check('says how many installs are still in the trial', /650 installs are still inside the 14-day trial/.test(note), note);
check('calls out the surge', /4\.3×/.test(note), note);

check('the rolling chart rendered', !!$('trRolling').querySelector('svg'), $('trRolling').innerHTML.slice(0, 120));
check('the rolling chart names its three lines',
  ['Last 7 days', 'Last 30 days', 'Lifetime'].every((n) => $('trRolling').textContent.includes(n)),
  $('trRolling').textContent.slice(0, 200));

check('no script errors', errors.length === 0, errors.join('\n'));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? '  ok  ' : '  FAIL'}  ${r.name}${r.ok ? '' : `   <- ${r.detail}`}`);
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
