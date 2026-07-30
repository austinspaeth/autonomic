/**
 * Pure helpers for the discovered-strap list. Split from `manager.ts` so they
 * can be unit-tested — the manager imports `react-native` at module scope and
 * cannot be loaded under jest.
 */

/** `connected` marks a strap the OS already holds a link to (paired in system
 *  Bluetooth settings, or open in another app) rather than one we saw
 *  advertising — it has no meaningful RSSI and needs different copy. */
export interface BleDevice { id: string; name: string; rssi: number; connected?: boolean }

/** Already-linked straps first (they're the surest bet), then strongest signal. */
export function sortDevices(list: BleDevice[]): BleDevice[] {
  return [...list].sort((a, b) => Number(!!b.connected) - Number(!!a.connected) || b.rssi - a.rssi);
}
