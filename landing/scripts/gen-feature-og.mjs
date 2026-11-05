// Share cards for the feature pages: screenshots each /og-card/<slug>/ page
// (src/routes/(card)/og-card, which draws the page's own hero mockup) at
// 1200 x 630 with headless Chrome, and writes static/og/features/<slug>.jpg.
// The cards are committed, like the article cards. Re-run after a hero changes:
//
//   npm run dev            (in another terminal)
//   node scripts/gen-feature-og.mjs [http://localhost:5173]
//   ONLY=topic- node scripts/gen-feature-og.mjs    (just the topic cards)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// The slugs are the keys of CARDS, read from the source so the two never drift.
const cards = readFileSync(join(root, 'src/routes/(card)/og-card/[slug]/cards.ts'), 'utf8');
// ONLY=topic- renders just the cards whose slug starts with it, leaving the rest as committed.
const only = process.env.ONLY || '';
const slugs = [...cards.matchAll(/^\s+'?([a-z-]+)'?: \{ icon:/gm)].map((m) => m[1]).filter((s) => s.startsWith(only));
if (!slugs.length) throw new Error('No cards found in cards.ts');

const out = join(root, 'static/og/features');
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'feature-og-'));

for (const slug of slugs) {
  const png = join(tmp, `${slug}.png`);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    '--window-size=1200,630', '--virtual-time-budget=4000', `--screenshot=${png}`,
    `${base}/og-card/${slug}/`
  ], { stdio: 'ignore' });
  // Rendered at 2x for crisp type, delivered at the 1200 x 630 the platforms ask for.
  await sharp(png).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(join(out, `${slug}.jpg`));
  console.log(`og/features/${slug}.jpg`);
}
rmSync(tmp, { recursive: true, force: true });
