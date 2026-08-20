import {
  OFFER_MILESTONE_DAYS, OFFER_WINDOW_MS, daysSinceInstall, dueMilestone,
  emptyAnnualMemory, formatMsLeft, liveOffer, offerMsLeft, startOffer,
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

  it('is null while a window is already live', () => {
    const m = startOffer(fresh, 30, at(30));
    expect(dueMilestone(T0, at(30, DAY / 2), m)).toBeNull();
  });

  it('does not re-fire a milestone once its window has lapsed', () => {
    const m = startOffer(fresh, 30, at(30));
    expect(dueMilestone(T0, at(31), m)).toBeNull();
    expect(dueMilestone(T0, at(60), m)).toBeNull();
  });

  it('moves on to the next milestone when it arrives', () => {
    const m = startOffer(fresh, 30, at(30));
    expect(dueMilestone(T0, at(90), m)).toBe(90);
  });

  it('spends every milestone at or below the one awarded', () => {
    const m = startOffer(fresh, 180, at(200));
    expect(m.consumed).toEqual([30, 90, 180]);
    // Only 365 is left, and not until it is reached.
    expect(dueMilestone(T0, at(300), m)).toBeNull();
    expect(dueMilestone(T0, at(365), m)).toBe(365);
  });

  it('has nothing left after the last milestone', () => {
    let m = emptyAnnualMemory();
    for (const d of OFFER_MILESTONE_DAYS) m = startOffer(m, d, at(d));
    expect(dueMilestone(T0, at(1000), m)).toBeNull();
  });
});

describe('offerMsLeft / liveOffer', () => {
  it('is zero with no window ever opened', () => {
    expect(offerMsLeft(at(30), emptyAnnualMemory())).toBe(0);
    expect(liveOffer(at(30), emptyAnnualMemory())).toBeNull();
  });

  it('runs for exactly 24 hours', () => {
    const m = startOffer(emptyAnnualMemory(), 30, at(30));
    expect(offerMsLeft(at(30), m)).toBe(OFFER_WINDOW_MS);
    expect(offerMsLeft(at(30, 6 * 3600_000), m)).toBe(18 * 3600_000);
    expect(offerMsLeft(at(31), m)).toBe(0);
    expect(offerMsLeft(at(31, 1), m)).toBe(0);
  });

  it('reports the milestone it belongs to while live', () => {
    const m = startOffer(emptyAnnualMemory(), 90, at(90));
    expect(liveOffer(at(90, 3600_000), m)).toEqual({ milestone: 90, msLeft: 23 * 3600_000 });
    expect(liveOffer(at(91), m)).toBeNull();
  });

  it('cannot be held open by winding the clock back behind the stamp', () => {
    const m = startOffer(emptyAnnualMemory(), 30, at(30));
    // Device now reports a time before the window opened: the window is treated
    // as starting now, so it still closes 24h later rather than never.
    expect(offerMsLeft(at(20), m)).toBe(OFFER_WINDOW_MS);
  });
});

describe('formatMsLeft', () => {
  it('reads as hours and padded minutes, then minutes alone', () => {
    expect(formatMsLeft(21 * 3600_000 + 4 * 60_000)).toBe('21h 04m');
    expect(formatMsLeft(48 * 60_000)).toBe('48m');
    expect(formatMsLeft(0)).toBe('0m');
    expect(formatMsLeft(-5)).toBe('0m');
  });
});
