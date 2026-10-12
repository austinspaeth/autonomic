/**
 * A FAILED Garmin reading, described to the fault log — pure, unit-tested.
 *
 * The watch sends a `diag` message in place of a reading when a capture ran
 * long enough to count and produced too few beats to send (RrCollector.
 * diagPayload). It carries no beats and nothing about the person: the
 * hardware, the firmware, how long the sensor was given, whether it ever saw a
 * pulse, whether the activity session took, how many re-arms were spent, and
 * why the reading ended. Before this a watch that could not get a signal left
 * no trace anywhere: the reading was never sent, so the phone never knew an
 * attempt had happened, and the only evidence was a support email.
 *
 * It goes on the fault route rather than a ping for the same reason the
 * camera's refusals do (lib/hrv/refusal.ts): the message IS the signature, and
 * what we need is occurrences beside install-days split by the shape of the
 * failure. The shape here is the DEVICE and the FIRMWARE — "pulse, no beats,
 * on a fenix 7 on 15.x" is the row that says which watches the sensor's fast
 * mode fails to engage on — so the message leads with those and bands the
 * rest. Everything numeric is one or two digits or a dotted version, so
 * `redactMessage`'s four-digit rule leaves it alone.
 */

export const GARMIN_DIAG_TAG = 'garmin.noSignal';

export interface GarminDiag {
  reason: string;
  elapsedSec: number;
  measuredSec: number;
  count: number;
  callbacks: number;
  emptyCallbacks: number;
  nullCallbacks: number;
  hrSeen: boolean;
  rearms: number;
  recording: boolean;
  device: string;
  firmware: string;
  ciq: string;
}

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

function version(v: unknown): string {
  if (Array.isArray(v)) {
    const parts = v.map(num);
    return parts.length ? parts.join('.') : '?';
  }
  return typeof v === 'string' && v ? v : '?';
}

/** Validate + normalise. Null for anything that is not a diag message. */
export function parseGarminDiag(payload: Record<string, unknown>): GarminDiag | null {
  if (!payload || payload.type !== 'diag') return null;
  const schema = num(payload.schemaVersion);
  if (schema < 1 || schema > 1) return null;
  return {
    reason: typeof payload.reason === 'string' && payload.reason ? payload.reason : 'unknown',
    elapsedSec: num(payload.elapsedSec),
    measuredSec: num(payload.measuredSec),
    count: num(payload.count),
    callbacks: num(payload.callbacks),
    emptyCallbacks: num(payload.emptyCallbacks),
    nullCallbacks: num(payload.nullCallbacks),
    hrSeen: payload.hrSeen === true,
    rearms: num(payload.rearms),
    recording: payload.recording === true,
    device: typeof payload.device === 'string' && payload.device ? payload.device : '?',
    firmware: version(payload.firmware),
    ciq: version(payload.ciq),
  };
}

/**
 * What the sensor DID. The three cases need three different fixes, which is
 * why they are the first word after the device: `nopulse` is contact or wrist
 * heart rate switched off (the listener may be fine); `nobeats` is a pulse
 * with an empty interval array, the sensor's fast mode not engaging; `thin`
 * is beats that locked and then came too sparsely to reach the minimum.
 */
export function signalWord(d: GarminDiag): string {
  if (d.count > 0) return 'thin';
  if (d.hrSeen) return 'nobeats';
  return 'nopulse';
}

/** Did the listener call back at all? A dead listener and a sensor returning
 *  empty arrays want opposite fixes and look identical on the watch. */
export function feedWord(d: GarminDiag): string {
  if (d.callbacks === 0) return 'feed:none';
  if (d.emptyCallbacks >= d.callbacks) return 'feed:empty';
  return 'feed:ok';
}

/**
 * The fault message. `model` is the watch's name from Garmin Connect's linked
 * list when the receiver knows it (the part number is a catalogue code nobody
 * can read, and its digit run would be redacted anyway).
 */
export function garminDiagMessage(d: GarminDiag, model?: string | null): string {
  const dev = (model && model.trim()) || d.device;
  const fw = d.firmware === '?' ? '' : ` fw${d.firmware}`;
  return `${dev}${fw} ${signalWord(d)} ${feedWord(d)} ${d.reason}`
    + ` rec:${d.recording ? 'on' : 'off'} rearm${Math.min(d.rearms, 9)} ${elapsedBand(d.elapsedSec)}`;
}

/** How long the sensor was given. The watch gives up at 75s on its own, so
 *  the top band is "the app stopped it" and the two below are the user. */
export function elapsedBand(sec: number): string {
  if (!(sec >= 0)) return 'dur?';
  if (sec < 30) return 'dur<30';
  if (sec < 60) return 'dur30-60';
  return 'dur60+';
}
