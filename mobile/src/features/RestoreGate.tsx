/**
 * Launch-time recovery screen. The root layout mounts this in place of
 * OnboardingGate when the store loaded empty or unreadable (`loadIssue` in
 * src/store/store.ts), e.g. after a reinstall where Documents came back via
 * device backup but the encrypted journal (or its Keychain key) did not.
 * Offers the rotating JSON snapshots from Documents/backups to restore with
 * one tap; "Start fresh" falls through to onboarding. Resolves silently when
 * there are no snapshots to offer (every genuinely fresh install lands here
 * for one frame).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui';
import { listBackups, restoreBackup, type BackupSnapshot } from '../lib/backup';
import { fmtDateFull } from '../lib/dates';
import { loadIssue } from '../store/store';
import { usePalette, radius } from '../theme';

export function RestoreGate({ onDone }: { onDone: () => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [snaps, setSnaps] = useState<BackupSnapshot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const resolved = useRef(false);
  const finish = () => {
    if (resolved.current) return;
    resolved.current = true;
    onDone();
  };

  useEffect(() => {
    let alive = true;
    listBackups()
      .then((s) => { if (!alive) return; if (s.length) setSnaps(s); else finish(); })
      .catch(() => { if (alive) finish(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (s: BackupSnapshot) => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await restoreBackup(s);
      toast(`Restored ${n} day${n === 1 ? '' : 's'}`);
      finish();
    } catch (e) {
      setBusy(false);
      // Surface the schema-guard message verbatim; anything else gets a generic line.
      const msg = e instanceof Error && e.message.includes('newer version') ? e.message : 'Could not read that backup';
      toast(msg);
    }
  };

  // Checking for snapshots: hold a blank cover for the beat it takes, so a
  // fresh install never flashes this screen before onboarding.
  if (!snaps) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, zIndex: 100, elevation: 100, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }

  const corrupt = loadIssue?.kind === 'corrupt';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, zIndex: 100, elevation: 100, paddingTop: insets.top + 28, paddingHorizontal: 20 }]}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: p.text, marginBottom: 8 }}>Restore your journal?</Text>
      <Text style={{ color: p.textDim, fontSize: 15, lineHeight: 21, marginBottom: 20 }}>
        {corrupt
          ? 'Your saved journal could not be read. You can restore it from a backup snapshot kept on this device.'
          : 'Backup snapshots from a previous install were found on this device.'}
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={{ backgroundColor: p.surface, borderRadius: radius.card, borderWidth: 1, borderColor: p.border, paddingHorizontal: 16 }}>
          {snaps.map((s, i) => (
            <Pressable
              key={s.name}
              disabled={busy}
              onPress={() => restore(s)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: p.border },
                (pressed || busy) && { opacity: 0.5 },
              ]}
            >
              <Icon name="download" size={22} color={p.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>{fmtDateFull(s.date)}</Text>
                <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>{`${s.days} day${s.days === 1 ? '' : 's'} logged`}</Text>
              </View>
              {busy ? <ActivityIndicator color={p.textDim} /> : <Icon name="chevronRight" size={20} color={p.textDim} />}
            </Pressable>
          ))}
        </View>
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, marginTop: 12 }}>
          Newest first. You can also import a backup file later from Settings.
        </Text>
      </ScrollView>
      <View style={{ flexDirection: 'row', paddingBottom: insets.bottom + 12, paddingTop: 8 }}>
        <Button title="Start fresh" variant="ghost" disabled={busy} onPress={finish} />
      </View>
    </View>
  );
}
