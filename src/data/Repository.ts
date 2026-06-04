// Repository — the UI's data API. Holds a full in-memory mirror so reads are
// synchronous and instant (matching the legacy app's ergonomics), and persists
// via write-through to the platform Store. Every mutation funnels through
// mutate(): update cache -> stamp meta.lastUpdated -> notify subscribers ->
// debounced async persist. This is where future cloud-sync hooks in (each day
// carries a lastModified).
import type { Day, DateKey, Meta, Profile, Settings, State, ThemeName } from '@core/types';
import { blankDay, defaultState, migrate, SCHEMA_VERSION } from '@core/migrate';
import { keyOf } from '@core/date/dateUtils';
import { type Store, KV } from './Store';

const DEBOUNCE_MS = 200;

export class Repository {
  private store: Store;
  private days = new Map<DateKey, Day>();
  private settings: Settings;
  private meta: Meta;
  private profile: Profile;
  private subscribers = new Set<() => void>();
  private pending = new Map<DateKey, ReturnType<typeof setTimeout>>();
  private metaTimer: ReturnType<typeof setTimeout> | null = null;
  private _version = 0;

  constructor(store: Store) {
    this.store = store;
    const d = defaultState();
    this.settings = d.settings;
    this.meta = d.meta;
    this.profile = d.profile;
  }

  /** Load the whole dataset into memory (called once at startup, after migration). */
  async hydrate(): Promise<void> {
    const records = await this.store.allDayRecords();
    this.days = new Map(records.map((r) => [r.date, r.day]));
    this.settings = (await this.store.kvGet<Settings>(KV.settings)) ?? this.settings;
    this.meta = (await this.store.kvGet<Meta>(KV.meta)) ?? this.meta;
    this.profile = (await this.store.kvGet<Profile>(KV.profile)) ?? this.profile;
  }

  // ---- subscriptions (used by React via useSyncExternalStore) ----
  subscribe = (fn: () => void): (() => void) => {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  };
  /** Monotonic data version — bumps on every mutation. Used as a stable store
   *  snapshot for useSyncExternalStore (a primitive that only changes on notify). */
  getVersion = (): number => this._version;
  private notify() {
    this._version++;
    this.subscribers.forEach((fn) => fn());
  }

  // ---- synchronous reads ----
  getDay(k: DateKey): Day {
    return this.days.get(k) ?? blankDay();
  }
  hasDay(k: DateKey): boolean {
    return this.days.has(k);
  }
  getDaysInRange(from: DateKey, to: DateKey): Record<DateKey, Day> {
    const out: Record<DateKey, Day> = {};
    for (const [k, d] of this.days) if (k >= from && k <= to) out[k] = d;
    return out;
  }
  allDays(): Record<DateKey, Day> {
    return Object.fromEntries(this.days);
  }
  allDayKeys(): DateKey[] {
    return [...this.days.keys()].sort();
  }
  getProfile(): Profile {
    return this.profile;
  }
  getSettings(): Settings {
    return this.settings;
  }
  getMeta(): Meta {
    return this.meta;
  }

  // ---- write-through mutations ----
  /** Replace a whole day record (used after editing entries). */
  putDay(k: DateKey, day: Day): void {
    this.days.set(k, day);
    this.touchMeta();
    this.notify();
    this.schedulePersistDay(k, day);
  }

  /** Read-modify-write helper for the current day. */
  updateDay(k: DateKey, fn: (d: Day) => void): void {
    const existing = this.days.get(k);
    const draft: Day = existing ? structuredCloneSafe(existing) : blankDay();
    fn(draft);
    this.putDay(k, draft);
  }

  setProfile(patch: Partial<Profile>): void {
    this.profile = { ...this.profile, ...patch };
    this.touchMeta();
    this.notify();
    void this.store.kvSet(KV.profile, this.profile);
  }

  setTheme(theme: ThemeName): void {
    this.settings = { ...this.settings, theme };
    this.touchMeta();
    this.notify();
    void this.store.kvSet(KV.settings, this.settings);
  }

  recordImport(name: string): void {
    this.meta = { ...this.meta, lastImport: { name, at: new Date().toISOString() } };
    void this.store.kvSet(KV.meta, this.meta);
  }

  private touchMeta() {
    this.meta = { ...this.meta, lastUpdated: new Date().toISOString() };
    if (this.metaTimer) clearTimeout(this.metaTimer);
    this.metaTimer = setTimeout(() => void this.store.kvSet(KV.meta, this.meta), DEBOUNCE_MS);
  }

  private schedulePersistDay(k: DateKey, day: Day) {
    const prev = this.pending.get(k);
    if (prev) clearTimeout(prev);
    this.pending.set(
      k,
      setTimeout(() => {
        this.pending.delete(k);
        void this.store.putDay(k, day, Date.now());
      }, DEBOUNCE_MS),
    );
  }

  // ---- export / import (legacy JSON shape, for round-trip compatibility) ----
  async exportState(): Promise<State> {
    return {
      version: SCHEMA_VERSION,
      settings: this.settings,
      meta: this.meta,
      profile: this.profile,
      days: this.allDays(),
    };
  }

  /** Replace the entire dataset from an imported blob, then re-hydrate. */
  async importState(parsed: unknown, fileName: string): Promise<void> {
    const next = migrate(parsed);
    const kv: Record<string, unknown> = {
      [KV.version]: next.version,
      [KV.settings]: next.settings,
      [KV.meta]: {
        lastUpdated: new Date().toISOString(),
        lastImport: { name: fileName, at: new Date().toISOString() },
      },
      [KV.profile]: next.profile,
      [KV.sharded]: true,
    };
    await this.store.importAll(next.days, kv);
    await this.hydrate();
    this.notify();
  }
}

// structuredClone exists on web and modern Hermes; fall back to JSON if missing.
function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}
