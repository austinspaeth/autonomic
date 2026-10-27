/**
 * "Would a chest strap fix this?" — when to say so, and how often.
 *
 * The camera and a Garmin watch's optical sensor are the two weak ways to take
 * a reading, and somebody who keeps failing with one of them reads the failure
 * as the app being broken, not as the method being limited. The strap card
 * (`features/hrv/StrapSuggestion.tsx`) says which, and names one strap that is
 * known to send beat-to-beat intervals.
 *
 * Restraint is the whole design. It never answers a FIRST failure, because a
 * first failure is usually fixable (finger pressure, a loose watch) and the tips
 * card is the right answer to it. It is shown at most `MAX_SHOWS` times ever,
 * the second only after a quiet week and a fresh run of failures. And it is
 * never shown to somebody who already has a strap saved: telling a strap owner
 * to buy a strap is a nag, not advice.
 *
 * Pure. The memory lives in the flags MMKV (`store/strapSuggest.ts`), because
 * it is about the person, not their journal: it survives Clear all data and
 * never rides an export.
 */

/** The affiliate link the card opens, in the phone's own browser. */
export const STRAP_AMAZON_URL = 'https://link.amazon/B05XRYUj0';

/** The two sensors this card speaks about. A strap is the answer, never the subject. */
export type WeakSensor = 'camera' | 'garmin';

export const weakSensorFor = (source: string | null | undefined): WeakSensor | null =>
  (source === 'camera' || source === 'garmin' ? source : null);

/** Failures needed before the card may open: never the first. */
export const MIN_FAILURES = 2;
/** Times the card may ever be shown. */
export const MAX_SHOWS = 2;
/** Quiet days required between the first showing and the second. */
export const RESHOW_GAP_DAYS = 7;

const DAY_MS = 86_400_000;

export interface StrapSuggestMemory {
  /** Failures with a weak sensor since the card was last shown (or ever). */
  failuresSinceShown: number;
  /** How many times the card has been shown. */
  shown: number;
  /** When it was last shown, epoch ms. */
  lastShownAt: number | null;
}

export const EMPTY_MEMORY: StrapSuggestMemory = { failuresSinceShown: 0, shown: 0, lastShownAt: null };

/** Count one failed reading. */
export function noteFailure(m: StrapSuggestMemory): StrapSuggestMemory {
  return { ...m, failuresSinceShown: m.failuresSinceShown + 1 };
}

/** Is the card due, right after a failure has been counted? */
export function suggestionDue(m: StrapSuggestMemory, now: number, ownsStrap: boolean): boolean {
  if (ownsStrap) return false;
  if (m.shown >= MAX_SHOWS) return false;
  if (m.failuresSinceShown < MIN_FAILURES) return false;
  if (m.lastShownAt != null && now - m.lastShownAt < RESHOW_GAP_DAYS * DAY_MS) return false;
  return true;
}

/** The card was shown: spend a showing and start the failure count over. */
export function noteShown(m: StrapSuggestMemory, now: number): StrapSuggestMemory {
  return { failuresSinceShown: 0, shown: m.shown + 1, lastShownAt: now };
}

/** Read a stored memory defensively; anything unreadable is a fresh install. */
export function parseMemory(raw: string | null | undefined): StrapSuggestMemory {
  if (!raw) return EMPTY_MEMORY;
  try {
    const o = JSON.parse(raw) as Partial<StrapSuggestMemory>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
    return {
      failuresSinceShown: num(o.failuresSinceShown, 0),
      shown: num(o.shown, 0),
      lastShownAt: typeof o.lastShownAt === 'number' && Number.isFinite(o.lastShownAt) ? o.lastShownAt : null,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}
