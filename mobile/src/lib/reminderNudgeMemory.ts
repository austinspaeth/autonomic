/**
 * Persistence for the reading-complete reminder offer (./reminderNudge).
 *
 * Plaintext `autonomic.flags` MMKV, the same rules as every other pacing
 * memory in the app: it is bookkeeping about what THIS install has shown, so it
 * must not ride export/import, and it survives "Clear all data" — erasing the
 * journal is not a request to be asked again by something already refused
 * twice.
 */
import { MMKV } from 'react-native-mmkv';
import { emptyNudgeMemory, type NudgeMemory } from './reminderNudge';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'reminderNudge';

let kv: MMKV | null | undefined;
let memValue: string | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function nudgeMemory(): NudgeMemory {
  let raw = memValue;
  try { raw = store()?.getString(KEY) ?? memValue; } catch { /* in-memory */ }
  if (!raw) return emptyNudgeMemory();
  try {
    const parsed = JSON.parse(raw) as NudgeMemory;
    return {
      dismissed: Number.isFinite(parsed.dismissed) ? parsed.dismissed : 0,
      since: Number.isFinite(parsed.since) ? parsed.since : 0,
    };
  } catch {
    return emptyNudgeMemory();
  }
}

export function writeNudgeMemory(m: NudgeMemory): void {
  const raw = JSON.stringify(m);
  memValue = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only this session */ }
}
