import { stepTotalFromRecords } from '../stepTotal';

/**
 * The bug this file exists for: Health Connect holds one set of Steps records
 * per writing app, all covering the same minutes, and `readDayLoad` used to
 * sum them. A real journal reported 39,355 steps for a day Garmin called
 * 14,217 and Health Connect itself called 12,569.
 */
const rec = (dataOrigin: string, count: number, startTime = '2026-09-19T09:00:00.000Z') => ({
  startTime, endTime: '2026-09-19T09:10:00.000Z', count, metadata: { dataOrigin },
});

describe('stepTotalFromRecords', () => {
  it('never sums two apps writing the same day', () => {
    const records = [
      rec('com.garmin.android.apps.connectmobile', 14217),
      rec('com.google.android.apps.fitness', 12569),
      rec('com.sec.android.app.shealth', 12569),
    ];
    // The sum, which is what shipped, was 39,355.
    expect(stepTotalFromRecords(records)).toBe(14217);
  });

  it('adds up the records WITHIN one source', () => {
    const records = [
      rec('com.garmin.android.apps.connectmobile', 4000, '2026-09-19T09:00:00.000Z'),
      rec('com.garmin.android.apps.connectmobile', 2119, '2026-09-19T14:00:00.000Z'),
      rec('com.google.android.apps.fitness', 5000),
    ];
    expect(stepTotalFromRecords(records)).toBe(6119);
  });

  it('is a plain total when only one app writes steps', () => {
    expect(stepTotalFromRecords([rec('com.google.android.apps.fitness', 8000)])).toBe(8000);
  });

  it('treats records with no provenance as one source rather than as many', () => {
    const records = [
      { startTime: 'x', endTime: 'y', count: 500 },
      { startTime: 'x', endTime: 'y', count: 500 },
    ];
    expect(stepTotalFromRecords(records)).toBe(1000);
  });

  it('ignores junk counts and answers 0 for nothing', () => {
    expect(stepTotalFromRecords([])).toBe(0);
    expect(stepTotalFromRecords([rec('a', Number.NaN), rec('b', -5), rec('c', 0)])).toBe(0);
  });
});
