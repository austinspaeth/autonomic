/**
 * Access codes — the pure half. A code is something the developer hands to a
 * person; entering it (Settings, long-press Subscription) extends the
 * full-access window by the number of days the server says it is worth. The
 * stateful half is ../store/accessCode, the window itself is ./tier.
 *
 * The normalisation mirrors `normCode` in sls/lambdas/ping/codes.js: move one
 * and you must move the other, or the phone's "already used here" memory and
 * the server's row stop agreeing about what one code is.
 */

export const CODE_MIN = 6;
export const CODE_MAX = 24;
/** The length the dashboard issues as "forever". At or past it the app stops
 *  counting days out loud. */
export const FOREVER_DAYS = 999;

/** Uppercased, letters and digits only: "k7wq-m2xd" and "K7WQ M2XD" are one code. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Could this be a code at all? Gates the button, so nothing obviously not a
 *  code is ever sent. */
export function isPlausibleCode(raw: string): boolean {
  const n = normalizeCode(raw).length;
  return n >= CODE_MIN && n <= CODE_MAX;
}

/** What a code just added, as the card says it. */
export function grantAddedText(days: number): string {
  if (days >= FOREVER_DAYS) return 'Code accepted. You have full access.';
  return `Code accepted. ${days} day${days === 1 ? '' : 's'} of full access added.`;
}

/** The standing state, for the Subscription sheet's status line. */
export function grantStatusText(daysLeft: number): string {
  // A "forever" code is still a count underneath; nobody needs to watch it tick.
  if (daysLeft > FOREVER_DAYS - 100) return 'Full access';
  return `Full access · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}
