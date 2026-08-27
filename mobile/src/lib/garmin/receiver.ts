/**
 * Garmin companion receiver — the JS side of the Connect IQ link.
 *
 * Deliberately a thin twin of ../watch/receiver.ts. Payloads from the Garmin
 * watch use the SAME contract as the Apple Watch (`mapWatchPayload`), so this
 * file owns transport and acknowledgement only, never a second interpretation
 * of a reading.
 *
 * The write order matters and matches the Apple Watch path exactly: sidecar
 * first, then the journal entry, then flush to disk, and only THEN ack. An
 * acked id is dropped from the watch's outbox and never re-sent, so acking
 * before the write is on disk would lose a reading to a crash in between.
 *
 * Unlike WatchConnectivity, `Communications.transmit` on the watch fails
 * outright when the phone is unreachable — so the watch queues and retries
 * until we ack. That makes a duplicate delivery normal rather than
 * exceptional: upserting by id is idempotent, and only a genuinely new
 * reading notifies listeners.
 */
import {
  GARMIN_URL_SCHEME,
  garminNative,
  onGarminDeviceStatus,
  onGarminMessage,
  type GarminDevice,
  type GarminMessage,
} from '../../../modules/garmin-link';
import * as ExpoLinking from 'expo-linking';
import { flushSave, getState, save, storeWaveform, upsertEntry } from '../../store/store';
import { logError } from '../diagnostics/errorLog';
import { computeScores } from '../scoring';
import type { Entry } from '../types';
import { mapWatchPayload } from '../watch/payload';

export type { GarminDevice };

let started = false;
let devices: GarminDevice[] = [];

type ArrivalListener = (dayKey: string, entry: Entry) => void;
const arrivalListeners = new Set<ArrivalListener>();

export function subscribeGarminArrivals(fn: ArrivalListener): () => void {
  arrivalListeners.add(fn);
  return () => { arrivalListeners.delete(fn); };
}

/** Anything that renders the device list needs to know when it changes — the
 *  list arrives asynchronously, long after the picker first rendered. */
type DeviceListener = (list: GarminDevice[]) => void;
const deviceListeners = new Set<DeviceListener>();

export function subscribeGarminDevices(fn: DeviceListener): () => void {
  deviceListeners.add(fn);
  return () => { deviceListeners.delete(fn); };
}

function setDevices(list: GarminDevice[]) {
  const gained = !devices.length && list.length > 0;
  devices = list;
  // Linking a watch IS choosing it. Persisting the preference means the choice
  // survives the sheet stack being rebuilt — which it is, because linking
  // round-trips through Garmin Connect and the app comes back fresh. Setting
  // only React state left the user looking at "Phone camera" selected moments
  // after they added a watch.
  if (gained) {
    getState().settings.lastHrvSource = 'garmin';
    save();
  }
  deviceListeners.forEach((fn) => fn(list));
}

export function garminDevices(): GarminDevice[] {
  return devices;
}

function receive(msg: GarminMessage) {
  const native = garminNative();
  if (!native) return;
  const deviceIdRaw = typeof msg.deviceId === 'string' ? msg.deviceId : null;
  const mapped = mapWatchPayload(msg as Record<string, unknown>);
  if (!mapped) {
    // ACK IT ANYWAY.
    //
    // The watch retries until acknowledged, which is right for a reading we
    // could not store — but wrong for one we will never accept. A capture that
    // produced no usable beats is not going to become valid on the tenth
    // attempt, so without this it retries forever, burning radio and battery
    // over a reading that is already lost.
    //
    // Rejection is still recorded: an unmappable payload means the watch and
    // the phone disagree about the contract, and that is worth knowing.
    const rejectedId = typeof msg.id === 'string' ? msg.id : null;
    logError('garmin.rejected', new Error(`unmappable payload ${String(msg.type)}`));
    if (deviceIdRaw && rejectedId) {
      native.ackMessage(deviceIdRaw, rejectedId).catch(() => {});
    }
    return;
  }

  const deviceId = deviceIdRaw;
  const existing = getState().days[mapped.dayKey]?.[mapped.section] || [];
  const fresh = !existing.some((e) => e.id === mapped.entry.id);

  if (mapped.waveform) storeWaveform(mapped.entry.id, mapped.waveform);
  if (mapped.section === 'readings') {
    const profile = getState().profile;
    mapped.entry.scores = computeScores(mapped.entry, { sex: profile?.sex, height: profile?.height });
  }
  upsertEntry(mapped.dayKey, mapped.section, mapped.entry);
  flushSave();

  // Only now is it safe to let the watch forget it. A failed ack simply means
  // the watch retries and we upsert the same id again.
  if (deviceId) {
    native.ackMessage(deviceId, mapped.entry.id).catch(() => {
      /* watch keeps it queued and retries — nothing to recover here */
    });
  }

  if (fresh && mapped.section === 'readings') {
    arrivalListeners.forEach((fn) => fn(mapped.dayKey, mapped.entry));
  }
}

/**
 * Ask for the device list.
 *
 * On iOS this opens Garmin Connect's picker and the chosen devices arrive later
 * through `handleGarminUrl`. On Android there is no picker — the SDK already
 * knows the paired devices — so the call is a no-op and `getDevices` answers
 * immediately. Callers should refresh from `garminDevices()` afterwards rather
 * than assuming either path.
 */
export async function pickGarminDevice(): Promise<GarminDevice[]> {
  const native = garminNative();
  if (!native) return [];
  try {
    await native.showDeviceSelection();
    // Android answers immediately; on iOS the real answer arrives later through
    // the URL callback, so this returns whatever is already known.
    const list = await native.getDevices();
    if (list.length) setDevices(list);
    await Promise.all(list.map((d) => native.startListening(d.id)));
    return list;
  } catch (e) {
    logError('garmin.pick', e);
    return [];
  }
}

/** Feed the URL Garmin Connect returns to us (from expo-linking). */
export async function handleGarminUrl(url: string): Promise<GarminDevice[]> {
  const native = garminNative();
  if (!native || !url.startsWith(`${GARMIN_URL_SCHEME}:`)) return [];
  try {
    const found = await native.handleUrl(url);
    if (found.length) setDevices(found);
    await Promise.all(found.map((d) => native.startListening(d.id)));
    return found;
  } catch (e) {
    logError('garmin.handleUrl', e);
    return [];
  }
}

/** Call once at app start, alongside initWatchReceiver. No-op without the module. */
export function initGarminReceiver() {
  if (started) return;
  started = true;
  const native = garminNative();
  if (!native) return;

  onGarminMessage((msg) => {
    try {
      receive(msg);
    } catch (e) {
      // A malformed payload must never take down the listener, or every later
      // reading is lost too.
      logError('garmin.receive', e);
    }
  });

  onGarminDeviceStatus((e) => {
    setDevices(devices.map((d) => (d.id === e.id ? { ...d, status: e.status, connected: e.connected } : d)));
  });

  // THE CALLBACK. Garmin Connect returns the chosen devices by opening our URL
  // scheme; without this listener the selection is simply discarded and the
  // picker looks like it did nothing at all.
  void ExpoLinking.getInitialURL().then((url) => { if (url) void handleGarminUrl(url); });
  ExpoLinking.addEventListener('url', (e) => { void handleGarminUrl(e.url); });

  native
    .initialize(GARMIN_URL_SCHEME)
    .then(() => native.getDevices())
    .then((list) => {
      setDevices(list);
      // Re-attach to devices paired in a previous session, so a reading queued
      // on the watch can drain without the user re-picking.
      return Promise.all(list.map((d) => native.startListening(d.id)));
    })
    .catch((e) => logError('garmin.init', e));
}
