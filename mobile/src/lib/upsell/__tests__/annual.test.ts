import {
  OFFER_MILESTONE_DAYS, daysSinceInstall, dismissOffer, dueMilestone,
  emptyAnnualMemory, liveOffer, startOffer,
} from '../annual';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const at = (days: number, extraMs = 0) => T0 + days * DAY + extraMs;

describe('daysSinceInstall', () => {
  it('counts whole elapsed days', () => {
    expect(daysSinceInstall(T0, at(29, -1))).toBe(28);
    expect(daysSinceInstall(T0, at(30))).toBe(30);
  });

  it('never reports a negative age when the clock rolls back', () => {
    expect(daysSinceInstall(at(40), T0)).toBe(0);
  });

  it('treats a missing stamp as day zero', () => {
    expect(daysSinceInstall(null, at(99))).toBe(0);
  });
});

describe('dueMilestone', () => {
  const fresh = emptyAnnualMemory();

  it('stays quiet before the first milestone', () => {
    expect(dueMilestone(T0, at(29), fresh)).toBeNull();
  });

  it('fires on day 30', () => {
    expect(dueMilestone(T0, at(30), fresh)).toBe(30);
  });

  it('awards only the highest milestone reached after a long absence', () => {
    expect(dueMilestone(T0, at(200), fresh)).toBe(180);
    expect(dueMilestone(T0, at(400), fresh)).toBe(365);
  });

  it('is null while a card is already standing', () => {
    const m = startOffer(fresh, 30, at(30));
    expect(dueMilestone(T0, at(30, DAY / 2), m)).toBeNull();
    // Still standing days later: the card does not expire on its own.
    expect(dueMilestone(T0, at(45), m)).toBeNull();
    expect(dueMilestone(T0, at(120), m)).toBeNull();
  });

  it('does not re-fire a milestone once its card has been dismissed', () => {
    const m = dismissOffer(startOffer(fresh, 30, at(30)));
    expect(dueMilestone(T0, at(31), m)).toBeNull();
    expect(dueMilestone(T0, at(60), m)).toBeNull();
  });

  it('moves on to the next milestone once the card is dismissed', () => {
    const m = dismissOffer(startOffer(fresh, 30, at(30)));
    expect(dueMilestone(T0, at(90), m)).toBe(90);
  });

  it('spends every milestone at or below the one awarded', () => {
    const m = dismissOffer(startOffer(fresh, 180, at(200)));
    expect(m.consumed).toEqual([30, 90, 180]);
    // Only 365 is left, and not until it is reached.
    expect(dueMilestone(T0, at(300), m)).toBeNull();
    expect(dueMilestone(T0, at(365), m)).toBe(365);
  });

  it('has nothing left after the last milestone', () => {
    let m = emptyAnnualMemory();
    for (const d of OFFER_MILESTONE_DAYS) m = dismissOffer(startOffer(m, d, at(d)));
    expect(dueMilestone(T0, at(1000), m)).toBeNull();
  });
});

describe('liveOffer / dismissOffer', () => {
  it('is null with no card ever raised', () => {
    expect(liveOffer(emptyAnnualMemory())).toBeNull();
  });

  it('stands indefinitely once raised', () => {
    const m = startOffer(emptyAnnualMemory(), 90, at(90));
    expect(liveOffer(m)).toEqual({ milestone: 90 });
  });

  it('is taken down by the dismissal, which keeps the milestone spent', () => {
    const m = dismissOffer(startOffer(emptyAnnualMemory(), 30, at(30)));
    expect(liveOffer(m)).toBeNull();
    expect(m.consumed).toEqual([30]);
  });
});
