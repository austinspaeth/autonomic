/**
 * Full-screen 5-minute HRV capture session. Collects RR intervals (ms) + HR
 * from a BLE strap (or, for the watch path, from HealthKit after the fact),
 * shows a progress ring, live HR, a signal-quality hint, and — for breathing
 * readings — the guided breathing visualizer. Auto-finishes at 5:00; guards
 * against accidental exit. On finish it runs the HRV pipeline and shows results.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetControls, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { ACCENT, GRADE_COLORS } from '../../theme';
import { BreathingViz } from './BreathingViz';
import { HrvResults } from './Results';
import { ble } from '../../lib/ble/manager';
import { correctArtifacts } from '../../lib/hrv';
import { getState } from '../../store/store';
import { health } from '../../lib/health';

const DURATION = 300; // 5 minutes

export interface SessionConfig {
  kind: 'breath' | 'unstructured';
  style?: string; // e.g. "4/6"
  source: 'polar' | 'watch';
}

export function HrvSession({ config, controls }: { config: SessionConfig; controls: SheetControls }) {
  const insets = useSafeAreaInsets();
  const { openSheet } = useSheets();
  const [elapsed, setElapsed] = useState(0);
  const [hr, setHr] = useState<number | null>(null);
  const [connected, setConnected] = useState(config.source === 'watch');
  const [artifactHint, setArtifactHint] = useState(false);
  const rrRef = useRef<number[]>([]);
  const hrRef = useRef<{ t: number; bpm: number }[]>([]);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);
  const recentRr = useRef<number[]>([]);

  const [inS, exS] = (config.style || '4/6').split('/').map(Number);

  useEffect(() => {
    startRef.current = 0;
    // BLE path: connect + collect RR
    if (config.source === 'polar') {
      const saved = getState().settings.lastBleDeviceId;
      const mgr = ble();
      (async () => {
        if (!saved || !mgr.available) { setConnected(false); return; }
        try {
          await mgr.requestPermissions();
          await mgr.connect(saved, (s) => {
            setConnected(true);
            if (s.hr) { setHr(s.hr); }
            const now = Date.now();
            if (s.hr) hrRef.current.push({ t: now, bpm: s.hr });
            s.rr.forEach((v) => rrRef.current.push(v));
            // live artifact hint over the last ~10 beats
            recentRr.current = [...recentRr.current, ...s.rr].slice(-12);
            if (recentRr.current.length >= 6) {
              const { artifactPct } = correctArtifacts(recentRr.current);
              setArtifactHint(artifactPct > 20);
            }
          }, () => setConnected(false));
        } catch { setConnected(false); }
      })();
    }
    // tick every second
    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= DURATION) finish();
        return Math.min(next, DURATION);
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (config.source === 'polar') ble().disconnect().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.source === 'polar') await ble().disconnect().catch(() => {});

    let rr = rrRef.current.slice();
    // Watch path: no live RR — pull SDNN/HR from HealthKit as a graceful fallback.
    let watchFallback: { sdnn?: number; hr?: number } | null = null;
    if (config.source === 'watch' && rr.length < 30) {
      const api = health();
      if (api.available) {
        try {
          await api.requestAuth();
          const dk = new Date().toISOString().slice(0, 10);
          const s = await api.readDay(dk);
          watchFallback = { sdnn: s.hrvSdnn ?? undefined, hr: s.restingHr ?? undefined };
        } catch { /* ignore */ }
      }
    }
    openSheet((c) => (
      <HrvResults rr={rr} hrSamples={hrRef.current} config={config} durationSec={elapsed} watchFallback={watchFallback} controls={c} rootControls={controls} />
    ), { fullscreen: true });
    controls.close();
  };

  const confirmExit = () => {
    Alert.alert('End reading?', 'Your progress will be discarded.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => controls.close() },
    ]);
  };

  const frac = elapsed / DURATION;
  const remain = DURATION - elapsed;
  const mmss = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;

  const R = 130, SW = 10, C = 2 * Math.PI * R;
  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top + 8, alignItems: 'center' }}>
      <Text style={{ color: '#8a8a90', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>
        {config.kind === 'breath' ? `Breathing HRV · ${config.style}` : 'Unstructured HRV'}
      </Text>

      <View style={{ marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={2 * (R + SW)} height={2 * (R + SW)}>
          <Circle cx={R + SW} cy={R + SW} r={R} stroke="#1f1f22" strokeWidth={SW} fill="none" />
          <Circle cx={R + SW} cy={R + SW} r={R} stroke={artifactHint ? GRADE_COLORS.bad : ACCENT} strokeWidth={SW} fill="none" strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - frac)} transform={`rotate(-90 ${R + SW} ${R + SW})`} />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          {config.kind === 'breath' ? (
            <BreathingViz inhaleSec={inS} exhaleSec={exS} running={connected || config.source === 'watch'} />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 16, marginBottom: 8 }}>Stay still, breathe normally</Text>
              <Text style={{ color: '#fff', fontSize: 59, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{mmss}</Text>
            </View>
          )}
        </View>
      </View>

      {config.kind === 'breath' ? <Text style={{ color: '#fff', fontSize: 46, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 12 }}>{mmss}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 24, marginTop: 20 }}>
        <Stat label="HR" value={hr != null ? String(hr) : '—'} unit="bpm" />
        <Stat label="Beats" value={String(rrRef.current.length)} unit="RR" />
      </View>

      {!connected && config.source === 'polar' ? <Text style={{ color: GRADE_COLORS.ok, marginTop: 16 }}>Connecting to strap…</Text> : null}
      {artifactHint ? <Text style={{ color: GRADE_COLORS.bad, marginTop: 10 }}>Signal noisy — adjust the strap</Text> : null}
      {config.source === 'watch' ? <Text style={{ color: '#8a8a90', marginTop: 16, textAlign: 'center', paddingHorizontal: 32 }}>Start a Breathe or Mindfulness session on your Apple Watch. Beat-to-beat data will be read from Health at the end.</Text> : null}

      <View style={{ position: 'absolute', bottom: insets.bottom + 20, left: 20, right: 20, flexDirection: 'row', gap: 12 }}>
        <Button title="Stop" variant="danger" onPress={confirmExit} />
        <Button title="Finish now" variant="primary" onPress={finish} />
      </View>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: '#8a8a90', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 29, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: '#8a8a90', fontSize: 11 }}>{unit}</Text>
    </View>
  );
}
