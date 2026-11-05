import { isHalloweenWeek, isThanksgivingWeek } from '../seasonal';

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

describe('isThanksgivingWeek', () => {
  it('runs Sunday the 22nd through Friday the 27th', () => {
    expect(isThanksgivingWeek('2026-11-21')).toBe(false);
    expect(isThanksgivingWeek('2026-11-22')).toBe(true);
    expect(isThanksgivingWeek('2026-11-26')).toBe(true);
    expect(isThanksgivingWeek('2026-11-27')).toBe(true);
  });

  it('is back to normal on Saturday', () => {
    expect(isThanksgivingWeek('2026-11-28')).toBe(false);
  });

  it('is one week of one year', () => {
    expect(isThanksgivingWeek('2025-11-25')).toBe(false);
    expect(isThanksgivingWeek('2027-11-25')).toBe(false);
  });

  it('never overlaps Halloween', () => {
    for (const dk of ['2026-10-25', '2026-10-31', '2026-11-22', '2026-11-27']) {
      expect(isHalloweenWeek(dk) && isThanksgivingWeek(dk)).toBe(false);
    }
  });
});
