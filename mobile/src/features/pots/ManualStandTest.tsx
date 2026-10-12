/**
 * The POTS stand test and POTS episode with NO device.
 *
 * The stand test is one card holding a 15 minute dial: grey for lying down,
 * red for standing, a dot at every moment something is needed. When the hand
 * reaches a dot the phone buzzes, the dot fills and a prompt card stacks over
 * the dial with one instruction (take a reading, stand up); the clock holds
 * still, and the dial shows a pause mark, until that card is answered. The
 * episode is one form: the move, then its three heart rates.
 *
 * Nothing here reads a sensor and nothing here looks like it does: the dial is
 * a clock, and its centre only ever shows time until the numbers are typed in.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { TextField } from '../../components/Field';
import { fonts, radius, usePalette } from '../../theme';
import {
  buildManualStandFields, MANUAL_MARKS_MIN, parseBp, parseHr, type ManualStandReading,
} from '../../lib/pots/manual';
import { READING_TYPES } from '../../lib/registry';
import { computeScores, profileCtx } from '../../lib/scoring';
import { getState, upsertEntry } from '../../store/store';
import { pingLogged, pingPots } from '../../store/ping';
import { ageFromBirthday, keyOf, pad, uid } from '../../lib/dates';
import type { Entry } from '../../lib/types';
import { isPotsResultLocked } from '../PotsLock';
import { completionBuzz, fmtCountdown, PotsResultsSheet, signedDelta, stageBuzz } from './common';
import {
  Body, Dial, DIAL, PauseMark, Prompt, PromptTitle, SKIP_MS, StandCard, StandIntro, type IntroStep,
} from './StandDial';

const REST_SEC = 300;

function Title({ children }: { children: string }) {
  const p = usePalette();
  return <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>{children}</Text>;
}
interface Typed { hr: string; sys: string; dia: string }
const BLANK: Typed = { hr: '', sys: '', dia: '' };

/** One heart rate, with an optional blood pressure beside it when asked for. */
function ReadingFields({ value, onChange, bp, hrRef }: { value: Typed; onChange: (v: Typed) => void; bp?: boolean; hrRef?: React.Ref<TextInput> }) {
  const p = usePalette();
  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        <TextField label="Heart rate" unit="bpm" value={value.hr} onChange={(hr) => onChange({ ...value, hr })} keyboardType="numeric" inputRef={hrRef} />
      </View>
      {bp ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextField label="Systolic" value={value.sys} onChange={(sys) => onChange({ ...value, sys })} keyboardType="numeric" />
            <TextField label="Diastolic" value={value.dia} onChange={(dia) => onChange({ ...value, dia })} keyboardType="numeric" />
          </View>
          {parseBp(value.sys, value.dia) === 'invalid' ? (
            <Text style={{ color: p.textDim, fontSize: 13 }}>Enter both blood pressure numbers, or leave both empty.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const typedOk = (t: Typed) => parseHr(t.hr) != null && parseBp(t.sys, t.dia) !== 'invalid';

/* ---------- stand test ---------- */

const REST_MIN = REST_SEC / 60;
/** Every moment the test stops for something, in minutes of TEST time: the
 *  lying-down reading (and the stand-up that follows it), then each mark. */
const STOPS_MIN = [REST_MIN, ...MANUAL_MARKS_MIN.map((m) => REST_MIN + m)];
const TOTAL_MIN = STOPS_MIN[STOPS_MIN.length - 1];
function SettleCard({ onStart }: { onStart: () => void }) {
  return (
    <View>
      <PromptTitle>Lie down and get settled</PromptTitle>
      <Body>Lie flat with your phone in reach. Tap start once you are comfortable.</Body>
      <View style={{ flexDirection: 'row' }}>
        <Button title="Start test" variant="primary" onPress={onStart} />
      </View>
    </View>
  );
}

/** The reading asked for at a stop: `mark` is null for the lying-down one. */
function ReadingCard({ mark, last, onSave }: { mark: number | null; last: boolean; onSave: (t: Typed) => void }) {
  const p = usePalette();
  const [value, setValue] = useState<Typed>(BLANK);
  const hrRef = useRef<TextInput>(null);
  // Once the card has landed, so the keyboard does not fight its rise.
  useEffect(() => {
    const id = setTimeout(() => hrRef.current?.focus(), 500);
    return () => clearTimeout(id);
  }, []);
  return (
    <View>
      {mark != null ? (
        <Text style={{ color: p.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>
          {`${mark} ${mark === 1 ? 'minute' : 'minutes'} standing`}
        </Text>
      ) : null}
      <PromptTitle>Take your heart rate</PromptTitle>
      <Body>{mark == null ? 'Stay lying down while you measure. Blood pressure is optional.' : 'Keep standing while you measure. Blood pressure is optional.'}</Body>
      <ReadingFields value={value} onChange={setValue} bp hrRef={hrRef} />
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <Button
          title={mark == null || last ? 'Save' : 'Save and keep standing'} variant="primary"
          disabled={!typedOk(value)} onPress={() => onSave(value)}
        />
      </View>
    </View>
  );
}

const INTRO_STEPS: IntroStep[] = [
  { title: 'Lie still', time: '5 min', sub: 'Rest, then enter your heart rate.' },
  { title: 'Stand up', time: '10 min', sub: 'Stay still. No walking or leaning.' },
  { title: 'Enter heart rate', time: '4×', sub: 'Your phone buzzes at 1, 3, 5 and 10 minutes. Blood pressure is optional.' },
];

type CardKind = 'settle' | 'reading' | 'stand';

export function ManualStandTest({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  useKeepAwake();

  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro');
  // The test clock only advances while nothing is being asked: `base` is the
  // TEST seconds banked so far and `runStart` the wall-clock moment the current
  // stretch began (null = paused). Wall-clock derived, so a locked phone costs
  // nothing, and it can never run past the next stop.
  const [base, setBase] = useState(0);
  const [runStart, setRunStart] = useState<number | null>(null);
  /** How many stops the hand has reached. */
  const [reached, setReached] = useState(0);
  /** The prompt the test is waiting on, and whether its card is on screen. */
  const [card, setCard] = useState<CardKind | null>(null);
  const [cardUp, setCardUp] = useState(false);
  const [result, setResult] = useState<Entry | null>(null);
  /** Typed readings by stop: the lying-down one first, then each mark. */
  const values = useRef<(Typed | null)[]>(STOPS_MIN.map(() => null));
  const startedAt = useRef<Date | null>(null);
  /** Seconds actually spent lying down: the full rest unless it was cut short. */
  const restSeconds = useRef(REST_SEC);
  const upToken = useRef(0);
  /** The rest cut short: the arc catches up from here while the card rises. */
  const [skip, setSkip] = useState<{ from: number; at: number } | null>(null);
  const [, setTick] = useState(0);

  const stopSec = STOPS_MIN[Math.min(reached, STOPS_MIN.length - 1)] * 60;
  const elapsed = skip ? skip.from + (base - skip.from) * (1 - (1 - Math.min(1, (Date.now() - skip.at) / SKIP_MS)) ** 3)
    : runStart == null ? base : Math.min(stopSec, base + (Date.now() - runStart) / 1000);

  const standingReadings = (): ManualStandReading[] => {
    const out: ManualStandReading[] = [];
    MANUAL_MARKS_MIN.forEach((min, k) => {
      const t = values.current[k + 1];
      const hr = t ? parseHr(t.hr) : null;
      const bp = t ? parseBp(t.sys, t.dia) : null;
      if (hr != null && bp !== 'invalid') out.push({ min, hr, ...(bp ? { sys: bp.sys, dia: bp.dia } : {}) });
    });
    return out;
  };

  /** Everything typed so far becomes the entry, and the dial becomes the receipt. */
  const finish = () => {
    const rest = values.current[0];
    const baselineHr = rest ? parseHr(rest.hr) : null;
    const baselineBp = rest ? parseBp(rest.sys, rest.dia) : null;
    const profile = getState().profile;
    const fields = baselineHr != null && baselineBp !== 'invalid' ? buildManualStandFields({
      baselineHr, baselineBp, readings: standingReadings(), restSeconds: restSeconds.current,
      age: ageFromBirthday(profile?.birthday),
      sex: profile?.sex as string | undefined,
    }) : null;
    // No standing reading: nothing to compare the baseline with, nothing to keep.
    if (!fields) { controls.closeAll(); return; }
    const d = startedAt.current ?? new Date();
    const entry: Entry = {
      id: uid(), type: 'standTest',
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      startedAt: d.toISOString(),
      note: '', source: 'manual', ...fields,
    };
    entry.scores = computeScores(entry, profileCtx(profile));
    completionBuzz();
    setRunStart(null);
    setCard(null);
    setResult(entry);
    setPhase('done');
    // A finished test is filed by its results card, so that card is the only
    // way on from here.
    controls.setOptions({ hideClose: true });
  };

  // The prompt cards are built once when they open, so they reach the test
  // through a ref that always holds this render's handlers.
  const act = useRef({ settle: () => {}, reading: (_t: Typed) => {}, standing: () => {} });
  act.current = {
    settle: () => { startedAt.current = new Date(); setCard(null); setRunStart(Date.now()); },
    reading: (t) => {
      const k = reached - 1;
      values.current[k] = t;
      if (k === 0) raise('stand');
      else if (k === STOPS_MIN.length - 1) finish();
      else { setCard(null); setRunStart(Date.now()); }
    },
    standing: () => { setCard(null); setRunStart(Date.now()); },
  };

  function raise(kind: CardKind, stop = reached - 1) {
    const token = ++upToken.current;
    setCard(kind);
    setCardUp(true);
    // Every card that comes up is felt, whatever raised it.
    stageBuzz();
    const mark = stop > 0 ? MANUAL_MARKS_MIN[stop - 1] : null;
    openSheet((c) => (
      <Prompt onGone={() => { if (upToken.current === token) setCardUp(false); }}>
        {kind === 'settle' ? <SettleCard onStart={() => { act.current.settle(); c.close(); }} />
          : kind === 'stand' ? <StandCard onStanding={() => { act.current.standing(); c.close(); }} />
            : <ReadingCard mark={mark} last={stop === STOPS_MIN.length - 1} onSave={(t) => { act.current.reading(t); c.close(); }} />}
      </Prompt>
    ), { fitContent: true });
  }

  // Tick while the clock runs, and stop it the moment the hand reaches a dot:
  // the dot fills, the phone buzzes and the card for that stop comes up.
  const arrive = useRef(() => {});
  arrive.current = () => {
    setBase(stopSec);
    setRunStart(null);
    setReached(reached + 1);
    raise('reading', reached);
  };
  useEffect(() => {
    if (runStart == null) return;
    const id = setInterval(() => {
      if (base + (Date.now() - runStart) / 1000 >= stopSec) arrive.current();
      else setTick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, [runStart, base, stopSec]);

  const endRestEarly = () => {
    if (runStart == null) return;
    const now = Math.min(stopSec, base + (Date.now() - runStart) / 1000);
    restSeconds.current = Math.round(now);
    setSkip({ from: now, at: Date.now() });
    arrive.current();
  };
  useEffect(() => {
    if (!skip) return;
    const id = setInterval(() => {
      if (Date.now() - skip.at >= SKIP_MS) setSkip(null);
      else setTick((n) => n + 1);
    }, 16);
    return () => clearInterval(id);
  }, [skip]);

  if (phase === 'intro') return <StandIntro steps={INTRO_STEPS} onStart={() => { setPhase('run'); raise('settle'); }} />;

  const standing = reached > 0 && card !== 'stand' && !(reached === 1 && card === 'reading');
  const paused = phase === 'run' && runStart == null && !skip;
  const remain = Math.ceil(stopSec - elapsed);
  const nextMark = MANUAL_MARKS_MIN[Math.min(Math.max(reached - 1, 0), MANUAL_MARKS_MIN.length - 1)];
  const title = phase === 'done' ? 'You can sit down'
    : card === 'settle' ? 'Get ready'
      : card === 'stand' ? 'Stand up'
        : standing ? 'Keep standing still' : 'Lie still';
  const sub = phase === 'done' ? 'Test complete. Take a moment.'
    : paused || skip ? ''
      : standing ? `Next reading at ${nextMark} ${nextMark === 1 ? 'minute' : 'minutes'}.` : 'We’ll buzz when it’s time.';

  const locked = isPotsResultLocked(result);
  const n = standingReadings().length;
  const seeResults = () => {
    if (!result) return;
    // The capture is the event, as it is for the strap and the watch.
    pingPots('stand');
    const d = startedAt.current ?? new Date();
    controls.close();
    openSheet((c) => (
      <PotsResultsSheet
        entry={result} dayKey={keyOf(d)} controls={c}
        title="Test complete"
        sub={`${n} standing ${n === 1 ? 'reading' : 'readings'} · entered by hand`}
      />
    ), { hideClose: true });
  };

  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: '700', color: p.text, paddingRight: 52 }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 4, minHeight: 20 }}>{sub}</Text>
      <View style={{ alignSelf: 'center', width: DIAL, height: DIAL, marginTop: 36, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', opacity: paused ? 0.35 : 1 }}>
          <Dial stops={STOPS_MIN} elapsedMin={phase === 'done' ? TOTAL_MIN : elapsed / 60} reached={phase === 'done' ? STOPS_MIN.length : skip ? reached - 1 : reached} idle={card === 'settle'} />
        </View>
        {phase === 'done' ? (
          locked || !result ? (
            <Text style={{ color: p.textDim, fontSize: 14, fontWeight: '600' }}>{`${n} standing ${n === 1 ? 'reading' : 'readings'}`}</Text>
          ) : (
            <>
              <Text style={{ color: p.accent, fontSize: 50, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'], lineHeight: 54 }}>{signedDelta(Number(result.peakDelta))}<Text style={{ fontFamily: undefined, fontSize: 34, fontWeight: '800' }}> Δ</Text></Text>
              <Text style={{ color: p.textFaint, fontSize: 12.5, marginTop: 4 }}>bpm highest rise</Text>
              <Text style={{ color: p.textDim, fontSize: 12.5, fontWeight: '600', marginTop: 10 }}>{`${result.baselineHr} lying · ${result.peakHr} peak`}</Text>
            </>
          )
        ) : skip ? null : paused ? <PauseMark /> : (
          <>
            <Text style={{ color: p.text, fontSize: 50, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'], lineHeight: 54 }}>{fmtCountdown(remain)}</Text>
            <Text style={{ color: p.textFaint, fontSize: 12.5, marginTop: 4 }}>
              {!standing ? 'until your first reading' : reached === STOPS_MIN.length - 1 ? 'until your last reading' : 'until the next reading'}
            </Text>
            {standing ? (
              <Text style={{ color: p.textDim, fontSize: 12.5, fontWeight: '600', marginTop: 10 }}>{`${fmtCountdown(Math.ceil(TOTAL_MIN * 60 - elapsed))} standing left`}</Text>
            ) : null}
          </>
        )}
      </View>
      <SheetFooter>
        {phase === 'done' ? (
          <Button title="See results" variant="primary" onPress={seeResults} />
        ) : card && !cardUp ? (
          // Its card was closed without an answer; the clock waits for it.
          <Button title="Continue" variant="primary" onPress={() => raise(card)} />
        ) : standing && n > 0 ? (
          <Button title="Finish test early" variant="default" onPress={finish} />
        ) : reached === 0 && runStart != null ? (
          // Skips the rest of the lying-down clock straight to its reading.
          <Button title="End rest step early" variant="default" onPress={endRestEarly} />
        ) : (
          <Button title="End test early" variant="default" onPress={() => controls.closeAll()} />
        )}
      </SheetFooter>
    </View>
  );
}

/* ---------- episode ---------- */

const TRANSITIONS = (READING_TYPES.orthostatic.fields || []).find((f) => f.key === 'transition')?.options || [];

/** Shorter words for the buttons. The stored value stays the registry's own,
 *  so a typed episode files under the same transition a watch one does. */
const TRANSITION_LABEL: Record<string, string> = {
  'Laying to standing': 'Lay to stand',
  'Sitting to standing': 'Sit to stand',
  'Climbing stairs': 'Climb stairs',
};

/** One view: what the move was, then the heart rate before it, right after
 *  it and 60 seconds later. `onSaved` gets the saved entry once the stack has
 *  closed, the way the plain form's does. */
export function ManualEpisode({ dk, controls, onSaved }: { dk: string; controls: SheetControls; onSaved: (saved: Entry) => void }) {
  const [transition, setTransition] = useState(TRANSITIONS[0] || '');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [later, setLater] = useState('');
  const startedAt = useRef(new Date());
  const p = usePalette();

  const b = parseHr(before), a = parseHr(after), l = parseHr(later);
  const save = () => {
    if (b == null || a == null || l == null) return;
    const d = startedAt.current;
    const entry: Entry = {
      id: uid(), type: 'orthostatic',
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      note: '', source: 'manual', transition,
      beforeHr: String(b), afterHr: String(a), hr1min: String(l),
    };
    entry.scores = computeScores(entry, profileCtx(getState().profile));
    upsertEntry(dk, 'readings', entry);
    pingLogged('readings', 'orthostatic');
    controls.closeAll();
    onSaved(entry);
  };

  return (
    <View>
      <Title>POTS episode</Title>
      <Body>Take your heart rate before you move, as soon as you are upright or done climbing, and once more 60 seconds later.</Body>
      {/* The one choice on the card, set apart from the three numbers under it. */}
      <View style={{ padding: 14, marginBottom: 14, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: p.border, backgroundColor: p.sunk }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '700', marginBottom: 12 }}>What are you about to do?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TRANSITIONS.map((o) => {
            const active = o === transition;
            return (
              <Pressable key={o} onPress={() => setTransition(o)} style={{ paddingHorizontal: 15, paddingVertical: 11, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
                <Text style={{ color: active ? p.accent : p.text, fontSize: 16, fontWeight: '600' }}>{TRANSITION_LABEL[o] || o}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextField label="HR before" unit="bpm" value={before} onChange={setBefore} keyboardType="numeric" />
        <TextField label="HR after" unit="bpm" value={after} onChange={setAfter} keyboardType="numeric" />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <TextField label="HR after 60s" unit="bpm" value={later} onChange={setLater} keyboardType="numeric" />
      </View>
      <SheetFooter>
        <Button title="Save episode" variant="primary" onPress={save} disabled={b == null || a == null || l == null} />
      </SheetFooter>
    </View>
  );
}
