import {
  HR_EMPTY_SAMPLES_SIG, MAX_POISON_DAYS, dayKeyOf, hrPoisonRow, hrWindowDays,
  isHrSampleCrash, nextPoisonDays, poisonFromCrashes, windowPoisoned,
} from '../hrPoison';

const at = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm, 0);

describe('isHrSampleCrash', () => {
  // The composed crash description, as `describeNativeCrash` builds it: the
  // exception type, the platform's own sentence, and the crashing build.
  it('matches the real crash row', () => {
    expect(isHrSampleCrash('IllegalArgumentException: record samples should not be empty [v1.37.0]')).toBe(true);
  });
  it('matches whatever wrapper or package the type arrives with', () => {
    expect(isHrSampleCrash(`RuntimeException: wrapped (cause: IllegalArgumentException: ${HR_EMPTY_SAMPLES_SIG})`)).toBe(true);
  });
  // The signature is the SENTENCE, not the type: half of Android throws
  // IllegalArgumentException, and blacklisting a window on any of them would
  // cost a user their heart-rate curve over an unrelated bug.
  it('ignores another IllegalArgumentException', () => {
    expect(isHrSampleCrash('IllegalArgumentException: Too many records in the cursor. Max allowed: 5000')).toBe(false);
  });
  it('ignores a crash with no message at all', () => {
    expect(isHrSampleCrash('')).toBe(false);
    expect(isHrSampleCrash(null)).toBe(false);
    expect(isHrSampleCrash(undefined)).toBe(false);
  });
});

describe('hrWindowDays', () => {
  it('is one key for a window inside a day', () => {
    expect(hrWindowDays(at(2026, 11, 9, 0, 0), at(2026, 11, 9, 14, 30))).toEqual(['2026-11-09']);
  });
  it('is both ends for a night that crosses midnight', () => {
    expect(hrWindowDays(at(2026, 11, 8, 22, 40), at(2026, 11, 9, 6, 15))).toEqual(['2026-11-08', '2026-11-09']);
  });
  // The day-load read runs from midnight to NOW, so its end moves every
  // launch. Keys have to be the days, or a window could never be recognised
  // again and the breaker would never fire twice on the same day.
  it('gives the same key however far into the day the window runs', () => {
    const a = hrWindowDays(at(2026, 11, 9, 0, 0), at(2026, 11, 9, 9, 1));
    const b = hrWindowDays(at(2026, 11, 9, 0, 0), at(2026, 11, 9, 21, 48));
    expect(a).toEqual(b);
  });
  it('tolerates a reversed window', () => {
    expect(hrWindowDays(at(2026, 11, 9, 6, 0), at(2026, 11, 8, 22, 0))).toEqual(['2026-11-08', '2026-11-09']);
  });
  it('is empty rather than throwing on an invalid date', () => {
    expect(hrWindowDays(new Date('nope'), at(2026, 11, 9))).toEqual([]);
  });
  it('keys by local date, not UTC', () => {
    // 23:30 local is the NEXT day in UTC for anyone west of Greenwich; the
    // windows here are all built from local wall-clock times.
    expect(dayKeyOf(at(2026, 11, 9, 23, 30))).toBe('2026-11-09');
  });
});

describe('nextPoisonDays', () => {
  it('adds a day', () => {
    expect(nextPoisonDays([], ['2026-11-09'])).toEqual(['2026-11-09']);
  });
  // Identity is the "nothing changed" signal, so a day already known is not
  // re-added, re-ordered or re-reported.
  it('is a no-op for a day it already holds', () => {
    const held = ['2026-11-08', '2026-11-09'];
    expect(nextPoisonDays(held, ['2026-11-08'])).toBe(held);
  });
  it('adds only what is new', () => {
    expect(nextPoisonDays(['2026-11-08'], ['2026-11-08', '2026-11-09'])).toEqual(['2026-11-08', '2026-11-09']);
  });
  it('drops the oldest past the cap', () => {
    const many = Array.from({ length: MAX_POISON_DAYS }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}x${i}`);
    // (keys above are deliberately not day-shaped, so only the real one lands)
    const out = nextPoisonDays(many, ['2026-11-09']);
    expect(out).toHaveLength(MAX_POISON_DAYS);
    expect(out[out.length - 1]).toBe('2026-11-09');
    expect(out).not.toContain(many[0]);
  });
  it('ignores anything that is not a day key', () => {
    expect(nextPoisonDays(['2026-11-09'], ['', 'today', '2026-13'])).toEqual(['2026-11-09']);
  });
});

describe('windowPoisoned', () => {
  // Coarse in the SAFE direction: a poisoned night blocks that day's pacing
  // read too, because the record that kills us is somewhere in those hours and
  // the two windows overlap.
  it('blocks a window that touches any poisoned day', () => {
    expect(windowPoisoned(['2026-11-08'], ['2026-11-08', '2026-11-09'])).toBe(true);
    expect(windowPoisoned(['2026-11-09'], ['2026-11-08', '2026-11-09'])).toBe(true);
  });
  it('leaves every other window alone', () => {
    expect(windowPoisoned(['2026-11-08'], ['2026-11-10'])).toBe(false);
    expect(windowPoisoned([], ['2026-11-08'])).toBe(false);
  });
});

describe('hrPoisonRow', () => {
  it('says so when there is nothing to say', () => {
    expect(hrPoisonRow([])).toBe('none');
  });
  it('names the days while there are few', () => {
    expect(hrPoisonRow(['2026-11-08', '2026-11-09'])).toBe('2 days (2026-11-08, 2026-11-09)');
  });
  it('counts and samples the newest once there are many', () => {
    const days = ['a', 'b', 'c', 'd', 'e', '2026-11-09'];
    expect(hrPoisonRow(days)).toBe('6 days (latest c, d, e, 2026-11-09)');
  });
});

describe('poisonFromCrashes', () => {
  const CRASH = 'IllegalArgumentException: record samples should not be empty [v1.37.0]';

  it('poisons the days that were being read', () => {
    expect(poisonFromCrashes([], ['2026-11-08', '2026-11-09'], [CRASH]))
      .toEqual(['2026-11-08', '2026-11-09']);
  });

  // A marker with no matching crash is a process that was killed while
  // reading: a swipe-away, an OOM, the system reclaiming memory. Treating that
  // as evidence would cost the user a day's heart-rate curve for ever.
  it('is null for a left-behind marker with no crash', () => {
    expect(poisonFromCrashes([], ['2026-11-09'], [])).toBeNull();
    expect(poisonFromCrashes([], ['2026-11-09'], ['SIGSEGV: Autonomic +0x1a2b3c'])).toBeNull();
  });

  // ...and the crash alone cannot say WHICH window, so it cannot act either.
  it('is null for the crash with no marker', () => {
    expect(poisonFromCrashes([], [], [CRASH])).toBeNull();
  });

  it('is null when the days are already known', () => {
    expect(poisonFromCrashes(['2026-11-09'], ['2026-11-09'], [CRASH])).toBeNull();
    expect(poisonFromCrashes(['2026-11-09'], ['bogus'], [CRASH])).toBeNull();
  });

  it('finds the crash among the other rows a dying process left', () => {
    expect(poisonFromCrashes([], ['2026-11-09'], ['native.hang something', CRASH]))
      .toEqual(['2026-11-09']);
  });

  it('respects the cap', () => {
    const full = Array.from({ length: MAX_POISON_DAYS }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}x${i}`);
    const out = poisonFromCrashes(full, ['2026-11-09'], [CRASH]);
    expect(out).toHaveLength(MAX_POISON_DAYS);
    expect(out?.[out.length - 1]).toBe('2026-11-09');
  });
});
