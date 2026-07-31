/**
 * Camera-reading setup card — stacked over the HRV setup sheet when the phone
 * camera source is chosen (the session card is never shown until the reading
 * is actually running). Four steps, wizard-style: a back arrow and the welcome
 * wizard's progress pills (`StepDots`, active dot stretches to a pill) sit at
 * the top of the card throughout.
 *
 *   1. Heads-up — the camera is the least accurate source. Sets expectations
 *      before anyone invests time in setup, and points at the strap article on
 *      the website rather than recommending hardware in-app.
 *   2. Choose your camera setup — a 2×2 grid of rear camera-module shapes
 *      (tall, wide, square, single lens). Picking one fades the others out and
 *      the chosen shape glides to the center of the card, larger.
 *   3. Where is the flash? — glowing tappable dots mark the candidate flash
 *      spots for that shape (top/middle/bottom, left/middle/right, the four
 *      corners, or beside/below a single lens).
 *   4. Wait for the finger — the live camera feed appears in a lens circle
 *      placed away from the flash, a finger outline slides in along the
 *      flash↔lens axis to show the coverage, and the reading starts itself
 *      the moment a steady pulse is detected: the session card rises over
 *      this one already running (this card stays mounted underneath so the
 *      camera view survives the handoff).
 *
 * The shape + flash choice is remembered (settings.cameraLayout), so once a
 * camera reading has been set up the card opens straight at step 4 (the
 * heads-up is a first-time-only screen); "Start over" clears it. Camera
 * permission is requested when the card opens. The ✕ backs out to the setup
 * sheet.
 *
 * Step 4 can fail in ways the user cannot see — a refused permission, or a
 * camera the OS will not start — and it used to render every one of them as the
 * same "Waiting for a steady pulse…" over a black circle, forever. It now
 * watches for both and swaps in a `<FaultCard/>` that names the problem and
 * offers system Settings. Holding "Start over" for 8 seconds dumps the whole
 * camera trace into the shared PromptSheet, the same gesture the Bluetooth scan
 * button uses (`src/lib/ppg/diagnostics.ts`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, {
  Easing, FadeIn, cancelAnimation, interpolateColor,
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import { SheetControls, SheetFooter, SheetPill, SheetPillButton, useSheets } from '../../components/Sheet';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/ui';
import { ACCENT, radius, usePalette } from '../../theme';
import { getState, save } from '../../store/store';
import { ppg, type PpgSignal } from '../../lib/ppg/camera';
import { PpgCameraView, probePpgModules } from '../../lib/ppg/CameraView';
import { PPG_ATTEMPTS, formatCameraDiagnostics, ppgTrace } from '../../lib/ppg/diagnostics';
import { collectCameraDiagnostics } from '../../lib/ppg/collect';
import type { CameraModuleShape } from '../../lib/types';
import { PromptSheet } from '../PromptSheet';
import { HrvSession, type SessionConfig } from './Session';

/** Sheet content is inset 18/24 (padding/topPad); its floating ✕ pill sits at
 *  14/10 on the sheet itself. These pull the back pill out to the same spot so
 *  the two pills share a centerline. Keep in sync with Sheet.tsx's headerPill. */
const BAR_INSET = 18 - 14;
const BAR_LIFT = 24 - 10;
/** Pill height: 36px button + 6px padding + 1px border, both sides. */
const BAR_H = 36 + (6 + 1) * 2;
/** Opacity of the back arrow on step 1, where there's nothing to go back to. */
const BACK_GHOST = 0.22;

/** Hold "Start over" this long to collect a camera diagnostics dump. Matches
 *  the Bluetooth scan button's hold, so there is one gesture to remember. */
const DIAGNOSTICS_HOLD_MS = 8000;

/** Why the camera can't run. Each one used to render as the same eternal
 *  "Waiting for a steady pulse…" over a black circle. */
type CameraFault = 'permission' | 'camera' | 'unavailable';

/** Strap explainer on the website. Deliberately not an in-app product list:
 *  no stock, no prices and no hardware endorsement to maintain here. */
const STRAP_ARTICLE_URL =
  'https://autonomic.care/insights/hrv/best-hrv-chest-strap-polar-h10-coospo-h808s/';

type Pt = { x: number; y: number };
type Step = 'warn' | 'shape' | 'flash' | 'wait';

/** Wizard order — drives the back arrow and the progress pills. */
const ORDER: Step[] = ['warn', 'shape', 'flash', 'wait'];

/** Full-size module dimensions (steps 2–3); the grid shows them at SMALL. */
const MODULE: Record<CameraModuleShape, { w: number; h: number }> = {
  tall: { w: 96, h: 200 },
  wide: { w: 200, h: 96 },
  square: { w: 160, h: 160 },
  single: { w: 92, h: 92 },
};
const SMALL = 0.52;
/** Stage margin around the full-size module — the single-lens flash dots sit
 *  outside the shape, and Android drops touches outside a parent's bounds. */
const PAD = 56;

const SHAPES: { key: CameraModuleShape; label: string }[] = [
  { key: 'tall', label: 'Vertical' },
  { key: 'wide', label: 'Horizontal' },
  { key: 'square', label: 'Square' },
  { key: 'single', label: 'Single lens' },
];

const radiusFor = (shape: CameraModuleShape, w: number, h: number) =>
  shape === 'single' ? w / 2 : shape === 'square' ? w * 0.24 : Math.min(w, h) * 0.38;

/** Grid → stage handoff: the grid cells fade out sinking down… */
const sinkOut = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: 200 }),
      transform: [{ translateY: withTiming(26, { duration: 220, easing: Easing.in(Easing.cubic) }) }],
    },
  };
};
/** …and the chosen full-size shape fades in rising up into its centered spot
 *  (delayed so the grid is gone before it appears). */
const riseIn = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 30 }] },
    animations: {
      opacity: withDelay(170, withTiming(1, { duration: 280 })),
      transform: [{ translateY: withDelay(170, withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) })) }],
    },
  };
};

/** Candidate flash spots for a shape, in module coordinates. */
function flashSpots(shape: CameraModuleShape): { key: string; pt: Pt }[] {
  const { w, h } = MODULE[shape];
  switch (shape) {
    case 'tall':
      return [
        { key: 'top', pt: { x: w / 2, y: h * 0.17 } },
        { key: 'middle', pt: { x: w / 2, y: h / 2 } },
        { key: 'bottom', pt: { x: w / 2, y: h * 0.83 } },
      ];
    case 'wide':
      return [
        { key: 'left', pt: { x: w * 0.17, y: h / 2 } },
        { key: 'middle', pt: { x: w / 2, y: h / 2 } },
        { key: 'right', pt: { x: w * 0.83, y: h / 2 } },
      ];
    case 'square':
      return [
        { key: 'tl', pt: { x: w * 0.26, y: h * 0.26 } },
        { key: 'tr', pt: { x: w * 0.74, y: h * 0.26 } },
        { key: 'bl', pt: { x: w * 0.26, y: h * 0.74 } },
        { key: 'br', pt: { x: w * 0.74, y: h * 0.74 } },
      ];
    case 'single':
      // The shape IS the lens — the flash lives beside or below it.
      return [
        { key: 'right', pt: { x: w + 38, y: h / 2 } },
        { key: 'below', pt: { x: w / 2, y: h + 38 } },
      ];
  }
}

const flashPt = (shape: CameraModuleShape, flash: string): Pt =>
  flashSpots(shape).find((s) => s.key === flash)?.pt ?? { x: MODULE[shape].w / 2, y: MODULE[shape].h / 2 };

/** Where to show the live lens feed: the spot in the module farthest from the
 *  chosen flash (diagonal corner on squares); a single lens is its own spot. */
function lensPt(shape: CameraModuleShape, flash: string): Pt {
  const { w, h } = MODULE[shape];
  switch (shape) {
    case 'tall': return { x: w / 2, y: flash === 'top' ? h * 0.78 : h * 0.22 };
    case 'wide': return { x: flash === 'left' ? w * 0.78 : w * 0.22, y: h / 2 };
    case 'square': return { x: flash.endsWith('l') ? w * 0.74 : w * 0.26, y: flash.startsWith('t') ? h * 0.74 : h * 0.26 };
    case 'single': return { x: w / 2, y: h / 2 };
  }
}

// Short enough that a vertical finger over a tall module stays inside the
// stage instead of running up over the step text.
const FINGER_W = 96;
const FINGER_L = 220;

/** Finger overlay placement: a long rounded rect aligned to the flash↔lens
 *  axis so it always covers both — reaching in from the top, or from the side
 *  when the two sit in a row (wide module, flash beside a single lens). */
function fingerLayout(a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let ux = dx / len, uy = dy / len;
  // Point the fingertip "inward": near-horizontal axes come from the left,
  // everything else from the top.
  if (Math.abs(uy) < 0.35 ? ux < 0 : uy < 0) { ux = -ux; uy = -uy; }
  const far = a.x * ux + a.y * uy > b.x * ux + b.y * uy ? a : b;
  // Tip pad past the farther of the two, body extending back off the card.
  const tip = { x: far.x + ux * 40, y: far.y + uy * 40 };
  const cx = tip.x - ux * (FINGER_L / 2), cy = tip.y - uy * (FINGER_L / 2);
  // RN rotation is clockwise; solve rotate(r)·(0,1) = (ux,uy).
  const rotateRad = Math.atan2(-ux, uy);
  return { left: cx - FINGER_W / 2, top: cy - FINGER_L / 2, rotateRad };
}

export function CameraSetup({ config, controls: _controls }: { config: SessionConfig; controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const toast = useToast();
  const saved = getState().settings.cameraLayout;
  const [shape, setShape] = useState<CameraModuleShape | null>(saved?.shape ?? null);
  const [flash, setFlash] = useState<string | null>(saved?.flash ?? null);
  // A remembered layout means they've done this before: skip the heads-up and
  // the pickers and open straight on "place your finger".
  const [step, setStep] = useState<Step>(saved ? 'wait' : 'warn');
  const [signal, setSignal] = useState<PpgSignal>({ locked: false, quality: 'none' });
  const handedOff = useRef(false);
  /** Why the camera can't run, in the user's words. Null while it's fine. */
  const [fault, setFault] = useState<CameraFault | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  // Torch is lit and the user is watching the back of the phone — don't sleep.
  useKeepAwake();

  // One trace per visit to this card, so a dump describes THIS attempt. Probe
  // the native modules straight away: the camera view only mounts on the last
  // step, and a run that stalls before then must not look like a build missing
  // its camera libraries.
  useEffect(() => { ppgTrace.reset(); probePpgModules(); }, []);

  // Ask for camera permission the moment the card opens, while the user is
  // still reading — not mid-flow when the feed is about to appear.
  useEffect(() => {
    ppg().requestPermissions().then((ok) => { if (!ok) setFault('permission'); }).catch(() => {});
  }, []);

  // Camera + torch run only during the wait step. Collection is a no-op here —
  // the session card retargets the stream to its own collector after handoff.
  useEffect(() => {
    if (step !== 'wait') return;
    const mgr = ppg();
    if (!mgr.available) { setFault('unavailable'); return; }
    let alive = true;
    (async () => {
      // The result matters: a refused permission means the camera view will
      // never mount, so waiting for a pulse is waiting for nothing. Saying so
      // is the difference between a fixable problem and a broken app.
      const granted = await mgr.requestPermissions().catch(() => false);
      if (!alive) return;
      if (!granted) { setFault('permission'); return; }
      setFault(null);
      try {
        await mgr.start(() => {}, (sig) => { if (alive) setSignal(sig); });
      } catch { if (alive) setFault('unavailable'); }
    })();
    return () => { alive = false; if (!handedOff.current) mgr.stop().catch(() => {}); };
  }, [step]);

  // Watch the trace for the failures that happen below the UI: every camera
  // configuration refused, or a live session that never delivers a frame. Both
  // otherwise read as "still waiting", forever.
  useEffect(() => {
    if (step !== 'wait') return;
    return ppgTrace.subscribe((t) => {
      if (t.lastError && t.attempts.length >= PPG_ATTEMPTS.length && t.attempts.every((a) => a.error)) {
        setFault('camera');
      } else if (t.reached['frames-arriving'] != null) {
        // Frames are flowing — whatever went wrong on an earlier rung is now
        // history, and the fallback did its job.
        setFault((f) => (f === 'camera' ? null : f));
      }
    });
  }, [step]);

  // Pulse locked → the reading is on. The session card rises over this one
  // already running (autoStart); this card stays mounted underneath so the
  // camera view keeps feeding the stream for the whole reading.
  useEffect(() => {
    if (step !== 'wait' || !signal.locked || handedOff.current) return;
    handedOff.current = true;
    openSheet((c) => <HrvSession config={config} autoStart controls={c} />, { hideClose: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.locked, step]);

  const pickShape = (s: CameraModuleShape) => { setShape(s); setStep('flash'); };

  // Remember the layout as soon as it's complete — later camera readings skip
  // straight to the wait step; Start over is the escape hatch for a mis-pick.
  const pickFlash = (f: string) => {
    setFlash(f);
    getState().settings.cameraLayout = { shape: shape!, flash: f };
    save();
    setStep('wait');
  };

  // Start over reverses the pick transition: the stage sinks out and the grid
  // rises back in. The grid must NOT animate on the card's first mount (the
  // sheet is already sliding up), so entering is only armed here.
  const returning = useRef(false);
  const startOver = () => {
    returning.current = true;
    setStep('shape');
    setShape(null);
    setFlash(null);
    setSignal({ locked: false, quality: 'none' });
    if (getState().settings.cameraLayout) { delete getState().settings.cameraLayout; save(); }
  };

  // Held "Start over" for 8s: dump everything the camera path recorded into the
  // same copy/share box the AI prompts use. Deliberately far past an accidental
  // press — it is a support tool, not a feature. Collection only reads state,
  // so it is safe to run mid-reading and never disturbs what it reports.
  const diagnose = async () => {
    if (diagnosing) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setDiagnosing(true);
    try {
      const report = await collectCameraDiagnostics(getState().settings.cameraLayout);
      openSheet((c) => (
        <PromptSheet
          controls={c}
          title="Camera diagnostics"
          rangeText="Camera diagnostics"
          subtitle="A snapshot of how far the camera reading got on this phone, and where it stopped. Send this to support — it contains no health data and no images."
          prompt={formatCameraDiagnostics(report)}
        />
      ));
    } catch {
      toast('Could not collect diagnostics');
    } finally {
      setDiagnosing(false);
    }
  };

  const idx = ORDER.indexOf(step);
  // Back walks the wizard one step at a time. Landing on the shape grid arms
  // the same rise-in the stage uses on the way out, so the two directions read
  // as one motion rather than a pop.
  const back = () => {
    if (idx <= 0) return;
    const prev = ORDER[idx - 1];
    if (prev === 'shape') returning.current = true;
    // Stepping back off the finger guide means the layout is up for revision
    // again; the pick is re-committed (and re-saved) on the way forward.
    if (step === 'wait') setSignal({ locked: false, quality: 'none' });
    setStep(prev);
  };

  const title = step === 'warn' ? 'The camera is less reliable'
    : step === 'shape' ? 'Choose your camera layout'
      : step === 'flash' ? 'Where is your flash?' : 'Place your finger';
  const subtext = step === 'shape' ? 'Which of these best matches the camera on the back of your phone?'
    : step === 'flash' ? 'Tap the glowing spot where your flash sits.'
      : 'The camera circle shows a live view of the lens.';

  const chosen = step !== 'shape' && shape ? shape : null;

  return (
    // flexGrow + the sheet's `grow` option: the stage area soaks up the free
    // height so the module centers vertically and the wait-step squircle
    // bottom-pins above the footer.
    <View style={{ flexGrow: 1 }}>
      {/* Wizard bar: back arrow + the welcome wizard's progress pills. The back
          arrow wears the same tinted-glass pill as the sheet's floating ✕ — the
          negative margins pull the bar out of the content box onto the sheet's
          own 14/10 inset so the two circles sit on one line. The bar therefore
          spans pill-to-pill, and the dots ride an absolute layer across its full
          width so they center on the card, not in the gap left over between the
          two buttons. */}
      <View style={{ height: BAR_H, marginTop: -BAR_LIFT, marginHorizontal: -BAR_INSET, marginBottom: 12, justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }}>
          {ORDER.map((_, i) => <StepDot key={i} i={i} step={idx} />)}
        </View>
        {/* Ghosted rather than hidden on step 1 — nothing to go back to, but the
            bar keeps its shape. */}
        <SheetPill lone style={{ alignSelf: 'flex-start', opacity: idx <= 0 ? BACK_GHOST : 1 }}>
          <SheetPillButton icon="chevronLeft" size={18} onPress={back} label="Back" disabled={idx <= 0} />
        </SheetPill>
      </View>

      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>{title}</Text>

      {/* Step 1 is a plain read-and-continue screen; it owns the rest of the
          card and hands off to the shape grid. */}
      {step === 'warn' ? (
        <HeadsUp />
      ) : (
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>{subtext}</Text>
      )}

      {/* The 2×2 grid sits toward the top of the card. Picking a shape swaps
          it for a statically-centered full-size stage — the grid fades out
          sinking down, the stage fades in rising up into place (no layout
          transitions; the stage's centered position is plain flexbox). */}
      {step === 'warn' ? null : chosen ? (
        <View style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View entering={riseIn} exiting={sinkOut} style={{ width: MODULE[chosen].w + PAD * 2, height: MODULE[chosen].h + PAD * 2, alignItems: 'center', justifyContent: 'center' }}>
            <ShapeView shape={chosen} big />
            <StageOverlays shape={chosen} flash={flash} showDots={step === 'flash'} waiting={step === 'wait'} onPickFlash={pickFlash} />
          </Animated.View>
        </View>
      ) : (
        <View style={{ flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'flex-start' }}>
          {SHAPES.map((s) => (
            <Animated.View key={s.key} entering={returning.current ? riseIn : undefined} exiting={sinkOut} style={{ width: '50%', alignItems: 'center', paddingVertical: 8 }}>
              <Pressable onPress={() => pickShape(s.key)} style={{ alignItems: 'center' }}>
                <View style={{ height: 118, justifyContent: 'center' }}>
                  <ShapeView shape={s.key} big={false} />
                </View>
                <Text style={{ color: p.textDim, fontSize: 12, fontWeight: '600', marginTop: 6 }}>{s.label}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}

      {/* Same placement squircle the HRV reading card used to carry, pinned
          above the footer's Start over. Mounted (invisibly) from the flash
          step so revealing it doesn't reflow the centered stage — the module
          stays put; only the camera circle and finger animate in on top. */}
      {step === 'wait' && fault ? (
        <FaultCard fault={fault} />
      ) : step === 'flash' || step === 'wait' ? (
        <PlacementCard visible={step === 'wait'} hint={signal.quality === 'weak' ? 'Hold still, finding your pulse…' : 'Waiting for a steady pulse…'} />
      ) : null}

      {step === 'warn' ? (
        <SheetFooter>
          <Button title="I understand, continue" variant="primary" onPress={() => setStep('shape')} />
        </SheetFooter>
      ) : step === 'flash' || step === 'wait' ? (
        <SheetFooter>
          <Button
            title={diagnosing ? 'Collecting diagnostics…' : 'Start over'}
            variant="ghost"
            onPress={startOver}
            onLongPress={diagnose}
            delayLongPress={DIAGNOSTICS_HOLD_MS}
            disabled={diagnosing}
          />
        </SheetFooter>
      ) : null}
    </View>
  );
}

/** Progress pill, same treatment as the welcome wizard's: the active step
 *  stretches from a dot into a pill, completed steps stay dots tinted red. */
function StepDot({ i, step }: { i: number; step: number }) {
  const target = i === step ? 1 : i < step ? 0.5 : 0;
  const t = useSharedValue(target);
  useEffect(() => { t.value = withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) }); }, [target, t]);
  const style = useAnimatedStyle(() => ({
    width: 6 + 28 * Math.max(0, t.value - 0.5),
    backgroundColor: interpolateColor(t.value, [0, 0.5, 1], ['rgba(255,255,255,0.12)', 'rgba(224,49,39,0.40)', ACCENT]),
  }));
  return <Animated.View style={[{ height: 6, borderRadius: 999 }, style]} />;
}

/** Step 1 — what a camera reading can and can't do, before any setup effort is
 *  spent on it. The strap recommendation links out to the website article
 *  rather than listing hardware in-app. */
function HeadsUp() {
  const p = usePalette();
  return (
    <View style={{ flexGrow: 1, gap: 14 }}>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20 }}>
        Movement, finger pressure and stray light all affect the signal, so quality varies from reading to reading.
        If a number looks off, take the reading again.
      </Text>

      <View style={{ flexDirection: 'row', gap: 12, padding: 15, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: p.border, backgroundColor: p.sunk }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(74,157,224,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={16} color="#4a9de0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontSize: 14, fontWeight: '700', marginBottom: 3 }}>Every reading gets cleaned up</Text>
          <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 18 }}>Obvious deviations and dropped signal are removed automatically when you finish.</Text>
        </View>
      </View>

      <View style={{ padding: 16, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(224,49,39,0.28)', backgroundColor: p.accentSoft }}>
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Chest straps are more accurate</Text>
        <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
          Straps read your heartbeat electrically, so the timing stays clean. We highly recommend one for anyone
          who wants to monitor their HRV. Good ones start around $30.
        </Text>
        <Pressable
          onPress={() => Linking.openURL(STRAP_ARTICLE_URL).catch(() => {})}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.control, borderWidth: 1, borderColor: 'rgba(224,49,39,0.45)' },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={{ color: p.accent, fontSize: 14, fontWeight: '700' }}>Which strap to buy</Text>
          <Icon name="chevronRight" size={15} color={p.accent} />
        </Pressable>
      </View>
    </View>
  );
}

/** The wait-step placement squircle. Rendered from the flash step onward so
 *  it always occupies its space (no stage reflow); it just fades in when the
 *  wait step arrives. */
function PlacementCard({ visible, hint }: { visible: boolean; hint: string }) {
  const p = usePalette();
  const o = useSharedValue(visible ? 1 : 0);
  useEffect(() => { o.value = withTiming(visible ? 1 : 0, { duration: 250 }); }, [visible, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[{ alignSelf: 'stretch', padding: 16, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2, alignItems: 'center' }, style]}>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
        Cover the rear camera and flash with your fingertip. Rest your hand, light pressure.
      </Text>
      <PulsingHint text={hint} />
    </Animated.View>
  );
}

/** Replaces the placement card when the camera cannot run at all. Says what
 *  went wrong, and offers the one action that can fix it — a permission the app
 *  can no longer ask for itself has to be granted in system Settings. */
function FaultCard({ fault }: { fault: CameraFault }) {
  const p = usePalette();
  const settingsName = Platform.OS === 'ios' ? 'Settings → Autonomic → Camera' : 'Settings → Apps → Autonomic → Permissions → Camera';
  const copy: Record<CameraFault, { title: string; body: string; action?: string }> = {
    permission: {
      title: 'Camera access is off',
      body: `Autonomic needs the camera to read your pulse through your fingertip. Turn it on in ${settingsName}, then come back to this screen.`,
      action: 'Open Settings',
    },
    camera: {
      title: 'The camera would not start',
      body: 'Every camera mode this phone offers was refused. Close any other app using the camera, check that camera access is not blocked in your Quick Settings, then try again. Hold "Start over" for 8 seconds to collect a report for support.',
    },
    unavailable: {
      title: 'No camera in this build',
      body: 'This build has no camera support, so a fingertip reading cannot run. A Bluetooth chest strap still works.',
    },
  };
  const c = copy[fault];
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      style={{ alignSelf: 'stretch', padding: 16, borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(224,49,39,0.28)', backgroundColor: p.accentSoft }}
    >
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{c.title}</Text>
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19 }}>{c.body}</Text>
      {c.action ? (
        <Pressable
          onPress={() => Linking.openSettings().catch(() => {})}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, marginTop: 14, borderRadius: radius.control, borderWidth: 1, borderColor: 'rgba(224,49,39,0.45)' },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={{ color: p.accent, fontSize: 14, fontWeight: '700' }}>{c.action}</Text>
          <Icon name="chevronRight" size={15} color={p.accent} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** The module shape itself, at grid size or full size. */
function ShapeView({ shape, big }: { shape: CameraModuleShape; big: boolean }) {
  const p = usePalette();
  const k = big ? 1 : SMALL;
  const w = MODULE[shape].w * k, h = MODULE[shape].h * k;
  return <View style={{ width: w, height: h, borderRadius: radiusFor(shape, w, h), borderWidth: 1.5, borderColor: p.border, backgroundColor: p.surface2, borderCurve: 'continuous' }} />;
}

/** Per-step overlays, absolutely positioned over the padded stage (module
 *  top-left sits at PAD,PAD): glowing flash-candidate dots (step 2), then the
 *  flash marker, live lens feed and finger outline (step 3). */
function StageOverlays({ shape, flash, showDots, waiting, onPickFlash }: {
  shape: CameraModuleShape; flash: string | null; showDots: boolean; waiting: boolean;
  onPickFlash: (key: string) => void;
}) {
  const lens = waiting && flash ? lensPt(shape, flash) : null;
  const fl = waiting && flash ? flashPt(shape, flash) : null;
  const finger = lens && fl ? fingerLayout(fl, lens) : null;
  const D = shape === 'single' ? 76 : 56; // lens preview diameter

  return (
    <>
      {showDots
        ? flashSpots(shape).map((s) => (
          <GlowDot key={s.key} x={PAD + s.pt.x} y={PAD + s.pt.y} onPress={() => onPickFlash(s.key)} />
        ))
        : null}
      {fl ? <FlashMarker x={PAD + fl.x} y={PAD + fl.y} /> : null}
      {lens ? (
        <Animated.View
          entering={FadeIn.duration(250)}
          pointerEvents="none"
          style={{ position: 'absolute', left: PAD + lens.x - D / 2, top: PAD + lens.y - D / 2, width: D, height: D, borderRadius: D / 2, overflow: 'hidden', backgroundColor: '#000' }}
        >
          <PpgCameraView preview={D - 4} />
        </Animated.View>
      ) : null}
      {finger ? <FingerOverlay left={PAD + finger.left} top={PAD + finger.top} rotateRad={finger.rotateRad} /> : null}
    </>
  );
}

/** The chosen flash spot — a softly glowing white dot (lit flash), distinct
 *  from the dark lens circle. */
function FlashMarker({ x, y }: { x: number; y: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(t);
  }, [t]);
  const glow = useAnimatedStyle(() => ({
    transform: [{ scale: 1.4 + t.value * 0.5 }],
    opacity: 0.3 - t.value * 0.15,
  }));
  return (
    <Animated.View entering={FadeIn.duration(250)} pointerEvents="none" style={{ position: 'absolute', left: x - 10, top: y - 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }, glow]} />
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }} />
    </Animated.View>
  );
}

/** Glowing tappable circle marking a candidate flash position. */
function GlowDot({ x, y, onPress }: { x: number; y: number; onPress: () => void }) {
  const p = usePalette();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 1.15 }],
    opacity: 0.5 * (1 - t.value),
  }));
  return (
    // Fade in only after the chosen shape has finished growing into place.
    <Animated.View entering={FadeIn.delay(380).duration(220)} style={{ position: 'absolute', left: x - 22, top: y - 22 }}>
      <Pressable onPress={onPress} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: p.accent }, halo]} />
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: p.accent }} />
      </Pressable>
    </Animated.View>
  );
}

/** Translucent finger outline sliding in along the flash↔lens axis to show
 *  that one fingertip should cover both, with a fingernail ghosted in at the
 *  tip. Purely illustrative. */
function FingerOverlay({ left, top, rotateRad }: { left: number; top: number; rotateRad: number }) {
  const p = usePalette();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(450, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value * 0.9,
    // Rotate first so the slide travels along the finger's own axis.
    transform: [{ rotate: `${rotateRad}rad` }, { translateY: -(1 - t.value) * 120 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left, top, width: FINGER_W, height: FINGER_L, borderRadius: FINGER_W / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: p.textDim, backgroundColor: p.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', alignItems: 'center' },
        style,
      ]}
    >
      {/* Fingernail at the tip (the finger's local bottom end). */}
      <View style={{ position: 'absolute', bottom: 8, width: FINGER_W * 0.68, height: 62, borderRadius: 26, borderCurve: 'continuous', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.16)' }} />
    </Animated.View>
  );
}

/** Bright red, gently pulsing wait prompt — same treatment the session card
 *  used for finger placement; hotter than any score color on purpose. */
const HINT_RED = '#ff3b30';
function PulsingHint({ text }: { text: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.Text style={[{ color: HINT_RED, fontWeight: '700', textAlign: 'center', marginTop: 8 }, style]}>{text}</Animated.Text>;
}
