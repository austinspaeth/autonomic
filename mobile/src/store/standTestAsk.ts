/**
 * "The pacing strip has asked for a stand test, and the reader tapped it."
 *
 * The stand-test Todo is shown until it is tapped ONCE. Tapping it opens the
 * test; walking away from that card is an answer — the reader looked at it and
 * chose not to — so it is never asked again, and the strip moves on to the
 * next Todo. A logged stand test retires it too, through the signature source,
 * without needing this.
 *
 * Plaintext flags MMKV, not the journal: it is about the person's choice, not
 * their data, so it does not ride export/import and survives "Clear all data".
 * Silent on failure (in-memory only).
 */
import { useSyncExternalStore } from 'react';
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'pacingStandTestAsked';

let kv: MMKV | null | undefined;
let mem: boolean | null = null;
const subs = new Set<() => void>();

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** Has the reader ever tapped the stand-test Todo? */
export function standTestAsked(): boolean {
  if (mem === null) {
    try { mem = store()?.getBoolean(KEY) ?? false; } catch { mem = false; }
  }
  return mem;
}

/** Retire the Todo. Idempotent. */
export function noteStandTestAsked(): void {
  if (standTestAsked()) return;
  mem = true;
  try { store()?.set(KEY, true); } catch { /* in-memory only */ }
  subs.forEach((cb) => cb());
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export function useStandTestAsked(): boolean {
  return useSyncExternalStore(subscribe, standTestAsked);
}
