/**
 * Apple Watch ECG sync — stacked over the session card when a watch reading
 * finishes. The wearer recorded an ECG during the capture window; Apple Health
 * receives it from the watch a few moments later. This card polls HealthKit for
 * an ECG whose start time falls inside the session window, derives beat-to-beat
 * RR intervals from the raw lead-I waveform, runs the full HRV pipeline on
 * them, and hands off to the normal results card. Cancel closes the whole
 * capture stack.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { usePalette } from '../../theme';
import { requestEcgAuth } from '../../lib/health/ecg';
import { rrFromEcg, type RawEcgSample } from '../../lib/health/ecgMetrics';
import { ecgNative } from '../../../modules/ecg-health';
import { HrvResults } from './Results';
import type { SessionConfig } from './Session';

const POLL_MS = 4000;
// The watch can take a little while to hand the sample to HealthKit, and its
// clock can drift slightly from the phone's — poll with a grace margin.
const GRACE_MS = 60000;

type Phase = 'syncing' | 'noauth' | 'unavailable' | 'found';

export function EcgSyncSheet({ windowStartMs, windowEndMs, config, controls }: {
  windowStartMs: number; windowEndMs: number; config: SessionConfig; controls: SheetControls;
}) {
  const p = usePalette();
  const [phase, setPhase] = useState<Phase>('syncing');
  const [waitedSec, setWaitedSec] = useState(0);
  const [result, setResult] = useState<{ rr: number[]; sample: RawEcgSample } | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let found = false;
    (async () => {
      const native = ecgNative();
      if (!native) { setPhase('unavailable'); return; }
      const ok = await requestEcgAuth();
      if (cancelled.current) return;
      if (!ok) { setPhase('noauth'); return; }

      const tick = async () => {
        if (cancelled.current || found) return;
        setWaitedSec((s) => s + POLL_MS / 1000);
        let raw: RawEcgSample[] = [];
        try { raw = await native.queryEcg(windowStartMs - GRACE_MS, 10); } catch { raw = []; }
        if (cancelled.current || found) return;
        const inWindow = raw.filter((s) => s.start >= windowStartMs - GRACE_MS && s.start <= windowEndMs + GRACE_MS);
        if (!inWindow.length) return;
        // The most recent ECG inside the window is the one from this session.
        const sample = inWindow.reduce((a, b) => (b.start > a.start ? b : a));
        found = true;
        if (timer) clearInterval(timer);
        setResult({ rr: rrFromEcg(sample), sample });
        setPhase('found');
      };
      await tick();
      if (!cancelled.current && !found) timer = setInterval(tick, POLL_MS);
    })();
    return () => { cancelled.current = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'found' && result) {
    const durationSec = Math.max(1, Math.round((result.sample.end - result.sample.start) / 1000));
    return (
      <HrvResults
        rr={result.rr}
        hrSamples={[]}
        config={config}
        durationSec={durationSec}
        watchFallback={result.sample.averageHeartRate ? { hr: Math.round(result.sample.averageHeartRate) } : null}
        controls={controls}
      />
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>Apple Watch</Text>
      <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginTop: 6, marginBottom: 22 }}>Syncing your ECG</Text>

      {phase === 'syncing' ? (
        <>
          <ActivityIndicator size="large" color={p.accent} />
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 22 }}>
            Looking in Apple Health for the ECG you recorded during this reading. The watch can take a moment to hand it over
            {waitedSec >= 20 ? ' — still checking' : ''}…
          </Text>
        </>
      ) : (
        <>
          <Icon name="alert" size={40} color={p.textDim} />
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 28, marginTop: 14 }}>
            {phase === 'unavailable'
              ? 'ECG import needs an iOS build with the ECG module — it is unavailable here.'
              : 'Health denied ECG access. Allow Electrocardiogram data for Autonomic in the Health app, then try again.'}
          </Text>
        </>
      )}

      <View style={{ height: 28 }} />
      <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
        <Button title="Cancel" variant="ghost" onPress={() => controls.closeAll()} />
      </View>
      <View style={{ height: 12 }} />
    </View>
  );
}
