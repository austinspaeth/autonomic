/* One store for everything the screens read: LOAD (ledger), PINGS (usage
 * counters) and STORE_VERSIONS, fetched together. The last good snapshot is
 * cached on disk so the app paints instantly, then refreshes on launch, on
 * every foreground and every five minutes while open. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { addDays, easternDay } from './dates';
import type { LoadResponse, PingReport, StoreVersions } from './types';

const CACHE_KEY = 'master.snapshot.v1';
const REFRESH_MS = 5 * 60 * 1000;
/* The same 400 days the web dashboard pulls: retention, presence and cohort
   maths need cohorts old enough to have reached day 60 and beyond. */
const PING_DAYS = 400;

export type Snapshot = {
  at: number;
  load: LoadResponse | null;
  pings: PingReport | null;
  stores: StoreVersions | null;
  /** When the usage report was last fetched IN FULL (the rest are top-ups). */
  pingsFullAt?: number;
};

/* The usage report is big (one row per route, day and install cohort), so it
   is fetched in full at most once a day and TOPPED UP otherwise: only the
   last TOPUP_DAYS days are asked for, and they replace those days in the
   copy kept on the phone. Older days never change, so nothing is lost. */
const TOPUP_DAYS = 2;
const FULL_EVERY_MS = 24 * 3600 * 1000;
const MIN_LOADING_MS = 900;

/** `fresh` covers every day from `since` on; keep `base` for the days before it. */
export function mergeReport(base: PingReport | null | undefined, fresh: PingReport, since: string): PingReport {
  if (!base) return fresh;
  const out: any = { ...fresh, since: base.since < fresh.since ? base.since : fresh.since };
  const keys = new Set([...Object.keys(base), ...Object.keys(fresh)]);
  keys.forEach((k) => {
    const a = (base as any)[k];
    const b = (fresh as any)[k];
    if (!Array.isArray(a) && !Array.isArray(b)) return;
    out[k] = [...(Array.isArray(a) ? a.filter((r: { day?: string }) => !r.day || r.day < since) : []), ...(Array.isArray(b) ? b : [])];
  });
  return out as PingReport;
}

type DataState = {
  snap: Snapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<DataState>({ snap: null, loading: false, error: null, refresh: async () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const latest = useRef<Snapshot | null>(null);
  latest.current = snap;

  const refresh = useCallback(() => {
    if (inflight.current) return inflight.current;
    setLoading(true);
    const started = Date.now();
    const prev = latest.current;
    const full = !prev?.pings || !prev.pingsFullAt || Date.now() - prev.pingsFullAt > FULL_EVERY_MS;
    const since = addDays(easternDay(), full ? -PING_DAYS : -TOPUP_DAYS);
    // allSettled: a slow store scrape must not blank the usage numbers.
    const run = Promise.allSettled([api.load(), api.pings(since), api.storeVersions()])
      .then(async ([load, pings, stores]) => {
        const failed = [load, pings, stores].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        setError(failed ? String(failed.reason?.message || failed.reason) : null);
        setSnap((cur) => {
          const base = cur ?? prev;
          const gotPings = pings.status === 'fulfilled';
          const next: Snapshot = {
            at: Date.now(),
            load: load.status === 'fulfilled' ? load.value : base?.load ?? null,
            pings: gotPings ? (full ? pings.value : mergeReport(base?.pings, pings.value, since)) : base?.pings ?? null,
            stores: stores.status === 'fulfilled' ? stores.value : base?.stores ?? null,
            pingsFullAt: gotPings && full ? Date.now() : base?.pingsFullAt,
          };
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      })
      .finally(() => {
        inflight.current = null;
        /* A top-up can land in a few hundred ms, which would flash the
           "Updating" state too briefly to see; hold it for a beat. */
        setTimeout(() => setLoading(false), Math.max(0, MIN_LOADING_MS - (Date.now() - started)));
      });
    inflight.current = run;
    return run;
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (raw) {
          const cached: Snapshot = JSON.parse(raw);
          latest.current = cached;
          setSnap((cur) => cur ?? cached);
        }
      })
      .catch(() => {})
      .finally(() => refresh());
    const timer = setInterval(refresh, REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  return <Ctx.Provider value={{ snap, loading, error, refresh }}>{children}</Ctx.Provider>;
}

export const useData = () => useContext(Ctx);

export async function clearCache() {
  await AsyncStorage.removeItem(CACHE_KEY);
}
