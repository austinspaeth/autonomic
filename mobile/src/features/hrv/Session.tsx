/**
 * 5-minute HRV capture — presented as a stacked card modal (no ✕; it closes
 * itself). Choosing settings opens this card with a "Start reading" button; the
 * breathing guide animates immediately so you can settle into the rhythm, but
 * the timer and RR/HR collection do not begin until Start is pressed. Once
 * running, a single "Finish now" ends early; it also auto-finishes at 5:00. On
 * finish it runs the HRV pipeline and shows results.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette, GRADE_COLORS } from '../../theme';
import { BreathingViz } from './BreathingViz';
import { HrvResults } from './Results';
import { ble } from '../../lib/ble/manager';
import { correctArtifacts } from '../../lib/hrv';
import { getState } from '../../store/store';

const DURATION = 300; // 5 minutes

export interface SessionConfig {
  kind: 'breath' | 'unstructured';
  style?: string; // e.g. "4/6"
  source: 'polar' | 'watch';
}

export function HrvSession({ config, controls }: { config: SessionConfig; controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hr, setHr] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [artifactHint, setArtifactHint] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const rrRef = useRef<number[]>([]);
  const hrRef = useRef<{ t: number; bpm: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);
  const recentRr = useRef<number[]>([]);

  const [inS, exS] = (config.style || '4/6').split('/').map(Number);

  // Collection + timer only begin on Start. The breathing guide runs regardless.
  const begin = () => {
    if (started) return;
    setStarted(true);
    if (config.source === 'watch') setConnected(true);
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
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.source === 'polar') ble().disconnect().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.source === 'polar') await ble().disconnect().catch(() => {});

    // Apple Watch is a guided breathing/timing aid only — it records nothing to
    // the app or Apple Health. Just close the session out.
    if (config.source === 'watch') { controls.close(); return; }

    const rr = rrRef.current.slice();
    openSheet((c) => (
      <HrvResults rr={rr} hrSamples={hrRef.current} config={config} durationSec={elapsed} watchFallback={null} controls={c} rootControls={controls} />
    ), { fullscreen: true });
    controls.close();
  };

  const frac = started ? elapsed / DURATION : 0;
  const remain = DURATION - elapsed;
  const mmss = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;

  const R = 108, SW = 9, C = 2 * Math.PI * R;
  const ringSize = 2 * (R + SW);

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>
        {config.kind === 'breath' ? `Breathing HRV · ${config.style}` : 'Unstructured HRV'}
      </Text>

      <View style={{ width: ringSize, height: ringSize, marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
          <Circle cx={R + SW} cy={R + SW} r={R} stroke={p.surface2} strokeWidth={SW} fill="none" />
          <Circle cx={R + SW} cy={R + SW} r={R} stroke={artifactHint ? GRADE_COLORS.bad : p.accent} strokeWidth={SW} fill="none" strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - frac)} transform={`rotate(-90 ${R + SW} ${R + SW})`} />
        </Svg>
        {config.kind === 'breath' ? (
          <BreathingViz inhaleSec={inS} exhaleSec={exS} running onPhase={setPhase} />
        ) : (
          <Text style={{ color: p.textDim, fontSize: 16, textAlign: 'center', paddingHorizontal: 40 }}>Stay still,{'\n'}breathe normally</Text>
        )}
      </View>

      {config.kind === 'breath' ? (
        <Text style={{ color: p.accent, fontSize: 18, fontWeight: '700', letterSpacing: 0.3, marginTop: 18 }}>
          {phase === 'in' ? 'Breathe in' : 'Breathe out'}
        </Text>
      ) : null}
      <Text style={{ color: p.text, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: config.kind === 'breath' ? 10 : 18 }}>{mmss}</Text>

      {config.source === 'watch' ? null : (
        <View style={{ flexDirection: 'row', gap: 40, marginTop: 22 }}>
          <Stat label="HR" value={hr != null ? String(hr) : '—'} unit="bpm" />
          <Stat label="Beats" value={String(rrRef.current.length)} unit="RR" />
        </View>
      )}

      <View style={{ minHeight: 22, marginTop: 14, alignItems: 'center' }}>
        {started && !connected && config.source === 'polar' ? <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text> : null}
        {artifactHint ? <Text style={{ color: GRADE_COLORS.bad }}>Signal noisy — adjust the strap</Text> : null}
        {started && config.source === 'watch' ? <Text style={{ color: p.textDim, textAlign: 'center', paddingHorizontal: 24 }}>Follow the breathing guide alongside a Breathe or Mindfulness session on your Apple Watch. Nothing is recorded here.</Text> : null}
      </View>

      <SheetFooter>
        {started ? (
          <Button title="Finish now" variant="primary" onPress={finish} />
        ) : (
          <>
            <Button title="Cancel" variant="ghost" onPress={() => controls.close()} />
            <Button title="Start reading" variant="primary" onPress={begin} />
          </>
        )}
      </SheetFooter>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  const p = usePalette();
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: p.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: p.text, fontSize: 29, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: p.textDim, fontSize: 11 }}>{unit}</Text>
    </View>
  );
}
