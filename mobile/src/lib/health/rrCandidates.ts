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
  /** Indices into `rr` where the series resumed after a dropout. A watch
   *  heartbeat series flags the beats it lost; the intervals either side of a
   *  gap are not a real RR, so the record is a sequence of segments and the
   *  frequency domain must not be computed across the seams. Absent/empty on a
   *  continuous take (an ECG, or a series with no flagged gaps). */
  segmentStarts?: number[];
  startMs: number;
  endMs: number;
  avgHr: number | null; // ECG-reported average HR, results fallback when RR is too dirty
  sourceName: string;   // e.g. "Apple Watch"
}

/** Minimum length for a manual-pick offer — shorter readings (a quick 1-minute
 *  Breathe, a truncated ECG) don't carry enough beats for a trustworthy score.
 *  The setup copy asks for a 5-minute session, so 4 minutes is the floor that
 *  still admits a slightly-short one. Exported so the poller charges the SAME
 *  floor against an auto-synced reading — a background 1-minute HRV sample
 *  sitting in HealthKit must never stand in for the session the wearer took. */
export const MIN_PICK_MS = 4 * 60000;

/** Whether a reading is worth offering as a manual pick: it actually carries
 *  beat-to-beat data and ran at least 4 minutes. */
export const isPickable = (c: Pick<RrCandidate, 'rr' | 'startMs' | 'endMs'>) =>
  c.rr.length > 0 && c.endMs - c.startMs >= MIN_PICK_MS;

/** Seconds of beat-to-beat data a candidate carries, without running the
 *  pipeline. The frequency floors in lib/hrv are charged against summed RR, not
 *  wall clock, so this is the number to ask "what will this resolve?" with. */
export const rrSeconds = (c: Pick<RrCandidate, 'rr'>) =>
  c.rr.reduce((s, v) => s + v, 0) / 1000;

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

/** Milliseconds of `c` that fall inside [fromMs, toMs]. */
export const overlapMs = (c: { startMs: number; endMs: number }, fromMs: number, toMs: number) =>
  Math.max(0, Math.min(c.endMs, toMs) - Math.max(c.startMs, fromMs));

/**
 * Which in-window reading IS the session the wearer just took.
 *
 * The poller used to take the first thing that overlapped the window, and the
 * window is ~11 minutes wide (the session plus 3 minutes' grace each side), so
 * a passive 1-minute background HRV sample already sitting in HealthKit beat
 * the Mindfulness series that was still being handed off from the wrist. The
 * short sample then supplied the whole day's structured metrics — under 2
 * minutes of RR resolves no frequency domain at all — and the user's score lost
 * Total power, VLF and LF peak on a day she had measured six times.
 *
 * So: the same 4-minute floor the manual list charges applies here too, and
 * among what survives, the reading that spent the most time inside the session
 * window wins (length breaks a tie, then summed RR). Returns null when nothing
 * in the window clears the floor — the caller keeps waiting rather than
 * settling for a sample it would have to disclaim.
 */
export function pickSessionCandidate<T extends { rr: number[]; startMs: number; endMs: number }>(
  cands: readonly T[], windowFromMs: number, windowToMs: number,
): T | null {
  const { inWindow } = partitionCandidates(cands, windowFromMs, windowToMs);
  const usable = inWindow.filter(isPickable);
  if (!usable.length) return null;
  return usable.reduce((best, c) => {
    const o = overlapMs(c, windowFromMs, windowToMs), ob = overlapMs(best, windowFromMs, windowToMs);
    if (o !== ob) return o > ob ? c : best;
    const d = c.endMs - c.startMs, db = best.endMs - best.startMs;
    if (d !== db) return d > db ? c : best;
    return rrSeconds(c) > rrSeconds(best) ? c : best;
  });
}

/** Local midnight of the day containing `ms` — the wide-scan floor. */
export function dayStartMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
