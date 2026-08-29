/**
 * Camera view that feeds the PPG manager. The camera-setup card (CameraSetup)
 * mounts this for the whole camera flow — visibly, as a small circular live
 * preview (`preview` = diameter; the parent clips it round) — and keeps it
 * mounted underneath the session card so the stream survives the handoff.
 * Without `preview` it renders invisibly at 1×1. `ppg().start()/stop()`
 * toggles `running`, which drives the camera's active state and torch — but
 * NOT the frame processor, whose identity must stay fixed for the life of a
 * `<Camera>` or vision-camera calls into the native view by tag at the moment
 * it may already be gone (see the prop for the crash that caused). The frame
 * processor is deliberately trivial — a strided mean of B/G/R over a center
 * crop — with all detection done in JS (`camera.ts` → `detect.ts`).
 *
 * Renders null when react-native-vision-camera / worklets aren't in the build
 * (Expo Go / simulator / web), mirroring the manager's graceful stub.
 *
 * Every branch that can end in "no preview and no torch" reports itself to
 * `ppgTrace` (`diagnostics.ts`), because from the outside those branches are
 * indistinguishable: a refused permission, a missing device, a format CameraX
 * won't bind and a session that binds but streams nothing all look like a black
 * circle. The trace is what the 8-second hold on "Start over" prints.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ppgBridge } from './camera';
import {
  ATTEMPT_FRAME_TIMEOUT_MS, ATTEMPT_INIT_TIMEOUT_MS, PPG_ATTEMPTS, ppgTrace,
} from './diagnostics';
import { describeError } from '../diagnostics/env';

let vc: typeof import('react-native-vision-camera') | null = null;
let worklets: typeof import('react-native-worklets-core') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  vc = require('react-native-vision-camera');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  worklets = require('react-native-worklets-core');
} catch {
  vc = null;
  worklets = null;
}

/**
 * Record whether the two native modules made it into this build, and return it.
 * Called from the setup card on open as well as from the view: the view only
 * renders on the last wizard step, and a run that stalls before then would
 * otherwise report the modules as missing when they are simply unexamined.
 */
export function probePpgModules(): boolean {
  const ok = !!vc && !!worklets;
  ppgTrace.set(
    { moduleLoaded: !!vc, workletsLoaded: !!worklets },
    'modules',
    `vision-camera ${vc ? 'ok' : 'missing'}, worklets ${worklets ? 'ok' : 'missing'}`,
  );
  if (ok) ppgTrace.mark('module-loaded');
  return ok;
}

export function PpgCameraView({ preview }: { preview?: number }) {
  if (!probePpgModules()) {
    ppgTrace.set({ renderBlocked: 'react-native-vision-camera or react-native-worklets-core is missing from this build' });
    return null;
  }
  return <PpgCameraInner preview={preview} />;
}

function PpgCameraInner({ preview }: { preview?: number }) {
  const { Camera, useCameraDevice, useCameraFormat, useFrameProcessor } = vc!;
  const { useRunOnJS } = worklets!;
  const [running, setRunning] = useState(ppgBridge.isRunning());
  useEffect(() => ppgBridge.subscribe(setRunning), []);

  // Never mount the Camera before permission is granted — vision-camera throws
  // a CameraError the moment the view exists without it (on Android that
  // surfaced as a red LogBox bar while the permission dialog was still up).
  // The session flow requests permission before start(); re-check on each
  // running flip so the grant is picked up.
  const [permission, setPermission] = useState(() => String(Camera.getCameraPermissionStatus()));
  useEffect(() => {
    const status = String(Camera.getCameraPermissionStatus());
    setPermission(status);
    ppgTrace.set({ permissionStatus: status }, 'permission-status', status);
    if (status === 'granted') ppgTrace.mark('permission-granted');
  }, [Camera, running]);
  const hasPermission = permission === 'granted';

  // Torch is only applied once the camera session is actually initialized —
  // flipping it in the same commit that activates the camera races the
  // Android session bind and can leave the flash off.
  const [initialized, setInitialized] = useState(false);

  // Which rung of PPG_ATTEMPTS we're on. A device that refuses our preferred
  // format (or accepts it and then streams nothing) drops to the next one
  // rather than leaving the user staring at a black circle forever.
  const [attempt, setAttempt] = useState(0);
  const spec = PPG_ATTEMPTS[attempt];

  const device = useCameraDevice('back');
  useEffect(() => {
    if (device) {
      ppgTrace.set({ device: `${device.name || device.id} (torch ${device.hasTorch ? 'yes' : 'no'})`, hasTorch: device.hasTorch });
      ppgTrace.mark('device-found', device.id);
    } else {
      ppgTrace.set({ renderBlocked: 'no back-facing camera device was returned by the OS' }, 'device-missing');
    }
  }, [device]);

  // Lowest usable resolution + highest frame rate: we only need one averaged
  // brightness value per frame, and more frames = finer RR timing. 320x240 is
  // deliberately tiny — toArrayBuffer() copies the frame GPU→CPU, so this is
  // the one knob that actually costs anything per frame (307 KB instead of
  // 640x480's 1.2 MB, ~18 MB/s instead of ~74 MB/s at 60 fps). It does not
  // cost signal: the frame processor scales its stride to average the same
  // pixel count either way (see below), and a smaller sensor mode gathers more
  // light per pixel, not less.
  //
  // useCameraFormat is memoized on JSON.stringify(filters), so building the
  // array inline is free. The last rung passes no filters and its result is
  // discarded — we hand <Camera> no format at all and let the platform choose.
  const picked = useCameraFormat(device, [
    ...(spec.width && spec.height ? [{ videoResolution: { width: spec.width, height: spec.height } }] : []),
    ...(spec.fps ? [{ fps: spec.fps }] : []),
  ]);
  const format = spec.width ? picked : undefined;
  // Clamp into the format's own range: CameraX asserts fps against it before
  // binding and throws InvalidFpsError otherwise — which is one of the ways a
  // session dies silently.
  const fps = spec.fps && format ? Math.max(format.minFps, Math.min(spec.fps, format.maxFps)) : undefined;

  // Register each rung as it starts, so the report lists every configuration
  // this device was actually asked for and what it said.
  const registered = useRef(-1);
  useEffect(() => {
    if (!running || !device || registered.current === attempt) return;
    registered.current = attempt;
    setInitialized(false);
    ppgTrace.set({ fps: fps ?? null });
    ppgTrace.beginAttempt({
      n: attempt,
      label: spec.label,
      requested: { resolution: spec.width ? `${spec.width}×${spec.height}` : null, fps: spec.fps },
      resolved: picked ? `${picked.videoWidth}×${picked.videoHeight} @ ${picked.minFps}–${picked.maxFps} fps` : null,
      appliedFps: fps ?? null,
      initialized: false,
      frames: 0,
      error: null,
    });
    if (picked) ppgTrace.mark('format-chosen', `${picked.videoWidth}×${picked.videoHeight}`);
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
  // capture session is streaming (LEGACY-HAL devices especially; the failed
  // future is ignored upstream), leaving flash.mode OFF while the JS torch
  // prop says on. Once initialized, blip the prop off→on after the stream has
  // had a moment to start — the second enableTorch sticks. No-op visually:
  // the torch wasn't actually lit during the blip window.
  const [torchBlip, setTorchBlip] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android' || !running || !initialized) return;
    const off = setTimeout(() => setTorchBlip(true), 700);
    const on = setTimeout(() => setTorchBlip(false), 1000);
    return () => { clearTimeout(off); clearTimeout(on); setTorchBlip(false); };
  }, [running, initialized]);

  // Stable for the life of this component: `useRunOnJS([])` and
  // `useFrameProcessor` are both `useMemo`, and the deps below never change.
  // That identity is load-bearing — see the frameProcessor prop at the bottom.
  const push = useRunOnJS((t: number, r: number, g: number, b: number) => {
    ppgBridge.pushFrame(t, r, g, b);
  }, []);

  // pixelFormat "rgb" delivers BGRA bytes on iOS but RGBA on Android, so the
  // red/blue byte offsets swap per platform (captured outside the worklet).
  const rOff = Platform.OS === 'android' ? 0 : 2;
  const bOff = Platform.OS === 'android' ? 2 : 0;

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    // Strided mean over the center half of the frame — keep the worklet
    // trivial, detection happens in JS.
    const data = new Uint8Array(frame.toArrayBuffer());
    const w = frame.width, h = frame.height;
    // frame.bytesPerRow is not reliable on every Android device (undefined /
    // nonsense values poison the indexes into NaN) — trust the buffer itself
    // and fall back to the declared value only when it's plausible.
    const declared = frame.bytesPerRow;
    const fromBuf = Math.floor(data.length / h);
    const bpr = declared && declared >= w * 4 && declared <= fromBuf ? declared : fromBuf;
    // Average a fixed ~1200 pixels no matter what resolution the device
    // actually handed back. The per-frame mean's noise floor is set by how many
    // pixels go into it, not by the frame size, and useCameraFormat only
    // promises the *closest* available format to the one requested — so a fixed
    // stride would silently give a device that only offers 1280x720 a very
    // different signal from one that offers 320x240. Deriving it keeps every
    // device on the same noise floor. At 640x480 this evaluates to exactly 8,
    // the stride this loop used when the requested format was fixed, so the
    // signal on any device that reports that format is unchanged.
    const TARGET_SAMPLES = 1200;
    const stride = Math.max(1, Math.round(Math.sqrt((w * h) / (4 * TARGET_SAMPLES))));
    let r = 0, g = 0, b = 0, count = 0;
    const x0 = w >> 2, x1 = (3 * w) >> 2;
    const y0 = h >> 2, y1 = (3 * h) >> 2;
    for (let y = y0; y < y1; y += stride) {
      const row = y * bpr;
      for (let x = x0; x < x1; x += stride) {
        const i = row + x * 4;
        b += data[i + bOff];
        g += data[i + 1];
        r += data[i + rOff];
        count++;
      }
    }
    if (count > 0) push(frame.timestamp, r / count, g / count, b / count);
  }, [push, rOff, bOff]);

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
    <Camera
      // Remount cleanly between rungs: reconfiguring a session that failed to
      // bind in place is how you get a camera that never recovers.
      key={attempt}
      style={preview ? { width: preview, height: preview } : { position: 'absolute', width: 1, height: 1, opacity: 0 }}
      device={device}
      isActive={running}
      torch={torch}
      format={format}
      fps={fps}
      pixelFormat="rgb"
      // ALWAYS attached, never toggled with `running`. vision-camera's
      // componentDidUpdate reacts to a change of this prop's identity by calling
      // VisionCameraProxy.setFrameProcessor / removeFrameProcessor, which post a
      // runnable to the Android UI thread that resolves the native view by tag
      // and throws ViewNotFoundError — an uncaught crash on the UI thread — if
      // the view has gone by the time it runs. Under Fabric that is a genuine
      // race: view removal is dispatched by the mount queue, the proxy's call is
      // a plain handler post, and the two are not ordered against each other.
      // Toggling put both calls in exactly the wrong places — `setFrameProcessor`
      // when the stream starts, and `removeFrameProcessor` from `ppg().stop()`,
      // which fires during teardown while the card that owns this view is being
      // dismissed. Passing it unconditionally leaves `onViewReady` (native view
      // demonstrably alive) as the only call into the proxy.
      //
      // Nothing is lost by leaving it on: `isActive={running}` means CameraX
      // isn't streaming while stopped, so the worklet is not called, and
      // `ppgBridge.pushFrame` drops anything that slips through. It also stops
      // `enableFrameProcessor` (which vision-camera derives from `!= null`)
      // flipping mid-flight, which rebound the whole capture session twice per
      // reading — once on start, once on teardown.
      frameProcessor={frameProcessor}
      audio={false}
      onInitialized={() => {
        setInitialized(true);
        ppgTrace.patchAttempt({ initialized: true });
        ppgTrace.mark('session-initialized', PPG_ATTEMPTS[attempt].label);
      }}
      onError={(e: unknown) => {
        const why = describeError(e);
        console.warn('PPG camera error', e);
        fallback(why);
      }}
    />
  );
}
