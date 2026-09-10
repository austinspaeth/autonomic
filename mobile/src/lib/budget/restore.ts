/**
 * Two guards that keep a day's passive load from being lost, pure + tested.
 *
 * `days[dk].load` is written from a health read and, once the day is over,
 * sealed. Two things have destroyed one on a real phone:
 *
 *   A MIGRATOR THAT DROPPED THE FIELD. `migrate()` rebuilt every day field by
 *   field and for one build did not know `load`, so each launch erased every
 *   past day's record, and the waveform prune then deleted the curves that
 *   named them. `cleanLoad` fixed the cause, but a journal that already went
 *   through it has no record left for `sealYesterday` to finish — the day reads
 *   "0m · Logged activities only" (or "No pacing data") for good. The health
 *   store still holds every one of those days, so they are read back ONCE.
 *
 *   A READ THAT CAME BACK EMPTIER THAN WHAT IT REPLACES. A launch in the
 *   background on a locked iPhone cannot read HealthKit at all (the store is
 *   encrypted until first unlock), and every query then answers "nothing"
 *   rather than failing. Written over a full record — and the closing read of
 *   yesterday is a FORCED write — that sealed a whole day as empty. Samples in
 *   a health store only ever accumulate, so a source the record already had
 *   and the read does not is a failed read, never a quieter day.
 */
import type { DayLoadRead } from '../health';
import type { DayLoad, DayRecord } from '../types';
import { BASELINE_DAYS } from './baseline';

/** How far back an erased journal is read back: the ceiling's own history. */
export const RESTORE_DAYS = BASELINE_DAYS;

/** Launches allowed to try the restore before it gives up for good. A phone
 *  that has since lost the permission would otherwise run forty-two empty
 *  reads on every launch. */
export const RESTORE_MAX_ATTEMPTS = 3;

/** Did this read bring back anything at all? */
export function readHasEvidence(r: DayLoadRead): boolean {
  return r.steps != null || r.standMin != null || !!(r.hr && r.hr.length);
}

/**
 * Would writing this read LOSE a source the stored record already holds?
 *
 * True means the read failed and the stored record must stand. Checked per
 * source rather than as "is the read empty", because the queries fail
 * independently: steps can land while the heart-rate query throws, and that
 * write would silently strip the day's intensity.
 */
export function readLosesEvidence(r: DayLoadRead, existing: DayLoad | null | undefined): boolean {
  if (!existing) return false;
  if (existing.steps != null && r.steps == null) return true;
  if (existing.standMin != null && r.standMin == null) return true;
  if (existing.hrCoverageMin != null && !(r.hr && r.hr.length)) return true;
  return false;
}

/**
 * The past days to read back from the health store, NEWEST first, or none.
 * Newest first because the read can be cut short (the app backgrounds), and
 * yesterday is the day somebody is looking at; the restored day also retires
 * the check, so what did not get read by then stays unknown.
 *
 * The signature of the erasure is specific: steps HAVE reached this install
 * (`stepsSeen`, a flag outside the journal the migrator could not touch), and
 * yet not one day before today holds a record. A working install that has read
 * steps even once has that day on file, so this never fires for it — and a
 * fresh install has not seen steps, so its pre-install days stay unknown
 * exactly as `dayIsKnown` intends.
 *
 * Self-retiring: the first day restored is a past day with a record, and the
 * check answers nothing from then on.
 */
export function erasedLoadDays(
  days: Record<string, DayRecord | undefined>,
  dk: string,
  addDays: (dk: string, n: number) => string,
  stepsSeen: boolean,
  lookback: number = RESTORE_DAYS,
): string[] {
  if (!stepsSeen) return [];
  const out: string[] = [];
  for (let i = 1; i <= lookback; i++) {
    const k = addDays(dk, -i);
    if (days[k]?.load?.readAt) return [];
    out.push(k);
  }
  return out;
}
