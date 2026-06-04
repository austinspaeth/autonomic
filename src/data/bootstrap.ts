// App data bootstrap: initialize the store, run the one-time migration from the
// legacy localStorage blob (web only), then hydrate the Repository. Native has
// no legacy data, so the migration branch is simply skipped.
import { migrate, STORAGE_KEY } from '@core/migrate';
import { Repository } from './Repository';
import { type Store, KV } from './Store';
import { createStore } from './platformStore';

export interface Bootstrapped {
  store: Store;
  repo: Repository;
}

export async function bootstrap(prefersDark = false): Promise<Bootstrapped> {
  const store = createStore();
  await store.init();

  const alreadySharded = await store.kvGet<boolean>(KV.sharded);
  if (!alreadySharded) {
    await migrateLegacyBlob(store, prefersDark);
    await store.kvSet(KV.sharded, true);
  }

  const repo = new Repository(store);
  await repo.hydrate();
  return { store, repo };
}

/** Move the legacy single-blob localStorage state into the sharded store.
 *  The legacy key is intentionally left in place as a recoverable backup. */
async function migrateLegacyBlob(store: Store, prefersDark: boolean): Promise<void> {
  if (typeof localStorage === 'undefined') return; // native / no web storage
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Fresh web install: seed KV with sensible defaults so theme persists.
    await store.kvSet(KV.settings, { theme: prefersDark ? 'dark' : 'light' });
    await store.kvSet(KV.meta, { lastUpdated: null, lastImport: null });
    await store.kvSet(KV.profile, { sex: '', birthday: '', weight: '', height: '' });
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const state = migrate(parsed, prefersDark);
  const kv: Record<string, unknown> = {
    [KV.version]: state.version,
    [KV.settings]: state.settings,
    [KV.meta]: state.meta,
    [KV.profile]: state.profile,
  };
  await store.importAll(state.days, kv);
}
