/**
 * How the reading card retries a saved strap that will not connect.
 *
 * It used to retry every three seconds for as long as the card stayed open.
 * A strap that is off, out of range or held by another app never answers, so
 * one phone could make ~20 attempts a minute: the Failures tab showed
 * `hrv.strap.connect` at 2,378 occurrences over 25 install-days in a week,
 * 95 per install, while the card said "Connecting to strap…" the whole time.
 *
 * Now the wait doubles from 3 s up to 30 s, and after `STRAP_MAX_ATTEMPTS`
 * failures in a row the card stops and says the strap is not answering, with
 * a tap to try again. Ten attempts span about three minutes, longer than it
 * takes to fetch a strap and put it on.
 */
export const STRAP_MAX_ATTEMPTS = 10;
const FIRST_DELAY_MS = 3000;
const MAX_DELAY_MS = 30000;

/**
 * The wait before the next attempt after `failures` failures in a row, or
 * null when it is time to stop and ask the user.
 */
export function strapRetryDelay(failures: number): number | null {
  if (failures >= STRAP_MAX_ATTEMPTS) return null;
  const n = Math.max(1, failures);
  return Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** (n - 1));
}
