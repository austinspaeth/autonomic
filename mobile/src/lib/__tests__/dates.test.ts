/**
 * Date formatting that ends up inside SENTENCES.
 *
 * `fmtMonthDay` exists because an ISO key in prose reads as a database field:
 * "not since 2026-07-01" is a leak of the storage format into copy. Everything
 * here is pure and locale-aware via `toLocaleDateString`, so these pin the parts
 * that are ours: the ordinal suffix and the bad-input fallback.
 */
import { fmtMonthDay } from '../dates';

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
