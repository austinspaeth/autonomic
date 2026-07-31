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
import { bluetoothMessage, looksLikeStrap, type BleDevice, type BleDiagnostics, type BleReadiness, type BleScanRecord } from './devices';
import { androidApiLevel, appInfo, describeError, platformInfo } from '../diagnostics/env';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

export type { BleDevice, BleDiagnostics, BleReadiness } from './devices';
export interface HrSample { hr: number; rr: number[] }

/** Long enough to catch a strap advertising on a slow interval, short enough
 *  that someone holding the phone waits it out. */
const DIAGNOSTIC_SCAN_MS = 8000;

/** How long to let a `Unknown`/`Resetting` adapter settle before reporting it.
 *  Long enough for a cold CoreBluetooth/Android stack, short enough that a tap
 *  on Scan still feels like it did something. */
const READY_TIMEOUT_MS = 4000;

export interface BleManagerApi {
  available: boolean;
  /** Can this phone scan right now, and if not, what should the user be told?
   *  Always settles — call it before scanning so a dead adapter produces copy
   *  on screen instead of a button that does nothing. */
  ready(): Promise<BleReadiness>;
  requestPermissions(): Promise<boolean>;
  scan(onFound: (d: BleDevice) => void): Promise<void>;
  stopScan(): void;
  connect(id: string, onSample: (s: HrSample) => void, onDisconnect: () => void): Promise<void>;
  readBattery(id: string): Promise<number | null>;
  disconnect(): Promise<void>;
  destroy(): void;
  /** Collect everything needed to diagnose "it won't find my strap" from a
   *  user's phone. Never throws and never short-circuits: a denied permission
   *  or a powered-off adapter is the answer, not a reason to stop. */
  diagnose(saved?: { id?: string; name?: string }): Promise<BleDiagnostics>;
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

const HR_SHORT = '180d';
function advertisesHeartRate(uuids: string[] | null | undefined): boolean {
  return !!uuids?.some((u) => {
    const s = u.toLowerCase();
    return s === HR_SHORT || s.startsWith(`0000${HR_SHORT}`);
  });
}

/** ble-plx `Device` → report row. Keeps the real id/name; `formatDiagnostics`
 *  is the single place that decides what a shared dump may reveal. */
function toRecord(d: {
  id: string; name?: string | null; localName?: string | null; rssi?: number | null;
  txPowerLevel?: number | null; isConnectable?: boolean | null; serviceUUIDs?: string[] | null;
}): BleScanRecord {
  const heartRate = advertisesHeartRate(d.serviceUUIDs);
  return {
    id: d.id,
    name: d.name ?? null,
    localName: d.localName ?? null,
    rssi: d.rssi ?? null,
    txPower: d.txPowerLevel ?? null,
    isConnectable: d.isConnectable ?? null,
    serviceUUIDs: d.serviceUUIDs ?? null,
    heartRate,
    identified: heartRate || looksLikeStrap(d.name ?? d.localName),
  };
}

const stub: BleManagerApi = {
  available: false,
  async ready() {
    return { ok: false, state: 'NativeModuleMissing', message: 'This build has no Bluetooth support, so straps cannot be found.' };
  },
  async requestPermissions() { return false; },
  async scan() { /* no-op */ },
  stopScan() { /* no-op */ },
  async connect() { throw new Error('Bluetooth is not available in this build.'); },
  async readBattery() { return null; },
  async disconnect() { /* no-op */ },
  destroy() { /* no-op */ },
  async diagnose(saved) {
    return {
      at: new Date().toISOString(),
      app: appInfo(),
      platform: platformInfo(),
      adapter: { available: false, state: 'NativeModuleMissing' },
      permissions: {},
      requires: [],
      scan: { ms: 0, error: 'Bluetooth is not available in this build.', started: false, devices: [] },
      connectedError: null,
      connected: [],
      saved: { id: saved?.id ?? null, name: saved?.name ?? null },
      notes: ['The native Bluetooth module is missing — this is Expo Go or a build without react-native-ble-plx.'],
    };
  },
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

  // Resolve with whatever the adapter settles on, and ALWAYS resolve. Waiting
  // only for PoweredOn hangs forever on a phone with Bluetooth switched off, a
  // denied permission, or a simulator — and every caller awaits this before
  // touching UI state, so the whole screen went dead with nothing to read.
  // `Unknown`/`Resetting` are the only states worth waiting through; they are
  // transient, so they get the timeout rather than an immediate verdict.
  const waitReady = () => new Promise<string>((resolve) => {
    let sub: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = (state: string) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      // Deferred: onStateChange(_, true) may emit before `sub` is assigned.
      setTimeout(() => { try { sub?.remove(); } catch { /* ignore */ } }, 0);
      resolve(state);
    };
    timer = setTimeout(() => finish(String(State.Unknown)), READY_TIMEOUT_MS);
    try {
      sub = manager.onStateChange((s) => {
        const state = String(s);
        if (state !== String(State.Unknown) && state !== String(State.Resetting)) finish(state);
      }, true);
    } catch (e) {
      finish(`unreadable (${describeError(e)})`);
    }
    if (done) { try { sub?.remove(); } catch { /* ignore */ } }
  });

  return {
    available: true,
    async ready() {
      const state = await waitReady();
      return { ok: state === String(State.PoweredOn), state, message: bluetoothMessage(state) };
    },
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
      return (await waitReady()) === String(State.PoweredOn);
    },
    async scan(onFound) {
      // A scan started against an adapter that isn't on returns nothing and
      // reports no error, which reads as "no straps here" — refuse instead.
      if ((await waitReady()) !== String(State.PoweredOn)) return;
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
    async diagnose(saved) {
      const notes: string[] = [];

      // Read the adapter rather than waiting for it: waitReady() never resolves
      // while Bluetooth is off, and "off" is a diagnosis we want to report.
      let state = 'Unknown';
      try { state = String(await manager.state()); } catch (e) { state = `unreadable (${describeError(e)})`; }

      // check(), not request() — a dump must observe the current grant, not
      // change it. A prompt here would also rewrite the very state we're reporting.
      const permissions: Record<string, string> = {};
      let requires: string[] = [];
      if (Platform.OS === 'android') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PermissionsAndroid } = require('react-native');
        const api = androidApiLevel();
        requires = api >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        const all = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];
        for (const perm of all) {
          try { permissions[perm] = (await PermissionsAndroid.check(perm)) ? 'granted' : 'denied'; }
          catch (e) { permissions[perm] = `unreadable (${describeError(e)})`; }
        }
        if (api < 31) {
          notes.push('Android 11 or below: BLE scanning is treated as location access, so the system Location toggle must be ON or the OS returns zero results with no error.');
        }
        for (const need of requires) {
          if (permissions[need] !== 'granted') notes.push(`${need} is not granted — scans cannot return results.`);
        }
      }

      // Unfiltered: the whole point is to separate "we see nothing at all"
      // (phone-side) from "we see plenty, just not a strap" (strap-side).
      // The normal scan filters on 0x180D and so cannot tell those apart.
      const seen = new Map<string, BleScanRecord>();
      let scanError: string | null = null;
      let started = false;
      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      try {
        manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
          if (error) { scanError = scanError ?? describeError(error); return; }
          if (device && !seen.has(device.id)) seen.set(device.id, toRecord(device));
        });
        started = true;
      } catch (e) {
        scanError = describeError(e);
      }
      if (started) await new Promise((r) => setTimeout(r, DIAGNOSTIC_SCAN_MS));
      try { manager.stopDeviceScan(); } catch { /* ignore */ }

      let connectedError: string | null = null;
      let connected: BleScanRecord[] = [];
      try { connected = (await manager.connectedDevices([HR_SERVICE])).map(toRecord); }
      catch (e) { connectedError = describeError(e); }

      const devices = [...seen.values()].sort((a, b) => Number(b.heartRate) - Number(a.heartRate) || (b.rssi ?? -127) - (a.rssi ?? -127));
      if (state !== 'PoweredOn') notes.push(`Adapter state is ${state}. Scans only return results while PoweredOn.`);
      if (started && !devices.length && !scanError) {
        notes.push('Zero advertisements of any kind. In a normal room this is close to impossible, so suspect the phone (permissions, Location toggle) rather than the strap.');
      }
      if (devices.length && !devices.some((d) => d.heartRate)) {
        notes.push('Scanning works, but nothing nearby advertises the 0x180D heart-rate service. A strap that is off, dry, unworn, or already connected to another phone will not advertise.');
      }

      return {
        at: new Date().toISOString(),
        app: appInfo(),
        platform: platformInfo(),
        adapter: { available: true, state },
        permissions,
        requires,
        scan: { ms: DIAGNOSTIC_SCAN_MS, error: scanError, started, devices },
        connectedError,
        connected,
        saved: { id: saved?.id ?? null, name: saved?.name ?? null },
        notes,
      };
    },
  };
}

/** Singleton so scanning/connection survive sheet navigation. */
let singleton: BleManagerApi | null = null;
export function ble(): BleManagerApi {
  if (!singleton) singleton = createBle();
  return singleton;
}
