/**
 * Apple Watch sync — stacked over the session card when a watch reading
 * finishes. The wearer took a reading on the watch during the capture window:
 * a Mindfulness/Breathe session (the watch records a heartbeat series with
 * real beat-to-beat RR) or an ECG. Apple Health receives it from the watch a
 * few moments later. This card renders the module-level poller in
 * watchSyncStore.ts, which watches HealthKit for any RR-backed reading near
 * the session window — heartbeat series and ECGs — and hands the RR intervals
 * to the normal results card. If more than one reading lands in the window it
 * asks which one to use. Cancel closes the whole capture stack.
 *
 * "Continue using app" minimizes the card: the sheet stack closes but the
 * poller keeps running, and the floating WatchSyncPill takes over until the
 * reading lands (or the pill is tapped to bring this card back).
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SheetControls, SheetFooter } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { usePalette } from '../../theme';
import { fmtTime12 } from '../../lib/dates';
import { HrvResults } from './Results';
import {
  getWatchSyncState, minimizeWatchSync, stopWatchSync, subscribeWatchSync, type WatchCandidate,
} from './watchSyncStore';

const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (ms: number) => {
  const d = new Date(ms);
  return fmtTime12(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
};
const durLabel = (c: WatchCandidate) => {
  const sec = Math.max(1, Math.round((c.endMs - c.startMs) / 1000));
  return sec >= 90 ? `${Math.round(sec / 60)} min` : `${sec}s`;
};

export function WatchSyncSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const st = useSyncExternalStore(subscribeWatchSync, getWatchSyncState);
  const [picked, setPicked] = useState<WatchCandidate | null>(null);

  // The poller outlives this card so "Continue using app" can close it without
  // losing the sync. Reset it only when the card goes away for good — cancel,
  // results saved/discarded, error dismissed — never on a minimize.
  useEffect(() => () => { if (!getWatchSyncState().minimized) stopWatchSync(); }, []);

  const cancel = () => { stopWatchSync(); controls.closeAll(); };
  const minimize = () => { minimizeWatchSync(); controls.closeAll(); };

  const chosen = picked ?? (st.status === 'found' && st.candidates.length === 1 ? st.candidates[0] : null);

  if (chosen && st.config) {
    const durationSec = Math.max(1, Math.round((chosen.endMs - chosen.startMs) / 1000));
    return (
      <HrvResults
        rr={chosen.rr}
        hrSamples={[]}
        config={st.config}
        durationSec={durationSec}
        watchFallback={chosen.avgHr != null ? { hr: chosen.avgHr } : null}
        controls={controls}
      />
    );
  }

  if (st.status === 'found') {
    return (
      <View style={{ paddingTop: 24, paddingBottom: 8 }}>
        <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', textAlign: 'center' }}>Apple Watch</Text>
        <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginTop: 6, textAlign: 'center' }}>Which reading?</Text>
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 8, marginBottom: 18 }}>
          More than one watch reading landed near this session. Pick the one to use.
        </Text>
        {st.candidates.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setPicked(c)}
            style={({ pressed }) => ({ backgroundColor: p.surface2, borderRadius: 14, padding: 16, marginBottom: 10, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>
              {c.kind === 'hrv' ? 'HRV reading' : 'ECG'} · {timeOf(c.startMs)}
            </Text>
            <Text style={{ color: p.textDim, fontSize: 13, marginTop: 3 }}>
              {durLabel(c)} · {c.rr.length} beats
            </Text>
          </Pressable>
        ))}
        <SheetFooter>
          <Button title="Cancel" variant="ghost" onPress={cancel} />
        </SheetFooter>
      </View>
    );
  }

  const syncing = st.status === 'syncing' || st.status === 'idle';

  return (
    <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>Apple Watch</Text>
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginTop: 6, marginBottom: 22 }}>Syncing your reading</Text>

      {syncing ? (
        <>
          <ActivityIndicator size="large" color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 22 }}>
            Looking in Apple Health for the reading you took on your watch, a Mindfulness breathing session or an ECG. The hand-off can take 1-2 minutes
            {st.waitedSec >= 20 ? ', still checking' : ''}…
          </Text>
          {st.waitedSec >= 60 ? (
            <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 28, marginTop: 12 }}>
              Not seeing it yet. Keep your watch near your phone. Opening the Health app once can nudge the sync.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Icon name="alert" size={40} color={p.textDim} />
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 14 }}>
            {st.status === 'unavailable'
              ? 'Watch sync needs an iOS build with Apple Health.'
              : 'Health access is denied. In the Health app, allow Autonomic to read Heart and Electrocardiogram data, then try again.'}
          </Text>
        </>
      )}

      <View style={{ height: 28 }} />
      {syncing ? (
        <>
          <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
            <Button title="Continue using app" onPress={minimize} />
          </View>
          <View style={{ height: 10 }} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
        <Button title="Cancel" variant="ghost" onPress={cancel} />
      </View>
      <View style={{ height: 12 }} />
    </View>
  );
}
