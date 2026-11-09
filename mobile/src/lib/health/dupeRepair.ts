/**
 * One-time repair: the watch reading that reached the journal TWICE.
 *
 * A reading taken on the Apple Watch has two ways in — the watch-sync card
 * (and the on-demand "import from Apple Health" card) building it out of the
 * heartbeat series, and the quiet import check filing the same series on its
 * own initiative. There is no throttle on that check and a foreground is what
 * triggers it, so putting the phone down to use the watch and picking it up
 * again IS the moment it fires. Until the sample carried one identity
 * (`healthKey`, see `filedFromSample` in ./updateSet) whichever path lost the
 * race still wrote, and one session sat in the day twice: once as the check's
 * undecided copy ("Apple Watch HRV", `kindOpen`) and once as the card's own
 * ("Baseline HRV" / "Training HRV"). Fixing the write paths stops new pairs;
 * it cannot merge the ones already filed, because they are two entries with
 * two ids.
 *
 * Pure, and it needs no health read at all — the evidence is entirely in the
 * journal, which is why it can sweep the WHOLE of it rather than a recent
 * window. The shell is `repairDuplicateWristReadings` in ./updates.
 *
 * The rule is deliberately narrow: exactly the signature this bug produces and
 * nothing else. Two wrist HRV readings close enough to be one series, one of
 * them `imported` and one not, each matching only the other. Two readings a
 * user genuinely took minutes apart are both un-imported, and two copies from
 * the check cannot exist (it dedups against itself and against the journal), so
 * the mixed pair is the fingerprint. Anything ambiguous is left alone: a
 * duplicate is a tidying job, and deleting somebody's measurement on a guess
 * is not.
 */
import type { DayRecord, Entry } from '../types';

/**
 * Two wrist readings this close (minutes) are the same heartbeat series. The
 * import check's own `NEAR_MIN` (./updateSet): it is the bar that was supposed
 * to keep the second copy from being written in the first place, so it is the
 * bar that decides which pairs it let through.
 */
export const DUPE_NEAR_MIN = 10;

export interface DuplicatePair {
  dk: string;
  /** The card's own entry — the one that stays. */
  keepId: string;
  /** The quiet check's copy — the one that goes. */
  dropId: string;
  /** The sample's key, off whichever copy carried one, to stamp on the keeper. */
  healthKey: string | null;
}

const WRIST_HRV = (e: Entry) =>
  (e.type === 'hrv' || e.type === 'breathHrv') && e.source === 'watch';

const minOf = (t: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The pairs in one day, or none when the day is not unambiguous. */
export function duplicatesInDay(dk: string, day: DayRecord | undefined): DuplicatePair[] {
  const wrist = (day?.readings || []).filter(WRIST_HRV);
  const copies = wrist.filter((e) => e.imported === true);
  const own = wrist.filter((e) => e.imported !== true);
  if (!copies.length || !own.length) return [];

  const sameSeries = (a: Entry, b: Entry): boolean => {
    // The key is exact when both carry one; otherwise the clock, to the bar
    // that was meant to stop the second write.
    if (typeof a.healthKey === 'string' && typeof b.healthKey === 'string') return a.healthKey === b.healthKey;
    const ma = minOf(a.time); const mb = minOf(b.time);
    return ma != null && mb != null && Math.abs(ma - mb) <= DUPE_NEAR_MIN;
  };

  const out: DuplicatePair[] = [];
  for (const copy of copies) {
    const hits = own.filter((e) => sameSeries(copy, e));
    // One copy, one reading, each other's only match. A reading that two copies
    // both look like, or a copy that two readings both look like, is a day this
    // repair has nothing confident to say about.
    if (hits.length !== 1) continue;
    const keep = hits[0];
    if (copies.filter((c) => sameSeries(c, keep)).length !== 1) continue;
    out.push({
      dk,
      keepId: String(keep.id),
      dropId: String(copy.id),
      healthKey: typeof keep.healthKey === 'string' ? keep.healthKey
        : typeof copy.healthKey === 'string' ? copy.healthKey : null,
    });
  }
  return out;
}

/** Every duplicated wrist reading in the journal, oldest day first. */
export function findDuplicateWristReadings(days: Record<string, DayRecord>): DuplicatePair[] {
  return Object.keys(days).sort()
    .flatMap((dk) => duplicatesInDay(dk, days[dk]));
}
