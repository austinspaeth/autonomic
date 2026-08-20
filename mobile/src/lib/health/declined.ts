/**
 * "The user deleted this health import" memory.
 *
 * The pill's `seen` memory (./updates) only says "we already offered this" and
 * expires after 48h. Deleting an imported entry is a stronger, permanent
 * signal: re-offering the same sample on the next pull-to-refresh reads as the
 * app arguing with the user. So every delete of an imported entry records its
 * health item key here, and the pill filters those out forever.
 *
 * Settings → Apple Health → "Check for updates" deliberately ignores this list
 * (same as it ignores `seen`): that screen is the "show me everything Health
 * has that the journal doesn't" escape hatch, and re-importing something you
 * once deleted should stay possible — just never automatic.
 *
 * Lives in the plaintext flags MMKV alongside the seen memory: opaque keys
 * only, must not ride export/import, and should survive "Erase journal" (a
 * wiped journal re-imports from Health, and the old declines no longer apply
 * to entries that no longer exist — but keeping them is the conservative,
 * never-nag direction). Bounded by count, not time, since the whole point is
 * that it outlives the 48h window.
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY_DECLINED = 'healthImportDeclined';
/** Keep the newest N declines; older ones fall off (their samples are long
 *  outside any check window anyway). */
const MAX_KEYS = 800;

let kv: MMKV | null | undefined;
let mem: string[] | null = null; // insertion-ordered, oldest first

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function load(): string[] {
  if (mem) return mem;
  let parsed: string[] = [];
  try {
    const raw = store()?.getString(KEY_DECLINED);
    if (raw) {
      const v = JSON.parse(raw) as unknown;
      if (Array.isArray(v)) parsed = v.filter((k): k is string => typeof k === 'string');
    }
  } catch { /* corrupt/missing — start clean */ }
  mem = parsed;
  return mem;
}

/** Every key the pill must never re-offer. */
export function getDeclinedKeys(): Set<string> {
  return new Set(load());
}

/** Remember that the user deleted these imported items. */
export function markDeclinedKeys(keys: string[]): void {
  const add = keys.filter(Boolean);
  if (!add.length) return;
  const next = load().filter((k) => !add.includes(k)).concat(add);
  mem = next.length > MAX_KEYS ? next.slice(next.length - MAX_KEYS) : next;
  try { store()?.set(KEY_DECLINED, JSON.stringify(mem)); } catch { /* in-memory only this session */ }
}

/** Test seam. */
export function resetDeclinedCache(): void { mem = null; }
