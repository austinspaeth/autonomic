/**
 * Persistence for the logs-read throttle (./logsSweep).
 *
 * Plaintext `autonomic.flags` MMKV, the same instance as ./askedAuth and the
 * import pill's seen keys: device pacing that must not ride export/import. It
 * is only a throttle, so losing it costs one extra sweep and nothing else —
 * which is why it also has no reason to be reset by "Clear all data".
 */
import { MMKV } from 'react-native-mmkv';
import { emptyLogsSweepMemory, type LogsSweepMemory } from './logsSweep';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'healthLogsSweep';

let kv: MMKV | null | undefined;
let mem: string | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

export function logsSweepMemory(): LogsSweepMemory {
  let raw = mem;
  try { raw = store()?.getString(KEY) ?? mem; } catch { /* in-memory only */ }
  if (!raw) return emptyLogsSweepMemory();
  try {
    const p = JSON.parse(raw) as LogsSweepMemory;
    const at = Number(p?.at);
    return {
      ...(p?.dk ? { dk: String(p.dk) } : null),
      ...(Number.isFinite(at) ? { at } : null),
    };
  } catch { return emptyLogsSweepMemory(); }
}

export function saveLogsSweepMemory(next: LogsSweepMemory): void {
  const raw = JSON.stringify(next);
  mem = raw;
  try { store()?.set(KEY, raw); } catch { /* in-memory only */ }
}
