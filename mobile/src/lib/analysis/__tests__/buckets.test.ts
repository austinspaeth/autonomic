/**
 * Range bucketing: week view buckets calendar weeks starting Sunday, so the
 * newest bucket is the in-progress week (a single day when today is Sunday).
 */
import { acBuckets, acLatestIdx } from '../buckets';

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

describe('acLatestIdx', () => {
  it('finds the newest bucket where any series resolved', () => {
    expect(acLatestIdx([1, null, 2, null])).toBe(2);
    expect(acLatestIdx([1, null, null], [null, 3, null])).toBe(1);
    expect(acLatestIdx([null, null])).toBe(-1);
    expect(acLatestIdx([])).toBe(-1);
  });
});
