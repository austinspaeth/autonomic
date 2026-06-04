// Web export/import — Blob download + file input (legacy exportData/importData,
// docs/index.html:4504-4536). Produces/consumes the legacy JSON shape.
import { keyOf } from '@core/date/dateUtils';
import type { Repository } from './Repository';

export async function exportData(repo: Repository): Promise<void> {
  const state = await repo.exportState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autonomic-journal-${keyOf(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importData(onParsed: (parsed: unknown, fileName: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve();
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed || typeof parsed !== 'object' || !('days' in parsed)) {
            throw new Error('Not an Autonomic Journal file');
          }
          onParsed(parsed, file.name);
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    input.remove();
  });
}
