/**
 * Camera view that feeds the PPG manager. The camera-setup card (CameraSetup)
 * mounts this for the whole camera flow — visibly, as a small circular live
 * preview (`preview` = diameter; the parent clips it round) — and keeps it
 * mounted underneath the session card so the stream survives the handoff.
 * Without `preview` it renders invisibly at 1×1. `ppg().start()/stop()`
 * toggles `running`, which drives the camera's active state and torch.
 *
 * VisionCamera 5 (the Nitro rewrite). A frame processor is no longer a prop on
 * the view resolved by view tag: it is a callback set on a `CameraFrameOutput`,
 * on that output's own thread, in a react-native-worklets runtime — the SAME
 * worklet runtime family Reanimated 4 uses, so the app carries one worklets
 * library instead of two. The frame processor is deliberately trivial — a
 * strided mean of B/G/R over a center crop — with all detection done in JS
 * (`camera.ts` → `detect.ts`), and it NEVER THROWS past its own catch: a frame
 * the camera cannot hand over is counted and reported, not ridden out silently
 * (see the catch at the bottom of the worklet).
 *
 * Renders null when the camera modules aren't in the build (Expo Go /
 * simulator / web), mirroring the manager's graceful stub.
 *
 * Every branch that can end in "no preview and no torch" reports itself to
 * `ppgTrace` (`diagnostics.ts`), because from the outside those branches are
 * indistinguishable: a refused permission, a missing device, a configuration
 * CameraX won't bind and a session that binds but streams nothing all look like
 * a black circle. The trace is what the 8-second hold on "Start over" prints.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { CameraDevice, Frame } from 'react-native-vision-camera';
import { ppgBridge } from './camera';
import {
  ATTEMPT_FRAME_TIMEOUT_MS, ATTEMPT_INIT_TIMEOUT_MS, FRAME_FAULT_LIMIT, PPG_ATTEMPTS, ppgTrace,
} from './diagnostics';
import { cameraPermissionStatus, loadPpgModules } from './modules';
import { describeError } from '../diagnostics/env';

// Resolved on first use, NEVER at module scope. Importing VisionCamera 5 is not
// free: its JS builds the camera device factory as it loads, which starts
// CameraX (and logs "Failed to load Camera Devices!" on a phone whose camera is
// unavailable). This file is imported by the setup card, which the app bundle
// reaches at launch — and the bundle also loads in headless background
// wake-ups — so an eager load would open the camera system on every start of
// the process for a feature most launches never touch.
const mods = () => loadPpgModules();

/**
 * Record whether the native modules made it into this build, and return it.
 * Called from the setup card on open as well as from the view: the view only
 * renders on the last wizard step, and a run that stalls before then would
 * otherwise report the modules as missing when they are simply unexamined.
 */
export function probePpgModules(): boolean {
  const { vc, worklets, frameWorklets } = mods();
  const workletsOk = !!worklets && frameWorklets;
  const ok = !!vc && workletsOk;
  ppgTrace.set(
    { moduleLoaded: !!vc, workletsLoaded: workletsOk },
    'modules',
    `vision-camera ${vc ? 'ok' : 'missing'}, worklets ${worklets ? 'ok' : 'missing'}, frame worklets ${frameWorklets ? 'ok' : 'missing'}`,
  );
  if (ok) ppgTrace.mark('module-loaded');
  return ok;
}

/* ---------- the JS half of the frame processor ---------- */
//
// Module-level and therefore identity-stable for the life of the process: the
// worklet below captures them once, and a frame callback whose identity never
// changes is never re-installed on the camera thread mid-reading.

function pushFrameJS(t: number, r: number, g: number, b: number) {
  ppgBridge.pushFrame(t, r, g, b);
}

/** Set by the mounted view: what to do once a rung has spent its allowance. */
let onRungUnreadable: ((why: string) => void) | null = null;

/**
 * An unreadable frame, back on the JS thread: record it, and once the rung has
 * spent its allowance treat it exactly as the frame watchdog treats a rung that
 * delivered nothing — because that is what it did. A different configuration
 * may hand back a buffer this device will actually let us read; if none does,
 * the ladder runs out and the setup card says so.
 */
function frameFaultJS(why: string, n: number) {
  ppgBridge.noteFrameFault(why);
  if (n >= FRAME_FAULT_LIMIT) onRungUnreadable?.(`frames arrived but could not be read (${why})`);
}

/** Nothing to do: `dropFramesWhileBusy` is on and a dropped frame is not news.
 *  Passed only because VisionCamera's default handler `console.warn`s per drop. */
function onFrameDroppedJS() { /* deliberate no-op */ }

/** How the frame's pixels reach the worklet — stated in the support dump. */
const FRAME_READER = Platform.OS === 'android' ? 'image planes (worklet)' : 'pixel buffer (worklet)';

export function PpgCameraView({ preview }: { preview?: number }) {
  if (!probePpgModules()) {
    ppgTrace.set({ renderBlocked: 'react-native-vision-camera, react-native-vision-camera-worklets or react-native-worklets is missing from this build' });
    return null;
  }
  return <PpgCameraInner preview={preview} />;
}

function PpgCameraInner({ preview }: { preview?: number }) {
  const { useCameraDevice } = mods().vc!;
  const [running, setRunning] = useState(ppgBridge.isRunning());
  useEffect(() => ppgBridge.subscribe(setRunning), []);

  // Never mount the Camera before permission is granted. The session flow
  // requests permission before start(); re-check on each running flip so the
  // grant is picked up.
  const [permission, setPermission] = useState(cameraPermissionStatus);
  useEffect(() => {
    const status = cameraPermissionStatus();
    setPermission(status);
    ppgTrace.set({ permissionStatus: status }, 'permission-status', status);
    if (status === 'granted') ppgTrace.mark('permission-granted');
  }, [running]);
  const hasPermission = permission === 'granted';

  // Torch is only applied once the camera session has actually started —
  // flipping it in the same commit that activates the camera races the
  // Android session bind and can leave the flash off.
  const [initialized, setInitialized] = useState(false);

  // Which rung of PPG_ATTEMPTS we're on. A device that refuses our preferred
  // configuration (or accepts it and then streams nothing) drops to the next
  // one rather than leaving the user staring at a black circle forever.
  const [attempt, setAttempt] = useState(0);
  const spec = PPG_ATTEMPTS[attempt];

  useEffect(() => { ppgTrace.set({ frameReader: FRAME_READER }); }, []);

  const device = useCameraDevice('back');
  useEffect(() => {
    if (device) {
      ppgTrace.set({ device: `${device.localizedName || device.id} (torch ${device.hasTorch ? 'yes' : 'no'})`, hasTorch: device.hasTorch });
      ppgTrace.mark('device-found', device.id);
    } else {
      ppgTrace.set({ renderBlocked: 'no back-facing camera device was returned by the OS' }, 'device-missing');
    }
  }, [device]);

  // A frame rate the device does not offer is not asked for at all: a
  // constraint is a request the session resolves as best it can, and one it
  // cannot honour is one more way for a bind to fail quietly. More frames means
  // finer RR timing; a rung that settles for the device's own rate coarsens
  // that but still produces a reading.
  const fps = useMemo(() => {
    if (!spec.fps || !device) return null;
    try { return device.supportsFPS(spec.fps) ? spec.fps : null; } catch { return null; }
  }, [spec.fps, device]);

  // Register each rung as it starts, so the report lists every configuration
  // this device was actually asked for and what it said.
  const registered = useRef(-1);
  useEffect(() => {
    if (!running || !device || registered.current === attempt) return;
    registered.current = attempt;
    setInitialized(false);
    ppgTrace.set({ fps });
    ppgTrace.beginAttempt({
      n: attempt,
      label: spec.label,
      requested: { resolution: spec.width ? `${spec.width}×${spec.height}` : null, fps: spec.fps },
      resolved: null,
      appliedFps: fps,
      initialized: false,
      frames: 0,
      frameFaults: 0,
      error: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, device, attempt]);

  /** Drop to the next rung, or give up and leave the error standing. */
  const fallback = useCallback((why: string) => {
    ppgTrace.patchAttempt({ error: why });
    ppgTrace.set({ lastError: why }, 'attempt-failed', why);
    setAttempt((a) => {
      if (a + 1 >= PPG_ATTEMPTS.length) {
        ppgTrace.note('no-fallback-left', 'every camera configuration failed');
        return a;
      }
      return a + 1;
    });
  }, []);

  // Where the worklet's "this rung cannot be read" lands.
  useEffect(() => {
    onRungUnreadable = fallback;
    return () => { if (onRungUnreadable === fallback) onRungUnreadable = null; };
  }, [fallback]);

  // Watchdogs. The dangerous failures here are the silent ones — CameraX binds
  // and never calls back, or binds and streams zero frames — because nothing
  // throws and the user just waits. Both are treated as a failed attempt.
  useEffect(() => {
    if (!running || !device || !hasPermission) return;
    if (initialized) return;
    const timer = setTimeout(
      () => fallback(`session never initialized within ${ATTEMPT_INIT_TIMEOUT_MS} ms`),
      ATTEMPT_INIT_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [running, device, hasPermission, initialized, attempt, fallback]);

  useEffect(() => {
    if (!running || !initialized) return;
    const framesAtStart = ppgTrace.frameCount();
    const timer = setTimeout(() => {
      if (ppgTrace.frameCount() > framesAtStart) return;
      fallback(`session initialized but delivered no frames within ${ATTEMPT_FRAME_TIMEOUT_MS} ms`);
    }, ATTEMPT_FRAME_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [running, initialized, attempt, fallback]);

  // Android: CameraX silently drops an enableTorch() that lands before the
  // capture session is streaming (LEGACY-HAL devices especially), leaving
  // flash.mode OFF while the JS torch prop says on. Once started, blip the
  // prop off→on after the stream has had a moment to start — the second
  // enableTorch sticks. No-op visually: the torch wasn't actually lit during
  // the blip window.
  const [torchBlip, setTorchBlip] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android' || !running || !initialized) return;
    const off = setTimeout(() => setTorchBlip(true), 700);
    const on = setTimeout(() => setTorchBlip(false), 1000);
    return () => { clearTimeout(off); clearTimeout(on); setTorchBlip(false); };
  }, [running, initialized]);

  const onStarted = useCallback(() => {
    setInitialized(true);
    ppgTrace.patchAttempt({ initialized: true });
    ppgTrace.mark('session-initialized', PPG_ATTEMPTS[attempt].label);
  }, [attempt]);

  const onError = useCallback((e: unknown) => {
    const why = describeError(e);
    console.warn('PPG camera error', e);
    fallback(why);
  }, [fallback]);

  if (!device || !hasPermission) {
    ppgTrace.set({
      renderBlocked: !device
        ? 'no back-facing camera device'
        : `camera permission is "${permission}", not granted`,
    });
    return null;
  }
  const torch = running && initialized && !torchBlip && device.hasTorch ? 'on' : 'off';
  ppgTrace.mark('view-mounted');
  ppgTrace.set({ renderBlocked: null, torch });
  if (torch === 'on') ppgTrace.mark('torch-on');
  return (
    <PpgRung
      // Remount cleanly between rungs — the frame output, its worklet runtime
      // and the camera session are all rebuilt, because reconfiguring a session
      // that failed to bind in place is how you get a camera that never
      // recovers. It also gives each rung a fresh unreadable-frame allowance:
      // the next configuration may hand back a buffer this device WILL read.
      key={attempt}
      device={device}
      running={running}
      torch={torch}
      width={spec.width}
      height={spec.height}
      fps={fps}
      preview={preview}
      onStarted={onStarted}
      onError={onError}
    />
  );
}

/** Same figure as the native reader this replaced, and the reason every device
 *  sits on one noise floor — see the stride rule in the worklet. */
const TARGET_SAMPLES = 1200;

/**
 * One rung of the ladder: a frame output, the worklet that reads it, and the
 * `<Camera>` that streams into it. Keyed by rung in the parent, so nothing in
 * here ever has to be reconfigured in place.
 */
function PpgRung({ device, running, torch, width, height, fps, preview, onStarted, onError }: {
  device: CameraDevice; running: boolean; torch: 'on' | 'off';
  width: number | null; height: number | null; fps: number | null;
  preview?: number; onStarted: () => void; onError: (e: unknown) => void;
}) {
  const { Camera, useFrameOutput } = mods().vc!;
  const { createSynchronizable, scheduleOnRN } = mods().worklets!;

  // Unreadable frames on this rung. Counted inside the worklet rather than on
  // the JS thread so the frame processor can stop asking without waiting on a
  // round trip — the gate has to sit on the camera thread. A Synchronizable is
  // react-native-worklets' cross-runtime box: the frame thread is its own
  // worklet runtime, and a Reanimated shared value belongs to the UI runtime.
  const [frameFaults] = useState(() => createSynchronizable(0));

  // 'rgb' delivers BGRA bytes on iOS (kCVPixelFormatType_32BGRA) but RGBA on
  // Android (ImageAnalysis RGBA_8888), so the red/blue byte offsets swap per
  // platform (captured outside the worklet).
  const android = Platform.OS === 'android';
  const rOff = android ? 0 : 2;
  const bOff = android ? 2 : 0;

  // Identity-stable for the life of the rung: every dependency is a module
  // constant, a platform constant or the rung's own Synchronizable.
  const onFrame = useCallback((frame: Frame) => {
    'worklet';
    try {
      // This rung has already proved it cannot be read — see FRAME_FAULT_LIMIT.
      if (frameFaults.getBlocking() >= FRAME_FAULT_LIMIT) return;
      const w = frame.width, h = frame.height;
      // Average a fixed ~1200 pixels no matter what resolution the device
      // actually handed back. The per-frame mean's noise floor is set by how
      // many pixels go into it, not by the frame size, and `targetResolution`
      // only promises the CLOSEST available size to the one requested — so a
      // fixed stride would silently give a device that only offers 1280x720 a
      // very different signal from one that offers 320x240. At 640x480 this
      // evaluates to exactly 8, the stride this loop has always used there.
      const stride = Math.max(1, Math.round(Math.sqrt((w * h) / (4 * TARGET_SAMPLES))));
      // Strided mean over the center half of the frame — keep the worklet
      // trivial, detection happens in JS.
      const x0 = w >> 2, x1 = (3 * w) >> 2;
      const y0 = h >> 2, y1 = (3 * h) >> 2;
      let r = 0, g = 0, b = 0, count = 0;

      // ANDROID READS THE IMAGE PLANES, never `frame.getPixelBuffer()`. The
      // whole-frame read prefers the frame's HardwareBuffer when it claims to
      // be CPU-readable, and a HardwareBuffer lock is exactly what a strict
      // gralloc refused on every frame of a Galaxy S25 (the reason this app
      // once shipped its own native frame reader). A plane is the platform's
      // own CPU mapping of the ImageReader image — `ImageProxy.getPlanes()`,
      // what CameraX itself reads — wrapped without a copy and without going
      // near an AHardwareBuffer. iOS has no such trap: one locked
      // CVPixelBuffer, read whole.
      const planes = android ? frame.getPlanes() : null;
      if (planes && planes.length >= 3) {
        // YUV_420_888, in case the pipeline ever hands one over despite 'rgb'.
        // The conversion is linear, so the RGB of the mean YUV is the mean of
        // the RGB.
        const yp = planes[0], up = planes[1], vp = planes[2];
        const yd = new Uint8Array(yp.getPixelBuffer());
        const ud = new Uint8Array(up.getPixelBuffer());
        const vd = new Uint8Array(vp.getPixelBuffer());
        // A plane reports width = rowStride / pixelStride.
        const yPx = Math.max(1, Math.round(yp.bytesPerRow / yp.width));
        const uPx = Math.max(1, Math.round(up.bytesPerRow / up.width));
        const vPx = Math.max(1, Math.round(vp.bytesPerRow / vp.width));
        let ys = 0, us = 0, vs = 0;
        for (let y = y0; y < y1; y += stride) {
          for (let x = x0; x < x1; x += stride) {
            const yi = y * yp.bytesPerRow + x * yPx;
            const ui = (y >> 1) * up.bytesPerRow + (x >> 1) * uPx;
            const vi = (y >> 1) * vp.bytesPerRow + (x >> 1) * vPx;
            if (yi < yd.length && ui < ud.length && vi < vd.length) {
              ys += yd[yi]; us += ud[ui]; vs += vd[vi];
              count++;
            }
          }
        }
        if (count === 0) throw new Error(`YUV frame ${w}x${h} held no readable pixels`);
        const yy = ys / count, cb = us / count - 128, cr = vs / count - 128;
        r = Math.min(255, Math.max(0, yy + 1.402 * cr)) * count;
        g = Math.min(255, Math.max(0, yy - 0.344136 * cb - 0.714136 * cr)) * count;
        b = Math.min(255, Math.max(0, yy + 1.772 * cb)) * count;
      } else {
        let data: Uint8Array;
        let bpr: number;
        if (planes) {
          if (planes.length !== 1) throw new Error(`unsupported frame: ${planes.length} plane(s), format ${frame.pixelFormat}`);
          data = new Uint8Array(planes[0].getPixelBuffer());
          bpr = planes[0].bytesPerRow;
        } else {
          data = new Uint8Array(frame.getPixelBuffer());
          bpr = frame.bytesPerRow;
        }
        // A declared row stride is not reliable on every device (zero or
        // nonsense values poison the indexes into NaN) — trust the buffer
        // itself and fall back to the declared value only when it's plausible.
        const fromBuf = Math.floor(data.length / h);
        if (!(bpr >= w * 4 && bpr <= fromBuf)) bpr = fromBuf;
        for (let y = y0; y < y1; y += stride) {
          const row = y * bpr;
          for (let x = x0; x < x1; x += stride) {
            const i = row + x * 4;
            // The last row of a padded plane can be short.
            if (i + 2 < data.length) {
              b += data[i + bOff];
              g += data[i + 1];
              r += data[i + rOff];
              count++;
            }
          }
        }
        if (count === 0) throw new Error(`RGB frame ${w}x${h} held no readable pixels`);
      }
      scheduleOnRN(pushFrameJS, frame.timestamp, r / count, g / count, b / count);
    } catch (e) {
      // A frame the camera will not hand over. VisionCamera 4 rethrew this on
      // the JS thread as an uncaught fatal (on Android a process kill, and for
      // a while the app's most common crash); VisionCamera 5 would merely
      // `console.error` it, which is the opposite failure — a phone that can
      // NEVER take a camera reading looking exactly like one that never tried.
      // So it is caught HERE, counted on this thread (the count is what stops
      // the rung asking again), and reported.
      //
      // The whole body is inside the try, not just the read: every `frame.*`
      // access is a native call that throws the same way once the buffer is
      // gone.
      const n = frameFaults.getBlocking() + 1;
      frameFaults.setBlocking(n);
      scheduleOnRN(frameFaultJS, String((e as { message?: string } | undefined)?.message ?? e), n);
    } finally {
      // ALWAYS: an undisposed frame holds its buffer and stalls the pipeline.
      frame.dispose();
    }
  }, [frameFaults, android, rOff, bOff, scheduleOnRN]);

  // Lowest usable resolution: we only need one averaged brightness value per
  // frame, and a smaller sensor mode gathers more light per pixel, not less.
  // The last rung asks for nothing and takes the library's default.
  const frameOutput = useFrameOutput({
    ...(width && height ? { targetResolution: { width, height } } : null),
    pixelFormat: 'rgb',
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped: onFrameDroppedJS,
  });
  const outputs = useMemo(() => [frameOutput], [frameOutput]);
  const constraints = useMemo(() => (fps ? [{ fps }] : []), [fps]);

  return (
    <Camera
      style={preview ? { width: preview, height: preview } : { position: 'absolute', width: 1, height: 1, opacity: 0 }}
      device={device}
      isActive={running}
      torchMode={torch}
      outputs={outputs}
      constraints={constraints}
      onSessionConfigSelected={(config) => {
        const applied = config.selectedFPS ?? null;
        ppgTrace.set({ fps: applied });
        ppgTrace.patchAttempt({ appliedFps: applied });
      }}
      onConfigured={() => {
        const res = frameOutput.currentResolution;
        if (!res) return;
        const size = `${res.width}×${res.height}`;
        ppgTrace.patchAttempt({ resolved: size });
        ppgTrace.mark('format-chosen', size);
      }}
      onStarted={onStarted}
      onError={onError}
    />
  );
}
