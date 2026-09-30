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
 * What says a purchase the store just delivered is NEW — bought, not found —
 * and how strongly: `'V'` verified, `'S'` the store's word alone, or null for
 * not new at all.
 *
 * **Verified** is the buy tap: this session tapped buy on this very SKU within
 * the tap window, and the store then handed back a purchase of it. That is the
 * one sequence nothing but a sale produces, and it is the number to trust.
 *
 * **Store-only** is a purchase the store itself marks as never processed with
 * no tap behind it, which is still a sale and is the ONLY way to see some of
 * them: a payment that cleared hours after its sheet closed, or an app killed
 * the moment the sheet did. It is counted beside verified, never folded into
 * it, because it is also where anything we misread would land.
 *
 * - **Android:** an acknowledged purchase has been processed by some install
 *   already, so it is a replay whatever was tapped. An UNACKNOWLEDGED one is
 *   new: verified with the tap, store-only without it. With no flag at all the
 *   tap is the only evidence left.
 * - **iOS:** the tap decides first, EXCEPT for a transaction dated before it:
 *   a subscriber who taps Subscribe instead of Restore on a new install is
 *   handed their EXISTING transaction, which the tap alone would call a sale.
 *   A resubscription after a lapse keeps the group's original transaction id,
 *   so only the tap can see it. Without a tap, a transaction that is its own
 *   original is a first purchase (store-only); one that is not is a renewal.
 */
export type PurchaseEvidence = 'V' | 'S';

export function purchaseEvidence(p: {
  platform: 'ios' | 'android' | string;
  /** The SKU this session last tapped buy on, if the tap is inside the window. */
  tappedSku?: string;
  /** When that tap happened (epoch ms). */
  tappedAt?: number;
  productId: string;
  isAcknowledgedAndroid?: boolean | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  /** The store's purchase date for this transaction (epoch ms). */
  transactionDate?: number | null;
}): PurchaseEvidence | null {
  const tapped = !!p.tappedSku && p.tappedSku === p.productId;
  if (p.platform === 'android') {
    if (p.isAcknowledgedAndroid === true) return null;
    if (p.isAcknowledgedAndroid === false) return tapped ? 'V' : 'S';
    return tapped ? 'V' : null;
  }
  if (tapped) {
    const predates = !!p.transactionDate && p.tappedAt !== undefined
      && p.transactionDate < p.tappedAt - TAP_CLOCK_SLACK_MS;
    // Predating the tap is the store handing back what it already sold, even
    // when that is a first-period transaction that is its own original.
    return predates ? null : 'V';
  }
  if (p.transactionId && p.originalTransactionId && p.transactionId === p.originalTransactionId) return 'S';
  return null;
}

/** How long a buy tap vouches for the purchase that follows it. The store
 *  sheet, a card form, a bank's 3-D Secure page: an hour covers all of it,
 *  and a purchase arriving later than that is left to the store's word. */
export const TAP_WINDOW_MS = 60 * 60_000;

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
  pending?: {
    plan?: PlanCode;
    acked: boolean;
    evidence?: PurchaseEvidence;
    /** The store's id for THIS purchase (a Play purchase token, a StoreKit
     *  transaction id). Kept on the phone only, never sent: it is what stops
     *  one purchase being reported twice. */
    txn?: string;
  };
  /** Purchases already reported as `sub`, newest last, by the same id. A
   *  purchase delivered again — StoreKit replaying an unfinished transaction on
   *  every launch, the listener and an entitlement check both seeing one — is
   *  recognised here and never counted a second time. A real resubscription is
   *  a new transaction and so a new id. */
  reported?: string[];
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
  /** The store says the entitlement it just answered with is acknowledged. A
   *  purchase whose own acknowledgement call failed can still have landed (the
   *  call errored after Play took it), and without this it would wait for an
   *  acknowledgement that has already happened, for ever. */
  activeAcked?: boolean;
  /** This session tapped buy inside the tap window. An entitlement turning up
   *  then is the purchase arriving, never a restore. */
  tapRecent?: boolean;
};

export type SubscriberStep =
  | { kind: 'sub'; plan?: PlanCode; evidence?: PurchaseEvidence }
  | { kind: 'rst' | 'lap'; plan?: PlanCode }
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
    if ((m.pending.acked || s.activeAcked) && s.isPro) {
      return { kind: 'sub', plan: m.pending.plan ?? s.plan, evidence: m.pending.evidence };
    }
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
    // Never while a buy tap is fresh: that entitlement is the purchase itself,
    // arriving a beat before its own report (or refused as already owned, in
    // which case the restore is still sent once the tap has aged out).
    if (!m.subSent && !m.rstSent && s.settled && !s.tapRecent) return { kind: 'rst', plan: s.plan };
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
  if (kind === 'sub') {
    const txn = m.pending?.txn;
    const reported = txn ? [...(m.reported || []).filter((t) => t !== txn), txn].slice(-REPORTED_MAX) : m.reported;
    return { ...m, pending: undefined, subSent: true, lastPlan: plan ?? m.lastPlan, reported };
  }
  if (kind === 'rst') return { ...m, rstSent: true, lastPlan: plan ?? m.lastPlan };
  return { ...m, subSent: false, rstSent: false, lapseSeen: undefined };
}

/** How many reported purchase ids are remembered. One install makes a
 *  handful of purchases in its life; this is a bound, not a budget. */
export const REPORTED_MAX = 20;

/** Record a new purchase. One already reported is ignored outright. A second
 *  report of the one pending (the listener and the entitlement query both
 *  seeing an unacknowledged purchase) only ever moves `acked` forward and
 *  `evidence` up to verified.
 *
 *  An install whose `sub` predates `reported` holds the flag without the
 *  purchase behind it. A purchase delivered to it while that entitlement still
 *  stands is the same sale replayed (nothing else can be bought on top of a
 *  live subscription but a plan change), so it is adopted as the reported one
 *  rather than counted a second time. A lapse clears `subSent`, which is what
 *  lets a resubscription through. */
export function notePurchase(
  m: SubscriberMemory,
  plan: PlanCode | undefined,
  acked: boolean,
  evidence?: PurchaseEvidence,
  txn?: string,
): SubscriberMemory {
  if (txn && (m.reported || []).includes(txn)) return m;
  if (txn && m.subSent && !m.reported?.length && !m.pending) return { ...m, reported: [txn] };
  const prev = m.pending;
  return {
    ...m,
    pending: {
      plan: plan ?? prev?.plan,
      acked: acked || !!prev?.acked,
      evidence: evidence === 'V' || prev?.evidence === 'V' ? 'V' : (evidence ?? prev?.evidence),
      txn: txn ?? prev?.txn,
    },
  };
}
