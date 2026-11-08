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
  health, healthAppName, healthPermissionPath, medicationsSupported, medPickerNote,
  openMedicationPicker, revokeHealthAuth, SleepImport, type MedPickerOutcome,
} from '../lib/health';
import { ensureDay, getState, save, storeSleepSeries, useStore } from '../store/store';
import { fmtTime12, todayKey } from '../lib/dates';
import { ImportedList, runHealthUpdateCheck } from './HealthUpdates';
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
    // `scope: 'connect'` adds the symptom reads — see Onboarding's Connect.
    const ok = await api.requestAuth({ force: true, scope: 'connect' });
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
      {/* No control, just the fact — a behaviour nobody can see is worse than
          one nobody chose. Symptoms logged in the Health app are an ordinary
          read permission and ride the Connect ask above. Only once connected:
          before that it would be a claim about a feature that is not running. */}
      {connected && Platform.OS === 'ios' ? (
        <Text style={{ color: p.textDim, fontSize: 13, marginTop: 12, lineHeight: 18 }}>
          {'Symptoms you log in the Health app itself are brought in too, the same way. Anything imported shows under "Imported today" below, and removing it there means it is never offered again.'}
        </Text>
      ) : null}
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Troubleshooting</Text>
      <Button title={`Check ${healthAppName()} for updates`} onPress={checkForUpdates} disabled={busy} />
      {busy ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}
      {connected ? <LogsSection /> : null}
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
 * What the user logs in Health ITSELF, on iOS: symptoms, and on iOS 26 the
 * medication doses from the Health app's own medication list.
 *
 * It used to be one toggle over both, which was wrong, because the two halves
 * are not the same kind of object:
 *
 *  - a SYMPTOM is an ordinary HealthKit read permission, so it belongs in the
 *    one Apple Health connect ask (`scope: 'connect'`). Connecting Apple
 *    Health is the consent, the same way it already is for readings, sleep and
 *    workouts. There is no switch here any more;
 *  - a MEDICATION is a PER-OBJECT authorization. It can never ride a batch
 *    request (naming it in `requestAuthorization(toShare:read:)` raises inside
 *    HealthKit and takes the process with it — the 1.39.0 SIGABRT), the picker
 *    is presented on EVERY call whether or not anything was granted, and a
 *    grant covers only the medications ticked at that moment, so there has to
 *    be a permanent way back to it. That is not a permission toggle, it is a
 *    "manage which medications" ACTION, closer to the strap picker.
 *
 * Its "on" state is unverifiable in any case: Apple's `success` is false only
 * on an error and says nothing about what was shared, so nothing here may draw
 * one, and inventing one would be a claim the OS does not support.
 *
 * Android renders none of it: Health Connect has no symptom record and no
 * medication record, so every row would be a promise the platform cannot keep.
 */
function LogsSection() {
  const [meds, setMeds] = useState(false);
  useEffect(() => { void medicationsSupported().then(setMeds); }, []);
  if (Platform.OS !== 'ios') return null;
  return (
    <>
      <LogsCatchUpRow />
      {meds ? <MedicationsRow /> : null}
    </>
  );
}

/**
 * The one-time catch-up ask, for installs that already connected.
 *
 * Somebody who connected Apple Health before this shipped will never tap
 * Connect again, so they would never be asked for the symptom types. This row
 * shows only while `readAuthStatus('logs')` is `shouldRequest` — the one
 * honest question iOS allows, meaning the sheet has never been shown for these
 * types — and disappears for good once it has been, because the status is no
 * longer `shouldRequest`. No toggle and no stored flag: the platform already
 * holds the answer, and a second copy of it could only ever disagree.
 */
function LogsCatchUpRow() {
  const p = usePalette();
  const [due, setDue] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void health().readAuthStatus('logs')
      .then((st) => setDue(st === 'shouldRequest'))
      .catch(() => setDue(false));
  };
  useEffect(refresh, []);

  if (!due) return null;

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    await health().requestAuth({ force: true, scope: 'logs' });
    setBusy(false);
    // The answer is the platform's, not ours: re-read it rather than assuming
    // the sheet was granted (HealthKit never says) or even that it presented.
    refresh();
  };

  return (
    <>
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        What you log in Health
      </Text>
      <Button
        title={busy ? 'Opening Health\u2026' : 'Also import what you log in Health'}
        disabled={busy}
        onPress={() => { void ask(); }}
      />
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
        {'Symptoms you log in the Health app are filed under your own symptom types. Asked once.'}
      </Text>
    </>
  );
}

/**
 * The way back to Apple Health's medication picker, and the only one.
 *
 * A BUTTON, not a toggle. A grant covers the medications that were ticked AT
 * THAT MOMENT, and the import drops a dose it cannot name rather than filing
 * it unnamed, so a prescription added to the Health app later imports nothing
 * and says nothing: the dose carries a concept identifier, the name comes from
 * the medication list, and the list returns only what was shared. Without this
 * row the only route back was turning a feature off and on again.
 *
 * Tapping twice opens it twice, which is the API's own behaviour and not a
 * bug: the sheet is presented on every call and its answer is which
 * medications are ticked now.
 *
 * What it says afterwards is `medPickerNote` (lib/health/medPicker) and it is
 * reported INSIDE the sheet. `toast()` is never used from here: this screen is
 * in the sheet stack, which is one RN Modal painting above ToastProvider, so a
 * toast from in here is invisible and a failure path that only calls one looks
 * exactly like a tap that did nothing. Success says nothing at all, because
 * `success` is not a grant — the Health sheet the user just answered is the
 * receipt, and which medications came back is the next dose read's answer.
 */
function MedicationsRow() {
  const p = usePalette();
  const [picking, setPicking] = useState(false);
  const [out, setOut] = useState<MedPickerOutcome | null>(null);

  const pick = async () => {
    if (picking) return;
    setPicking(true); setOut(null);
    const answer = await openMedicationPicker();
    setPicking(false); setOut(answer);
  };

  const note = medPickerNote(out, healthPermissionPath());

  return (
    <>
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Medications
      </Text>
      <Button
        title={picking ? 'Opening Health\u2026' : 'Choose which medications to import'}
        disabled={picking}
        onPress={() => { void pick(); }}
      />
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
        {'Doses you mark as taken in Health are filed under your own medication types, and one you have no type for yet offers to create it. Skipped doses are never imported. Doses only import for medications you share with Autonomic, so pick a newly prescribed one here.'}
      </Text>
      {note ? (
        <View style={{ marginTop: 10 }}>
          {note.kind === 'error'
            ? <StoreError text={note.text} />
            /* Full strength, not dim: it is the answer to a tap, and the line
               above it is dim body copy. */
            : <Text style={{ color: p.text, fontSize: 13, lineHeight: 19 }}>{note.text}</Text>}
        </View>
      ) : null}
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
