/**
 * How many launches have tried to read an erased journal's days back
 * (./restore). Flags MMKV, in the ./stepsMemory shape: device bookkeeping about
 * a repair, not health data, so it never rides export/import.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'pacingRestoreAttempts';
/** Its own counter, not a share of the one above: the two repairs are due on
 *  different phones and for different reasons, and a journal that spent its
 *  attempts on one must still be able to run the other. */
const STEP_KEY = 'pacingRestepAttempts';

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

/** The same count for the step re-read (`misreadStepDays`). */
export function restepAttempts(): number {
  try { return store()?.getNumber(STEP_KEY) ?? 0; } catch { return 0; }
}

export function noteRestepAttempt(): void {
  try { store()?.set(STEP_KEY, restepAttempts() + 1); } catch { /* in-memory only: retried next launch */ }
}
