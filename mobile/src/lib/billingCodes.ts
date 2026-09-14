/**
 * Google Play billing response codes — the pure half. The stateful side (the
 * billing client, the reconnect, the latch) lives in src/store/iap.ts; this
 * module is just "what does this number mean and what do we do about it", so
 * jest can pin it.
 *
 * It exists because the code that actually says WHY a store call failed is a
 * number in a sibling field, and openiap-google flattens every failure into
 * one opaque `query-product` ("Failed to query product"). Reading the number
 * is the whole diagnosis, and getting it wrong is expensive in both
 * directions: a transient failure treated as terminal replaces the buy button
 * with an apology on a device that would have worked a second later, and a
 * terminal failure treated as transient draws a complete, healthy-looking
 * paywall at the right prices whose button cannot ever work.
 *
 * THE VALUES ARE READ OFF `BillingClient.BillingResponseCode` IN PLAY BILLING
 * 9.1.0, not from documentation or memory. Two of them are worth stating out
 * loud because the obvious guess is wrong:
 *
 *  - **12 is NETWORK_ERROR**, even though Play's own `debugMessage` for it
 *    reads "An internal error occurred." It is a phone that could not reach
 *    Google, which is a phone's normal state on a train, so it is RETRIED.
 *    Latching it would tell a user with one bar that their device can never
 *    buy anything.
 *  - **6 is ERROR**, the actual internal one, and it is NOT retried here: it
 *    is Play reporting a fault on its own side, and hammering it achieves
 *    nothing.
 */

/** `BillingClient.BillingResponseCode`, Play Billing 9.1.0. */
export const PLAY_CODE = {
  SERVICE_TIMEOUT: -3,
  FEATURE_NOT_SUPPORTED: -2,
  SERVICE_DISCONNECTED: -1,
  OK: 0,
  USER_CANCELED: 1,
  SERVICE_UNAVAILABLE: 2,
  BILLING_UNAVAILABLE: 3,
  ITEM_UNAVAILABLE: 4,
  DEVELOPER_ERROR: 5,
  ERROR: 6,
  ITEM_ALREADY_OWNED: 7,
  ITEM_NOT_OWNED: 8,
  NETWORK_ERROR: 12,
} as const;

/**
 * What to do about a failed store call.
 *
 *  - `transient` — the binding, the network or Play itself was momentarily
 *    unavailable. Tear down, reconnect, retry once.
 *  - `blocked` — this device or account can NEVER complete a purchase as
 *    things stand. Nothing on our side reaches it: not a reconnect, not a
 *    console change, not a retry a minute later. The buy button must be
 *    replaced by the remedy rather than refused after the tap.
 *  - `other` — no verdict. Reported as an ordinary error and retried by the
 *    normal paths, because guessing is worse than saying nothing.
 */
export type StoreVerdict = 'transient' | 'blocked' | 'other';

/** Codes where reconnecting is the right answer. SERVICE_DISCONNECTED and
 *  SERVICE_UNAVAILABLE are the dead-binding pair; SERVICE_TIMEOUT and
 *  NETWORK_ERROR are the phone's connection, not the store's opinion of it. */
const TRANSIENT: readonly number[] = [
  PLAY_CODE.SERVICE_DISCONNECTED,
  PLAY_CODE.SERVICE_UNAVAILABLE,
  PLAY_CODE.SERVICE_TIMEOUT,
  PLAY_CODE.NETWORK_ERROR,
];

/** Codes that mean "not from this device/account, however many times you ask".
 *
 *  FEATURE_NOT_SUPPORTED is the Play Store app being too old to serve the
 *  ProductDetails API. BILLING_UNAVAILABLE is the account: no Google account
 *  on the device, one that cannot transact, or a country where Play does not
 *  sell subscriptions. Both are terminal for the session, and both have a
 *  remedy the user can actually act on, which is the only reason it is worth
 *  distinguishing them from a generic failure. */
const BLOCKED: readonly number[] = [
  PLAY_CODE.FEATURE_NOT_SUPPORTED,
  PLAY_CODE.BILLING_UNAVAILABLE,
];

export function classifyPlayCode(code: number | undefined): StoreVerdict {
  if (typeof code !== 'number') return 'other';
  if (TRANSIENT.includes(code)) return 'transient';
  if (BLOCKED.includes(code)) return 'blocked';
  return 'other';
}

/**
 * What to tell the user in place of a buy button, or null when this isn't a
 * terminal refusal.
 *
 * Said in full because the remedy is the whole point: for most of these
 * devices this IS fixable by the person holding it. Each message names the one
 * obstacle its code actually describes — the old copy said "update your Play
 * Store" for both, which is the right instruction for FEATURE_NOT_SUPPORTED
 * and simply false for an account that cannot buy.
 */
export function blockedMessage(code: number | undefined): string | null {
  if (code === PLAY_CODE.FEATURE_NOT_SUPPORTED) {
    return 'Your Google Play Store app is out of date, so it can’t show subscriptions. '
      + 'Open the Play Store, go to Settings, About, and tap Update Play Store, then come back.';
  }
  if (code === PLAY_CODE.BILLING_UNAVAILABLE) {
    return 'Google Play can’t sell subscriptions on this device right now. '
      + 'Check that the Play Store is signed in to an account that can make purchases, then come back.';
  }
  return null;
}
