// RepositoryProvider — runs bootstrap(), gates render until hydrated, and
// exposes the Repository via context. useRepoSelector() subscribes a component
// to the repo so it re-renders on any mutation (notify()).
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { View, useColorScheme } from 'react-native';
import { bootstrap } from './bootstrap';
import type { Repository } from './Repository';

const RepoContext = createContext<Repository | null>(null);

export function RepositoryProvider({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const system = useColorScheme();
  const [repo, setRepo] = useState<Repository | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap(system === 'dark').then(({ repo }) => {
      if (!cancelled) setRepo(repo);
    });
    return () => {
      cancelled = true;
    };
    // bootstrap once; system pref only seeds first-run default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!repo) {
    return <>{fallback ?? <View style={{ flex: 1, backgroundColor: '#000' }} />}</>;
  }
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepository(): Repository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error('useRepository must be used within <RepositoryProvider>');
  return repo;
}

/**
 * Subscribe to the repository's data version. Returns a monotonically-increasing
 * number that changes on every mutation — a stable primitive snapshot, so it
 * never triggers the infinite-loop pitfall of returning fresh objects from
 * getSnapshot.
 */
export function useRepoVersion(): number {
  const repo = useRepository();
  return useSyncExternalStore(repo.subscribe, repo.getVersion, repo.getVersion);
}

/**
 * Derive a value from the repository. Re-renders when the data version changes
 * (a mutation) or when the component re-renders for its own reasons (e.g. a prop
 * the selector closes over). The selector runs at render time, so returning
 * fresh objects/arrays is safe.
 */
export function useRepoSelector<T>(selector: (repo: Repository) => T): T {
  const repo = useRepository();
  useRepoVersion(); // subscribe → re-render on any mutation
  return selector(repo);
}
