// Native export/import — write a JSON file to the cache and share it; pick a
// JSON file and read it back. Uses Expo's first-party file modules.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { keyOf } from '@core/date/dateUtils';
import type { Repository } from './Repository';

export async function exportData(repo: Repository): Promise<void> {
  const state = await repo.exportState();
  const name = `autonomic-journal-${keyOf(new Date())}.json`;
  const file = new File(Paths.cache, name);
  try {
    file.create({ overwrite: true });
  } catch {
    /* may already exist */
  }
  file.write(JSON.stringify(state, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export Autonomic Journal' });
  }
}

export async function importData(
  onParsed: (parsed: unknown, fileName: string) => void,
): Promise<void> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return;
  const asset = res.assets[0];
  const text = await new File(asset.uri).text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('days' in parsed)) {
    throw new Error('Not an Autonomic Journal file');
  }
  onParsed(parsed, asset.name || '(file)');
}
