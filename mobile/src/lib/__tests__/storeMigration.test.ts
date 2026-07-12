import { migrateLegacyJournal, KVStore } from '../storeMigration';

const KEY = 'autonomic.journal.v1';

function fakeStore(initial?: Record<string, string>): KVStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial || {}));
  return {
    data,
    getString: (k) => data.get(k),
    set: (k, v) => { data.set(k, v); },
    clearAll: () => { data.clear(); },
  };
}

const journal = (lastUpdated: string | null) =>
  JSON.stringify({ version: 1, meta: { lastUpdated }, days: { '2026-01-01': {} } });

describe('migrateLegacyJournal', () => {
  it('does nothing on a fresh install (empty legacy store)', () => {
    const legacy = fakeStore();
    const secure = fakeStore({ [KEY]: journal('2026-01-02T00:00:00Z') });
    expect(migrateLegacyJournal(legacy, secure, KEY)).toBe(true);
    expect(secure.getString(KEY)).toBe(journal('2026-01-02T00:00:00Z'));
    expect(legacy.data.size).toBe(0);
  });

  it('copies the journal into the secure store, then wipes the plaintext copy', () => {
    const legacy = fakeStore({ [KEY]: journal('2026-01-01T00:00:00Z') });
    const secure = fakeStore();
    expect(migrateLegacyJournal(legacy, secure, KEY)).toBe(true);
    expect(secure.getString(KEY)).toBe(journal('2026-01-01T00:00:00Z'));
    expect(legacy.data.size).toBe(0);
  });

  it('keeps the newer journal when both stores hold data (legacy newer)', () => {
    const legacy = fakeStore({ [KEY]: journal('2026-01-05T00:00:00Z') });
    const secure = fakeStore({ [KEY]: journal('2026-01-02T00:00:00Z') });
    migrateLegacyJournal(legacy, secure, KEY);
    expect(secure.getString(KEY)).toBe(journal('2026-01-05T00:00:00Z'));
    expect(legacy.data.size).toBe(0);
  });

  it('keeps the newer journal when both stores hold data (secure newer)', () => {
    const legacy = fakeStore({ [KEY]: journal('2026-01-02T00:00:00Z') });
    const secure = fakeStore({ [KEY]: journal('2026-01-05T00:00:00Z') });
    migrateLegacyJournal(legacy, secure, KEY);
    expect(secure.getString(KEY)).toBe(journal('2026-01-05T00:00:00Z'));
    expect(legacy.data.size).toBe(0);
  });

  it('prefers an existing secure journal over unparseable legacy data', () => {
    const legacy = fakeStore({ [KEY]: 'not json {{{' });
    const secure = fakeStore({ [KEY]: journal('2026-01-02T00:00:00Z') });
    migrateLegacyJournal(legacy, secure, KEY);
    expect(secure.getString(KEY)).toBe(journal('2026-01-02T00:00:00Z'));
    expect(legacy.data.size).toBe(0);
  });

  it('never reports disposable unless the secure copy reads back', () => {
    const legacy = fakeStore({ [KEY]: journal('2026-01-01T00:00:00Z') });
    const secure = fakeStore();
    secure.set = () => {}; // secure write silently fails
    expect(migrateLegacyJournal(legacy, secure, KEY)).toBe(false);
    expect(legacy.getString(KEY)).toBe(journal('2026-01-01T00:00:00Z'));
  });

  it('re-runs cleanly after an interruption between copy and wipe', () => {
    const legacy = fakeStore({ [KEY]: journal('2026-01-01T00:00:00Z') });
    const secure = fakeStore({ [KEY]: journal('2026-01-01T00:00:00Z') });
    migrateLegacyJournal(legacy, secure, KEY);
    expect(secure.getString(KEY)).toBe(journal('2026-01-01T00:00:00Z'));
    expect(legacy.data.size).toBe(0);
  });
});
