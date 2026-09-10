/* Campaign download links — the pure half.
 *
 * What matters here is what ends up in the site bucket, because that object is
 * public, is the destination of a printed link, and is written by a dashboard
 * with no build step in front of it. So: a slug that could not be a safe path
 * is refused rather than escaped, a destination that is not an http(s) URL
 * never reaches the page, and the page a visitor lands on works with the
 * scripting turned off.
 *
 * landing/tests/master-links.test.mjs pins the other half: that the dashboard
 * sends the payload these functions read.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {
  cleanLink, cleanUrl, destinations, redirectPlan, renderLinkPage, keysFor,
  DEFAULT_STORE, DEFAULT_SITE, GA_MEASUREMENT_ID, REDIRECT_MAX_WAIT_MS,
} = require('../lambdas/api/links.js');

test('a slug is a path segment or it is nothing', () => {
  const slugOf = (slug) => (cleanLink({ slug, ios: 'https://a.example' }) || {}).slug;
  assert.equal(slugOf('facebook'), 'facebook');
  assert.equal(slugOf('summer-2026'), 'summer-2026');
  // Case-folded rather than refused: the same campaign typed two ways is one
  // campaign, and the URL it publishes at is lowercase either way.
  assert.equal(slugOf('Facebook'), 'facebook');
  // Anything that would need encoding, or that could climb out of the prefix.
  assert.equal(slugOf('face book'), undefined);
  assert.equal(slugOf('../../secret'), undefined);
  assert.equal(slugOf('a/b'), undefined);
  assert.equal(slugOf('-leading'), undefined);
  assert.equal(slugOf(''), undefined);
  assert.equal(slugOf('x'.repeat(49)), undefined);
  // `index` is the object /download itself is served from.
  assert.equal(slugOf('index'), undefined);
});

test('a destination is an http(s) URL or it is dropped', () => {
  assert.equal(cleanUrl('https://apps.apple.com/app/id1?ct=Ad'), 'https://apps.apple.com/app/id1?ct=Ad');
  assert.equal(cleanUrl('http://example.com'), 'http://example.com');
  assert.equal(cleanUrl('  https://example.com  '), 'https://example.com');
  /* The one that matters: the page assigns the destination to
     `location.replace`, so a javascript: URL typed into the dashboard would
     run on autonomic.care's own origin. */
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('data:text/html,<script>x</script>'), '');
  assert.equal(cleanUrl('apps.apple.com/app/id1'), '');
  assert.equal(cleanUrl('https://a.example/"><script>'), '');
  assert.equal(cleanUrl(''), '');
});

test('a blank platform falls back rather than being invented', () => {
  const link = cleanLink({ slug: 'podcast', android: 'https://play.example/x' });
  const d = destinations(link);
  assert.equal(d.android, 'https://play.example/x');
  /* /download is the site's own signpost: it sniffs the platform and carries
     the default attribution, so an iPhone still reaches the App Store. */
  assert.equal(d.ios, DEFAULT_STORE);
  assert.equal(d.web, DEFAULT_SITE);
});

test('the page redirects, and still works with no scripting at all', () => {
  const link = cleanLink({
    slug: 'facebook',
    label: 'Facebook — August',
    ios: 'https://apps.apple.com/app/apple-store/id1?pt=2&ct=Facebook&mt=8',
    android: 'https://play.google.com/store/apps/details?id=x&referrer=y',
    web: 'https://autonomic.care/?utm_source=facebook',
  });
  const html = renderLinkPage(link);

  assert.match(html, /window\.location\.replace\(to\.dest\)/);
  assert.match(html, /iphone\|ipad\|ipod/);
  // Every destination is reachable by hand, for a visitor whose sniff matched
  // nothing or who has JS off. That is the whole fallback.
  assert.ok(html.includes('href="https://apps.apple.com/app/apple-store/id1?pt=2&amp;ct=Facebook&amp;mt=8"'));
  assert.ok(html.includes('href="https://play.google.com/store/apps/details?id=x&amp;referrer=y"'));
  assert.ok(html.includes('href="https://autonomic.care/?utm_source=facebook"'));
  // A campaign page is a signpost, not a page of the site.
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /<title>Facebook — August — Autonomic<\/title>/);
});

test('a label cannot break out of the page it is written into', () => {
  const html = renderLinkPage(cleanLink({ slug: 'x', label: '</title><script>alert(1)</script>' }));
  assert.ok(!html.includes('<script>alert(1)'));
  assert.match(html, /&lt;script&gt;/);
});

test('both keys are written, because the distribution owns the directory rule', () => {
  assert.deepEqual(keysFor('facebook'), ['download/facebook/index.html', 'download/facebook']);
});

/* ------------------------------------------------------------- analytics */

/* A campaign page inherits nothing from the site's build — not the GA tag, and
   not the cookie choice that governs it — so both are written into the object
   and both are pinned here. The order is the substance: this page navigates
   away within a frame of being parsed, which is when the tag is still loading,
   so a measurement that is not sent BEFORE `location.replace` is not sent at
   all, and a printed campaign reads as though nobody ever scanned it.

   landing/tests/download.test.mjs pins the twin: /download itself, which gets
   its tag from the shell and implements the same contract. */

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
};

/** The inline script in the page that navigates — found by behaviour, not position. */
const snifferOf = (html) => {
  const found = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => /window\.location\.replace/.test(s));
  assert.equal(found.length, 1, 'exactly one redirect script');
  return found[0];
};

/**
 * Run a published page's sniffer.
 *
 * `respond: 'callback'` is a tag that loaded and sent; the default is one that
 * never did (an ad blocker, a dead network). Timers are collected rather than
 * run, so the test drives the race instead of racing it.
 */
function runPage(html, { ua, maxTouchPoints = 0, blocked = false, respond = 'never' }) {
  const events = [];
  const navigations = [];
  const timers = [];
  const sandbox = {
    navigator: { userAgent: ua, maxTouchPoints },
    window: { location: { replace: (url) => navigations.push(url) } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    _ajBlocked: () => blocked,
    gtag: (kind, name, params) => {
      events.push({ name, params });
      /* A real gtag holds what it was handed until its library flushes; the
         callback is never invoked synchronously inside the call. */
      if (respond === 'callback' && params && params.event_callback) {
        timers.push({ fn: params.event_callback, ms: 0, ga: true });
      }
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(snifferOf(html), sandbox);
  const settle = (kind) => timers
    .filter((t) => (kind === 'ga' ? t.ga : kind === 'cap' ? !t.ga : true))
    .forEach((t) => t.fn());
  return { events, navigations, timers, settle };
}

const CAMPAIGN = cleanLink({
  slug: 'facebook',
  ios: 'https://apps.apple.com/app/apple-store/id1?pt=2&ct=Facebook&mt=8',
  android: 'https://play.google.com/store/apps/details?id=x&referrer=y',
  web: 'https://autonomic.care/?utm_source=facebook',
});

test('a published page carries the site\'s own tag', () => {
  const html = renderLinkPage(CAMPAIGN);
  assert.match(html, new RegExp(`googletagmanager\\.com/gtag/js\\?id=${GA_MEASUREMENT_ID}`));
  assert.match(html, /gtag\('config', "G-/);
  /* The tag is in the head, so its page_view is queued before the sniffer in
     the body ever runs. */
  assert.ok(html.indexOf('googletagmanager') < html.indexOf('<body>'));
});

test('each way out is reported as itself', () => {
  const html = renderLinkPage(CAMPAIGN);
  const d = destinations(CAMPAIGN);
  const cases = [
    [{ ua: UA.iphone }, d.ios, 'app_store_redirect', 'ios', 'app_store'],
    [{ ua: UA.android }, d.android, 'play_store_redirect', 'android', 'play_store'],
    [{ ua: UA.windows }, d.web, 'site_redirect', 'desktop', 'site'],
    // iPadOS 13+ reports as a Mac; touch points are all that separate it.
    [{ ua: UA.mac, maxTouchPoints: 5 }, d.ios, 'app_store_redirect', 'ios', 'app_store'],
    [{ ua: UA.mac }, d.web, 'site_redirect', 'desktop', 'site'],
  ];
  cases.forEach(([opts, dest, named, platform, destination]) => {
    const r = runPage(html, Object.assign({ respond: 'callback' }, opts));
    assert.deepEqual(r.events.map((e) => e.name), [named, 'download_redirect']);
    const pooled = r.events[1].params;
    assert.equal(pooled.platform, platform);
    assert.equal(pooled.destination, destination);
    assert.equal(pooled.campaign, 'facebook');
    assert.equal(pooled.location, '/download/facebook');
    assert.equal(pooled.page_type, 'download');
    /* The whole point: measured before the navigation, because after it there
       is no page left to send from. */
    assert.deepEqual(r.navigations, []);
    r.settle('ga');
    assert.deepEqual(r.navigations, [dest]);
    r.settle('cap');
    assert.deepEqual(r.navigations, [dest], 'the cap does not navigate a second time');
  });
});

test('desktop is called `desktop` here too, or every report splits in two', () => {
  /* This module's own word for "not a phone" is `web`, because that is the
     field a campaign stores. What GA is told must match /download. */
  const plan = redirectPlan(CAMPAIGN);
  assert.equal(plan.web.platform, 'desktop');
  assert.equal(plan.web.dest, 'https://autonomic.care/?utm_source=facebook');
});

test('a tag that never calls back cannot strand a visitor', () => {
  const html = renderLinkPage(CAMPAIGN);
  const r = runPage(html, { ua: UA.iphone });
  assert.equal(r.events.length, 2);
  assert.deepEqual(r.timers.map((t) => t.ms), [REDIRECT_MAX_WAIT_MS]);
  assert.deepEqual(r.navigations, [], 'not yet');
  r.settle();
  assert.deepEqual(r.navigations, [destinations(CAMPAIGN).ios]);
});

test('the tag is held to the same deadline the page keeps', () => {
  const r = runPage(renderLinkPage(CAMPAIGN), { ua: UA.android });
  const [named, pooled] = r.events;
  assert.equal(pooled.params.event_timeout, REDIRECT_MAX_WAIT_MS);
  assert.equal(typeof pooled.params.event_callback, 'function');
  // One callback, on the last event queued, so both are away before we go.
  assert.ok(!('event_callback' in named.params));
  assert.notEqual(named.params, pooled.params, 'a fresh params object per event');
});

test('a visitor who blocked tracking on the site is not tracked here', () => {
  /* Same origin as autonomic.care, so the choice stored there governs this
     page too — and blocking means blocked, not "measured, then sent". */
  const r = runPage(renderLinkPage(CAMPAIGN), { ua: UA.iphone, blocked: true });
  assert.deepEqual(r.events, []);
  assert.deepEqual(r.timers, [], 'and is not made to wait for it');
  assert.deepEqual(r.navigations, [destinations(CAMPAIGN).ios]);
});

test('the consent key and the tag match the shell', () => {
  /* The two are written in different languages in different repos-within-a-repo
     and there is no import between them; this is the check that they agree. */
  const shell = fs.readFileSync(new URL('../../landing/src/app.html', import.meta.url), 'utf8');
  assert.ok(shell.includes(GA_MEASUREMENT_ID), 'same measurement id');
  const html = renderLinkPage(CAMPAIGN);
  assert.ok(shell.includes("localStorage.getItem('aj-cookie-consent') === 'blocked'"));
  assert.ok(html.includes("localStorage.getItem('aj-cookie-consent') === 'blocked'"));
});

test('a destination still cannot break out of the script it is written into', () => {
  /* The destinations are interpolated into a <script> block now as well as
     into href attributes, and cleanUrl is what stands between the dashboard
     and the site's own origin. */
  const link = cleanLink({ slug: 'x', ios: 'https://a.example/</script><script>alert(1)' });
  assert.equal(link.ios, undefined, 'refused, not escaped');
  const html = renderLinkPage(link);
  assert.ok(!html.includes('alert(1)'));
  assert.equal(snifferOf(html).includes('</script'), false);
});

test('the page shows the app\'s own mark, and it has not drifted from the site', () => {
  /* A 3KB path duplicated across a Lambda and a Vite build is the one thing
     here that can rot silently — a wrong glyph still renders, it is just not
     the logo. So the two copies are compared rather than eyeballed. */
  const site = fs.readFileSync(new URL('../../landing/src/lib/site.ts', import.meta.url), 'utf8');
  const inSite = site.match(/export const APP_MARK_PATH =\s*\n\s*'([^']+)';/);
  assert.ok(inSite, 'APP_MARK_PATH still lives in site.ts');

  const html = renderLinkPage(CAMPAIGN);
  const drawn = html.match(/<svg class="mark"[^>]*viewBox="([^"]+)"[^>]*><path d="([^"]+)"/);
  assert.ok(drawn, 'the mark is a filled path, not a stroked polyline');
  assert.equal(drawn[1], '0 0 651.59 348.34', 'the app mark\'s own viewBox');
  assert.equal(drawn[2], inSite[1], 'byte-identical to the site\'s copy');

  /* Wide mark: sized by width and filled. A square box would letterbox it. */
  assert.match(html, /\.mark\{width:160px;height:86px;fill:#e03127\}/);
  // The decorative ECG waveform is gone from this page entirely.
  assert.ok(!html.includes('polyline'));
});
