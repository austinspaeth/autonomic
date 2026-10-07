import { useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Divider, Row } from '../components/ui';
import * as Auth from '../lib/auth';
import { api } from '../lib/api';
import { clearCache, useData } from '../lib/data';
import { useAlerts } from '../lib/alertsStore';
import { registerForPush } from '../lib/push';
import { ago, shortDate } from '../lib/dates';
import { int } from '../lib/format';
import { C } from '../theme';

/** The Account view: signed-in email, data freshness, the stores, sign out. */
export function AccountView() {
  const tokens = useSyncExternalStore(Auth.subscribe, Auth.current);
  const { snap, loading, refresh } = useData();
  const [checking, setChecking] = useState(false);
  const { preview } = useAlerts();
  const [pushNote, setPushNote] = useState('');

  const stores = snap?.stores;
  const load = snap?.load;

  const forceStores = async () => {
    setChecking(true);
    try {
      await api.storeVersions(true);
      await refresh();
    } catch (err: any) {
      Alert.alert('Store check failed', err.message || String(err));
    } finally {
      setChecking(false);
    }
  };

  const signOut = () =>
    Alert.alert('Sign out?', 'Cached numbers on this phone are cleared too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await clearCache();
          await Auth.signOut();
        },
      },
    ]);

  return (
    <>
      <Card title="Signed in">
        <Row title={tokens?.email || '—'} />
      </Card>
      <Card title="Data">
        <Row title="Last refreshed" right={snap ? ago(snap.at) : '—'} />
        <Divider />
        <Row title="Sales recorded" right={int(load?.sales?.length || 0)} />
        <Divider />
        <Row title="Store entries" right={int(load?.entries?.length || 0)} />
        <Divider />
        <Row title="Costs" right={int(load?.costs?.length || 0)} />
        <Divider />
        <Row title="Timeline events" right={int(load?.events?.length || 0)} />
        <Button label={loading ? 'Refreshing…' : 'Refresh now'} onPress={refresh} disabled={loading} />
      </Card>

      <Card title="Stores">
        {(['ios', 'android'] as const).map((k, i) => {
          const side = stores?.[k];
          return (
            <Pressable key={k} disabled={!side?.url} onPress={() => side?.url && Linking.openURL(side.url)}>
              {i ? <Divider /> : null}
              <Row
                title={k === 'ios' ? 'App Store' : 'Google Play'}
                sub={side?.error ? side.detail || side.error : side?.released ? `Released ${shortDate(side.released)}` : undefined}
                right={side?.version ? `v${side.version}` : '—'}
              />
            </Pressable>
          );
        })}
        <Row title="Checked" right={stores?.at ? ago(Date.parse(stores.at)) : '—'} />
        <Button label={checking ? 'Checking…' : 'Check stores now'} onPress={forceStores} disabled={checking} />
      </Card>

      <Card title="Instant alerts">
        <Text style={s.hint}>New installs, sales and hard crashes are pushed to this phone the moment they happen.</Text>
        {pushNote ? <Text style={s.hint}>{pushNote}</Text> : null}
        <Button
          label="Send a test alert"
          onPress={async () => {
            const r = await registerForPush(true);
            if (!r.ok) {
              setPushNote(r.reason || 'Could not register.');
              return;
            }
            try {
              await api.testPush();
              setPushNote('Sent. It should arrive in a few seconds.');
            } catch (e: any) {
              setPushNote(e?.message || 'The test did not send.');
            }
          }}
        />
      </Card>

      <Card title="Preview alerts">
        <Text style={s.hint}>Fires sample toasts and their celebration. Nothing is saved.</Text>
        <View style={s.previewGrid}>
          {(
            [
              ['visitor', 'Returning'],
              ['download', 'New install'],
              ['sale', 'Sale'],
              ['record', 'All-time high'],
              ['reading', 'Reading'],
              ['crash', 'Crash'],
              ['all', 'Everything'],
            ] as const
          ).map(([k, label]) => (
            <Pressable key={k} onPress={() => preview(k)} style={({ pressed }) => [s.previewBtn, pressed && { opacity: 0.6 }]}>
              <Text style={s.buttonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Pressable onPress={signOut} style={({ pressed }) => [s.signOut, pressed && { opacity: 0.7 }]}>
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>
    </>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.button, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: { backgroundColor: C.surface2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { color: C.text, fontSize: 15, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewBtn: { flexBasis: '47%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  signOut: { backgroundColor: C.surface, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  signOutText: { color: C.down, fontSize: 16, fontWeight: '600' },
});
