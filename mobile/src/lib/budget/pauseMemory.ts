/**
 * The shell for ./pause: which days the budget was paused on, and which days
 * the reader asked to see anyway.
 *
 * Flags MMKV, in the ./stepsMemory shape. It is device bookkeeping about what
 * the app SHOWED and what the reader CHOSE, not health data, so it must not
 * ride export/import — an imported journal's paused run says nothing about
 * this phone. Unlike most flags it IS cleared by "Clear all data": both lists
 * are claims about days in a journal that no longer exists, the rule
 * `resetTrendMemory` and `setInsightsAnchor(null)` already follow.
 *
 * Note the ceiling has no memory file and must not grow one — it is a pure
 * function of history. Neither of these lists reaches it: they decide only
 * whether a number is DRAWN, never what the number is.
 */
import { MMKV } from 'react-native-mmkv';
import { notePaused, PAUSE_MEMORY_DAYS } from './pause';

const FLAGS_ID = 'autonomic.flags';
const KEY_PAUSED = 'pacingPausedDays';
const KEY_SHOWN = 'pacingUnpausedDays';

let kv: MMKV | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

function readList(key: string): string[] {
  try {
    const raw = store()?.getString(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function writeList(key: string, v: string[]): void {
  try { store()?.set(key, JSON.stringify(v)); } catch { /* in-memory only */ }
}

/** Days the strip actually drew a paused budget on. */
export function pausedDays(): string[] { return readList(KEY_PAUSED); }

/** Remember that today was one. Idempotent. */
export function notePausedDay(dk: string): void {
  const next = notePaused(pausedDays(), dk);
  if (next.length !== pausedDays().length) writeList(KEY_PAUSED, next);
}

/** Days the reader asked to see the number on. */
export function unpausedDays(): string[] { return readList(KEY_SHOWN); }

export function isUnpausedDay(dk: string): boolean { return unpausedDays().includes(dk); }

/** The reader's per-day choice, both ways. */
export function setUnpausedDay(dk: string, on: boolean): void {
  const cur = unpausedDays();
  if (on === cur.includes(dk)) return;
  writeList(KEY_SHOWN, on ? [...cur, dk].slice(-PAUSE_MEMORY_DAYS) : cur.filter((k) => k !== dk));
}

/** Both lists describe days in the journal, so both go with it. */
export function resetPauseMemory(): void {
  try { store()?.delete(KEY_PAUSED); store()?.delete(KEY_SHOWN); } catch { /* ignore */ }
}
