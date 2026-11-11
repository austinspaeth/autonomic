/**
 * The native insertRecords parses a whole batch with the FIRST record's type,
 * so a mixed batch is rejected outright. The HRV session write is RMSSD +
 * HeartRate, and shipped as one batch that never landed on any Android phone.
 */
import { cycleRecordTime, makeHealthConnect } from '../healthConnect';

// jest.mock is hoisted above the import, so these still apply to it.
jest.mock('../../diagnostics/errorLog', () => ({ logError: jest.fn() }));
jest.mock('../askedAuth', () => ({}));
jest.mock('../index', () => ({ HISTORY_SLEEP_MIN_MIN: 0, NIGHT_SERIES_MAX: 0, emptyHistory: () => ({}) }));

function fakeModule() {
  const batches: Record<string, unknown>[][] = [];
  const mod = {
    initialize: async () => true,
    getSdkStatus: async () => 3,
    SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
    requestPermission: async () => [],
    getGrantedPermissions: async () => [],
    readRecords: async () => ({ records: [] }),
    // The library's behaviour: one type per call, or it throws.
    insertRecords: async (records: Record<string, unknown>[]) => {
      if (new Set(records.map((r) => r.recordType)).size > 1) throw new Error('mixed batch');
      batches.push(records);
      return records.map((_, i) => String(i));
    },
  };
  return { mod, batches };
}

test('an HRV session writes its RMSSD and its heart rate, one type per call', async () => {
  const { mod, batches } = fakeModule();
  await makeHealthConnect(mod).writeHrvSession({
    rmssdMs: 38, avgHr: 72, startISO: '2026-10-24T09:00:00.000Z', durationSec: 300,
  });
  expect(batches.map((b) => b[0].recordType).sort()).toEqual(['HeartRate', 'HeartRateVariabilityRmssd']);
  expect(batches.every((b) => b.length === 1)).toBe(true);
});

describe('cycle records are never stamped in the future', () => {
  // Health Connect rejects a record whose time is after the phone's clock, so
  // a period logged for today before noon was refused when it was stamped noon.
  const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();

  test('today before noon is stamped just before now, on the same day', () => {
    const now = at(2026, 11, 11, 9, 30);
    const when = cycleRecordTime('2026-11-11', now);
    expect(when.getTime()).toBeLessThanOrEqual(now);
    expect(when.getDate()).toBe(11);
  });

  test('today after noon, and past days, keep noon', () => {
    expect(cycleRecordTime('2026-11-11', at(2026, 11, 11, 15)).getTime()).toBe(at(2026, 11, 11, 12));
    expect(cycleRecordTime('2026-11-09', at(2026, 11, 11, 9)).getTime()).toBe(at(2026, 11, 9, 12));
  });

  test('the first second of the day does not slip onto yesterday', () => {
    const when = cycleRecordTime('2026-11-11', at(2026, 11, 11, 0));
    expect(when.getTime()).toBe(at(2026, 11, 11, 0));
  });

  test('writing today\'s flow sends a time that is not in the future', async () => {
    const { mod, batches } = fakeModule();
    const before = Date.now();
    const today = new Date();
    const dk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await makeHealthConnect(mod).writeCycleDay(dk, 'light', { periodStart: true, replace: false });
    const sent = new Date(batches[0][0].time as string).getTime();
    expect(sent).toBeLessThanOrEqual(Math.max(before, Date.now()));
  });
});
