/**
 * Watch-sync candidate partitioning: readings overlapping the (grace-stretched)
 * session window auto-sync; everything else found in the day becomes a manual
 * pick on the waiting card.
 */
import { dayStartMs, isPickable, partitionCandidates, pickSessionCandidate, rrSeconds } from '../rrCandidates';

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

describe('isPickable', () => {
  const rr = Array(100).fill(800);

  it('accepts a reading with RR data at least 4 minutes long', () => {
    expect(isPickable({ rr, startMs: 0, endMs: 5 * MIN })).toBe(true);
    expect(isPickable({ rr, startMs: 0, endMs: 4 * MIN })).toBe(true); // edge inclusive
  });

  it('rejects a reading shorter than 4 minutes', () => {
    expect(isPickable({ rr, startMs: 0, endMs: MIN })).toBe(false);
    expect(isPickable({ rr, startMs: 0, endMs: 3 * MIN })).toBe(false);
  });

  it('rejects a reading with no beat-to-beat data', () => {
    expect(isPickable({ rr: [], startMs: 0, endMs: 5 * MIN })).toBe(false);
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

describe('pickSessionCandidate', () => {
  const from = 100 * MIN; // window incl. grace
  const to = 111 * MIN;
  // A candidate of `mins` wall-clock, carrying one 800 ms beat per second.
  const cand = (name: string, startMin: number, mins: number) => ({
    name, startMs: startMin * MIN, endMs: (startMin + mins) * MIN,
    rr: Array(Math.round((mins * 60 * 1000) / 800)).fill(800),
  });

  it('takes the 5-minute session over a 1-minute background sample, in either order', () => {
    const short = cand('short', 101, 1);
    const real = cand('real', 102, 5);
    expect(pickSessionCandidate([short, real], from, to)).toBe(real);
    expect(pickSessionCandidate([real, short], from, to)).toBe(real);
  });

  it('does not settle for a short candidate that arrived first', () => {
    // Tick 1: only the background sample is in Health.
    const short = cand('short', 101, 1);
    expect(pickSessionCandidate([short], from, to)).toBeNull();
    // Tick 3: the Mindfulness series has landed and wins outright.
    const real = cand('real', 102, 5);
    expect(pickSessionCandidate([short, real], from, to)).toBe(real);
  });

  it('never auto-selects when only a short candidate exists', () => {
    expect(pickSessionCandidate([cand('a', 101, 1), cand('b', 105, 3)], from, to)).toBeNull();
  });

  it('ignores usable readings outside the window', () => {
    const elsewhere = cand('morning', 10, 6);
    expect(pickSessionCandidate([elsewhere], from, to)).toBeNull();
  });

  it('prefers the greatest overlap with the session window, then length', () => {
    const mostlyOutside = cand('early', 95, 6);   // 1 min inside
    const inside = cand('inside', 102, 5);        // 5 min inside
    expect(pickSessionCandidate([mostlyOutside, inside], from, to)).toBe(inside);
    // Equal overlap (both fully inside): the longer reading wins.
    const four = cand('four', 101, 4);
    const five = cand('five', 101, 5);
    expect(pickSessionCandidate([four, five], from, to)!.endMs).toBe(five.endMs);
  });
});

describe('rrSeconds', () => {
  it('sums the RR intervals rather than measuring the clock', () => {
    // A 5-minute window holding only 90 s of beats: the frequency floors are
    // charged against THIS, which is the whole point of the badge.
    expect(rrSeconds({ rr: Array(112).fill(800) })).toBeCloseTo(89.6);
    expect(rrSeconds({ rr: [] })).toBe(0);
  });
});
