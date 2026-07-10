/**
 * Live HRV capture — presented as a stacked card modal (no ✕; it closes
 * itself). Choosing settings opens this card with a "Start reading" button; the
 * breathing guide animates immediately so you can settle into the rhythm, but
 * the timer and RR/HR collection do not begin until Start is pressed. Once
 * running, a single "Finish now" ends early; it also auto-finishes at the full
 * duration. On finish the breathing guide (and its haptics) stops, a strong
 * ~1 s buzz marks completion, and either the results card (strap) or the
 * Apple-Health ECG sync card (watch) rises over this one.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Circle } from 'react-native-svg';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette, GRADE_COLORS } from '../../theme';
import { BreathingViz } from './BreathingViz';
import { HrvResults } from './Results';
import { EcgSyncSheet } from './EcgSync';
import { ble } from '../../lib/ble/manager';
import { correctArtifacts, std } from '../../lib/hrv';
import { getState } from '../../store/store';

// Breathing readings run the full 5 minutes; unstructured readings are 2:30.
const durationFor = (kind: SessionConfig['kind']) => (kind === 'breath' ? 300 : 150);

/** ~1 s strong buzz: expo-haptics has no long-duration vibration on iOS, so a
 *  dense train of heavy impacts reads as one sustained buzz. */
async function completionBuzz() {
  for (let i = 0; i < 10; i++) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
  }
}

export interface SessionConfig {
  kind: 'breath' | 'unstructured';
  style?: string; // e.g. "4/6"
  source: 'polar' | 'watch';
  period?: 'Morning' | 'Evening' | 'Other';
}

export function HrvSession({ config, controls }: { config: SessionConfig; controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const DURATION = durationFor(config.kind);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hr, setHr] = useState<number | null>(null);
  const [liveSdnn, setLiveSdnn] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [artifactHint, setArtifactHint] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const rrRef = useRef<number[]>([]);
  const hrRef = useRef<{ t: number; bpm: number }[]>([]);
  const sdnnRef = useRef<{ t: number; sdnn: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const finishedRef = useRef(false);
  const recentRr = useRef<number[]>([]);

  // The phone must not sleep mid-reading — the timer, BLE stream and breathing
  // guide all die with the screen. Held for the life of this card (results and
  // ECG sync stack on top of it, so it covers those too).
  useKeepAwake();

  const [inS, exS] = (config.style || '4/6').split('/').map(Number);

  // Collection + timer only begin on Start. The breathing guide runs regardless.
  const begin = () => {
    if (started) return;
    setStarted(true);
    startedAtRef.current = Date.now();
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
            // Rolling SDNN over the trailing ~60 s of beats (artifact-corrected),
            // sampled once per BLE notification (~1 Hz).
            if (s.rr.length) {
              const all = rrRef.current;
              let sum = 0, i = all.length;
              while (i > 0 && sum < 60000) { i--; sum += all[i]; }
              const win = all.slice(i);
              if (win.length >= 10) {
                const sdnn = Math.round(std(correctArtifacts(win).clean));
                setLiveSdnn(sdnn);
                sdnnRef.current.push({ t: now, sdnn });
              }
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
    // Stop the breathing guide (and its in/out haptics) immediately, then mark
    // completion with one strong sustained buzz.
    setFinished(true);
    completionBuzz();
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.source === 'polar') await ble().disconnect().catch(() => {});

    // Apple Watch path: the wearer recorded an ECG during the reading. Stack a
    // syncing card on top that pulls that ECG from Apple Health, evaluates it,
    // and shows the results.
    if (config.source === 'watch') {
      const startMs = startedAtRef.current || Date.now();
      openSheet((c) => (
        <EcgSyncSheet windowStartMs={startMs} windowEndMs={Date.now()} config={config} controls={c} />
      ), { hideClose: true });
      return;
    }

    const rr = rrRef.current.slice();
    // Open Results as a card stacked ON TOP of this one: this session card recedes
    // (scales back + lifts) while Results rises over it. Save/Discard in Results
    // calls closeAll(), so both cards animate out together. Leave this card mounted.
    openSheet((c) => (
      <HrvResults rr={rr} hrSamples={hrRef.current} sdnnSamples={sdnnRef.current} config={config} durationSec={elapsed} watchFallback={null} controls={c} />
    ), { hideClose: true });
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
          <BreathingViz inhaleSec={inS} exhaleSec={exS} running={!finished} onPhase={setPhase} />
        ) : (
          <Text style={{ color: p.textDim, fontSize: 16, textAlign: 'center', paddingHorizontal: 40 }}>Stay still,{'\n'}breathe normally</Text>
        )}
      </View>

      {config.kind === 'breath' ? (
        <Text style={{ color: p.accent, fontSize: 18, fontWeight: '700', letterSpacing: 0.3, marginTop: 18 }}>
          {finished ? 'Done' : phase === 'in' ? 'Breathe in' : 'Breathe out'}
        </Text>
      ) : null}
      <Text style={{ color: p.text, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: config.kind === 'breath' ? 10 : 18 }}>{mmss}</Text>

      {config.source === 'watch' ? null : (
        <View style={{ flexDirection: 'row', gap: 32, marginTop: 22 }}>
          <Stat label="HR" value={hr != null ? String(hr) : '—'} unit="bpm" />
          <Stat label="HRV" value={liveSdnn != null ? String(liveSdnn) : '—'} unit="SDNN ms" />
          <Stat label="Beats" value={String(rrRef.current.length)} unit="RR" />
        </View>
      )}

      <View style={{ minHeight: 22, marginTop: 14, alignItems: 'center' }}>
        {started && !connected && config.source === 'polar' ? <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text> : null}
        {artifactHint ? <Text style={{ color: GRADE_COLORS.bad }}>Signal noisy, adjust the strap</Text> : null}
        {started && !finished && config.source === 'watch' ? <Text style={{ color: p.textDim, textAlign: 'center', paddingHorizontal: 24 }}>Record an ECG on your Apple Watch now (open the ECG app and hold the crown). It syncs in when the reading ends.</Text> : null}
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
