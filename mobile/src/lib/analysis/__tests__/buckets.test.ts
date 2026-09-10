/**
 * Range bucketing: week view buckets calendar weeks starting Sunday, so the
 * newest bucket is the in-progress week (a single day when today is Sunday).
 */
import {
  MAX_CUSTOM_BUCKETS, acBuckets, acLatestIdx, acRangeLabel, bucketViews, bucketWhen,
  customBucketCount, onDay,
} from '../buckets';

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

/**
 * Custom ranges. Two properties matter more than the counts: a bucket is
 * CLAMPED to the window at both ends (a month bucket for a range starting on
 * the 12th must not average in the 1st–11th, which the user did not ask for),
 * and the window's own day keys are what land in each bucket.
 */
describe('acBuckets custom range', () => {
  const days = {
    '2026-01-30': {}, '2026-01-31': {}, '2026-02-01': {}, '2026-02-05': {}, '2026-02-28': {},
  } as never;

  it('charts every day of the window, inclusive of both ends', () => {
    const b = acBuckets({}, 'day', { from: '2026-01-25', to: '2026-02-05' });
    expect(b).toHaveLength(12);
    expect(b[0].start).toBe('2026-01-25');
    expect(b[0].label).toBe('1/25');
    expect(b[11].start).toBe('2026-02-05');
  });

  it('clamps month buckets to the window rather than to the calendar month', () => {
    const b = acBuckets(days, 'month', { from: '2026-01-12', to: '2026-02-05' });
    expect(b).toHaveLength(2);
    expect([b[0].start, b[0].end]).toEqual(['2026-01-12', '2026-01-31']);
    expect([b[1].start, b[1].end]).toEqual(['2026-02-01', '2026-02-05']);
    // Feb 28 is outside the window, so it is in no bucket.
    expect(b[1].days).toEqual(['2026-02-01', '2026-02-05']);
  });

  it('clamps week buckets to the window, Sunday-aligned', () => {
    const b = acBuckets({}, 'week', { from: '2026-01-28', to: '2026-02-03' });
    // Jan 28 2026 is a Wednesday: its week starts Sun Jan 25, clamped to Jan 28.
    expect([b[0].start, b[0].end]).toEqual(['2026-01-28', '2026-01-31']);
    expect([b[1].start, b[1].end]).toEqual(['2026-02-01', '2026-02-03']);
  });

  it('adds the year to month labels once the window crosses one', () => {
    const same = acBuckets({}, 'month', { from: '2026-01-01', to: '2026-03-31' });
    expect(same.map((x) => x.label)).toEqual(['Jan', 'Feb', 'Mar']);
    const across = acBuckets({}, 'month', { from: '2025-12-01', to: '2026-01-31' });
    expect(across.map((x) => x.label)).toEqual(["Dec '25", "Jan '26"]);
  });

  it('reads a backwards pair as the range the user meant', () => {
    const back = acBuckets({}, 'day', { from: '2026-02-05', to: '2026-02-01' });
    expect(back.map((x) => x.start)).toEqual(acBuckets({}, 'day', { from: '2026-02-01', to: '2026-02-05' }).map((x) => x.start));
  });
});

describe('customBucketCount', () => {
  it('counts what acBuckets would produce, without a journal', () => {
    const r = { from: '2026-01-01', to: '2026-06-30' };
    (['day', 'week', 'month', 'year'] as const).forEach((m) => {
      expect(customBucketCount(m, r)).toBe(acBuckets({}, m, r).length);
    });
  });

  it('puts a multi-year window charted by day over the ceiling', () => {
    expect(customBucketCount('day', { from: '2023-01-01', to: '2026-01-01' })).toBeGreaterThan(MAX_CUSTOM_BUCKETS);
    expect(customBucketCount('week', { from: '2023-01-01', to: '2026-01-01' })).toBeLessThan(MAX_CUSTOM_BUCKETS);
  });
});

describe('acRangeLabel', () => {
  it('names both ends and the grouping for a custom range', () => {
    expect(acRangeLabel('day', { from: '2026-01-25', to: '2026-03-26' })).toBe('1/25/26 – 3/26/26 · daily');
    expect(acRangeLabel('week', { from: '2026-01-25', to: '2026-03-26' })).toBe('1/25/26 – 3/26/26 · weekly average');
  });

  it('keeps the tab wording when there is no custom range', () => {
    expect(acRangeLabel('day')).toBe('Last 14 days · daily');
  });
});
