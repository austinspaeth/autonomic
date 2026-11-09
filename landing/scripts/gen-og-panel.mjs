// Renders the social card's brand plate (og-panel.html) to og-panel.png and
// records the size it came to in og-panel.json. Run it only when the plate's
// DESIGN changes: gen-og.mjs composites the result into every article cover, so
// this is the one place a browser and a webfont are involved, and the build
// never sees either. The brand mark's path is read out of BrandMark.svelte
// rather than copied, so the card's logo cannot drift from the site's.
//
// The plate SHRINKS TO FIT: it is rendered onto an oversized transparent canvas
// and then trimmed, so its width is whatever its own type needs and nobody has
// to keep a number in sync with the words on it.
//
//   npm run og:panel     (then `npm run og -- --force` to rebuild the cards)
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { PANEL } from './og-panel.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Bigger than any plate could want; the trim below decides the real size.
const CANVAS = { w: 1400, h: 400 };

const markSvelte = readFileSync(join(here, '../src/lib/BrandMark.svelte'), 'utf8');
const mark = markSvelte.match(/<path d="([^"]+)"/)?.[1];
if (!mark) throw new Error('BrandMark.svelte: no <path d="..."> found');

const tmp = join(here, '.og-panel.tmp.html');
writeFileSync(tmp, readFileSync(join(here, 'og-panel.html'), 'utf8')
  .replace('MARKPATH', mark)
  .replaceAll('PANEL_R', String(PANEL.radius)));

const shot = join(here, '.og-panel.tmp.png');
const out = join(here, 'og-panel.png');
try {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    // The plate is translucent; it must keep its own alpha.
    '--default-background-color=00000000',
    `--window-size=${CANVAS.w},${CANVAS.h}`,
    `--screenshot=${shot}`,
    // Long enough for the webfont to land; the plate has no other network work.
    '--virtual-time-budget=8000',
    `file://${tmp}`,
  ], { stdio: 'inherit' });

  // Trim on ALPHA: the plate's own fill is dark and translucent, so trimming on
  // colour would eat into it. threshold 0 keeps every pixel the plate drew,
  // the corner antialiasing included.
  const trimmed = await sharp(shot).trim({ threshold: 0 }).toFormat('png').toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  if (width >= CANVAS.w || height >= CANVAS.h) {
    throw new Error(`plate filled the canvas (${width}x${height}): raise CANVAS`);
  }
  writeFileSync(out, trimmed);
  writeFileSync(join(here, 'og-panel.json'), `${JSON.stringify({ w: width, h: height }, null, 2)}\n`);
  console.log(`wrote ${out}  (${width}x${height})`);
} finally {
  unlinkSync(tmp);
  try { unlinkSync(shot); } catch { /* the screenshot may never have landed */ }
}
