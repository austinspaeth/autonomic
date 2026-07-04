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

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

export interface BleDevice { id: string; name: string; rssi: number }
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

  const waitReady = () => new Promise<void>((resolve) => {
    const sub = manager.onStateChange((s) => { if (s === State.PoweredOn) { sub.remove(); resolve(); } }, true);
  });

  return {
    available: true,
    async requestPermissions() {
      if (Platform.OS === 'android') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PermissionsAndroid } = require('react-native');
        const perms = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ].filter(Boolean);
        const res = await PermissionsAndroid.requestMultiple(perms);
        return Object.values(res).every((v) => v === 'granted');
      }
      await waitReady();
      return true;
    },
    async scan(onFound) {
      await waitReady();
      const seen = new Set<string>();
      manager.startDeviceScan([HR_SERVICE], { allowDuplicates: false }, (error, device) => {
        if (error || !device) return;
        if (seen.has(device.id)) return;
        seen.add(device.id);
        onFound({ id: device.id, name: device.name || device.localName || 'Unknown strap', rssi: device.rssi || -100 });
      });
    },
    stopScan() { try { manager.stopDeviceScan(); } catch { /* ignore */ } },
    async connect(id, onSample, onDisconnect) {
      manager.stopDeviceScan();
      const device = await manager.connectToDevice(id, { requestMTU: 64 });
      await device.discoverAllServicesAndCharacteristics();
      connectedId = id;
      disconnectSub = manager.onDeviceDisconnected(id, () => { connectedId = null; onDisconnect(); });
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
      try { monitorSub?.remove(); disconnectSub?.remove(); if (connectedId) await manager.cancelDeviceConnection(connectedId); } catch { /* ignore */ }
      connectedId = null;
    },
    destroy() { try { monitorSub?.remove(); disconnectSub?.remove(); manager.destroy(); } catch { /* ignore */ } },
  };
}

/** Singleton so scanning/connection survive sheet navigation. */
let singleton: BleManagerApi | null = null;
export function ble(): BleManagerApi {
  if (!singleton) singleton = createBle();
  return singleton;
}
