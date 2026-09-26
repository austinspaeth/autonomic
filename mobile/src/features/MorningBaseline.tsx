/**
 * The morning baseline card: the day's first open, before
 * `MORNING_CUTOFF_HOUR`, asks for the reading the day is built on.
 *
 * The first trusted baseline of a day is its snapshot. It carries the largest
 * single weight in the Autonomic Outlook and it is the HRV input the pacing
 * budget sizes the day from, so a morning without one is a day scored and
 * paced on whatever else happened to be logged. Asking at the moment the app is
 * opened is the one time the question can still be answered well.
 *
 * It asks ONCE a day and never argues: the card is stamped when it is RAISED,
 * so the ✕ and the backdrop end it until tomorrow. It is a
 * card, not a gate: a user in a crash who opens the app to log a symptom is one
 * tap from the Journal, and nothing else waits on the answer.
 *
 * `<MorningBaselinePrompt/>` (root layout) is the host and renders nothing; it
 * answers "is this the first open of the day and a calm moment", the same shape
 * as `<ReviewPrompt/>`. The memory is the plaintext flags MMKV, like every other
 * "what has this install already shown" record.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { MMKV } from 'react-native-mmkv';
import { useSheets, type SheetControls } from '../components/Sheet';
import { Button } from '../components/ui';
import { usePalette } from '../theme';
import { getState } from '../store/store';
import { todayKey } from '../lib/dates';
import { hasBaselineReadingOn } from '../lib/hrvQuality';
import { pingMorningPrompt } from '../store/ping';
import { getSessionSnapshot } from './hrv/sessionStore';
import { HrvSetup, MORNING_CUTOFF_HOUR } from './hrv/Setup';

/* ------------------------------------------------------------------ memory */

const FLAGS_ID = 'autonomic.flags';
const KEY = 'morningBaselineShownDk';
let kv: MMKV | null | undefined;
function flags(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}
const shownOn = (): string | null => { try { return flags()?.getString(KEY) ?? null; } catch { return null; } };
const markShown = (dk: string) => { try { flags()?.set(KEY, dk); } catch { /* in-memory miss: may ask twice */ } };

/** Is the card due right now? Pure of the sheet stack and app state, which the
 *  host checks itself. */
function isDue(now: Date): boolean {
  const s = getState();
  // Never before the welcome wizard is done: its last step IS a first reading.
  if (!s.meta.onboarded) return false;
  const dk = todayKey();
  if (shownOn() === dk) return false;
  if (now.getHours() >= MORNING_CUTOFF_HOUR) return false;
  return !hasBaselineReadingOn(s.days[dk]);
}

/* -------------------------------------------------------------------- host */

/** Launch settle: never raise a card into a still-mounting first screen. */
const LAUNCH_SETTLE_MS = 1200;

export function MorningBaselinePrompt() {
  const { openSheet, depth } = useSheets();
  const depthRef = useRef(depth);
  depthRef.current = depth;
  // Set by a launch or a foreground, the only two moments that count as
  // "opening the app". A sheet or a running reading holds it pending.
  const pending = useRef(false);

  const attempt = useRef<() => void>(() => {});
  attempt.current = () => {
    if (!pending.current) return;
    if (depthRef.current > 0) return;
    if (getSessionSnapshot().status !== 'idle') return;
    if (AppState.currentState !== 'active') return;
    pending.current = false;
    if (!isDue(new Date())) return;
    markShown(todayKey());
    pingMorningPrompt('shown');
    openSheet((c) => <MorningBaselineCard controls={c} />, { fitContent: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { pending.current = true; attempt.current(); }, LAUNCH_SETTLE_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      pending.current = true;
      setTimeout(() => attempt.current(), 400);
    });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);

  useEffect(() => { if (depth === 0) attempt.current(); }, [depth]);

  return null;
}

/* -------------------------------------------------------------------- card */

export function MorningBaselineCard({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  // Declining is the ✕ (or the backdrop): anything that closes the card
  // without the button.
  const answered = useRef(false);
  useEffect(() => () => { if (!answered.current) pingMorningPrompt('closed'); }, []);

  const take = () => {
    answered.current = true;
    pingMorningPrompt('take');
    controls.close();
    openSheet((c) => <HrvSetup kind="unstructured" controls={c} />);
  };
  return (
    <View>
      <Sunrise />
      <View style={{ marginTop: 18 }}>
        <Text style={{ color: EYEBROW, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 }}>GOOD MORNING</Text>
        <Text style={{ color: p.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 }}>Take your morning baseline</Text>
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, marginBottom: 32 }}>
          Five quiet minutes before your day begins. It shows how rested your body is and where your autonomic system stands today, so your score and pacing fit the day you&apos;re actually having.
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Button title="Capture baseline HRV reading" variant="primary" onPress={take} />
        </View>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- sunrise */

/** The eyebrow's soft red, the same one the Android quick-reading widget wears. */
const EYEBROW = '#e8807c';
const HERO_H = 118;
/** The sheet's own content inset, which the hero bleeds past to meet its edges. */
const SHEET_PAD = 18;
const SHEET_TOP = 24;
const SUN = 92;
/** The design's frame, whose star field is scaled to the real width. */
const DESIGN_W = 362;
const RISE_MS = 7000;
const RISE_DELAY_MS = 800;
const RISE_EASE = Easing.bezier(0.22, 0.8, 0.3, 1);

/** The design's seeded star field (Park–Miller, seed 90127), kept clear of the sun. */
const STARS = (() => {
  let v = 90127;
  const rnd = () => (v = (v * 16807) % 2147483647) / 2147483647;
  const out: { x: number; y: number; d: number; o: number }[] = [];
  while (out.length < 16) {
    const x = 8 + rnd() * 346, y = 6 + Math.pow(rnd(), 1.4) * 78;
    if (y > 50 && Math.abs(x - 181) < 70) continue;
    out.push({ x, y, d: 1 + rnd() * 1.3, o: 0.12 + rnd() * 0.3 });
  }
  return out;
})();

/**
 * Night into morning, once: the stars fade, the sky warms and the sun clears
 * the horizon over seven seconds. It is illustration, so it keeps its own night
 * colours in either theme, and it plays once per card rather than looping — a
 * card that moves forever reads as loading.
 */
function Sunrise() {
  const [w, setW] = useState(DESIGN_W);
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(RISE_DELAY_MS, withTiming(1, { duration: RISE_MS, easing: RISE_EASE }));
  }, [t]);
  const warm = useAnimatedStyle(() => ({ opacity: t.value }));
  const night = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  const sun = useAnimatedStyle(() => ({ transform: [{ translateY: 62 * (1 - t.value) }] }));
  const sx = w / DESIGN_W;

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: HERO_H, marginTop: -SHEET_TOP, marginHorizontal: -SHEET_PAD, backgroundColor: '#101012', overflow: 'hidden' }}
    >
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, warm]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="mb-sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#141416" stopOpacity={0} />
              <Stop offset="0.7" stopColor="#2a0f0d" />
              <Stop offset="1" stopColor="#3a1410" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#mb-sky)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, night]}>
        {STARS.map((s, i) => (
          <View key={i} style={{ position: 'absolute', left: s.x * sx, top: s.y, width: s.d, height: s.d, borderRadius: s.d, backgroundColor: '#c9c9d0', opacity: s.o }} />
        ))}
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: w / 2 - 130, bottom: -60, width: 260, height: 150 }, warm]}>
        <Svg width={260} height={150}>
          <Defs>
            <RadialGradient id="mb-glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#e03127" stopOpacity={0.33} />
              <Stop offset="0.7" stopColor="#e03127" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={260} height={150} fill="url(#mb-glow)" />
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', left: w / 2 - SUN / 2, bottom: 0, width: SUN, height: 74, overflow: 'hidden' }}>
        <Animated.View style={[{ marginTop: 14, width: SUN, height: SUN }, sun]}>
          <Svg width={SUN} height={SUN}>
            <Defs>
              <RadialGradient id="mb-sun" cx="50%" cy="35%" rx="65%" ry="65%" fx="50%" fy="35%">
                <Stop offset="0" stopColor="#ff5a4d" />
                <Stop offset="0.55" stopColor="#e03127" />
                <Stop offset="1" stopColor="#c4231b" />
              </RadialGradient>
            </Defs>
            <Rect width={SUN} height={SUN} rx={SUN / 2} fill="url(#mb-sun)" />
          </Svg>
        </Animated.View>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5 }}>
        <Svg width="100%" height={1.5}>
          <Defs>
            <LinearGradient id="mb-horizon" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#3a3a42" stopOpacity={0} />
              <Stop offset="0.2" stopColor="#4a4a52" />
              <Stop offset="0.8" stopColor="#4a4a52" />
              <Stop offset="1" stopColor="#3a3a42" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={1.5} fill="url(#mb-horizon)" />
        </Svg>
      </View>
    </View>
  );
}
