// Builds one social-share card per article into static/og/<slug>.jpg.
//
// The card is the article's OWN cover, cropped to 1200x630, with the brand
// strip (scripts/og-overlay.png) composited along the bottom. The article page
// keeps pointing at photoLocation for the cover it renders; only og:image and
// twitter:image point here. Facebook's scraper is impatient and caches hard, so
// these are plain static files on CloudFront rather than anything rendered per
// request, and they are COMMITTED: the build then copies bytes, and Unsplash
// being slow or down can never break a deploy.
//
//   npm run og            build what is missing or stale
//   npm run og -- --force rebuild everything
//   npm run og -- --soft  never fail (this is what `npm run build` runs)
//
// It also runs as npm's `prebuild`, so a deploy can never ship an article whose
// card was never generated. That path is --soft: a page with no card falls back
// to the site-wide image and still renders, so Unsplash being unreachable must
// not be able to stop the site from shipping. tests/og.test.mjs is the strict
// half, and is where a missing card should be caught.
//
// A card is rebuilt when its source URL changes or when the overlay does (the
// manifest stores a hash of each), so a design change to the strip is
// `npm run og:overlay && npm run og`.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const ARTICLES = join(here, '../articles');
const STATIC = join(here, '../static');
const OUT = join(STATIC, 'og');
// The manifest is source, not an asset: the article page imports it to decide
// whether a card exists for a slug, so it lives in src/lib and not in static/.
const MANIFEST = join(here, '../src/lib/og-cards.json');
const OVERLAY = join(here, 'og-overlay.png');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const force = process.argv.includes('--force');
const soft = process.argv.includes('--soft');

/** Slug + cover out of an article's YAML frontmatter. Deliberately not a YAML
 *  parser: these two keys are single-line scalars in every article. */
export function frontmatter(md) {
  const block = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return {};
  const get = (key) => {
    const m = block[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
  };
  return { slug: get('slug'), photoLocation: get('photoLocation') };
}

/** Unsplash serves through imgix, so the 1200x630 crop is theirs to do and we
 *  never resize a photo ourselves. Every other param is dropped: the widths the
 *  articles carry range from 763 to 1760 and none of them is the card's. */
export function coverUrl(photoLocation) {
  if (!/^https?:\/\/images\.unsplash\.com\//.test(photoLocation)) return photoLocation;
  const u = new URL(photoLocation);
  u.search = '';
  u.searchParams.set('w', String(OG_WIDTH));
  u.searchParams.set('h', String(OG_HEIGHT));
  u.searchParams.set('fit', 'crop');
  u.searchParams.set('crop', 'entropy');
  u.searchParams.set('auto', 'format');
  u.searchParams.set('q', '80');
  return u.toString();
}

async function sourceBytes(photoLocation) {
  // A cover already served from this site is read off disk, not over the wire.
  if (photoLocation.startsWith('/')) return readFileSync(join(STATIC, photoLocation));
  const url = coverUrl(photoLocation);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const overlay = readFileSync(OVERLAY);
  const overlayHash = createHash('sha1').update(overlay).digest('hex').slice(0, 12);
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

  const files = readdirSync(ARTICLES).filter((f) => f.endsWith('.md')).sort();
  let built = 0, skipped = 0;
  const failed = [];

  for (const file of files) {
    const { slug, photoLocation } = frontmatter(readFileSync(join(ARTICLES, file), 'utf8'));
    if (!slug) { failed.push(`${file}: no slug`); continue; }
    // One article points photoLocation at the site-wide card; it needs no card
    // of its own and would otherwise get the strip twice.
    if (!photoLocation || basename(photoLocation) === 'og.png') { skipped++; continue; }

    const key = `${photoLocation}|${overlayHash}`;
    const dest = join(OUT, `${slug}.jpg`);
    if (!force && manifest[slug] === key && existsSync(dest)) { skipped++; continue; }

    try {
      const base = sharp(await sourceBytes(photoLocation))
        .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' });
      const buf = await sharp(await base.toFormat('png').toBuffer())
        .composite([{ input: overlay, gravity: 'south' }])
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      writeFileSync(dest, buf);
      manifest[slug] = key;
      built++;
      process.stdout.write(`  ${slug}\n`);
    } catch (e) {
      failed.push(`${slug}: ${e.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\nog: ${built} built, ${skipped} up to date, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error(`  ! ${f}`);
    if (!soft) process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
