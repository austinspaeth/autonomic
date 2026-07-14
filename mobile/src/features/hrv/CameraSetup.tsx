/**
 * Camera-reading setup card — stacked over the HRV setup sheet when the phone
 * camera source is chosen (the session card is never shown until the reading
 * is actually running). Three steps:
 *
 *   1. Choose your camera setup — a 2×2 grid of rear camera-module shapes
 *      (tall, wide, square, single lens). Picking one fades the others out and
 *      the chosen shape glides to the center of the card, larger.
 *   2. Where is the flash? — glowing tappable dots mark the candidate flash
 *      spots for that shape (top/middle/bottom, left/middle/right, the four
 *      corners, or beside/below a single lens).
 *   3. Wait for the finger — the live camera feed appears in a lens circle
 *      placed away from the flash, a finger outline slides in along the
 *      flash↔lens axis to show the coverage, and the reading starts itself
 *      the moment a steady pulse is detected: the session card rises over
 *      this one already running (this card stays mounted underneath so the
 *      camera view survives the handoff).
 *
 * The shape + flash choice is remembered (settings.cameraLayout), so later
 * camera readings open straight at step 3; "Start over" clears it. Camera
 * permission is requested when the card opens. The ✕ backs out to the setup
 * sheet.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, {
  Easing, FadeIn, cancelAnimation,
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { radius, usePalette } from '../../theme';
import { getState, save } from '../../store/store';
import { ppg, type PpgSignal } from '../../lib/ppg/camera';
import { PpgCameraView } from '../../lib/ppg/CameraView';
import type { CameraModuleShape } from '../../lib/types';
import { HrvSession, type SessionConfig } from './Session';

// Matches the setup sheet — keep the title clear of the floating ✕ pill.
const CLOSE_CLEARANCE = 58;

type Pt = { x: number; y: number };
type Step = 'shape' | 'flash' | 'wait';

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
  const saved = getState().settings.cameraLayout;
  const [shape, setShape] = useState<CameraModuleShape | null>(saved?.shape ?? null);
  const [flash, setFlash] = useState<string | null>(saved?.flash ?? null);
  const [step, setStep] = useState<Step>(saved ? 'wait' : 'shape');
  const [signal, setSignal] = useState<PpgSignal>({ locked: false, quality: 'none' });
  const handedOff = useRef(false);

  // Torch is lit and the user is watching the back of the phone — don't sleep.
  useKeepAwake();

  // Ask for camera permission the moment the card opens, while the user is
  // still reading — not mid-flow when the feed is about to appear.
  useEffect(() => { ppg().requestPermissions().catch(() => {}); }, []);

  // Camera + torch run only during the wait step. Collection is a no-op here —
  // the session card retargets the stream to its own collector after handoff.
  useEffect(() => {
    if (step !== 'wait') return;
    const mgr = ppg();
    if (!mgr.available) return;
    let alive = true;
    (async () => {
      try {
        await mgr.requestPermissions();
        await mgr.start(() => {}, (sig) => { if (alive) setSignal(sig); });
      } catch { /* permission denied — the waiting text just stays up */ }
    })();
    return () => { alive = false; if (!handedOff.current) mgr.stop().catch(() => {}); };
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

  const subtext = step === 'shape' ? 'Which of these best matches the camera on the back of your phone?'
    : step === 'flash' ? 'Tap the glowing spot where your flash sits.'
      : 'The camera circle shows a live view of the lens.';

  const chosen = step !== 'shape' && shape ? shape : null;

  return (
    // flexGrow + the sheet's `grow` option: the stage area soaks up the free
    // height so the module centers vertically and the wait-step squircle
    // bottom-pins above the footer.
    <View style={{ paddingTop: 8, flexGrow: 1 }}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Set up your camera</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 18, marginBottom: 14, paddingHorizontal: 16 }}>{subtext}</Text>

      {/* The 2×2 grid sits toward the top of the card. Picking a shape swaps
          it for a statically-centered full-size stage — the grid fades out
          sinking down, the stage fades in rising up into place (no layout
          transitions; the stage's centered position is plain flexbox). */}
      {chosen ? (
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
      {step !== 'shape' ? (
        <PlacementCard visible={step === 'wait'} hint={signal.quality === 'weak' ? 'Hold still, finding your pulse…' : 'Place your finger…'} />
      ) : null}

      {step !== 'shape' ? (
        <SheetFooter>
          <Button title="Start over" variant="ghost" onPress={startOver} />
        </SheetFooter>
      ) : null}
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
