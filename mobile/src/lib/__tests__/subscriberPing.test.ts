import { planCode } from '../ping';
import {
  afterSend, isNewPurchase, notePurchase, subscriberStep,
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

describe('is a delivered purchase NEW', () => {
  const sku = 'com.autonomic.journal.yearly';

  it('Android: an unacknowledged purchase is new, with or without a tap', () => {
    // A cash payment clearing overnight, or a purchase whose listener never
    // ran, arrives with no tap in memory and is still a sale.
    expect(isNewPurchase({ platform: 'android', productId: sku, isAcknowledgedAndroid: false })).toBe(true);
    expect(isNewPurchase({ platform: 'android', productId: sku, isAcknowledgedAndroid: true, tappedSku: sku })).toBe(false);
    // No flag at all: the tap is the only evidence left.
    expect(isNewPurchase({ platform: 'android', productId: sku, tappedSku: sku })).toBe(true);
    expect(isNewPurchase({ platform: 'android', productId: sku })).toBe(false);
  });

  it('iOS: a first transaction is new, a renewal is not', () => {
    expect(isNewPurchase({ platform: 'ios', productId: sku, transactionId: '9', originalTransactionId: '9' })).toBe(true);
    expect(isNewPurchase({ platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9' })).toBe(false);
  });

  it('iOS: a resubscription keeps the original id, so the tap wins', () => {
    expect(isNewPurchase({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9', tappedSku: sku,
    })).toBe(true);
    // ...but a tap on a DIFFERENT plan says nothing about this renewal.
    expect(isNewPurchase({
      platform: 'ios', productId: sku, transactionId: '12', originalTransactionId: '9',
      tappedSku: 'com.autonomic.journal.monthly',
    })).toBe(false);
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
    expect(m.pending).toEqual({ plan: 'Y', acked: true });
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

  it('an install that never reported a subscription has nothing to lapse', () => {
    expect(subscriberStep(blank, live({ isPro: false }))).toBeNull();
  });
});
