/**
 * The FALLBACK step total for Android, for a device whose Health Connect
 * cannot aggregate. Kept free of react-native/store imports so the rule runs
 * in jest; the reading shell is ./healthConnect.
 *
 * Health Connect holds one set of Steps records PER WRITING APP, all covering
 * the same minutes: a user with a Garmin sees Garmin's records, the phone's
 * own system provider's, and any other tracker's, stacked. Summing them was
 * `readDayLoad`'s original bug and it triple-counted — a real journal reported
 * 39,355 steps for a day Garmin called 14,217 and Health Connect itself called
 * 12,569 (14,217 + 12,569 + 12,569, exactly). The count feeds a FLOOR under
 * the pacing budget (`STEP_EFFORT` in `budget/burn.ts`), and a floor built
 * from three copies of one day replaces the whole measured estimate and
 * spends a budget the user never spent.
 *
 * The real answer is Health Connect's own aggregation, which merges sources
 * by app priority — that is what `readDayLoad` asks for first and what the
 * Health Connect app itself displays. This is the answer when that is
 * unavailable: the LARGEST SINGLE SOURCE, never the sum. It is not the
 * priority merge, which stitches sources per time segment, and where the two
 * differ this one is LOWER. That is the direction to be wrong in here: steps
 * are a floor, so under-claiming costs a day nothing.
 */

export type StepRecordLike = { count: number; metadata?: { dataOrigin?: string } };

export function stepTotalFromRecords(records: StepRecordLike[]): number {
  const bySource = new Map<string, number>();
  records.forEach((r) => {
    const n = Number(r.count);
    if (!Number.isFinite(n) || n <= 0) return;
    const src = r.metadata?.dataOrigin || '?';
    bySource.set(src, (bySource.get(src) || 0) + n);
  });
  let most = 0;
  bySource.forEach((v) => { if (v > most) most = v; });
  return Math.round(most);
}
