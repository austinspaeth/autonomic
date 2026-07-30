/**
 * BLE heart-rate manager (react-native-ble-plx). Connects to the standard Heart
 * Rate GATT service (0x180D), subscribes to Heart Rate Measurement (0x2A37),
 * and streams live HR + RR intervals (ms). Also reads battery (0x180F/0x2A19)
 * when exposed. Generic enough for Polar H10 and most straps.
 *
 * Guarded so the module can be imported on a device without the native module
 * present (e.g. Expo Go / simulator) without crashing — createBle() returns a
 * stub that reports unavailable.
 */
import { Platform } from 'react-native';
import { parseHeartRateMeasurement } from '../hrv';
import type { BleDevice } from './devices';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

export type { BleDevice } from './devices';
export interface HrSample { hr: number; rr: number[] }

export interface BleManagerApi {
  available: boolean;
  requestPermissions(): Promise<boolean>;
  scan(onFound: (d: BleDevice) => void): Promise<void>;
  stopScan(): void;
  connect(id: string, onSample: (s: HrSample) => void, onDisconnect: () => void): Promise<void>;
  readBattery(id: string): Promise<number | null>;
  disconnect(): Promise<void>;
  destroy(): void;
}

function base64ToBytes(b64: string): Uint8Array {
  // Minimal base64 decode (ble-plx returns base64 characteristic values).
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  let bufLen = (b64.length / 4) * 3;
  if (b64[b64.length - 1] === '=') bufLen--;
  if (b64[b64.length - 2] === '=') bufLen--;
  const bytes = new Uint8Array(bufLen);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const e1 = lookup[b64.charCodeAt(i)], e2 = lookup[b64.charCodeAt(i + 1)], e3 = lookup[b64.charCodeAt(i + 2)], e4 = lookup[b64.charCodeAt(i + 3)];
    if (p < bufLen) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufLen) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

/** Android API level. `Platform.Version` is already a number on Android, but it
 *  arrives as a string on some OEM builds — parse defensively and assume modern
 *  (31+) if it is unreadable, since that is the permission set nearly every live
 *  device wants and the legacy branch is the narrower guess. */
function androidApiLevel(): number {
  const v = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  return Number.isFinite(v) ? v : 31;
}

const stub: BleManagerApi = {
  available: false,
  async requestPermissions() { return false; },
  async scan() { /* no-op */ },
  stopScan() { /* no-op */ },
  async connect() { throw new Error('Bluetooth is not available in this build.'); },
  async readBattery() { return null; },
  async disconnect() { /* no-op */ },
  destroy() { /* no-op */ },
};

export function createBle(): BleManagerApi {
  let BleModule: typeof import('react-native-ble-plx');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BleModule = require('react-native-ble-plx');
  } catch {
    return stub;
  }
  const { BleManager, State } = BleModule;
  let manager: InstanceType<typeof BleManager>;
  try {
    manager = new BleManager();
  } catch {
    return stub;
  }
  let connectedId: string | null = null;
  let monitorSub: { remove: () => void } | null = null;
  let disconnectSub: { remove: () => void } | null = null;
  // Bumped by every connect()/disconnect(); an in-flight connect that awakes to
  // a different epoch has been superseded and must release whatever it holds.
  let connectEpoch = 0;

  const teardown = () => {
    try { monitorSub?.remove(); } catch { /* ignore */ }
    try { disconnectSub?.remove(); } catch { /* ignore */ }
    monitorSub = null;
    disconnectSub = null;
  };

  const waitReady = () => new Promise<void>((resolve) => {
    const sub = manager.onStateChange((s) => { if (s === State.PoweredOn) { sub.remove(); resolve(); } }, true);
  });

  return {
    available: true,
    async requestPermissions() {
      if (Platform.OS === 'android') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PermissionsAndroid } = require('react-native');
        // Ask for exactly what this OS version has, and no more. Asking for all
        // three unconditionally could never succeed: below API 31 the BLUETOOTH_*
        // runtime permissions don't exist and always report denied, while from
        // API 31 up we declare BLUETOOTH_SCAN as `neverForLocation` so
        // ACCESS_FINE_LOCATION is capped at maxSdkVersion=30 and reports denied
        // too. Either way the old every()-granted gate blocked the scan outright.
        const res = await PermissionsAndroid.requestMultiple(
          androidApiLevel() >= 31
            ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
            : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION],
        );
        return Object.values(res).every((v) => v === 'granted');
      }
      await waitReady();
      return true;
    },
    async scan(onFound) {
      await waitReady();
      const seen = new Set<string>();
      const emit = (d: BleDevice) => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        onFound(d);
      };
      manager.startDeviceScan([HR_SERVICE], { allowDuplicates: false }, (error, device) => {
        if (error || !device) return;
        emit({ id: device.id, name: device.name || device.localName || 'Unknown strap', rssi: device.rssi || -100 });
      });
      // A strap the OS is already linked to has stopped advertising, so the scan
      // above can never see it — the single most common way a new user ends up
      // staring at an empty list is having "helpfully" paired the strap in system
      // Bluetooth settings first. Ask the OS for heart-rate peripherals it
      // already holds. Best-effort: Android only reports these once services
      // have been discovered, so it often returns nothing there.
      try {
        for (const device of await manager.connectedDevices([HR_SERVICE])) {
          emit({ id: device.id, name: device.name || device.localName || 'Connected strap', rssi: device.rssi || 0, connected: true });
        }
      } catch { /* ignore — the advertising scan is still running */ }
    },
    stopScan() { try { manager.stopDeviceScan(); } catch { /* ignore */ } },
    async connect(id, onSample, onDisconnect) {
      const epoch = ++connectEpoch;
      manager.stopDeviceScan();
      // Retire the previous link's callbacks first — reconnect retries would
      // otherwise stack live monitor + disconnect listeners per attempt.
      teardown();
      // If a disconnect()/newer connect() arrived while an await below was
      // pending, this attempt lost the link — release it rather than leak a
      // connected strap with no owner.
      const cancelled = async () => {
        if (epoch === connectEpoch) return false;
        if (connectedId !== id) { try { await manager.cancelDeviceConnection(id); } catch { /* ignore */ } }
        return true;
      };
      const device = await manager.connectToDevice(id, { requestMTU: 64 });
      if (await cancelled()) throw new Error('Connection superseded');
      await device.discoverAllServicesAndCharacteristics();
      if (await cancelled()) throw new Error('Connection superseded');
      connectedId = id;
      disconnectSub = manager.onDeviceDisconnected(id, () => {
        if (epoch !== connectEpoch) return;
        connectedId = null;
        teardown();
        onDisconnect();
      });
      monitorSub = device.monitorCharacteristicForService(HR_SERVICE, HR_MEASUREMENT, (error, ch) => {
        if (error || !ch?.value) return;
        const bytes = base64ToBytes(ch.value);
        onSample(parseHeartRateMeasurement(bytes));
      });
    },
    async readBattery(id) {
      try {
        const device = await manager.devices([id]).then((ds) => ds[0]);
        if (!device) return null;
        const ch = await device.readCharacteristicForService(BATTERY_SERVICE, BATTERY_LEVEL);
        if (!ch?.value) return null;
        return base64ToBytes(ch.value)[0] ?? null;
      } catch {
        return null;
      }
    },
    async disconnect() {
      connectEpoch++; // invalidates any in-flight connect
      teardown();
      const id = connectedId;
      connectedId = null;
      if (id) { try { await manager.cancelDeviceConnection(id); } catch { /* ignore */ } }
    },
    destroy() {
      connectEpoch++;
      teardown();
      try { manager.destroy(); } catch { /* ignore */ }
    },
  };
}

/** Singleton so scanning/connection survive sheet navigation. */
let singleton: BleManagerApi | null = null;
export function ble(): BleManagerApi {
  if (!singleton) singleton = createBle();
  return singleton;
}
