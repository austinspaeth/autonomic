/**
 * Does a connected heart-rate device send beat-to-beat intervals, or only a pulse?
 *
 * The Bluetooth Heart Rate Measurement characteristic (0x2A37) carries RR
 * intervals only when bit 4 of its flags byte is set, and a device is free never
 * to set it. Chest straps do. Several popular wrist devices do not: a Fitbit
 * Charge 6 sharing its heart rate with gym equipment is the case that prompted
 * this file — it advertises 0x180D, connects, and streams a perfectly good
 * `71 bpm` in a two-byte packet with nowhere for an RR interval to live.
 *
 * Such a device cannot produce an HRV reading at all, because every metric in
 * `lib/hrv` is a statistic OVER the intervals rather than over the pulse. Before
 * this, one paired cleanly in the strap picker and the user sat through a full
 * five-minute paced session that `Results` then declined to save — the right
 * outcome reached at the worst possible moment, and on a clean-day protocol a
 * reading they cannot retake. This is how the session finds out at the START,
 * while the strap is connecting and nobody has spent anything yet.
 *
 * The verdict is deliberately THREE-valued, and 'unknown' is never reported as
 * 'absent'. A strap that has only just connected genuinely has not said yet, and
 * accusing somebody's working strap of a fault it does not have is a far worse
 * failure than making them wait a few more seconds for the Start button.
 */

export type RrSupport = 'unknown' | 'present' | 'absent';

/** Running tally of what the device on the other end has actually sent. */
export interface RrWatch {
  /** Notifications carrying a real pulse — see `noteRrSample` for why a
   *  zero-heart-rate sample is not one of them. */
  measurements: number;
  /** Latched: a single RR interval settles the question for good. */
  rrSeen: boolean;
}

export const RR_WATCH_START: RrWatch = { measurements: 0, rrSeen: false };

/**
 * How many pulse-carrying notifications without a single RR interval before we
 * are willing to say the device does not send them.
 *
 * 0x2A37 notifies at roughly 1 Hz, so this is about twenty seconds. Generous on
 * purpose, and the generosity runs one way only: a strap reports RR on
 * essentially every notification once it has a beat, so twenty in a row without
 * one is not a warm-up — whereas being wrong in the other direction means
 * telling someone their good strap is broken.
 */
export const NO_RR_MEASUREMENTS = 20;

/**
 * Fold one sample into the tally.
 *
 * A sample carrying no heart rate is not evidence of anything. A strap that is
 * connected but not yet on the chest reports `hr: 0` with no RR, and counting
 * those would convict it on exactly the samples that mean "not measuring yet".
 */
export function noteRrSample(w: RrWatch, s: { hr: number; rr: number[] }): RrWatch {
  if (s.rr.length) return w.rrSeen ? w : { ...w, rrSeen: true };
  if (!s.hr || w.rrSeen) return w;
  return { ...w, measurements: w.measurements + 1 };
}

export function rrSupport(w: RrWatch): RrSupport {
  if (w.rrSeen) return 'present';
  return w.measurements >= NO_RR_MEASUREMENTS ? 'absent' : 'unknown';
}
