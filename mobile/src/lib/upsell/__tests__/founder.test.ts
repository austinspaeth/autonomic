import type { DaysMap } from '../../scoring/day';
import {
  FOUNDER_ENABLED, FOUNDER_MIN_DAYS, discountPct, emptyFounderMemory, engagedBefore, founderRules, founderVerdict,
} from '../founder';

/** A day carrying one entry the USER authored. */
const own = (): DaysMap[string] => ({ readings: [{ id: 'r', type: 'hrv', time: '08:00' }] } as DaysMap[string]);
/** A day whose only entry came from the health store. */
const imported = (): DaysMap[string] =>
  ({ readings: [{ id: 'r', type: 'hrv', time: '08:00', imported: true }] } as unknown as DaysMap[string]);

const days = (map: Record<string, DaysMap[string]>): DaysMap => map as DaysMap;

const FIVE = days({
  '2026-03-01': own(), '2026-03-02': own(), '2026-03-03': own(),
  '2026-03-04': own(), '2026-03-05': own(),
});

const ask = (over: Partial<Parameters<typeof founderRules>[0]> = {}) =>
  founderRules({
    days: FIVE, dk: '2026-03-06', tier: 'trial', memory: emptyFounderMemory(), ...over,
  });

describe('engagedBefore', () => {
  it('counts only days strictly earlier than dk', () => {
    expect(engagedBefore(FIVE, '2026-03-06')).toBe(5);
    expect(engagedBefore(FIVE, '2026-03-05')).toBe(4);
    expect(engagedBefore(FIVE, '2026-03-01')).toBe(0);
  });

  it("doesn't count a health-store backfill as days of use", () => {
    const backfill = days({ '2026-03-01': imported(), '2026-03-02': imported(), '2026-03-03': imported() });
    expect(engagedBefore(backfill, '2026-03-06')).toBe(0);
  });
});

/* The offer is switched off. The rules above stay under test through
   `founderRules` so the card can be switched back on without re-deriving any
   of it; what this pins is that nothing reaches the screen while it is off,
   INCLUDING a phone that had already claimed its day, and that being off
   spends nothing — no memory write, no claim, and the shared cool-down left
   for the half-off annual card, which is unaffected. */
describe('the founding-member offer is off', () => {
  const eligible = {
    days: FIVE, dk: '2026-03-06', tier: 'trial' as const, memory: emptyFounderMemory(),
  };

  it('never renders, however eligible the user', () => {
    expect(FOUNDER_ENABLED).toBe(false);
    expect(founderVerdict(eligible)).toEqual({ ok: false, reason: 'disabled' });
    // ...and the same for a phone mid-offer when the switch landed.
    expect(founderVerdict({ ...eligible, memory: { shownDk: '2026-03-06' } })).toEqual({ ok: false, reason: 'disabled' });
  });

  it('would still be due if it were switched back on', () => {
    expect(founderRules(eligible)).toEqual({ ok: true, claim: true });
  });
});

describe('founderVerdict', () => {
  it('fires the day after the fifth logged day', () => {
    expect(ask()).toEqual({ ok: true, claim: true });
  });

  it('stays quiet on the fifth day itself, which is still in progress', () => {
    expect(ask({ dk: '2026-03-05' })).toEqual({ ok: false, reason: 'too-few-days' });
  });

  it(`needs ${FOUNDER_MIN_DAYS} logged days`, () => {
    const four = days({
      '2026-03-01': own(), '2026-03-02': own(), '2026-03-03': own(), '2026-03-04': own(),
    });
    expect(ask({ days: four })).toEqual({ ok: false, reason: 'too-few-days' });
  });

  it('is only ever offered inside the install trial', () => {
    expect(ask({ tier: 'free' })).toEqual({ ok: false, reason: 'trial-over' });
    expect(ask({ tier: 'pro' })).toEqual({ ok: false, reason: 'already-pro' });
  });

  it('renders without re-claiming on the day it already claimed', () => {
    expect(ask({ memory: { shownDk: '2026-03-06' } })).toEqual({ ok: true, claim: false });
  });

  it('never returns on any other day', () => {
    expect(ask({ memory: { shownDk: '2026-03-06' }, dk: '2026-03-07' }))
      .toEqual({ ok: false, reason: 'day-passed' });
  });

  it('is gone for good once dismissed, even on its own day', () => {
    expect(ask({ memory: { shownDk: '2026-03-04', dismissed: true } }))
      .toEqual({ ok: false, reason: 'dismissed' });
  });

  it('defers rather than spends the offer on a bad day', () => {
    // Nothing is claimed here, so the offer is still due on a calmer open —
    // the whole reason these are separate from the permanent `dismissed` rule.
    expect(ask({ crashAlertFiredToday: true })).toEqual({ ok: false, reason: 'crash-alert-today' });
    expect(ask({ downturn: true })).toEqual({ ok: false, reason: 'downturn' });
    expect(ask({ sheetOpen: true })).toEqual({ ok: false, reason: 'sheet-open' });
    expect(ask({ dk: '2026-03-09' })).toEqual({ ok: true, claim: true });
  });
});

describe('discountPct', () => {
  it('reads the saving off the two localized prices', () => {
    expect(discountPct('$34.99', '$49.99')).toBe(30);
    expect(discountPct('$24.99', '$49.99')).toBe(50);
  });

  it('handles comma-decimal and grouped currencies', () => {
    expect(discountPct('34,99 €', '49,99 €')).toBe(30);
    expect(discountPct('¥3,500', '¥5,000')).toBe(30);
  });

  it('makes no claim it cannot support', () => {
    expect(discountPct('', '$49.99')).toBeNull();
    expect(discountPct('$49.99', '$49.99')).toBeNull();   // not actually cheaper
    expect(discountPct('$59.99', '$49.99')).toBeNull();   // more expensive
    expect(discountPct('$48.99', '$49.99')).toBeNull();   // 2%: not worth saying
  });
});
