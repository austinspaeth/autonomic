/* "Live in the stores", on screen.

   store-versions.test.mjs pins the parse. This file's job is the other half:
   that the card reports what it was given, that it compares the two stores
   against the app's own release log, and — the point of the whole thing — that
   a store it could not read says so instead of showing a number.

   The fixture deliberately puts the two stores in DIFFERENT states, because
   that is the state the card exists for: a version cut and live on one store
   and not yet on the other is invisible everywhere else on this dashboard. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first (or \`npm run test:master\`).`);
  process.exit(1);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [
  b64u({ alg: 'RS256' }),
  b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

/* iOS is current with the newest logged release; Android could not be read.
   `newest` is whatever releases.js actually holds, so this fixture cannot go
   stale when a version is cut. */
const src = fs.readFileSync(new URL('../master/releases.js', import.meta.url).pathname, 'utf8');
const RELEASES = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
const NEWEST = RELEASES.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);

let versionCalls = 0;
const ANSWER = {
  at: Date.now(),
  ios: {
    version: NEWEST.version, released: NEWEST.date, source: 'itunes-lookup',
    country: 'US', url: 'https://apps.apple.com/app/id123',
  },
  android: {
    error: 'not-found',
    detail: 'No version in the listing page — Google publishes this only inside an undocumented blob',
    url: 'https://play.google.com/store/apps/details?id=com.autonomic.journal',
  },
};

const dom = new JSDOM(fs.readFileSync(PAGE, 'utf8'), {
  url: 'https://autonomic.care/master/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;

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
  if (body.action === 'LOAD') return reply({ entries: [], settings: {}, ui: null });
  if (body.action === 'PINGS') return reply({ open: [], sub: [] });
  if (body.action === 'STORE_VERSIONS') {
    versionCalls += 1;
    /* The second call is the "Check now" button, which must force past the
       Lambda's cache — a button that returns a cached answer is a button that
       does nothing the moment you press it after hitting Release. */
    if (versionCalls > 1) {
      return reply(Object.assign({}, ANSWER, {
        forced: !!body.payload.force,
        android: { version: '1.0.9', source: 'play-nested-json', url: ANSWER.android.url },
      }));
    }
    return reply(ANSWER);
  }
  return reply({ ok: true });
};

const errors = [];
window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));

await new Promise((r) => window.addEventListener('load', r));
await wait(150);
const $ = (id) => window.document.getElementById(id);

$('gateEmail').value = 'austinspaeth@msn.com';
$('gateSubmit').click();
await wait(60);
[...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
  el.value = '1234'[i];
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
});
await wait(200);

/* The card lives on the Timeline, above the release log it is compared with. */
window.document.querySelector('.tab[data-view="timeline"]').click();
await wait(250);

const text = () => $('tlStores').textContent.replace(/\s+/g, ' ');

check('the card is only asked for on the view that shows it', versionCalls === 1, String(versionCalls));
check('the App Store row carries the live version', new RegExp('v' + NEWEST.version.replace(/\./g, '\\.')).test(text()), text());
/* The row's spans are flex children, so textContent runs them together — the
   date is asserted by its own shape rather than by a word boundary. */
check('and the day it went live', /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, 20\d\d/.test(text()), text());
check('a store level with the newest logged release reads as current',
  /current/.test(text()), text());

/* THE assertion. Google publishes no version API, so this row is a scrape and
   it will break; when it does, the card has to say so rather than show the
   last number it managed to read. */
check('a store that could not be read says so, and shows no version',
  /Google has changed the listing page/.test(text()), text());
check('and gives the reason underneath, not just a shrug',
  /undocumented blob/.test(text()), text());
check('the Play Console is named as the authority when the two disagree',
  /Play Console/.test(text()), text());
check('Apple is named as an API and Google as not, so the two are not read alike',
  /lookup API/.test(text()) && /publishes none/.test(text()), text());

/* "Check now" forces a real round trip past the Lambda's half-hour cache. */
$('tlStoreRefresh').click();
await wait(250);
check('"Check now" goes and looks again', versionCalls === 2, String(versionCalls));
check('and forces past the cache', window.localStorage.getItem('autonomic.dashboard.v1.stores').includes('"forced":true'),
  window.localStorage.getItem('autonomic.dashboard.v1.stores'));
check('a store behind the release log is called out, not just listed',
  /not live here yet/.test(text()), text());
check('and the version it is behind is named', new RegExp('v' + NEWEST.version.replace(/\./g, '\\.')).test(text()), text());

/* The answer is cached like everything else on this page, so the card is not
   blank for a round trip on the next open. */
check('the answer is cached in localStorage',
  !!window.localStorage.getItem('autonomic.dashboard.v1.stores'));

check('no page errors', errors.length === 0, errors.join(' | '));

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
