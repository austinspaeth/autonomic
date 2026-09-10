/**
 * Campaign download links — `/download/<slug>`.
 *
 * `/download` itself is a page of the landing site: a prerendered signpost that
 * sniffs the user agent and sends a phone to its store with the site's own
 * `Videos` attribution. It is built by SvelteKit and is not touched here.
 *
 * A CAMPAIGN link is the same object with the destinations supplied by hand, so
 * `/download/facebook` can carry its own App Store campaign token and its own
 * Play referrer. Those destinations are typed into the master dashboard, which
 * means they cannot be known at build time — and the site is a static bucket
 * behind CloudFront with an OAC origin, so a path with no object behind it is a
 * 403 rather than anything a client-side router could rescue.
 *
 * So the page is PUBLISHED: saving a campaign writes a real, finished HTML
 * object into the site bucket with both URLs already baked into it. Three
 * consequences worth keeping in mind:
 *
 *   1. The redirect costs one request and never touches this API. A campaign
 *      link keeps working if the dashboard, the Lambda or DynamoDB are down,
 *      which is the opposite of what a runtime lookup would give us.
 *   2. DynamoDB is still the record — the S3 object is a rendering of it. That
 *      is what makes `republish` (below) safe to run at any time, and it is the
 *      recovery path if an object is ever lost.
 *   3. The pipeline's `aws s3 sync --delete` would otherwise delete every
 *      campaign object on the next deploy, because none of them exist in the
 *      build output. `buildspec.yml` excludes `download/*` from the sync for
 *      exactly this reason, re-including only the three files the build owns.
 *      Move one of those two things and you must move the other.
 *
 * Both keys are written for each campaign — `download/<slug>/index.html` and
 * the extensionless `download/<slug>` — because the distribution's directory
 * handling is out-of-band configuration this repo does not own, and which of
 * the two it asks S3 for is not ours to assume. They are bytes; write both.
 *
 * UNSET IS SAFE. With no `SITE_BUCKET` the module reports `configured: false`,
 * publishing is skipped and the dashboard says so. Campaigns still store and
 * still sync; they simply are not live. Same rule as the Web Push keys.
 */

const SITE_BUCKET = process.env.SITE_BUCKET || '';
const DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

/* Lowercase, digits and hyphens, first character not a hyphen. It becomes a
   path segment and an S3 key, so anything needing encoding is refused rather
   than escaped: a campaign link is typed into a video description by hand. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/* `index` would collide with the object `/download` itself is served from, and
   the rest are the shapes a phone or a crawler asks for underneath a path. */
const RESERVED = ['index', 'index.html', 'favicon.ico', 'robots.txt', 'sitemap.xml'];

/* The site's own signpost. A campaign that leaves a platform blank falls back
   to it rather than to a store URL typed twice: `/download` already sniffs the
   platform and carries the default attribution, so the visitor still lands in
   the right store and the campaign simply is not credited. */
const DEFAULT_STORE = 'https://autonomic.care/download';
const DEFAULT_SITE = 'https://autonomic.care';

const cleanUrl = (raw) => {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > 900) return '';
  /* http/https only. A campaign page redirects with `location.replace`, so a
     `javascript:` destination typed into the dashboard would execute on the
     site's own origin. */
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(s)) return '';
  return s;
};

/**
 * The stored shape of a campaign. Mirrored field for field by `normalizeLink`
 * in `landing/master/sync.js` — if the two disagree the diff reports every
 * campaign as changed on every push, forever.
 */
const cleanLink = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const slug = String(raw.slug || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug) || RESERVED.indexOf(slug) >= 0) return null;
  const out = { slug };
  const label = String(raw.label || '').trim().slice(0, 120);
  if (label) out.label = label;
  const ios = cleanUrl(raw.ios);
  if (ios) out.ios = ios;
  const android = cleanUrl(raw.android);
  if (android) out.android = android;
  const web = cleanUrl(raw.web);
  if (web) out.web = web;
  const note = String(raw.note || '').trim().slice(0, 2000);
  if (note) out.note = note;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw.created || ''))) out.created = raw.created;
  return out;
};

/** Where each kind of visitor is sent, blanks resolved. */
const destinations = (link) => ({
  ios: link.ios || DEFAULT_STORE,
  android: link.android || DEFAULT_STORE,
  web: link.web || DEFAULT_SITE,
});

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* The app's own mark, lifted from APP_MARK_PATH in landing/src/lib/site.ts
   (which is itself the app's logo.svg, same path as BrandMark in Icon.tsx).
   Duplicated rather than imported: this file runs in Lambda and that one is
   TypeScript in a Vite build. It is a logo, and it does not move.

   NOT the BRAND_POLYLINE waveform this page used to draw. That squiggle is
   decoration the site uses on article covers and topic icons; a campaign page
   is the last thing somebody sees before the store, so it has to show the
   object they are about to install. viewBox is 0 0 651.59 348.34 and it is
   FILLED, not stroked. */
const APP_MARK_PATH = 'M293.47,286.32c-4.46,4.22-10.3,6.66-16.35,5.93-3.48-.42-7.26-1.31-9.97-3.53-6.53-5.36-9.98-11.85-12.82-19.66l-6-16.52c-.7-1.92-2.25-5.38-4.84-4.46-1.75.62-3.73,3.12-4.77,4.6l-5.63,7.99-8.79,11.7c-6.3,8.39-19.54,18.71-29.89,17.9l-6.48-.51c-4.3-.34-8.27-3.21-11.33-5.88-4.21-3.67-6.39-7.98-8.81-12.83l-4.65-9.3c-1.86-.98-4.91-.41-6.58.79l-11.95,8.61c-11.19,8.06-20.99,12.9-35,14.63l-6.23.77-5.72.73-50.4-.09-15.68-.47-20.32-.53c-2.75-.07-5.85-.24-8.17-1.27-3.37-1.5-3.85-5.08-2.13-7.9,1.21-2,3.01-3.46,5.6-3.46h13.32s4.57.6,4.57.6l55.95-.21,14.35-1.23c5.96-.51,11.84-1.12,17.4-2.99l4.92-1.65c11.1-3.73,24.06-16.18,34.12-21.26,9.88-4.99,20.87-2.07,25.91,6.9l2.34,4.16,5.51,10.59c2.24,4.3,7.95,4.99,12.13,2.7,3.35-1.83,6.32-3.88,8.78-6.75l5.99-7.01,3.95-5.09,12.8-19.17,2.97-3.97,6.79-6.82,4.56-2.18c5.89-.5,8.8-.13,13.21,3.5,8.2,6.75,12.49,25.08,15.25,36.25,1.65,6.66,5.03,14.66,10.94,11.97,4.15-1.89,7.02-5.33,9.62-8.93,1.04-1.44,1.98-2.59,1.72-4.52l-.97-7.06-.52-20.66-.02-15.07.34-20.7.7-10.1.48-14.85,1.01-13.58.93-13.45.44-7.08.81-6.52.48-7.94.46-5.02,1.1-9.46.87-6.06.5-5.32.99-6.07.98-6,.91-6.06,1.12-7.9.99-5.45.97-4.47,1.6-7.2,3.86-15.93,4.45-13.28c2.78-8.29,7.98-18.87,15.74-22.18,6.82-2.91,13.44.51,17.2,6.76,4.18,6.95,5.75,14.56,6.84,22.61l.74,5.46.96,7.09c.33,2.47.93,4.86.7,7.51l.78,6.13.09,40.23c-1.6,3.22-.27,6.95-1.11,10.94-.38,1.81-.51,3.32-.69,5.19l-.67,7.02-.86,8.01c-1.34,12.47-4.03,24.36-6.98,36.41l-1.99,8.13-8.3,28.62-1.62,5-2.25,6.61-5.84,16.21c-3.42,9.48-7.34,18.46-12.08,27.49,1.16,4.87.89,9.58,1.39,14.43l.89,8.58,1.25,10.11c.76,6.11,2.72,11.62,5.35,17.09.35.73,2.22,1.51,2.97,1.36,3.63-.71,9.23-17.56,11.32-24.06l6.22-19.27,5.97-17.98,5.54-14.95,4.3-10.81,4.55-9.88,6.71-11.28c3.05-5.13,7.8-8.51,13.27-11.33,3.31-1.71,7.88-2.26,11.65-1.7,6.23.92,10.87,4.71,14.24,9.71,2.36,3.5,4.65,6.91,6.17,10.81l1.94,4.98,1.81,4.64,8.79,23.3c1.77,4.69,4.09,8.59,6.75,12.81,6.76,10.74,17.04,17.91,29.79,19.74l5.84,1.14,8.4.27,12.02.02,20.52-.19,8.8-.86,27.18-.12,3.03-.55,65.39.02,4.04.57,21.32.18c2.42.02,5.42,1.81,6.8,3.64.71.94.79,3.86.16,4.87-.89,1.42-2.77,2.9-4.38,3.69l-74.53.21-11.11.57-15.21.37-3.97.38-6.05.28-10.98.54-14.54.9-16.98,1.06-18.39.04-7.07-.76-5.76-.69c-9.49-1.13-18.19-4.82-25.74-11.03-3.25-2.67-6.83-5.62-9.1-9.07l-7.4-11.25-2.05-3.94-7.48-17.02c-3.37-7.65-7.91-26.07-15.83-26.17-8.6-.11-17.85,28.2-21.04,38.31l-5.52,17.47-10.52,33.47c-3.48,11.07-7.3,21.61-12.57,31.87l-3.44,6.07c-2.12,3.74-5.09,6.55-8.54,9-12.68,8.97-23.82-10.25-28.29-22.86-4.12-11.94-7.02-23.82-9.05-36.26l-.73-1.19c-.17-.27-.83.21-1.44.6ZM315.85,206.67l5.3-15.42,4.79-15.32,4.93-15.94,5.86-22.99,1.07-4.89.88-4.51,1.19-6.4.94-5.06.92-5.14,1.02-5.96.88-6.57.79-9.5.5-5.52.09-13-.13-17.49-.75-8.93-.97-7.5-.95-5.55-1.04-4.78-2.48-9.47c-2.84,5.64-4.55,11.49-5.89,17.67l-2.03,9.33-.94,5.18-.92,5.57-.75,5.04-1.01,7.97-1.26,11.96-.87,6.1-.44,6.26-.78,7.19-.65,4.65-.54,9.73c-.13,2.28-.51,4.25-.72,6.6l-.69,7.5-.79,12.97-1.04,13.05-.77,10.45-.9,12.05-1.03,14.41-.39,6.09-.44,10.18Z';

/* --------------------------------------------------------------- analytics */

/**
 * A campaign page is a page of autonomic.care that the site's build never sees,
 * so it inherits NOTHING from `landing/src/app.html` — not the GA tag, and not
 * the cookie choice that governs it. Both are therefore written into the object
 * itself, and both must keep matching the shell.
 *
 * Duplicated for the same reason `APP_MARK_PATH` above is: this file runs in
 * Lambda, `app.html` is a Vite build artifact, and there is no import between
 * them. The measurement id is public either way — it ships in the shell of
 * every page of the site.
 *
 * KEEP IN SYNC WITH `landing/src/app.html`:
 *   - the measurement id
 *   - the consent key `aj-cookie-consent` and the meaning of `'blocked'`
 * and with the redirect-event contract documented on `REDIRECT_MAX_WAIT_MS` in
 * `landing/src/lib/site.ts`, which `/download` itself implements.
 *
 * There is deliberately no cookie banner here. The page is gone inside a
 * second, so a banner could not be read, let alone answered — but a choice
 * already made on the site is same-origin, and IS honoured: a visitor who
 * blocked tracking is redirected immediately with nothing sent at all.
 */
const GA_MEASUREMENT_ID = 'G-3R3E75CLGQ';

/** Capped wait before redirecting, so a blocked tag can never strand a visitor. */
const REDIRECT_MAX_WAIT_MS = 1000;

const REDIRECT_EVENT = 'download_redirect';

/**
 * The three ways out, in the shape the page's script reads them.
 *
 * Keyed by the field name `destinations()` uses (`web` is this module's word
 * for "not a phone"), but the `platform` VALUE is `desktop`, because that is
 * what `/download` reports and the two pages have to land in the same GA
 * bucket. A campaign page that said `web` would quietly split every report in
 * two, and nothing would look broken.
 */
const REDIRECT_PLAN = {
  ios: { platform: 'ios', destination: 'app_store', event: 'app_store_redirect' },
  android: { platform: 'android', destination: 'play_store', event: 'play_store_redirect' },
  web: { platform: 'desktop', destination: 'site', event: 'site_redirect' },
};

/** What the published page's sniffer decides between, destinations resolved. */
const redirectPlan = (link) => {
  const d = destinations(link);
  const out = {};
  Object.keys(REDIRECT_PLAN).forEach((key) => {
    out[key] = Object.assign({ dest: d[key] }, REDIRECT_PLAN[key]);
  });
  return out;
};

/**
 * The finished page. Deliberately the same object the SvelteKit `/download`
 * page is — same sniff, same fallback links, same styling — because a visitor
 * who has JS off, or whose user agent matched nothing, must still be able to
 * leave. The sniffer is a literal script in server-rendered markup, which is
 * the one form that runs with no framework on the page at all.
 *
 * `location.replace`, not `href`: this page is a signpost, and Back from the
 * store should return to wherever the link was clicked, not to the signpost.
 *
 * It also MEASURES ITSELF, which a page written outside the build has to do
 * from scratch — see the `GA_MEASUREMENT_ID` block above. The tag goes in the
 * head so the page_view is queued before anything else runs, and the sniffer
 * announces which way it went and waits for the send before replacing the
 * location. Without that wait nothing is ever recorded: `location.replace`
 * aborts the document load, taking the still-loading tag with it, and the
 * campaign printed on a flyer reads as though it were never scanned.
 */
const renderLinkPage = (link) => {
  const d = destinations(link);
  const plan = redirectPlan(link);
  const title = link.label ? `${link.label} — Autonomic` : 'Download Autonomic';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<script>
window.dataLayer = window.dataLayer || [];
function _ajBlocked() {
  if (window.location.hostname === 'localhost') return true;
  try { return localStorage.getItem('aj-cookie-consent') === 'blocked'; } catch (e) { return true; }
}
function gtag(){ if (!_ajBlocked()) dataLayer.push(arguments); }
if (!_ajBlocked()) {
  var _ajs = document.createElement('script');
  _ajs.async = true;
  _ajs.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}';
  document.head.appendChild(_ajs);
  gtag('js', new Date());
  gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)});
}
</script>
<style>
body{margin:0;background:#050506;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif}
main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 24px;box-sizing:border-box;text-align:center}
.mark{width:160px;height:86px;fill:#e03127}
h1{margin:0;font-size:22px;font-weight:650;letter-spacing:-0.01em}
p{margin:0;font-size:15px;color:#a1a1aa}
.links{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:6px}
.links a{display:inline-block;padding:12px 20px;border-radius:999px;background:#e03127;color:#fff;font-size:15px;font-weight:600;text-decoration:none}
.links a:last-child{background:rgba(255,255,255,0.1)}
.quiet{margin-top:4px;font-size:14px;color:#71717a;text-decoration:none}
</style>
</head>
<body>
<main>
<svg class="mark" viewBox="0 0 651.59 348.34" aria-hidden="true"><path d="${APP_MARK_PATH}"/></svg>
<h1>Opening your app store&hellip;</h1>
<p>If nothing happens, pick your phone:</p>
<div class="links">
<a href="${escapeHtml(d.ios)}">Download for iPhone</a>
<a href="${escapeHtml(d.android)}">Download for Android</a>
</div>
<a class="quiet" href="${escapeHtml(d.web)}">Or visit autonomic.care</a>
</main>
<script>
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var to = ${JSON.stringify(plan.web)};
  if (/android/i.test(ua)) {
    to = ${JSON.stringify(plan.android)};
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    to = ${JSON.stringify(plan.ios)};
  } else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    to = ${JSON.stringify(plan.ios)};
  }

  // The callback and the cap race on purpose; whichever wins, the page leaves
  // exactly once.
  var gone = false;
  function go() {
    if (gone) return;
    gone = true;
    window.location.replace(to.dest);
  }

  // Tracking blocked on this origin: leave now, send nothing.
  if (_ajBlocked()) { go(); return; }

  // A fresh object per event — gtag holds what it was handed until its library
  // flushes, so one shared literal would put the callback on both.
  function params(extra) {
    var p = {
      platform: to.platform,
      destination: to.destination,
      campaign: ${JSON.stringify(link.slug)},
      location: ${JSON.stringify(`/download/${link.slug}`)},
      page_type: 'download'
    };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) p[k] = extra[k]; } }
    return p;
  }

  setTimeout(go, ${REDIRECT_MAX_WAIT_MS});
  gtag('event', to.event, params());
  // The callback rides the last event queued, so both are away before we go.
  gtag('event', ${JSON.stringify(REDIRECT_EVENT)}, params({
    event_callback: go,
    event_timeout: ${REDIRECT_MAX_WAIT_MS}
  }));
})();
</script>
</body>
</html>
`;
};

/* --------------------------------------------------------------- the bucket */

const keysFor = (slug) => [`download/${slug}/index.html`, `download/${slug}`];

const configured = () => !!SITE_BUCKET;

let s3 = null;
let cf = null;

/* Required lazily so a unit test — and every request that publishes nothing —
   never pays for the client, and so this file can be imported with no AWS SDK
   S3 package present at all. */
/* THE SITE BUCKET IS NOT IN THIS LAMBDA'S REGION, and a default client assumes
   it is. This function runs in us-west-2; `autonomic.care` was created in
   us-east-1, so every PutObject came back `PermanentRedirect` (HTTP 301, "the
   bucket you are attempting to access must be addressed using the specified
   endpoint") and a campaign save failed with the generic retry message — the
   one error in this module that is not transient and that retrying can never
   fix.

   `followRegionRedirects` makes the SDK read the region off that 301 and reissue
   the request against the right endpoint, once per client. Chosen over a
   `SITE_BUCKET_REGION` env var deliberately: the bucket is created out-of-band
   and this repo only ever holds its NAME, so a hardcoded region here is a second
   fact about someone else's resource that can silently go stale. This asks. */
const s3Client = () => {
  if (!s3) {
    // eslint-disable-next-line global-require
    const { S3Client } = require('@aws-sdk/client-s3');
    s3 = new S3Client({ followRegionRedirects: true });
  }
  return s3;
};

const cfClient = () => {
  if (!cf) {
    // eslint-disable-next-line global-require
    const { CloudFrontClient } = require('@aws-sdk/client-cloudfront');
    cf = new CloudFrontClient({});
  }
  return cf;
};

/**
 * A short max-age, not `no-store`.
 *
 * The object is edited from the dashboard and read from a phone, so an edit has
 * to reach the edge quickly — but this is the destination of a printed link,
 * and holding it entirely uncacheable would put every scan of a QR code through
 * to the origin. A minute is short enough that an invalidation is a nicety and
 * long enough that a burst of traffic is served from the edge.
 */
const CACHE_CONTROL = 'public, max-age=60';

const publishLink = async (link) => {
  if (!configured()) return { slug: link.slug, published: false, reason: 'no-bucket' };
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const Body = renderLinkPage(link);
  await Promise.all(keysFor(link.slug).map((Key) => s3Client().send(new PutObjectCommand({
    Bucket: SITE_BUCKET,
    Key,
    Body,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: CACHE_CONTROL,
  }))));
  return { slug: link.slug, published: true };
};

const unpublishLink = async (slug) => {
  if (!configured()) return { slug, published: false, reason: 'no-bucket' };
  if (!SLUG_RE.test(String(slug))) return { slug, published: false, reason: 'bad-slug' };
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await Promise.all(keysFor(slug).map((Key) => s3Client().send(new DeleteObjectCommand({
    Bucket: SITE_BUCKET, Key,
  }))));
  return { slug, published: false };
};

/**
 * Clear the edge for a set of slugs.
 *
 * Best effort by design: the object is already written, and a failed
 * invalidation costs at most `CACHE_CONTROL` seconds of staleness. Letting it
 * throw would fail a save whose real work had already succeeded, and the
 * dashboard would retry the whole push.
 */
const invalidate = async (slugs) => {
  if (!DISTRIBUTION_ID || !slugs.length) return false;
  try {
    const { CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
    const Items = [];
    slugs.forEach((slug) => { Items.push(`/download/${slug}`, `/download/${slug}/*`); });
    await cfClient().send(new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `links-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        Paths: { Quantity: Items.length, Items },
      },
    }));
    return true;
  } catch (err) {
    console.warn('Campaign link invalidation failed', err);
    return false;
  }
};

/**
 * Apply a set of campaign writes to the bucket.
 *
 * Publishing is allowed to THROW. It is called from inside `sync`, whose caller
 * retries with backoff and only adopts its snapshot on success — so a transient
 * S3 failure re-publishes on the next push rather than leaving a campaign that
 * the dashboard believes is live and is not.
 */
const applyLinkWrites = async (upserts, deletes) => {
  const published = [];
  for (const link of upserts) {
    // eslint-disable-next-line no-await-in-loop
    await publishLink(link);
    published.push(link.slug);
  }
  const removed = [];
  for (const slug of deletes) {
    // eslint-disable-next-line no-await-in-loop
    await unpublishLink(slug);
    removed.push(slug);
  }
  await invalidate(published.concat(removed));
  return { published: published.length, removed: removed.length, configured: configured() };
};

module.exports = {
  SLUG_RE,
  RESERVED,
  DEFAULT_STORE,
  DEFAULT_SITE,
  GA_MEASUREMENT_ID,
  REDIRECT_EVENT,
  REDIRECT_MAX_WAIT_MS,
  cleanLink,
  cleanUrl,
  destinations,
  redirectPlan,
  renderLinkPage,
  keysFor,
  configured,
  publishLink,
  unpublishLink,
  invalidate,
  applyLinkWrites,
};
