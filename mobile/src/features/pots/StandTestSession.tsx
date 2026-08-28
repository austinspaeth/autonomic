/**
 * In-app guided POTS stand test with a Bluetooth strap — the phone twin of
 * the watch companion's StandTestController/StandTestViews, laid out like a
 * live HRV capture (stacked card, ring, big timer, live stats).
 *
 * setup (strap connects; Start gated on it) → resting 5:00 (blue ring;
 * "Skip to standing") → stand prompt (buzz; "I'm standing" or 15 s
 * auto-start) → standing 10:00 (red ring, live Δ; "Finish now" flags
 * endedEarly) → results card. The 1 Hz series records only fresh strap
 * samples (sensor gaps leave gaps — no fake data); the clock derives from
 * the wall clock and is also driven from BLE sample arrivals, so a
 * backgrounded phone keeps honest time exactly like the HRV session.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette, GRADE_COLORS, WATER_BLUE } from '../../theme';
import { ble } from '../../lib/ble/manager';
import { buildStandTestFields, restingBaseline, type HrPoint } from '../../lib/pots/live';
import { computeScores } from '../../lib/scoring';
import { getState } from '../../store/store';
import { pingPots } from '../../store/ping';
import { ageFromBirthday, keyOf, pad, uid } from '../../lib/dates';
import type { Entry } from '../../lib/types';
import {
  completionBuzz, deltaColor, fmtCountdown, PotsResultsSheet, SessionRing, signedDelta, Stat, stageBuzz, useStrapHr,
} from './common';

const REST_SEC = 300;
const PROMPT_SEC = 15;
const STAND_SEC = 600;

type Stage = 'setup' | 'resting' | 'prompt' | 'standing';

export function StandTestSession({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  useKeepAwake();

  const [stage, setStage] = useState<Stage>('setup');
  const [stageElapsed, setStageElapsed] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);
  const [peakDelta, setPeakDelta] = useState<number | null>(null);

  const stageRef = useRef<Stage>('setup');
  const finishedRef = useRef(false);
  const testStartRef = useRef(0);      // ms epoch of Start
  const stageStartRef = useRef(0);     // ms epoch of the current stage's entry
  const seriesRef = useRef<HrPoint[]>([]);
  const lastTRef = useRef(0);          // last test-second a sample was recorded at
  const restSecondsRef = useRef(0);
  const standAtRef = useRef<number | null>(null);
  const baselineRef = useRef<number | null>(null);
  const peakDeltaRef = useRef(0);
  const buzzedRef = useRef<{ 30: boolean; 50: boolean }>({ 30: false, 50: false });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStageBoth = (s: Stage) => { stageRef.current = s; setStage(s); stageStartRef.current = Date.now(); setStageElapsed(0); };

  const testElapsedNow = () => Math.round((Date.now() - testStartRef.current) / 1000);

  const enterPrompt = () => {
    baselineRef.current = restingBaseline(seriesRef.current, testElapsedNow());
    setStageBoth('prompt');
    stageBuzz();
  };

  const enterStanding = () => {
    standAtRef.current = testElapsedNow();
    peakDeltaRef.current = 0;
    setStageBoth('standing');
  };

  const finish = (early: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    completionBuzz();
    // The capture is the event, not the save — the same rule the HRV pair
    // follows, and the reason a discarded result still counts as one taken.
    pingPots('stand');
    ble().disconnect().catch(() => {});

    const startDate = new Date(testStartRef.current);
    const profile = getState().profile;
    const fields = buildStandTestFields({
      series: seriesRef.current,
      baseline: baselineRef.current,
      standAt: standAtRef.current,
      endT: testElapsedNow(),
      restSeconds: restSecondsRef.current,
      endedEarly: early,
      age: ageFromBirthday(profile?.birthday),
      sex: profile?.sex as string | undefined,
    });
    const strapName = getState().settings.lastBleDeviceName;
    const entry: Entry = {
      id: uid(),
      type: 'standTest',
      time: `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`,
      startedAt: startDate.toISOString(),
      note: '',
      source: 'polar',
      ...(strapName ? { sourceName: strapName } : {}),
      ...fields,
      sampledHr: seriesRef.current,
    };
    entry.scores = computeScores(entry, { sex: profile?.sex, height: profile?.height });

    const dur = testElapsedNow();
    openSheet((c) => (
      <PotsResultsSheet
        entry={entry} dayKey={keyOf(startDate)} controls={c}
        title="Test complete"
        sub={`${fmtCountdown(dur)} captured · ${seriesRef.current.length} samples · ${strapName || 'Bluetooth strap'}`}
      />
    ), { hideClose: true });
  };

  // The 1 Hz heart of the state machine. Fired by the interval, every BLE
  // sample, and foreground returns — all wall-clock derived, so overlapping
  // calls are harmless and background time is never lost.
  const tick = () => {
    if (finishedRef.current) return;
    const st = stageRef.current;
    if (st === 'setup') return;
    const now = Date.now();
    const testElapsed = Math.round((now - testStartRef.current) / 1000);
    const se = Math.floor((now - stageStartRef.current) / 1000);
    setStageElapsed(se);

    const bpm = strap.freshHr();
    if (bpm != null && testElapsed > lastTRef.current) {
      lastTRef.current = testElapsed;
      seriesRef.current.push({ t: testElapsed, bpm: Math.round(bpm) });
      if (st === 'resting') restSecondsRef.current += 1;
      const base = baselineRef.current;
      if (base != null && (st === 'prompt' || st === 'standing')) {
        const d = bpm - base;
        setDelta(d);
        if (st === 'standing') {
          peakDeltaRef.current = Math.max(peakDeltaRef.current, d);
          setPeakDelta(peakDeltaRef.current);
          // Safety buzz when the rise first crosses the POTS-range marks.
          if (d >= 30 && !buzzedRef.current[30]) { buzzedRef.current[30] = true; stageBuzz(); }
          if (d >= 50 && !buzzedRef.current[50]) { buzzedRef.current[50] = true; stageBuzz(); }
        }
      }
    } else if (bpm == null && (st === 'prompt' || st === 'standing')) {
      setDelta(null); // sensor gap — never fake a delta
    }

    if (st === 'resting' && se >= REST_SEC) enterPrompt();
    else if (st === 'prompt' && se >= PROMPT_SEC) enterStanding(); // no tap — start anyway so the timing stays honest
    else if (st === 'standing' && se >= STAND_SEC) finish(false);
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const strap = useStrapHr(() => tickRef.current());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tickRef.current(); });
    return () => {
      sub.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      ble().disconnect().catch(() => {});
    };
  }, []);

  const begin = () => {
    if (stageRef.current !== 'setup') return;
    testStartRef.current = Date.now();
    setStageBoth('resting');
    timerRef.current = setInterval(() => tickRef.current(), 1000);
  };

  /* ---------- render ---------- */

  const stageMeta: Record<Stage, { label: string; color: string; frac: number; remain: number | null }> = {
    setup: { label: 'GET READY', color: WATER_BLUE, frac: 0, remain: null },
    resting: { label: 'RESTING', color: WATER_BLUE, frac: stageElapsed / REST_SEC, remain: REST_SEC - stageElapsed },
    prompt: { label: 'STAND UP', color: p.accent, frac: 1, remain: PROMPT_SEC - stageElapsed },
    standing: { label: 'STANDING', color: p.accent, frac: stageElapsed / STAND_SEC, remain: STAND_SEC - stageElapsed },
  };
  const m = stageMeta[stage];
  const dColor = deltaColor(delta, 'standDelta');

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>
        POTS Standing Test
      </Text>

      <SessionRing frac={m.frac} color={m.color}>
        <View style={{ alignItems: 'center', paddingHorizontal: 36 }}>
          <Text style={{ color: m.color, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 }}>{m.label}</Text>
          <Text style={{ color: p.textDim, fontSize: 15, textAlign: 'center', marginTop: 6 }}>
            {stage === 'setup' ? 'Lie down and get comfortable before starting'
              : stage === 'resting' ? 'Lie still and relax'
              : stage === 'prompt' ? 'Stand up now, then hold still'
              : 'Hold still, don’t move'}
          </Text>
        </View>
      </SessionRing>

      <Text style={{ color: p.text, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 16 }}>
        {stage === 'setup' ? fmtCountdown(REST_SEC) : fmtCountdown(m.remain ?? 0)}
      </Text>

      <View style={{ flexDirection: 'row', gap: 26, marginTop: 20 }}>
        <Stat label="HR" value={strap.hr != null ? String(strap.hr) : '—'} unit="bpm" />
        <Stat label="Rise" value={delta != null ? signedDelta(delta) : '—'} unit="Δ bpm" color={dColor} />
        <Stat label="Peak" value={peakDelta != null ? signedDelta(peakDelta) : '—'} unit="Δ bpm" color={deltaColor(peakDelta, 'standDelta')} />
      </View>

      <View style={{ minHeight: 22, marginTop: 14, alignItems: 'center' }}>
        {!strap.connected ? <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text> : null}
        {strap.connected && stage === 'setup' ? (
          <Text style={{ color: GRADE_COLORS.good, fontWeight: '600' }}>✓ Strap connected</Text>
        ) : null}
        {stage === 'resting' ? (
          <Text style={{ color: p.textDim, textAlign: 'center', paddingHorizontal: 24 }}>
            You&apos;ll be told when to stand. The last 2 minutes lying down set your baseline.
          </Text>
        ) : null}
      </View>

      <SheetFooter>
        {stage === 'setup' ? (
          <>
            <Button title="Cancel" variant="ghost" onPress={() => controls.close()} />
            {/* A 15-minute test must not start before the strap answers. */}
            <Button title="Start test" variant="primary" onPress={begin} disabled={!strap.connected} />
          </>
        ) : stage === 'resting' ? (
          <>
            <Button title="Cancel" variant="ghost" onPress={() => controls.close()} />
            <Button title="Skip to standing" variant="default" onPress={enterPrompt} />
          </>
        ) : stage === 'prompt' ? (
          <Button title="I'm standing" variant="primary" onPress={enterStanding} />
        ) : (
          <Button title="Finish now" variant="primary" onPress={() => finish(stageElapsed < STAND_SEC)} />
        )}
      </SheetFooter>
    </View>
  );
}
