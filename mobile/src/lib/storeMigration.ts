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
 * Returns whether the legacy store is now disposable (it held nothing, or its
 * journal verifiably landed in `secure`) — only then may the caller delete the
 * legacy files. clearAll() alone is not enough: it resets the logical store but
 * leaves plaintext remnants in the mmap page on disk.
 */
export function migrateLegacyJournal(legacy: KVStore, secure: KVStore, storageKey: string): boolean {
  const old = legacy.getString(storageKey);
  if (!old) return true;
  const current = secure.getString(storageKey);
  if (!current || lastUpdatedOf(old) > lastUpdatedOf(current)) {
    secure.set(storageKey, old);
  }
  if (!secure.getString(storageKey)) return false;
  legacy.clearAll();
  return true;
}
