// Renders the social card's bottom strip (og-overlay.html) to og-overlay.png,
// a 1200x210 transparent PNG. Run it only when the strip's DESIGN changes:
// gen-og.mjs composites the result over every article cover, so this is the
// one place a browser and a webfont are involved, and the build never sees
// either. The brand mark's path is read out of BrandMark.svelte rather than
// copied, so the card's logo cannot drift from the site's.
//
//   npm run og:overlay     (then `npm run og` to rebuild the cards)
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const markSvelte = readFileSync(join(here, '../src/lib/BrandMark.svelte'), 'utf8');
const mark = markSvelte.match(/<path d="([^"]+)"/)?.[1];
if (!mark) throw new Error('BrandMark.svelte: no <path d="..."> found');

const tmp = join(here, '.og-overlay.tmp.html');
writeFileSync(tmp, readFileSync(join(here, 'og-overlay.html'), 'utf8').replace('MARKPATH', mark));

const out = join(here, 'og-overlay.png');
try {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    // The strip is a gradient down to opaque black; it must keep its own alpha.
    '--default-background-color=00000000',
    '--window-size=1200,210',
    `--screenshot=${out}`,
    // Long enough for the webfont to land; the strip has no other network work.
    '--virtual-time-budget=8000',
    `file://${tmp}`,
  ], { stdio: 'inherit' });
} finally {
  unlinkSync(tmp);
}
console.log(`wrote ${out}`);
