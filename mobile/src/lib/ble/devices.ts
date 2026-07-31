/**
 * Pure helpers for the discovered-strap list and the Bluetooth diagnostics
 * dump. Split from `manager.ts` so they can be unit-tested — the manager
 * imports `react-native` at module scope and cannot be loaded under jest.
 */

/** `connected` marks a strap the OS already holds a link to (paired in system
 *  Bluetooth settings, or open in another app) rather than one we saw
 *  advertising — it has no meaningful RSSI and needs different copy. */
export interface BleDevice { id: string; name: string; rssi: number; connected?: boolean }

/** Already-linked straps first (they're the surest bet), then strongest signal. */
export function sortDevices(list: BleDevice[]): BleDevice[] {
  return [...list].sort((a, b) => Number(!!b.connected) - Number(!!a.connected) || b.rssi - a.rssi);
}

/** What the adapter reported, and what a scan is allowed to do about it. */
export interface BleReadiness { ok: boolean; state: string; message: string | null }

/** Plain-language reason a scan cannot run, or null when it can. The adapter
 *  being off, unauthorized or absent is an ANSWER the user can act on, not a
 *  condition to wait out — waiting silently is what made "Scan" look dead. */
export function bluetoothMessage(state: string): string | null {
  switch (state) {
    case 'PoweredOn': return null;
    case 'PoweredOff': return 'Bluetooth is off. Turn it on, then scan again.';
    case 'Unauthorized': return 'Autonomic is not allowed to use Bluetooth. Turn it on for Autonomic in system Settings.';
    case 'Unsupported': return 'This device has no Bluetooth radio, so straps cannot be found. The simulator is the usual reason you see this.';
    case 'Resetting': return 'Bluetooth is restarting. Try again in a moment.';
    default: return 'Bluetooth is not responding. Try again in a moment.';
  }
}

/* ---------- diagnostics ---------- */

/** Names worth showing in full in a dump the user emails to support. Anything
 *  else nearby is a stranger's headphones or car and gets redacted — the count
 *  alone proves scanning works, which is all the diagnosis needs. */
const STRAP_NAME = /polar|h10|h9|hrm|tickr|wahoo|coospo|garmin|magene|decathlon|kyto|scosche|rhythm|chest|heart/i;

export function looksLikeStrap(name?: string | null): boolean {
  return !!name && STRAP_NAME.test(name);
}

/** One advertisement seen during the unfiltered diagnostic scan. */
export interface BleScanRecord {
  id: string;
  name: string | null;
  localName: string | null;
  rssi: number | null;
  txPower: number | null;
  isConnectable: boolean | null;
  serviceUUIDs: string[] | null;
  /** Advertises the 0x180D Heart Rate service — i.e. our normal filtered scan
   *  would have found it. The single most valuable bit in the whole report. */
  heartRate: boolean;
  /** False for strangers' devices, whose name and id are withheld. */
  identified: boolean;
}

export interface BleDiagnostics {
  at: string;
  app: Record<string, string | number | boolean | null>;
  platform: Record<string, string | number | boolean | null>;
  adapter: { available: boolean; state: string };
  /** Android only: what the OS says we hold right now, and what we ask for. */
  permissions: Record<string, string>;
  requires: string[];
  scan: {
    ms: number;
    /** The error our normal scan swallows at the callback. */
    error: string | null;
    started: boolean;
    devices: BleScanRecord[];
  };
  connectedError: string | null;
  connected: BleScanRecord[];
  saved: { id: string | null; name: string | null };
  notes: string[];
}

const yn = (v: boolean | null | undefined) => (v == null ? '?' : v ? 'yes' : 'no');

function line(label: string, value: unknown): string {
  return `  ${label.padEnd(22)}${value == null || value === '' ? '—' : String(value)}`;
}

function recordLines(d: BleScanRecord, i: number): string[] {
  const head = d.identified ? `${d.name || d.localName || 'unnamed'}` : `(redacted device ${i + 1})`;
  const out = [
    `  ${d.heartRate ? '♥' : ' '} ${head}`,
    `      id            ${d.identified ? d.id : '(withheld)'}`,
    `      rssi          ${d.rssi == null ? '—' : `${d.rssi} dBm`}${d.txPower == null ? '' : `  txPower ${d.txPower}`}`,
    `      heart-rate    ${yn(d.heartRate)}   connectable ${yn(d.isConnectable)}`,
  ];
  if (d.serviceUUIDs?.length) out.push(`      services      ${d.serviceUUIDs.join(', ')}`);
  else out.push('      services      none advertised');
  return out;
}

/**
 * Render the dump as plain text for the copy/share box. Deliberately readable
 * rather than JSON — it gets pasted into an email by a user who is already
 * having a bad time, and read by whoever answers it.
 */
export function formatDiagnostics(d: BleDiagnostics): string {
  const hr = d.scan.devices.filter((x) => x.heartRate);
  const out: string[] = [];

  out.push('AUTONOMIC — BLUETOOTH DIAGNOSTICS', d.at, '');

  out.push('VERDICT');
  if (!d.adapter.available) out.push('  Bluetooth module is not present in this build.');
  else if (d.adapter.state !== 'PoweredOn') out.push(`  Bluetooth adapter is ${d.adapter.state}, not PoweredOn.`);
  else if (!d.scan.started) out.push(`  Scan never started: ${d.scan.error || 'unknown error'}`);
  // An already-connected strap counts as a find: it is the one case where an
  // empty advertising scan is expected rather than a symptom.
  else if (!d.scan.devices.length && !d.connected.length) out.push('  Scan ran but saw NOTHING at all — not one device. Phone-side problem: permissions, or (Android 11 and below) the Location toggle.');
  else if (!hr.length && !d.connected.length) out.push(`  Scan is working (${d.scan.devices.length} devices seen) but no heart-rate strap is broadcasting. Strap-side problem: not worn, dry electrodes, flat battery, or held by another phone.`);
  else out.push(`  ${hr.length} heart-rate device(s) advertising, ${d.connected.length} already connected to this phone.`);
  out.push('');

  out.push('APP');
  for (const [k, v] of Object.entries(d.app)) out.push(line(k, v));
  out.push('', 'PLATFORM');
  for (const [k, v] of Object.entries(d.platform)) out.push(line(k, v));

  out.push('', 'ADAPTER');
  out.push(line('native module', yn(d.adapter.available)));
  out.push(line('state', d.adapter.state));

  if (Object.keys(d.permissions).length) {
    out.push('', 'PERMISSIONS');
    for (const [k, v] of Object.entries(d.permissions)) out.push(line(k.replace('android.permission.', ''), v));
    out.push(line('we request', d.requires.map((r) => r.replace('android.permission.', '')).join(', ')));
  }

  out.push('', `SCAN (unfiltered, ${d.scan.ms} ms)`);
  out.push(line('started', yn(d.scan.started)));
  out.push(line('error', d.scan.error));
  out.push(line('devices seen', d.scan.devices.length));
  out.push(line('heart-rate ads', hr.length));
  if (d.scan.devices.length) {
    out.push('');
    d.scan.devices.forEach((rec, i) => out.push(...recordLines(rec, i)));
  }

  out.push('', 'ALREADY CONNECTED (0x180D)');
  out.push(line('error', d.connectedError));
  if (d.connected.length) d.connected.forEach((rec, i) => out.push(...recordLines(rec, i)));
  else out.push('  none');

  out.push('', 'SAVED DEVICE');
  out.push(line('id', d.saved.id));
  out.push(line('name', d.saved.name));

  if (d.notes.length) {
    out.push('', 'NOTES');
    for (const n of d.notes) out.push(`  · ${n}`);
  }

  return out.join('\n');
}
