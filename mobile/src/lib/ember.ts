/**
 * The ember: a warm gradient drifting slowly along a shape, with a soft glow
 * breathing under it.
 *
 * It says "this is running hot" without saying it loudly. Slow motion reads as
 * heat rather than as loading, which is the whole reason it is allowed to be
 * the one animated thing on the Journal's cards.
 *
 * Shared by the pacing bar (a rectangle) and the Outlook gauge (an arc), so the
 * two cannot drift apart in speed, colour or feel. The geometry differs; the
 * timing, the palette and the seamless-loop rule live here.
 *
 * THE SEAM IS THE THING THIS FILE EXISTS TO GET RIGHT. A drifting gradient
 * loops by translating a doubled copy of a periodic pattern by exactly ONE
 * PERIOD and then snapping back — at which point the pattern lands precisely
 * where it started and nobody can see the join. Translate by anything else and
 * the snap is visible as a jolt once per cycle. The first version used a fixed
 * 200pt against a bar whose real width was nearer 300, so it jumped every three
 * and a half seconds. The period is therefore always MEASURED, never assumed.
 *
 * Pure: no React, no store, no native.
 */
import { mixHex } from './color';

/** One full drift, in ms. Slow on purpose: fast enough to be alive, far too
 *  slow to read as a spinner. */
export const EMBER_MS = 3400;
/** One breath of the glow. Deliberately not a divisor of EMBER_MS — the two
 *  cycles sliding against each other is what stops the whole thing feeling
 *  metronomic. */
export const EMBER_GLOW_MS = 1100;
export const EMBER_GLOW_MIN = 0.35;
export const EMBER_GLOW_MAX = 0.75;

/**
 * The warm highlight the base colour is lifted toward.
 *
 * Every colour this is used with is already warm (the grade ladder runs gold,
 * orange, red, dark red), so a single warm target lightens all of them without
 * turning any of them pink — which is what mixing toward plain white does to a
 * red.
 */
const WARM = '#ffd9a8';

export interface EmberStop { offset: number; color: string }

/**
 * Gradient stops for a doubled shape, periodic with period 0.5.
 *
 * Two identical cycles across the doubled width, so translating by half the
 * doubled width maps cycle two exactly onto cycle one. Both ends are the base
 * colour, so even the wrap between them is continuous.
 */
export function emberStops(base: string): EmberStop[] {
  const hot = mixHex(WARM, base, 0.5);
  const warm = mixHex(WARM, base, 0.34);
  // One cycle: base, hot, base, warm. Repeated once, then closed on base.
  const cycle = (o: number): EmberStop[] => [
    { offset: o + 0, color: base },
    { offset: o + 0.11, color: hot },
    { offset: o + 0.23, color: base },
    { offset: o + 0.35, color: warm },
  ];
  return [...cycle(0), ...cycle(0.5), { offset: 1, color: base }];
}

/** The glow that sits under the shape. Same colour, low alpha, and the caller
 *  decides whether it breathes or holds still. */
export const EMBER_GLOW_INSET = 3;
