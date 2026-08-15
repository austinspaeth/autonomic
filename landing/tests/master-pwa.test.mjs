/* The dashboard as an app: installable, cache-first, and able to tell you what
   happened while it was closed.

   Four behaviours, each of which is invisible from a screenshot and easy to
   regress without noticing:

     1. the shipped document declares itself an app (its own manifest, the
        apple meta tags) — and points at ITS manifest, not the marketing site's
     2. a browser holding a cache paints BEFORE the server answers
     3. a browser holding none paints a skeleton rather than a blank page
     4. the alert baseline survives a session, so a sale that arrived overnight
        is announced when you open the dashboard in the morning

   Runs against the BUILT page, like every other master test, because the route
   that assembles it is part of what can break.

   The LOAD response is deliberately held open in the first two: "painted from
   the cache" is only a claim about what is on screen BEFORE the pull lands, so
   a test that lets the pull land first would pass against the old behaviour
   too. */
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

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = [
  b64u({ alg: 'RS256' }),
  b64u({ email: 'austinspaeth@msn.com', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'sig',
].join('.');

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const T = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return iso(d); };
const row = (day, cohorts) => ({
  day, total: cohorts.reduce((a, c) => a + c[2], 0),
  cohorts: cohorts.map(([cohort, platform, count]) => ({ cohort, platform, count })),
});

/* A cached store: two days of one platform, and one purchase. Enough that the
   Overview has tiles to draw without any help from the server. */
const CACHED_DB = {
  entries: [
    { date: T(3), platform: 'ios', downloads: 120, impressions: 4000, pageViews: 900, updates: 40 },
    { date: T(2), platform: 'ios', downloads: 140, impressions: 4200, pageViews: 950, updates: 44 },
  ],
  events: [], ads: [], costs: [],
  sales: [{ id: 'sale-1', date: T(2), platform: 'ios', plan: 'monthly', price: 4.99, qty: 1 }],
  settings: { trialDays: 7, wallDays: 14, currency: '$', storeCutPct: 15, salesMigrated: true, adSpotsMigrated: true },
};

/* The counter, and the snapshot a previous session left behind. The stored
   baseline is one purchase and one first run SHORT of the report below, which
   is the overnight arrival this whole mechanism exists for. */
const PING = {
  open: [row(T(1), [[T(1), 'I', 2]]), row(T(0), [[T(0), 'A', 1], [T(1), 'I', 2]])],
  sub: [row(T(0), [[T(1), 'I', 1]])],
};
const YESTERDAYS_BASELINE = {
  at: Date.now() - 8 * 3600 * 1000,
  snap: {
    opens: 4, downloads: 2, sales: 0, downloadsBy: { I: 2 }, salesBy: {},
    days: {
      [T(1)]: { opens: 2, downloads: 2, sales: 0, downloadsBy: { I: 2 }, salesBy: {} },
      [T(0)]: { opens: 2, downloads: 0, sales: 0, downloadsBy: {}, salesBy: {} },
    },
  },
};

/**
 * Boot the page with whatever localStorage the case needs, sign in, and hand
 * back the window plus a release() for the held LOAD.
 */
function boot({ seed = {}, holdLoad = false } = {}) {
  let releaseLoad = () => {};
  const dom = new JSDOM(html, {
    url: 'https://autonomic.care/master/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      /* Before a single script has run — which is the only way to give this
         page a warm cache, since it reads localStorage as it loads. */
      Object.keys(seed).forEach((k) => window.localStorage.setItem(k, seed[k]));
    },
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
    if (body.action === 'LOAD') {
      const answer = reply({ entries: CACHED_DB.entries, sales: CACHED_DB.sales, settings: CACHED_DB.settings, ui: null });
      if (!holdLoad) return answer;
      return new Promise((resolve) => { releaseLoad = () => resolve(answer.then((x) => x)); });
    }
    if (body.action === 'PINGS') return reply(PING);
    return reply({ ok: true });
  };

  const errors = [];
  window.addEventListener('error', (e) => errors.push(String((e.error && e.error.stack) || e.message)));
  return { window, errors, release: () => releaseLoad() };
}

async function signIn(window) {
  const $ = (id) => window.document.getElementById(id);
  await new Promise((r) => window.addEventListener('load', r));
  await wait(120);
  $('gateEmail').value = 'austinspaeth@msn.com';
  $('gateSubmit').click();
  await wait(60);
  [...$('gateCodeRow').querySelectorAll('input')].forEach((el, i) => {
    el.value = '1234'[i];
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await wait(150);
}

/* ------------------------------------------------- 1. the shipped document */

{
  const { window } = boot();
  await new Promise((r) => window.addEventListener('load', r));
  const doc = window.document;

  const manifests = [...doc.querySelectorAll('link[rel=manifest]')];
  check('the page links exactly one manifest', manifests.length === 1, String(manifests.length));
  /* app.html links /site.webmanifest for the marketing site. Which of two
     manifest links a browser honours is not something to leave to document
     order, so the boot script REWRITES the site's rather than adding a second. */
  check('and it is the dashboard\'s own, not the marketing site\'s',
    manifests[0] && manifests[0].getAttribute('href') === '/master/manifest.json',
    manifests[0] && manifests[0].getAttribute('href'));
  check('iOS is told the page may run standalone',
    !!doc.querySelector('meta[name="apple-mobile-web-app-capable"][content=yes]'));
  check('and so is everyone else',
    !!doc.querySelector('meta[name="mobile-web-app-capable"][content=yes]'));

  /* The service worker is a real URL under /master/ rather than another inlined
     string, because a worker cannot be registered from an inline script body.
     It is the one file this page references that is not part of the document. */
  check('the worker registers under the dashboard\'s own scope',
    html.includes("'/master/sw.js'") && html.includes("scope: SW_SCOPE"),
    'pwa.js did not make it into the page');
  check('the settings card for notifications is on the page',
    !!doc.getElementById('ntEnable') && !!doc.getElementById('ntStatus'));

  /* Same rule the gate test pins, restated because this change added two new
     absolute URLs and a relative one would break /master with no slash. */
  const relative = [...html.replace(/<!--[\s\S]*?-->/g, '')
    .matchAll(/(?:src|href)="(?!https?:|\/\/|\/|#|data:|mailto:)([^"]*)"/g)].map((m) => m[1]);
  check('nothing the page references is relative', relative.length === 0, relative.join(', '));
}

/* --------------------------------------------- 2. cache-first, with alerts */

{
  const { window, errors, release } = boot({
    holdLoad: true,
    seed: {
      'autonomic.dashboard.v1': JSON.stringify(CACHED_DB),
      'autonomic.master.alertBase': JSON.stringify(YESTERDAYS_BASELINE),
    },
  });
  await signIn(window);
  const $ = (id) => window.document.getElementById(id);

  /* THE assertion. The server has not answered and will not until release() —
     everything on screen at this moment came out of localStorage. */
  check('the dashboard paints before the server answers',
    $('ovTiles').innerHTML.length > 0, 'ovTiles is empty');
  check('and it painted real numbers, not a skeleton',
    /First-time downloads/.test($('ovTiles').textContent) && $('skeleton').classList.contains('hidden'),
    $('ovTiles').textContent.slice(0, 120));
  check('the refresh control says a pull is still in flight',
    $('btnRefresh').dataset.busy === 'true', $('btnRefresh').dataset.busy);

  /* The money strip: the Overview answers "did this make money" without a trip
     to the Costs view. */
  check('the Overview carries a money strip', !$('ovMoney').classList.contains('hidden'));
  check('with net profit on it', /Net profit in range/.test($('ovMoney').textContent));
  check('and MRR beside it, never blended into the cash',
    /MRR at/.test($('ovMoney').textContent) && /Bookings in range/.test($('ovMoney').textContent),
    $('ovMoney').textContent.slice(0, 200));

  /* The counter is fetched on the Overview — not only on the two views that
     draw it — which is what lets a sale be announced wherever you are. */
  await wait(200);
  const cards = () => [...$('alertStack').querySelectorAll('.alert-card')];
  const text = () => cards().map((c) => c.textContent.replace(/\s+/g, ' ')).join(' || ');
  check('the counter is fetched on a view that does not draw it', cards().length > 0, 'no alerts fired');
  check('a sale that arrived while the dashboard was shut is announced',
    /1 new sale/.test(text()), text());
  check('and so is the install that came with it', /1 new download/.test(text()), text());
  check('the store that paid is named', /1 on iOS/.test(text()), text());
  check('the toast carries the same news, for a reader who is not in that corner',
    /new sale/.test($('toast').textContent), $('toast').textContent);

  /* And the baseline moves on, so the same news is not repeated next time. */
  const stored = JSON.parse(window.localStorage.getItem('autonomic.master.alertBase'));
  check('the baseline is written back for the next session',
    stored && stored.snap && stored.snap.sales === 1, JSON.stringify(stored && stored.snap && stored.snap.sales));
  window.Alerts.clearAll();
  await wait(400);            // cards leave on a transition, not instantly
  window.Alerts.sync(PING);
  await wait(60);
  check('the same report a second time is not news again', cards().length === 0, text());

  release();
  await wait(200);
  check('the server\'s copy lands over the top when it arrives',
    $('btnRefresh').dataset.busy === 'false', $('btnRefresh').dataset.busy);
  check('no page errors', errors.length === 0, errors.join(' | '));
}

/* ------------------------------------------- 3. no cache: the skeleton */

{
  const { window, errors, release } = boot({ holdLoad: true });
  await signIn(window);
  const $ = (id) => window.document.getElementById(id);

  check('a browser with nothing cached shows a skeleton',
    !$('skeleton').classList.contains('hidden'));
  check('the skeleton has the shape of the view, not one spinner',
    $('skeleton').querySelectorAll('.skel-card').length >= 2 &&
    $('skeleton').querySelectorAll('.skel-tile').length >= 4,
    `${$('skeleton').querySelectorAll('.skel-card').length} cards, ${$('skeleton').querySelectorAll('.skel-tile').length} tiles`);
  check('and the view itself is not on screen under it',
    $('view-overview').classList.contains('hidden'));

  /* A browser that has never held a baseline still seeds in silence — the rule
     the remembered baseline replaced the SCOPE of, not the rule itself. */
  await wait(150);
  check('a first-ever session announces nothing',
    $('alertStack').querySelectorAll('.alert-card').length === 0,
    $('alertStack').textContent);

  release();
  await wait(200);
  check('the skeleton goes when the data lands', $('skeleton').classList.contains('hidden'));
  check('and the view arrives in its place', !$('view-overview').classList.contains('hidden'));
  check('no page errors', errors.length === 0, errors.join(' | '));
}

/* ------------------------------------------------------------- 4. report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
