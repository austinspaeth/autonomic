/**
 * First-run welcome wizard — shown once, before any data exists. Six steps:
 * Welcome → Private & on-device → Disclaimer (gated acknowledge) → About you
 * (profile basics, skippable) → Connect data (Apple Health / heart-rate strap,
 * both optional) → You're set. Completing it stamps `meta.onboarded`, fades to
 * black, then fades the app UI in beneath. Settings can re-show it any time via
 * `showWelcomeAgain()`.
 *
 * Connecting Apple Health in the Connect-data step pops a one-time confirmation
 * card offering to backfill history (RR-based HRV, blood pressure, resting HR).
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
import { BrandMark, Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { DatePickerSheet, HeightPickerSheet, fmtHeight, onlyNumeric } from '../components/Field';
import { CheckBox, REMINDER_BLURB, REMINDER_SETUP_TITLE, REMINDER_TITLE, useReminderToggle } from './Reminders';
import { fmtDateFull, fmtTime12, uid } from '../lib/dates';
import { SheetControls, useSheets } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ACCENT, radius, usePalette } from '../theme';
import { health, healthAppName } from '../lib/health';
import { computeScores } from '../lib/scoring';
import { blankDay, getState, mutate, save, storeWaveform, useAppState } from '../store/store';
import { DevicesScreen } from './Devices';

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
const PRIMARY_LABELS = ['Get started', 'Continue', 'I understand', 'Continue', 'Continue', 'Start logging'];
const STEP_DUR = 280;

/** Steps that show the top-right Skip (About you + Connect data). */
const SKIPPABLE = new Set([3, 4]);

/** Historical import floor — early enough to cover any HealthKit-era data. */
const HISTORY_SINCE = new Date(2014, 0, 1);

/**
 * One-time backfill of Apple Health history into the journal: RR-based HRV,
 * blood pressure, and resting heart rate, each written into the day it was
 * recorded and scored like a live capture. Assumes read permission is already
 * granted. Idempotent — stamps (and is guarded by) meta.healthHistoryImported,
 * so it can never double-import. Returns how many readings were added.
 */
async function importAppleHealthHistory(): Promise<number> {
  const api = health();
  if (!api.available) return 0;
  const readings = await api.readHistory({
    fromISO: HISTORY_SINCE.toISOString(),
    toISO: new Date().toISOString(),
  });
  const ctx = { sex: getState().profile.sex, height: getState().profile.height };
  let added = 0;
  mutate((s) => {
    if (s.meta.healthHistoryImported) return;          // already ran — no-op
    for (const r of readings) {
      if (r.ownApp) continue;                           // skip our own write-backs
      if (!s.days[r.dayKey]) s.days[r.dayKey] = blankDay();
      const entry: Record<string, unknown> = {
        id: uid(), type: r.type, time: r.time, note: `From ${healthAppName()}`, source: Platform.OS === 'android' ? 'health' : 'watch', imported: true, ...r.fields,
      };
      // RR series goes to the waveform sidecar, never inline on the entry
      // (rrClean is derived — recomputed on view, not stored).
      if (r.rr) storeWaveform(entry.id as string, { rrRaw: r.rr });
      entry.scores = computeScores(entry as never, ctx);
      s.days[r.dayKey].readings.push(entry as never);
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
  // App-themed sheet (rendered above the dark wizard), so it uses the palette.
  const run = async () => {
    if (busy) return;
    setBusy(true);
    let n: number | null;
    try { n = await importAppleHealthHistory(); } catch { n = null; }
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
          {`Bring your past HRV, blood pressure, and resting heart rate from ${healthAppName()} into your journal so your trends start full. This is a one-time import — new readings sync automatically as you go.`}
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, opacity: 0.85 }}>
          {Platform.OS === 'ios'
            ? 'Only HRV recordings with beat-to-beat detail come in, so the full variability panel is available.'
            : 'HRV history comes in as RMSSD values from Health Connect.'}
        </Text>
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
    if (step >= STEPS - 1) finish();
    else go(step + 1);
  };
  const skip = () => { if (!finishing && step < STEPS - 1) go(step + 1); };
  const back = () => { if (step > 0 && !finishing) go(step - 1); };

  // Finish: fade to black over the wizard, stamp the flag while the screen is
  // fully dark, then fade the whole overlay out to reveal the live app.
  const cover = useSharedValue(0);
  const root = useSharedValue(1);
  const reveal = () => {
    mutate((s) => { s.meta.onboarded = new Date().toISOString(); });
    root.value = withDelay(140, withTiming(0, { duration: 640, easing: Easing.inOut(Easing.quad) }, (fin) => {
      if (fin) runOnJS(onDone)();
    }));
  };
  const finish = () => {
    setFinishing(true);
    cover.value = withTiming(1, { duration: 400, easing: Easing.in(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(reveal)();
    });
  };

  const connectHealth = async () => {
    if (healthOn || healthBusy) return;
    const api = health();
    if (!api.available) { toast(`${healthAppName()} needs a full app build`); return; }
    setHealthBusy(true);
    const ok = await api.requestAuth();
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
              else toast(n ? `Imported ${n} reading${n === 1 ? '' : 's'}` : `No history found in ${healthAppName()}`);
            }}
          />
        ),
        { fitContent: true, hideClose: true },
      );
    }
  };
  const connectStrap = () => openSheet((c) => <DevicesScreen controls={c} />);

  /* ---------- animated chrome ---------- */
  const backO = useSharedValue(0);
  const skipO = useSharedValue(0);
  const primO = useSharedValue(1);
  useEffect(() => { backO.value = withTiming(step > 0 ? 1 : 0, { duration: 200 }); }, [step, backO]);
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
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(224,49,39,0.09)', borderWidth: 1, borderColor: 'rgba(224,49,39,0.25)', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph size={34} w={2.4} d={['M20 6L9 17l-5-5']} />
          </View>
          <View>
            <Text style={st.h2}>You&apos;re all set</Text>
            <Text style={st.para}>
              We hope Autonomic makes your recovery journey a little easier. The more you log, the clearer your
              patterns become and the better the insights you&apos;ll uncover.
            </Text>
          </View>
          <View style={{ gap: 14 }}>
            <Bullet icon={<Icon name="clipboard" size={25} color={ACCENT} />}>
              <Text style={{ fontWeight: '700' }}>Journal</Text> is your day-to-day health log.
            </Bullet>
            <Bullet icon={<Icon name="chart" size={25} color={ACCENT} />}>
              <Text style={{ fontWeight: '700' }}>Progress</Text> charts your trends over time.
            </Bullet>
            <Bullet icon={<Icon name="ai" size={25} color={ACCENT} />}>
              <Text style={{ fontWeight: '700' }}>Insight</Text> turns your data into AI prompts.
            </Bullet>
            <Bullet icon={<Icon name="plus" size={25} color={ACCENT} />}>
              Tap <Text style={{ fontWeight: '700' }}>+</Text> on any section to log a reading.
            </Bullet>
            {Platform.OS === 'ios' ? (
              <Bullet icon={<Icon name="watch" size={25} color={ACCENT} />}>
                Check your <Text style={{ fontWeight: '700' }}>Apple Watch</Text> to record POTS episodes or monitor your HR.
              </Bullet>
            ) : null}
            <Bullet icon={<Glyph size={25} circle={{ r: 9 }} d={['M9.4 9.2a2.6 2.6 0 0 1 5.1.9c0 1.7-2.5 2.3-2.5 2.3', 'M12 16h.01']} />}>
              Tap the <Text style={{ fontWeight: '700' }}>?</Text> icons whenever you need help.
            </Bullet>
          </View>
        </ScrollView>
        {/* Pinned below the scroller so it always sits against "Start logging". */}
        <ReminderCard />
      </View>
    );
  };

  const label = PRIMARY_LABELS[step];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, zIndex: 100, elevation: 100 }, rootStyle]}>
      {/* Top bar: back · progress dots · skip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: insets.top + 10, paddingBottom: 8 }}>
        <Animated.View style={backStyle} pointerEvents={step > 0 ? 'auto' : 'none'}>
          <Pressable onPress={back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={st.backBtn}>
            <Glyph size={16} w={2.2} color={C.text} d={['M15 18l-6-6 6-6']} />
          </Pressable>
        </Animated.View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {Array.from({ length: STEPS }, (_, i) => <Dot key={i} i={i} step={step} />)}
        </View>
        <Animated.View style={skipStyle} pointerEvents={SKIPPABLE.has(step) ? 'auto' : 'none'}>
          <Pressable onPress={skip} hitSlop={8}>
            <Text style={{ color: C.faint, fontSize: 14, fontWeight: '600', paddingVertical: 6 }}>Skip</Text>
          </Pressable>
        </Animated.View>
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
  backBtn: { width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: C.tileBorder, backgroundColor: C.row, alignItems: 'center', justifyContent: 'center' },
});
