/**
 * "Against this user's own normal" — the two primitives.
 *
 * Both were private to ./strain, where they answer "has this marker moved away
 * from the user's own 42-day baseline". The pacing budget asks the same
 * question of the same journal, and a second copy would be two places for the
 * coverage rule to drift. This population runs "abnormal" numbers every day of
 * the week and only the move away from their OWN normal means anything, so
 * these are the shape every comparison in the app takes.
 *
 * Pure: no store, no native, no React.
 */
import { median } from '../trends/compare';
import type { DaysMap } from './day';
import type { Entry } from '../types';

export interface Shift {
  /** Median of the recent window. */
  r: number;
  /** Median of the baseline window. */
  b: number;
  delta: number;
  recentN: number;
  baseN: number;
}

/**
 * Median of each window plus the move between them, or null when EITHER window
 * is too thin to compare. The null is the point: a two-reading baseline that
 * quietly became a percentage is how an app tells somebody something confident
 * and false about their body.
 */
export function shift(recent: number[], base: number[], minRecent: number, minBase: number): Shift | null {
  if (recent.length < minRecent || base.length < minBase) return null;
  const r = median(recent);
  const b = median(base);
  if (!Number.isFinite(r) || !Number.isFinite(b)) return null;
  return { r, b, delta: r - b, recentN: recent.length, baseN: base.length };
}

/** Every entry value of one kind across a key range, flattened and filtered. */
export function pick(
  days: DaysMap,
  keys: string[],
  kind: 'activities' | 'readings' | 'symptoms',
  of: (e: Entry) => number | null,
): number[] {
  const out: number[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    (d[kind] || []).forEach((e: Entry) => {
      const v = of(e);
      if (v != null) out.push(v);
    });
  });
  return out;
}
