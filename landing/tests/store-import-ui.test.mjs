/* The store-export import card, driven through the BUILT page.

   store-import.test.mjs covers the reader; this covers everything between a
   dropped file and a stored entry — decode, stage, preview, remap, commit —
   because that is where the damage would be done. In particular it holds the
   line the whole feature rests on: importing a file that carries one metric
   must not touch the other five on a day that already exists.

   jsdom has no TextDecoder on `window` (every browser has had one since 2017),
   so it is supplied before the page runs. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first.`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  check(name, a === b, `got ${a}, wanted ${b}`);
};

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [
  b64u({ alg: 'RS256' }),
  b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

const dom = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
window.TextDecoder = TextDecoder;

window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });
  if (target === 'InitiateAuth') {
    return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  }
  if (target === 'RespondToAuthChallenge') {
    return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  }
  if (body.action === 'LOAD') return reply({ entries: [], settings: {} });
  return reply({ ok: true });
};

const $ = (id) => window.document.getElementById(id);
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => window.addEventListener('load', r));
await wait(300);

/* Sign in — the dashboard does not wire anything up until the pull lands. */
$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await wait(200);
[...$('gateCodeRow').querySelectorAll('input')].forEach((box, i) => {
  box.value = '1234'[i];
  box.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await wait(400);
check('signed in', !window.document.body.classList.contains('gated'));
check('the import card is on the page', !!$('siCard'));

/* Hand the file input a selection the way a drop would. */
async function drop(files) {
  const list = files.map(([name, text]) => new window.File([text], name, { type: 'text/csv' }));
  Object.defineProperty($('siFile'), 'files', { value: list, configurable: true });
  $('siFile').dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(80);
}
const entry = (date, platform) =>
  window.Dashboard.store().db.entries.find((e) => e.date === date && e.platform === platform);

/* --- an App Store Connect export: one file per chart, plus a Play report --- */

await drop([
  ['App Store Connect - Impressions.csv', 'Date,Impressions\n2026-07-01,1240\n2026-07-02,1310\n'],
  ['App Store Connect - Downloads.csv', 'Date,First-Time Downloads\n2026-07-01,31\n2026-07-02,44\n'],
  ['installs_care.autonomic_202607_overview.csv', 'Date,Package Name,Daily Device Installs\n2026-07-01,care.autonomic,42\n'],
]);
eq('all three files stage', $('siPreview').querySelectorAll('.si-file').length, 3);
check('the plan is offered for review before anything is written',
  /Merge 3 day-rows/.test($('siMerge').textContent) && window.Dashboard.store().db.entries.length === 0,
  $('siMerge').textContent);

$('siMerge').click();
await wait(80);
eq('three day-rows are stored', window.Dashboard.store().db.entries.length, 3);
eq('separate Apple files merge onto one day',
  [entry('2026-07-01', 'ios').downloads, entry('2026-07-01', 'ios').impressions], [31, 1240]);
eq('the Play file lands under Android', entry('2026-07-01', 'android').downloads, 42);
eq('metrics no file carried default to zero on a new row',
  [entry('2026-07-01', 'ios').pageViews, entry('2026-07-01', 'ios').revenue], [0, 0]);
check('the staged files are cleared after merging', $('siPreview').innerHTML === '');

/* --- the line this feature lives or dies on ------------------------------ */

await drop([['App Store Connect - Product Page Views.csv', 'Date,Product Page Views\n2026-07-01,210\n']]);
$('siMerge').click();
await wait(80);
eq('a single-metric import writes its own metric', entry('2026-07-01', 'ios').pageViews, 210);
eq('and leaves every other metric on that day alone',
  [entry('2026-07-01', 'ios').downloads, entry('2026-07-01', 'ios').impressions], [31, 1240]);
eq('no duplicate row is created', window.Dashboard.store().db.entries.length, 3);

/* --- a file whose store cannot be guessed --------------------------------- */

await drop([['export (3).csv', 'Date,Impressions\n2026-07-05,900\n']]);
check('an unidentifiable file is held back rather than guessed at',
  /Merge 0 day-rows/.test($('siMerge').textContent), $('siMerge').textContent);
const platSel = $('siPreview').querySelector('select[data-plat]');
platSel.value = 'android';
platSel.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(60);
check('choosing the platform releases it', /Merge 1 day-row\b/.test($('siMerge').textContent), $('siMerge').textContent);
$('siMerge').click();
await wait(80);
eq('and it lands where the user said', entry('2026-07-05', 'android').impressions, 900);

/* --- a renamed column, pointed at a field by hand ------------------------- */

await drop([['App Store Connect - Widget Views.csv', 'Date,Widget Views\n2026-07-06,77\n']]);
const colSel = [...$('siPreview').querySelectorAll('select[data-col]')].at(-1);
check('an unrecognised column starts unmapped', colSel.value === '', colSel.value);
colSel.value = 'pageViews';
colSel.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(60);
$('siMerge').click();
await wait(80);
eq('a remapped column imports as the chosen field', entry('2026-07-06', 'ios').pageViews, 77);

/* --- discard leaves nothing behind ---------------------------------------- */

const before = window.Dashboard.store().db.entries.length;
await drop([['App Store Connect - Impressions.csv', 'Date,Impressions\n2026-07-09,1\n']]);
$('siDiscard').click();
await wait(60);
check('discarding writes nothing', window.Dashboard.store().db.entries.length === before);
check('and clears the preview', $('siPreview').innerHTML === '');

const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.ok ? '' : ` — ${r.detail}`}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
