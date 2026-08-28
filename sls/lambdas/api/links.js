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

/* Brand mark, lifted from BRAND_POLYLINE in landing/src/lib/site.ts. Duplicated
   rather than imported: this file runs in Lambda and that one is TypeScript in
   a Vite build. It is a logo, and it does not move. */
const BRAND_POLYLINE = '41,266 179,266 200,225 220,307 246,92 272,420 297,240 317,266 471,266';

/**
 * The finished page. Deliberately the same object the SvelteKit `/download`
 * page is — same sniff, same fallback links, same styling — because a visitor
 * who has JS off, or whose user agent matched nothing, must still be able to
 * leave. The sniffer is a literal script in server-rendered markup, which is
 * the one form that runs with no framework on the page at all.
 *
 * `location.replace`, not `href`: this page is a signpost, and Back from the
 * store should return to wherever the link was clicked, not to the signpost.
 */
const renderLinkPage = (link) => {
  const d = destinations(link);
  const title = link.label ? `${link.label} — Autonomic` : 'Download Autonomic';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#050506;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif}
main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 24px;box-sizing:border-box;text-align:center}
.mark{width:84px;height:84px;fill:none;stroke:#e03127;stroke-width:30;stroke-linecap:round;stroke-linejoin:round}
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
<svg class="mark" viewBox="0 0 512 512" aria-hidden="true"><polyline points="${BRAND_POLYLINE}"/></svg>
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
  var dest = ${JSON.stringify(d.web)};
  if (/android/i.test(ua)) {
    dest = ${JSON.stringify(d.android)};
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    dest = ${JSON.stringify(d.ios)};
  } else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    dest = ${JSON.stringify(d.ios)};
  }
  window.location.replace(dest);
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
  cleanLink,
  cleanUrl,
  destinations,
  renderLinkPage,
  keysFor,
  configured,
  publishLink,
  unpublishLink,
  invalidate,
  applyLinkWrites,
};
