/**
 * Date formatting that ends up inside SENTENCES.
 *
 * `fmtMonthDay` exists because an ISO key in prose reads as a database field:
 * "not since 2026-07-01" is a leak of the storage format into copy. Everything
 * here is pure and locale-aware via `toLocaleDateString`, so these pin the parts
 * that are ours: the ordinal suffix and the bad-input fallback.
 */
import { fmtDuration, fmtMonthDay, minsBetween } from '../dates';

describe('fmtMonthDay', () => {
  it('reads as a date in a sentence, with an ordinal', () => {
    expect(fmtMonthDay('2026-07-01')).toBe('July 1st');
    expect(fmtMonthDay('2026-07-02')).toBe('July 2nd');
    expect(fmtMonthDay('2026-07-03')).toBe('July 3rd');
    expect(fmtMonthDay('2026-12-31')).toBe('December 31st');
  });

  it('gets the teens right, which every naive version does not', () => {
    // 11st / 12nd / 13rd is the classic bug.
    expect(fmtMonthDay('2026-07-11')).toBe('July 11th');
    expect(fmtMonthDay('2026-07-12')).toBe('July 12th');
    expect(fmtMonthDay('2026-07-13')).toBe('July 13th');
  });

  it('hands back an unparseable key rather than "Invalid Date"', () => {
    expect(fmtMonthDay('not-a-date')).toBe('not-a-date');
  });
});

/**
 * A symptom can carry an optional end time, and the journal row states how long
 * it ran. The rule that matters is what is NOT a duration: an end at or before
 * the start crossed midnight or was mistyped, and a wrapped or negative figure
 * would be a claim about the user's body that their log never made.
 */
describe('minsBetween', () => {
  it('measures forward within the day', () => {
    expect(minsBetween('08:15', '11:30')).toBe(195);
    expect(minsBetween('08:15', '08:20')).toBe(5);
  });

  it('refuses anything that is not forward', () => {
    expect(minsBetween('08:15', '08:15')).toBeNull();
    expect(minsBetween('23:40', '00:20')).toBeNull();
    expect(minsBetween('08:15', '')).toBeNull();
    expect(minsBetween('', '11:30')).toBeNull();
    expect(minsBetween(undefined, undefined)).toBeNull();
  });
});

describe('fmtDuration', () => {
  it('reads as a duration rather than a conversion', () => {
    expect(fmtDuration(45)).toBe('45 min');
    expect(fmtDuration(59)).toBe('59 min');
    expect(fmtDuration(60)).toBe('1h');
    expect(fmtDuration(135)).toBe('2h 15m');
  });
});
