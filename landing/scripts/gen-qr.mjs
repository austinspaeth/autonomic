/**
 * Regenerate the download QR codes in static/.
 *
 * The QRs encode the SAME attribution-tagged URLs as the on-page CTAs, so a
 * scan from a laptop screen is credited to the site just like a click. Their
 * source of truth is storeUrl() in src/lib/site.ts, imported directly (Node 24
 * strips the type annotations), so the two can't drift.
 *
 *   npm run qr
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import QRCode from 'qrcode';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { storeUrl, GIVEAWAY_CAMPAIGN } = await import(pathToFileURL(join(root, 'src/lib/site.ts')).href);

const TARGETS = [
  { file: 'static/qr-ios.svg', url: storeUrl('ios') },
  { file: 'static/qr-android.svg', url: storeUrl('android') },
  // The giveaway page's modal swaps these in (see aj-store-campaign in app.html).
  { file: `static/qr-ios-${GIVEAWAY_CAMPAIGN}.svg`, url: storeUrl('ios', GIVEAWAY_CAMPAIGN) },
  { file: `static/qr-android-${GIVEAWAY_CAMPAIGN}.svg`, url: storeUrl('android', GIVEAWAY_CAMPAIGN) }
];

for (const { file, url } of TARGETS) {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#111318', light: '#0000' }
  });
  writeFileSync(join(root, file), svg);
  console.log(`${file}  <-  ${url}`);
}
