// Renders the giveaway page's social card (giveaway-og.html) to
// static/giveaway/og.png, 1200x630. Run it only when the card's design changes;
// the PNG is committed and the build never sees a browser.
//
// The brand mark and the two prize drawings are read out of their Svelte
// components rather than copied, so the card cannot drift from the site.
//
//   npm run og:giveaway
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mark, art, uprightWatch } from './prize-art.mjs';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const html = readFileSync(join(here, 'giveaway-og.html'), 'utf8')
  .replace('%%MARK%%', mark)
  .replace('%%WATCH%%', uprightWatch('og'))
  .replace('%%STRAP%%', art('PrizeStrapArt.svelte', 'og'));

const tmp = join(here, '.giveaway-og.tmp.html');
writeFileSync(tmp, html);

const out = join(here, '../static/giveaway/og.png');
try {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,630',
    `--screenshot=${out}`,
    // Long enough for the webfont to land; the card has no other network work.
    '--virtual-time-budget=8000',
    `file://${tmp}`,
  ], { stdio: 'inherit' });
} finally {
  unlinkSync(tmp);
}
console.log(`wrote ${out}`);
