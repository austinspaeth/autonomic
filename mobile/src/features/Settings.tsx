/**
 * Menu / settings sheets: Profile, Theme, Devices, Apple Health, Import/Export.
 * Import/Export uses the exact PWA JSON format via the document picker + share.
 */
import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { SheetControls, useSheets } from '../components/Sheet';
import { Button } from '../components/ui';
import { DateField, HeightField, TextField, onlyNumeric } from '../components/Field';
import { BrandMark, Icon, IconName } from '../components/Icon';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { getState, replaceState, save, serializeState, useAppState } from '../store/store';
import { ageFromBirthday, fmtStamp, keyOf } from '../lib/dates';
import { useIap, manageSubscription, restore, MONTHLY_SKU } from '../store/iap';
import { DevicesScreen } from './Devices';
import { HealthScreen } from './Health';
import { showWelcomeAgain } from './Onboarding';

const PRIVACY_URL = 'https://autonomic.care/privacy-policy/';
const TERMS_URL = 'https://autonomic.care/terms-of-service/';

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
  const appVer = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <View>
      {/* Title band: a 32px box matching the sheet's close ✕ box (absolute at
          top:12, height:32). Content starts at the sheet's 24px top padding, so
          marginTop:-12 lifts this box to top:12 — lining its centre up with the ✕. */}
      <View style={{ height: 32, justifyContent: 'center', marginTop: -12, marginBottom: 16 }}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>Settings</Text>
      </View>
      {/* Near-black brand card, inset to match content: 18px left/right (content
          padding). */}
      <View style={{ marginBottom: 16, paddingVertical: 24, borderRadius: radius.card, backgroundColor: '#131315', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
        <BrandMark size={26} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: p.text, letterSpacing: -0.3 }}>Autonomic</Text>
      </View>
      {item('user', 'Profile', 'Sex, birthday, height, weight', () => openSheet((c) => <ProfileSheet controls={c} />))}
      {item('bluetooth', 'Devices', 'Heart-rate straps', () => openSheet(() => <DevicesScreen />), !!state.settings.lastBleDeviceId)}
      {item('heart', 'Apple Health', Platform.OS === 'ios' ? 'Read & write health data' : 'iOS only', () => openSheet(() => <HealthScreen />), Platform.OS === 'ios' && !!state.settings.healthEnabled)}
      {Platform.OS === 'ios' ? item('star', 'Subscription', 'Manage plan or restore', () => openSheet((c) => <SubscriptionSheet controls={c} />)) : null}
      {item('download', 'Export data', 'Download everything as JSON', () => exportData(toast))}
      {item('upload', 'Import data', 'Replace everything from a JSON file', () => importData(controls, toast))}
      {item('sparkles', 'Show welcome screen', 'Replay the first-run guide', () => { controls.closeAll(); showWelcomeAgain(); })}
      {item('info', 'Legal information', 'Disclaimer, privacy & terms', () => openSheet((c) => <LegalSheet controls={c} />))}
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center' }}>{`Data last updated ${fmtStamp(m.lastUpdated)}`}</Text>
        <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center', marginTop: 4 }}>{`Autonomic v${appVer}`}</Text>
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
      <DateField label="Birthday" value={birthday} onChange={setBirthday} placeholder="Set birthday" />
      {age != null ? <Text style={{ color: p.textDim, fontSize: 13, marginTop: -8, marginBottom: 10 }}>{`Age: ${age}`}</Text> : null}
      <HeightField label="Height" value={height} onChange={setHeight} placeholder="Set height" />
      <TextField label="Weight (lb)" value={weight} onChange={(t) => setWeight(onlyNumeric(t))} keyboardType="decimal-pad" />
      <Text style={{ color: p.textDim, fontSize: 13, marginBottom: 12 }}>Used to personalize reading scores (sex-adjusted QTc, BMI from height/weight).</Text>
      <Button title="Save" variant="primary" onPress={() => { getState().profile = { sex, birthday, weight: weight.trim(), height: height.trim() }; save(); controls.close(); }} />
      <View style={{ height: 20 }} />
    </View>
  );
}

function SubscriptionSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const { isPro, products, activeSku } = useIap();
  const [busy, setBusy] = useState(false);
  const active = products.find((s) => s.productId === activeSku);
  const price = active && 'localizedPrice' in active ? active.localizedPrice : undefined;
  const period = activeSku === MONTHLY_SKU ? 'month' : 'year';
  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    toast(ok ? 'Subscription restored' : 'No active subscription found');
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 14 }}>Subscription</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isPro ? '#22c55e' : p.textDim }} />
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{isPro ? 'Subscription active' : 'No active subscription'}</Text>
      </View>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>
        {isPro
          ? `${price ? `Your plan renews ${period}ly at ${price}. ` : ''}Change your plan or cancel anytime in the App Store. Cancelling keeps access until the period ends.`
          : 'You have no active plan. Restore a previous purchase, or manage plans in the App Store.'}
      </Text>
      <View style={{ gap: 10 }}>
        <Button title="Manage in App Store" variant="primary" onPress={() => manageSubscription()} />
        <Button title={busy ? 'Restoring…' : 'Restore purchase'} variant="default" disabled={busy} onPress={onRestore} />
      </View>
      <View style={{ height: 20 }} />
    </View>
  );
}

function LegalSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const para = (t: string) => <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, marginBottom: 14 }}>{t}</Text>;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 14 }}>Legal Information</Text>
      {para('Autonomic is a personal logging and educational tool. It is not a medical device, and it does not diagnose, treat, cure, or prevent any condition or provide medical advice. Scores, thresholds, and charts are for education and self-tracking only.')}
      {para('Always talk to your doctor before starting, stopping, or changing medications, supplements, exercise, or any part of your protocol. Never disregard professional medical advice because of something you saw in this app.')}
      {para('AI insights are prompts you paste into a third-party AI service of your choice (Claude, ChatGPT, Gemini, or others). Anything those services say comes from them, not from Autonomic. We only assemble your logged data for analysis.')}
      {para('Your data stays on this device. Autonomic has no accounts, no servers, and no analytics; nothing is collected or transmitted unless you export or share it yourself.')}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button title="Privacy Policy" variant="ghost" onPress={() => Linking.openURL(PRIVACY_URL)} />
        <Button title="Terms of Service" variant="ghost" onPress={() => Linking.openURL(TERMS_URL)} />
      </View>
      <View style={{ height: 8 }} />
      <Button title="Done" variant="primary" onPress={controls.close} />
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
