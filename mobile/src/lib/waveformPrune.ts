/**
 * "May the orphan sweep run now?" — the rule, with no store behind it.
 *
 * The sweep itself is `pruneOrphanWaveforms` in src/store/store.ts, and this
 * clock exists because of what that sweep IS: a mark-and-sweep whose ROOT SET
 * is the journal. Anything in the waveform sidecar the journal does not
 * reference is deleted, so a journal that is empty, truncated or mid-repair at
 * that instant is a root set that condemns every RR trace, workout curve and
 * sleep series on the device.
 *
 * Reclaiming bytes is never urgent — the sweep's own catch says so, "strays
 * cost bytes, not correctness" — so running it on every launch bought nothing
 * and handed it one chance per launch to be wrong. Weekly keeps the orphans
 * bounded and cuts those chances by about sevenfold.
 *
 * Pure, so the rule is tested without native modules; the stamp lives in
 * `waveformPruneMemory.ts`.
 */

/** A week. Orphans are bytes; a week of them is a rounding error beside the
 *  16 MB of real curves a mistimed sweep can take. */
export const PRUNE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * May the sweep run now?
 *
 * A null stamp is DUE — a device that has never swept is the one most likely to
 * be carrying strays from an older build. An unreadable stamp is due for the
 * same reason. A stamp in the FUTURE is due too: a clock moved backwards must
 * not park the sweep for a week.
 */
export function pruneDue(lastAt: number | null, now: number): boolean {
  if (lastAt == null || !Number.isFinite(lastAt)) return true;
  if (lastAt > now) return true;
  return now - lastAt >= PRUNE_INTERVAL_MS;
}
