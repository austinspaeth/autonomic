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
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SheetControls, SheetFooter } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette } from '../../theme';
import { garminDevices, subscribeGarminArrivals } from '../../lib/garmin/receiver';
import { minimizeGarminSync, stopGarminSync } from './garminSyncStore';
import { GarminIcon } from './GarminIcon';

export function GarminSyncSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const [arrived, setArrived] = useState(false);
  const device = garminDevices()[0];

  // The results card is opened by WatchArrivalCards, which listens globally —
  // so this card's only job on arrival is to get out of the way.
  useEffect(() => subscribeGarminArrivals(() => {
    setArrived(true);
    stopGarminSync();
    controls.close();
  }), [controls]);

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <GarminIcon />
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginTop: 14, textAlign: 'center' }}>
        {arrived ? 'Reading received' : 'Finish on your watch'}
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 6, marginBottom: 18 }}>
        {`Tap Finish on ${device ? device.name : 'your watch'} and the reading sends itself here. You can close this and carry on.`}
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
          onPress={() => { minimizeGarminSync(); controls.close(); }}
        />
      </SheetFooter>
    </View>
  );
}
