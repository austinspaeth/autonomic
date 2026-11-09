/**
 * Shown when a Garmin session's timer runs out: the phone has been counting
 * alongside the watch, and now waits for the watch to send what it measured.
 *
 * The Apple Watch has WatchSyncSheet for the same moment. Garmin needs its own
 * because the reading does not come from the health store — it arrives over the
 * Connect IQ link, pushed by the watch when the wearer finishes there.
 *
 * Crucially this card does NOT build a reading. Without it the session fell
 * through to the strap/camera path, which constructs a result from whatever the
 * phone captured — and the phone captured nothing, so every Garmin reading
 * ended in "not enough clean data, 0 beats".
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette } from '../../theme';
import { garminDevices, subscribeGarminArrivals } from '../../lib/garmin/receiver';
import { getGarminSyncState, minimizeGarminSync, stopGarminSync, subscribeGarminSync } from './garminSyncStore';
import { GarminIcon } from './GarminIcon';

/** What the watch's own failure screen said, in the phone's words, so the two
 *  agree. Keyed by `signalWord` (lib/garmin/diag), mirroring
 *  `RrView.drawFailure` on the watch. */
export function garminFailureCopy(signal: string): string {
  if (signal === 'nopulse') {
    return 'Your watch could not find a pulse. Wear the band snug, a finger above the wrist bone, and check that wrist heart rate is turned on in the watch settings.';
  }
  if (signal === 'thin') {
    return 'Your watch found your pulse but caught too few beats to use. Rest your arm still and try again.';
  }
  // `nobeats` is the sensor, not the wearer: the pulse proves contact, and on
  // some Garmin models and firmware the optical sensor never hands
  // beat-to-beat data to a Connect IQ app at all. Telling somebody to tighten a
  // band that is already tight sends them round the loop again for nothing.
  return 'Your watch found your pulse, but its sensor did not share the beat-to-beat data an HRV reading needs. Some Garmin models do not share it with apps, and a tighter band will not change that. Your phone camera or a chest strap can take the reading instead.';
}

export function GarminSyncSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { closeAll } = useSheets();
  const [arrived, setArrived] = useState(false);
  const st = useSyncExternalStore(subscribeGarminSync, getGarminSyncState);
  const device = garminDevices()[0];
  const watch = device ? device.name : 'your watch';

  // The results card is opened by WatchArrivalCards, which listens globally —
  // so this card's only job on arrival is to get out of the way.
  useEffect(() => subscribeGarminArrivals(() => {
    setArrived(true);
    stopGarminSync();
    controls.close();
  }), [controls]);

  // The watch gave up and said so (a `diag` message). Nothing is coming: say
  // what the watch saw and end the wait. This card used to spin on, and the
  // pill behind it with no way to stop it, after the watch had already shown
  // "No signal".
  if (st.failed) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <GarminIcon />
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginTop: 14, textAlign: 'center' }}>
          No reading from {watch}
        </Text>
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 6, marginBottom: 18 }}>
          {garminFailureCopy(st.failed)}
        </Text>
        <SheetFooter>
          <Button title="Done" style={{ flex: 1 }} onPress={() => { stopGarminSync(); closeAll(); }} />
        </SheetFooter>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <GarminIcon />
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginTop: 14, textAlign: 'center' }}>
        {arrived ? 'Reading received' : 'Waiting for your watch'}
      </Text>
      {/* The watch has no Finish button: it ends the reading itself at five
          minutes, shows a check mark and sends it. "Tap Finish on your watch"
          sent people looking for a button that does not exist. */}
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 6, marginBottom: 18 }}>
        {`${device ? device.name : 'Your watch'} ends the reading on its own after five minutes and sends it here. Keep the Autonomic app open on the watch until it shows a check mark, with your phone nearby.`}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ActivityIndicator size="small" color={p.accent} />
        <Text style={{ color: p.textDim, fontSize: 12.5 }}>Waiting for the watch</Text>
      </View>

      <SheetFooter>
        {/* Closing does not cancel anything: the watch holds the reading until
            this phone acknowledges it, so it arrives whenever they next meet.
            The wait moves to the floating pill, exactly as the Apple Watch
            sync does. */}
        <Button
          title="Continue using app"
          variant="ghost"
          style={{ flex: 1 }}
          onPress={() => { minimizeGarminSync(); controls.close(); }}
        />
        {/* A way out. The wait had none, so a reading that was never coming
            left a spinner and a pill that could not be dismissed. Stopping the
            wait loses nothing: a reading the watch still holds arrives anyway
            and opens its own results card (WatchArrivalCards). */}
        <Button
          title="Stop waiting"
          variant="ghost"
          style={{ flex: 1 }}
          onPress={() => { stopGarminSync(); closeAll(); }}
        />
      </SheetFooter>
    </View>
  );
}
