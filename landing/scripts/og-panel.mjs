// The social card's brand PANEL: a dark glass plate in the card's top-right
// corner holding the wordmark and the two store badges, on one line.
//
// The geometry lives here because TWO things need it and they are in different
// worlds: gen-og-panel.mjs renders the plate's contents, and gen-og.mjs needs
// the same rectangle to blur the photo BEHIND it (the glass is real - sharp
// blurs that region of the cover before the plate goes on top, which a
// standalone HTML render cannot do for itself). Move one and the plate and its
// blur would part company.
//
// The SIZE is not written here: the plate shrinks to fit its own type, and
// gen-og-panel.mjs trims the render and records what it came to in
// og-panel.json. A hand-kept width is a number that goes wrong the first time
// a word or a badge changes length.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = join(here, 'og-panel.json');

const size = existsSync(SIZE)
  ? JSON.parse(readFileSync(SIZE, 'utf8'))
  : { w: 0, h: 0 };

export const PANEL = {
  ...size,
  // Inset from the card's top-right corner. The two are separate because
  // EQUAL is not the same as even here: the plate is wide and short, which
  // makes a matching gap above it read as the larger of the two, so the top is
  // set a little tighter by eye.
  insetTop: 26,
  insetRight: 36,
  // Must match .plate's border-radius in og-panel.html, or the blurred patch
  // and the plate on top of it would have different corners.
  radius: 22,
  // How hard the cover is blurred under the plate.
  blur: 22,
};

export const panelRect = (cardWidth) => ({
  left: cardWidth - PANEL.insetRight - PANEL.w,
  top: PANEL.insetTop,
  width: PANEL.w,
  height: PANEL.h,
});
