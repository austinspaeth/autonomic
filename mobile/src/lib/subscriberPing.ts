/**
 * Which subscriber ping, if any, this install owes — pure, so the rules are
 * tested rather than trusted. The shell is `src/store/ping.ts`.
 *
 * `sub` used to fire the first time an install FOUND itself entitled, which is
 * not the event anybody meant by "a sale": a reinstall, a second phone, a
 * Restore purchases tap and a license tester's free purchase all found one, and
 * every one of them was counted and celebrated. So there are three routes now,
 * because they are three events no consumer may pool:
 *
 *   sub  a purchase THIS install just made
 *   rst  a subscription that already existed, arriving on this install
 *   lap  a subscription this install held, gone
 *
 * Nothing here holds an identifier. The memory is three flags and a day, all
 * in the plaintext flags store, and every ping carries only a plan letter.
 */
import type { PlanCode } from './ping';

/**
 * Is a purchase the store just delivered NEW — bought, not found?
 *
 * The store's own evidence decides wherever it has any, and the session's buy
 * tap is only the fallback, because the tap is the weaker signal in both
 * directions: a purchase whose attempt timed out or was left pending for hours
 * arrives with no tap in memory, and a renewal can land while somebody happens
 * to have the paywall open.
 *
 * - **Android:** a purchase Play has not seen acknowledged has never been
 *   processed by any install, so it is new however it got here — including a
 *   cash payment that cleared overnight, or one whose listener never ran
 *   because the app was killed first. An acknowledged one is a replay.
 * - **iOS:** a transaction that is its own original is a first purchase. One
 *   that is not is a renewal, EXCEPT when this session tapped buy: a
 *   resubscription after a lapse keeps the group's original transaction id, and
 *   that is a real sale. The tap only counts for a transaction dated AFTER it:
 *   a subscriber who taps Subscribe instead of Restore on a new install is
 *   told they are already subscribed and handed their EXISTING transaction,
 *   which the tap alone would have reported as a sale right after its `rst`.
 */
export function isNewPurchase(p: {
  platform: 'ios' | 'android' | string;
  /** The SKU this session last tapped buy on, if the tap is recent. */
  tappedSku?: string;
  /** When that tap happened (epoch ms). */
  tappedAt?: number;
  productId: string;
  isAcknowledgedAndroid?: boolean | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  /** The store's purchase date for this transaction (epoch ms). */
  transactionDate?: number | null;
}): boolean {
  const tapped = !!p.tappedSku && p.tappedSku === p.productId;
  if (p.platform === 'android') {
    if (p.isAcknowledgedAndroid === false) return true;
    if (p.isAcknowledgedAndroid === true) return false;
    return tapped;
  }
  if (tapped) {
    const predates = !!p.transactionDate && p.tappedAt !== undefined
      && p.transactionDate < p.tappedAt - TAP_CLOCK_SLACK_MS;
    // Predating the tap is the store handing back what it already sold, even
    // when that is a first-period transaction that is its own original.
    return !predates;
  }
  if (p.transactionId && p.originalTransactionId) return p.transactionId === p.originalTransactionId;
  return false;
}

/** How far before the buy tap a transaction may be dated and still be the one
 *  the tap bought: the date is Apple's clock and the tap is the phone's. An
 *  existing subscription handed back is days or months old, so a few minutes
 *  of forgiveness costs nothing. */
export const TAP_CLOCK_SLACK_MS = 5 * 60_000;

/** How long after a store answer before an entitlement with no purchase behind
 *  it is called RESTORED. An unfinished StoreKit transaction is replayed to the
 *  listener a moment after launch, and the entitlement query that races it
 *  would otherwise report a brand new purchase as a restore. */
export const RESTORE_SETTLE_MS = 15_000;

export type SubscriberMemory = {
  /** A purchase this install made that has not been reported yet. `acked` is
   *  false while Play has not accepted the acknowledgement: an unacknowledged
   *  purchase is refunded after three days, so it is not reported as a sale
   *  until the acknowledgement lands. */
  pending?: { plan?: PlanCode; acked: boolean };
  /** A `sub` landed for the current entitlement (older builds set this too,
   *  for their "found a subscription" ping). */
  subSent: boolean;
  /** An `rst` landed for the current entitlement. */
  rstSent: boolean;
  /** The Eastern day the store first answered "not subscribed" to an install
   *  that had reported one. */
  lapseSeen?: string;
  /** The last plan this install was seen holding, for the lapse ping. */
  lastPlan?: PlanCode;
};

export type SubscriberInput = {
  /** The store gave an entitlement answer this session. `ready` alone is not
   *  one: it is also set when the connection failed, with `isPro` still at its
   *  default of false, and that must never read as a cancellation. */
  answered: boolean;
  isPro: boolean;
  plan?: PlanCode;
  /** `RESTORE_SETTLE_MS` has passed since the answer. */
  settled: boolean;
  /** Today's Eastern day. */
  today: string;
};

export type SubscriberStep =
  | { kind: 'sub' | 'rst' | 'lap'; plan?: PlanCode }
  | { kind: 'lapse-seen'; day: string }
  | { kind: 'lapse-clear' }
  | { kind: 'drop-pending' }
  | null;

/**
 * The one thing to do now, or null. Called on every store change and every
 * foreground; the shell applies the step and, for a ping, writes the memory
 * only once the server took it (`afterSend`), so an offline phone retries.
 */
export function subscriberStep(m: SubscriberMemory, s: SubscriberInput): SubscriberStep {
  // A purchase this install made, reported once the acknowledgement is in.
  // Before the entitlement check on purpose: a purchase is news whether or not
  // the store has been re-queried since.
  if (m.pending) {
    if (m.pending.acked && s.isPro) return { kind: 'sub', plan: m.pending.plan ?? s.plan };
    // The store now says there is no subscription behind it: the purchase was
    // refunded (Play does that to one left unacknowledged for three days) or
    // revoked before it was ever reported. It was never a sale.
    if (s.answered && !s.isPro) return { kind: 'drop-pending' };
    return null;
  }
  if (!s.answered) return null;

  if (s.isPro) {
    if (m.lapseSeen) return { kind: 'lapse-clear' };
    // Entitled with nothing reported for it: a subscription that already
    // existed has arrived on this install. Once per entitlement, and only
    // after the replay window, so a new purchase is never called a restore.
    if (!m.subSent && !m.rstSent && s.settled) return { kind: 'rst', plan: s.plan };
    return null;
  }

  // Not subscribed. Only news for an install that had reported a
  // subscription, and only on the SECOND day the store says so: Play has
  // answered an empty list on a dropped binding before, and a single answer
  // like that would report a cancellation that never happened.
  if (!m.subSent && !m.rstSent) return null;
  if (!m.lapseSeen) return { kind: 'lapse-seen', day: s.today };
  if (m.lapseSeen !== s.today) return { kind: 'lap', plan: m.lastPlan };
  return null;
}

/** The memory after a ping landed. A lapse closes the entitlement, so both
 *  "reported" flags reset and the next purchase or restore on this install is
 *  news again. */
export function afterSend(m: SubscriberMemory, kind: 'sub' | 'rst' | 'lap', plan?: PlanCode): SubscriberMemory {
  if (kind === 'sub') return { ...m, pending: undefined, subSent: true, lastPlan: plan ?? m.lastPlan };
  if (kind === 'rst') return { ...m, rstSent: true, lastPlan: plan ?? m.lastPlan };
  return { ...m, subSent: false, rstSent: false, lapseSeen: undefined };
}

/** Record a new purchase. A second report for the same purchase (the listener
 *  and the entitlement query both seeing an unacknowledged one) only ever
 *  moves `acked` forward. */
export function notePurchase(m: SubscriberMemory, plan: PlanCode | undefined, acked: boolean): SubscriberMemory {
  return { ...m, pending: { plan: plan ?? m.pending?.plan, acked: acked || !!m.pending?.acked } };
}
