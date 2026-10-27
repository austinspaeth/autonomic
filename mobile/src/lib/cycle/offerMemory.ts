/**
 * "Not for me" on the cycle opt-in card. Plaintext flags MMKV beside the other
 * person-level memories: one boolean, never exported, survives Clear all data.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'cycleOfferDismissed';

let kv: MMKV | null | undefined;
let mem = false;
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function cycleOfferDismissed(): boolean {
  try { return store()?.getBoolean(KEY) ?? mem; } catch { return mem; }
}

export function dismissCycleOffer(): void {
  mem = true;
  try { store()?.set(KEY, true); } catch { /* in-memory for this session */ }
}

/* The heavy-flow note's "Not now", the same shape. */
const HEAVY_KEY = 'cycleHeavyNoteDismissed';
let heavyMem = false;
export function heavyNoteDismissed(): boolean {
  try { return store()?.getBoolean(HEAVY_KEY) ?? heavyMem; } catch { return heavyMem; }
}
export function dismissHeavyNote(): void {
  heavyMem = true;
  try { store()?.set(HEAVY_KEY, true); } catch { /* in-memory for this session */ }
}
