// Native Store — expo-sqlite (async API only, so writes never block the JS
// thread). One row per day in `days`, plus a `kv` table. Date PK gives indexed
// BETWEEN range scans for the Analysis view.
import * as SQLite from 'expo-sqlite';
import type { Day, DateKey } from '@core/types';
import { type DayRecord, type Store } from './Store';

interface DayRow {
  date: DateKey;
  json: string;
  lastModified: number;
}
interface KvRow {
  value: string;
}

class SqliteStore implements Store {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await SQLite.openDatabaseAsync('autonomic.db');
    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL,
        lastModified INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }

  private get d(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Store not initialized');
    return this.db;
  }

  async getDay(date: DateKey): Promise<DayRecord | null> {
    const row = await this.d.getFirstAsync<DayRow>('SELECT * FROM days WHERE date = ?', date);
    return row ? toRecord(row) : null;
  }

  async putDay(date: DateKey, day: Day, lastModified: number): Promise<void> {
    await this.d.runAsync(
      `INSERT INTO days (date, json, lastModified) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET json = excluded.json, lastModified = excluded.lastModified`,
      date,
      JSON.stringify(day),
      lastModified,
    );
  }

  async deleteDay(date: DateKey): Promise<void> {
    await this.d.runAsync('DELETE FROM days WHERE date = ?', date);
  }

  async getDaysInRange(from: DateKey, to: DateKey): Promise<DayRecord[]> {
    const rows = await this.d.getAllAsync<DayRow>(
      'SELECT * FROM days WHERE date BETWEEN ? AND ? ORDER BY date',
      from,
      to,
    );
    return rows.map(toRecord);
  }

  async allDayRecords(): Promise<DayRecord[]> {
    const rows = await this.d.getAllAsync<DayRow>('SELECT * FROM days ORDER BY date');
    return rows.map(toRecord);
  }

  async allDayKeys(): Promise<DateKey[]> {
    const rows = await this.d.getAllAsync<{ date: DateKey }>('SELECT date FROM days ORDER BY date');
    return rows.map((r) => r.date);
  }

  async kvGet<T = unknown>(key: string): Promise<T | null> {
    const row = await this.d.getFirstAsync<KvRow>('SELECT value FROM kv WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : null;
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    await this.d.runAsync(
      `INSERT INTO kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      JSON.stringify(value),
    );
  }

  async importAll(days: Record<DateKey, Day>, kv: Record<string, unknown>): Promise<void> {
    const now = Date.now();
    await this.d.withTransactionAsync(async () => {
      await this.d.execAsync('DELETE FROM days; DELETE FROM kv;');
      for (const [date, day] of Object.entries(days)) {
        await this.d.runAsync(
          'INSERT INTO days (date, json, lastModified) VALUES (?, ?, ?)',
          date,
          JSON.stringify(day),
          now,
        );
      }
      for (const [key, value] of Object.entries(kv)) {
        await this.d.runAsync('INSERT INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
      }
    });
  }

  async exportAll(): Promise<{ days: Record<DateKey, Day>; kv: Record<string, unknown> }> {
    const dayRows = await this.allDayRecords();
    const kvRows = await this.d.getAllAsync<{ key: string; value: string }>('SELECT * FROM kv');
    const days: Record<DateKey, Day> = {};
    for (const r of dayRows) days[r.date] = r.day;
    const kv: Record<string, unknown> = {};
    for (const row of kvRows) kv[row.key] = JSON.parse(row.value);
    return { days, kv };
  }
}

function toRecord(row: DayRow): DayRecord {
  return { date: row.date, day: JSON.parse(row.json) as Day, lastModified: row.lastModified };
}

export function createStore(): Store {
  return new SqliteStore();
}
