/**
 * What the free tier may do — pure logic, unit-tested (see __tests__/gating).
 *
 * There is no longer a counted limit here, and the file is kept as the place
 * one would go. Live HRV capture used to be capped at a session a day on the
 * free tier and no longer is, so every tier captures as many readings as it
 * likes. Capture is the thing this app exists to do: a user who has run out of
 * it for the day has no reason to open the app again until tomorrow, and the
 * cap fell hardest on the days worth measuring twice. Pro earns its price on
 * what the app makes of the readings (full history, Insights, POTS testing and
 * AI reports), not on rationing them.
 *
 * `hrvCaptureUsedToday` survives that removal because it was never only a
 * meter: it is also the clean-day protocol's definition of "took a reading
 * today" (src/lib/scoring/day.ts).
 */
import type { DayRecord } from './types';

/** Reading types produced by the live HRV flow (src/features/hrv/Results.tsx). */
const LIVE_HRV_TYPES = new Set(['hrv', 'breathHrv']);

/**
 * How many of today's readings were live in-app HRV captures.
 *
 * Only in-app captures count — readings auto-imported from the platform health
 * store carry `imported: true` (src/features/Health.tsx, Onboarding backfill),
 * so a watch owner's protocol doesn't tick itself before they open the app.
 */
export function hrvCaptureUsedToday(day: DayRecord | null | undefined): number {
  if (!day || !Array.isArray(day.readings)) return 0;
  return day.readings.filter((r) => LIVE_HRV_TYPES.has(r.type) && !r.imported).length;
}
