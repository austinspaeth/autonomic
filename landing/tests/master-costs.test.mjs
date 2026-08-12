/* The Costs view, driven in the BUILT page — because the view only exists once
   the route has inlined body.html, the stylesheet and the scripts in order, and
   because the bugs this file is for are wiring bugs rather than arithmetic ones.

   costs.test.mjs already pins the arithmetic. This file's job is the other
   half: that entering a campaign and its spend actually writes rows, that the
   numbers reach the screen, that the money survives deleting the campaign it
   belonged to, and that the header's refresh refetches rather than reloads.

   The store fixture is 10 days of iOS data ending on the dashboard's report day
   (yesterday — store reporting lags), 20 downloads and 1 sale at 9.99 a day. */
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
for (let i = 1; i <= 10; i++) {
  entries.push({ date: T(i), platform: 'ios', downloads: 20, impressions: 800, pageViews: 200, sales: 1, revenue: 9.99 });
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
window.confirm = () => true;

/* A tiny in-memory server rather than a fixed LOAD reply: the refresh button's
   whole job is to pull the server's copy over the local one, and against a stub
   that always answers "no costs" a passing refresh test would only prove the
   data had been thrown away. Applying the pushes makes the round trip real. */
const server = { entries, events: [], ads: [], costs: [], settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 }, ui: { view: 'costs', range: '30' } };
const applySync = (p) => {
  const upsert = (list, rows) => (rows || []).forEach((row) => {
    const at = list.findIndex((x) => x.id === row.id);
    if (at >= 0) list[at] = row; else list.push(row);
  });
  const remove = (list, ids) => (ids || []).forEach((id) => {
    const at = list.findIndex((x) => x.id === id);
    if (at >= 0) list.splice(at, 1);
  });
  upsert(server.ads, p.adUpserts); remove(server.ads, p.adDeletes);
  upsert(server.costs, p.costUpserts); remove(server.costs, p.costDeletes);
  upsert(server.events, p.eventUpserts); remove(server.events, p.eventDeletes);
  if (p.settings) server.settings = { ...server.settings, ...p.settings };
  if (p.ui) server.ui = p.ui;
};

const calls = [];
let loads = 0;
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  calls.push({ target, action: body.action, payload: body.payload });
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });

  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') {
    loads += 1;
    return reply(JSON.parse(JSON.stringify(server)));
  }
  if (body.action === 'SYNC') { applySync(body.payload || {}); return reply({ ok: true }); }
  if (body.action === 'PINGS') return reply({ since: body.payload.since, open: [], sub: [] });
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
/* Sync debounces a burst of saves into one push (900ms), so anything asserting
   on what reached the server has to outwait it rather than race it. */
const saved = () => settle(1100);

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await settle(150);
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await settle(350);

/* --------------------------------------------------------- the tab itself */

check('Explore is gone', !window.document.querySelector('.tab[data-view="explore"]'));
check('Costs replaced it', !!window.document.querySelector('.tab[data-view="costs"]'));
check('the view booted straight in', !$('view-costs').classList.contains('hidden'));
check('the platform filter is hidden here', $('fgPlatform').classList.contains('hidden'));
check('the "data through" line is gone from the filter bar', !$('reportDayValue'));

const tileText = () => {
  const out = {};
  $('csTiles').querySelectorAll('.tile').forEach((t) => {
    out[t.querySelector('.label').textContent.trim()] = {
      value: t.querySelector('.value').textContent.trim(),
      meta: (t.querySelector('.meta') || {}).textContent || '',
    };
  });
  return out;
};

let tiles = tileText();
check('eight tiles', Object.keys(tiles).length === 8, Object.keys(tiles).join(' | '));
check('spend starts at zero', tiles['Total spend'].value === '$0.00', tiles['Total spend'].value);
/* 10 days × 9.99 = 99.90 gross, less 15% = 84.915 → the whole thing is profit
   while nothing has been spent. */
check('profit with no costs is all the net revenue',
  tiles['Net profit in range'].value === '$84.91', tiles['Net profit in range'].value);
check('spending nothing costs nothing per install',
  tiles['Cost per install'].value === '$0.00', tiles['Cost per install'].value);

/* ------------------------------------------------------------- campaigns

   Everything you type now lives under Edit data; the Costs tab is read-only. */

check('the Costs tab has no entry controls', !$('csAdAdd').closest('#view-costs'));
check('it does carry a read-only campaign table', !!$('csAdPerf'));

$('btnEditData').click();
await settle(200);
check('Edit data is sectioned', [...window.document.querySelectorAll('#view-data .section-title')]
  .map((n) => n.textContent).join('|') === 'Store data|Spending|Settings|Backup & account',
  [...window.document.querySelectorAll('#view-data .section-title')].map((n) => n.textContent).join('|'));

$('csAdAdd').click();
await settle(50);
$('adName').value = 'Search Ads — POTS';
$('adChannel').value = 'Apple Search Ads';
$('adStart').value = T(9);
$('adSave').click();
await saved();

check('the campaign is listed', /Search Ads/.test($('csAdTable').textContent));
check('a campaign with no end date reads as running', /running/.test($('csAdTable').textContent));
check('the management list is editable', !!$('csAdTable').querySelector('[data-ad-edit]'));

const adPush = calls.filter((c) => c.action === 'SYNC' && c.payload.adUpserts).at(-1);
check('the campaign pushed to the server',
  !!adPush && adPush.payload.adUpserts[0].name === 'Search Ads — POTS',
  adPush && JSON.stringify(adPush.payload).slice(0, 160));

/* --------------------------------------------------------- the spend grid */

$('csGridFrom').value = T(9);
$('csGridTo').value = T(5);
$('csGridBuild').click();
await settle(80);

const cells = [...$('csGrid').querySelectorAll('input[data-day]')];
check('the grid built a row per day', cells.length === 5, String(cells.length));
/* Newest day first, matching every other list in the dashboard. */
check('the grid runs newest first', cells[0].dataset.day === T(5), cells[0].dataset.day);

cells.forEach((el) => { el.value = '20'; });
$('csGridSave').click();
await saved();

const backToCosts = async () => {
  window.document.querySelector('.tab[data-view="costs"]').click();
  await settle(250);
};
const backToEdit = async () => { $('btnEditData').click(); await settle(200); };

await backToCosts();
tiles = tileText();
check('grid spend reaches the tiles', tiles['Total spend'].value === '$100.00', tiles['Total spend'].value);
check('spend is all marketing', /\$100\.00 marketing/.test(tiles['Total spend'].meta), tiles['Total spend'].meta);
// 100 spent over 10 days × 20 downloads = 200 downloads → 0.50 each
check('cost per install is blended over every download',
  tiles['Cost per install'].value === '$0.50', tiles['Cost per install'].value);
// 10 sales in range
check('cost per paid conversion divides by sales',
  tiles['Cost per paid conversion'].value === '$10.00', tiles['Cost per paid conversion'].value);
check('profit came down by exactly what was spent',
  tiles['Net profit in range'].value === '-$15.09', tiles['Net profit in range'].value);
check('a loss is not dressed up as a gain',
  tiles['Net profit in range'].value.startsWith('-'));

const gridPush = calls.filter((c) => c.action === 'SYNC' && c.payload.costUpserts).at(-1);
check('the daily rows pushed as costs',
  !!gridPush && gridPush.payload.costUpserts.length > 0 &&
  gridPush.payload.costUpserts.every((c) => c.category === 'ADS' && c.amount === 20),
  gridPush && String(gridPush.payload.costUpserts.length));

/* Blanking a cell means "that day cost nothing", which is a deletion. */
await backToEdit();
const firstCell = [...$('csGrid').querySelectorAll('input[data-day]')][0];
firstCell.value = '';
$('csGridSave').click();
await saved();
await backToCosts();
tiles = tileText();
check('blanking a cell removes that day\'s cost', tiles['Total spend'].value === '$80.00', tiles['Total spend'].value);
const delPush = calls.filter((c) => c.action === 'SYNC' && c.payload.costDeletes).at(-1);
check('the removal pushed a delete', !!delPush, delPush && JSON.stringify(delPush.payload).slice(0, 120));

/* ------------------------------------------------------- spread a total */

await backToEdit();
$('csSpreadFrom').value = T(4);
$('csSpreadTo').value = T(2);
$('csSpreadTotal').value = '100';
$('csSpreadInstalls').value = '7';
$('csSpreadGo').click();
await saved();

check('the spread splits to the cent with the remainder on the last day',
  /33\.34/.test($('csCostTable').textContent), 'no 33.34 in the cost list');
check('reported installs are spread too', /\b7\b/.test($('csAdTable').textContent),
  $('csAdTable').textContent.slice(0, 200));

await backToCosts();
tiles = tileText();
check('a spread total adds to the spend', tiles['Total spend'].value === '$180.00', tiles['Total spend'].value);
/* 100 over 3 days is 33.33, 33.33, 33.34 — the remainder lands on the last day
   so the days still add to exactly what was spent. */

/* ------------------------------------------------- a non-marketing cost */

await backToEdit();
$('csCostAdd').click();
await settle(50);
$('coDate').value = T(6);
$('coCategory').value = 'FEES';
$('coLabel').value = 'Apple Developer Program';
$('coAmount').value = '99';
$('coRecurrence').value = 'yearly';
$('coSave').click();
await saved();
check('the recurrence is shown on the row', /every year/i.test($('csCostTable').textContent));

await backToCosts();
tiles = tileText();
check('a non-marketing cost raises total spend', tiles['Total spend'].value === '$279.00', tiles['Total spend'].value);
check('but not marketing spend', /\$180\.00 marketing/.test(tiles['Total spend'].meta), tiles['Total spend'].meta);
check('cost per install still uses marketing only',
  tiles['Cost per install'].value === '$0.90', tiles['Cost per install'].value);
const catTable = $('csCategoryTable').textContent;
check('the category table names both kinds', /Advertising/.test(catTable) && /Developer fees/.test(catTable));
check('the channel table rolls up the campaign', /Apple Search Ads/.test($('csChannelTable').textContent));

/* ------------------------------------------ deleting a campaign keeps money */

const beforeDelete = tileText()['Total spend'].value;
await backToEdit();
$('csAdTable').querySelector('[data-ad-edit]').click();
await settle(50);
$('adDelete').click();
await saved();

check('the campaign is gone', !/Search Ads/.test($('csAdTable').textContent));
check('the orphaned spend is labelled, not hidden',
  /Unattributed/.test($('csAdTable').textContent), $('csAdTable').textContent.slice(0, 120));
await backToCosts();
check('its spend is not', tileText()['Total spend'].value === beforeDelete, tileText()['Total spend'].value);

/* ------------------------------------------------------ the refresh button */

const loadsBefore = loads;
$('btnRefresh').click();
check('refresh says it is working', $('btnRefresh').dataset.busy === 'true');
await settle(900);
check('refresh refetched from the server', loads === loadsBefore + 1, `${loadsBefore} -> ${loads}`);
check('refresh stopped spinning', $('btnRefresh').dataset.busy === 'false');
/* The whole point of the button is not reloading. A refresh that adopted the
   server's stored UI would also throw the reader off whichever view they were
   on the moment another device changed tabs. */
check('refresh stayed on this view', !$('view-costs').classList.contains('hidden'));
check('refresh kept every cost it pulled back',
  tileText()['Total spend'].value === '$279.00', tileText()['Total spend'].value);

/* ------------------------------------------------------------ the settings */

await backToEdit();
check('sign out moved into Edit data', !!$('btnSignOut') && !$('btnSignOut').closest('.topbar'));
check('the account card names the signed-in user', $('whoami').textContent === 'austinspaeth@msn.com');
check('the commission setting is on screen', $('fStoreCut').value === '15');

$('fStoreCut').value = '30';
$('fStoreCut').dispatchEvent(new window.Event('change', { bubbles: true }));
await settle(150);
window.document.querySelector('.tab[data-view="costs"]').click();
await settle(250);
// 99.90 gross less 30% = 69.93, less 279.00 spent
check('a changed commission moves every profit figure',
  tileText()['Net profit in range'].value === '-$209.07', tileText()['Net profit in range'].value);

/* ------------------------------------------- costs before any store data

   A fresh account pays the developer programme months before it has a download
   to report. base() folds cost dates into the dashboard's date spine for
   exactly that reason, which means a write to costs has to drop the derived
   cache the same way a write to entries does — without it the first cost lands
   outside a range that was computed before it existed, and disappears. */

const bare = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/', runScripts: 'dangerously', pretendToBeVisual: true,
});
bare.window.scrollTo = () => {};
bare.window.Element.prototype.scrollIntoView = () => {};
bare.window.confirm = () => true;
const bareErrors = [];
bare.window.addEventListener('error', (e) => bareErrors.push(String((e.error && e.error.stack) || e.message)));
bare.window.fetch = (url, opts) => {
  const b = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (o) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(o)) });
  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (b.action === 'LOAD') {
    return reply({ entries: [], events: [], ads: [], costs: [], settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 }, ui: { view: 'costs' } });
  }
  return reply({ ok: true });
};
await new Promise((r) => bare.window.addEventListener('load', r));
await settle(200);
const $$ = (id) => bare.window.document.getElementById(id);
$$('gateEmail').value = 'austinspaeth@msn.com';
$$('gateSubmit').click();
await settle(150);
[...$$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new bare.window.Event('input', { bubbles: true }));
});
await settle(350);

check('the Costs view stands up with no store data at all', !$$('view-costs').classList.contains('hidden'));
check('the empty state did not swallow it', $$('emptyState').classList.contains('hidden'));

$$('btnEditData').click();
await settle(200);
$$('csAdAdd').click();
await settle(50);
$$('adName').value = 'First campaign';
$$('adStart').value = T(3);
$$('adSave').click();
await settle(300);
check('a campaign can be created before there is anything to measure',
  /First campaign/.test($$('csAdTable').textContent));

$$('csCostAdd').click();
await settle(50);
$$('coDate').value = T(2);
$$('coLabel').value = 'Apple Developer Program';
$$('coAmount').value = '99';
$$('coSave').click();
await settle(300);
check('the first cost on a fresh account is visible immediately',
  /Apple Developer Program/.test($$('csCostTable').textContent),
  $$('csCostTable').textContent.slice(0, 120));
check('no page errors on an empty account', bareErrors.length === 0, bareErrors.join('\n'));

/* ------------------------------------------------------------- report */

check('no page errors', errors.length === 0, errors.join('\n'));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
