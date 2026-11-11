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

  it('never lets a smaller journal overwrite a bigger one, however new it is', () => {
    // The real failure: a session whose Keychain read failed fell back to the
    // plaintext store, started on an empty journal, and stamped it the moment
    // the user typed one entry — always newer than the real journal sitting in
    // `secure`. "Newer wins" alone handed 165 days to a 1-day copy.
    const big = JSON.stringify({
      version: 1,
      meta: { lastUpdated: '2026-11-11T06:37:00Z' },
      days: Object.fromEntries(Array.from({ length: 165 }, (_, i) => [`2026-01-${i}`, {}])),
    });
    const small = JSON.stringify({
      version: 1,
      meta: { lastUpdated: '2026-11-11T22:00:00Z' },
      days: { '2026-11-11': {} },
    });
    const legacy = fakeStore({ [KEY]: small });
    const secure = fakeStore({ [KEY]: big });
    expect(migrateLegacyJournal(legacy, secure, KEY)).toBe(true);
    expect(Object.keys(JSON.parse(secure.getString(KEY)!).days)).toHaveLength(165);
    expect(legacy.data.size).toBe(0);
  });

  it('still takes a newer legacy journal of the same size', () => {
    const legacy = fakeStore({ [KEY]: journal('2026-01-05T00:00:00Z') });
    const secure = fakeStore({ [KEY]: journal('2026-01-02T00:00:00Z') });
    migrateLegacyJournal(legacy, secure, KEY);
    expect(secure.getString(KEY)).toBe(journal('2026-01-05T00:00:00Z'));
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
