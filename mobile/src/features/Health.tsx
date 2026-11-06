/** Health settings (Apple Health on iOS, Health Connect on Android):
 *  permission and a bedtime-confirmation flow that reads last night's sleep +
 *  overnight HR and lets you review/edit it before it lands in the journal. */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';
import { Button, DaySaveButton } from '../components/ui';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { TimeField } from '../components/Field';
import { useToast } from '../components/Toast';
import { usePalette } from '../theme';
import {
  health, healthAppName, healthPermissionPath, medicationsSupported, openMedicationPicker,
  revokeHealthAuth, SleepImport,
} from '../lib/health';
import { ensureDay, getState, save, storeSleepSeries, useStore } from '../store/store';
import { fmtTime12, todayKey } from '../lib/dates';
import { ImportedList, runHealthUpdateCheck } from './HealthUpdates';
import { NotifRow } from './Reminders';
import { StoreError } from './Paywall';

export function HealthScreen() {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  // `settings.healthEnabled` is the source of truth, so reopening this screen
  // still shows the connected state (local state alone reset to "Connect …").
  const connected = useStore((s) => !!s.state.settings.healthEnabled);
  const [busy, setBusy] = useState(false);
  const api = health();

  if (!api.available) {
    return (
      <View>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>{healthAppName()}</Text>
        <Text style={{ color: p.textDim, fontSize: 15, lineHeight: 20 }}>
          {`${healthAppName()} needs a full app build. On this platform it is disabled.`}
        </Text>
      </View>
    );
  }

  const connect = async () => {
    setBusy(true);
    // Asks for the whole set, ECG included (requestAuth folds in the local
    // native module's sheet); `force` skips the once-per-launch pacing.
    const ok = await api.requestAuth({ force: true });
    setBusy(false);
    toast(ok ? 'Health connected' : 'Permission denied');
    if (ok) { getState().settings.healthEnabled = true; save(); }
  };

  // Neither platform lets an app silently drop its own grants: Health Connect
  // revokes for us (applied on the next app start), HealthKit can only send the
  // user to the Health app. Either way we stop reading/writing immediately.
  const disconnect = () => {
    const name = healthAppName();
    Alert.alert(
      `Disconnect ${name}?`,
      Platform.OS === 'android'
        ? `Autonomic will stop reading and writing health data. ${name} finishes removing the permissions the next time the app starts.`
        : `Autonomic will stop reading and writing health data. To remove the permissions too, turn Autonomic's toggles off in ${healthPermissionPath()}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: Platform.OS === 'android' ? 'Disconnect' : 'Disconnect & open Health',
          style: 'destructive',
          onPress: async () => {
            getState().settings.healthEnabled = false; save();
            const revoked = await revokeHealthAuth();
            toast(revoked ? `${name} disconnected` : `${name} disconnected on this device`);
          },
        },
      ],
    );
  };

  const checkForUpdates = async () => {
    setBusy(true);
    try {
      await runHealthUpdateCheck(openSheet, toast);
    } catch {
      toast(`Could not read from ${healthAppName()}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>{healthAppName()}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16, lineHeight: 19 }}>
        {"Grant permission, then import readings one at a time from the reading picker (tap a reading type to choose a sample from Health, or enter it manually). Adding an activity offers the day's workouts the same way. New readings you log are also written back to Health automatically. Existing entries are never overwritten."}
      </Text>
      {connected
        ? <Button title={`Disconnect ${healthAppName()}`} variant="danger" onPress={disconnect} />
        : <Button title={`Connect ${healthAppName()}`} variant="primary" onPress={connect} />}
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Troubleshooting</Text>
      <Button title={`Check ${healthAppName()} for updates`} onPress={checkForUpdates} disabled={busy} />
      {busy ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}
      {connected ? <LogsImportRow /> : null}
      {connected ? (
        <>
          {/* The same list the import pill opens, so anything it filed can be
              found and undone here once the pill has gone. */}
          <View style={{ height: 1, backgroundColor: p.border, marginTop: 24, marginBottom: 20 }} />
          <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Imported today</Text>
          <ImportedList dk={todayKey()} />
        </>
      ) : null}
      <View style={{ height: 24 }} />
    </View>
  );
}

/**
 * "Also import what I log in Health itself" — symptoms, and on iOS 26 the
 * medication doses from the Health app's own medication list.
 *
 * OPT-IN, and off by default, for three reasons that all point the same way.
 * It needs a read permission the core set deliberately does not ask for (a
 * sheet nobody tapped anything to get is the nag lib/health/askedAuth exists to
 * prevent); the symptom read is one query per mapped type and the periodic
 * check runs on every foreground, so off has to mean NOT READ rather than read
 * and discarded; and somebody who logs symptoms in both places may genuinely
 * not want them merged. `settings.healthLogs` is the source of truth and the
 * permission is derived — the same arrangement the morning reminder uses.
 *
 * Android does not render it at all: Health Connect has no symptom record and
 * no medication record, so the row would be a promise the platform cannot keep.
 */
function LogsImportRow() {
  const toast = useToast();
  const p = usePalette();
  const on = useStore((s) => !!s.state.settings.healthLogs);
  const [meds, setMeds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);
  useEffect(() => { void medicationsSupported().then(setMeds); }, []);

  if (Platform.OS !== 'ios') return null;

  const toggle = async () => {
    if (busy) return;
    // Whichever way it goes, a stale picker error is about a tap that is no
    // longer the state on screen.
    setPickFailed(false);
    if (on) {
      // Off is ours alone to do: HealthKit cannot hand a read grant back, so
      // the honest thing is to stop reading, and say where to revoke.
      getState().settings.healthLogs = false; save();
      toast('Will stop importing symptoms');
      return;
    }
    setBusy(true);
    // The whole 'logs' set in one tap: the symptom types through the normal
    // bridge, then (iOS 26) the medication log's own sheet.
    const ok = await health().requestAuth({ force: true, scope: 'logs' });
    setBusy(false);
    if (!ok) { toast('Permission denied'); return; }
    getState().settings.healthLogs = true; save();
    toast('Importing from Apple Health');
  };

  // Reopening the picker. Tapping twice opens it twice, which is the API's own
  // behaviour and not a bug: a medication is a per-object authorization, so
  // the sheet is presented on EVERY call and its answer is which medications
  // are ticked now.
  //
  // Success says nothing on screen, because `success` is not a grant (Apple:
  // it "doesn't indicate whether the user actually granted") — the Health
  // sheet the user just answered is the receipt, and which medications came
  // back is the next dose read's answer, not this call's. Only a failure to
  // PRESENT is worth reporting, and it is reported in the sheet's own content:
  // this screen is opened with openSheet, the stack is one RN Modal painting
  // above ToastProvider, so a toast() from in here would be invisible.
  const pick = async () => {
    if (picking) return;
    setPicking(true); setPickFailed(false);
    const ok = await openMedicationPicker();
    setPicking(false); setPickFailed(!ok);
  };

  return (
    <>
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        What you log in Health
      </Text>
      <NotifRow
        icon="alert"
        title={meds ? 'Symptoms and medications' : 'Symptoms'}
        sub={meds
          ? 'Bring in what you log in the Health app itself'
          : 'Bring in the symptoms you log in the Health app'}
        on={on}
        onToggle={() => { void toggle(); }}
      />
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
        {meds
          ? 'Doses you mark as taken in Health are filed under your own medication types, and a medication you have no type for yet offers to create one. Skipped doses are never imported.'
          : 'Medication doses need iOS 26, which added the Health app\u2019s medication log. Symptoms import on any version.'}
      </Text>
      {/* Only with the toggle ON and a medication log to pick from: a button
          that opens a picker the OS cannot show is worse than no button. */}
      {on && meds ? (
        <View style={{ marginTop: 14 }}>
          <Button
            title={picking ? 'Opening Health\u2026' : 'Choose which medications to import'}
            disabled={picking}
            onPress={() => { void pick(); }}
          />
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
            {'Doses only import for medications you share with Autonomic. Added a new one? Pick it here.'}
          </Text>
          {pickFailed ? (
            <View style={{ marginTop: 10 }}>
              <StoreError text={'Could not open the medication list. Try again, or share the medication from the Health app itself.'} />
            </View>
          ) : null}
        </View>
      ) : null}
      {busy ? <View style={{ alignItems: 'center', marginTop: 12 }}><ActivityIndicator color={p.accent} /></View> : null}
    </>
  );
}

/** Review/edit the night Health reported before writing it into the day.
 *  Also used by the Journal sleep section's "Add sleep" import card. */
export function SleepConfirmSheet({ dk, data, controls, onDone }: {
  dk: string; data: SleepImport; controls: SheetControls; onDone: () => void;
}) {
  const p = usePalette();
  const [bed, setBed] = useState(data.bed);
  const [wake, setWake] = useState(data.wake);
  const existing = getState().days[dk]?.sleep;
  const hadSleep = !!(existing && (existing.bed || existing.wake));
  const hours = Math.floor(data.minutesAsleep / 60);
  const mins = data.minutesAsleep % 60;

  const confirm = () => {
    const d = ensureDay(dk);
    d.sleep = {
      ...d.sleep,
      bed,
      wake,
      quality: data.interrupted ? 'interrupted' : (d.sleep?.quality || 'good'),
      ...(data.hrLow != null ? { hrLow: data.hrLow } : {}),
      ...(data.hrHigh != null ? { hrHigh: data.hrHigh } : {}),
      imported: true,
    };
    // Times changed on the way in are the user's; a fresh confirm is not.
    if (bed !== data.bed || wake !== data.wake) d.sleep.edited = true;
    else delete d.sleep.edited;
    // Stages describe the imported night; drop any from a previous import
    // rather than mixing them with the new times.
    if (data.stages) d.sleep.stages = data.stages;
    else delete d.sleep.stages;
    // The night's series goes to the sidecar, never the journal. Called even
    // when the import carried none, so a re-import clears an older night's
    // curve rather than leaving it describing a window it no longer covers.
    storeSleepSeries(dk, data);
    save();
    controls.closeAll();
    onDone();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Confirm sleep</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {`${healthAppName()} shows you were asleep from ${fmtTime12(data.bed)} to ${fmtTime12(data.wake)}`}
        {data.minutesAsleep > 0 ? ` (${hours}h ${mins}m` : ''}
        {data.minutesAsleep > 0 ? (data.interrupted ? ', interrupted).' : ').') : '.'}
        {' Adjust the times if that’s not right.'}
      </Text>
      <TimeField label="Bed (last night)" value={bed} onChange={setBed} />
      <TimeField label="Woke (this morning)" value={wake} onChange={setWake} />
      {(data.hrLow != null || data.hrHigh != null) ? (
        <Text style={{ color: p.textDim, fontSize: 14, marginTop: 6 }}>
          {`Overnight heart rate ${data.hrLow ?? '–'}–${data.hrHigh ?? '–'} bpm`}
        </Text>
      ) : null}
      {hadSleep ? (
        <Text style={{ color: p.accent, fontSize: 13, marginTop: 10 }}>
          This will replace the sleep times already logged for this day.
        </Text>
      ) : null}
      <SheetFooter>
        <DaySaveButton dk={dk} title="Use this" pastTitle="Use this for previous day" onPress={confirm} />
      </SheetFooter>
    </View>
  );
}
