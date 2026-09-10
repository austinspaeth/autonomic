/**
 * The Garmin equivalent of WatchPrep.
 *
 * The reading is taken ON THE WATCH — there is no live stream to the phone, by
 * design: the watch sends the whole beat-to-beat series in one message when it
 * finishes. So the phone's live capture card (timer, rolling SDNN, RR trace)
 * would sit empty for five minutes and read as broken. This card is what
 * belongs here instead: tell the user what to do, then wait.
 *
 * There is deliberately no "open the app on your watch" button. Connect IQ's
 * open-app request returns Failure_PromptNotDisplayed for a SIDELOADED app —
 * Garmin Connect will not prompt for an app it does not recognise — so the
 * button could only ever fail here. The steps are written to stand on their own
 * instead. Worth revisiting once the watch app is published to the store, where
 * the request may well be honoured.
 */
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { radius, usePalette } from '../../theme';
import { garminDevices, subscribeGarminArrivals } from '../../lib/garmin/receiver';
import { GarminIcon } from './GarminIcon';
import { HrvSession } from './Session';
import type { SessionConfig } from './sessionStore';

const STEPS = [
  {
    title: 'Open Autonomic on your watch',
    sub: 'It is in the Activities & Apps list. The button below can open it for you.',
  },
  {
    title: 'Choose HRV Reading, then Start on the watch',
    sub: 'The watch runs the reading itself and counts down five minutes.',
  },
  {
    title: 'Tell us below, then sit still',
    sub: 'When the watch finishes, the reading appears here on its own. Nothing to sync.',
  },
];

export function GarminPrep({ config, controls }: { config: SessionConfig; controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const device = garminDevices()[0];

  // Start here = start on the wrist. The session card opens already running, so
  // the phone shows the same timer (and, for a training reading, the same
  // breathing pace) it would for any other source — the watch simply supplies
  // the beats, and they arrive in one message at the end.
  const start = () => {
    openSheet((c) => <HrvSession config={config} autoStart controls={c} />, { hideClose: true, grow: true });
    controls.close();
  };

  // The reading may land while this card is still up — the wearer never has to
  // come back to the phone. The results card opens over the top (WatchArrivals),
  // so this one simply gets out of the way.
  useEffect(() => subscribeGarminArrivals(() => { controls.close(); }), [controls]);


  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <GarminIcon />
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginTop: 14, textAlign: 'center' }}>
        Get your watch ready
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 6, marginBottom: 18 }}>
        The reading itself is taken by Autonomic on your {device ? device.name : 'watch'} and syncs in here when it finishes.
      </Text>

      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ color: p.accent, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontWeight: '700' }}>{s.title}</Text>
              <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{s.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {device?.connected === false ? (
        <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 16 }}>
          That watch is not connected right now.
        </Text>
      ) : null}

      <SheetFooter>
        {/* Same wording as the Apple Watch prep card: the phone starts nothing,
            it follows along with the timer once the wearer says they have
            begun. */}
        <Button title="I started the reading" variant="danger" onPress={start} />
      </SheetFooter>
    </View>
  );
}
