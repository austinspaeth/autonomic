/**
 * What the pacing alerts have already said today.
 *
 * Plaintext flags MMKV, beside ./stepsMemory: it is bookkeeping about the
 * DEVICE's notifications, not health data, so it never rides export/import.
 * "Clear all data" does reset it (`resetAlertMemory`), since a fired alert is
 * a claim about a day in the journal being erased.
 *
 * Stamped BEFORE the notification is scheduled, the same order the review ask
 * uses: a schedule that fails after the stamp loses one alert, and the other
 * order can send two.
 */
import { MMKV } from 'react-native-mmkv';
import type { AlertMemory, PacingAlertKind } from './alerts';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'pacingAlertMemory';

let kv: MMKV | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function readAlertMemory(): AlertMemory | null {
  try {
    const raw = store()?.getString(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as AlertMemory;
    return m && typeof m.dk === 'string' && m.fired && typeof m.fired === 'object' ? m : null;
  } catch {
    return null;
  }
}

export function noteAlertFired(dk: string, kind: PacingAlertKind, at: number): void {
  const prev = readAlertMemory();
  const fired = prev && prev.dk === dk ? { ...prev.fired } : {};
  fired[kind] = [...(fired[kind] || []), at];
  try { store()?.set(KEY, JSON.stringify({ dk, fired })); } catch { /* best-effort */ }
}

export function resetAlertMemory(): void {
  try { store()?.delete(KEY); } catch { /* best-effort */ }
}
