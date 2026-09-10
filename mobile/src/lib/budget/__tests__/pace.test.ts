import { DAY_END_MIN, DEFAULT_WAKE_MIN, minutesOf, paceAt } from '../pace';
import { about, clock, hm } from '../format';

describe('paceAt', () => {
  const NOON = 12 * 60;

  it('puts the marker where an even day would be by now', () => {
    // The design reads 46 percent at 2:40pm from an 8:00 wake, which is
    // (14h40 - 8h) / (22h30 - 8h).
    const p = paceAt(14 * 60 + 40, DEFAULT_WAKE_MIN, 330, 130);
    expect(p.expected).toBeCloseTo(0.46, 2);
  });

  it('uses the logged wake time rather than the default', () => {
    const early = paceAt(NOON, 6 * 60, 300, 0);
    const late = paceAt(NOON, 10 * 60, 300, 0);
    expect(early.expected).toBeGreaterThan(late.expected);
  });

  it('is under when the fill sits left of the marker', () => {
    expect(paceAt(NOON, DEFAULT_WAKE_MIN, 300, 30).status).toBe('under');
  });

  it('is ahead once the fill passes the marker by more than the margin', () => {
    const p = paceAt(NOON, DEFAULT_WAKE_MIN, 300, 200);
    expect(p.status).toBe('ahead');
  });

  it('is over past the ceiling, whatever the hour', () => {
    expect(paceAt(9 * 60, DEFAULT_WAKE_MIN, 300, 340).status).toBe('over');
  });

  it('projects when the budget runs out at the current rate', () => {
    // Half the budget spent in the first four hours: it runs out four hours on.
    const p = paceAt(NOON, 8 * 60, 300, 150);
    expect(p.runsOutMin).not.toBeNull();
    expect(clock(p.runsOutMin!)).toBe('4:00pm');
  });

  it('does not project a rate from a few minutes of day', () => {
    // A six-minute errand at 8:05 must not report the day ending at nine.
    const p = paceAt(8 * 60 + 5, 8 * 60, 300, 6);
    expect(p.runsOutMin).toBeNull();
  });

  it('does not project past the end of the waking day', () => {
    const p = paceAt(NOON, 8 * 60, 300, 20);
    expect(p.runsOutMin == null || p.runsOutMin <= DAY_END_MIN).toBe(true);
  });

  it('expects nothing before the user woke up', () => {
    const p = paceAt(6 * 60, 8 * 60, 300, 0);
    expect(p.expected).toBe(0);
    expect(p.runsOutMin).toBeNull();
  });
});

describe('minutesOf', () => {
  it('reads a clock string', () => {
    expect(minutesOf('07:30')).toBe(450);
    expect(minutesOf('00:00')).toBe(0);
  });
  it('refuses nonsense rather than guessing', () => {
    expect(minutesOf('25:00')).toBeNull();
    expect(minutesOf('')).toBeNull();
    expect(minutesOf(undefined)).toBeNull();
  });
});

describe('format', () => {
  it('writes durations the way the design does', () => {
    expect(hm(200)).toBe('3h 20m');
    expect(hm(45)).toBe('45m');
    expect(hm(65)).toBe('1h 05m');
    expect(hm(120)).toBe('2h');
  });

  it('softens to the half hour when the estimate is provisional', () => {
    expect(about(190)).toBe('About 3h');
    expect(about(200)).toBe('About 3h 30m');
    expect(about(40)).toBe('About 30m');
  });

  it('writes a clock time', () => {
    expect(clock(16 * 60 + 10)).toBe('4:10pm');
    expect(clock(0)).toBe('12:00am');
    expect(clock(12 * 60)).toBe('12:00pm');
  });
});
