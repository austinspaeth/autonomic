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
 */
import * as FileSystem from 'expo-file-system';
import { getState, serializeState } from '../store/store';
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
