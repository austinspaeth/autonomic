/**
 * Live HRV capture — presented as a stacked card modal (no ✕; it closes
 * itself). Choosing settings opens this card with a "Start reading" button; the
 * breathing guide animates immediately so you can settle into the rhythm, but
 * the timer and RR/HR collection do not begin until Start is pressed. Once
 * running, a single "Finish now" ends early; it also auto-finishes at the full
 * duration. On finish the breathing guide (and its haptics) stops, a strong
 * ~1 s buzz marks completion, and either the results card (strap/camera) or the
 * Apple-Health watch sync card rises over this one. Haptics only play while
 * the JS process is running (BLE keeps it alive in the background; watch and
 * camera sessions are suspended) — a backgrounded finish is picked up when the
 * app returns. iOS suppresses the completion buzz while backgrounded, so a
 * finish that lands with the app away also posts a local notification
 * (notifyHrvComplete in lib/reminders) so completion is still felt.
 *
 * Camera (PPG) source: this card never shows a pre-start state — the
 * camera-setup card (CameraSetup.tsx) owns the camera view + torch, locks the
 * pulse, and opens this card with autoStart the moment a finger is detected,
 * staying mounted underneath so the stream survives the handoff. On mount the
 * manager's callbacks are retargeted to this card's collector, and a shorter
 * 3-minute capture runs (a fingertip is harder to hold still than a strap, but
 * a minute is too short to resolve the low-frequency bands or settle RMSSD).
 * Samples stream in the same { hr, rr[] } shape as BLE and flow through the
 * same collection path.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Circle } from 'react-native-svg';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette, GRADE_COLORS } from '../../theme';
import { BreathingViz, parsePattern, type BreathPhase } from './BreathingViz';
import { HrvResults } from './Results';
import { WatchSyncSheet } from './WatchSync';
import { startWatchSync } from './watchSyncStore';
import { ble } from '../../lib/ble/manager';
import { ppg, type PpgSignal } from '../../lib/ppg/camera';
import { correctArtifacts, std } from '../../lib/hrv';
import { notifyHrvComplete } from '../../lib/reminders';
import { getState } from '../../store/store';

// Strap and watch readings — structured or unstructured — run the full
// 5 minutes. Camera (finger) readings run 3 minutes: long enough to resolve the
// LF band and settle RMSSD/SDNN (a 1-minute optical reading swings too much to
// compare against a dedicated app), still realistic to hold a fingertip still.
const durationFor = (config: SessionConfig) => (config.source === 'camera' ? 180 : 300);

/** The three structured breathing patterns. `val` is the stored style string
 *  (in/hold/out/hold seconds — see parsePattern); shared by Setup + Session. */
export const BREATH_STYLES: { val: string; title: string; sub: string; badge?: string }[] = [
  { val: '4/6', title: '4 / 6 breathing', badge: 'Recommended', sub: 'In 4s · out 6s. Resonant-frequency pacing that trains the baroreflex.' },
  { val: '4/4/4/4', title: 'Box breathing', sub: 'In 4s · hold 4s · out 4s · hold 4s. A steady square rhythm for calm focus.' },
  { val: '4/7/8', title: '4 / 7 / 8 breathing', sub: 'In 4s · hold 7s · out 8s. A long exhale that leans into the vagal brake.' },
];
export const styleTitle = (val?: string) => BREATH_STYLES.find((s) => s.val === val)?.title || (val || '');

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
  source: 'polar' | 'watch' | 'camera';
  period?: 'Morning' | 'Evening' | 'Other';
}

export function HrvSession({ config, controls, autoStart }: { config: SessionConfig; controls: SheetControls; autoStart?: boolean }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const DURATION = durationFor(config);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hr, setHr] = useState<number | null>(null);
  const [liveSdnn, setLiveSdnn] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [artifactHint, setArtifactHint] = useState(false);
  const [phase, setPhase] = useState<BreathPhase>('in');
  // Camera source: finger-placement signal (drives the finger-lifted warning
  // mid-reading). The setup card only opens this card once the pulse locked,
  // so it starts locked.
  const [signal, setSignal] = useState<PpgSignal>(
    config.source === 'camera' ? { locked: true, quality: 'good' } : { locked: false, quality: 'none' },
  );
  const rrRef = useRef<number[]>([]);
  const hrRef = useRef<{ t: number; bpm: number }[]>([]);
  const sdnnRef = useRef<{ t: number; sdnn: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const recentRr = useRef<number[]>([]);

  // The phone must not sleep mid-reading — the timer, BLE stream and breathing
  // guide all die with the screen. Held for the life of this card (results and
  // ECG sync stack on top of it, so it covers those too).
  useKeepAwake();

  const pattern = parsePattern(config.style);

  // Shared RR/HR/SDNN collection — both the BLE strap and the camera PPG
  // stream emit the same { hr, rr[] } sample shape into this.
  const collect = (s: { hr: number; rr: number[] }) => {
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
    // sampled once per notification (~1 Hz).
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
  };

  // BLE source: connect to the saved strap the moment this card opens, so the
  // link is already up when Start is pressed instead of initializing during
  // the reading. Live HR shows pre-start as a connection cue; RR collection is
  // still gated on Start. Retries quietly until the strap answers.
  useEffect(() => {
    if (config.source !== 'polar') return;
    const saved = getState().settings.lastBleDeviceId;
    const mgr = ble();
    if (!saved || !mgr.available) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (!alive || finishedRef.current) return;
      try {
        await mgr.requestPermissions();
        await mgr.connect(
          saved,
          (s) => {
            setConnected(true);
            if (s.hr) setHr(s.hr);
            // Backgrounded, the 1 s interval is frozen but BLE samples still
            // arrive — drive the clock from them so the reading finishes on
            // time instead of over-collecting until the app returns.
            syncRef.current();
            if (startedRef.current && !finishedRef.current) collect(s);
          },
          () => {
            setConnected(false);
            if (alive && !finishedRef.current) retry = setTimeout(attempt, 2000);
          },
        );
      } catch {
        setConnected(false);
        if (alive && !finishedRef.current) retry = setTimeout(attempt, 3000);
      }
    };
    attempt();
    return () => { alive = false; if (retry) clearTimeout(retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera source: the stream is already running — the camera-setup card
  // beneath locked the pulse and keeps the camera view mounted. Point the
  // manager's callbacks at this card's collector; detection state (and the
  // lock) carries over untouched.
  useEffect(() => {
    if (config.source !== 'camera') return;
    ppg().retarget(
      (s) => { if (startedRef.current && !finishedRef.current) collect(s); },
      (sig) => setSignal(sig),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed time is derived from the wall clock, not counted interval ticks:
  // iOS suspends JS timers while the app is backgrounded (fully so for the
  // watch source, which holds no BLE/camera session), and tick-counting made
  // the reading appear to pause until the app returned. BLE samples keep
  // flowing in the background (bluetooth-central mode), so the reading itself
  // never stopped — only the clock did.
  const syncElapsed = () => {
    if (!startedRef.current || finishedRef.current) return;
    const e = Math.floor((Date.now() - startedAtRef.current) / 1000);
    setElapsed(Math.min(e, DURATION));
    if (e >= DURATION) finish();
  };
  const syncRef = useRef(syncElapsed);
  syncRef.current = syncElapsed;

  // Returning to the foreground: re-sync immediately (and auto-finish if the
  // duration passed while backgrounded) instead of waiting for the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') syncRef.current(); });
    return () => sub.remove();
  }, []);

  // Collection + timer only begin on Start. The breathing guide runs regardless.
  const begin = () => {
    if (started) return;
    setStarted(true);
    startedRef.current = true;
    startedAtRef.current = Date.now();
    // watch: the ECG is recorded on the wrist; camera + BLE: already streaming
    // since mount (their samples start being collected now).
    if (config.source === 'watch' || config.source === 'camera') setConnected(true);
    timerRef.current = setInterval(() => syncRef.current(), 1000);
  };

  // Watch and camera flows arrive already started: the wearer just tapped
  // Breathe on the wrist, or the setup card just detected the finger — either
  // way the timer is already running when this card rises.
  useEffect(() => {
    if (autoStart) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.source === 'polar') ble().disconnect().catch(() => {});
    if (config.source === 'camera') ppg().stop().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Wall-clock capture length (auto-finish may fire from a closure whose
    // `elapsed` state is stale, and long after the duration if backgrounded).
    const capturedSec = Math.min(DURATION, Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)));
    // Stop the breathing guide (and its in/out haptics) immediately, then mark
    // completion with one strong sustained buzz.
    setFinished(true);
    completionBuzz();
    // Backgrounded (a BLE reading keeps running while the phone is set aside),
    // iOS never plays the buzz above — post a notification so the completion is
    // still felt/heard. Foreground readings feel the buzz, so skip it there.
    if (AppState.currentState !== 'active') void notifyHrvComplete();
    if (timerRef.current) clearInterval(timerRef.current);
    if (config.source === 'polar') await ble().disconnect().catch(() => {});
    if (config.source === 'camera') await ppg().stop().catch(() => {});

    // Apple Watch path: the wearer took a reading on the watch (Mindfulness
    // breathing HRV or ECG) during the session. Stack a syncing card on top
    // that pulls it from Apple Health, evaluates it, and shows the results.
    // The window ends when the reading did, not when the app came back to the
    // foreground.
    if (config.source === 'watch') {
      const startMs = startedAtRef.current || Date.now();
      const endMs = Math.min(Date.now(), startMs + DURATION * 1000);
      // The poller lives outside the sheet (watchSyncStore) so "Continue using
      // app" can close the card while the sync keeps running.
      startWatchSync({ windowStartMs: startMs, windowEndMs: endMs, config });
      openSheet((c) => <WatchSyncSheet controls={c} />, { hideClose: true });
      return;
    }

    // Strap and camera both finish with the RR array in hand — same Results path.
    const rr = rrRef.current.slice();
    // Open Results as a card stacked ON TOP of this one: this session card recedes
    // (scales back + lifts) while Results rises over it. Save/Discard in Results
    // calls closeAll(), so both cards animate out together. Leave this card mounted.
    openSheet((c) => (
      <HrvResults rr={rr} hrSamples={hrRef.current} sdnnSamples={sdnnRef.current} config={config} durationSec={capturedSec} watchFallback={null} controls={c} />
    ), { hideClose: true });
  };

  const frac = started ? elapsed / DURATION : 0;
  const remain = DURATION - elapsed;
  const mmss = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;

  const R = 108, SW = 9, C = 2 * Math.PI * R;
  const ringSize = 2 * (R + SW);

  // The strap connects while this card sits open; don't start until it's live.
  const strapPending = config.source === 'polar' && !started && !connected;

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>
        {config.kind === 'breath' ? `Structured HRV · ${styleTitle(config.style)}` : 'Unstructured HRV'}
      </Text>

      <View style={{ width: ringSize, height: ringSize, marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
          <Circle cx={R + SW} cy={R + SW} r={R} stroke={p.surface2} strokeWidth={SW} fill="none" />
          <Circle cx={R + SW} cy={R + SW} r={R} stroke={artifactHint ? GRADE_COLORS.bad : p.accent} strokeWidth={SW} fill="none" strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - frac)} transform={`rotate(-90 ${R + SW} ${R + SW})`} />
        </Svg>
        {config.kind === 'breath' ? (
          <BreathingViz pattern={pattern} running={!finished} onPhase={setPhase} />
        ) : (
          <Text style={{ color: p.textDim, fontSize: 16, textAlign: 'center', paddingHorizontal: 40 }}>Stay still,{'\n'}breathe normally</Text>
        )}
      </View>

      {config.kind === 'breath' ? (
        <Text style={{ color: p.accent, fontSize: 18, fontWeight: '700', letterSpacing: 0.3, marginTop: 18 }}>
          {finished ? 'Done' : phase === 'in' ? 'Breathe in' : phase === 'out' ? 'Breathe out' : 'Hold'}
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
        {!finished && !connected && config.source === 'polar' ? <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text> : null}
        {!started && connected && config.source === 'polar' ? (
          <Text style={{ color: GRADE_COLORS.good, fontWeight: '600' }}>✓ Strap connected</Text>
        ) : null}
        {artifactHint ? (
          <Text style={{ color: GRADE_COLORS.bad, textAlign: 'center', paddingHorizontal: 24 }}>
            {config.source === 'camera' ? 'Signal noisy — steady your finger, ease the pressure' : 'Signal noisy, adjust the strap'}
          </Text>
        ) : null}
        {started && !finished && config.source === 'watch' ? <Text style={{ color: p.textDim, textAlign: 'center', paddingHorizontal: 24 }}>Sit still and follow the breathing session on your watch. It syncs in when the reading ends.</Text> : null}
        {/* Finger lifted mid-reading: warn instead of silently collecting junk. */}
        {config.source === 'camera' && started && !finished && !signal.locked && !artifactHint ? (
          <Text style={{ color: GRADE_COLORS.bad, textAlign: 'center', paddingHorizontal: 24 }}>
            Pulse lost — cover the camera and flash with your fingertip
          </Text>
        ) : null}
      </View>

      <SheetFooter>
        {started ? (
          <Button title="Finish now" variant="primary" onPress={finish} />
        ) : (
          <>
            <Button title="Cancel" variant="ghost" onPress={() => controls.close()} />
            {/* A 5-minute reading must not start before the strap answers. */}
            <Button title="Start reading" variant="primary" onPress={begin} disabled={strapPending} />
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
