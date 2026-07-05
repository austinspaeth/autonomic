/**
 * Menu / settings sheets: Profile, Theme, Devices, Apple Health, Import/Export.
 * Import/Export uses the exact PWA JSON format via the document picker + share.
 */
import React, { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SheetControls, useSheets } from '../components/Sheet';
import { Button } from '../components/ui';
import { TextField } from '../components/Field';
import { BrandMark, Icon, IconName } from '../components/Icon';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { getState, replaceState, save, serializeState, useAppState } from '../store/store';
import { ageFromBirthday, fmtStamp, keyOf } from '../lib/dates';
import { DevicesScreen } from './Devices';
import { HealthScreen } from './Health';

export function MenuSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const state = useAppState();
  const toast = useToast();
  const item = (icon: IconName, title: string, sub: string, onPress: () => void, connected?: boolean) => (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
      <Icon name={icon} size={22} color={p.textDim} />
      <View style={{ flex: 1 }}><Text style={{ color: p.text, fontSize: 17 }}>{title}</Text><Text style={{ color: p.textDim, fontSize: 13 }}>{sub}</Text></View>
      {connected ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
          <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '600' }}>Connected</Text>
        </View>
      ) : null}
    </Pressable>
  );
  const m = state.meta || {};
  return (
    <View>
      {/* Near-black brand card, inset to match content: 18px left/right (content
          padding) and top (topPad is 24, so pull up 6 to match). */}
      <View style={{ marginTop: -6, marginBottom: 16, paddingVertical: 24, borderRadius: radius.card, backgroundColor: '#08080a', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
        <BrandMark size={26} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: p.text, letterSpacing: -0.3 }}>Autonomic</Text>
      </View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>Settings</Text>
      {item('user', 'Profile', 'Sex, birthday, height, weight', () => openSheet((c) => <ProfileSheet controls={c} />))}
      {item('bluetooth', 'Devices', 'Heart-rate straps', () => openSheet(() => <DevicesScreen />), !!state.settings.lastBleDeviceId)}
      {item('heart', 'Apple Health', Platform.OS === 'ios' ? 'Read & write health data' : 'iOS only', () => openSheet(() => <HealthScreen />), Platform.OS === 'ios' && !!state.settings.healthEnabled)}
      {item('download', 'Export data', 'Download everything as JSON', () => exportData(toast))}
      {item('upload', 'Import data', 'Replace everything from a JSON file', () => importData(controls, toast))}
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center' }}>{`Last updated ${fmtStamp(m.lastUpdated)}`}</Text>
        {m.lastImport?.name ? <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center', marginTop: 4 }}>{`Last import: ${m.lastImport.name} · ${fmtStamp(m.lastImport.at)}`}</Text> : null}
        <Text style={{ fontSize: 11, color: p.textDim, textAlign: 'center', marginTop: 16, lineHeight: 16 }}>
          Autonomic is a personal tracking tool, not a medical device. It does not diagnose or treat any condition. Discuss changes to medication, supplements, or your protocol with a clinician.
        </Text>
      </View>
    </View>
  );
}

function ProfileSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const prof = getState().profile;
  const [sex, setSex] = useState(prof.sex || '');
  const [birthday, setBirthday] = useState(prof.birthday || '');
  const [weight, setWeight] = useState(prof.weight || '');
  const [height, setHeight] = useState(prof.height || '');
  const age = ageFromBirthday(birthday);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Profile</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: p.textDim, marginBottom: 6 }}>Sex</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {['', 'Male', 'Female', 'Other'].map((o) => (
          <Pressable key={o || 'none'} onPress={() => setSex(o)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: sex === o ? p.accent : p.border, backgroundColor: sex === o ? p.accentSoft : p.surface2 }}>
            <Text style={{ color: sex === o ? p.accent : p.text }}>{o || 'Not set'}</Text>
          </Pressable>
        ))}
      </View>
      <TextField label="Birthday (YYYY-MM-DD)" value={birthday} onChange={setBirthday} placeholder="1990-01-31" />
      {age != null ? <Text style={{ color: p.textDim, fontSize: 13, marginTop: -8, marginBottom: 10 }}>{`Age: ${age}`}</Text> : null}
      <TextField label="Weight (lb)" value={weight} onChange={setWeight} keyboardType="decimal-pad" />
      <TextField label="Height (in)" value={height} onChange={setHeight} keyboardType="decimal-pad" />
      <Text style={{ color: p.textDim, fontSize: 13, marginBottom: 12 }}>Used to personalize reading scores (sex-adjusted QTc, BMI from height/weight).</Text>
      <Button title="Save" variant="primary" onPress={() => { getState().profile = { sex, birthday, weight: weight.trim(), height: height.trim() }; save(); controls.close(); }} />
      <View style={{ height: 20 }} />
    </View>
  );
}

/* ---------- import / export ---------- */
async function exportData(toast: (m: string) => void) {
  try {
    const json = serializeState();
    const uri = `${FileSystem.cacheDirectory}autonomic-journal-${keyOf(new Date())}.json`;
    await FileSystem.writeAsStringAsync(uri, json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export Autonomic data' });
    else toast('Sharing unavailable');
  } catch {
    toast('Export failed');
  }
}

async function importData(controls: SheetControls, toast: (m: string) => void) {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const text = await FileSystem.readAsStringAsync(asset.uri);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !('days' in parsed)) throw new Error('Not an Autonomic Journal file');
    const nDays = Object.keys(parsed.days || {}).length;
    Alert.alert('Replace all data?', `This replaces everything on this device with the imported file (${nDays} day${nDays === 1 ? '' : 's'}). This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => { replaceState(parsed, asset.name); controls.closeAll(); toast('Imported'); } },
    ]);
  } catch (e) {
    toast('Import failed: ' + (e as Error).message);
  }
}
