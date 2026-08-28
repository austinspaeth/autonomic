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

const require = createRequire(import.meta.url);
const {
  cleanLink, cleanUrl, destinations, renderLinkPage, keysFor,
  DEFAULT_STORE, DEFAULT_SITE,
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

  assert.match(html, /window\.location\.replace\(dest\)/);
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
