/**
 * Sleep summarization tests. Fixtures model the HealthKit realities the
 * module exists for: overlapping iPhone + Watch samples for the same night
 * (union, not sum) and naps inside the evening→afternoon query window
 * (main session, not earliest→latest).
 */
import { summarizeSleep, SleepSample } from '../sleepSummary';

// HKCategoryValueSleepAnalysis values.
const IN_BED = 0;
const ASLEEP = 1;
const AWAKE = 2;
const CORE = 3;
const DEEP = 4;
const REM = 5;

/** Sample on a fixed night: "23:30" = night of Jan 10, "07:00" = Jan 11. */
const at = (hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2026, 0, h >= 18 ? 10 : 11, h, m, 0);
};
const s = (value: number, start: string, end: string): SleepSample =>
  ({ value, startDate: at(start), endDate: at(end) });

describe('summarizeSleep', () => {
  it('returns null when there are no asleep samples', () => {
    expect(summarizeSleep([])).toBeNull();
    expect(summarizeSleep([s(IN_BED, '23:00', '07:00')])).toBeNull();
  });

  it('summarizes a single plain asleep block', () => {
    const out = summarizeSleep([s(ASLEEP, '23:30', '07:00')])!;
    expect(out.bed).toEqual(at('23:30'));
    expect(out.wake).toEqual(at('07:00'));
    expect(out.minutesAsleep).toBe(450);
    expect(out.stages).toBeNull();
    expect(out.interrupted).toBe(false);
  });

  it('does not double-count overlapping iPhone + Watch samples', () => {
    const out = summarizeSleep([
      // Watch: staged night, 23:00–07:00 with a 06:00–06:30 awake hole.
      s(CORE, '23:00', '02:00'),
      s(DEEP, '02:00', '03:00'),
      s(REM, '03:00', '06:00'),
      s(AWAKE, '06:00', '06:30'),
      s(CORE, '06:30', '07:00'),
      // iPhone: the same night as one unstaged block.
      s(ASLEEP, '23:05', '07:00'),
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.wake).toEqual(at('07:00'));
    // Union of asleep time is the full 8 h — not 8 h (watch) + ~8 h (phone).
    expect(out.minutesAsleep).toBe(480);
    expect(out.stages).toEqual({ core: 210, deep: 60, rem: 180, awake: 30 });
  });

  it('ignores an evening nap when picking bed time', () => {
    const out = summarizeSleep([
      s(ASLEEP, '19:00', '19:40'),   // evening nap
      s(ASLEEP, '23:15', '06:45'),   // the night
    ])!;
    expect(out.bed).toEqual(at('23:15'));
    expect(out.wake).toEqual(at('06:45'));
    expect(out.minutesAsleep).toBe(450);
  });

  it('ignores a morning nap when picking wake time', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '06:00'),   // the night
      s(ASLEEP, '10:00', '11:00'),   // post-wake nap
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.wake).toEqual(at('06:00'));
    expect(out.minutesAsleep).toBe(420);
  });

  it('keeps a normally interrupted night as one session', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '03:00'),
      s(AWAKE, '03:00', '03:20'),
      s(ASLEEP, '03:20', '05:00'),
      s(AWAKE, '05:00', '05:10'),
      s(ASLEEP, '05:10', '07:00'),
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.wake).toEqual(at('07:00'));
    expect(out.minutesAsleep).toBe(450);   // 480 minus 30 awake
    expect(out.interrupted).toBe(true);    // 30 min awake > 10-min threshold
  });

  it('does not flag brief awakenings totaling 10 minutes or less', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '02:00'),
      s(AWAKE, '02:00', '02:04'),
      s(ASLEEP, '02:04', '05:00'),
      s(AWAKE, '05:00', '05:06'),
      s(ASLEEP, '05:06', '07:00'),
    ])!;
    expect(out.interrupted).toBe(false);   // 10 min awake is not > 10
  });

  it('does not double-count one awakening reported by two sources', () => {
    const out = summarizeSleep([
      s(ASLEEP, '23:00', '03:00'),
      s(AWAKE, '03:00', '03:08'),    // watch
      s(AWAKE, '03:02', '03:09'),    // phone, same waking
      s(ASLEEP, '03:09', '07:00'),
    ])!;
    // Union is 9 awake minutes (a raw sum would be 15 and cross the threshold).
    expect(out.interrupted).toBe(false);
    expect(out.stages).toBeNull();
  });

  it('excludes a nap from stage minutes', () => {
    const out = summarizeSleep([
      s(CORE, '19:00', '19:30'),     // staged evening nap
      s(CORE, '23:00', '05:00'),
      s(REM, '05:00', '07:00'),
    ])!;
    expect(out.bed).toEqual(at('23:00'));
    expect(out.stages).toEqual({ core: 360, deep: 0, rem: 120, awake: 0 });
    expect(out.minutesAsleep).toBe(480);
  });
});
