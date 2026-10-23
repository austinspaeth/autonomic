/**
 * Polar Measurement Data (PMD): Polar's own GATT service, and the only way an
 * OPTICAL Polar device hands over beat-to-beat intervals.
 *
 * A chest strap puts its RR intervals in the standard Heart Rate Measurement
 * characteristic (0x2A37) and needs none of this. An optical band — the Polar
 * 360, Verity Sense, OH1 — does not reliably do so; Polar's answer is a PPI
 * (pulse-to-pulse interval) stream started over PMD, documented in the official
 * polar-ble-sdk and licensed for third-party use. This file is the wire format
 * and nothing else: pure, so the parser is tested without a radio. The manager
 * (`manager.ts`) does the talking.
 *
 * Two facts shape everything that consumes it:
 * - **PPI takes a while to start.** Polar documents ~25 s before the first batch
 *   on the Verity Sense, and gives no figure for the 360. The session therefore
 *   starts the stream the moment the band connects and holds Start until beats
 *   arrive, rather than padding the reading by a guessed number of seconds.
 * - **PPI is not available in Polar's "SDK mode"**, so we never enter it.
 */

export const PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
export const PMD_CONTROL = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8';
export const PMD_DATA = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8';

/** Measurement type ids, as the control point and the data frames spell them. */
export const PMD_TYPE_PPI = 3;

const OP_START = 0x02;
const OP_STOP = 0x03;
const FEATURES_READ = 0x0f;
const CP_RESPONSE = 0xf0;

/** Start a PPI stream. PPI takes no settings, so it is the opcode and the type. */
export const PPI_START = Uint8Array.of(OP_START, PMD_TYPE_PPI);
export const PPI_STOP = Uint8Array.of(OP_STOP, PMD_TYPE_PPI);

/** Control-point error codes we act on (the full list is in Polar's spec). */
export const PMD_OK = 0;
export const PMD_ALREADY_IN_STATE = 6;
export const PMD_INVALID_MTU = 10;
/** MTU to ask for when the device refuses the start over a small one. */
export const PMD_MTU = 232;

const PMD_ERRORS: Record<number, string> = {
  0: 'ok', 1: 'invalid-op', 2: 'invalid-type', 3: 'not-supported', 4: 'invalid-length',
  5: 'invalid-parameter', 6: 'already-on', 7: 'invalid-resolution', 8: 'invalid-rate',
  9: 'invalid-range', 10: 'invalid-mtu', 11: 'invalid-channels', 12: 'invalid-state', 13: 'in-charger',
};
export function pmdErrorName(code: number): string {
  return PMD_ERRORS[code] ?? `e${code}`;
}

/**
 * Does the device offer PPI? Read from the control point: byte 0 is the
 * features marker (0x0F), and from byte 1 on each bit is a measurement type.
 * A chest strap like the H10 has PMD for ECG and acceleration but no PPI bit,
 * which is what keeps it on the standard path it already works on.
 */
export function supportsPpi(features: Uint8Array): boolean {
  if (features.length < 2 || features[0] !== FEATURES_READ) return false;
  const byte = 1 + Math.floor(PMD_TYPE_PPI / 8);
  return byte < features.length && (features[byte] & (1 << (PMD_TYPE_PPI % 8))) !== 0;
}

export interface PmdResponse { op: number; type: number; error: number }

/** A control-point indication answering one of our writes, or null for any other packet. */
export function parseControlResponse(bytes: Uint8Array): PmdResponse | null {
  if (bytes.length < 4 || bytes[0] !== CP_RESPONSE) return null;
  return { op: bytes[1], type: bytes[2], error: bytes[3] };
}

/** One beat as Polar sends it. */
export interface PpiSample {
  hr: number;
  /** Pulse-to-pulse interval, ms. */
  ppMs: number;
  /** Polar's own error estimate for the interval, ms. */
  errorMs: number;
  /** Polar marks the interval unreliable (movement, poor contact). */
  blocker: boolean;
}

/** Frame header: type (1) + timestamp (8) + frame type (1). */
const HEADER = 10;
const SAMPLE = 6;

/**
 * Parse one PMD data notification into PPI samples. Returns null for anything
 * that is not an uncompressed PPI frame, so the caller can ignore it rather
 * than guess. The skin-contact bits are read past on purpose: Polar documents
 * them as "very unreliable" on PPI and says not to trust them.
 */
export function parsePpiFrame(bytes: Uint8Array): PpiSample[] | null {
  if (bytes.length < HEADER || bytes[0] !== PMD_TYPE_PPI) return null;
  const frameType = bytes[9];
  if (frameType & 0x80) return null; // compressed: PPI never is, and we cannot read it
  if ((frameType & 0x7f) !== 0) return null;
  const body = bytes.length - HEADER;
  if (body <= 0 || body % SAMPLE) return null;
  const out: PpiSample[] = [];
  for (let i = HEADER; i < bytes.length; i += SAMPLE) {
    out.push({
      hr: bytes[i],
      ppMs: bytes[i + 1] | (bytes[i + 2] << 8),
      errorMs: bytes[i + 3] | (bytes[i + 4] << 8),
      blocker: (bytes[i + 5] & 0x01) !== 0,
    });
  }
  return out;
}

/** Shortest and longest interval that can be a heartbeat (300 and 20 bpm). */
const PP_MIN = 200;
const PP_MAX = 3000;

/**
 * A frame's samples as the `{ hr, rr }` shape every strap sample already has,
 * so collection, artifact correction and the results card need no second path.
 *
 * Intervals Polar marks with the blocker bit are KEPT. Dropping one would
 * silently shorten the series by a beat and shift the timing of everything
 * after it, which the frequency-domain metrics read; the artifact correction
 * already finds and interpolates intervals that are out of line, which is what
 * a blocked one usually is. `blocked` reports how many there were.
 */
export function ppiToSample(samples: PpiSample[]): { hr: number; rr: number[]; blocked: number } {
  let hr = 0;
  let blocked = 0;
  const rr: number[] = [];
  for (const s of samples) {
    if (s.hr) hr = s.hr;
    if (s.ppMs < PP_MIN || s.ppMs > PP_MAX) continue;
    rr.push(s.ppMs);
    if (s.blocker) blocked++;
  }
  return { hr, rr, blocked };
}

/** How long a started PPI stream may stay silent before we give up on it. */
export const PPI_GIVE_UP_MS = 60_000;

/** Banded time to the first batch, for the fault route (a raw figure would make every report its own signature). */
export function warmupBand(ms: number): string {
  const s = ms / 1000;
  if (s < 15) return 'first<15s';
  if (s < 30) return 'first15-30s';
  if (s < 45) return 'first30-45s';
  return 'first45s+';
}

/** "Polar 360 1A2B3C4D" → "Polar 360". The serial is per-device and says nothing about the model. */
export function deviceModel(name: string | null | undefined): string {
  if (!name) return 'unknown';
  return name.replace(/\s+[0-9A-F]{6,}$/i, '').trim().slice(0, 32) || 'unknown';
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** ble-plx writes take base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

/** Does an advertisement list Polar's PMD service? */
export function advertisesPmd(uuids: string[] | null | undefined): boolean {
  return !!uuids?.some((u) => u.toLowerCase() === PMD_SERVICE);
}
