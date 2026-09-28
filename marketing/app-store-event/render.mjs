// Renders the App Store in-app event media for the Dysautonomia Awareness Month
// giveaway from event.html, at the exact pixel sizes App Store Connect asks for:
//
//   event-card-1920x1080.png     Event card media (16:9)
//   event-details-1080x1920.png  Event details page media (9:16)
//
// The watch is read out of the landing site's PrizeWatchArt.svelte via
// landing/scripts/prize-art.mjs, the same source the giveaway page and its
// share card draw from.
//
//   node marketing/app-store-event/render.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { uprightWatch } from '../../landing/scripts/prize-art.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const src = readFileSync(join(here, 'event.html'), 'utf8');

for (const [layout, w, h, name] of [
  ['card', 1920, 1080, 'event-card-1920x1080.png'],
  ['detail', 1080, 1920, 'event-details-1080x1920.png'],
]) {
  const tmp = join(here, `.event-${layout}.tmp.html`);
  writeFileSync(tmp, src.replace('%%LAYOUT%%', layout).replace('%%WATCH%%', uprightWatch(layout)));
  const out = join(here, name);
  try {
    execFileSync(CHROME, [
      '--headless', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', `--window-size=${w},${h}`,
      `--screenshot=${out}`, '--virtual-time-budget=4000', `file://${tmp}`,
    ], { stdio: 'ignore' });
  } finally {
    unlinkSync(tmp);
  }
  console.log(`wrote ${out}`);
}
