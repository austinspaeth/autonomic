/**
 * First-run welcome wizard — shown once, before any data exists. Six steps:
 * Welcome → Private & on-device → Disclaimer (gated acknowledge) → About you
 * (profile basics, skippable) → Connect data (Apple Health / heart-rate strap,
 * both optional) → First reading. Completing it stamps `meta.onboarded`, fades
 * to black, then fades the app UI in beneath. Settings can re-show it any time
 * via `showWelcomeAgain()`.
 *
 * The last step ENDS IN AN ACTION rather than a legend. It used to be "You're
 * all set", a list of six features that scrolled off the screen with the one
 * thing it actually wanted — the morning reminder — below the fold. Nothing in
 * the app works until there is a first HRV reading: no score, no trend, no
 * correlation, nothing to come back for. So the step asks for exactly one
 * choice (which sensor) and hands the capture card straight to the user, with
 * the reminder riding in the footer beside the button. Its primary FINISHES the
 * wizard first and opens the capture over the live Journal, so the reading is
 * never taken on top of an overlay that is about to fade. Skipping is allowed
 * and lands on `<BaselineWaitingCard/>` (features/DaySummary), which is the
 * Journal's Outlook slot until a reading exists.
 *
 * Connecting Apple Health in the Connect-data step pops a one-time confirmation
 * card offering to backfill the last year of history (RR-based HRV, blood
 * pressure, resting HR, sleep with overnight HR, workouts, medications).
 * That import is guarded by `meta.healthHistoryImported` so it runs at most once.
 *
 * The wizard renders as an absolute-fill overlay above the tab UI (mounted in
 * app/_layout.tsx), so the app is already live underneath when the reveal runs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInLeft, FadeInRight, FadeOut, FadeOutLeft, FadeOutRight,
  interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, Icon, type IconName } from '../components/Icon';
import { Button } from '../components/ui';
import { DatePickerSheet, HeightPickerSheet, fmtHeight, onlyNumeric } from '../components/Field';
import { CheckBox, REMINDER_BLURB, REMINDER_SETUP_TITLE, REMINDER_TITLE, useReminderToggle } from './Reminders';
import { fmtDateFull, fmtTime12, uid } from '../lib/dates';
import { SheetControls, SheetPill, SheetPillButton, useSheets } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ACCENT, radius, usePalette } from '../theme';
import { health, healthAppName, type HistoryProgress } from '../lib/health';
import { workoutCandidateOf } from '../lib/health/workoutCandidate';
import { typesFor } from '../lib/typeCatalog';
import { computeScores } from '../lib/scoring';
import { rrCoverageSec } from '../lib/hrvQuality';
import { blankDay, getState, mutate, save, storeSleepSeries, storeWaveform, useAppState } from '../store/store';
import { DevicesScreen } from './Devices';
import { type SessionConfig } from './hrv/Session';
import { defaultPeriodFor, defaultSource, openCapture, sourceBlocker } from './hrv/Setup';
import { SOURCE_META, sourceSub, type Source } from './hrv/SourcePicker';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Wizard palette — from the Welcome Wizard design comp (darker than app surfaces). */
const C = {
  bg: '#0a0a0b',
  tile: '#131315',
  row: '#161618',
  tileBorder: 'rgba(255,255,255,0.08)',
  rowBorder: 'rgba(255,255,255,0.04)',
  text: '#f2f2f4',
  dim: '#a6a6ae',
  faint: '#8a8a92',
  chevron: '#5c5c64',
  accentBorder: 'rgba(224,49,39,0.33)',
  accentWash: 'rgba(224,49,39,0.07)',
};

const STEPS = 6;
/** Opacity of the back arrow where there's nothing to go back to. */
const BACK_GHOST = 0.22;
const PRIMARY_LABELS = ['Get started', 'Continue', 'I understand', 'Continue', 'Continue', 'Start my first reading'];
const STEP_DUR = 280;

/** Steps that show the top-right Skip (About you, Connect data, First reading).
 *  Skipping the last one finishes the wizard without opening a capture. */
const SKIPPABLE = new Set([3, 4, 5]);

/** How far back the one-time historical import reaches. */
const HISTORY_DAYS = 365;

/**
 * One-time backfill of Apple Health / Health Connect history into the journal —
 * the last year of readings (RR-based HRV, blood pressure, resting heart rate),
 * nights of sleep with their overnight HR and stages, workouts with their HR
 * traces, and medication doses — each written into the day it was recorded and
 * scored like a live capture. Assumes read permission is already granted.
 * Idempotent — stamps (and is guarded by) meta.healthHistoryImported, so it can
 * never double-import. Returns how many items were added.
 */
async function importHealthHistory(onProgress?: (p: HistoryProgress) => void): Promise<number> {
  const api = health();
  if (!api.available) return 0;
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - HISTORY_DAYS);
  const bundle = await api.readHistory({
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    onProgress,
  });
  const st = getState();
  const ctx = { sex: st.profile.sex, height: st.profile.height };
  const note = `From ${healthAppName()}`;
  const source = Platform.OS === 'android' ? 'health' : 'watch';
  // Doses come back under the health app's own name; only those matching a med
  // type we know how to file get imported (same rule as the daily check).
  const medTypes = typesFor(st, 'meds');
  const medKeyByLabel = new Map(Object.keys(medTypes).map((k) => [medTypes[k].label.toLowerCase(), k]));
  let added = 0;
  mutate((s) => {
    if (s.meta.healthHistoryImported) return;          // already ran — no-op
    const day = (dk: string) => {
      if (!s.days[dk]) s.days[dk] = blankDay();
      return s.days[dk];
    };

    for (const r of bundle.readings) {
      if (r.ownApp) continue;                           // skip our own write-backs
      const entry: Record<string, unknown> = {
        id: uid(), type: r.type, time: r.time, note, source, imported: true, ...r.fields,
      };
      // How much real RR the sample covered — the trust gate downstream reads
      // this, so a short one can never re-enter the averages (hrvQuality.ts).
      if (r.type === 'hrv') entry.durationSec = rrCoverageSec(r.rr);
      // RR series goes to the waveform sidecar, never inline on the entry
      // (rrClean is derived — recomputed on view, not stored).
      if (r.rr) storeWaveform(entry.id as string, { rrRaw: r.rr });
      entry.scores = computeScores(entry as never, ctx);
      day(r.dayKey).readings.push(entry as never);
      added++;
    }

    for (const w of bundle.workouts) {
      if (w.ownApp) continue;                           // our own watch sessions
      const cand = workoutCandidateOf(w);
      const entry: Record<string, unknown> = {
        id: uid(), type: cand.type, time: cand.time, note: '', source: 'health', imported: true, ...cand.entry,
      };
      // The full HR trace powers the workout report; sidecar, never inline.
      if (cand.hrSeries?.length) storeWaveform(entry.id as string, { sampledHr: cand.hrSeries });
      entry.scores = computeScores(entry as never, ctx);
      day(w.dayKey).activities.push(entry as never);
      added++;
    }

    for (const m of bundle.meds) {
      if (m.ownApp) continue;
      const type = medKeyByLabel.get(m.name.trim().toLowerCase());
      if (!type) continue;                              // nothing sane to file it under
      const amount = m.amount ? (m.amount.match(/[\d.]+/)?.[0] ?? '') : '';
      day(m.dayKey).meds.push({ id: uid(), type, time: m.time, note, amount } as never);
      added++;
    }

    for (const n of bundle.sleep) {
      const d = day(n.dayKey);
      if (d.sleep?.bed && d.sleep?.wake) continue;      // never overwrite a logged night
      d.sleep = {
        ...d.sleep,
        bed: n.bed,
        wake: n.wake,
        quality: n.interrupted ? 'interrupted' : (d.sleep?.quality || 'good'),
        ...(n.hrLow != null ? { hrLow: n.hrLow } : {}),
        ...(n.hrHigh != null ? { hrHigh: n.hrHigh } : {}),
        ...(n.stages ? { stages: n.stages } : {}),
      };
      // Series to the sidecar, summary numbers to the journal.
      storeSleepSeries(n.dayKey, n);
      added++;
    }

    s.meta.healthHistoryImported = new Date().toISOString();
  });
  return added;
}

// Settings → "Show welcome guide" re-mounts the wizard through this tiny event.
const welcomeListeners = new Set<() => void>();
export function showWelcomeAgain() { welcomeListeners.forEach((l) => l()); }

/** Mounts the wizard for a fresh install (no completed flow, no prior data) —
 *  or on demand when Settings asks for it again. */
export function OnboardingGate() {
  const [show, setShow] = useState(() => {
    const s = getState();
    return !s.meta.onboarded && !s.meta.lastUpdated;
  });
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    const l = () => { setRunId((i) => i + 1); setShow(true); };
    welcomeListeners.add(l);
    return () => { welcomeListeners.delete(l); };
  }, []);
  if (!show) return null;
  return <Onboarding key={runId} onDone={() => setShow(false)} />;
}

/* ---------- small stroke-icon helper (paths from the design comp) ---------- */
function Glyph({ size = 20, w = 1.8, color = ACCENT, vb = '0 0 24 24', d = [], circle, rect }: {
  size?: number; w?: number; color?: string; vb?: string; d?: string[];
  circle?: { r: number; w?: number };
  rect?: { x: number; y: number; wd: number; ht: number; rx: number };
}) {
  const common = { stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
  return (
    <Svg width={size} height={size} viewBox={vb}>
      {circle ? <Circle cx={12} cy={12} r={circle.r} strokeWidth={circle.w ?? w} {...common} /> : null}
      {rect ? <Rect x={rect.x} y={rect.y} width={rect.wd} height={rect.ht} rx={rect.rx} strokeWidth={w} {...common} /> : null}
      {d.map((p, i) => <Path key={i} d={p} strokeWidth={w} {...common} />)}
    </Svg>
  );
}

/* ---------- progress dot: active stretches to a pill, past dots tint red ---------- */
function Dot({ i, step }: { i: number; step: number }) {
  const target = i === step ? 1 : i < step ? 0.5 : 0;
  const t = useSharedValue(target);
  useEffect(() => { t.value = withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) }); }, [target, t]);
  const style = useAnimatedStyle(() => ({
    width: 6 + 28 * Math.max(0, t.value - 0.5),
    backgroundColor: interpolateColor(t.value, [0, 0.5, 1], ['rgba(255,255,255,0.12)', 'rgba(224,49,39,0.40)', ACCENT]),
  }));
  return <Animated.View style={[{ height: 6, borderRadius: 999 }, style]} />;
}

/* ---------- disclaimer acknowledge row ---------- */
function AckRow({ on, onPress }: { on: boolean; onPress: () => void }) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => { t.value = withTiming(on ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) }); }, [on, t]);
  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [C.row, C.accentWash]),
    borderColor: interpolateColor(t.value, [0, 1], [C.rowBorder, C.accentBorder]),
  }));
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(0,0,0,0)', ACCENT]),
    borderColor: interpolateColor(t.value, [0, 1], ['rgba(255,255,255,0.16)', ACCENT]),
  }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.5 + 0.5 * t.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderRadius: 14, padding: 16 }, rowStyle]}
    >
      <Animated.View style={[{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, boxStyle]}>
        <Animated.View style={checkStyle}>
          <Glyph size={14} w={3} color="#fff" d={['M20 6L9 17l-5-5']} />
        </Animated.View>
      </Animated.View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 21, color: C.text }}>I understand and want to continue.</Text>
    </AnimatedPressable>
  );
}

/* ---------- connect-your-data row ---------- */
function ConnectRow({ glyph, title, sub, on, busy, onPress }: {
  glyph: React.ReactNode; title: string; sub: string; on: boolean; busy?: boolean; onPress: () => void;
}) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => { t.value = withTiming(on ? 1 : 0, { duration: 220 }); }, [on, t]);
  const rowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(t.value, [0, 1], [C.rowBorder, C.accentBorder]),
  }));
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={!!busy}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.row, borderWidth: 1, borderRadius: 14, padding: 16 }, rowStyle]}
    >
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>{sub}</Text>
      </View>
      {busy
        ? <ActivityIndicator color={ACCENT} />
        : on
          ? <Glyph size={20} w={2.2} color={ACCENT} d={['M20 6L9 17l-5-5']} />
          : <Glyph size={20} w={2} color={C.chevron} d={['M9 6l6 6-6 6']} />}
    </AnimatedPressable>
  );
}

/* ---------- morning-reminder opt-in (last step) ---------- */

/** Sits directly above "Start logging" — the one nudge the wizard asks for,
 *  since a baseline is only meaningful if the readings behind it were taken at
 *  the same time of day. Checking it opens the time picker; the box only fills
 *  once a time is saved and the OS grants permission. */
function ReminderCard() {
  const { on, time, toggle } = useReminderToggle();
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => { t.value = withTiming(on ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [on, t]);
  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(224,49,39,0.05)', 'rgba(224,49,39,0.11)']),
    borderColor: interpolateColor(t.value, [0, 1], ['rgba(224,49,39,0.30)', 'rgba(224,49,39,0.58)']),
  }));
  return (
    <AnimatedPressable
      onPress={toggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14, marginTop: 14 }, rowStyle]}
    >
      <CheckBox on={on} tone={{ accent: ACCENT, border: 'rgba(255,255,255,0.22)' }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.text }}>{on ? REMINDER_TITLE : REMINDER_SETUP_TITLE}</Text>
        <Text style={{ fontSize: 12.5, lineHeight: 17, color: C.faint, marginTop: 2 }}>
          {on ? `Every morning at ${fmtTime12(time)}` : REMINDER_BLURB}
        </Text>
      </View>
      {on ? null : <Glyph size={18} w={2} color={C.chevron} d={['M9 6l6 6-6 6']} />}
    </AnimatedPressable>
  );
}

/* ---------- last step: one sensor row ---------- */

/** A sensor the first reading can use. Wears the app's own icon and accuracy
 *  badge for that source (SOURCE_META) rather than a second set of names, so
 *  the wizard and the HRV setup sheet describe the same three things the same
 *  way. Selection is a filled radio and an accent border — the wizard's
 *  ConnectRow treatment, not a new one. */
function MethodRow({ source, sub, selected, onPress }: {
  source: Source; sub: string; selected: boolean; onPress: () => void;
}) {
  const meta = SOURCE_META[source];
  const t = useSharedValue(selected ? 1 : 0);
  useEffect(() => { t.value = withTiming(selected ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [selected, t]);
  const rowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [C.row, C.accentWash]),
    borderColor: interpolateColor(t.value, [0, 1], [C.rowBorder, C.accentBorder]),
  }));
  const radioStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(0,0,0,0)', ACCENT]),
    borderColor: interpolateColor(t.value, [0, 1], ['rgba(255,255,255,0.16)', ACCENT]),
  }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.5 + 0.5 * t.value }] }));
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 14, padding: 14 }, rowStyle]}
    >
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={meta.icon} size={21} color={selected ? ACCENT : C.faint} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{meta.title}</Text>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: selected ? C.accentBorder : 'rgba(255,255,255,0.14)' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: selected ? '#e8807c' : C.faint }}>{meta.badge}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 12.5, lineHeight: 17, color: C.faint, marginTop: 3 }}>{sub}</Text>
      </View>
      <Animated.View style={[{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, radioStyle]}>
        <Animated.View style={checkStyle}>
          <Glyph size={12} w={3.2} color="#fff" d={['M20 6L9 17l-5-5']} />
        </Animated.View>
      </Animated.View>
    </AnimatedPressable>
  );
}

/** One of the two kinds of reading, explained. Not tappable: the primary
 *  commits to a baseline, and this says what the other one is for. */
function KindRow({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: 1, borderTopColor: C.tileBorder, paddingTop: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.faint, marginTop: 2 }}>{children}</Text>
      </View>
    </View>
  );
}

/** Bare icon + sentence bullet row. The text lives in a flexed wrapper so long
 *  lines wrap inside the padded content area (nested bold Text spans otherwise
 *  measure against the full screen width). */
function Bullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={st.privRow}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={st.privLabel}>{children}</Text>
      </View>
    </View>
  );
}

/* ---------- one-time "import your history?" confirmation card ---------- */
function HistoryImportSheet({ controls, onImported }: {
  controls: SheetControls; onImported: (n: number | null) => void;
}) {
  const p = usePalette();
  const [busy, setBusy] = useState(false);
  // A year of history takes a while to walk, so the sheet narrates the sweep
  // ("Sleep · 140/312") instead of sitting on a bare spinner.
  const [status, setStatus] = useState('');
  // App-themed sheet (rendered above the dark wizard), so it uses the palette.
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Reading your history');
    let n: number | null;
    try {
      n = await importHealthHistory((pr) => {
        setStatus(pr.total > 1 ? `${pr.label} · ${pr.done}/${pr.total}` : pr.label);
      });
    } catch { n = null; }
    setBusy(false);
    onImported(n);
    controls.close();
  };
  return (
    <View style={{ gap: 16 }}>
      <View style={{ width: 54, height: 54, borderRadius: 15, backgroundColor: p.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph size={26} color={p.accent} d={['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3']} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.3, color: p.text }}>Import your history?</Text>
        <Text style={{ fontSize: 14.5, lineHeight: 22, color: p.textDim }}>
          {`Bring the past year from ${healthAppName()} into your journal so your trends start full: sleep, workouts, blood pressure${Platform.OS === 'ios' ? ', resting heart rate and HRV' : ' and resting heart rate'}. This is a one-time import, and new readings sync automatically as you go.`}
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, opacity: 0.85 }}>
          {Platform.OS === 'ios'
            ? 'Only HRV recordings with beat-to-beat detail of at least four minutes come in, so the full variability panel is available. It can take a minute.'
            : 'Health Connect keeps no beat-to-beat detail, so HRV readings are not imported. Everything else comes in. It can take a minute.'}
        </Text>
        {busy && !!status && (
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.accent }}>{status}</Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button title="Not now" onPress={() => { if (!busy) controls.close(); }} />
        <Pressable
          onPress={run}
          disabled={busy}
          style={{ flex: 1, borderRadius: radius.control, backgroundColor: p.accent, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.85 : 1 }}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Import</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { openSheet } = useSheets();
  const state = useAppState();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [ack, setAck] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // The last step's sensor choice, seeded exactly the way the HRV setup sheet
  // seeds its own (a paired strap wins, else the camera).
  const [source, setSource] = useState<Source>(defaultSource);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);

  // Keyboard tracking so the bottom action bar floats above the keyboard and can
  // offer a hide-keyboard button — mirrors the sheet footer pattern. Only the
  // About-you step has an input (weight); scroll it into view when the kb opens.
  const scrollRef = useRef<ScrollView>(null);
  const kb = useSharedValue(0);
  const [kbOpen, setKbOpen] = useState(false);
  // Android: no automaticallyAdjustKeyboardInsets, and with edge-to-edge the
  // window doesn't resize either — pad the scroll content by the keyboard
  // height ourselves so scrollToEnd can actually clear it.
  const [kbPad, setKbPad] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const onShow = (e: { endCoordinates: { height: number }; duration?: number }) => {
      kb.value = withTiming(e.endCoordinates.height, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) });
      setKbOpen(true);
      if (!ios) setKbPad(e.endCoordinates.height);
      // A frame late (two on Android, where the padding must land first) so the
      // scroll range includes the new keyboard clearance.
      requestAnimationFrame(() => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true })));
    };
    const onHide = (e?: { duration?: number }) => {
      kb.value = withTiming(0, { duration: (e && e.duration) || 250, easing: Easing.out(Easing.cubic) });
      setKbOpen(false);
      setKbPad(0);
    };
    const s = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const h = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => { s.remove(); h.remove(); };
  }, [kb]);
  const actionBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kb.value }],
    paddingBottom: 12 + (insets.bottom - 4) * (1 - Math.min(1, kb.value / 24)),
  }));

  const healthOn = !!state.settings.healthEnabled;
  const strapOn = !!state.settings.lastBleDeviceId;
  const gated = step === 2 && !ack;

  // About-you profile fields — prefilled so re-running the wizard shows what's set.
  const prof = getState().profile;
  const [sex, setSex] = useState(prof.sex || '');
  const [birthday, setBirthday] = useState(prof.birthday || '');
  const [weight, setWeight] = useState(prof.weight || '');
  const [height, setHeight] = useState(prof.height || '');
  const saveProfile = () => {
    mutate((s) => { s.profile = { sex, birthday: birthday.trim(), weight: weight.trim(), height: height.trim() }; });
  };

  // Step navigation. Direction is committed a frame before the step so the
  // outgoing view's `exiting` preset matches the direction of travel.
  const go = (n: number) => {
    const d = n > step ? 1 : -1;
    if (d !== dir) { setDir(d); requestAnimationFrame(() => setStep(n)); }
    else setStep(n);
  };
  const next = () => {
    if (gated || finishing) return;
    if (step === 3) saveProfile(); // Continue commits the profile; Skip doesn't
    if (step >= STEPS - 1) startFirstReading();
    else go(step + 1);
  };
  // Skip on the last step ends the wizard rather than walking off the end of
  // it; the Journal's baseline card is where that user lands.
  const skip = () => {
    if (finishing) return;
    if (step >= STEPS - 1) finish();
    else go(step + 1);
  };
  const back = () => { if (step > 0 && !finishing) go(step - 1); };

  // Finish: fade to black over the wizard, stamp the flag while the screen is
  // fully dark, then fade the whole overlay out to reveal the live app.
  //
  // `pending` is the capture the last step asked for. It is opened only once
  // the overlay has finished fading, so the capture card rises over the live
  // Journal rather than over a wizard that is still on screen — the sheet stack
  // lives in the root layout, so it outlives this component either way.
  const cover = useSharedValue(0);
  const root = useSharedValue(1);
  const pending = useRef<SessionConfig | null>(null);
  const revealed = () => {
    onDone();
    const config = pending.current;
    pending.current = null;
    if (config) openCapture(config, openSheet);
  };
  const reveal = () => {
    mutate((s) => { s.meta.onboarded = new Date().toISOString(); });
    root.value = withDelay(140, withTiming(0, { duration: 640, easing: Easing.inOut(Easing.quad) }, (fin) => {
      if (fin) runOnJS(revealed)();
    }));
  };
  const finish = () => {
    setFinishing(true);
    cover.value = withTiming(1, { duration: 400, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(reveal)();
    });
  };

  /**
   * The last step's primary. A strap with nothing paired is a detour into the
   * devices card rather than a refusal — the same rule the HRV setup sheet
   * follows — and anything the platform genuinely cannot do says so and stays
   * put. Otherwise the pick is remembered (so the next capture defaults to it)
   * and the wizard finishes with the capture queued behind the fade.
   *
   * BASELINE, never training: a first-time user has no idea what HRV is yet,
   * and paced breathing is a thing to graduate to, not to be handed on day one.
   */
  const startFirstReading = () => {
    if (source === 'polar' && !getState().settings.lastBleDeviceId) { connectStrap(); return; }
    const blocked = sourceBlocker(source);
    if (blocked) { toast(blocked); return; }
    if (getState().settings.lastHrvSource !== source) { getState().settings.lastHrvSource = source; save(); }
    pending.current = {
      kind: 'unstructured', source, period: defaultPeriodFor('unstructured'), style: undefined,
    };
    finish();
  };

  const connectHealth = async () => {
    if (healthOn || healthBusy) return;
    const api = health();
    if (!api.available) { toast(`${healthAppName()} needs a full app build`); return; }
    setHealthBusy(true);
    // The whole set, ECG included (requestAuth folds in the local native
    // module's sheet), so the watch-sync flow never has to prompt after a
    // finished reading. `force` skips the once-per-launch pacing.
    const ok = await api.requestAuth({ force: true });
    setHealthBusy(false);
    if (!ok) { toast('Permission denied'); return; }
    getState().settings.healthEnabled = true; save(); toast('Health connected');
    // Offer the one-time historical backfill right after connecting (once only).
    if (!getState().meta.healthHistoryImported) {
      openSheet(
        (c) => (
          <HistoryImportSheet
            controls={c}
            onImported={(n) => {
              if (n == null) toast('Import failed');
              else toast(n ? `Imported ${n} item${n === 1 ? '' : 's'}` : `No history found in ${healthAppName()}`);
            }}
          />
        ),
        { fitContent: true, hideClose: true },
      );
    }
  };
  const connectStrap = () => openSheet((c) => <DevicesScreen controls={c} />);

  /* ---------- last step: which sensor ---------- */
  // Apple Watch only where there is one to talk to. Everything else is offered
  // on both platforms; `sourceBlocker` is what refuses a build that can't.
  const showWatch = Platform.OS === 'ios' && health().available;
  const sources: Source[] = showWatch ? ['watch', 'polar', 'camera'] : ['polar', 'camera'];
  const strapName = state.settings.lastBleDeviceName;
  // Picking the strap with nothing paired goes straight to the devices card,
  // the same detour the HRV setup sheet takes — choosing a sensor you don't
  // own yet is only half an answer.
  const pickSource = (s: Source) => {
    setSource(s);
    if (s === 'polar' && !getState().settings.lastBleDeviceId) connectStrap();
  };

  /* ---------- animated chrome ---------- */
  // Back stays on screen at step 0, just ghosted (and non-interactive), so the
  // bar doesn't reflow the moment you leave the first step.
  const backO = useSharedValue(BACK_GHOST);
  const skipO = useSharedValue(0);
  const primO = useSharedValue(1);
  useEffect(() => { backO.value = withTiming(step > 0 ? 1 : BACK_GHOST, { duration: 200 }); }, [step, backO]);
  useEffect(() => { skipO.value = withTiming(SKIPPABLE.has(step) ? 1 : 0, { duration: 200 }); }, [step, skipO]);
  useEffect(() => { primO.value = withTiming(gated ? 0.4 : 1, { duration: 200 }); }, [gated, primO]);
  const backStyle = useAnimatedStyle(() => ({ opacity: backO.value }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: skipO.value }));
  const primScale = useSharedValue(1);
  const primStyle = useAnimatedStyle(() => ({ opacity: primO.value, transform: [{ scale: primScale.value }] }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: root.value }));
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));

  /* ---------- step content ---------- */
  const renderStep = () => {
    if (step === 0) return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ marginBottom: -2 }}><BrandMark size={64} /></View>
          <Text style={{ fontSize: 46, fontWeight: '800', letterSpacing: -1.4, color: C.text }}>Autonomic</Text>
        </View>
        <Text style={{ fontSize: 18, lineHeight: 28, color: C.dim, textAlign: 'center', maxWidth: 330 }}>
          Track your autonomic recovery: heart-rate variability, POTS readings, symptoms, sleep, and more, in one private journal.
        </Text>
      </View>
    );
    if (step === 1) return (
      <View style={{ flex: 1, paddingTop: 24, gap: 22 }}>
        <View style={[st.tile, { width: 72, height: 72, borderRadius: 20 }]}>
          <Glyph size={34} d={['M12 2l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V5z', 'M9 12l2 2 4-4']} />
        </View>
        <View>
          <Text style={st.h2}>Private &amp; on-device</Text>
          <Text style={st.para}>Everything stays on your device. Your data never leaves your phone unless you export it.</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Bullet icon={<Glyph size={24} rect={{ x: 4, y: 10, wd: 16, ht: 10, rx: 2 }} d={['M8 10V7a4 4 0 0 1 8 0v3']} />}>
            No account and no cloud
          </Bullet>
          <Bullet icon={<Glyph size={24} w={1.3} circle={{ r: 9, w: 1.8 }} d={['M4.5 8h15M4.5 16h15M12 3c-2.5 3-2.5 15 0 18M12 3c2.5 3 2.5 15 0 18']} />}>
            No tracking, ever
          </Bullet>
          <Bullet icon={<Glyph size={24} d={['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3']} />}>
            Yours to export anytime
          </Bullet>
        </View>
      </View>
    );
    if (step === 2) return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingTop: 24, gap: 22 }}>
          <View style={[st.tile, { width: 72, height: 72, borderRadius: 20 }]}>
            <Glyph size={34} circle={{ r: 9 }} d={['M12 8h.01M11 12h1v4h1']} />
          </View>
          <View>
            <Text style={st.h2}>Before you begin</Text>
            <Text style={st.para}>
              Autonomic is a personal logging and educational tool, not a medical device. It does not diagnose, treat,
              or provide medical advice. Discuss changes to medication, supplements, or your protocol with a doctor.
            </Text>
          </View>
        </View>
        {/* Pinned to the bottom so it sits directly above the "I understand" button. */}
        <AckRow on={ack} onPress={() => setAck(!ack)} />
      </View>
    );
    if (step === 3) {
      const sexPill = (o: string) => {
        const on = sex === o;
        return (
          <Pressable
            key={o}
            onPress={() => setSex(on ? '' : o)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, backgroundColor: on ? C.accentWash : C.row, borderColor: on ? C.accentBorder : C.rowBorder }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? C.text : C.dim }}>{o}</Text>
          </Pressable>
        );
      };
      return (
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 24, gap: 22, paddingBottom: 88 + kbPad }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
          <View style={[st.tile, { width: 72, height: 72, borderRadius: 20 }]}>
            <Glyph size={34} d={['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M4 21a8 8 0 0 1 16 0']} />
          </View>
          <View>
            <Text style={st.h2}>About you</Text>
            <Text style={st.para}>
              A few basics personalize your scores: sex-adjusted QTc, BMI, and age-aware context.
              All optional, stored only on your device, and editable anytime in Settings.
            </Text>
          </View>
          <View style={{ gap: 14 }}>
            <View>
              <Text style={st.fieldLabel}>Sex</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>{['Male', 'Female', 'Other'].map(sexPill)}</View>
            </View>
            <View>
              <Text style={st.fieldLabel}>Birthday</Text>
              <Pressable
                onPress={() => openSheet((c) => <DatePickerSheet label="Birthday" value={birthday} onChange={setBirthday} controls={c} />, { fitContent: true })}
                style={st.input}
              >
                <Text style={{ fontSize: 15, color: birthday ? C.text : C.chevron }}>{birthday ? fmtDateFull(birthday) : 'Set birthday'}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.fieldLabel}>Height</Text>
                <Pressable
                  onPress={() => openSheet((c) => <HeightPickerSheet label="Height" value={height} onChange={setHeight} controls={c} />, { fitContent: true })}
                  style={st.input}
                >
                  <Text style={{ fontSize: 15, color: fmtHeight(height) ? C.text : C.chevron }}>{fmtHeight(height) || 'Set height'}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.fieldLabel}>Weight (lb)</Text>
                <TextInput value={weight} onChangeText={(t) => setWeight(onlyNumeric(t))} placeholder="150" placeholderTextColor={C.chevron} keyboardType="decimal-pad" keyboardAppearance="dark" style={st.input} />
              </View>
            </View>
          </View>
        </ScrollView>
      );
    }
    if (step === 4) return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 24, gap: 22, paddingBottom: 24, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[st.tile, { width: 72, height: 72, borderRadius: 20 }]}>
          <Glyph size={34} d={['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71']} />
        </View>
        <View>
          <Text style={st.h2}>Connect your data</Text>
          <Text style={st.para}>Optional. You can always do this later in Settings.</Text>
        </View>
        <View style={{ gap: 12 }}>
          <ConnectRow
            glyph={<Glyph size={22} d={['M12 21c-5-3.5-8-6.6-8-10.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8 3.7C20 14.4 17 17.5 12 21z']} />}
            title={`Connect ${healthAppName()}`}
            sub={healthOn
              ? (Platform.OS === 'android' ? 'Connected · RMSSD available' : 'Connected · SDNN available')
              : (Platform.OS === 'android' ? 'Recommended on Android' : 'Recommended on iPhone')}
            on={healthOn}
            busy={healthBusy}
            onPress={connectHealth}
          />
          <ConnectRow
            glyph={<Icon name="bluetooth" size={20} color={ACCENT} />}
            title="Connect a heart-rate strap"
            sub={strapOn ? 'Connected · full HRV panel' : 'Full RMSSD, frequency, coherence'}
            on={strapOn}
            onPress={connectStrap}
          />
        </View>
        <View style={st.note}>
          <View style={{ marginTop: 1 }}>
            <Glyph size={17} w={2} circle={{ r: 10, w: 2 }} d={['M12 16v-4M12 8h.01']} />
          </View>
          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 19, color: '#c9a3a0' }}>
            {Platform.OS === 'ios'
              ? 'Works with Apple Watch without pairing to the app, but Bluetooth chest straps will get more accurate data.'
              : 'A Bluetooth chest strap gets the most accurate data. You can also take readings with your phone camera.'}
          </Text>
        </View>
      </ScrollView>
    );
    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 24, gap: 22, paddingBottom: 16, flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* The logo squiggle, not a heart-rate trace: this is the app asking
              for the one thing it is built around, so it signs with its name. */}
          <View style={[st.tile, { width: 72, height: 72, borderRadius: 20 }]}>
            <BrandMark size={34} />
          </View>
          <View>
            <Text style={st.h2}>Take your first HRV reading</Text>
            <Text style={st.para}>
              This reading is what tells us everything we know about your autonomic system, and it is what every
              trend is measured against. It only takes five minutes sitting still.
            </Text>
          </View>

          <View>
            <Text style={st.fieldLabel}>Measure with</Text>
            <View style={{ gap: 10 }}>
              {sources.map((src) => (
                <MethodRow
                  key={src}
                  source={src}
                  sub={sourceSub(src, strapName)}
                  selected={source === src}
                  onPress={() => pickSource(src)}
                />
              ))}
            </View>
          </View>

          {/* Explanation, not a second choice: the button below commits to a
              baseline, and training is the thing to graduate to. */}
          <View style={{ backgroundColor: C.tile, borderRadius: 16, padding: 16, gap: 12 }}>
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>Two kinds of reading</Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: C.faint, marginTop: 3 }}>
                Start with a baseline today. Once you have a few, add training sessions.
              </Text>
            </View>
            <KindRow icon="heartPulse" title="Baseline">
              Breathe however you normally do. Shows where your nervous system actually sits. Start here.
            </KindRow>
            <KindRow icon="wind" title="Training">
              The app paces your breath, four seconds in and six out. More sensitive day to day, and the pacing
              trains your system.
            </KindRow>
          </View>

          <View style={{ flexDirection: 'row', gap: 11, paddingHorizontal: 2 }}>
            <View style={{ marginTop: 1 }}>
              <Glyph size={17} w={2} color={C.faint} circle={{ r: 10, w: 2 }} d={['M12 16v-4M12 8h.01']} />
            </View>
            <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 19, color: C.faint }}>
              Readings taken at the same time each day are the only ones worth comparing. Most people do it before
              they get out of bed.
            </Text>
          </View>
        </ScrollView>
        {/* Pinned below the scroller so it always sits against the primary. */}
        <ReminderCard />
      </View>
    );
  };

  const label = PRIMARY_LABELS[step];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, zIndex: 100, elevation: 100 }, rootStyle]}>
      {/* Top bar: back · progress dots · skip */}
      {/* Padding lives on the outer box so the row itself has none: the dots'
          absolute layer then fills exactly the row, with no ambiguity about
          whether insets are measured inside or outside the padding. */}
      <View style={{ paddingHorizontal: 22, paddingTop: insets.top + 10, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Dots ride an absolute layer across the row so they center on the
              screen, not in the gap left over between Back and a Skip that comes
              and goes. The row's height is the back pill's, so centering in it
              puts the dots on the pill's centerline. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }]}>
            {Array.from({ length: STEPS }, (_, i) => <Dot key={i} i={i} step={step} />)}
          </View>
          {/* Same tinted-glass pill the sheets' ✕ rides in, so every back arrow
              in the app reads the same. Its height sets the row's. */}
          <Animated.View style={backStyle} pointerEvents={step > 0 ? 'auto' : 'none'}>
            <SheetPill lone>
              <SheetPillButton icon="chevronLeft" size={18} onPress={back} label="Back" />
            </SheetPill>
          </Animated.View>
          <View style={{ flex: 1 }} />
          <Animated.View style={skipStyle} pointerEvents={SKIPPABLE.has(step) ? 'auto' : 'none'}>
            <Pressable onPress={skip} hitSlop={8}>
              <Text style={{ color: C.faint, fontSize: 14, fontWeight: '600', paddingVertical: 6 }}>Skip</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* Step content — directional cross-fade/slide between steps */}
      <View style={{ flex: 1 }}>
        <Animated.View
          key={step}
          entering={mounted.current ? (dir > 0 ? FadeInRight : FadeInLeft).duration(STEP_DUR).easing(Easing.out(Easing.cubic)) : undefined}
          exiting={(dir > 0 ? FadeOutLeft : FadeOutRight).duration(200)}
          style={[StyleSheet.absoluteFill, { paddingHorizontal: 26 }]}
        >
          {renderStep()}
        </Animated.View>
      </View>

      {/* Bottom action — floats above the keyboard; hide-keyboard button when open */}
      <Animated.View style={[{ paddingHorizontal: 26, paddingTop: 12, flexDirection: 'row', gap: 10 }, actionBarStyle]}>
        {kbOpen && (
          <Pressable onPress={() => Keyboard.dismiss()} hitSlop={6} accessibilityRole="button" accessibilityLabel="Hide keyboard" style={{ width: 48, height: 54, borderRadius: 14, borderWidth: 1, borderColor: C.tileBorder, backgroundColor: C.row, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron" size={22} color={C.dim} />
          </Pressable>
        )}
        <AnimatedPressable
          onPress={next}
          disabled={gated || finishing}
          onPressIn={() => { primScale.value = withTiming(0.97, { duration: 90 }); }}
          onPressOut={() => { primScale.value = withTiming(1, { duration: 140 }); }}
          style={[{ flex: 1, height: 54, borderRadius: 14, backgroundColor: ACCENT, overflow: 'hidden' }, primStyle]}
        >
          <Animated.View
            key={label}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 }}>{label}</Text>
          </Animated.View>
        </AnimatedPressable>
      </Animated.View>

      {/* Fade-to-black cover for the finish sequence (absorbs touches while up) */}
      <AnimatedPressable
        pointerEvents={finishing ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, coverStyle]}
      />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  tile: { backgroundColor: C.tile, borderWidth: 1, borderColor: C.tileBorder, alignItems: 'center', justifyContent: 'center' },
  h2: { fontSize: 31, fontWeight: '700', letterSpacing: -0.6, color: C.text, marginBottom: 9 },
  para: { fontSize: 17, lineHeight: 26, color: C.dim },
  privRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 6, paddingHorizontal: 2 },
  privLabel: { fontSize: 16, lineHeight: 23, color: C.text },
  fieldLabel: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: C.faint, fontWeight: '700', marginBottom: 7 },
  input: { backgroundColor: C.row, borderWidth: 1, borderColor: C.rowBorder, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.text },
  note: { flexDirection: 'row', gap: 11, backgroundColor: C.accentWash, borderWidth: 1, borderColor: 'rgba(224,49,39,0.19)', borderRadius: 12, padding: 14 },
});
