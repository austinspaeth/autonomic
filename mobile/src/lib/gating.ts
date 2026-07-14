/**
 * Free-tier feature limits — pure logic, unit-tested (see __tests__/gating).
 *
 * The only counted limit is live HRV capture: free users get one live session
 * per day. Only in-app captures count — readings auto-imported from the
 * platform health store carry `imported: true` (src/features/Health.tsx,
 * Onboarding backfill) and must not consume the allowance, otherwise a watch
 * owner's capture button would be locked before they ever opened the app.
 * Manual entries (BP, resting HR, …) are different reading types entirely and
 * are never limited — journaling is always free.
 */
import type { DayRecord } from './types';
import type { Tier } from './tier';

/** Live HRV sessions a free user may capture per calendar day. */
export const HRV_FREE_PER_DAY = 1;

/** Reading types produced by the live HRV flow (src/features/hrv/Results.tsx). */
const LIVE_HRV_TYPES = new Set(['hrv', 'breathHrv']);

/** How many of today's readings were live in-app HRV captures. */
export function hrvCaptureUsedToday(day: DayRecord | null | undefined): number {
  if (!day || !Array.isArray(day.readings)) return 0;
  return day.readings.filter((r) => LIVE_HRV_TYPES.has(r.type) && !r.imported).length;
}

/** Whether starting another live HRV capture is allowed on this tier. */
export function canCaptureHrv(tier: Tier, usedToday: number): boolean {
  return tier !== 'free' || usedToday < HRV_FREE_PER_DAY;
}
