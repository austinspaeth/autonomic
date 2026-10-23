/**
 * What the free tier may do — pure logic, unit-tested (see __tests__/gating).
 *
 * There is no longer a counted limit here, and the file is kept as the place
 * one would go. Live HRV capture used to be capped at a session a day on the
 * free tier and no longer is, so every tier captures as many readings as it
 * likes. Capture is the thing this app exists to do: a user who has run out of
 * it for the day has no reason to open the app again until tomorrow, and the
 * cap fell hardest on the days worth measuring twice. Pro earns its price on
 * what the app makes of the readings (full history, Insights, POTS RESULTS and
 * AI reports), not on rationing them. The POTS captures follow the same line as
 * of 1.26: they run on every tier, on the watch and on a strap, and reading the
 * result is the Pro half (src/features/PotsLock.tsx).
 *
 * `hrvCaptureUsedToday` survives that removal because it was never only a
 * meter: it is also the clean-day protocol's definition of "took a reading
 * today" (src/lib/scoring/day.ts).
 */
import { isTrustedReading } from './hrvQuality';
import type { DayRecord } from './types';

/** Reading types produced by the live HRV flow (src/features/hrv/Results.tsx). */
const LIVE_HRV_TYPES = new Set(['hrv', 'breathHrv']);

/**
 * How many HRV readings were taken that day.
 *
 * An in-app capture always counts. An import from the health store counts when
 * it is a real session, which is the trust rule every other view uses (at least
 * four minutes of beat-to-beat RR, lib/hrvQuality): a Mindfulness reading taken
 * on the watch with the app closed is a reading the user TOOK, and the protocol
 * used to leave it unticked. The watch's passive one-minute background samples
 * still never count, which is what keeping imports out was protecting against.
 */
export function hrvCaptureUsedToday(day: DayRecord | null | undefined): number {
  if (!day || !Array.isArray(day.readings)) return 0;
  return day.readings.filter((r) => LIVE_HRV_TYPES.has(r.type) && (!r.imported || isTrustedReading(r))).length;
}
