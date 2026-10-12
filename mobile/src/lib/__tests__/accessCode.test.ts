import { grantAddedText, grantStatusText, isPlausibleCode, normalizeCode } from '../accessCode';

describe('access codes', () => {
  it('reads one code however it was typed', () => {
    expect(normalizeCode('k7wq-m2xd')).toBe('K7WQM2XD');
    expect(normalizeCode(' K7WQ M2XD ')).toBe('K7WQM2XD');
  });

  it('only offers to send something that could be a code', () => {
    expect(isPlausibleCode('')).toBe(false);
    expect(isPlausibleCode('abc-12')).toBe(false);
    expect(isPlausibleCode('abc-123')).toBe(true);
    expect(isPlausibleCode('x'.repeat(25))).toBe(false);
  });

  it('says how long, and stops counting for a forever code', () => {
    expect(grantAddedText(30)).toBe('Code accepted. 30 days of full access added.');
    expect(grantAddedText(1)).toBe('Code accepted. 1 day of full access added.');
    expect(grantAddedText(999)).toBe('Code accepted. You have Pro.');
    expect(grantStatusText(44)).toBe('Full access · 44 days left');
    expect(grantStatusText(1)).toBe('Full access · 1 day left');
    expect(grantStatusText(985)).toBe('Pro');
    // Pro past 180 days left, a day count at or under it.
    expect(grantStatusText(181)).toBe('Pro');
    expect(grantStatusText(180)).toBe('Full access · 180 days left');
    expect(grantAddedText(365)).toBe('Code accepted. You have Pro.');
    expect(grantAddedText(30, 200)).toBe('Code accepted. You have Pro.');
    expect(grantAddedText(180)).toBe('Code accepted. 180 days of full access added.');
  });
});
