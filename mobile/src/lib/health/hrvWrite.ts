/**
 * Should this HRV reading be published to Apple Health / Health Connect, and
 * with what values?
 *
 * One rule for every path that files a reading of our own: the results card a
 * phone-driven capture ends on (`features/hrv/Results.tsx`) and the Garmin
 * receiver, where a reading taken on the wrist lands with no card at all
 * (`lib/garmin/receiver.ts`). The Garmin path used to write nothing, so a
 * Garmin user with Health connected found every other reading in Apple Health
 * and none of those — two call sites deciding the same question separately is
 * exactly how they drift.
 *
 * Pure: the caller answers "is Health on" (`enabled`), since that needs the
 * native module and the store.
 */
import type { Entry } from '../types';

export interface HrvSessionWrite {
  sdnnMs?: number;
  rmssdMs?: number;
  avgHr?: number;
  startISO: string;
  durationSec: number;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export function hrvHealthWrite(
  entry: Entry,
  opts: {
    /** Health is available on this device AND `settings.healthEnabled`. */
    enabled: boolean;
    /** When the reading started, if the caller knows better than the entry. */
    startMs?: number | null;
    /** Clock for the last-resort start time; injectable for tests. */
    nowMs?: number;
  },
): HrvSessionWrite | null {
  if (!opts.enabled) return null;
  if (entry.type !== 'hrv' && entry.type !== 'breathHrv') return null;
  // An Apple Watch reading came FROM the health store; writing it back would
  // be a duplicate.
  if (entry.source === 'watch') return null;
  // A DEGRADED reading is never published: the journal carries its caveat with
  // the number, the health store has nowhere to put one.
  if (entry.degraded) return null;

  const durationSec = num(entry.durationSec);
  if (durationSec == null || durationSec <= 0) return null;

  const sdnnMs = num(entry.sdnn);
  const rmssdMs = num(entry.rmssd);
  if (sdnnMs == null && rmssdMs == null) return null;
  const avgHr = num(entry.hr) ?? num(entry.avgHr);

  const parsedStart = typeof entry.startedAt === 'string' ? Date.parse(entry.startedAt) : NaN;
  const startMs = opts.startMs
    || (Number.isFinite(parsedStart) ? parsedStart : (opts.nowMs ?? Date.now()) - durationSec * 1000);

  return { sdnnMs, rmssdMs, avgHr, startISO: new Date(startMs).toISOString(), durationSec };
}

/**
 * The same question for a reading that ARRIVED from a wrist (Garmin), where
 * the arrival itself adds three gates of its own:
 *
 * - FRESH only. The watch re-delivers until acked, so the same reading can
 *   land several times; only its first arrival may write, or a lost ack would
 *   put a second sample in the health store.
 * - Readings only (a symptom rides the same transport).
 * - Not REFUSED. A reading the capture gate would have declined is still filed
 *   in the journal, but a refused phone-side capture is never written
 *   anywhere, and the health store should not learn the difference.
 */
export function arrivalHealthWrite(
  arrival: { fresh: boolean; section: string; refused?: boolean; entry: Entry },
  opts: { enabled: boolean; nowMs?: number },
): HrvSessionWrite | null {
  if (!arrival.fresh || arrival.section !== 'readings' || arrival.refused) return null;
  return hrvHealthWrite(arrival.entry, opts);
}
