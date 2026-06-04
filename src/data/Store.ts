// Storage abstraction. One async interface; web uses IndexedDB (Store.web.ts),
// native uses expo-sqlite (Store.native.ts). Records are sharded one-per-day so
// the dataset scales and future cloud-sync can diff by changed day-key.
import type { Day, DateKey } from '@core/types';

export interface DayRecord {
  date: DateKey;
  day: Day;
  lastModified: number; // epoch ms
}

export interface Store {
  init(): Promise<void>;
  getDay(date: DateKey): Promise<DayRecord | null>;
  putDay(date: DateKey, day: Day, lastModified: number): Promise<void>;
  deleteDay(date: DateKey): Promise<void>;
  /** Inclusive date range, ordered ascending by date. */
  getDaysInRange(from: DateKey, to: DateKey): Promise<DayRecord[]>;
  allDayRecords(): Promise<DayRecord[]>;
  allDayKeys(): Promise<DateKey[]>;
  kvGet<T = unknown>(key: string): Promise<T | null>;
  kvSet(key: string, value: unknown): Promise<void>;
  /** Atomic replace of the entire dataset (used by import). */
  importAll(days: Record<DateKey, Day>, kv: Record<string, unknown>): Promise<void>;
  exportAll(): Promise<{ days: Record<DateKey, Day>; kv: Record<string, unknown> }>;
}

// KV keys used for the non-day state slices.
export const KV = {
  version: 'version',
  settings: 'settings',
  meta: 'meta',
  profile: 'profile',
  sharded: '__sharded__',
} as const;
