/**
 * Baseline or training, for a reading the app was never told the kind of.
 *
 * A reading taken on the wrist without the phone (a Mindfulness session on the
 * Apple Watch that reaches us through Apple Health, a Garmin reading started on
 * the watch) arrives as bare beats. Whether the wearer sat still or paced their
 * breathing is something only they know, and it decides which band the reading
 * is graded on and which slot of the day score it fills. So such a reading is
 * filed UNDECIDED: it scores as a baseline (what it always did), it keeps its
 * "Apple Watch HRV" / "Garmin HRV" name, and its card asks. Choosing renames it
 * and re-grades it; not choosing changes nothing.
 *
 * A reading the phone started knows its kind already (`garmin/intent`,
 * `watch/intent`) and is never asked.
 *
 * Pure, so the label, the card and the import paths cannot disagree.
 */
import type { Entry } from './types';

export type HrvKind = 'baseline' | 'training';

const typeOf = (k: HrvKind) => (k === 'training' ? 'breathHrv' : 'hrv');

/** A reading from a watch: the only readings whose kind may be switched after
 *  the fact, since everything else was chosen on the phone before it began. */
export function isWristHrv(r: Entry): boolean {
  return (r.type === 'hrv' || r.type === 'breathHrv') && (r.source === 'watch' || r.source === 'garmin');
}

/**
 * Nobody has said what kind of reading this was.
 *
 * `kindOpen` is stamped by the paths that file a reading without being told.
 * An Apple Health import from before the stamp existed carries none and is read
 * as open too, because no Apple Health import was ever told its kind; a Garmin
 * reading from before it is not, because some of those WERE told (the phone's
 * intent) and nothing on the entry says which.
 */
export function kindUndecided(r: Entry): boolean {
  if (r.type !== 'hrv' || !isWristHrv(r)) return false;
  if (r.kindOpen === true) return true;
  return r.kindOpen === undefined && r.imported === true && r.source === 'watch';
}

export function kindOf(r: Entry): HrvKind {
  return r.type === 'breathHrv' ? 'training' : 'baseline';
}

/** The entry as the wearer described it. Only the label and its grading move:
 *  the beats, and every metric computed from them, are the same either way
 *  (`computeHrv` writes both `hr` and `avgHr`, which is what the two read). */
export function withKind(r: Entry, kind: HrvKind): Entry {
  return { ...r, type: typeOf(kind), kindOpen: false };
}

/** The name of an undecided wrist reading, or null when the registry's own
 *  label ("Baseline HRV" / "Training HRV") applies. */
export function undecidedLabel(r: Entry): string | null {
  if (!kindUndecided(r)) return null;
  return r.source === 'garmin' ? 'Garmin HRV' : 'Apple Watch HRV';
}
