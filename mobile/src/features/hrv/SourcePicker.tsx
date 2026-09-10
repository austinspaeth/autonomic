/**
 * "Measuring with" picker — the one place you choose where the heartbeat signal
 * comes from. Lists the available sources (Bluetooth strap, Apple Watch on iOS,
 * other watch brands, phone camera) and, in the same view, scans for nearby BLE
 * heart-rate straps so adding a device never means a detour into Settings.
 * Tapping a nearby device remembers it and selects Bluetooth in one go.
 *
 * The list is GROUPED BY ACCURACY TIER, and that is the only ranking it draws.
 * With five watch brands, a strap and the camera, an accuracy pill on every row
 * meant seven pills competing with seven names; a section label says the same
 * thing once and frees the row for the device and its state. The four
 * non-Apple brands collapse behind a single "Other watches" row (see
 * ./WatchBrands) because every one of them lands in the same tier as the Apple
 * Watch — a wrist optical sensor — so listing them flat would spend the whole
 * sheet on a distinction that does not exist.
 *
 * Opened from the HRV setup card's "Change" link; picking closes it and reports
 * back to that card.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { Icon } from '../../components/Icon';
import { radius, usePalette } from '../../theme';
import { ble } from '../../lib/ble/manager';
import { sortDevices, type BleDevice } from '../../lib/ble/devices';
import { garminDevices, subscribeGarminDevices, type GarminDevice } from '../../lib/garmin/receiver';
import { health } from '../../lib/health';
import { getState, save, useStore } from '../../store/store';
import { partitionStraps } from '../../lib/watch/brands';
import { brandTag, hasOtherWatches, openBrandSetup, otherWatchesSub, otherWatchesTitle, PickerRow } from './WatchBrands';

export type Source = 'polar' | 'watch' | 'garmin' | 'camera';

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

/** The accuracy ladder, best first. It is a TABLE rather than a pill on each
 *  row because two surfaces rank these sources — this sheet and the welcome
 *  wizard's first-reading step — and a per-row badge let them drift: the wizard
 *  once listed a "High accuracy" watch above a "Best accuracy" strap, which
 *  reads as a descending list until the second row contradicts it. Both now
 *  group by tier in TIER_ORDER, so a new sensor is one row here. */
export type SourceTier = 'best' | 'high' | 'lower';
export const TIER_ORDER: SourceTier[] = ['best', 'high', 'lower'];
export const TIER_LABEL: Record<SourceTier, string> = {
  best: 'Best accuracy', high: 'High accuracy', lower: 'Lower accuracy',
};

/** One source's static copy. `sub` is resolved at render (the strap's line
 *  depends on whether a device is remembered). */
export const SOURCE_META: Record<Source, { icon: 'bluetooth' | 'watch' | 'camera'; title: string; tier: SourceTier }> = {
  polar: { icon: 'bluetooth', title: 'Bluetooth strap', tier: 'best' },
  watch: { icon: 'watch', title: 'Apple Watch', tier: 'high' },
  garmin: { icon: 'watch', title: 'Garmin', tier: 'high' },
  camera: { icon: 'camera', title: 'Phone camera', tier: 'lower' },
};

/** Sub-line for a source, used both here and on the setup card's summary row. */
export function sourceSub(src: Source, savedName?: string): string {
  if (src === 'polar') return savedName ? `${savedName} · paired` : 'No device paired yet';
  if (src === 'watch') return 'Breathe or ECG on the watch, results sync in afterwards';
  // Named device rather than "Garmin" alone: someone who linked a watch months
  // ago should see which one this row means.
  if (src === 'garmin') return savedName ? `${savedName} · linked` : 'Run Autonomic on the watch, results sync in afterwards';
  return 'Fingertip on the rear camera, no device needed';
}

export function SourcePicker({ value, onPick, controls }: {
  value: Source; onPick: (s: Source) => void; controls: SheetControls;
}) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
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
  // A linked Garmin is a SOURCE (it delivers raw beat-to-beat straight to us);
  // an unlinked one is only a setup task, and stays inside Other watches.
  // Subscribed, not read once: the device list arrives from Garmin Connect
  // through a URL callback well after this sheet first rendered, so a plain
  // read leaves the row missing until the sheet is reopened.
  const [garmin, setGarmin] = useState<GarminDevice[]>(garminDevices);
  // Just mirror the list. Selecting on link is the setup card's job (it knows
  // the user actually asked); doing it here too would let a device discovered
  // at launch quietly change a source the user had already chosen.
  useEffect(() => subscribeGarminDevices(setGarmin), []);
  const linkedGarmin = garmin[0];
  const showBrands = hasOtherWatches();
  // A remembered strap is already listed as the Bluetooth source; don't repeat
  // it in the nearby list.
  // A watch broadcasting its heart rate advertises exactly like a strap, but
  // sends no beat-to-beat intervals — pairing one here yields a reading that
  // cannot be scored. They are pulled out and pointed at the proper route.
  const { straps, watches } = partitionStraps(found);
  const nearby = straps.filter((d) => d.id !== savedId);
  const watchesSeen = watches.length > 0;

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Measuring with</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>
        {/* The tier headings below already rank these, so the old
            "a chest strap is the most accurate" tail would say it twice. */}
        Where the heartbeat signal comes from.
      </Text>


      <TierLabel text={TIER_LABEL.best} />
      <SourceRow source="polar" sub={sourceSub('polar', savedName)} active={value === 'polar'} onPress={() => choose('polar')} />

      {showWatch || linkedGarmin || showBrands ? (
        <>
          <TierLabel text={TIER_LABEL.high} top />
          <View style={{ gap: 8 }}>
            {showWatch ? (
              <SourceRow source="watch" sub={sourceSub('watch', savedName)} active={value === 'watch'} onPress={() => choose('watch')} />
            ) : null}
            {linkedGarmin ? (
              // Set up and done with: the row is now a plain source, and setup
              // moves into its sub-line as a link — a "Set up" button beside a
              // watch that IS set up asks the user to redo the thing they
              // finished, and hides the fact that the row can now be chosen.
              <SourceRow
                source="garmin"
                sub={sourceSub('garmin', linkedGarmin.name)}
                active={value === 'garmin'}
                onPress={() => choose('garmin')}
                link={{ label: 'Set up', onPress: () => openBrandSetup(openSheet, () => onPick('garmin')) }}
              />
            ) : null}
            {/* Not a source — a setup task, so the row says so and opens the
                brand's own card rather than selecting anything. It goes STRAIGHT
                to setup: with one brand built, the list card in between was a
                screen that existed only to be tapped through. */}
            {showBrands ? (
              <PickerRow
                icon="watch"
                title={otherWatchesTitle()}
                tag={brandTag()}
                sub={otherWatchesSub()}
                onPress={() => openBrandSetup(openSheet, () => onPick('garmin'))}
              >
                <Text style={{ color: p.accent, fontSize: 13, fontWeight: '700' }}>Set up</Text>
              </PickerRow>
            ) : null}
          </View>
        </>
      ) : null}

      <TierLabel text={TIER_LABEL.lower} top />
      <SourceRow source="camera" sub={sourceSub('camera', savedName)} active={value === 'camera'} onPress={() => choose('camera')} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>Nearby straps</Text>
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

      {watchesSeen ? (
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
          {/* The REASON always holds — broadcast mode cannot be scored however
              the app is configured — but the pointer only holds while the row
              it points at is on screen. With the brands row held back, "set it
              up under Other watches" sends the user looking for something that
              is not there, which reads as a bug in the sheet rather than as a
              feature that has not shipped. */}
          {showBrands
            ? 'A watch is broadcasting its heart rate nearby. Set it up under Other watches instead. Broadcast mode sends a pulse rate only, without the beat-to-beat detail an HRV reading needs.'
            : 'A watch is broadcasting its heart rate nearby. It cannot be used for a reading: broadcast mode sends a pulse rate only, without the beat-to-beat detail an HRV reading needs.'}
        </Text>
      ) : null}
      <View style={{ height: 16 }} />
    </View>
  );
}

/** One accuracy tier's heading. Same treatment as the "Nearby straps" label
 *  below it — this sheet has one kind of section label, not two. */
function TierLabel({ text, top }: { text: string; top?: boolean }) {
  const p = usePalette();
  return (
    <Text style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginTop: top ? 20 : 0, marginBottom: 10 }}>{text}</Text>
  );
}

function SourceRow({ source, sub, active, onPress, link }: {
  source: Source; sub: string; active: boolean; onPress: () => void;
  /** Optional second action in the sub-line (e.g. "Set up" on a linked watch):
   *  choosing a source and re-opening its setup are different questions, and a
   *  row that only selects strands anyone who needs the second one. */
  link?: { label: string; onPress: () => void };
}) {
  const p = usePalette();
  const meta = SOURCE_META[source];
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
      <Icon name={meta.icon} size={22} color={active ? p.accent : p.textDim} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* No accuracy pill: the tier heading above the row already said it. */}
        <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{meta.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ flexShrink: 1, color: p.textDim, fontSize: 12, lineHeight: 17 }}>{sub}</Text>
          {link ? (
            <Pressable onPress={link.onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={link.label}>
              <Text style={{ color: p.accent, fontSize: 12, lineHeight: 17, fontWeight: '700' }}>{link.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {active ? <Icon name="check" size={18} color={p.accent} /> : null}
    </Pressable>
  );
}
