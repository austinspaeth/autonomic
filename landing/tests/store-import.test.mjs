/* Unit tests for master/storeimport.js — the reader for App Store Connect and
   Play Console CSV exports.

   This is the part of the import path with no safety net: a mis-matched column
   writes real numbers into the wrong field, and a missing column that reads as
   zero wipes a day the user typed in by hand. The module is pure text-in /
   plan-out for exactly that reason, so it is exercised here directly rather
   than through the built page.

   It is loaded the way the browser loads it — evaluated against a bare `window`
   — so the file under test stays a plain script with no module syntax. */
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = new URL('../master/storeimport.js', import.meta.url).pathname;
const sandbox = { window: {}, TextDecoder };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'storeimport.js' });
const SI = sandbox.window.StoreImport;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  check(name, a === b, `got ${a}, wanted ${b}`);
};

/* ------------------------------------------------------------- primitives */

eq('ISO dates pass through', SI.parseDate('2026-07-04'), '2026-07-04');
eq('US dates convert', SI.parseDate('7/4/2026'), '2026-07-04');
eq('written dates convert without a timezone slip', SI.parseDate('Jul 4, 2026'), '2026-07-04');
eq('a bare number is not a date', SI.parseDate('2026'), null);
eq('a metric value is not a date', SI.parseDate('1432'), null);

eq('plain values parse', SI.parseValue('1432'), 1432);
eq('thousands separators survive', SI.parseValue('1,432'), 1432);
eq('currency survives', SI.parseValue('$1,432.50'), 1432.5);
eq('abbreviated values expand', SI.parseValue('1.2K'), 1200);
eq('parenthesised amounts are negative', SI.parseValue('(12.99)'), -12.99);
/* The distinction the whole partial-merge design rests on: an absent value is
   null so it can be skipped, never 0, which would overwrite a real number. */
eq('an empty cell is absent, not zero', SI.parseValue(''), null);
eq('a dash is absent, not zero', SI.parseValue('—'), null);
eq('a real zero is zero', SI.parseValue('0'), 0);
eq('percentages are refused — rates are derived', SI.parseValue('23.4%'), null);

/* --------------------------------------------------------------- matching */

const field = (h) => { const c = SI.classify(h); return c.kind === 'metric' ? c.field : c.kind; };
eq('first-time downloads', field('First-Time Downloads'), 'downloads');
eq('play acquisitions are downloads', field('Store Listing Acquisitions'), 'downloads');
eq('play device installs are downloads', field('Daily Device Installs'), 'downloads');
eq('impressions', field('Impressions'), 'impressions');
eq('unique impressions', field('Unique Impressions'), 'impressions');
eq('product page views', field('Product Page Views'), 'pageViews');
eq('play listing visitors are page views', field('Store Listing Visitors'), 'pageViews');
eq('proceeds are money', field('Proceeds'), 'revenue');
/* Apple's "Sales" is customer spend, not a count of sales. Putting it in the
   dashboard's `sales` column would silently file dollars as conversions. */
eq('apple sales is money, not a count', field('Sales'), 'revenue');
eq('buyers are a count', field('Buyers'), 'sales');
eq('territory is a breakdown, not a metric', field('Territory'), 'dimension');
eq('conversion rate is ignored — it is derived', field('Conversion Rate'), 'dimension');
eq('the date column is the date column', field('Date'), 'date');

/* --------------------------------------------------------------- one file */

/* An App Store Connect chart export: one metric, a title and a blank line above
   the header, which is why the header has to be found rather than assumed. */
const appleImpressions = [
  'Impressions',
  'My App — App Store, Jul 1 2026 - Jul 3 2026',
  '',
  'Date,Impressions',
  '2026-07-01,1240',
  '2026-07-02,1310',
  '2026-07-03,980',
].join('\n');

let f = SI.readFile('App Store Connect - Impressions.csv', appleImpressions);
/* Blank lines are dropped by the row parser, so the header is index 2 of the
   rows that survive, not line 4 of the file. */
eq('preamble is skipped to find the header', f.headerIndex, 2);
eq('the file is recognised as iOS', f.platform, 'ios');
eq('every dated row is read', f.rowsRead, 3);
eq('values land per day', f.days['2026-07-02'], { impressions: 1310 });
check('only the metric the file carries is stated',
  Object.keys(f.days['2026-07-01']).join() === 'impressions', Object.keys(f.days['2026-07-01']).join());

/* A territory split of the same day has to sum, not overwrite. */
const split = [
  'Date,Territory,Product Page Views',
  '2026-07-01,United States,80',
  '2026-07-01,Canada,15',
  '2026-07-02,United States,90',
].join('\n');
f = SI.readFile('pageviews.csv', split);
eq('rows sharing a date are summed', f.days['2026-07-01'], { pageViews: 95 });

/* Play's statistics CSVs are UTF-16 — read as UTF-8 the header matches nothing. */
const playCsv = 'Date,Package Name,Daily Device Installs\n2026-07-01,care.autonomic,42\n';
const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(playCsv, 'utf16le')]);
const decoded = SI.decode(utf16.buffer.slice(utf16.byteOffset, utf16.byteOffset + utf16.byteLength));
check('UTF-16 with a BOM decodes', decoded.startsWith('Date,Package Name'), JSON.stringify(decoded.slice(0, 20)));
f = SI.readFile('installs_care.autonomic_202607_overview.csv', decoded);
eq('the file is recognised as Android', f.platform, 'android');
eq('play installs land as downloads', f.days['2026-07-01'], { downloads: 42 });

/* Two columns for one field: the more specific phrasing wins regardless of the
   order the console printed them in. */
f = SI.readFile('both.csv', 'Date,Total Downloads,First-Time Downloads\n2026-07-01,100,60\n');
eq('the more specific download column wins', f.days['2026-07-01'], { downloads: 60 });
check('the losing column is reported, not dropped silently',
  f.columns.some((c) => c.kind === 'superseded' && c.header === 'Total Downloads'));

/* A tab-separated export with dates across the top instead of down the side. */
f = SI.readFile('pivot.tsv', 'Metric\t2026-07-01\t2026-07-02\t2026-07-03\nImpressions\t10\t20\t30\nProduct Page Views\t1\t2\t3\n');
check('a pivoted export is detected', f.pivoted);
eq('pivoted values land per day', f.days['2026-07-02'], { impressions: 20, pageViews: 2 });

/* --------------------------------------------------------------- planning */

const impressionsFile = SI.readFile('asc-impressions.csv', appleImpressions);
const downloadsFile = SI.readFile('asc-downloads.csv',
  'Date,First-Time Downloads\n2026-07-01,31\n2026-07-02,44\n');
let p = SI.plan([impressionsFile, downloadsFile]);
eq('one row per day + platform', p.rows.length, 3);
eq('separate files merge into one day', p.rows[0].fields, { impressions: 1240, downloads: 31 });
/* The rule the dashboard depends on: a field no file mentioned is simply not in
   the plan, so the commit leaves whatever is already stored alone. */
check('untouched fields are absent from the plan, not zeroed',
  p.rows[0].fields.pageViews === undefined && p.rows[0].fields.revenue === undefined);
eq('the fields being written are reported', p.fields.sort(), ['downloads', 'impressions']);

/* A file with no recognisable platform is held back rather than guessed at. */
const anon = SI.readFile('export (3).csv', 'Date,Impressions\n2026-07-01,5\n');
eq('an unidentifiable file has no platform', anon.platform, null);
p = SI.plan([anon]);
eq('and contributes no rows', p.rows.length, 0);
eq('but says so by name', p.missingPlatform, ['export (3).csv']);
p = SI.plan([SI.applyOverrides('export (3).csv', 'Date,Impressions\n2026-07-01,5\n', { platform: 'android' })]);
eq('choosing the platform releases it', p.rows.length, 1);
eq('under the chosen platform', p.rows[0].platform, 'android');

/* Same metric, same day, two files: the later one wins and the clash is named. */
p = SI.plan([
  SI.readFile('appstore-a.csv', 'Date,Impressions\n2026-07-01,100\n'),
  SI.readFile('appstore-b.csv', 'Date,Impressions\n2026-07-01,120\n'),
]);
eq('the later file wins a clash', p.rows[0].fields.impressions, 120);
eq('and the clash is reported', p.conflicts.length, 1);

/* A file carrying its own platform column must not be filed under one store. */
f = SI.readFile('autonomic-data.csv',
  'date,platform,downloads,impressions\n2026-07-01,ios,10,100\n2026-07-01,android,5,50\n');
p = SI.plan([f]);
eq('a mixed file splits by its platform column', p.rows.length, 2);
eq('iOS row', p.rows.find((r) => r.platform === 'ios').fields, { downloads: 10, impressions: 100 });
eq('Android row', p.rows.find((r) => r.platform === 'android').fields, { downloads: 5, impressions: 50 });

/* Re-pointing a column by hand is what makes a renamed export recoverable. */
const odd = 'Date,Widget Views\n2026-07-01,77\n';
f = SI.readFile('odd.csv', odd);
eq('an unrecognised column is left unmapped', f.columns[1].kind, 'unknown');
f = SI.applyOverrides('odd.csv', odd, { platform: 'ios', columns: { 1: 'pageViews' } });
eq('and can be pointed at a field by hand', f.days['2026-07-01'], { pageViews: 77 });

/* Pointing a column at a field another column already holds displaces it, so
   the two can never sum into one number. */
const twoDownloadCols = 'Date,Total Downloads,First-Time Downloads\n2026-07-01,100,60\n';
f = SI.applyOverrides('both.csv', twoDownloadCols, { columns: { 1: 'downloads' } });
eq('re-pointing a column displaces the one that held that field',
  f.days['2026-07-01'], { downloads: 100 });

/* ----------------------------------------------------------------- report */

const failed = results.filter((r) => !r.ok);
results.forEach((r) => console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.ok ? '' : ` — ${r.detail}`}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
