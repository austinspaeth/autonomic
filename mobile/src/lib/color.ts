/**
 * Small pure colour helpers, shared by the cards that tint themselves with a
 * grade colour. Lifted out of DaySummary, which owned the only copies.
 *
 * No React, no store, no native.
 */

/** `#rrggbb` -> `rgba(...)` at alpha `a`. Passes anything unparseable through. */
export const hexA = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** `#rrggbb` or `rgb(r,g,b)` -> channels. The second form matters because these
 *  helpers compose: `mixHex` returns `rgb(...)`, and a blend that could not read
 *  its own output back would have to round-trip through hex. */
const parse = (color: string): [number, number, number] | null => {
  const h = /^#?([0-9a-f]{6})$/i.exec(color);
  if (h) {
    const n = parseInt(h[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color);
  if (r) return [Number(r[1]), Number(r[2]), Number(r[3])];
  return null;
};

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/** Opaque blend of `t` parts `color` into `base` — flag/warning containers use
 *  this instead of a transparent tint so text stays readable over the hero's
 *  wash. */
export const mixHex = (color: string, base: string, t: number) => {
  const nc = parse(color), nb = parse(base);
  if (!nc || !nb) return base;
  return rgb([0, 1, 2].map((i) => nc[i] * t + nb[i] * (1 - t)) as [number, number, number]);
};
