// Web Store — IndexedDB, no dependency. Two object stores: `days` (keyed by the
// YYYY-MM-DD date, which sorts chronologically so range reads are key ranges)
// and `kv` (version/settings/meta/profile/flags).
import type { Day, DateKey } from '@core/types';
import { type DayRecord, type Store } from './Store';

const DB_NAME = 'autonomic';
const DB_VERSION = 1;
const DAYS = 'days';
const KV_STORE = 'kv';

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

class IndexedDbStore implements Store {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(DAYS)) db.createObjectStore(DAYS, { keyPath: 'date' });
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: 'key' });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('Store not initialized');
    return this.db.transaction(name, mode).objectStore(name);
  }

  async getDay(date: DateKey): Promise<DayRecord | null> {
    const row = await reqToPromise(this.store(DAYS, 'readonly').get(date));
    return row ? toRecord(row) : null;
  }

  async putDay(date: DateKey, day: Day, lastModified: number): Promise<void> {
    const tx = this.db!.transaction(DAYS, 'readwrite');
    tx.objectStore(DAYS).put({ date, json: JSON.stringify(day), lastModified });
    await txDone(tx);
  }

  async deleteDay(date: DateKey): Promise<void> {
    const tx = this.db!.transaction(DAYS, 'readwrite');
    tx.objectStore(DAYS).delete(date);
    await txDone(tx);
  }

  async getDaysInRange(from: DateKey, to: DateKey): Promise<DayRecord[]> {
    const range = IDBKeyRange.bound(from, to, false, false);
    const rows = await reqToPromise(this.store(DAYS, 'readonly').getAll(range));
    return rows.map(toRecord);
  }

  async allDayRecords(): Promise<DayRecord[]> {
    const rows = await reqToPromise(this.store(DAYS, 'readonly').getAll());
    return rows.map(toRecord).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async allDayKeys(): Promise<DateKey[]> {
    const keys = await reqToPromise(this.store(DAYS, 'readonly').getAllKeys());
    return (keys as DateKey[]).sort();
  }

  async kvGet<T = unknown>(key: string): Promise<T | null> {
    const row = await reqToPromise(this.store(KV_STORE, 'readonly').get(key));
    return row ? (row.value as T) : null;
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    const tx = this.db!.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put({ key, value });
    await txDone(tx);
  }

  async importAll(days: Record<DateKey, Day>, kv: Record<string, unknown>): Promise<void> {
    const tx = this.db!.transaction([DAYS, KV_STORE], 'readwrite');
    const dayStore = tx.objectStore(DAYS);
    const kvStore = tx.objectStore(KV_STORE);
    dayStore.clear();
    kvStore.clear();
    const now = Date.now();
    for (const [date, day] of Object.entries(days)) {
      dayStore.put({ date, json: JSON.stringify(day), lastModified: now });
    }
    for (const [key, value] of Object.entries(kv)) {
      kvStore.put({ key, value });
    }
    await txDone(tx);
  }

  async exportAll(): Promise<{ days: Record<DateKey, Day>; kv: Record<string, unknown> }> {
    const records = await this.allDayRecords();
    const kvRows = await reqToPromise(this.store(KV_STORE, 'readonly').getAll());
    const days: Record<DateKey, Day> = {};
    for (const r of records) days[r.date] = r.day;
    const kv: Record<string, unknown> = {};
    for (const row of kvRows) kv[row.key] = row.value;
    return { days, kv };
  }
}

function toRecord(row: { date: DateKey; json: string; lastModified: number }): DayRecord {
  return { date: row.date, day: JSON.parse(row.json) as Day, lastModified: row.lastModified };
}

export function createStore(): Store {
  return new IndexedDbStore();
}
