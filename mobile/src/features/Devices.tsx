/** Devices settings: scan, connect, remember, battery, forget. */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Muted } from '../components/ui';
import { Icon } from '../components/Icon';
import { useSheets, type SheetControls } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { ble } from '../lib/ble/manager';
import { formatDiagnostics, sortDevices, type BleDevice } from '../lib/ble/devices';
import { partitionStraps } from '../lib/watch/brands';
import { NO_STRAPS_HINT } from './hrv/SourcePicker';
import { PromptSheet } from './PromptSheet';
import { getState, save, useAppState } from '../store/store';

/** Hold "Scan for straps" this long to collect a Bluetooth diagnostics dump.
 *  Deliberately far past any accidental press — it is a support tool, not a
 *  feature, and nobody should find it by fumbling. */
const DIAGNOSTICS_HOLD_MS = 8000;

/** When opened mid-flow (HRV setup, onboarding), pass the sheet's `controls`
 *  so pairing a strap closes this sheet and drops you back where you were. */
export function DevicesScreen({ controls }: { controls?: SheetControls } = {}) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<BleDevice[]>([]);
  const [battery, setBattery] = useState<number | null>(null);
  const [scanned, setScanned] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  /** Why the last scan could not run (adapter off, permission denied). */
  const [blocked, setBlocked] = useState<string | null>(null);
  const { openSheet } = useSheets();
  const mgr = useRef(ble()).current;
  const savedId = state.settings.lastBleDeviceId;
  const savedName = state.settings.lastBleDeviceName;

  useEffect(() => () => { mgr.stopScan(); }, [mgr]);
  // Ask on arrival rather than on the first Scan tap. The permission sheet is
  // the one thing that must not land *during* a scan: on Android the scan runs
  // regardless and quietly returns nothing, so the user reads "no straps found"
  // when the real answer is "never allowed to look".
  useEffect(() => { if (mgr.available) mgr.requestPermissions().catch(() => {}); }, [mgr]);
  useEffect(() => {
    if (savedId) mgr.readBattery(savedId).then(setBattery).catch(() => {});
  }, [savedId, mgr]);

  const startScan = async () => {
    if (!mgr.available) { toast('Bluetooth needs a development build'); return; }
    // Mark the attempt BEFORE any await: everything below can bail, and a scan
    // that explains itself is the whole point of this screen.
    setFound([]);
    setBlocked(null);
    setScanned(true);
    const state = await mgr.ready();
    if (!state.ok) { setBlocked(state.message); return; }
    const ok = await mgr.requestPermissions();
    if (!ok) { setBlocked('Bluetooth permission denied. Allow it for Autonomic in system Settings, then scan again.'); return; }
    setScanning(true);
    await mgr.scan((d) => setFound((prev) => (prev.some((x) => x.id === d.id) ? prev : sortDevices([...prev, d]))));
    setTimeout(() => { mgr.stopScan(); setScanning(false); }, 12000);
  };

  // Held the Scan button for 8s: collect a dump the user can paste into a
  // support email. Runs its own unfiltered scan, so stop the visible one first
  // and take the saved-device fields along — a mismatch between what's
  // remembered and what's nearby is itself a common cause.
  const diagnose = async () => {
    if (diagnosing) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    mgr.stopScan();
    setScanning(false);
    setDiagnosing(true);
    try {
      const report = await mgr.diagnose({ id: savedId, name: savedName });
      openSheet((c) => (
        <PromptSheet
          controls={c}
          title="Bluetooth diagnostics"
          rangeText="Bluetooth diagnostics"
          subtitle="A snapshot of this phone's Bluetooth state and everything it can currently see. Send this to support — it contains no health data, and nearby devices that aren't heart-rate straps are listed without their names."
          prompt={formatDiagnostics(report)}
        />
      ));
    } catch {
      toast('Could not collect diagnostics');
    } finally {
      setDiagnosing(false);
    }
  };

  const remember = (d: BleDevice) => {
    getState().settings.lastBleDeviceId = d.id;
    getState().settings.lastBleDeviceName = d.name;
    save();
    toast(`Saved ${d.name}`);
    controls?.close();
  };

  const forget = () => {
    delete getState().settings.lastBleDeviceId;
    delete getState().settings.lastBleDeviceName;
    save();
    setBattery(null);
  };

  // A watch advertising heart rate connects here like any strap and then
  // produces a reading with no intervals to score, so it is never offered as
  // one. Saying WHY beats a silent omission: the user can see it on the wrist.
  const { straps, watches } = partitionStraps(found);

  return (
    <View>
      {/* Inset the header text so it clears the floating ✕ pill. */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: 58 }}>Devices</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16, paddingRight: 58 }}>Connect a Bluetooth heart-rate strap (e.g. Polar H10) for live HRV readings.</Text>

      {savedId ? (
        <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 14, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="bluetooth" size={20} color={p.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontWeight: '700' }}>{savedName || 'Saved strap'}</Text>
              <Text style={{ color: p.textDim, fontSize: 12 }}>{battery != null ? `Battery ${battery}%` : 'Remembered device'}</Text>
            </View>
            <Pressable onPress={forget}><Text style={{ color: p.accent, fontWeight: '600' }}>Forget</Text></Pressable>
          </View>
        </View>
      ) : <Muted>No saved device.</Muted>}

      <Button
        title={diagnosing ? 'Collecting diagnostics…' : scanning ? 'Scanning…' : 'Scan for straps'}
        variant="primary"
        onPress={startScan}
        onLongPress={diagnose}
        delayLongPress={DIAGNOSTICS_HOLD_MS}
        disabled={diagnosing}
      />
      {scanning || diagnosing ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}

      <View style={{ marginTop: 16 }}>
        {straps.map((d) => (
          <Pressable key={d.id} onPress={() => remember(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: p.border }}>
            <Icon name="bluetooth" size={18} color={p.textDim} />
            <Text style={{ flex: 1, color: p.text }}>{d.name}</Text>
            <Text style={{ color: p.textDim, fontSize: 12 }}>{d.connected ? 'Connected' : `${d.rssi} dBm`}</Text>
            {d.id === savedId ? <Icon name="check" size={16} color={p.accent} /> : null}
          </Pressable>
        ))}
        {scanned && !scanning && !straps.length ? (
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19 }}>{blocked ?? NO_STRAPS_HINT}</Text>
        ) : null}
        {watches.length > 0 && !blocked ? (
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: straps.length ? 12 : 0 }}>
            A nearby watch was hidden from this list. Watches broadcast a heart rate but not the beat-to-beat timing a reading needs. Use Capture instead, and pick your watch there.
          </Text>
        ) : null}
      </View>
      <View style={{ height: 24 }} />
    </View>
  );
}
