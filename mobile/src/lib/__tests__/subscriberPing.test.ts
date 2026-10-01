import { planCode } from '../ping';
import {
  afterSend, duplicateOf, notePurchase, purchaseEvidence, REPORTED_MAX, subscriberStep, TAP_WINDOW_MS,
  type SubscriberInput, type SubscriberMemory,
} from '../subscriberPing';

const blank: SubscriberMemory = { subSent: false, rstSent: false };
const live = (o: Partial<SubscriberInput> = {}): SubscriberInput => ({
  answered: true, isPro: true, plan: 'Y', settled: true, today: '2026-09-25', ...o,
});

describe('plan letters', () => {
  it('names each product, checking the suffixed yearly ids first', () => {
    expect(planCode('com.autonomic.journal.yearly')).toBe('Y');
    expect(planCode('com.autonomic.journal.monthly')).toBe('M');
    expect(planCode('com.autonomic.journal.yearly.promo')).toBe('P');
    expect(planCode('com.autonomic.journal.yearly.founder')).toBe('F');
    expect(planCode('com.other.thing')).toBeUndefined();
    expect(planCode(undefined)).toBeUndefined();
  });
});

describe('how a delivered purchase is known to be NEW', () => {
  const sku = 'com.autonomic.journal.yearly';

  it('Android: unacknowledged is new — verified with the tap, store-only without', () => {
    // A payment clearing hours after its sheet closed, or a purchase whose
    // listener never ran, arrives with no tap in memory and is still a sale.
    expect(purchaseEvidence({ platform: 'android', productId: sku, isAcknowledgedAndroid: false, tappedSku: sku })).toBe('V');
    expect(purchaseEvidence({ platform: 'android', productId: sku, isAcknowledgedAndroid: false })).toBe('S');
    // Acknowledged means some install already processed it: never new.
    expect(purchaseEvidence({ platform: 'android', productId: sku, isAcknowledgedAndroid: true, tappedSku: sku })).toBeNull();
    // No flag at all: the tap is the only evidence left.
    expect(purchaseEvidence({ platform: 'android', productId: sku, tappedSku: sku })).toBe('V');
    expect(purchaseEvidence({ platform: 'android', productId: sku })).toBeNull();
    // A tap on another plan vouches for nothing here.
    expect(purchaseEvidence({
      platform: 'android', productId: sku, isAcknowledgedAndroid: false, tappedSku: 'com.autonomic.journal.monthly',
    })).toBe('S');
  });

  it('iOS: a first transaction is store-only, a renewal is not new', () => {
    expect(purchaseEvidence({ platform: 'ios', productId: sku, transactionId: '9', originalTransactionId: '9' })).toBe('S');
    expect(purchaseEvidence({ platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9' })).toBeNull();
  });

  it('iOS: a resubscription keeps the original id, so only the tap sees it', () => {
    expect(purchaseEvidence({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9', tappedSku: sku,
    })).toBe('V');
    expect(purchaseEvidence({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9',
      tappedSku: 'com.autonomic.journal.monthly',
    })).toBeNull();
  });

  it('iOS: a tap that is handed back an EXISTING subscription is not a sale', () => {
    // A returning subscriber taps Subscribe instead of Restore; Apple answers
    // with the transaction they already own — here a first-period one, which
    // is its own original and so would read as new on its id alone.
    const tappedAt = Date.parse('2026-09-25T14:00:00Z');
    const monthAgo = tappedAt - 30 * 86_400_000;
    expect(purchaseEvidence({
      platform: 'ios', productId: sku, transactionId: '9', originalTransactionId: '9',
      tappedSku: sku, tappedAt, transactionDate: monthAgo,
    })).toBeNull();
    // A purchase dated after the tap (or within clock slack of it) is the sale.
    expect(purchaseEvidence({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9',
      tappedSku: sku, tappedAt, transactionDate: tappedAt + 20_000,
    })).toBe('V');
    expect(purchaseEvidence({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9',
      tappedSku: sku, tappedAt, transactionDate: tappedAt - 60_000,
    })).toBe('V');
    // No date from the store: the tap still decides, as before.
    expect(purchaseEvidence({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9',
      tappedSku: sku, tappedAt,
    })).toBe('V');
  });

  it('the tap vouches for an hour', () => {
    expect(TAP_WINDOW_MS).toBe(60 * 60_000);
  });
});

describe('which subscriber ping is owed', () => {
  it('a purchase is reported as sub once acknowledged, with its own plan', () => {
    const m = notePurchase(blank, 'M', true);
    expect(subscriberStep(m, live())).toEqual({ kind: 'sub', plan: 'M' });
    const after = afterSend(m, 'sub', 'M');
    expect(after.pending).toBeUndefined();
    expect(after.subSent).toBe(true);
    // Nothing further: the entitlement it produced is not also a restore.
    expect(subscriberStep(after, live())).toBeNull();
  });

  it('an unacknowledged purchase waits, and a refunded one is dropped', () => {
    const m = notePurchase(blank, 'Y', false);
    expect(subscriberStep(m, live())).toBeNull();
    expect(subscriberStep(notePurchase(m, 'Y', true), live())).toEqual({ kind: 'sub', plan: 'Y' });
    // The acknowledgement never landed and Play refunded it.
    expect(subscriberStep(m, live({ isPro: false }))).toEqual({ kind: 'drop-pending' });
  });

  it('a second report of the same purchase never moves acked backwards', () => {
    const m = notePurchase(notePurchase(blank, 'Y', true), 'Y', false);
    expect(m.pending).toMatchObject({ plan: 'Y', acked: true });
  });

  it('an entitlement with no purchase behind it is a restore, after the replay window', () => {
    // A reinstall, a second phone, Restore purchases.
    expect(subscriberStep(blank, live({ settled: false }))).toBeNull();
    expect(subscriberStep(blank, live())).toEqual({ kind: 'rst', plan: 'Y' });
    expect(subscriberStep(afterSend(blank, 'rst', 'Y'), live())).toBeNull();
  });

  it('an install whose older build already reported sub sends no restore', () => {
    // pingSubSent was set by the old "found a subscription" ping.
    expect(subscriberStep({ ...blank, subSent: true }, live())).toBeNull();
  });

  it('never acts on a store that did not answer', () => {
    // `ready` with isPro at its default is a failed connection, not a lapse.
    const held = { ...blank, subSent: true, lastPlan: 'Y' as const };
    expect(subscriberStep(held, live({ answered: false, isPro: false }))).toBeNull();
    expect(subscriberStep(blank, live({ answered: false }))).toBeNull();
  });

  it('a lapse needs the store to say so on two different days', () => {
    const held: SubscriberMemory = { ...blank, rstSent: true, lastPlan: 'F' };
    const first = subscriberStep(held, live({ isPro: false }));
    expect(first).toEqual({ kind: 'lapse-seen', day: '2026-09-25' });
    const seen = { ...held, lapseSeen: '2026-09-25' };
    expect(subscriberStep(seen, live({ isPro: false }))).toBeNull();
    expect(subscriberStep(seen, live({ isPro: false, today: '2026-09-26' }))).toEqual({ kind: 'lap', plan: 'F' });
    // Entitled again in between: it was a blip, forget it.
    expect(subscriberStep(seen, live())).toEqual({ kind: 'lapse-clear' });
  });

  it('after a lapse the next purchase on this install is a sale again', () => {
    const lapsed = afterSend({ ...blank, subSent: true, lapseSeen: '2026-09-25' }, 'lap');
    expect(lapsed).toMatchObject({ subSent: false, rstSent: false, lapseSeen: undefined });
    expect(subscriberStep(notePurchase(lapsed, 'Y', true), live())).toEqual({ kind: 'sub', plan: 'Y' });
  });

  it('the same transaction delivered again after its sub is not a second sale', () => {
    // StoreKit replays a first-year transaction (its own original, so
    // purchaseEvidence calls it new) on launch and on reconnect: one founder
    // purchase used to land as eight subs in a day.
    const sent = afterSend(notePurchase(blank, 'F', true, 'S', 'tx-1'), 'sub', 'F');
    const replayed = notePurchase(sent, 'F', true, 'S', 'tx-1');
    expect(replayed).toBe(sent);
    expect(subscriberStep(replayed, live({ plan: 'F' }))).toBeNull();
  });

  it('a replay while the sub is still pending folds into the one report', () => {
    const m = notePurchase(notePurchase(blank, 'F', true, 'S', 'tx-1'), 'F', true, 'S', 'tx-1');
    expect(m.pending).toEqual({ plan: 'F', acked: true, evidence: 'S', txn: 'tx-1' });
    expect(afterSend(m, 'sub', 'F').reported).toEqual(['tx-1']);
  });

  it('a different transaction is still news: a resubscription after a lapse', () => {
    const sent = afterSend(notePurchase(blank, 'Y', true, 'V', 'tx-1'), 'sub', 'Y');
    const lapsed = afterSend({ ...sent, lapseSeen: '2026-09-25' }, 'lap');
    expect(subscriberStep(notePurchase(lapsed, 'Y', true, 'V', 'tx-2'), live()))
      .toEqual({ kind: 'sub', plan: 'Y', evidence: 'V' });
  });

  it('an install that reported its sub before transactions were kept adopts the replay', () => {
    const legacy: SubscriberMemory = { ...blank, subSent: true, lastPlan: 'F' };
    const m = notePurchase(legacy, 'F', true, 'S', 'tx-1');
    expect(m.pending).toBeUndefined();
    expect(m.reported).toEqual(['tx-1']);
    expect(subscriberStep(m, live())).toBeNull();
  });

  it('an install that never reported a subscription has nothing to lapse', () => {
    expect(subscriberStep(blank, live({ isPro: false }))).toBeNull();
  });

  it('the sale carries its evidence, and a second sighting only ever upgrades it', () => {
    const m = notePurchase(blank, 'Y', true, 'S', 'tok-1');
    expect(subscriberStep(m, live())).toEqual({ kind: 'sub', plan: 'Y', evidence: 'S' });
    const up = notePurchase(m, 'Y', true, 'V', 'tok-1');
    expect(subscriberStep(up, live())).toEqual({ kind: 'sub', plan: 'Y', evidence: 'V' });
    expect(notePurchase(up, 'Y', true, 'S', 'tok-1').pending?.evidence).toBe('V');
  });

  it('a purchase already reported is never reported again', () => {
    // StoreKit replaying an unfinished first transaction on every launch.
    const sent = afterSend(notePurchase(blank, 'F', true, 'S', 'txn-9'), 'sub', 'F');
    expect(sent.reported).toEqual(['txn-9']);
    const replay = notePurchase(sent, 'F', true, 'S', 'txn-9');
    expect(replay.pending).toBeUndefined();
    expect(subscriberStep(replay, live({ plan: 'F' }))).toBeNull();
    // A new transaction on the same install is a new sale.
    const again = notePurchase(sent, 'F', true, 'V', 'txn-40');
    expect(subscriberStep(again, live({ plan: 'F' }))).toEqual({ kind: 'sub', plan: 'F', evidence: 'V' });
  });

  it('the reported list is bounded and keeps the newest', () => {
    let m: SubscriberMemory = blank;
    for (let i = 0; i < REPORTED_MAX + 5; i++) m = afterSend(notePurchase(m, 'M', true, 'V', `t${i}`), 'sub', 'M');
    expect(m.reported).toHaveLength(REPORTED_MAX);
    expect(m.reported?.[REPORTED_MAX - 1]).toBe(`t${REPORTED_MAX + 4}`);
  });

  it('a purchase whose acknowledgement call failed is sent once the store says it is acknowledged', () => {
    const m = notePurchase(blank, 'Y', false, 'V', 'tok');
    expect(subscriberStep(m, live())).toBeNull();
    expect(subscriberStep(m, live({ activeAcked: true }))).toEqual({ kind: 'sub', plan: 'Y', evidence: 'V' });
  });

  it('no restore while a buy tap is fresh: that entitlement is the purchase arriving', () => {
    expect(subscriberStep(blank, live({ tapRecent: true }))).toBeNull();
    // A tap that ended in "already subscribed" still reports its restore once it ages out.
    expect(subscriberStep(blank, live({ tapRecent: false }))).toEqual({ kind: 'rst', plan: 'Y' });
  });

  it('a purchase on record before Pro is seen is a sale, never a restore first', () => {
    // The listener records the purchase before isPro flips, so whichever
    // subscriber call runs first finds it pending.
    const m = notePurchase(blank, 'Y', false, 'V', 'tok');
    expect(subscriberStep(m, live())).toBeNull();
    expect(subscriberStep(notePurchase(m, 'Y', true, 'V', 'tok'), live())).toEqual({ kind: 'sub', plan: 'Y', evidence: 'V' });
  });

  describe('one subscription is one sale, whatever its transaction ids', () => {
    const day = '2026-09-25';

    it('a new transaction inside a reported subscription is not a second sale', () => {
      const sent = afterSend(notePurchase(blank, 'F', true, 'S', 'tx-1', 'orig-1'), 'sub', 'F', day);
      expect(sent.reportedOriginals).toEqual(['orig-1']);
      expect(duplicateOf(sent, 'tx-2', 'orig-1')).toBe('original');
      const again = notePurchase(sent, 'F', true, 'S', 'tx-2', 'orig-1');
      expect(again).toBe(sent);
      expect(subscriberStep(again, live({ plan: 'F', today: '2026-09-27' }))).toBeNull();
    });

    it('the same transaction is caught by its own id first', () => {
      const sent = afterSend(notePurchase(blank, 'F', true, 'S', 'tx-1', 'orig-1'), 'sub', 'F', day);
      expect(duplicateOf(sent, 'tx-1', 'orig-1')).toBe('txn');
    });

    it('a second sale on the same day is dropped whatever its ids say', () => {
      const sent = afterSend(notePurchase(blank, 'F', true, 'S', 'tx-1'), 'sub', 'F', day);
      expect(sent.lastSubDay).toBe(day);
      const other = notePurchase(sent, 'F', true, 'S', 'tx-9');
      expect(subscriberStep(other, live({ plan: 'F', today: day }))).toEqual({ kind: 'drop-duplicate' });
      // The next day it is judged on its ids again.
      expect(subscriberStep(other, live({ plan: 'F', today: '2026-09-26' })))
        .toEqual({ kind: 'sub', plan: 'F', evidence: 'S' });
    });

    it('an install that reported before original ids were kept adopts the next delivery', () => {
      // 1.31.1: the transaction id is on record, the original is not.
      const held: SubscriberMemory = { ...blank, subSent: true, reported: ['tx-1'], lastPlan: 'F' };
      const m = notePurchase(held, 'F', true, 'S', 'tx-2', 'orig-1');
      expect(m.pending).toBeUndefined();
      expect(m.reportedOriginals).toEqual(['orig-1']);
      expect(duplicateOf(m, 'tx-3', 'orig-1')).toBe('original');
    });

    it('coming back after a confirmed lapse is a sale again, under the same original', () => {
      const sent = afterSend(notePurchase(blank, 'Y', true, 'V', 'tx-1', 'orig-1'), 'sub', 'Y', day);
      const lapsed = afterSend({ ...sent, lapseSeen: day }, 'lap');
      expect(lapsed.reportedOriginals).toBeUndefined();
      expect(subscriberStep(notePurchase(lapsed, 'Y', true, 'V', 'tx-2', 'orig-1'), live({ today: '2026-11-01' })))
        .toEqual({ kind: 'sub', plan: 'Y', evidence: 'V' });
    });
  });
});
