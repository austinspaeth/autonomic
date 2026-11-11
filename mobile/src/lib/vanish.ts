/**
 * "This install's journal vanished, and nothing has put it back yet."
 *
 * Set when launch finds an EMPTY journal while daily snapshots sit on disk
 * (see RestoreGate): a fresh install cannot produce that pair, so it is the one
 * clean signature of a journal that existed and was lost. Cleared the moment a
 * snapshot is restored, or an import or a real day of logging puts data back.
 *
 * It exists for one job: while it is set, `runDailyBackup` writes new snapshots
 * but DELETES NONE. Rotation is the danger here, not the writing. `KEEP` is 5,
 * so a user who loses their journal, taps "Start fresh" and logs one thing a
 * day has every good snapshot rotated out within five days — the recovery path
 * quietly eating itself while the app looks like it is working.
 *
 * Plaintext flags MMKV, not the journal: it is a fact about this device's
 * storage, not about the user's data, so it must survive the very event it
 * describes and must never ride an export. Silent on failure (in-memory only).
 */
import { MMKV } from 'react-native-mmkv';

const FLAGS_ID = 'autonomic.flags';
const KEY = 'journalVanishedAt';

let kv: MMKV | null | undefined;
let mem: string | null | undefined;

function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}

/** ISO instant the vanish was seen, or null. */
export function journalVanishedAt(): string | null {
  if (mem === undefined) {
    try { mem = store()?.getString(KEY) ?? null; } catch { mem = null; }
  }
  return mem ?? null;
}

/** Is a vanish still unresolved? While true, snapshots are never rotated out. */
export const journalVanished = (): boolean => journalVanishedAt() != null;

/** Record that launch found an empty journal beside existing snapshots.
 *  Keeps the FIRST instant — the clock that matters is when the data went, not
 *  how many times the user has reopened the app since. */
export function noteJournalVanished(at = new Date().toISOString()): void {
  if (journalVanished()) return;
  mem = at;
  try { store()?.set(KEY, at); } catch { /* in-memory only */ }
}

/** The journal is back (a snapshot restored, an import, or real data logged).
 *  Rotation resumes on the next daily backup. Idempotent. */
export function clearJournalVanished(): void {
  if (!journalVanished()) return;
  mem = null;
  try { store()?.delete(KEY); } catch { /* in-memory only */ }
}
