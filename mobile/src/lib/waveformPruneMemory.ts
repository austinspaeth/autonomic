/**
 * When the orphan sweep last ran. The rule is `waveformPrune.ts`; this is its
 * flags-MMKV shell.
 *
 * Plaintext `autonomic.flags`, not the journal: it is a fact about this
 * device's storage rather than about the user's data, so it must not ride an
 * export, and it may survive "Clear all data" — which empties the sidecar
 * itself and leaves nothing to sweep anyway.
 *
 * Silent on failure, and a failure reads as "never swept", never as "swept just
 * now": the clock may delay the sweep, but it may not be the reason a device
 * full of strays is skipped for ever.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'waveformPrunedAt';

let kv: MMKV | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** Epoch ms of the last sweep, or null. */
export function lastPruneAt(): number | null {
  try {
    const n = store()?.getNumber(KEY);
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Stamp a sweep. Called BEFORE it runs, not after: a sweep that throws, or
 *  takes the process down with it, must not be retried on every launch. */
export function noteWaveformPrune(at = Date.now()): void {
  try { store()?.set(KEY, at); } catch { /* in-memory only — next launch retries */ }
}
