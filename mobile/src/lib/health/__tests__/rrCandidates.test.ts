/**
 * Watch-sync candidate partitioning: readings overlapping the (grace-stretched)
 * session window auto-sync; everything else found in the day becomes a manual
 * pick on the waiting card.
 */
import { dayStartMs, partitionCandidates } from '../rrCandidates';

const MIN = 60000;
const c = (startMs: number, endMs: number) => ({ startMs, endMs });

describe('partitionCandidates', () => {
  const from = 100 * MIN; // window incl. grace
  const to = 111 * MIN;

  it('keeps a reading inside the window', () => {
    const inside = c(102 * MIN, 107 * MIN);
    const { inWindow, outside } = partitionCandidates([inside], from, to);
    expect(inWindow).toEqual([inside]);
    expect(outside).toEqual([]);
  });

  it('counts overlap, not containment — a Breathe session started just before the window still syncs', () => {
    const straddlesStart = c(97 * MIN, 101 * MIN);
    const straddlesEnd = c(110 * MIN, 115 * MIN);
    const { inWindow, outside } = partitionCandidates([straddlesStart, straddlesEnd], from, to);
    expect(inWindow).toEqual([straddlesStart, straddlesEnd]);
    expect(outside).toEqual([]);
  });

  it('routes readings from elsewhere in the day to the manual list', () => {
    const morning = c(10 * MIN, 15 * MIN);
    const later = c(200 * MIN, 205 * MIN);
    const inside = c(103 * MIN, 108 * MIN);
    const { inWindow, outside } = partitionCandidates([later, inside, morning], from, to);
    expect(inWindow).toEqual([inside]);
    expect(outside).toEqual([later, morning]); // input order preserved
  });

  it('treats window edges as inclusive', () => {
    const endsAtFrom = c(95 * MIN, from);
    const startsAtTo = c(to, 120 * MIN);
    const { inWindow } = partitionCandidates([endsAtFrom, startsAtTo], from, to);
    expect(inWindow).toEqual([endsAtFrom, startsAtTo]);
  });
});

describe('dayStartMs', () => {
  it('floors to local midnight of the same day', () => {
    const noon = new Date(2026, 6, 22, 12, 34, 56, 789).getTime();
    expect(dayStartMs(noon)).toBe(new Date(2026, 6, 22, 0, 0, 0, 0).getTime());
  });

  it('is idempotent at midnight', () => {
    const midnight = new Date(2026, 6, 22, 0, 0, 0, 0).getTime();
    expect(dayStartMs(midnight)).toBe(midnight);
  });
});
