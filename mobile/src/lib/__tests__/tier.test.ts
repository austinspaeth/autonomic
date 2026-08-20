import { deriveTier, trialMsLeft, TRIAL_MS } from '../tier';

const NOW = 1_750_000_000_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('deriveTier', () => {
  it('is pro whenever the store entitlement is active, regardless of the local clock', () => {
    expect(deriveTier(NOW, null, true)).toBe('pro');
    expect(deriveTier(NOW, NOW - 30 * DAY, true)).toBe('pro');   // long-lapsed stamp
    expect(deriveTier(NOW, NOW, true)).toBe('pro');
  });

  it('is trial inside the 14-day window', () => {
    expect(deriveTier(NOW, NOW, false)).toBe('trial');                    // just stamped
    expect(deriveTier(NOW, NOW - (13 * DAY + 23 * HOUR), false)).toBe('trial');
    expect(deriveTier(NOW, NOW - TRIAL_MS + 1, false)).toBe('trial');     // last ms
  });

  it('is free at exactly 14 days and beyond', () => {
    expect(deriveTier(NOW, NOW - TRIAL_MS, false)).toBe('free');
    expect(deriveTier(NOW, NOW - 30 * DAY, false)).toBe('free');
  });

  it('is free with no stamp at all', () => {
    expect(deriveTier(NOW, null, false)).toBe('free');
    expect(deriveTier(NOW, NaN, false)).toBe('free');
  });

  it('treats a future stamp (clock rollback) as started now — still trial', () => {
    expect(deriveTier(NOW, NOW + 5 * DAY, false)).toBe('trial');
  });
});

describe('trialMsLeft', () => {
  it('counts down across the window', () => {
    expect(trialMsLeft(NOW, NOW)).toBe(TRIAL_MS);
    expect(trialMsLeft(NOW, NOW - DAY)).toBe(TRIAL_MS - DAY);
    expect(trialMsLeft(NOW, NOW - TRIAL_MS)).toBe(0);
    expect(trialMsLeft(NOW, NOW - TRIAL_MS - 1)).toBe(0);
  });

  it('is 0 without a stamp and full for a future stamp', () => {
    expect(trialMsLeft(NOW, null)).toBe(0);
    expect(trialMsLeft(NOW, NOW + DAY)).toBe(TRIAL_MS);
  });
});
