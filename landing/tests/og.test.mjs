/* The per-article social cards (scripts/gen-og.mjs).
 *
 * The cards are COMMITTED, so the failure this pins is the quiet one: somebody
 * adds an article, ships it, and the first time anyone learns there is no card
 * for it is when the link posts to Facebook with the wrong picture. Running
 * against the BUILT pages rather than the source also pins the half that lives
 * in the page head — an og:image that still points at a raw Unsplash crop is
 * exactly what this replaced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { frontmatter, coverUrl, OG_WIDTH, OG_HEIGHT } from '../scripts/gen-og.mjs';

const dir = (p) => new URL(p, import.meta.url).pathname;
const ARTICLES = dir('../articles');
const CARDS = dir('../static/og');
const BUILD = dir('../build');
const manifest = JSON.parse(fs.readFileSync(dir('../src/lib/og-cards.json'), 'utf8'));

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

/* ------------------------------------------------------------ the crop */

/* Articles carry Unsplash URLs at every width from 763 to 1760 and no fixed
   height. The card's whole reason for existing is that 1200x630 is not
   negotiable, so the rewrite must drop whatever the article asked for. */
const rewritten = coverUrl('https://images.unsplash.com/photo-1?q=80&w=763&fit=crop&ixid=abc');
check('an Unsplash cover is re-cropped to the card size',
  rewritten.includes(`w=${OG_WIDTH}`) && rewritten.includes(`h=${OG_HEIGHT}`), rewritten);
check('...and the article\'s own width is gone', !rewritten.includes('763'), rewritten);
check('a cover served from this site is left alone',
  coverUrl('/articles/x/cover.jpg') === '/articles/x/cover.jpg');

/* ------------------------------------------------- every article has one */

const articles = fs.readdirSync(ARTICLES).filter((f) => f.endsWith('.md'))
  .map((f) => ({ file: f, ...frontmatter(fs.readFileSync(path.join(ARTICLES, f), 'utf8')) }))
  // The one article whose cover IS the site card needs no card of its own.
  .filter((a) => a.photoLocation && path.basename(a.photoLocation) !== 'og.png');

check('every article was read', articles.length > 100, `${articles.length} found`);

const missing = articles.filter((a) => !fs.existsSync(path.join(CARDS, `${a.slug}.jpg`)));
check('every article has a card in static/og', missing.length === 0,
  missing.map((a) => a.file).join(', ') + '  (run `npm run og`)');

const unlisted = articles.filter((a) => !manifest[a.slug]);
check('...and an entry in og-cards.json', unlisted.length === 0,
  unlisted.map((a) => a.slug).join(', '));

/* A card built from a cover the article no longer uses is worse than none: it
   shares a picture the reader will not find on the page. */
const stale = articles.filter((a) => manifest[a.slug] && !manifest[a.slug].startsWith(`${a.photoLocation}|`));
check('no card was built from a cover the article has since changed', stale.length === 0,
  stale.map((a) => a.slug).join(', ') + '  (run `npm run og`)');

/* One hash of the overlay across the whole manifest: a strip redesign that only
   reached half the articles is a fleet of cards disagreeing about the brand. */
const overlays = new Set(Object.values(manifest).map((v) => v.split('|')[1]));
check('every card carries the same brand strip', overlays.size === 1,
  [...overlays].join(', ') + '  (run `npm run og -- --force`)');

/* ------------------------------------------------------------ the head */

if (!fs.existsSync(BUILD)) {
  check('the site has been built', false, 'run `npm run build` first');
} else {
  const pages = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html' && /\/insights\/[^/]+\/[^/]+\/index\.html$/.test(p)) pages.push(p);
  });
  walk(path.join(BUILD, 'insights'));

  const all = pages.map((p) => ({ p, slug: path.basename(path.dirname(p)), html: fs.readFileSync(p, 'utf8') }))
    .filter(({ html }) => /property="og:type" content="article"/.test(html));
  check('the built article pages were found', all.length > 100, `${all.length} found`);

  const og = (html) => html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? '';

  /* A handful of articles have no cover of their own and so no card. They fall
     back to the site-wide image, and a card of the site-wide image wearing the
     brand strip would be the strip over the logo. */
  const heads = all.filter(({ slug }) => manifest[slug]);
  const cardless = all.filter(({ slug }) => !manifest[slug]);
  check('an article with no cover falls back to the site card',
    cardless.every(({ html }) => og(html) === 'https://autonomic.care/og.png'),
    cardless.map(({ slug, html }) => `${slug}: ${og(html)}`).join(', '));

  const notCard = heads.filter(({ html }) => !og(html).startsWith('https://autonomic.care/og/'));
  check('every article page with a card points og:image at it', notCard.length === 0,
    notCard.slice(0, 3).map(({ slug }) => slug).join(', '));

  /* twitter:card promises summary_large_image, which is a promise about the
     ASPECT. Declaring the dimensions is how a scraper knows before fetching. */
  const undeclared = heads.filter(({ html }) =>
    !/property="og:image:width" content="1200"/.test(html)
    || !/property="og:image:height" content="630"/.test(html));
  check('...and declares its dimensions', undeclared.length === 0, `${undeclared.length} without`);

  const split = heads.filter(({ html }) =>
    html.match(/name="twitter:image" content="([^"]+)"/)?.[1] !== og(html));
  check('...and hands X the same image', split.length === 0, `${split.length} disagree`);

  /* The page's own cover is untouched: that was the requirement the card had to
     satisfy, and an overlaid card sitting at the top of the article is how it
     would break. */
  const unsplash = heads.filter(({ html }) => /images\.unsplash\.com/.test(html));
  check('the article body still renders its own Unsplash cover', unsplash.length > 100,
    `${unsplash.length} of ${heads.length}`);
}

/* ---------------------------------------------------------------- report */

let failed = 0;
results.forEach((r) => {
  if (!r.ok) failed += 1;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : '   <- ' + r.detail));
});
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
