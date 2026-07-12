/**
 * Automatic daily JSON backups. On every launch, if no backup exists for today
 * (and there is any data to protect), the full state is written as a JSON export
 * to `<Documents>/backups/`. Only the newest KEEP files are retained — the
 * oldest is deleted as a new one rotates in.
 *
 * The Documents directory is included in the device's iCloud/iTunes backup, so
 * these snapshots survive a reinstall via device restore without any cloud
 * account or sync code. With UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace
 * set, the user can also browse `backups/` in the Files app ("On My iPhone →
 * Autonomic") and airdrop/copy a snapshot out manually.
 *
 * These snapshots are deliberately plaintext: they are the recovery path of
 * last resort, readable without the app (and without the Keychain key that
 * encrypts the primary MMKV store — see src/store/store.ts). At rest they are
 * covered by iOS file protection / whole-disk encryption and, in iCloud
 * backups, by Apple's backup encryption. The privacy policy discloses this.
 */
import * as FileSystem from 'expo-file-system';
import { getState, replaceState, serializeState } from '../store/store';
import { todayKey } from './dates';

const KEEP = 5;
const NAME_RE = /^autonomic-backup-\d{4}-\d{2}-\d{2}\.json$/;

const backupDir = () =>
  FileSystem.documentDirectory ? `${FileSystem.documentDirectory}backups` : null;

export async function runDailyBackup(): Promise<void> {
  try {
    const dir = backupDir();
    if (!dir) return; // no document directory on this platform (e.g. web)
    if (!Object.keys(getState().days).length) return; // nothing to back up yet

    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const existing = (await FileSystem.readDirectoryAsync(dir)).filter((n) => NAME_RE.test(n));

    const today = `autonomic-backup-${todayKey()}.json`;
    if (existing.includes(today)) return; // already snapshotted today

    await FileSystem.writeAsStringAsync(`${dir}/${today}`, serializeState());

    // Date-stamped names sort chronologically; trim from the oldest end.
    const all = [...existing, today].sort();
    while (all.length > KEEP) {
      const oldest = all.shift()!;
      await FileSystem.deleteAsync(`${dir}/${oldest}`, { idempotent: true }).catch(() => {});
    }
  } catch {
    // Backups are best-effort — never let them interfere with app startup.
  }
}

/** One restorable snapshot from Documents/backups, newest first. */
export interface BackupSnapshot {
  name: string;   // autonomic-backup-YYYY-MM-DD.json
  uri: string;
  date: string;   // YYYY-MM-DD day key from the filename
  days: number;   // logged days inside, so the picker can show what's at stake
}

/** List the on-device snapshots that actually contain data, newest first.
 *  Unreadable or empty files are skipped rather than offered. */
export async function listBackups(): Promise<BackupSnapshot[]> {
  const dir = backupDir();
  if (!dir) return [];
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  const out: BackupSnapshot[] = [];
  for (const name of names.filter((n) => NAME_RE.test(n)).sort().reverse()) {
    const uri = `${dir}/${name}`;
    try {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri));
      const days = parsed && parsed.days ? Object.keys(parsed.days).length : 0;
      if (days) out.push({ name, uri, date: name.slice('autonomic-backup-'.length, -'.json'.length), days });
    } catch {
      // skip snapshots we can't read or parse
    }
  }
  return out;
}

/** Replace the journal with a snapshot's contents. Returns the restored day
 *  count. Throws (store untouched) if the file is unreadable or newer-schema. */
export async function restoreBackup(snap: BackupSnapshot): Promise<number> {
  const parsed = JSON.parse(await FileSystem.readAsStringAsync(snap.uri));
  replaceState(parsed, snap.name);
  return Object.keys(getState().days).length;
}
