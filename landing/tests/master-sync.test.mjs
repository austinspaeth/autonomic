/* An edit must survive the page going away before its push did.

   The dashboard paints from its localStorage cache and then pulls the server's
   copy over the top of it — on every open, and on every five-minute refresh. A
   purchase added while a push was failing, or on a phone that suspended the PWA
   inside the push's debounce, used to be erased by that pull: from the server
   (it never arrived) and from this browser (the pull replaced the cache), with
   nothing on screen to say so. sync.js now persists the baseline it diffs
   against, so the unsent edit is measurable on the next open and laid back
   over the pull.

   Runs against the BUILT page, like every other master test. */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const PAGE = new URL('../build/master/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first (or \`npm run test:master\`).`);
  process.exit(1);
}
const html = fs.readFileSync(PAGE, 'utf8');

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return iso(d); };

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [b64u({ alg: 'RS256' }), b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }), 'sig'].join('.');

const KEY = 'autonomic.dashboard.v1';
const BASELINE = 'autonomic.master.syncBaseline.v1';

/* What the server holds throughout: one iOS purchase and one churn row. */
const SERVER = {
  entries: [{ date: T(3), platform: 'ios', downloads: 4, impressions: 90, pageViews: 10 }],
  events: [],
  sales: [{ id: 'sale-server-1', date: T(2), platform: 'ios', plan: 'annual', price: 25, qty: 1 }],
  churn: [{ id: 'churn-1', date: T(5), mrr: 4, plan: 'monthly' }],
  settings: { trialDays: 14, currency: '$' },
  ui: { view: 'overview' },
};

/* Each open talks to its own copy of the server, which keeps what is pushed to
   it — a static LOAD would "lose" every row the page had just synced. */
function boot({ seed = {}, syncFails = () => false, server = JSON.parse(JSON.stringify(SERVER)) } = {}) {
  const synced = [];
  const dom = new JSDOM(html, {
    url: 'https://autonomic.care/master/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      Object.keys(seed).forEach((k) => window.localStorage.setItem(k, seed[k]));
    },
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  window.fetch = (url, opts) => {
    const body = JSON.parse(opts.body);
    const target = (opts.headers['X-Amz-Target'] || '').split('.').pop();
    const reply = (obj, status = 200) => Promise.resolve({
      ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(obj)),
    });
    if (target === 'InitiateAuth') return reply({ Session: 's1', ChallengeName: 'CUSTOM_CHALLENGE', ChallengeParameters: { USERNAME: 'austinspaeth@msn.com' } });
    if (target === 'RespondToAuthChallenge') return reply({ AuthenticationResult: { IdToken: idToken, AccessToken: 'at', RefreshToken: 'rt' } });
    if (body.action === 'LOAD') return reply(JSON.parse(JSON.stringify(server)));
    if (body.action === 'PINGS') return reply({ open: [], sub: [] });
    if (body.action === 'SYNC') {
      if (syncFails()) return reply({ error: 'boom' }, 500);
      const p = body.payload || {};
      synced.push(p);
      (p.saleUpserts || []).forEach((row) => {
        server.sales = server.sales.filter((x) => x.id !== row.id).concat([row]);
      });
      (p.saleDeletes || []).forEach((id) => { server.sales = server.sales.filter((x) => x.id !== id); });
    }
    return reply({ ok: true });
  };
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));
  return { window, synced, errors, server };
}

async function signIn(window) {
  const $ = (id) => window.document.getElementById(id);
  await new Promise((r) => window.addEventListener('load', r));
  await wait(150);
  $('gateEmail').value = 'austinspaeth@msn.com';
  $('gateSubmit').click();
  await wait(100);
  [...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
    el.value = '1234'[i];
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await wait(1000);
}

async function addAndroidSale(window) {
  const $ = (id) => window.document.getElementById(id);
  [...window.document.querySelectorAll('button')].find((b) => /Edit data/.test(b.textContent)).click();
  await wait(300);
  $('slDate').value = T(0);
  $('slPlatform').value = 'android';
  $('slPlan').value = 'annual';
  $('slPrice').value = '36';
  $('slSave').click();
  await wait(100);
}

const salesOf = (window) => window.Dashboard.store().db.sales;
const hasAndroid = (list) => list.some((s) => s.platform === 'android' && s.date === T(0));
const cached = (window) => JSON.parse(window.localStorage.getItem(KEY));
const storage = (window) => ({ [KEY]: window.localStorage.getItem(KEY), [BASELINE]: window.localStorage.getItem(BASELINE) });

/* ------------------------------------ 1. a refresh while the push is failing */

let failing = true;
const first = boot({ syncFails: () => failing });
await signIn(first.window);
check('the first open persisted a baseline beside the cache', !!first.window.localStorage.getItem(BASELINE));
await addAndroidSale(first.window);
await wait(1200);   // past the debounce: the push is tried and fails
check('the purchase is on screen', hasAndroid(salesOf(first.window)));

first.window.document.getElementById('btnRefresh').click();
await wait(900);
check('a refresh while the push is failing does not erase it', hasAndroid(salesOf(first.window)),
  JSON.stringify(salesOf(first.window)));
check('nor from the cache the refresh rewrote', hasAndroid(cached(first.window).sales));
check('and the server\'s own purchase is still there beside it',
  salesOf(first.window).some((s) => s.id === 'sale-server-1'));
check('churn is cached too, or the next open reads it as deleted', (cached(first.window).churn || []).length === 1,
  JSON.stringify(cached(first.window).churn));

/* ----------------------------- 2. the page goes away before the push landed */

const left = storage(first.window);
first.window.close();

const second = boot({ seed: left });
await signIn(second.window);
await wait(300);
const upserts = second.synced.flatMap((p) => p.saleUpserts || []);
check('the next open pushes the purchase the last one never sent', upserts.some((s) => s.platform === 'android' && s.date === T(0)),
  JSON.stringify(second.synced));
check('and pushes nothing else of the server\'s back at it', upserts.every((s) => s.platform === 'android'),
  JSON.stringify(upserts));
check('with no deletes', second.synced.every((p) => !p.saleDeletes && !p.churnDeletes && !p.deletes),
  JSON.stringify(second.synced));
check('it is on screen after the pull', hasAndroid(salesOf(second.window)));
check('and the server\'s purchase is too', salesOf(second.window).some((s) => s.id === 'sale-server-1'));

/* --------------------------------------------- 3. once pushed, it is settled */

const settled = storage(second.window);
second.window.close();
const third = boot({ seed: settled, server: second.server });
await signIn(third.window);
await wait(300);
check('an open after the push landed replays nothing', third.synced.every((p) => !p.saleUpserts),
  JSON.stringify(third.synced));
third.window.close();

/* ---------------------- 4. a cache that lost its rows is not a list of deletes */

const lost = JSON.parse(left[KEY]);
lost.sales = [];
lost.churn = [];
const fourth = boot({ seed: { [KEY]: JSON.stringify(lost), [BASELINE]: left[BASELINE] } });
await signIn(fourth.window);
await wait(1300);
check('a baseline the cache no longer matches sends no deletes',
  fourth.synced.every((p) => !p.saleDeletes && !p.churnDeletes), JSON.stringify(fourth.synced));
check('and the server\'s rows come back from the pull',
  salesOf(fourth.window).some((s) => s.id === 'sale-server-1'));
fourth.window.close();

const errs = [first, second, third, fourth].flatMap((b) => b.errors);
check('no uncaught errors', errs.length === 0, errs.join('\n'));

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : '   <- ' + String(r.detail).slice(0, 400)}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
