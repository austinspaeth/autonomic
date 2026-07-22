/**
 * RR-backed Apple Health reading candidates — the shape the watch-sync poller
 * and the on-demand HRV import sheet both hand to the results card. Pure module
 * (no native imports) so the window logic stays unit-testable; the actual
 * HealthKit/ECG fetch lives in ./rrSearch.ts.
 */

export interface RrCandidate {
  key: string;
  kind: 'hrv' | 'ecg';
  rr: number[];         // beat-to-beat RR (ms)
  startMs: number;
  endMs: number;
  avgHr: number | null; // ECG-reported average HR, results fallback when RR is too dirty
  sourceName: string;   // e.g. "Apple Watch"
}

/** Split candidates into ones overlapping [windowFromMs, windowToMs] (the
 *  session window, auto-synced) and the rest (elsewhere in the scan range,
 *  offered as a manual pick). Preserves order within each group. */
export function partitionCandidates<T extends { startMs: number; endMs: number }>(
  cands: readonly T[], windowFromMs: number, windowToMs: number,
): { inWindow: T[]; outside: T[] } {
  const inWindow: T[] = [];
  const outside: T[] = [];
  for (const c of cands) {
    (c.startMs <= windowToMs && c.endMs >= windowFromMs ? inWindow : outside).push(c);
  }
  return { inWindow, outside };
}

/** Local midnight of the day containing `ms` — the wide-scan floor. */
export function dayStartMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
