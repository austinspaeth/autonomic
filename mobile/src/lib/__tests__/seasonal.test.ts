import { isHalloweenWeek } from '../seasonal';

describe('isHalloweenWeek', () => {
  it('runs Sunday the 25th through Saturday the 31st', () => {
    expect(isHalloweenWeek('2026-10-24')).toBe(false);
    expect(isHalloweenWeek('2026-10-25')).toBe(true);
    expect(isHalloweenWeek('2026-10-28')).toBe(true);
    expect(isHalloweenWeek('2026-10-31')).toBe(true);
  });

  it('is back to normal on Sunday', () => {
    expect(isHalloweenWeek('2026-11-01')).toBe(false);
  });

  it('is one week of one year', () => {
    expect(isHalloweenWeek('2025-10-28')).toBe(false);
    expect(isHalloweenWeek('2027-10-28')).toBe(false);
  });
});
