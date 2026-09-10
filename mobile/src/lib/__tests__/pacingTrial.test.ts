import {
  PACING_TRIAL_DAYS,
  PACING_TRIAL_MS,
  pacingTrialActive,
  pacingTrialDaysLeft,
  pacingTrialMsLeft,
  pacingTrialSpent,
} from '../pacingTrial';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-10T08:00:00.000Z');

describe('pacing trial window', () => {
  it('is seven days long', () => {
    expect(PACING_TRIAL_DAYS).toBe(7);
    expect(PACING_TRIAL_MS).toBe(7 * DAY);
  });

  it('is closed when it was never stamped', () => {
    expect(pacingTrialMsLeft(T0, null)).toBe(0);
    expect(pacingTrialActive(T0, null)).toBe(false);
    // Never having had a window is not the same as having spent one: the lock
    // card only says "your free days have ended" to somebody who had them.
    expect(pacingTrialSpent(T0, null)).toBe(false);
  });

  it('runs from the stamp and closes on the boundary', () => {
    expect(pacingTrialActive(T0, T0)).toBe(true);
    expect(pacingTrialMsLeft(T0 + 3 * DAY, T0)).toBe(4 * DAY);
    expect(pacingTrialActive(T0 + PACING_TRIAL_MS - 1, T0)).toBe(true);
    expect(pacingTrialActive(T0 + PACING_TRIAL_MS, T0)).toBe(false);
    expect(pacingTrialSpent(T0 + PACING_TRIAL_MS, T0)).toBe(true);
  });

  it('counts days up, so a window still running never reads zero', () => {
    expect(pacingTrialDaysLeft(T0, T0)).toBe(7);
    expect(pacingTrialDaysLeft(T0 + 6 * DAY, T0)).toBe(1);
    expect(pacingTrialDaysLeft(T0 + PACING_TRIAL_MS - 1000, T0)).toBe(1);
    expect(pacingTrialDaysLeft(T0 + PACING_TRIAL_MS, T0)).toBe(0);
  });

  it('clamps a stamp in the future rather than holding the window open forever', () => {
    // The clock was rolled back after stamping.
    expect(pacingTrialMsLeft(T0, T0 + 30 * DAY)).toBe(PACING_TRIAL_MS);
    expect(pacingTrialActive(T0, T0 + 30 * DAY)).toBe(true);
  });

  it('ignores an unparseable stamp', () => {
    expect(pacingTrialMsLeft(T0, Number.NaN)).toBe(0);
    expect(pacingTrialSpent(T0, Number.NaN)).toBe(false);
  });
});
