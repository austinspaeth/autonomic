/**
 * One-time move of the persisted journal from the legacy plaintext MMKV store
 * into the encrypted one. Pure logic (stores are passed in) so it can be unit
 * tested without native modules — see src/store/store.ts for the wiring.
 */

/** The subset of the MMKV API the migration needs. */
export type KVStore = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  clearAll(): void;
};

/** meta.lastUpdated of a serialized journal, '' when absent/unparseable. */
function lastUpdatedOf(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const meta = (JSON.parse(raw) || {}).meta;
    return (meta && meta.lastUpdated) || '';
  } catch {
    return '';
  }
}

/** Logged days in a serialized journal, 0 when absent/unparseable. */
function dayCountOf(raw: string | undefined): number {
  if (!raw) return 0;
  try {
    const days = (JSON.parse(raw) || {}).days;
    return days && typeof days === 'object' ? Object.keys(days).length : 0;
  } catch {
    return 0;
  }
}

/**
 * Copy the journal out of `legacy` into `secure`, then wipe `legacy`.
 *
 * Ordering is the safety property: the plaintext copy is cleared only after the
 * encrypted copy reads back, so an interrupted migration simply re-runs on the
 * next launch instead of losing the journal. If both stores hold data (an
 * interrupted run, or a session that fell back to plaintext because the
 * Keychain was unavailable), the journal with the newer meta.lastUpdated wins —
 * ISO timestamps compare lexicographically.
 *
 * NEWER IS NOT ENOUGH, and that was a real data-loss path. "Newer" was written
 * for an interrupted migration, where it genuinely means better. It cannot tell
 * that case apart from a session that fell back to the plaintext store because
 * the Keychain was locked, started on an empty journal, and stamped it with the
 * time the user typed their first entry into it — which is always newer than
 * the real journal sitting in `secure`. So a copy may only win if it is also no
 * SMALLER: a journal with fewer logged days never overwrites one with more,
 * whatever its timestamp says.
 *
 * Returns whether the legacy store is now disposable (it held nothing, or its
 * journal verifiably landed in `secure`) — only then may the caller delete the
 * legacy files. clearAll() alone is not enough: it resets the logical store but
 * leaves plaintext remnants in the mmap page on disk.
 */
export function migrateLegacyJournal(legacy: KVStore, secure: KVStore, storageKey: string): boolean {
  const old = legacy.getString(storageKey);
  if (!old) return true;
  const current = secure.getString(storageKey);
  const newer = lastUpdatedOf(old) > lastUpdatedOf(current);
  const notSmaller = dayCountOf(old) >= dayCountOf(current);
  if (!current || (newer && notSmaller)) {
    secure.set(storageKey, old);
  }
  if (!secure.getString(storageKey)) return false;
  legacy.clearAll();
  return true;
}
