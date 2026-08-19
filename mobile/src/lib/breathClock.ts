/**
 * The breathing pace, as a function of the wall clock.
 *
 * The guide used to be a self-contained animation: a JS loop inside
 * BreathingViz stepped from phase to phase and drove Reanimated shared values,
 * so the rhythm existed only as long as that component stayed mounted. The
 * moment a reading could be MINIMIZED into a pill (and restored, and hidden
 * into focus mode) that stopped being good enough — every unmount restarted the
 * cycle from "breathe in", and a paced reading whose pattern jumps mid-capture
 * is a ruined reading, not a cosmetic glitch.
 *
 * So the pace is derived instead: given the instant the guide started and how
 * long each phase lasts, `phaseAt` / `progressAt` answer "where in the breath
 * are we RIGHT NOW". Every surface (the card's rings, the pill's bars, the
 * phase word, the haptic scheduler) reads the same function, so they cannot
 * drift from each other or from the reading, and a view that mounts halfway
 * through an exhale picks it up halfway through the exhale.
 *
 * Pure and unit-tested. The animation on top of it is not: it re-targets a
 * shared value at each boundary, seeded from these numbers.
 */

export type BreathPhase = 'in' | 'holdIn' | 'out' | 'holdOut';

export interface BreathPattern { inhale: number; holdIn: number; exhale: number; holdOut: number }

/** "4/6" → in/out · "4/7/8" → in/hold/out · "4/4/4/4" → in/hold/out/hold. */
export function parsePattern(style?: string): BreathPattern {
  const parts = (style || '4/6').split('/').map(Number).filter((n) => !isNaN(n) && n > 0);
  if (parts.length >= 4) return { inhale: parts[0], holdIn: parts[1], exhale: parts[2], holdOut: parts[3] };
  if (parts.length === 3) return { inhale: parts[0], holdIn: parts[1], exhale: parts[2], holdOut: 0 };
  return { inhale: parts[0] || 4, holdIn: 0, exhale: parts[1] || 6, holdOut: 0 };
}

/** The phases this pattern actually has, in order, with their durations in ms. */
export function phaseList(p: BreathPattern): { key: BreathPhase; ms: number }[] {
  return ([
    { key: 'in' as const, ms: p.inhale * 1000 },
    { key: 'holdIn' as const, ms: p.holdIn * 1000 },
    { key: 'out' as const, ms: p.exhale * 1000 },
    { key: 'holdOut' as const, ms: p.holdOut * 1000 },
  ]).filter((ph) => ph.ms > 0);
}

export const cycleMs = (p: BreathPattern) => phaseList(p).reduce((s, ph) => s + ph.ms, 0);

export interface BreathPoint {
  phase: BreathPhase;
  /** How far into this phase we are, 0..1. */
  t: number;
  /** ms until the next phase boundary — what a scheduler sleeps for. */
  remainMs: number;
  /** Length of the current phase in ms. */
  phaseMs: number;
  /** Index of the phase within the pattern's cycle (a scheduler's cursor). */
  index: number;
}

/**
 * Where the breath is `elapsedMs` after the guide started.
 *
 * Negative elapsed (a start stamped in the future, which only happens if the
 * clock moves) reads as the very beginning rather than wrapping backwards into
 * the exhale.
 */
export function phaseAt(p: BreathPattern, elapsedMs: number): BreathPoint {
  const phases = phaseList(p);
  const total = phases.reduce((s, ph) => s + ph.ms, 0);
  let rem = total > 0 ? ((elapsedMs % total) + total) % total : 0;
  if (elapsedMs < 0) rem = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    if (rem < ph.ms) {
      return { phase: ph.key, t: ph.ms ? rem / ph.ms : 0, remainMs: ph.ms - rem, phaseMs: ph.ms, index: i };
    }
    rem -= ph.ms;
  }
  const last = phases[phases.length - 1];
  return { phase: last.key, t: 1, remainMs: 0, phaseMs: last.ms, index: phases.length - 1 };
}

/** Eased sine, matching the Easing.inOut(Easing.sin) the rings animate with. */
const easeInOutSin = (t: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;

/**
 * Ring bloom position, 0 (fully exhaled, glow at the centre) → 1 (fully
 * inhaled, glow at the outer ring). A hold holds the position it was handed:
 * a top hold sits at 1, a bottom hold at 0. This is the number a view seeds its
 * shared value with when it mounts mid-phase.
 */
export function progressAt(p: BreathPattern, elapsedMs: number): number {
  const { phase, t } = phaseAt(p, elapsedMs);
  if (phase === 'in') return easeInOutSin(t);
  if (phase === 'out') return 1 - easeInOutSin(t);
  return phase === 'holdIn' ? 1 : 0;
}

/**
 * Hold brightening, 0 (resting) → 1 (fully brightened). It builds over a hold
 * and releases through the phase that follows, which is why it is not simply
 * "1 while holding".
 */
export function glowAt(p: BreathPattern, elapsedMs: number): number {
  const { phase, t } = phaseAt(p, elapsedMs);
  if (phase === 'holdIn' || phase === 'holdOut') return easeInOutSin(t);
  // Released over the first ~60% of the phase after a hold, and only if the
  // phase before this one WAS a hold.
  const phases = phaseList(p);
  if (phases.length < 3) return 0;
  const { index } = phaseAt(p, elapsedMs);
  const prev = phases[(index - 1 + phases.length) % phases.length].key;
  if (prev !== 'holdIn' && prev !== 'holdOut') return 0;
  return Math.max(0, 1 - t / 0.6);
}
