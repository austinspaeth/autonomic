// The brand mark and the giveaway prize drawings, read out of their Svelte
// components as plain SVG, for the renderers that draw them outside the site
// (the giveaway share card, the App Store event art). Reading rather than
// copying is what keeps those images from drifting from the site.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const lib = join(dirname(fileURLToPath(import.meta.url)), '../src/lib');

export const mark = readFileSync(join(lib, 'BrandMark.svelte'), 'utf8').match(/<path d="([^"]+)"/)?.[1];
if (!mark) throw new Error('BrandMark.svelte: no <path d="..."> found');

/** A prize component's <svg>, with its id suffix filled in and no Svelte left. */
export function art(file, k) {
  const src = readFileSync(join(lib, file), 'utf8');
  const svg = src.match(/<svg[\s\S]*<\/svg>/)?.[0];
  if (!svg) throw new Error(`${file}: no <svg> found`);
  // Expand `{#each [a, b] as x}…{/each}` (the watch's strap holes): each copy
  // gets `attr={expr}` and the `{x}` shorthand evaluated with x bound.
  const expanded = svg.replace(/\{#each \[([^\]]+)\] as (\w+)\}([\s\S]*?)\{\/each\}/g, (_, list, name, body) =>
    list.split(',').map((v) => {
      const val = Number(v.trim());
      const calc = (expr) => String(new Function(name, `return (${expr});`)(val));
      return body
        .replace(new RegExp(`(\\s)\\{${name}\\}`, 'g'), `$1${name}="${val}"`)
        .replace(/=\{([^}]+)\}/g, (_m, expr) => `="${calc(expr)}"`);
    }).join(''));
  const out = expanded.replaceAll('{k}', k);
  if (/[{}]/.test(out)) throw new Error(`${file}: Svelte syntax left after filling {k}`);
  return out;
}

/** The watch as the site draws it, but standing upright (the site tilts it 7°). */
export const uprightWatch = (k) => art('PrizeWatchArt.svelte', k).replace(' transform="rotate(-7 100 125)"', '');
