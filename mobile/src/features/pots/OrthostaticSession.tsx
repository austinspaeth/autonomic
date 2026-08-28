/**
 * In-app POTS episode capture with a Bluetooth strap — the phone twin of the
 * watch companion's OrthostaticController, for one-off transitions (stairs,
 * sit→stand, lie→stand). Laid out like a live HRV capture.
 *
 * setup (pick the transition; strap connects; Start gated on it) → baseline
 * (capture resting HR in the starting position) → during (the transition
 * itself; a tap ends it) → recovery 60 s → results card. Baseline = mean HR
 * over the whole baseline stage; `afterHr` is the HR the moment the
 * transition ends; `hr1min` the HR at the end of recovery. The result maps
 * onto the existing `orthostatic` reading type, identical to a watch capture.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { radius, usePalette, GRADE_COLORS, WATER_BLUE } from '../../theme';
import { ble } from '../../lib/ble/manager';
import { meanBpm, type HrPoint } from '../../lib/pots/live';
import { computeScores } from '../../lib/scoring';
import { getState } from '../../store/store';
import { pingPots } from '../../store/ping';
import { keyOf, pad, uid } from '../../lib/dates';
import type { Entry } from '../../lib/types';
import {
  completionBuzz, deltaColor, fmtCountdown, PotsResultsSheet, SessionRing, signedDelta, Stat, stageBuzz, useStrapHr,
} from './common';

const RECOVERY_SEC = 60;

/** The transition kinds the watch offers, mapped to the app's `transition`
 *  select options (see OrthostaticController.EventType). */
const EVENTS = [
  { key: 'layToStand', title: 'Lay to stand', sub: 'From lying flat to upright', transition: 'Laying to standing', start: 'Start getting up', done: "I'm upright", during: 'Standing up' },
  { key: 'sitToStand', title: 'Sit to stand', sub: 'From seated to upright', transition: 'Sitting to standing', start: 'Start getting up', done: "I'm upright", during: 'Standing up' },
  { key: 'stairs', title: 'Stairs', sub: 'A flight or more of climbing', transition: 'Climbing stairs', start: 'Start climbing', done: 'Done climbing', during: 'Climbing stairs' },
] as const;
type EventDef = (typeof EVENTS)[number];

type Stage = 'setup' | 'baseline' | 'during' | 'recovery';

export function OrthostaticSession({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  useKeepAwake();

  const [event, setEvent] = useState<EventDef>(EVENTS[0]);
  const [stage, setStage] = useState<Stage>('setup');
  const [stageElapsed, setStageElapsed] = useState(0);
  const [delta, setDelta] = useState<number | null>(null);
  const [baselineSecs, setBaselineSecs] = useState(0);

  const stageRef = useRef<Stage>('setup');
  const finishedRef = useRef(false);
  const testStartRef = useRef(0);
  const stageStartRef = useRef(0);
  const seriesRef = useRef<HrPoint[]>([]);
  const lastTRef = useRef(0);
  const baselineSamplesRef = useRef<HrPoint[]>([]);
  const baselineRef = useRef<number | null>(null);
  const afterHrRef = useRef<number | null>(null);
  const transitionAtRef = useRef<number | null>(null);
  const completedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setStageBoth = (s: Stage) => { stageRef.current = s; setStage(s); stageStartRef.current = Date.now(); setStageElapsed(0); };
  const testElapsedNow = () => Math.round((Date.now() - testStartRef.current) / 1000);

  /** baseline → during: lock the resting baseline. */
  const startTransition = () => {
    if (stageRef.current !== 'baseline') return;
    baselineRef.current = meanBpm(baselineSamplesRef.current);
    transitionAtRef.current = testElapsedNow();
    setStageBoth('during');
    stageBuzz();
  };

  /** during → recovery: record the "after" HR and start the 60 s timer. */
  const endTransition = () => {
    if (stageRef.current !== 'during') return;
    afterHrRef.current = strap.freshHr();
    completedAtRef.current = testElapsedNow();
    setStageBoth('recovery');
    stageBuzz();
  };

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    // Counted on completion, like the stand test and like an HRV reading.
    pingPots('episode');
    if (timerRef.current) clearInterval(timerRef.current);
    completionBuzz();
    const hr1min = strap.freshHr();
    ble().disconnect().catch(() => {});

    const startDate = new Date(testStartRef.current);
    const profile = getState().profile;
    const strapName = getState().settings.lastBleDeviceName;
    const entry: Entry = {
      id: uid(),
      type: 'orthostatic',
      time: `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`,
      startedAt: startDate.toISOString(),
      note: '',
      source: 'polar',
      ...(strapName ? { sourceName: strapName } : {}),
      transition: event.transition,
      sampledHr: seriesRef.current,
    };
    if (baselineRef.current != null) entry.beforeHr = Math.round(baselineRef.current);
    if (afterHrRef.current != null) entry.afterHr = Math.round(afterHrRef.current);
    if (hr1min != null) entry.hr1min = Math.round(hr1min);
    if (transitionAtRef.current != null) entry.transitionAt = transitionAtRef.current;
    if (completedAtRef.current != null) entry.completedAt = completedAtRef.current;
    entry.scores = computeScores(entry, { sex: profile?.sex, height: profile?.height });

    openSheet((c) => (
      <PotsResultsSheet
        entry={entry} dayKey={keyOf(startDate)} controls={c}
        title="Episode captured"
        sub={`${event.title} · ${fmtCountdown(testElapsedNow())} captured · ${strapName || 'Bluetooth strap'}`}
      />
    ), { hideClose: true });
  };

  // 1 Hz state machine — fired by the interval, every BLE sample, and
  // foreground returns (same wall-clock scheme as the stand test).
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
      const point = { t: testElapsed, bpm: Math.round(bpm) };
      seriesRef.current.push(point);
      if (st === 'baseline') {
        baselineSamplesRef.current.push(point);
        setBaselineSecs(baselineSamplesRef.current.length);
      }
      const base = baselineRef.current;
      if (base != null && (st === 'during' || st === 'recovery')) setDelta(bpm - base);
    } else if (bpm == null && (st === 'during' || st === 'recovery')) {
      setDelta(null); // sensor gap — never fake a delta
    }

    if (st === 'recovery' && se >= RECOVERY_SEC) finish();
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
    setStageBoth('baseline');
    timerRef.current = setInterval(() => tickRef.current(), 1000);
  };

  /* ---------- render ---------- */

  if (stage === 'setup') {
    return (
      <View style={{ paddingTop: 8 }}>
        <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', textAlign: 'center' }}>
          POTS Episode
        </Text>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginTop: 12, marginBottom: 4 }}>What are you about to do?</Text>
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
          Rest in your starting position first — your resting heart rate is measured before you move.
        </Text>
        <View style={{ gap: 8 }}>
          {EVENTS.map((ev) => {
            const active = ev.key === event.key;
            return (
              <Pressable key={ev.key} onPress={() => setEvent(ev)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
                <Icon name="standing" size={22} color={active ? p.accent : p.textDim} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{ev.title}</Text>
                  <Text style={{ color: p.textDim, fontSize: 12, marginTop: 3 }}>{ev.sub}</Text>
                </View>
                {active ? <Icon name="check" size={18} color={p.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={{ minHeight: 24, marginTop: 16, alignItems: 'center' }}>
          {strap.connected
            ? <Text style={{ color: GRADE_COLORS.good, fontWeight: '600' }}>{`✓ Strap connected${strap.hr != null ? ` · ${strap.hr} bpm` : ''}`}</Text>
            : <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text>}
        </View>
        <SheetFooter>
          <Button title="Cancel" variant="ghost" onPress={() => controls.close()} />
          <Button title="Start" variant="primary" onPress={begin} disabled={!strap.connected} />
        </SheetFooter>
      </View>
    );
  }

  const meta = {
    baseline: { label: 'BASELINE', color: WATER_BLUE, sub: 'Rest in your starting position', frac: Math.min(1, stageElapsed / 60), time: fmtCountdown(stageElapsed) },
    during: { label: event.during.toUpperCase(), color: p.accent, sub: `Tap “${event.done}” when you get there`, frac: 1, time: fmtCountdown(stageElapsed) },
    recovery: { label: 'RECOVERY', color: p.accent, sub: 'Stay still while your heart rate settles', frac: stageElapsed / RECOVERY_SEC, time: fmtCountdown(RECOVERY_SEC - stageElapsed) },
  }[stage];
  // A usable baseline needs a few seconds of samples before the move starts.
  const baselineReady = baselineSecs >= 5;
  const dColor = deltaColor(delta, 'orthoIncrease');

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <Text style={{ color: p.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' }}>
        {`POTS Episode · ${event.title}`}
      </Text>

      <SessionRing frac={meta.frac} color={meta.color}>
        <View style={{ alignItems: 'center', paddingHorizontal: 36 }}>
          <Text style={{ color: meta.color, fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' }}>{meta.label}</Text>
          <Text style={{ color: p.textDim, fontSize: 15, textAlign: 'center', marginTop: 6 }}>{meta.sub}</Text>
        </View>
      </SessionRing>

      <Text style={{ color: p.text, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 16 }}>{meta.time}</Text>

      <View style={{ flexDirection: 'row', gap: 26, marginTop: 20 }}>
        <Stat label="HR" value={strap.hr != null ? String(strap.hr) : '—'} unit="bpm" />
        <Stat label="Rise" value={delta != null ? signedDelta(delta) : '—'} unit="Δ bpm" color={dColor} />
        <Stat label="Baseline" value={baselineRef.current != null ? String(Math.round(baselineRef.current)) : '—'} unit="bpm" />
      </View>

      <View style={{ minHeight: 22, marginTop: 14, alignItems: 'center' }}>
        {!strap.connected ? <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text> : null}
        {stage === 'baseline' && strap.connected && !baselineReady ? (
          <Text style={{ color: p.textDim }}>Capturing resting baseline…</Text>
        ) : null}
      </View>

      <SheetFooter>
        {stage === 'baseline' ? (
          <>
            <Button title="Cancel" variant="ghost" onPress={() => controls.close()} />
            <Button title={event.start} variant="primary" onPress={startTransition} disabled={!baselineReady} />
          </>
        ) : stage === 'during' ? (
          <Button title={event.done} variant="primary" onPress={endTransition} />
        ) : (
          <Button title="End early" variant="default" onPress={finish} />
        )}
      </SheetFooter>
    </View>
  );
}
