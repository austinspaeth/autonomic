/**
 * In-app guided POTS stand test with a Bluetooth strap — the phone twin of
 * the watch companion's StandTestController/StandTestViews, wearing the same
 * dial and stacked prompt cards as the hand-entered test (./StandDial), minus
 * the cards that ask for a number: the strap is the one typing.
 *
 * intro → get ready (strap connects; Start gated on it) → lying 5:00 (grey
 * arc; "End rest step early") → stand prompt card (buzz; "I'm standing" or a
 * 15 s auto-start) → standing 10:00 (red arc, live Δ; "Finish test early"
 * flags endedEarly) → the results card, which replaces this one. The 1 Hz series records only fresh
 * strap samples (sensor gaps leave gaps — no fake data); the clock derives
 * from the wall clock and is also driven from BLE sample arrivals, so a
 * backgrounded phone keeps honest time exactly like the HRV session.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { fonts, usePalette, GRADE_COLORS } from '../../theme';
import { ble } from '../../lib/ble/manager';
import { buildStandTestFields, restingBaseline, type HrPoint } from '../../lib/pots/live';
import { computeScores, profileCtx } from '../../lib/scoring';
import { getState } from '../../store/store';
import { pingPots } from '../../store/ping';
import { ageFromBirthday, keyOf, pad, uid } from '../../lib/dates';
import type { Entry } from '../../lib/types';
import {
  completionBuzz, deltaColor, fmtCountdown, PotsResultsSheet, signedDelta, Stat, stageBuzz, useStrapHr,
} from './common';
import {
  Body, Dial, DIAL, PauseMark, Prompt, PromptTitle, SKIP_MS, StandCard, StandIntro, type IntroStep,
} from './StandDial';

const REST_SEC = 300;
const PROMPT_SEC = 15;
const STAND_SEC = 600;
/** The dial's dots: stand up, and the end of the test. */
const STOPS_MIN = [REST_SEC / 60, (REST_SEC + STAND_SEC) / 60];

type Stage = 'intro' | 'setup' | 'resting' | 'prompt' | 'standing' | 'done';
type CardKind = 'settle' | 'stand';

const INTRO_STEPS: IntroStep[] = [
  { title: 'Lie still', time: '5 min', sub: 'Rest while your strap sets your baseline.' },
  { title: 'Stand up', time: '10 min', sub: 'Stay still. No walking or leaning.' },
  { title: 'Nothing to enter', time: 'Live', sub: 'Your strap records your heart rate the whole way through.' },
];

interface ConnBus { subscribe: (f: () => void) => () => void; get: () => boolean }

/** The card over the idle dial. Start waits for the strap: a 15 minute test
 *  must not begin before it answers. */
function SettleCard({ conn, onStart }: { conn: ConnBus; onStart: () => void }) {
  const connected = useSyncExternalStore(conn.subscribe, conn.get);
  return (
    <View>
      <PromptTitle>Lie down and get settled</PromptTitle>
      <Body>Put your strap on and lie flat with your phone in reach. Tap start once you are comfortable.</Body>
      <Text style={{ color: connected ? GRADE_COLORS.good : GRADE_COLORS.ok, fontWeight: '600', marginBottom: 14 }}>
        {connected ? '✓ Strap connected' : 'Connecting to strap…'}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <Button title="Start test" variant="primary" onPress={onStart} disabled={!connected} />
      </View>
    </View>
  );
}

export function StandTestSession({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  useKeepAwake();

  const [stage, setStage] = useState<Stage>('intro');
  const [delta, setDelta] = useState<number | null>(null);
  const [peakDelta, setPeakDelta] = useState<number | null>(null);
  /** The prompt the test is waiting on, and whether its card is on screen. */
  const [card, setCard] = useState<CardKind | null>(null);
  const [cardUp, setCardUp] = useState(false);
  /** The rest cut short: the arc catches up from here while the card rises. */
  const [skip, setSkip] = useState<{ from: number; at: number } | null>(null);
  const [, setTick] = useState(0);

  const stageRef = useRef<Stage>('intro');
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
  const upToken = useRef(0);
  const closeCard = useRef<(() => void) | null>(null);

  const clock = () => Date.now();
  const setStageBoth = (s: Stage) => { stageRef.current = s; setStage(s); stageStartRef.current = clock(); };
  const testElapsedNow = () => Math.round((clock() - testStartRef.current) / 1000);
  const stageElapsedNow = () => (clock() - stageStartRef.current) / 1000;

  // The prompt cards are built once when they open, so they reach the test
  // through a ref that always holds this render's handlers.
  const act = useRef({ begin: () => {}, standing: () => {} });

  function raise(kind: CardKind) {
    const token = ++upToken.current;
    setCard(kind);
    setCardUp(true);
    // Every card that comes up is felt, whatever raised it.
    stageBuzz();
    openSheet((c) => {
      closeCard.current = c.close;
      return (
        <Prompt onGone={() => { if (upToken.current === token) { setCardUp(false); closeCard.current = null; } }}>
          {kind === 'settle'
            ? <SettleCard conn={conn.current} onStart={() => { act.current.begin(); c.close(); }} />
            : <StandCard onStanding={() => { act.current.standing(); c.close(); }} />}
        </Prompt>
      );
    }, { fitContent: true });
  }

  const enterPrompt = () => {
    if (stageRef.current !== 'resting') return;
    const at = Math.min(REST_SEC, stageElapsedNow());
    if (at < REST_SEC) setSkip({ from: at, at: Date.now() });
    baselineRef.current = restingBaseline(seriesRef.current, testElapsedNow());
    setStageBoth('prompt');
    raise('stand');
  };

  const enterStanding = () => {
    if (stageRef.current !== 'prompt') return;
    standAtRef.current = testElapsedNow();
    peakDeltaRef.current = 0;
    setCard(null);
    // The 15 s auto-start gets here with the card still up.
    closeCard.current?.();
    setStageBoth('standing');
  };

  const finish = (early: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    completionBuzz();
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
    entry.scores = computeScores(entry, profileCtx(profile));
    // The capture is the event, not the save — the same rule the HRV pair
    // follows, and the reason a discarded result still counts as one taken.
    pingPots('stand');
    ble().disconnect().catch(() => {});
    stageRef.current = 'done';
    // The data is in hand: this card is finished with, and the report takes
    // its place.
    const dur = testElapsedNow();
    controls.close();
    openSheet((c) => (
      <PotsResultsSheet
        entry={entry} dayKey={keyOf(startDate)} controls={c}
        title="Test complete"
        sub={`${fmtCountdown(dur)} captured · ${seriesRef.current.length} samples · ${strapName || 'Bluetooth strap'}`}
      />
    ), { hideClose: true });
  };

  // The heart of the state machine. Fired by the interval, every BLE sample,
  // and foreground returns — all wall-clock derived, so overlapping calls are
  // harmless and background time is never lost.
  const tick = () => {
    if (finishedRef.current) return;
    const st = stageRef.current;
    if (st === 'intro' || st === 'setup') return;
    const testElapsed = testElapsedNow();
    const se = stageElapsedNow();
    setTick((n) => n + 1);

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
    // No tap — start anyway so the timing stays honest.
    else if (st === 'prompt' && se >= PROMPT_SEC) enterStanding();
    else if (st === 'standing' && se >= STAND_SEC) finish(false);
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const strap = useStrapHr(() => tickRef.current());

  // The settle card lives in another sheet; it hears about the strap here.
  const connState = useRef({ value: false, subs: new Set<() => void>() });
  const conn = useRef<ConnBus>({
    subscribe: (f) => { connState.current.subs.add(f); return () => { connState.current.subs.delete(f); }; },
    get: () => connState.current.value,
  });
  useEffect(() => {
    connState.current.value = strap.connected;
    connState.current.subs.forEach((f) => f());
  }, [strap.connected]);

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
    testStartRef.current = clock();
    setCard(null);
    setStageBoth('resting');
    timerRef.current = setInterval(() => tickRef.current(), 250);
  };
  act.current = { begin, standing: enterStanding };

  const toSetup = () => { setStageBoth('setup'); raise('settle'); };

  // The arc's catch-up after a rest ended early.
  useEffect(() => {
    if (!skip) return;
    const id = setInterval(() => {
      if (Date.now() - skip.at >= SKIP_MS) setSkip(null);
      else setTick((n) => n + 1);
    }, 16);
    return () => clearInterval(id);
  }, [skip]);

  /* ---------- render ---------- */

  if (stage === 'intro') return <StandIntro steps={INTRO_STEPS} onStart={toSetup} />;

  const se = stageElapsedNow();
  const elapsedSec = stage === 'setup' ? 0
    : stage === 'resting' ? Math.min(REST_SEC, se)
      : skip ? skip.from + (REST_SEC - skip.from) * (1 - (1 - Math.min(1, (Date.now() - skip.at) / SKIP_MS)) ** 3)
        : stage === 'prompt' ? REST_SEC
          : stage === 'standing' ? REST_SEC + Math.min(STAND_SEC, se)
            : REST_SEC + STAND_SEC;
  const reached = (stage === 'prompt' || stage === 'standing') && !skip ? 1 : 0;
  const paused = (stage === 'setup' || stage === 'prompt') && !skip;
  const title = stage === 'setup' ? 'Get ready'
      : stage === 'prompt' ? 'Stand up'
        : stage === 'standing' ? 'Keep standing still' : 'Lie still';
  const sub = stage === 'resting' ? 'We’ll buzz when it’s time to stand.'
      : stage === 'standing' ? 'Your strap is recording.' : '';
  const big = { color: p.text, fontSize: 50, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums' as const], lineHeight: 54 };

  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: '700', color: p.text, paddingRight: 52 }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 4, minHeight: 20 }}>{sub}</Text>
      <View style={{ alignSelf: 'center', width: DIAL, height: DIAL, marginTop: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', opacity: paused ? 0.35 : 1 }}>
          <Dial stops={STOPS_MIN} elapsedMin={elapsedSec / 60} reached={reached} idle={stage === 'setup'} />
        </View>
        {skip ? null : paused ? <PauseMark /> : (
          <>
            <Text style={big}>{fmtCountdown(Math.ceil((stage === 'resting' ? REST_SEC : REST_SEC + STAND_SEC) - elapsedSec))}</Text>
            <Text style={{ color: p.textFaint, fontSize: 12.5, marginTop: 4 }}>{stage === 'resting' ? 'until you stand' : 'of standing left'}</Text>
          </>
        )}
      </View>

      {/* The one thing the hand-entered test cannot show: the strap, live. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 26, marginTop: 16 }}>
        <Stat label="HR" value={strap.hr != null ? String(strap.hr) : '—'} unit="bpm" />
        <Stat label="Rise" value={delta != null ? signedDelta(delta) : '—'} unit="Δ bpm" color={deltaColor(delta, 'standDelta')} />
        <Stat label="Peak" value={peakDelta != null ? signedDelta(peakDelta) : '—'} unit="Δ bpm" color={deltaColor(peakDelta, 'standDelta')} />
      </View>
      <View style={{ minHeight: 22, marginTop: 12, alignItems: 'center' }}>
        {!strap.connected ? <Text style={{ color: GRADE_COLORS.ok }}>Connecting to strap…</Text> : null}
      </View>

      <SheetFooter>
        {card && !cardUp ? (
          // Its card was closed without an answer; the test waits for it.
          <Button title="Continue" variant="primary" onPress={() => raise(card)} />
        ) : stage === 'resting' ? (
          // Skips the rest of the lying-down clock straight to standing up.
          <Button title="End rest step early" variant="default" onPress={enterPrompt} />
        ) : stage === 'standing' ? (
          <Button title="Finish test early" variant="default" onPress={() => finish(true)} />
        ) : (
          <Button title="End test early" variant="default" onPress={() => controls.closeAll()} />
        )}
      </SheetFooter>
    </View>
  );
}
