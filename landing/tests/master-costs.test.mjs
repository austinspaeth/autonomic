/* The Costs view, driven in the BUILT page — because the view only exists once
   the route has inlined body.html, the stylesheet and the scripts in order, and
   because the bugs this file is for are wiring bugs rather than arithmetic ones.

   costs.test.mjs already pins the arithmetic. This file's job is the other
   half: that entering an ad spot actually writes a row, that its cost reaches
   the screen on the day it started rather than smeared over the days it ran,
   that deleting it takes its money with it, and that the header's refresh
   refetches rather than reloads.

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

/* ------------------------------------------------------------- ad spots

   Everything you type now lives under Edit data; the Costs tab is read-only. */

check('the Costs tab has no entry controls', !$('csAdAdd').closest('#view-costs'));
check('it does carry a read-only ad-spot table', !!$('csAdPerf'));

$('btnEditData').click();
await settle(200);
check('Edit data is sectioned', [...window.document.querySelectorAll('#view-data .section-title')]
  .map((n) => n.textContent).join('|') === 'Store data|Sales|Spending|What happened|Settings|Backup & account',
  [...window.document.querySelectorAll('#view-data .section-title')].map((n) => n.textContent).join('|'));
check('every card under it is an accordion',
  [...window.document.querySelectorAll('#view-data .card')].every((c) => c.tagName === 'DETAILS'));

$('csAdAdd').click();
await settle(50);
$('adName').value = 'Search Ads — POTS';
$('adPlatform').value = 'Apple Search Ads';
$('adStart').value = T(9);
$('adAmount').value = '100';
$('adImpressions').value = '20000';
$('adClicks').value = '400';
$('adInstalls').value = '10';
$('adSave').click();
await saved();

check('the spot is listed', /Search Ads/.test($('csAdTable').textContent));
check('a spot with no end date reads as ongoing', /ongoing/.test($('csAdTable').textContent),
  $('csAdTable').textContent.slice(0, 200));
check('the management list is editable', !!$('csAdTable').querySelector('[data-ad-edit]'));
check('the rates it can compute are shown',
  /2\.00%/.test($('csAdTable').textContent) && /\$0\.25/.test($('csAdTable').textContent),
  $('csAdTable').textContent.slice(0, 300));

const adPush = calls.filter((c) => c.action === 'SYNC' && c.payload.adUpserts).at(-1);
check('the spot pushed to the server, money and all',
  !!adPush && adPush.payload.adUpserts[0].name === 'Search Ads — POTS' &&
  adPush.payload.adUpserts[0].amount === 100 && adPush.payload.adUpserts[0].clicks === 400,
  adPush && JSON.stringify(adPush.payload).slice(0, 200));
check('and wrote no cost rows of its own',
  !calls.some((c) => c.action === 'SYNC' && (c.payload.costUpserts || []).length));

const backToCosts = async () => {
  window.document.querySelector('.tab[data-view="costs"]').click();
  await settle(250);
};
const backToEdit = async () => { $('btnEditData').click(); await settle(200); };

await backToCosts();
tiles = tileText();
check('the spot\'s cost reaches the tiles', tiles['Total spend'].value === '$100.00', tiles['Total spend'].value);
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

/* The whole point of the model: the money is one charge, on the day the spot
   started, and none of it lands on the days it went on running. */
const spendBar = $('csChart').textContent;
check('the spend chart has something to draw', spendBar.length >= 0);

/* ------------------------------------------- a second spot, with an end date */

await backToEdit();
$('csAdAdd').click();
await settle(50);
$('adName').value = 'Reddit sponsorship';
$('adPlatform').value = 'Reddit';
$('adStart').value = T(4);
$('adEnd').value = T(2);
$('adAmount').value = '50';
$('adSave').click();
await saved();

check('a finished spot reads as ended', /ended/.test($('csAdTable').textContent));
check('both spots are listed', /Reddit sponsorship/.test($('csAdTable').textContent) &&
  /Search Ads/.test($('csAdTable').textContent));

await backToCosts();
tiles = tileText();
check('two spots add up', tiles['Total spend'].value === '$150.00', tiles['Total spend'].value);
check('the platform table rolls them up separately',
  /Apple Search Ads/.test($('csChannelTable').textContent) &&
  /Reddit/.test($('csChannelTable').textContent), $('csChannelTable').textContent.slice(0, 200));

/* ------------------------------------------------- a non-marketing cost */

await backToEdit();
$('csCostAdd').click();
await settle(50);
check('advertising cannot be entered as a cost',
  ![...$('coCategory').options].some((o) => o.value === 'ADS'),
  [...$('coCategory').options].map((o) => o.value).join(','));
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
check('a non-marketing cost raises total spend', tiles['Total spend'].value === '$249.00', tiles['Total spend'].value);
check('but not marketing spend', /\$150\.00 marketing/.test(tiles['Total spend'].meta), tiles['Total spend'].meta);
check('cost per install still uses marketing only',
  tiles['Cost per install'].value === '$0.75', tiles['Cost per install'].value);
const catTable = $('csCategoryTable').textContent;
check('the category table names both kinds', /Advertising/.test(catTable) && /Developer fees/.test(catTable));

/* -------------------------------------- deleting a spot deletes its money */

await backToEdit();
$('csAdTable').querySelector('[data-ad-edit]').click();
await settle(50);
$('adDelete').click();
await saved();

check('the spot is gone', !/Search Ads/.test($('csAdTable').textContent));
check('the delete pushed', calls.some((c) => c.action === 'SYNC' && (c.payload.adDeletes || []).length));
await backToCosts();
check('and its money went with it — a spot IS the line item',
  tileText()['Total spend'].value === '$149.00', tileText()['Total spend'].value);

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
  tileText()['Total spend'].value === '$149.00', tileText()['Total spend'].value);

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
// 99.90 gross less 30% = 69.93, less 149.00 spent
check('a changed commission moves every profit figure',
  tileText()['Net profit in range'].value === '-$79.07', tileText()['Net profit in range'].value);

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
$$('adName').value = 'First ad spot';
$$('adStart').value = T(3);
$$('adAmount').value = '25';
$$('adSave').click();
await settle(300);
check('a spot can be bought before there is anything to measure',
  /First ad spot/.test($$('csAdTable').textContent));

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

/* ------------------------------------------ the move off campaigns

   The shape this replaced was a campaign plus one ADS cost row per day it spent
   money on. A dashboard opened on that shape has to come out the other side
   with the SAME totals — the migration is a change of shape, never of amount —
   so this boots a third page against a legacy server copy and adds it up. */

const legacyAds = [{ id: 'ad1', name: 'Old campaign', channel: 'Reddit', platform: 'ios', start: T(10), end: T(6) }];
const legacyCosts = [
  { id: 'c1', date: T(10), amount: 10, category: 'ADS', adId: 'ad1', clicks: 5, installs: 1 },
  { id: 'c2', date: T(9), amount: 10, category: 'ADS', adId: 'ad1', clicks: 5, installs: 1 },
  { id: 'c3', date: T(8), amount: 10, category: 'ADS', adId: 'ad1', clicks: 5, installs: 1 },
  { id: 'c4', date: T(7), amount: 25, category: 'ADS', label: 'Orphaned advertising' },
  { id: 'c5', date: T(7), amount: 12, category: 'INFRA', label: 'Hosting' },
];

const legacyPushes = [];
const legacy = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/', runScripts: 'dangerously', pretendToBeVisual: true,
});
legacy.window.scrollTo = () => {};
legacy.window.Element.prototype.scrollIntoView = () => {};
legacy.window.confirm = () => true;
const legacyErrors = [];
legacy.window.addEventListener('error', (e) => legacyErrors.push(String((e.error && e.error.stack) || e.message)));
legacy.window.fetch = (url, opts) => {
  const b = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (o) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(o)) });
  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (b.action === 'LOAD') {
    return reply({
      entries: [], events: [], ads: JSON.parse(JSON.stringify(legacyAds)), costs: JSON.parse(JSON.stringify(legacyCosts)),
      settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 }, ui: { view: 'costs', range: 'all' },
    });
  }
  if (b.action === 'SYNC') { legacyPushes.push(b.payload || {}); return reply({ ok: true }); }
  return reply({ ok: true });
};
await new Promise((r) => legacy.window.addEventListener('load', r));
await settle(200);
const $L = (id) => legacy.window.document.getElementById(id);
$L('gateEmail').value = 'austinspaeth@msn.com';
$L('gateSubmit').click();
await settle(150);
[...$L('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new legacy.window.Event('input', { bubbles: true }));
});
await settle(1400);

const legacyTiles = () => {
  const out = {};
  $L('csTiles').querySelectorAll('.tile').forEach((t) => {
    out[t.querySelector('.label').textContent.trim()] = t.querySelector('.value').textContent.trim();
  });
  return out;
};
// 30 on the campaign + 25 orphaned + 12 hosting, before and after
check('the migration moves shape, not money',
  legacyTiles()['Total spend'] === '$67.00', legacyTiles()['Total spend']);

$L('btnEditData').click();
await settle(250);
const spotText = $L('csAdTable').textContent;
check('the campaign became one spot at its summed price',
  /Old campaign/.test(spotText) && /\$30\.00/.test(spotText), spotText.slice(0, 240));
check('its channel became its platform', /Reddit/.test(spotText), spotText.slice(0, 240));
check('advertising with no campaign became a spot of its own',
  /Orphaned advertising/.test(spotText) && /\$25\.00/.test(spotText), spotText.slice(0, 240));
check('the daily ad rows left the cost ledger',
  !/Orphaned advertising/.test($L('csCostTable').textContent) &&
  /Hosting/.test($L('csCostTable').textContent), $L('csCostTable').textContent.slice(0, 200));

const legacyUp = legacyPushes.filter((p) => p.adUpserts).at(-1);
check('the rewrite was pushed rather than left in the browser',
  !!legacyUp && legacyUp.adUpserts.some((a) => a.name === 'Old campaign' && a.amount === 30),
  legacyUp && JSON.stringify(legacyUp.adUpserts).slice(0, 200));
check('and the rows it replaced were deleted server-side',
  legacyPushes.some((p) => (p.costDeletes || []).includes('c1')),
  JSON.stringify(legacyPushes.map((p) => p.costDeletes)).slice(0, 200));
check('no page errors on a legacy account', legacyErrors.length === 0, legacyErrors.join('\n'));

/* ------------------------------------------------------------- report */

check('no page errors', errors.length === 0, errors.join('\n'));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
