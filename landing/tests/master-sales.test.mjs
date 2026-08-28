/* The Sales view and the purchase ledger, driven in the BUILT page.

   sales.test.mjs already pins the arithmetic. This file's job is the other
   half — the wiring, and one thing that only exists here:

   THE MIGRATION. Sales used to be two columns on a store entry. The fixture
   below is deliberately in the OLD shape, with `sales` and `revenue` on the
   days, so that booting the page has to convert them into ledger rows, strip
   the columns off the entries, and push both halves of that to the server. If
   that ever silently half-happens, every revenue figure in the dashboard is
   wrong and nothing else in the suite would notice.

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
const near = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

const pad = (n) => (n < 10 ? '0' + n : '' + n);
/* The dashboard's own day is US Eastern, not the machine's, so the fixture has
   to be built on the same calendar or a run from a non-Eastern box would place
   its ten days off by one and the range assertions would drift. This is the
   same arithmetic as `easternDay` in app.js and the ping Lambda. */
const nthSunday = (year, month, n) => {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
};
const isEasternDst = (ms) => {
  const year = new Date(ms).getUTCFullYear();
  return ms >= Date.UTC(year, 2, nthSunday(year, 2, 2), 7)
      && ms < Date.UTC(year, 10, nthSunday(year, 10, 1), 6);
};
const easternDay = (ms) => new Date(ms - (isEasternDst(ms) ? 4 : 5) * 3600000).toISOString().slice(0, 10);
const T = (back) => easternDay(Date.now() - back * 86400000);

const entries = [];
for (let i = 1; i <= 10; i++) {
  entries.push({ date: T(i), platform: 'ios', downloads: 20, impressions: 800, pageViews: 200, sales: 1, revenue: 9.99 });
}

/* A fortnight of pings, so the App usage view has something to draw rather than
   short-circuiting into its empty state. Two cohorts on two stores plus a
   letter-less pre-marker cohort, which is the case the platform split exists to
   disclose: those are installs whose STORE we failed to record, not installs on
   a third platform. */
const mmddyy = (isoDate) => isoDate.slice(5, 7) + isoDate.slice(8, 10) + isoDate.slice(2, 4);
const cohortRow = (cohortIso, platform, count) => ({
  key: mmddyy(cohortIso) + platform,
  cohortDate: mmddyy(cohortIso),
  cohort: cohortIso,
  platform,
  count,
});
const PING_OPEN = [];
const PING_SUB = [];
for (let i = 14; i >= 1; i--) {
  const day = T(i);
  const cohorts = [
    cohortRow(day, 'I', 6),
    cohortRow(day, 'A', 3),
    cohortRow(T(14), 'I', 4),
    cohortRow(T(30), 'U', 2),
  ];
  PING_OPEN.push({ day, total: cohorts.reduce((a, c) => a + c.count, 0), cohorts });
  if (i % 4 === 0) PING_SUB.push({ day, total: 1, cohorts: [cohortRow(T(14), 'I', 1)] });
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

const server = {
  entries: JSON.parse(JSON.stringify(entries)),
  events: [], ads: [], costs: [], sales: [],
  settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 },
  ui: { view: 'sales', range: '30' },
};
const applySync = (p) => {
  const upsert = (list, rows) => (rows || []).forEach((row) => {
    const at = list.findIndex((x) => x.id === row.id);
    if (at >= 0) list[at] = row; else list.push(row);
  });
  const remove = (list, ids) => (ids || []).forEach((id) => {
    const at = list.findIndex((x) => x.id === id);
    if (at >= 0) list.splice(at, 1);
  });
  (p.upserts || []).forEach((row) => {
    const at = server.entries.findIndex((x) => x.date === row.date && x.platform === row.platform);
    if (at >= 0) server.entries[at] = row; else server.entries.push(row);
  });
  upsert(server.sales, p.saleUpserts); remove(server.sales, p.saleDeletes);
  upsert(server.ads, p.adUpserts); remove(server.ads, p.adDeletes);
  upsert(server.costs, p.costUpserts); remove(server.costs, p.costDeletes);
  if (p.settings) server.settings = { ...server.settings, ...p.settings };
  if (p.ui) server.ui = p.ui;
};

const pushes = [];
const replaced = [];
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });

  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') return reply(JSON.parse(JSON.stringify(server)));
  if (body.action === 'SYNC') { pushes.push(body.payload || {}); applySync(body.payload || {}); return reply({ ok: true }); }
  if (body.action === 'REPLACE_ALL') {
    /* The Lambda wipes ENTRY# and SALE# and rewrites whatever it was sent, so
       the stub does the same. Answering a bare ok here would let a REPLACE_ALL
       that forgot to carry the sales pass this file. */
    replaced.push(body.payload || {});
    server.entries = (body.payload.entries || []).slice();
    server.sales = (body.payload.sales || []).slice();
    return reply({ ok: true });
  }
  if (body.action === 'PINGS') return reply({ since: body.payload.since, open: PING_OPEN, sub: PING_SUB });
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const saved = () => settle(1100);

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await settle(150);
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await settle(400);

/* ------------------------------------------------------------ the tab */

check('the Sales tab exists', !!window.document.querySelector('.tab[data-view="sales"]'));
check('the view booted straight in', !$('view-sales').classList.contains('hidden'));

/* ------------------------------------------------------- the migration */

await saved();

check('the old daily columns became ledger rows',
  server.sales.length === 10, String(server.sales.length));
check('and every one of them is unclassified — the old shape recorded no plan',
  server.sales.every((s) => s.plan === 'unknown'));
check('and carries no install date, because none was ever recorded',
  server.sales.every((s) => s.cohort === undefined));
check('the money survived exactly',
  near(server.sales.reduce((a, s) => a + s.price * s.qty, 0), 99.9),
  String(server.sales.reduce((a, s) => a + s.price * s.qty, 0)));
/* The other half of the migration, and the half that is easy to forget: the
   entries have to STOP carrying the columns, or the same money is counted
   twice the moment anything reads both. */
check('the store entries no longer carry sales or revenue',
  server.entries.every((e) => e.sales === undefined && e.revenue === undefined),
  JSON.stringify(server.entries[0]));
check('and it is stamped, so a second boot migrates nothing',
  server.settings.salesMigrated === true);
check('the entries kept their store numbers',
  server.entries.every((e) => e.downloads === 20));

/* ------------------------------------------------------------ layout */

/* A class name that exists in no stylesheet rule does not error, it just
   silently lays out as a block — which is how the Sales tiles and its paired
   cards shipped full-width and stacked. jsdom computes no layout, so the check
   that catches it is structural: this view has to reach for the SAME container
   classes every other view already uses, rather than inventing its own. */
const sheet = [...window.document.querySelectorAll('style')].map((n) => n.textContent).join('\n');
const classesOf = (id) => [...($(id).classList || [])];
const definedInCss = (cls) => new RegExp('\\.' + cls + '\\b').test(sheet);

check('the Sales tile strip uses the same container as every other view’s',
  classesOf('slTiles').join(' ') === classesOf('ovTiles').join(' '),
  classesOf('slTiles').join(' ') + ' vs ' + classesOf('ovTiles').join(' '));
check('and every class on it is actually defined in the stylesheet',
  classesOf('slTiles').every(definedInCss), classesOf('slTiles').join(' '));

/* Every multi-column row in the view, checked the same way. */
const rows = [...$('view-sales').querySelectorAll('div[class]')]
  .filter((n) => [...n.classList].some((c) => /^grid/.test(c) || /col|tiles|cards/.test(c)));
const undefinedClasses = [...new Set(rows.flatMap((n) => [...n.classList]).filter((c) => !definedInCss(c)))];
check('no layout class in the Sales view is invented',
  undefinedClasses.length === 0, undefinedClasses.join(', '));

/* ------------------------------------------------------------- tiles */

const tileText = () => {
  const out = {};
  $('slTiles').querySelectorAll('.tile').forEach((t) => {
    out[t.querySelector('.label').textContent.trim()] = {
      value: t.querySelector('.value').textContent.trim(),
      meta: (t.querySelector('.meta') || {}).textContent || '',
    };
  });
  return out;
};

let tiles = tileText();
check('bookings reach the screen', /99\.90/.test(tiles['Bookings in range'].value),
  tiles['Bookings in range'] && tiles['Bookings in range'].value);
/* The migrated rows are real money of an unknown TERM, so MRR must be zero and
   the tile must say why rather than reading as a book with nothing in it. */
const mrrTile = Object.keys(tiles).find((k) => k.indexOf('MRR on ') === 0);
check('there is an MRR tile', !!mrrTile);
check('and it reads zero for an all-unclassified book', /\$0/.test(tiles[mrrTile].value), tiles[mrrTile].value);
check('and it discloses the unclassified rows rather than staying silent',
  /unclassified/.test(tiles[mrrTile].meta), tiles[mrrTile].meta);
check('the plan mix names them', /Unclassified/.test($('slMix').textContent));

/* Size carries meaning on this strip: full size for the figures that say how
   big the book is, one step down for the ones that describe its texture. ARR is
   the case that has to be asserted, because it is MRR times twelve — a number
   rendered smaller than the number it is derived from reads as the lesser of
   the two, which is the opposite of true. */
const sizeOf = (label) => {
  const t = [...$('slTiles').querySelectorAll('.tile')]
    .find((n) => n.querySelector('.label').textContent.trim().indexOf(label) === 0);
  return t ? (t.querySelector('.value').classList.contains('small') ? 'small' : 'full') : 'missing';
};
check('ARR is not rendered smaller than the MRR it is twelve times',
  sizeOf('ARR') === sizeOf('MRR on'), sizeOf('ARR') + ' vs ' + sizeOf('MRR on'));
check('the figures that size the book are full size',
  ['MRR on', 'ARR', 'Bookings in range', 'New MRR', 'Active subscriptions']
    .every((l) => sizeOf(l) === 'full'),
  ['MRR on', 'ARR', 'Bookings in range', 'New MRR', 'Active subscriptions'].map((l) => l + '=' + sizeOf(l)).join(' '));
check('and the ones that describe its texture are a step down',
  ['Average price', 'Annual share', 'Refunds in range'].every((l) => sizeOf(l) === 'small'),
  ['Average price', 'Annual share', 'Refunds in range'].map((l) => l + '=' + sizeOf(l)).join(' '));
check('and says how to fix them', /set a plan on them/.test($('slMix').textContent));

/* -------------------------------------------- entering a real purchase */

$('btnEditData').click();
await settle(250);
check('Edit data has a Sales section',
  [...window.document.querySelectorAll('#view-data .section-title')].map((n) => n.textContent).includes('Sales'));
/* The two columns are gone from the single-day form: a purchase's plan is not a
   property of a day, so there is nowhere on a day to put it. */
check('the single-day form no longer offers a sales count', !$('eSales'));
check('nor a sales amount', !$('eRevenue'));
check('and neither does the bulk grid',
  !/>Sales</.test($('bulkGrid').innerHTML) && !/>Amount</.test($('bulkGrid').innerHTML));

$('slDate').value = T(2);
$('slPlan').value = 'annual';
$('slPrice').value = '29.99';
$('slCohort').value = T(40);
$('slSave').click();
await settle(200);

check('the purchase is in the ledger table', /Annual/.test($('slSaleTable').textContent));
check('and its MRR is shown as a twelfth of the price',
  /\$2\.50/.test($('slSaleTable').textContent), $('slSaleTable').textContent.slice(0, 300));
check('and its age at purchase is derived from the install date',
  /38d/.test($('slSaleTable').textContent));

/* A count above one has no single buyer, so the install date must become
   unavailable rather than accepting a value the ledger would silently drop. */
$('slQty').value = '3';
$('slQty').dispatchEvent(new window.Event('input', { bubbles: true }));
check('raising the count disables the install date', $('slCohort').disabled);
check('and says why', /no single buyer/.test($('slFormHint').textContent));
$('slQty').value = '1';
$('slQty').dispatchEvent(new window.Event('input', { bubbles: true }));
check('lowering it back re-enables the field', !$('slCohort').disabled);

await saved();
check('the purchase reached the server', server.sales.some((s) => s.plan === 'annual' && s.price === 29.99));
check('with its install date', server.sales.some((s) => s.cohort === T(40)));

/* ------------------------------------------------------------- paste */

$('slPaste').value = [T(3) + '\tios\tmonthly\t4.99\t' + T(6),
  T(4) + '\tandroid\tannual\t59.88',
  'not-a-date\tios\tmonthly\t4.99'].join('\n');
$('slPasteGo').click();
await settle(200);
check('a pasted batch lands', server.sales.length >= 12 || $('slSaleTable').textContent.includes('59.88') ||
  /Added 2 purchases/.test($('slPasteStatus').textContent), $('slPasteStatus').textContent);
/* The unreadable line stays in the box: a silent drop here is money you would
   swear you had entered. */
check('the unreadable line is kept, not dropped', /not-a-date/.test($('slPaste').value), $('slPaste').value);
check('and the status says how many were left behind', /1 line/.test($('slPasteStatus').textContent),
  $('slPasteStatus').textContent);

await saved();

/* -------------------------------------------------- back on the view */

$('btnEditData').click();
await settle(250);
window.document.querySelector('.tab[data-view="sales"]').click();
await settle(300);

tiles = tileText();
const mrr2 = Object.keys(tiles).find((k) => k.indexOf('MRR on ') === 0);
/* 29.99/12 + 4.99 + 59.88/12 = 2.4992 + 4.99 + 4.99 = 12.479 */
check('MRR now counts the real plans', /12\.48/.test(tiles[mrr2].value), tiles[mrr2].value);
check('ARR is twelve times it', /149\.7/.test(tiles.ARR.value), tiles.ARR.value);
check('the active-subscription tile counts three', tiles['Active subscriptions'].value.trim().startsWith('3'),
  tiles['Active subscriptions'].value);
check('annual share is two of the three recurring plans',
  /66\.7|66\.6/.test(tiles['Annual share'].value), tiles['Annual share'].value);

check('the days-to-purchase chart drew something', $('slAges').innerHTML.length > 100);
check('and reports its own coverage rather than implying it covers everything',
  /carry an install date/.test($('slAgeMeta').textContent), $('slAgeMeta').textContent);
check('the install-cohort table names an intake month', $('slCohorts').textContent.length > 20);

/* --------------------------------- the rest of the dashboard still adds up */

window.document.querySelector('.tab[data-view="overview"]').click();
await settle(300);
/* The whole point of folding the ledger back into `base()`: Overview never
   learned that sales moved, and its revenue must be the ledger's bookings. */
const ovText = $('ovTiles') ? $('ovTiles').textContent : window.document.getElementById('view-overview').textContent;
check('Overview still reports revenue after the move', /\$/.test(ovText));

window.document.querySelector('.tab[data-view="forecast"]').click();
await settle(300);
check('the forecast offers a plan mix', !!window.document.querySelector('#fcModel [data-v="mix"]'));
check('and defaults to it rather than to a single price',
  window.document.querySelector('#fcModel [data-v="mix"]').getAttribute('aria-pressed') === 'true');
const ctrlText = $('fcControls').textContent;
check('it asks for a monthly plan price', /Monthly plan price/.test(ctrlText));
check('and an annual one', /Annual plan price/.test(ctrlText));
check('and the share who choose annual', /Share who choose annual/.test(ctrlText));
check('the annual price came from the ledger, not from an assumption',
  /from your data/.test(ctrlText), ctrlText.slice(0, 200));
check('switching to one-time drops the plan controls', (() => {
  window.document.querySelector('#fcModel [data-v="onetime"]').click();
  return !/Share who choose annual/.test($('fcControls').textContent);
})());
window.document.querySelector('#fcModel [data-v="mix"]').click();
await settle(150);

/* ------------------------------------------------------- App usage bars */

window.document.querySelector('.tab[data-view="ping"]').click();
await settle(400);
check('the weekday chart compares purchases against subscribe pings',
  /Purchases \(ledger\)/.test($('pgWeekday').textContent) && /Subscribe pings/.test($('pgWeekday').textContent),
  $('pgWeekday').textContent.slice(0, 200));
check('the store split has a card of its own', !!$('pgPlatforms'));
check('and it names both stores', /iOS/.test($('pgPlatforms').textContent) && /Android/.test($('pgPlatforms').textContent),
  $('pgPlatforms').textContent.slice(0, 200));
/* Pre-marker pings are shown as their own band rather than folded into a store
   or dropped: they are the reason a filtered dashboard used to read as empty. */
check('pre-marker pings get their own band rather than being hidden',
  /No store recorded/.test($('pgPlatforms').textContent), $('pgPlatforms').textContent.slice(0, 300));
check('and the note under it says what they are',
  /pre-marker/.test($('pgPlatformNote').textContent), $('pgPlatformNote').textContent);
/* The number that answers "why is there no Android?". A marker that shipped
   last week reads exactly like an empty Android userbase, and only coverage
   climbing over the following weeks tells the two apart — so the card states it
   rather than leaving it to be inferred from the size of a grey band. */
check('the card states how much of the picture can be split at all',
  /Coverage/.test($('pgPlatformNote').textContent), $('pgPlatformNote').textContent);
check('and says a quiet store may mean "not measured yet" rather than "nobody there"',
  /not measured yet/.test($('pgPlatformNote').textContent), $('pgPlatformNote').textContent);

/* The bug this file was partly written for: switching the filter to one store
   used to empty the whole view, because every pre-marker ping was excluded from
   both slices at once. */
window.document.querySelector('#fPlatform [data-v="ios"]').click();
await settle(400);
check('filtering to iOS still shows pings', !/No pings yet/.test($('view-ping').textContent));
check('and the tiles are not blank', $('pgTilesToday').querySelectorAll('.tile').length > 0,
  String($('pgTilesToday').querySelectorAll('.tile').length));
check('the platform card stays unfiltered, because it is what the slice is OF',
  /Android/.test($('pgPlatforms').textContent));
check('and says pre-marker pings sit in neither store\'s slice',
  /not in either store's slice/.test($('pgPlatformNote').textContent), $('pgPlatformNote').textContent);

/* A PLATFORM SLICE IS STRICT. The day holds 10 iOS, 3 Android and 2 that named
   no store, and picking iOS shows the 10 — not 12.

   Pooling the unattributed pings into both slices is what this used to do, and
   it read as a bug the first time somebody hit it: iOS 12 + Android 5 over a
   combined 15, two slices that were mostly the same shared pool, and the two
   true numbers hidden behind it. The three buckets now add up to the total, and
   what a slice left out is stated beside the tiles rather than only in a card
   near the bottom of the view. */
const activeTileValue = () => {
  const t = [].slice.call($('pgTilesToday').querySelectorAll('.tile'))
    .filter((x) => x.querySelector('.label').textContent.trim().indexOf('Active on') === 0)[0];
  return t ? t.querySelector('.value').textContent.trim() : '';
};
/* 10, not 12: the 2 pre-marker pings are no longer added to this store's own
   count. That single number is the whole change. */
check('an iOS slice counts iOS pings only', activeTileValue() === '10', activeTileValue());

const filterNote = () => $('pgFilterNote').textContent.replace(/\s+/g, ' ');
check('a filtered slice says what it left out, in its heading',
  /iOS only — 2 installs are not in this slice/.test(filterNote()), filterNote());
check('and decomposes the day into all three buckets',
  /10 named iOS, 3 named Android, and 2 named no store/.test(filterNote()), filterNote());
check('and says the three add up rather than overlap',
  /add up to the combined total/.test(filterNote()), filterNote());
check('and records why they are not pooled into both stores any more',
  /sum to more than the total/.test(filterNote()), filterNote());
check('the headline tile says what it left out too, since that is the number being read',
  /not in this slice/.test($('pgTilesToday').textContent), $('pgTilesToday').textContent.slice(0, 240));

window.document.querySelector('#fPlatform [data-v="combined"]').click();
await settle(300);
/* Unfiltered, nothing is being pooled, so the note would be a false statement
   about an arithmetic that adds up perfectly well. */
check('and it goes away with the filter', $('pgFilterNote').textContent.trim() === '',
  $('pgFilterNote').textContent.slice(0, 120));

/* ------------------------------------------------- restoring a backup */

/* A backup taken BEFORE sales moved out of the daily columns is the only
   rollback there is, and it is worthless if restoring it puts the money on disk
   and nowhere on screen. The file below is exactly that shape: entries still
   carrying `sales` / `revenue`, and settings with no `salesMigrated`. Restoring
   it has to clear the flag and re-run the migration over those rows. */
$('btnEditData').click();
await settle(250);

const legacyBackup = JSON.stringify({
  entries: [{ date: T(20), platform: 'ios', downloads: 15, sales: 2, revenue: 19.98 }],
  settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15 },
});
const file = new window.File([legacyBackup], 'autonomic-backup.json', { type: 'application/json' });
Object.defineProperty($('ioFile'), 'files', { value: [file], configurable: true });
$('ioFile').dispatchEvent(new window.Event('change', { bubbles: true }));
await settle(400);

check('the restored day’s money reached the ledger',
  $('slSaleTable').textContent.includes('$9.99') || $('slSaleTable').textContent.includes('$19.98') ||
  /Unclassified/.test($('slSaleTable').textContent), $('slSaleTable').textContent.slice(0, 200));
await saved();
check('and it is on the server as an unclassified purchase',
  server.sales.some((x) => x.date === T(20) && x.plan === 'unknown' && x.qty === 2),
  JSON.stringify(server.sales.filter((x) => x.date === T(20))));
check('the restored entry kept its downloads and lost its sales columns',
  server.entries.some((e) => e.date === T(20) && e.downloads === 15 && e.sales === undefined),
  JSON.stringify(server.entries.find((e) => e.date === T(20))));

/* --------------------------------------------------- delete all data */

/* The wipe is stated outright rather than left to a diff, and it has to carry
   the sales: `Sync.replaceAll` adopts its own snapshot as the new baseline and
   cancels the pending push, so sale deletes produced a moment earlier would be
   discarded unsent and the ledger would survive on the server with no downloads
   under it. */
window.document.querySelector('.tab[data-view="overview"]').click();
await settle(200);
$('btnEditData').click();
await settle(250);
$('ioReset').click();
await settle(600);

check('the wipe was stated outright, not diffed', replaced.length === 1, String(replaced.length));
check('and it carried the sales, so the ledger goes with the entries',
  server.sales.length === 0 && server.entries.length === 0,
  server.entries.length + ' entries / ' + server.sales.length + ' sales');

/* ------------------------------------------- the ledger's own CSV, back in */

/* Export CSV writes `qty` and `refunded`; the paste box's documented column
   order has neither. Read positionally that file lands a count where an install
   date goes and a refund where a note goes, so the ledger cannot round-trip
   through its own entry path. A header row is what fixes it, and this is the
   file the export actually produces. */
$('slPaste').value = [
  'date,platform,plan,price,qty,cohort,cancelled,refunded,note',
  [T(5), 'ios', 'annual', '29.99', '1', T(30), '', '', 'a real one'].join(','),
  [T(6), 'android', 'unknown', '9.99', '3', '', '', '', 'a migrated total'].join(','),
  [T(7), 'ios', 'monthly', '4.99', '1', '', '', 'yes', 'refunded'].join(','),
].join('\n');
$('slPasteGo').click();
await settle(250);
check('the ledger CSV comes back in, header and all',
  /Added 3 purchases/.test($('slPasteStatus').textContent), $('slPasteStatus').textContent);
check('and the header line is not read as a purchase',
  !/left in the box/.test($('slPasteStatus').textContent), $('slPasteStatus').textContent);

await saved();
const backIn = (n) => server.sales.filter((s) => s.date === T(n))[0];
check('a count above one survives the trip', backIn(6) && backIn(6).qty === 3,
  JSON.stringify(backIn(6)));
check('and it carries no install date, because three buyers do not share one',
  backIn(6) && backIn(6).cohort === undefined, JSON.stringify(backIn(6)));
check('the install date on the single sale does survive', backIn(5) && backIn(5).cohort === T(30),
  JSON.stringify(backIn(5)));
check('and a refund comes back as a refund, not as a note',
  backIn(7) && backIn(7).refunded === true && !/yes/.test(String(backIn(7).note || '')),
  JSON.stringify(backIn(7)));

/* ---------------------------------------------------------- demo data */

/* The demo used to write `sales` / `revenue` back onto the store days, which
   `base()` no longer reads — so it produced a book whose every money figure was
   zero, silently, since those columns still parse and still sync. */
$('ioDemo').click();
await settle(600);
check('the demo builds a purchase ledger', $('slSaleTable').textContent.includes('Annual') &&
  /purchases on record/.test($('slSaleCount').textContent), $('slSaleCount').textContent);
check('with more than one plan in it',
  /Monthly/.test($('slSaleTable').textContent) && /Annual/.test($('slSaleTable').textContent));
check('and it writes no sales columns back onto the store days',
  (JSON.parse(window.localStorage.getItem('autonomic.dashboard.v1') || '{}').entries || [])
    .every((e) => e.sales === undefined && e.revenue === undefined),
  'entries still carry a sales column');

window.document.querySelector('.tab[data-view="sales"]').click();
await settle(400);
const demoTiles = tileText();
const demoMrr = Object.keys(demoTiles).find((k) => k.indexOf('MRR on ') === 0);
check('so the Sales view reads real money rather than zero',
  demoMrr && /[1-9]/.test(demoTiles[demoMrr].value), demoMrr && demoTiles[demoMrr].value);
check('and bookings are non-zero too',
  /[1-9]/.test(demoTiles['Bookings in range'].value), demoTiles['Bookings in range'].value);

window.document.querySelector('.tab[data-view="overview"]').click();
await settle(400);
const demoOv = $('ovTiles') ? $('ovTiles').textContent : '';
check('and Overview does as well', /\$[1-9\s,]*[1-9]/.test(demoOv), demoOv.slice(0, 200));

/* ------------------------------------------------------------- errors */

check('no page errors', errors.length === 0, errors[0]);

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
