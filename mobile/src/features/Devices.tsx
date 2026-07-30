/** Devices settings: scan, connect, remember, battery, forget. */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Button, Muted } from '../components/ui';
import { Icon } from '../components/Icon';
import type { SheetControls } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { ble } from '../lib/ble/manager';
import { sortDevices, type BleDevice } from '../lib/ble/devices';
import { NO_STRAPS_HINT } from './hrv/SourcePicker';
import { getState, save, useAppState } from '../store/store';

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
  const mgr = useRef(ble()).current;
  const savedId = state.settings.lastBleDeviceId;
  const savedName = state.settings.lastBleDeviceName;

  useEffect(() => () => { mgr.stopScan(); }, [mgr]);
  useEffect(() => {
    if (savedId) mgr.readBattery(savedId).then(setBattery).catch(() => {});
  }, [savedId, mgr]);

  const startScan = async () => {
    if (!mgr.available) { toast('Bluetooth needs a development build'); return; }
    const ok = await mgr.requestPermissions();
    if (!ok) { toast('Bluetooth permission denied'); return; }
    setFound([]);
    setScanning(true);
    setScanned(true);
    await mgr.scan((d) => setFound((prev) => (prev.some((x) => x.id === d.id) ? prev : sortDevices([...prev, d]))));
    setTimeout(() => { mgr.stopScan(); setScanning(false); }, 12000);
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

      <Button title={scanning ? 'Scanning…' : 'Scan for straps'} variant="primary" onPress={startScan} />
      {scanning ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}

      <View style={{ marginTop: 16 }}>
        {found.map((d) => (
          <Pressable key={d.id} onPress={() => remember(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: p.border }}>
            <Icon name="bluetooth" size={18} color={p.textDim} />
            <Text style={{ flex: 1, color: p.text }}>{d.name}</Text>
            <Text style={{ color: p.textDim, fontSize: 12 }}>{d.connected ? 'Connected' : `${d.rssi} dBm`}</Text>
            {d.id === savedId ? <Icon name="check" size={16} color={p.accent} /> : null}
          </Pressable>
        ))}
        {scanned && !scanning && !found.length ? (
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19 }}>{NO_STRAPS_HINT}</Text>
        ) : null}
      </View>
      <View style={{ height: 24 }} />
    </View>
  );
}
