/**
 * "Measuring with" picker — the one place you choose where the heartbeat signal
 * comes from. Lists the available sources (Bluetooth strap, Apple Watch on iOS,
 * phone camera) and, in the same view, scans for nearby BLE heart-rate straps so
 * adding a device never means a detour into Settings. Tapping a nearby device
 * remembers it and selects Bluetooth in one go.
 *
 * Opened from the HRV setup card's "Change" link; picking closes it and reports
 * back to that card.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import type { SheetControls } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { Icon } from '../../components/Icon';
import { radius, usePalette } from '../../theme';
import { ble } from '../../lib/ble/manager';
import { sortDevices, type BleDevice } from '../../lib/ble/devices';
import { health } from '../../lib/health';
import { getState, save, useStore } from '../../store/store';

export type Source = 'polar' | 'watch' | 'camera';

const CLOSE_CLEARANCE = 58;
const SCAN_MS = 12000;

/** Shown when a scan finishes empty — also used by Settings → Devices. Straps
 *  are found by their advertisement, so the three ways to be invisible are: not
 *  broadcasting (dry/not worn), already held by the OS or another app, or out
 *  of battery. Naming them beats "no straps found", which reads as "unsupported". */
export const NO_STRAPS_HINT =
  'No straps found. Three things make a strap invisible:\n\n'
  + '·  It is not broadcasting — wet the electrodes and put the strap on, then scan again.\n'
  + '·  Something else is holding it — unpair it in system Bluetooth settings and quit other heart-rate apps.\n'
  + '·  Its battery is flat.';

/** One source's static copy. `sub` is resolved at render (the strap's line
 *  depends on whether a device is remembered). */
export const SOURCE_META: Record<Source, { icon: 'bluetooth' | 'watch' | 'camera'; title: string; badge: string }> = {
  polar: { icon: 'bluetooth', title: 'Bluetooth strap', badge: 'Best accuracy' },
  watch: { icon: 'watch', title: 'Apple Watch', badge: 'High accuracy' },
  camera: { icon: 'camera', title: 'Phone camera', badge: 'Lower accuracy' },
};

/** Sub-line for a source, used both here and on the setup card's summary row. */
export function sourceSub(src: Source, savedName?: string): string {
  if (src === 'polar') return savedName ? `${savedName} · paired` : 'No device paired yet';
  if (src === 'watch') return 'Breathe or ECG on the watch, syncs in after';
  return 'Fingertip on the rear camera, no device needed';
}

export function SourcePicker({ value, onPick, controls }: {
  value: Source; onPick: (s: Source) => void; controls: SheetControls;
}) {
  const p = usePalette();
  const toast = useToast();
  const savedName = useStore((s) => s.state.settings.lastBleDeviceName);
  const savedId = useStore((s) => s.state.settings.lastBleDeviceId);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  /** Why the last scan could not run (adapter off, permission denied). */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [found, setFound] = useState<BleDevice[]>([]);
  const mgr = useRef(ble()).current;
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startScan = async () => {
    if (!mgr.available) { toast('Bluetooth needs a development build'); return; }
    // Before any await: this sheet scans on open, so a bail-out that left
    // `scanned` false rendered an empty panel with no explanation at all.
    setFound([]);
    setBlocked(null);
    setScanned(true);
    const state = await mgr.ready();
    if (!state.ok) { setBlocked(state.message); return; }
    const ok = await mgr.requestPermissions();
    if (!ok) { setBlocked('Bluetooth permission denied. Allow it for Autonomic in system Settings, then scan again.'); return; }
    setScanning(true);
    await mgr.scan((d) => setFound((prev) => (prev.some((x) => x.id === d.id) ? prev : sortDevices([...prev, d]))));
    stopTimer.current = setTimeout(() => { mgr.stopScan(); setScanning(false); }, SCAN_MS);
  };

  // Scan as soon as the sheet opens: the whole point of listing devices here is
  // that a strap you just switched on shows up without another tap.
  useEffect(() => {
    startScan();
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      mgr.stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (s: Source) => { onPick(s); controls.close(); };

  const pair = (d: BleDevice) => {
    getState().settings.lastBleDeviceId = d.id;
    getState().settings.lastBleDeviceName = d.name;
    save();
    toast(`Saved ${d.name}`);
    choose('polar');
  };

  const showWatch = Platform.OS === 'ios' && health().available;
  const sources: Source[] = showWatch ? ['polar', 'watch', 'camera'] : ['polar', 'camera'];
  // A remembered strap is already listed as the Bluetooth source; don't repeat
  // it in the nearby list.
  const nearby = found.filter((d) => d.id !== savedId);

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Measuring with</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>
        Where the heartbeat signal comes from. A Bluetooth chest strap is the most accurate.
      </Text>

      <View style={{ gap: 8 }}>
        {sources.map((s) => (
          <SourceRow
            key={s}
            source={s}
            sub={sourceSub(s, savedName)}
            active={value === s}
            onPress={() => choose(s)}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>Nearby devices</Text>
        {scanning ? (
          <ActivityIndicator size="small" color={p.accent} />
        ) : (
          <Pressable onPress={startScan} hitSlop={8}><Text style={{ color: p.accent, fontSize: 13, fontWeight: '700' }}>{scanned ? 'Scan again' : 'Scan'}</Text></Pressable>
        )}
      </View>

      {nearby.length ? (
        <View style={{ gap: 8 }}>
          {nearby.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => pair(d)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}
            >
              <Icon name="bluetooth" size={20} color={p.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: p.text, fontWeight: '700' }}>{d.name}</Text>
                <Text style={{ color: p.textDim, fontSize: 12, marginTop: 3 }}>{d.connected ? 'Already connected to this phone' : `Signal ${d.rssi} dBm`}</Text>
              </View>
              <Text style={{ color: p.accent, fontSize: 13, fontWeight: '700' }}>Use</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19 }}>
          {scanning
            ? 'Looking for heart-rate straps. Put yours on and make sure it is not connected to another app.'
            : !scanned
              ? 'Tap Scan to look for heart-rate straps nearby.'
              // `nearby` hides the remembered strap, so an empty list here still
              // means success when the scan did find it — don't cry wolf.
              : found.length
                ? 'Your saved strap is listed above. No other straps nearby.'
                : blocked ?? NO_STRAPS_HINT}
        </Text>
      )}
      <View style={{ height: 16 }} />
    </View>
  );
}

function SourceRow({ source, sub, active, onPress }: {
  source: Source; sub: string; active: boolean; onPress: () => void;
}) {
  const p = usePalette();
  const meta = SOURCE_META[source];
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
      <Icon name={meta.icon} size={22} color={active ? p.accent : p.textDim} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{meta.title}</Text>
          {/* Unselected rows wear a slightly lighter grey pill border so the
              accuracy tag stays legible without competing with the selection. */}
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: active ? p.accent : '#47474e' }}>
            <Text style={{ color: active ? p.accent : p.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{meta.badge}</Text>
          </View>
        </View>
        <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 5 }}>{sub}</Text>
      </View>
      {active ? <Icon name="check" size={18} color={p.accent} /> : null}
    </Pressable>
  );
}
