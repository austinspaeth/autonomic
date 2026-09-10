/* The /download redirect, driven in the BUILT page.
 *
 * This page is measured under a constraint no other page has: it navigates away
 * within a frame of being parsed, which is exactly when GA's tag is still
 * loading. So the thing worth pinning is not "does it call gtag" but the ORDER
 * — that nothing has navigated before the events are away, and that a tag which
 * never loads (blocked, offline, an ad blocker) still lets the visitor leave.
 *
 * Run against the real bytes rather than the source: the sniffer is a string
 * interpolated into `{@html}`, so a build that mangles or drops it is precisely
 * the failure a source-level test would miss. The script is pulled out of the
 * built HTML and executed in a vm with hand-built stubs, the same shape
 * `analytics.test.mjs` uses.
 *
 * sls/tests/links.test.mjs pins the twin: the campaign pages published at
 * /download/<slug>, which carry their own copy of the tag.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const PAGE = new URL('../build/download/index.html', import.meta.url).pathname;
if (!fs.existsSync(PAGE)) {
  console.error(`No built page at ${PAGE} — run \`npm run build\` first.`);
  process.exit(1);
}

const html = fs.readFileSync(PAGE, 'utf8');

/* The sniffer is the inline script that navigates. Finding it by behaviour
   rather than by position means reordering the page cannot silently pick up the
   wrong block and pass. */
const sniffer = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .filter((s) => /window\.location\.replace/.test(s));

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

check('the built page carries exactly one redirect script', sniffer.length === 1, `found ${sniffer.length}`);
if (sniffer.length !== 1) {
  results.forEach((r) => console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name));
  process.exit(1);
}
const SRC = sniffer[0];

const IOS = 'https://apps.apple.com/app/apple-store/id6789786971?pt=126963570&ct=Videos&mt=8';
const PLAY = 'https://play.google.com/store/apps/details?id=com.autonomic.journal&referrer=utm_source%3Dvideo%26utm_medium%3Dreferral%26utm_campaign%3Dvideos';
const SITE = 'https://autonomic.care/?utm_source=video&utm_medium=referral&utm_campaign=videos';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
};

/**
 * Run the sniffer once.
 *
 * `respond` decides what the tag does with the event that carries a callback:
 * 'callback' is a tag that loaded and sent, 'never' is one that did not (an ad
 * blocker, a dead network). Timers are collected rather than run, so the test
 * controls the race instead of racing it.
 */
function run({ ua, maxTouchPoints = 0, blocked = false, noGtag = false, respond = 'never' }) {
  const events = [];
  const navigations = [];
  const timers = [];
  const sandbox = {
    navigator: { userAgent: ua, maxTouchPoints },
    window: { location: { replace: (url) => navigations.push(url) } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    _ajBlocked: () => blocked,
  };
  if (!noGtag) {
    sandbox.gtag = (kind, name, params) => {
      events.push({ kind, name, params });
      /* A real gtag holds the arguments object until its library flushes; the
         callback is invoked later, never synchronously inside the call. */
      if (respond === 'callback' && params && params.event_callback) {
        timers.push({ fn: params.event_callback, ms: 0, ga: true });
      }
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return {
    events,
    navigations,
    timers,
    /** Fire the pending timers in the order a browser would. */
    settle(kind) {
      timers
        .filter((t) => (kind === 'ga' ? t.ga : kind === 'cap' ? !t.ga : true))
        .forEach((t) => t.fn());
    },
  };
}

/* ------------------------------------------------------ where each one goes */

const cases = [
  ['iPhone', { ua: UA.iphone }, IOS, 'app_store_redirect', 'ios', 'app_store'],
  ['Android', { ua: UA.android }, PLAY, 'play_store_redirect', 'android', 'play_store'],
  ['desktop', { ua: UA.windows }, SITE, 'site_redirect', 'desktop', 'site'],
  // iPadOS 13+ reports as a Mac; touch points are the only thing separating it
  // from a laptop, and getting it wrong sends an iPad to the marketing site.
  ['iPad-as-Mac', { ua: UA.mac, maxTouchPoints: 5 }, IOS, 'app_store_redirect', 'ios', 'app_store'],
  ['a real Mac', { ua: UA.mac }, SITE, 'site_redirect', 'desktop', 'site'],
];

cases.forEach(([label, opts, dest, named, platform, destination]) => {
  const r = run(Object.assign({ respond: 'callback' }, opts));
  const names = r.events.map((e) => e.name);
  check(`${label}: fires its own named event and the pooled one`,
    names.length === 2 && names[0] === named && names[1] === 'download_redirect',
    names.join(', '));

  const pooled = r.events.find((e) => e.name === 'download_redirect') || { params: {} };
  check(`${label}: the pooled event says which way it went`,
    pooled.params.platform === platform && pooled.params.destination === destination,
    `${pooled.params.platform} / ${pooled.params.destination}`);
  check(`${label}: and which campaign it was`,
    pooled.params.campaign === 'videos' && pooled.params.location === '/download'
      && pooled.params.page_type === 'download',
    JSON.stringify(pooled.params));

  /* The whole point of the change: measured BEFORE the navigation, not after
     it, because after it there is no page left to send from. */
  check(`${label}: nothing has navigated while the events are in flight`,
    r.navigations.length === 0, r.navigations.join(', '));

  r.settle('ga');
  check(`${label}: the callback sends it on`, r.navigations.length === 1 && r.navigations[0] === dest,
    r.navigations.join(', '));

  r.settle('cap');
  check(`${label}: and the cap firing afterwards does not navigate twice`,
    r.navigations.length === 1, `${r.navigations.length} navigations`);
});

/* ------------------------------------------------------------------ the cap */

{
  const r = run({ ua: UA.iphone, respond: 'never' });
  check('a tag that never calls back still queues the events', r.events.length === 2);
  check('...and holds the visitor for exactly one capped wait',
    r.timers.length === 1 && r.timers[0].ms === 1000, JSON.stringify(r.timers.map((t) => t.ms)));
  check('...having navigated nowhere yet', r.navigations.length === 0);
  r.settle();
  check('...then sends them on anyway', r.navigations.length === 1 && r.navigations[0] === IOS,
    r.navigations.join(', '));
}

{
  /* GA's own timeout has to match ours, or the tag would sit holding a callback
     the page has already given up on. */
  const r = run({ ua: UA.android });
  const pooled = r.events.find((e) => e.name === 'download_redirect');
  check('the tag is told the same deadline the page keeps', pooled.params.event_timeout === 1000,
    String(pooled.params.event_timeout));
  const named = r.events.find((e) => e.name === 'play_store_redirect');
  check('only one of the two events carries the callback',
    typeof pooled.params.event_callback === 'function' && !('event_callback' in named.params),
    JSON.stringify(Object.keys(named.params)));
  check('and the two events do not share one params object', named.params !== pooled.params);
}

/* -------------------------------------------------------------- opting out */

{
  const r = run({ ua: UA.iphone, blocked: true });
  check('a visitor who blocked tracking is measured not at all', r.events.length === 0);
  check('...and is not made to wait for it', r.timers.length === 0 && r.navigations.length === 1
    && r.navigations[0] === IOS, r.navigations.join(', '));
}

{
  /* The shell defines gtag; if the page is ever served without it, a signpost
     must not become a dead end. */
  const r = run({ ua: UA.android, noGtag: true });
  check('no tag on the page at all: still leaves, immediately',
    r.navigations.length === 1 && r.navigations[0] === PLAY && r.timers.length === 0,
    r.navigations.join(', '));
}

/* --------------------------------------------------------------- the shell */

check('the page still loads the GA tag from the shell',
  /googletagmanager\.com\/gtag\/js\?id=G-3R3E75CLGQ/.test(html));
check('and is still kept out of the index',
  /<meta[^>]+name="robots"[^>]+noindex/.test(html));

/* ---------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
