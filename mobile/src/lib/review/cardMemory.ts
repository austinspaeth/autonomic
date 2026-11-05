/**
 * The shell over ./card: its memory in the plaintext flags MMKV, and the one
 * line the capture paths call when a reading fails.
 *
 * Flags MMKV, not the journal, like every other piece of this kind of
 * bookkeeping: it is about the PERSON, so it never rides export/import and it
 * survives "Clear all data" — erasing a journal is not a request to be asked
 * for a review again, and it is certainly not a way to erase a failed reading.
 *
 * `noteReadingFailure` is deliberately the blunt instrument. It does not care
 * which sensor failed or why (the banded signature for that rides `/fault`, see
 * ../hrv/refusal); it records that this install has had a reading not work, and
 * that is permanent. One failure is enough to retire the card for good, so
 * there is nothing to decay and no window to keep.
 *
 * Silent on failure: a card is the least important thing in the app, so an
 * unwritable MMKV degrades to in-memory for the session rather than logging.
 */
import { MMKV } from 'react-native-mmkv';
import { EMPTY_CARD_MEMORY, parseCardMemory, reviewCardLive, type ReviewCardMemory } from './card';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'reviewCard';

let kv: MMKV | null | undefined;
let mem: ReviewCardMemory | null = null;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** TEMP (dev only): ignore every rule so the card can be seen in a dev build.
 *  It still answers for good when dismissed or tapped, so a dev poke is
 *  undone by clearing the flag rather than by flipping this back. Leave false
 *  in committed code. */
export const FORCE_REVIEW_CARD = false;

export function reviewCardMemory(): ReviewCardMemory {
  if (mem) return mem;
  try { mem = parseCardMemory(store()?.getString(KEY)); } catch { mem = EMPTY_CARD_MEMORY; }
  return mem;
}

function write(next: ReviewCardMemory) {
  mem = next;
  try { store()?.set(KEY, JSON.stringify(next)); } catch { /* in-memory only */ }
}

/**
 * Start the clock on "no failures".
 *
 * Called from the card's own mount, which is every Journal render, so the first
 * launch of a build carrying this stamps it and nothing before that instant is
 * ever claimed as watched. Idempotent — only the first call lands.
 */
export function beginFailureWatch(now = Date.now()): void {
  const m = reviewCardMemory();
  if (m.watchingSince != null) return;
  write({ ...m, watchingSince: now });
}

/** A reading did not work. Permanent, and one is enough. */
export function noteReadingFailure(): void {
  const m = reviewCardMemory();
  if (m.answered) return;   // nothing left to disqualify
  write({ ...m, failures: m.failures + 1 });
}

/** The card has been RAISED. From here it stands until it is answered, so
 *  this is stamped BEFORE it renders — nothing reports back that it was seen,
 *  the review ask's own rule. */
export function noteReviewCardShown(): void {
  const m = reviewCardMemory();
  if (m.standing || m.answered) return;
  write({ ...m, standing: true });
}

/** Is a raised card still standing? */
export const reviewCardStanding = (): boolean => reviewCardLive(reviewCardMemory());

/** The card was dismissed, or one of its buttons was tapped. Either way it is
 *  finished with: the ✕ and both buttons are the same answer, which is "not
 *  this question again". */
export function noteReviewCardAnswered(): void {
  const m = reviewCardMemory();
  if (m.answered) return;
  write({ ...m, answered: true });
}

/** Has the card been answered? Read by the OS review prompt (./index), so the
 *  two can never both ask the same install. */
export const reviewCardAnswered = (): boolean => reviewCardMemory().answered;
