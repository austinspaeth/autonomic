import {
  OFFER_COOLDOWN_MS, emptyOfferPacing, noteOffer, offerAllowed, offerCooldownMsLeft,
} from '../pacing';
import { dueMilestone, emptyAnnualMemory, startOffer } from '../annual';
import { emptyFounderMemory, founderVerdict } from '../founder';
import type { DaysMap } from '../../scoring/day';

const NOW = Date.parse('2026-03-06T09:00:00Z');
const DAY = 86_400_000;

describe('the shared offer clock', () => {
  it('lets the first offer through', () => {
    expect(offerAllowed(NOW, emptyOfferPacing())).toBe(true);
    expect(offerCooldownMsLeft(NOW, emptyOfferPacing())).toBe(0);
  });

  it('goes quiet for a week after an offer is raised', () => {
    const m = noteOffer(emptyOfferPacing(), 'annual', NOW);
    expect(offerAllowed(NOW, m)).toBe(false);
    expect(offerAllowed(NOW + 6 * DAY, m)).toBe(false);
    expect(offerAllowed(NOW + OFFER_COOLDOWN_MS, m)).toBe(true);
    expect(offerCooldownMsLeft(NOW + DAY, m)).toBe(6 * DAY);
  });

  it('holds the other offer too — the cool-down is not per surface', () => {
    const m = noteOffer(emptyOfferPacing(), 'founder', NOW);
    expect(offerAllowed(NOW + DAY, m)).toBe(false);
    expect(m.lastSurface).toBe('founder');
  });

  it("can't be held open by winding the clock back", () => {
    const m = noteOffer(emptyOfferPacing(), 'annual', NOW);
    // Device now believes it is a month before the stamp.
    expect(offerCooldownMsLeft(NOW - 30 * DAY, m)).toBe(OFFER_COOLDOWN_MS);
    // …and drifting further back doesn't extend it beyond one cool-down.
    expect(offerCooldownMsLeft(NOW - 300 * DAY, m)).toBe(OFFER_COOLDOWN_MS);
  });
});

describe('the two offers can never be raised together', () => {
  const own = (): DaysMap[string] => ({ readings: [{ id: 'r', type: 'hrv', time: '08:00' }] } as DaysMap[string]);
  const FIVE = {
    '2026-03-01': own(), '2026-03-02': own(), '2026-03-03': own(),
    '2026-03-04': own(), '2026-03-05': own(),
  } as DaysMap;

  it('defers the founder card while the annual window is live', () => {
    // The annual card just opened, which unlocks Pro and reports 'trial' —
    // exactly the state the founder card waits for.
    const clock = noteOffer(emptyOfferPacing(), 'annual', NOW);
    const ask = (now: number) => founderVerdict({
      days: FIVE, dk: '2026-03-06', tier: 'trial', memory: emptyFounderMemory(),
      offerCooldown: !offerAllowed(now, clock),
    });
    expect(ask(NOW)).toEqual({ ok: false, reason: 'offer-cooldown' });
    // Deferred, not spent: it is due again once the week is out.
    expect(ask(NOW + OFFER_COOLDOWN_MS)).toEqual({ ok: true, claim: true });
  });

  it('goes quiet on a day it had ALREADY claimed while the annual window runs', () => {
    // The state a phone reached before the shared clock shipped: both offers
    // claimed, both on screen. The live window wins and this card renders none.
    const claimed = { shownDk: '2026-03-06' };
    expect(founderVerdict({
      days: FIVE, dk: '2026-03-06', tier: 'trial', memory: claimed, annualOfferLive: true,
    })).toEqual({ ok: false, reason: 'annual-offer-live' });
    // …and comes back for the rest of its day once that window closes.
    expect(founderVerdict({
      days: FIVE, dk: '2026-03-06', tier: 'trial', memory: claimed,
    })).toEqual({ ok: true, claim: false });
  });

  it('leaves the annual milestone due when the founder card holds the clock', () => {
    const installedAt = NOW - 40 * DAY;
    const annual = emptyAnnualMemory();
    // Day 40: milestone 30 is reached, so the only thing keeping the card away
    // is the clock the founder card stamped.
    expect(dueMilestone(installedAt, NOW, annual)).toBe(30);
    const clock = noteOffer(emptyOfferPacing(), 'founder', NOW);
    expect(offerAllowed(NOW, clock)).toBe(false);
    // Nothing was consumed, so it opens on a later launch.
    expect(dueMilestone(installedAt, NOW + OFFER_COOLDOWN_MS, annual)).toBe(30);
    expect(offerAllowed(NOW + OFFER_COOLDOWN_MS, clock)).toBe(true);
  });

  it('a spent annual window still blocks nothing once the week is out', () => {
    const annual = startOffer(emptyAnnualMemory(), 30, NOW);
    expect(dueMilestone(NOW - 40 * DAY, NOW + 10 * DAY, annual)).toBeNull();
  });
});
