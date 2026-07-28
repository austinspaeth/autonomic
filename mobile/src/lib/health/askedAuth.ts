/**
 * Once-per-permission-set memory for the health authorization request.
 *
 * The product rule: the app asks for its whole health permission set at most
 * once (at connect / onboarding, or the first entry point that needs it). After
 * that, entry paths (add-activity import card, update checks, watch sync) must
 * never surface a permission sheet again — only the explicit Connect buttons
 * may re-present (`requestAuth({ force: true })`).
 *
 * Keyed on the exact permission set, so shipping a NEW type in an app update
 * changes the key and legitimately prompts once more for the addition.
 *
 * Lives in the plaintext flags MMKV (same instance as the import-pill memory,
 * see ./updates.ts): device-local bookkeeping that must not ride export/import
 * and should survive "Erase journal".
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'healthAuthAskedSet';

let kv: MMKV | null | undefined;
let mem: string | null = null; // in-memory fallback + cache

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** Whether this exact permission set has already been presented to the user. */
export function hasAskedAuth(setKey: string): boolean {
  if (mem === null) {
    try { mem = store()?.getString(KEY) ?? ''; } catch { mem = ''; }
  }
  return mem === setKey;
}

/** Remember that this permission set's request has been presented. */
export function markAskedAuth(setKey: string): void {
  mem = setKey;
  try { store()?.set(KEY, setKey); } catch { /* in-memory only */ }
}
