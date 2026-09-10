/**
 * How many launches have tried to read an erased journal's days back
 * (./restore). Flags MMKV, in the ./stepsMemory shape: device bookkeeping about
 * a repair, not health data, so it never rides export/import.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'pacingRestoreAttempts';

let kv: MMKV | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function restoreAttempts(): number {
  try { return store()?.getNumber(KEY) ?? 0; } catch { return 0; }
}

export function noteRestoreAttempt(): void {
  try { store()?.set(KEY, restoreAttempts() + 1); } catch { /* in-memory only: retried next launch */ }
}
