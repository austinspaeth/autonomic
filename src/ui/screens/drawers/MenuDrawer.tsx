// Menu drawer — Profile / Export / Import + last-updated footer (legacy
// openMenu, docs/index.html:4444-4465).
import React from 'react';
import { View } from 'react-native';
import { fmtStamp } from '@core/date/dateUtils';
import { useRepository } from '@data/RepositoryProvider';
import type { Repository } from '@data/Repository';
import { exportData, importData } from '@data/transfer';
import { Text } from '@ui/primitives';
import { Button } from '@ui/components/Button';
import { H2 } from '@ui/components/SheetText';
import { MenuItem } from '@ui/components/MenuItem';
import { toast } from '@ui/components/Toast';
import { openSheet, closeAllSheets, type SheetApi } from '@ui/sheets/useSheets';
import { useTheme } from '@ui/theme/ThemeProvider';
import { openProfile } from './ProfileDrawer';

function MenuBody() {
  const t = useTheme();
  const repo = useRepository();
  const meta = repo.getMeta();

  const onExport = async () => {
    closeAllSheets();
    try {
      await exportData(repo);
      toast('Exported');
    } catch (e) {
      toast((e as Error).message || 'Export failed');
    }
  };

  const onImport = async () => {
    closeAllSheets();
    try {
      await importData((parsed, fileName) => confirmImport(repo, parsed, fileName));
    } catch (e) {
      toast((e as Error).message || 'Import failed');
    }
  };

  return (
    <>
      <H2>Menu</H2>
      <MenuItem icon="user" title="Profile" sub="Sex, height, weight" onPress={() => openProfile()} />
      <MenuItem icon="download" title="Export data" sub="Download everything as JSON" onPress={onExport} />
      <MenuItem icon="upload" title="Import data" sub="Replace everything from a JSON file" onPress={onImport} />
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: 12, color: t.textDim, textAlign: 'center', lineHeight: 19 }}>
          {`Last updated ${fmtStamp(meta.lastUpdated)}`}
        </Text>
        {meta.lastImport?.name ? (
          <Text style={{ fontSize: 12, color: t.textDim, textAlign: 'center', lineHeight: 19 }}>
            {`Last import: ${meta.lastImport.name} · ${fmtStamp(meta.lastImport.at)}`}
          </Text>
        ) : null}
      </View>
    </>
  );
}

export function openMenu() {
  openSheet(() => <MenuBody />);
}

// "Replace all data?" confirmation (legacy confirmImport, docs/index.html:4538).
function ConfirmImportBody({
  repo,
  parsed,
  fileName,
  api,
}: {
  repo: Repository;
  parsed: unknown;
  fileName: string;
  api: SheetApi;
}) {
  const t = useTheme();
  const days = Object.keys((parsed as { days?: object })?.days || {}).length;
  return (
    <>
      <H2>Replace all data?</H2>
      <Text style={{ color: t.textDim, fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
        {`This will replace everything currently on this device with the imported file (${days} day${days === 1 ? '' : 's'}). This cannot be undone.`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" onPress={() => api.close()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Replace"
            variant="danger"
            onPress={async () => {
              await repo.importState(parsed, fileName);
              api.closeAll();
              toast('Imported');
            }}
          />
        </View>
      </View>
    </>
  );
}

function confirmImport(repo: Repository, parsed: unknown, fileName: string) {
  openSheet((api) => <ConfirmImportBody repo={repo} parsed={parsed} fileName={fileName} api={api} />);
}
