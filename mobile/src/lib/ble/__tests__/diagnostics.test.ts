import { formatDiagnostics, looksLikeStrap, type BleDiagnostics, type BleScanRecord } from '../devices';

const rec = (over: Partial<BleScanRecord> = {}): BleScanRecord => ({
  id: 'AA:BB:CC:DD:EE:FF',
  name: 'Neighbour TV',
  localName: null,
  rssi: -70,
  txPower: null,
  isConnectable: true,
  serviceUUIDs: ['0000fe9f-0000-1000-8000-00805f9b34fb'],
  heartRate: false,
  identified: false,
  ...over,
});

const strap = (over: Partial<BleScanRecord> = {}) => rec({
  id: 'C1:22:33:44:55:66',
  name: 'Polar H10 8A2F',
  serviceUUIDs: ['0000180d-0000-1000-8000-00805f9b34fb'],
  heartRate: true,
  identified: true,
  ...over,
});

const base = (over: Partial<BleDiagnostics> = {}): BleDiagnostics => ({
  at: '2026-07-30T12:00:00.000Z',
  app: { 'app version': '1.19.1' },
  platform: { os: 'android', 'api level': 34 },
  adapter: { available: true, state: 'PoweredOn' },
  permissions: { 'android.permission.BLUETOOTH_SCAN': 'granted' },
  requires: ['android.permission.BLUETOOTH_SCAN'],
  scan: { ms: 8000, error: null, started: true, devices: [] },
  connectedError: null,
  connected: [],
  saved: { id: null, name: null },
  notes: [],
  ...over,
});

describe('looksLikeStrap', () => {
  it('recognises common strap names', () => {
    for (const n of ['Polar H10 8A2F', 'TICKR X', 'CooSpo HW9', 'Garmin HRM-Dual']) {
      expect(looksLikeStrap(n)).toBe(true);
    }
  });

  it('does not claim ordinary devices', () => {
    for (const n of ['Living Room TV', 'AirPods', 'Tile', null, undefined, '']) {
      expect(looksLikeStrap(n)).toBe(false);
    }
  });
});

describe('formatDiagnostics', () => {
  it('withholds the name and id of devices that are not straps', () => {
    // The dump gets emailed to support, so a stranger's device must not ride
    // along in it — the count alone is what proves scanning works.
    const out = formatDiagnostics(base({ scan: { ms: 8000, error: null, started: true, devices: [rec()] } }));
    expect(out).not.toContain('Neighbour TV');
    expect(out).not.toContain('AA:BB:CC:DD:EE:FF');
    expect(out).toContain('redacted device 1');
    expect(out).toContain('(withheld)');
  });

  it('shows straps in full', () => {
    const out = formatDiagnostics(base({ scan: { ms: 8000, error: null, started: true, devices: [strap()] } }));
    expect(out).toContain('Polar H10 8A2F');
    expect(out).toContain('C1:22:33:44:55:66');
  });

  it('blames the phone when nothing at all was seen', () => {
    const out = formatDiagnostics(base());
    expect(out).toMatch(/saw NOTHING at all/);
  });

  it('blames the strap when other devices were seen but no heart rate', () => {
    const out = formatDiagnostics(base({ scan: { ms: 8000, error: null, started: true, devices: [rec(), rec({ id: 'x' })] } }));
    expect(out).toContain('Scan is working');
    expect(out).toMatch(/no heart-rate strap is broadcasting/);
  });

  it('reports a scan that never started ahead of an empty result', () => {
    const out = formatDiagnostics(base({ scan: { ms: 8000, error: 'code 600: BluetoothUnauthorized', started: false, devices: [] } }));
    expect(out).toContain('Scan never started');
    expect(out).toContain('BluetoothUnauthorized');
    expect(out).not.toMatch(/saw NOTHING at all/);
  });

  it('leads with the adapter when Bluetooth is off', () => {
    const out = formatDiagnostics(base({ adapter: { available: true, state: 'PoweredOff' } }));
    expect(out).toMatch(/adapter is PoweredOff/);
  });

  it('leads with the missing native module above all else', () => {
    const out = formatDiagnostics(base({ adapter: { available: false, state: 'NativeModuleMissing' } }));
    expect(out).toMatch(/module is not present/);
  });

  it('counts an already-connected strap as a find', () => {
    const out = formatDiagnostics(base({ connected: [strap()] }));
    expect(out).toMatch(/1 already connected/);
    expect(out).not.toMatch(/saw NOTHING at all/);
  });

  it('includes permissions, notes and the saved device', () => {
    const out = formatDiagnostics(base({
      permissions: { 'android.permission.BLUETOOTH_SCAN': 'denied' },
      notes: ['Location toggle is off.'],
      saved: { id: 'C1:22:33:44:55:66', name: 'Polar H10 8A2F' },
    }));
    expect(out).toContain('BLUETOOTH_SCAN');
    expect(out).toContain('denied');
    expect(out).toContain('Location toggle is off.');
    expect(out).toContain('SAVED DEVICE');
  });
});
