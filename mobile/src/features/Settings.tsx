/**
 * Menu / settings sheets: Profile, Theme, Devices, Apple Health, Import/Export.
 * Import/Export uses the exact PWA JSON format via the document picker + share.
 */
import React, { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { SheetControls, useSheets } from '../components/Sheet';
import { Button } from '../components/ui';
import { DateField, HeightField, TextField, onlyNumeric } from '../components/Field';
import { BrandMark, Icon, IconName } from '../components/Icon';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { clearAllData, getState, replaceState, save, serializeState, useAppState, useStore } from '../store/store';
import { deleteAllBackups } from '../lib/backup';
import { ageFromBirthday, keyOf } from '../lib/dates';
import { DATE_KEY_RE, assertImportVersion, isPlainObject } from '../lib/migrate';
import { useIap, manageSubscription, restore, priceOf, storeName, MONTHLY_SKU, YEARLY_SKU } from '../store/iap';
import { getTrialDaysLeft, useTier } from '../store/tier';
import { usePaywall } from './Paywall';
import { healthAppName } from '../lib/health';
import { DevicesScreen } from './Devices';
import { HealthScreen } from './Health';
import { NotificationsRow } from './Reminders';
import { showWelcomeAgain } from './Onboarding';
import { PromptSheet } from './PromptSheet';
import { openWhatsNew } from './WhatsNew';
import { collectAppDiagnostics } from '../lib/diagnostics/collectApp';
import { formatAppDiagnostics } from '../lib/diagnostics/appReport';
// One address for every route into support: this card and the Insights failure
// state. A second copy is a second thing to forget when it changes, and the one
// the user is told to write to must be the one that is watched.
import { SUPPORT_EMAIL } from '../lib/diagnostics/supportEmail';

const PRIVACY_URL = 'https://autonomic.care/privacy-policy/';
const TERMS_URL = 'https://autonomic.care/terms-of-service/';

/** Hold the brand card this long to collect the whole-app support dump. Same
 *  duration as the Bluetooth and camera dumps: far past any accidental press,
 *  because it is a support tool rather than a feature. */
const DIAGNOSTICS_HOLD_MS = 8000;

/** Collect and present the support dump. Collection touches native modules
 *  (camera, Bluetooth, health, watch) and takes a moment, so the haptic and
 *  toast confirm the hold landed rather than leaving a dead-feeling card. */
async function runAppDiagnostics(
  openSheet: (b: (c: SheetControls) => React.ReactNode) => void,
  toast: (m: string) => void,
) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  toast('Collecting diagnostics…');
  try {
    const report = await collectAppDiagnostics();
    openSheet((c) => (
      <PromptSheet
        controls={c}
        title="App diagnostics"
        rangeText="App diagnostics"
        subtitle="A snapshot of this app's current state: version, permissions, connected services, subscription, storage and recent errors. Send it to support. It contains no health data and nothing that identifies you."
        prompt={formatAppDiagnostics(report)}
      />
    ));
  } catch {
    toast('Could not collect diagnostics');
  }
}

export function MenuSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const state = useAppState();
  const tier = useTier();
  const toast = useToast();
  // Row badge: `true` keeps the green "Connected" pill; a {text, color} pair
  // renders the same pill in any tint (e.g. the accent "Trial" state).
  const item = (icon: IconName, title: string, sub: string, onPress: () => void, badge?: boolean | { text: string; color: string }) => {
    const b = badge === true ? { text: 'Connected', color: '#22c55e' } : badge || null;
    const soft = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.15)`;
    };
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
        <Icon name={icon} size={22} color={p.textDim} />
        <View style={{ flex: 1 }}><Text style={{ color: p.text, fontSize: 17 }}>{title}</Text><Text style={{ color: p.textDim, fontSize: 13 }}>{sub}</Text></View>
        {b ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: soft(b.color), paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: b.color }} />
            <Text style={{ color: b.color, fontSize: 12, fontWeight: '600' }}>{b.text}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };
  const appVer = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Settings</Text>
      {/* Near-black brand card, inset to match content: 18px left/right (content
          padding). Holding it for 8s opens the whole-app support dump — the
          same hidden gesture as the Bluetooth and camera reports, deliberately
          unlabelled so it's reached by being told about it, not by accident. */}
      <Pressable
        onLongPress={() => runAppDiagnostics(openSheet, toast)}
        delayLongPress={DIAGNOSTICS_HOLD_MS}
        style={{ marginBottom: 16, paddingVertical: 24, borderRadius: radius.card, backgroundColor: '#131315', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}
      >
        <BrandMark size={26} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: p.text, letterSpacing: -0.3 }}>Autonomic</Text>
      </Pressable>
      {item('user', 'Profile', 'Sex, birthday, height, weight', () => openSheet((c) => <ProfileSheet controls={c} />))}
      <NotificationsRow />
      {item('bluetooth', 'Devices', 'Heart-rate straps', () => openSheet(() => <DevicesScreen />), !!state.settings.lastBleDeviceId)}
      {item('heart', healthAppName(), 'Read & write health data', () => openSheet(() => <HealthScreen />), !!state.settings.healthEnabled)}
      {item('star', 'Subscription', 'Manage plan or restore', () => openSheet((c) => <SubscriptionSheet controls={c} />),
        tier === 'trial' ? { text: 'Trial', color: p.accent } : tier === 'pro' ? { text: 'Pro', color: '#22c55e' } : undefined)}
      {item('download', 'Export data', 'Download everything as JSON', () => exportData(toast))}
      {item('upload', 'Import data', 'Replace everything from a JSON file', () => importData(controls, toast))}
      {item('trash', 'Clear all data', 'Erase everything on this device', () => openSheet((c) => <ClearDataSheet controls={c} />, { fitContent: true }))}
      {item('sparkles', 'Show welcome screen', 'Replay the first-run guide', () => { controls.closeAll(); showWelcomeAgain(); })}
      {item('info', 'Legal information', 'Disclaimer, privacy & terms', () => openSheet((c) => <LegalSheet controls={c} />))}
      {item('rocket', "What's new", `Release notes for v${appVer}`, () => openWhatsNew(openSheet))}
      {/* Dark card in both themes (like the brand card above), so its text is
          hardcoded light rather than palette-driven. */}
      <Pressable
        onPress={() => emailSupport(toast)}
        style={({ pressed }) => [{ marginTop: 22, paddingVertical: 18, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: '#242427' }, pressed && { opacity: 0.6 }]}
      >
        <Text style={{ fontSize: 13.5, color: '#c9c9cf', textAlign: 'center' }}>Questions? Concerns? Email us!</Text>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: '#f2f2f5', textAlign: 'center', marginTop: 5 }}>{SUPPORT_EMAIL}</Text>
      </Pressable>
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: 12.5, color: p.textDim, textAlign: 'center', lineHeight: 18 }}>
          We appreciate you for using Autonomic, we hope it genuinely helps you in your journey!
        </Text>
        <Text style={{ fontSize: 12.5, color: p.textDim, textAlign: 'center', marginTop: 4 }}>- Autonomic team</Text>
        <View style={{ height: 1, backgroundColor: p.border, marginVertical: 16 }} />
        <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center' }}>{`Autonomic v${appVer}`}</Text>
        <Text style={{ fontSize: 11, color: p.textDim, textAlign: 'center', marginTop: 16, lineHeight: 16 }}>
          Autonomic is a personal tracking tool, not a medical device. It does not diagnose or treat any condition. Discuss changes to medication, supplements, or your protocol with a clinician.
        </Text>
        <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center', marginTop: 16 }}>Built in Charleston, South Carolina 🇺🇸</Text>
        <Text style={{ fontSize: 12, color: p.textDim, textAlign: 'center', marginTop: 4 }}>© 2026 DiscoveryMark LLC</Text>
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
  const tier = useTier();
  const openPaywall = usePaywall('settings');
  const [busy, setBusy] = useState(false);
  const active = products.find((s) => s.productId === activeSku);
  const price = active ? priceOf(active, activeSku ?? YEARLY_SKU) : undefined;
  const period = activeSku === MONTHLY_SKU ? 'month' : 'year';
  const daysLeft = getTrialDaysLeft();
  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    toast(ok ? 'Subscription restored' : 'No active subscription found');
  };
  const status = isPro ? 'Subscription active'
    : tier === 'trial' ? `Free trial · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
    : 'Free plan';
  const blurb = isPro
    ? `${price ? `Your plan renews ${period}ly at ${price}. ` : ''}Change your plan or cancel anytime in ${storeName()}. Cancelling keeps access until the period ends.`
    : tier === 'trial'
      ? 'You have full access while your trial lasts. After it ends you keep journaling and unlimited HRV capture free forever; Pro unlocks the deep-analysis tools.'
      : `You're on the free plan — journaling and HRV capture stay free forever. Upgrade for your full history, Insights, POTS testing and AI reports, or restore a previous purchase from ${storeName()}.`;
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 14 }}>Subscription</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isPro ? '#22c55e' : tier === 'trial' ? p.accent : p.textDim }} />
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{status}</Text>
      </View>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>{blurb}</Text>
      <View style={{ gap: 10 }}>
        {!isPro ? <Button title="Upgrade to Pro" variant="primary" onPress={() => { controls.close(); openPaywall(); }} /> : null}
        <Button title={`Manage in ${storeName()}`} variant={isPro ? 'primary' : 'default'} onPress={() => manageSubscription()} />
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

/* ---------- clear all data ---------- */
const CLEAR_TAPS = 5;

/** Confirm card for the irreversible wipe. The tap counter lives in this
 *  component's state, so closing the sheet unmounts it and any partial count
 *  starts over — a stale "one more tap" can never be waiting on reopen. */
function ClearDataSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const [taps, setTaps] = useState(0);
  const [busy, setBusy] = useState(false);
  const left = CLEAR_TAPS - taps;
  const days = useStore((s) => Object.keys(s.state.days).length);

  const onDelete = async () => {
    if (busy) return;
    if (left > 1) { setTaps((t) => t + 1); return; }
    setBusy(true);
    clearAllData();
    // The daily snapshots are plaintext journals in Documents; the wipe isn't
    // real until they're gone too.
    await deleteAllBackups();
    controls.closeAll();
    toast('All data cleared');
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 10, paddingRight: 56 }}>Clear all data?</Text>
      <Text style={{ color: p.textDim, fontSize: 14.5, lineHeight: 22, marginBottom: 18 }}>
        {`This erases everything on this device: ${days} logged day${days === 1 ? '' : 's'}, your profile, settings and backup snapshots. It cannot be undone. Export a copy first if you might want it back.`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        {/* Both neutral: the accent IS red in this theme, so a primary Export
            button would read as destructive next to the real one. */}
        <Button title="Cancel" variant="default" onPress={controls.close} />
        <Button title="Export data first" variant="default" onPress={() => exportData(toast)} />
      </View>
      <Button title={busy ? 'Clearing…' : 'Delete everything'} variant="danger" disabled={busy} onPress={onDelete} />
      <Text style={{ fontSize: 13, textAlign: 'center', marginTop: 10, color: taps ? '#d63b3b' : p.textDim }}>
        {taps === 0 ? 'Tap 5 times to confirm' : left === 1 ? 'One more tap to erase everything' : `${left} more taps`}
      </Text>
      <View style={{ height: 8 }} />
    </View>
  );
}

/** Open the user's mail client at the support address. Devices with no mail
 *  account (and the iOS Simulator, which has no Mail.app at all) can't handle
 *  `mailto:` — copy the address instead of failing silently. */
async function emailSupport(toast: (m: string) => void) {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  } catch {
    await Clipboard.setStringAsync(SUPPORT_EMAIL);
    toast(`Email copied: ${SUPPORT_EMAIL}`);
  }
}

/* ---------- import / export ---------- */
async function exportData(toast: (m: string) => void) {
  const uri = `${FileSystem.cacheDirectory}autonomic-journal-${keyOf(new Date())}.json`;
  try {
    const json = serializeState(true);
    await FileSystem.writeAsStringAsync(uri, json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export Autonomic data' });
    else toast('Sharing unavailable');
  } catch {
    toast('Export failed');
  } finally {
    // The exported file is the user's full plaintext journal; don't leave it in cache.
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

async function importData(controls: SheetControls, toast: (m: string) => void) {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const text = await FileSystem.readAsStringAsync(asset.uri);
    // The picker copied the journal file into our cache; remove it now that it's read.
    await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
    const parsed: unknown = JSON.parse(text);
    // Structure check only — replaceState() runs the file through migrate(),
    // which sanitizes day keys and entries before anything reaches MMKV.
    const days = isPlainObject(parsed) ? parsed.days : undefined;
    if (!isPlainObject(days)) throw new Error('Not an Autonomic Journal file');
    assertImportVersion(parsed);
    const nDays = Object.keys(days).filter((k) => DATE_KEY_RE.test(k)).length;
    Alert.alert('Replace all data?', `This replaces everything on this device with the imported file (${nDays} day${nDays === 1 ? '' : 's'}). This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: () => { replaceState(parsed, asset.name); controls.closeAll(); toast('Imported'); } },
    ]);
  } catch (e) {
    toast('Import failed: ' + (e as Error).message);
  }
}
