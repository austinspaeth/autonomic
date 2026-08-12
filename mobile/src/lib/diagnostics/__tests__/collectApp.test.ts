/**
 * The one test in here that needs native modules mocked, and it earns it: the
 * app dump's whole promise is that it carries no health data and nothing
 * identifying, and that promise lives in the collector, not the formatter. So
 * this runs the REAL collector over a journal seeded with things that must not
 * appear — an import file name, a profile value, absolute dates — and asserts
 * they don't. It also proves the report survives a phone where half the
 * natives are missing, which is the state a user with a problem is often in.
 *
 * The mocks are deliberately shallow: they exist to let the module load, not to
 * be a fixture of record. Assert on privacy and on shape, not on values a mock
 * happens to return.
 */
(globalThis as unknown as Record<string, unknown>).__DEV__ = false;
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '18.5', constants: { systemName: 'iOS', osVersion: '18.5', Model: 'iPhone16,1' } },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  PermissionsAndroid: { PERMISSIONS: {}, check: async () => true },
  Linking: { openURL: async () => {} },
}), { virtual: true });
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ status: 'granted', granted: true, canAskAgain: false, ios: { status: 2 } }),
  getAllScheduledNotificationsAsync: async () => [{ identifier: 'morning-reminder' }],
}), { virtual: true });
jest.mock('react-native-vision-camera', () => { throw new Error('not in this build'); }, { virtual: true });
jest.mock('react-native-worklets-core', () => ({ useRunOnJS: () => {} }), { virtual: true });
jest.mock('react-native-ble-plx', () => ({ BleManager: class {} }), { virtual: true });
jest.mock('expo-store-review', () => ({ isAvailableAsync: async () => true, hasAction: async () => true }), { virtual: true });
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true }), { virtual: true });
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.21.2' }, nativeBuildVersion: '77' } }), { virtual: true });
jest.mock('expo-updates', () => ({ runtimeVersion: '1.21.2', channel: 'production', isEmbeddedLaunch: true }), { virtual: true });
jest.mock('../../../store/iap', () => ({ getIapState: () => ({ ready: true, isPro: true, products: [{ productId: 'yearly' }], activeSku: 'yearly', purchasing: false }) }));
jest.mock('../../../store/tier', () => ({ getTier: () => 'pro', getTrialDaysLeft: () => 0 }));
jest.mock('../../review', () => ({ reviewMemory: () => ({ lastAskedAtMs: null, askedVersion: null }) }));
jest.mock('../../health/declined', () => ({ getDeclinedKeys: () => new Set(['a']) }));
jest.mock('../../health', () => ({
  health: () => ({ available: true, readAuthStatus: async () => 'unknown' }),
  healthAppName: () => 'Apple Health',
}));
jest.mock('../../ble/manager', () => ({ bleIfStarted: () => null }));
jest.mock('../../../../modules/app-env', () => ({ isTestFlightBuild: () => true, isSideloadedAndroidBuild: () => false }));
jest.mock('../../../../modules/watch-bridge', () => ({
  watchBridge: () => ({ getState: async () => ({ supported: true, activated: true, paired: true, watchAppInstalled: false, reachable: false }), pendingUserInfo: async () => [{}, {}] }),
}));
jest.mock('../errorLog', () => ({ getErrorLog: () => [{ at: '2026-08-01T00:00:00.000Z', tag: 'store.persist', msg: 'disk full', n: 4, first: '2026-07-31T00:00:00.000Z' }] }));

const DAY = {
  readings: [
    { id: 'a', type: 'hrv', time: '08:00', imported: true, durationSec: 30 },
    { id: 'b', type: 'hrv', time: '09:00', rmssd: 40 },
    { id: 'c', type: 'bp', time: '10:00' },
  ],
  activities: [{ id: 'd', type: 'walk', time: '11:00' }],
  meds: [{ id: 'e', type: 'salt', time: '12:00' }],
  symptoms: [],
  food: { water: 3, meals: [{ id: 'm' }], triggers: {} },
  digestion: { movements: [{ id: 'g', time: '07:00' }] },
  sleep: { bed: '23:00', wake: '07:00', stages: { deep: 60, rem: 90, core: 200, awake: 10 } },
};
jest.mock('../../../store/store', () => ({
  loadIssue: { kind: 'corrupt' },
  storageStats: () => ({ journalBytes: 402_000, waveformCount: 12, waveformBytes: 900_000, encrypted: true, orphanWaveforms: 1 }),
  getState: () => ({
    version: 1,
    settings: { theme: 'dark', reminder: { enabled: true, time: '08:00' }, healthEnabled: true, lastBleDeviceName: 'Polar H10', protocolSetOn: '2026-07-01' },
    profile: { sex: 'Female', height: 'SECRET-HEIGHT' },
    customTypes: { meds: { 'custom-mag': {} } },
    hiddenTypes: { symptoms: ['nausea'] },
    meta: { lastUpdated: '2026-08-04T00:00:00.000Z', lastImport: { name: 'secret-name.json', at: '2026-07-20T00:00:00.000Z' }, onboarded: '2026-06-01T00:00:00.000Z' },
    days: { '2026-08-04': DAY, '2026-07-04': DAY },
  }),
}));

/* eslint-disable import/first -- these must be read AFTER the jest.mock calls above.
   Both modules capture native and store handles at import time, so hoisting them to
   the top of the file would bind the real ones and this test would collect a real
   device's diagnostics instead of the planted fixture it asserts against. */
import { collectAppDiagnostics } from '../collectApp';
import { formatAppDiagnostics } from '../appReport';

describe('collectAppDiagnostics', () => {
  it('leaks nothing identifying: no file names, profile values, or dates', async () => {
    const text = formatAppDiagnostics(await collectAppDiagnostics());
    expect(text).not.toContain('secret-name.json');   // the import is dated, not named
    expect(text).not.toContain('Female');             // profile fields are counted, not read
    expect(text).not.toContain('SECRET-HEIGHT');   // ...nor height
    expect(text).not.toContain('2026-08-04');         // day keys become ages in days
    expect(text).not.toContain('2026-07-20');
    expect(text).toMatch(/last import\s+\d+ days ago/);
    expect(text).toMatch(/profile fields set\s+sex, height/);
  });

  it('counts the journal without sampling it, and excludes short imported HRV', async () => {
    const d = await collectAppDiagnostics();
    expect(d.journal['days logged']).toBe(2);
    expect(d.journal['readings']).toBe(6);
    expect(d.journal['hrv readings']).toBe(4);
    expect(d.journal['hrv counted']).toBe(2);   // the 30s imported samples don't count
    expect(d.journal['imported entries']).toBe(2);
    expect(d.journal['nights with stages']).toBe(2);
  });

  it('never starts the Bluetooth radio — that would raise a permission prompt', async () => {
    const d = await collectAppDiagnostics();
    expect(String(d.bluetooth['adapter state'])).toContain('not started');
    expect(d.bluetooth['saved strap']).toBe('Polar H10');   // a product model, not a person
  });

  it('reports a missing native module as a fact rather than failing', async () => {
    const d = await collectAppDiagnostics();
    expect(d.permissions['camera']).toBe('no native module');
    expect(String(d.capabilities['vision-camera'])).toContain('MISSING');
    expect(d.notes.some((n) => n.includes('camera native module is missing'))).toBe(true);
  });

  it('leads with the notes that explain a broken install', async () => {
    const d = await collectAppDiagnostics();
    expect(d.notes[0]).toContain('could NOT be parsed at launch');   // loadIssue: corrupt
    expect(d.notes.some((n) => n.includes('watch app is not installed'))).toBe(true);
    expect(d.notes.some((n) => n.includes('never drained into the journal'))).toBe(true);
  });
});
