/**
 * Range bucketing: week view buckets calendar weeks starting Sunday, so the
 * newest bucket is the in-progress week (a single day when today is Sunday).
 */
import { acBuckets, acLatestIdx, bucketViews, bucketWhen, onDay } from '../buckets';

afterEach(() => jest.useRealTimers());

describe('acBuckets week mode', () => {
  it('buckets Sunday-start weeks with the current week last', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 22)); // Wed Jul 22 2026
    const b = acBuckets({}, 'week');
    expect(b).toHaveLength(12);
    expect(b[11].start).toBe('2026-07-19');                    // most recent Sunday
    expect(b[11].end).toBe('2026-07-25');
    expect(b[10].start).toBe('2026-07-12');
    b.forEach((x) => expect(new Date(`${x.start}T00:00:00`).getDay()).toBe(0));
  });

  it('holds only today when today is Sunday', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 19)); // Sun Jul 19 2026
    const days = { '2026-07-18': {}, '2026-07-19': {} } as never;
    const b = acBuckets(days, 'week');
    expect(b[11].start).toBe('2026-07-19');
    expect(b[11].days).toEqual(['2026-07-19']);                // Saturday belongs to last week
    expect(b[10].days).toEqual(['2026-07-18']);
  });
});

describe('bucketWhen', () => {
  it('words the readout phrase for the active range', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 22)); // Wed Jul 22 2026
    const at = (mode: 'day' | 'week' | 'month' | 'year') => {
      const b = acBuckets({ '2026-07-22': {} } as never, mode);
      return bucketWhen(mode, b[b.length - 1]);
    };
    expect(at('day')).toBe('on 7/22');
    expect(at('week')).toBe('for the week of 7/19');   // Sunday-start week
    expect(at('month')).toBe('in July');               // spelled out, unlike the axis label
    expect(at('year')).toBe('in 2026');
  });

  it('has no phrase without a bucket, and pairs labels with phrases', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 22));
    expect(bucketWhen('day', null)).toBeNull();
    expect(bucketWhen('day', undefined)).toBeNull();   // e.g. buckets[-1], no bucket had data
    expect(onDay(null)).toBeNull();
    const v = bucketViews(acBuckets({} as never, 'month'), 'month');
    expect(v[11]).toEqual({ label: 'Jul', when: 'in July' });
  });
});

describe('acLatestIdx', () => {
  it('finds the newest bucket where any series resolved', () => {
    expect(acLatestIdx([1, null, 2, null])).toBe(2);
    expect(acLatestIdx([1, null, null], [null, 3, null])).toBe(1);
    expect(acLatestIdx([null, null])).toBe(-1);
    expect(acLatestIdx([])).toBe(-1);
  });
});
