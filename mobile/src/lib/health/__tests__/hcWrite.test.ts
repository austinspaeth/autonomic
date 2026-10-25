/**
 * The native insertRecords parses a whole batch with the FIRST record's type,
 * so a mixed batch is rejected outright. The HRV session write is RMSSD +
 * HeartRate, and shipped as one batch that never landed on any Android phone.
 */
import { makeHealthConnect } from '../healthConnect';

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
