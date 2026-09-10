/**
 * "Steps have reached us at least once."
 *
 * The pacing strip's Connect mark is an accusation — it tells the user a
 * permission they may well have granted is not working — so the bar for
 * raising it has to be higher than "today has no step count yet". The journal
 * lookback in `stepsMissing` is the first line of that, and this is the
 * second: once a read has ever brought back a step count, the ask never
 * appears again on this install.
 *
 * It lives in the plaintext flags MMKV rather than in the journal for the
 * usual reason: it is device bookkeeping about a PERMISSION, not health data,
 * so it must not ride export/import and must survive "Clear all data" —
 * erasing a journal is not a request to be asked for steps again.
 *
 * Pure-ish shell, in the shape ./annualMemory and ./shapeMemory established:
 * one flag, cached in memory, silent on failure.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'pacingStepsSeen';

let kv: MMKV | null | undefined;
let mem: boolean | null = null;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** Has a health read ever answered this install with a step count? */
export function stepsEverSeen(): boolean {
  if (mem === null) {
    try { mem = store()?.getBoolean(KEY) ?? false; } catch { mem = false; }
  }
  return mem;
}

/** Remember that one has. Idempotent, and only ever called with a real count. */
export function noteStepsSeen(): void {
  if (mem === true) return;
  mem = true;
  try { store()?.set(KEY, true); } catch { /* in-memory only */ }
}
