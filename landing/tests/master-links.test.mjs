/* The Links tab, driven in the BUILT page.
 *
 * Campaign download links are the one thing on this dashboard that changes the
 * public site, so the wiring is what matters here rather than any arithmetic:
 * that a campaign typed into the form reaches the server as `linkUpserts` (the
 * payload the Lambda publishes a page from), that a path is validated before it
 * can become a URL, that changing a path retires the old one instead of leaving
 * two live pages, and that deleting takes the page down.
 *
 * sls/tests/links.test.mjs pins the other half: what the published page says.
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first.`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

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
let confirmed = true;
window.confirm = () => confirmed;
/* jsdom has no clipboard; the Copy button must not be what breaks the page. */
Object.defineProperty(window.navigator, 'clipboard', {
  value: { writeText: () => Promise.resolve() }, configurable: true,
});

const server = {
  entries: [], events: [], ads: [], costs: [], sales: [], links: [],
  settings: { trialDays: 14, currency: '$', storeCutPct: 15 },
  ui: { view: 'links', range: '30' },
};
const pushes = [];
const applySync = (p) => {
  pushes.push(p);
  (p.linkUpserts || []).forEach((row) => {
    const at = server.links.findIndex((x) => x.slug === row.slug);
    if (at >= 0) server.links[at] = row; else server.links.push(row);
  });
  (p.linkDeletes || []).forEach((slug) => {
    const at = server.links.findIndex((x) => x.slug === slug);
    if (at >= 0) server.links.splice(at, 1);
  });
  if (p.ui) server.ui = p.ui;
};

let republishes = 0;
window.fetch = (url, opts) => {
  const body = JSON.parse(opts.body);
  const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
  const reply = (obj) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(obj)) });
  if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
  if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
  if (body.action === 'LOAD') return reply(JSON.parse(JSON.stringify(server)));
  if (body.action === 'SYNC') { applySync(body.payload || {}); return reply({ ok: true }); }
  if (body.action === 'LINKS_REPUBLISH') { republishes += 1; return reply({ published: server.links.length, total: server.links.length, configured: true }); }
  if (body.action === 'PINGS') return reply({ since: body.payload.since, open: [], sub: [] });
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await new Promise((r) => setTimeout(r, 200));
const $ = (id) => window.document.getElementById(id);
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const saved = () => settle(1100);
const type = (id, v) => {
  const el = $(id);
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const toastText = () => ($('toast') || {}).textContent || '';

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await settle(150);
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await settle(350);

/* ------------------------------------------------------------- the tab */

check('there is a Links tab', !!window.document.querySelector('.tab[data-view="links"]'));
check('the view booted straight in', !$('view-links').classList.contains('hidden'));
check('the range filter is hidden — a list of URLs has no range',
  $('filterbar').classList.contains('hidden'));
check('an empty dashboard still shows the view rather than the empty state',
  $('emptyState').classList.contains('hidden'));
check('it says there are no links yet', /No campaign links yet/.test($('lkTable').textContent),
  $('lkTable').textContent.slice(0, 120));

/* ------------------------------------------------------------- publish */

$('lkAdd').click();
await settle(60);
check('the form opened', !!$('lkSlug'));

/* A path that cannot be a URL is refused before it can become one. */
type('lkSlug', 'Facebook Ads!');
$('lkSave').click();
await settle(40);
check('a path with capitals and spaces is refused', /lowercase letters/.test(toastText()), toastText());
check('and nothing was stored', !window.document.querySelector('[data-link-edit]'));

type('lkSlug', 'index');
$('lkSave').click();
await settle(40);
check('the reserved path /download/index is refused', /reserved/.test(toastText()), toastText());

type('lkSlug', 'facebook');
type('lkLabel', 'Facebook — August');
check('the preview names the URL it will publish at',
  /autonomic\.care\/download\/facebook/.test($('lkPreview').textContent), $('lkPreview').textContent);

$('lkIos').value = 'not a url';
$('lkSave').click();
await settle(40);
check('a destination that is not a URL is refused',
  /full http/.test(toastText()), toastText());

/* The fill button builds the tagged store URLs the site itself would build. */
$('lkIos').value = '';
$('lkFill').click();
await settle(40);
check('fill gives iOS an Apple campaign token',
  /apps\.apple\.com/.test($('lkIos').value) && /ct=Facebook/.test($('lkIos').value), $('lkIos').value);
check('fill gives Android a Play referrer',
  /play\.google\.com/.test($('lkAndroid').value) && /referrer=/.test($('lkAndroid').value), $('lkAndroid').value);

const pastedIos = $('lkIos').value;
$('lkFill').click();
await settle(40);
check('filling again never overwrites what is already there',
  $('lkIos').value === pastedIos && /already set/.test(toastText()), toastText());

$('lkSave').click();
await settle(60);
check('the link is listed', /\/download\/facebook/.test($('lkTable').textContent), $('lkTable').textContent.slice(0, 200));
check('the form closed behind it', !$('lkSlug'));

await saved();
const up = pushes.filter((p) => p.linkUpserts).at(-1);
check('it reached the server as a campaign the Lambda can publish',
  !!up && up.linkUpserts[0].slug === 'facebook' && /ct=Facebook/.test(up.linkUpserts[0].ios),
  String(JSON.stringify(up && up.linkUpserts)).slice(0, 220));
check('the campaign name travelled with it',
  !!up && up.linkUpserts[0].label === 'Facebook — August');

const before = pushes.length;
await saved();
check('a settled campaign stops being pushed', pushes.length === before,
  'pushed ' + (pushes.length - before) + ' more times');

/* ------------------------------------------------ a blank platform is legal */

$('lkAdd').click();
await settle(40);
type('lkSlug', 'podcast');
$('lkAndroid').value = 'https://play.google.com/store/apps/details?id=com.autonomic.journal&referrer=pod';
$('lkSave').click();
await settle(60);
await saved();
const podcast = server.links.find((l) => l.slug === 'podcast');
check('a link with only one destination publishes', !!podcast, JSON.stringify(server.links));
check('and the blank one is stored as blank rather than guessed',
  !!podcast && podcast.ios === undefined, JSON.stringify(podcast));
check('the table says the blank platform falls back to the default',
  /default/.test($('lkTable').textContent), $('lkTable').textContent.slice(0, 400));

/* ------------------------------------------------------ changing the path */

window.document.querySelector('[data-link-edit="podcast"]').click();
await settle(60);
type('lkSlug', 'podcast-two');
$('lkSave').click();
await settle(60);
await saved();
check('changing the path publishes the new link',
  server.links.some((l) => l.slug === 'podcast-two'), JSON.stringify(server.links.map((l) => l.slug)));
check('and takes the old page down rather than leaving two live',
  !server.links.some((l) => l.slug === 'podcast'), JSON.stringify(server.links.map((l) => l.slug)));
check('the delete was sent as such, so the Lambda removes the object',
  pushes.some((p) => (p.linkDeletes || []).includes('podcast')),
  JSON.stringify(pushes.map((p) => p.linkDeletes).filter(Boolean)));

/* A path already in use cannot be taken by a second campaign. */
window.document.querySelector('[data-link-edit="podcast-two"]').click();
await settle(60);
type('lkSlug', 'facebook');
$('lkSave').click();
await settle(40);
check('a path already in use is refused', /already taken/.test(toastText()), toastText());
$('lkCancel').click();

/* --------------------------------------------------------------- delete */

window.document.querySelector('[data-link-edit="podcast-two"]').click();
await settle(60);
$('lkDelete').click();
await settle(60);
await saved();
check('deleting removes the campaign', !server.links.some((l) => l.slug === 'podcast-two'),
  JSON.stringify(server.links.map((l) => l.slug)));
check('one campaign survives it', server.links.length === 1);

/* ------------------------------------------------------------ republish */

$('lkRepublish').click();
await settle(300);
check('the repair button asks the server to rewrite every page', republishes === 1);
check('and says how many it wrote', /Republished 1 page\b/.test($('lkRepublishStatus').textContent),
  $('lkRepublishStatus').textContent);

/* --------------------------------------------------------------- report */

check('no page errors', errors.length === 0, errors.join('\n'));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
