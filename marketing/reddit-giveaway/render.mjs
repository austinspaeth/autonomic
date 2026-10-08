// Renders the Reddit post image for the Dysautonomia Awareness Month giveaway
// from post.html: reddit-giveaway-1920x1080.png, 16:9 at 2x (3840x2160).
//
// The watch and the Polar H10 are read out of the landing site's
// PrizeWatchArt / PrizeStrapArt via landing/scripts/prize-art.mjs.
//
//   node marketing/reddit-giveaway/render.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { art, uprightWatch } from '../../landing/scripts/prize-art.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const tmp = join(here, '.post.tmp.html');
const out = join(here, 'reddit-giveaway-1920x1080.png');
writeFileSync(tmp, readFileSync(join(here, 'post.html'), 'utf8')
  .replace('%%WATCH%%', uprightWatch('w'))
  .replace('%%STRAP%%', art('PrizeStrapArt.svelte', 's')));
try {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--window-size=1920,1080',
    `--screenshot=${out}`, '--virtual-time-budget=4000', `file://${tmp}`,
  ], { stdio: 'ignore' });
} finally {
  unlinkSync(tmp);
}
console.log(`wrote ${out}`);
