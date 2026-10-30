/**
 * Which Health Connect records belong to ONE workout. Kept free of
 * react-native/store imports so the rule runs in jest; the reading shell is
 * ./healthConnect, the one-time repair is `repairWorkoutDistances` in ./updates.
 *
 * An ExerciseSession carries no distance or heart rate of its own, so they are
 * read from the Distance / HeartRate records inside the session's window. But
 * Health Connect holds those records PER WRITING APP, stacked over the same
 * minutes: a runner with a Garmin has Garmin Connect's GPS distance AND the
 * phone's own step-based distance from Samsung Health. Summing every record in
 * the window was the original bug, the `stepTotal` bug in a second place: a
 * 10.75 km run Garmin Connect showed as 10.75 km was filed as 18.76 km at a
 * 3:05/km pace nobody ran.
 *
 * The session's own app is the answer, since it is the number the user sees
 * when they open that workout there. Only when that app wrote nothing do we
 * fall back to the other sources, and then never as a sum.
 */

export type OriginRecord = { metadata?: { dataOrigin?: string } };
export type DistanceRecordLike = OriginRecord & { distance?: { inMeters?: number } };

/** The records the session's own app wrote, or every record when it wrote
 *  none (or the session carries no provenance) — a lone other source is still
 *  better than nothing, which is the heart-rate case. */
export function recordsForSession<T extends OriginRecord>(records: T[], origin: string | undefined): T[] {
  if (!origin) return records;
  const own = records.filter((r) => r.metadata?.dataOrigin === origin);
  return own.length ? own : records;
}

const metersOf = (r: DistanceRecordLike): number => {
  const m = Number(r.distance?.inMeters);
  return Number.isFinite(m) && m > 0 ? m : 0;
};

/** Distance the session's own app recorded inside it, or null when it wrote
 *  none — the caller then asks Health Connect's merged aggregate. */
export function sessionOwnMeters(records: DistanceRecordLike[], origin: string | undefined): number | null {
  if (!origin) return null;
  const own = records.filter((r) => r.metadata?.dataOrigin === origin);
  if (!own.length) return null;
  const sum = own.reduce((s, r) => s + metersOf(r), 0);
  return sum > 0 ? sum : null;
}

/** The last resort when neither the session's app nor the aggregate answers:
 *  the LARGEST SINGLE SOURCE, never the sum (`stepTotalFromRecords`' rule). */
export function largestSourceMeters(records: DistanceRecordLike[]): number {
  const bySource = new Map<string, number>();
  for (const r of records) {
    const src = r.metadata?.dataOrigin || '?';
    bySource.set(src, (bySource.get(src) || 0) + metersOf(r));
  }
  let most = 0;
  bySource.forEach((v) => { if (v > most) most = v; });
  return most;
}

/**
 * The repair's decision for one stored workout: the corrected distance (miles,
 * as the entry stores it) or null to leave it alone. Only ever LOWERS, because
 * the bug only ever added: a fresh read that comes back higher, or with no
 * distance at all, is not evidence the stored one was inflated, and a distance
 * the user already corrected by hand reads back equal and is left untouched.
 */
export function correctedDistance(stored: unknown, freshMi: number | null): string | null {
  const old = Number(stored);
  if (!Number.isFinite(old) || old <= 0) return null;
  if (freshMi == null || !(freshMi > 0)) return null;
  return freshMi < old - 0.01 ? String(freshMi) : null;
}
