/**
 * Invisible 1×1 camera view that feeds the PPG manager. `Session.tsx` mounts
 * this whenever the camera source is in play; `ppg().start()/stop()` toggles
 * `running`, which drives the camera's active state and torch. The frame
 * processor is deliberately trivial — a strided mean of B/G/R over a center
 * crop — with all detection done in JS (`camera.ts` → `detect.ts`).
 *
 * Renders null when react-native-vision-camera / worklets aren't in the build
 * (Expo Go / simulator / web), mirroring the manager's graceful stub.
 */
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { ppgBridge } from './camera';

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

export function PpgCameraView() {
  if (!vc || !worklets) return null;
  return <PpgCameraInner />;
}

function PpgCameraInner() {
  const { Camera, useCameraDevice, useCameraFormat, useFrameProcessor } = vc!;
  const { useRunOnJS } = worklets!;
  const [running, setRunning] = useState(ppgBridge.isRunning());
  useEffect(() => ppgBridge.subscribe(setRunning), []);

  // Never mount the Camera before permission is granted — vision-camera throws
  // a CameraError the moment the view exists without it (on Android that
  // surfaced as a red LogBox bar while the permission dialog was still up).
  // The session flow requests permission before start(); re-check on each
  // running flip so the grant is picked up.
  const [hasPermission, setHasPermission] = useState(() => Camera.getCameraPermissionStatus() === 'granted');
  useEffect(() => { setHasPermission(Camera.getCameraPermissionStatus() === 'granted'); }, [Camera, running]);

  // Torch is only applied once the camera session is actually initialized —
  // flipping it in the same commit that activates the camera races the
  // Android session bind and can leave the flash off.
  const [initialized, setInitialized] = useState(false);

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

  const device = useCameraDevice('back');
  // Lowest usable resolution + highest frame rate: we only need one averaged
  // brightness value per frame, and more frames = finer RR timing.
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 60 },
  ]);

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
    let r = 0, g = 0, b = 0, count = 0;
    const x0 = w >> 2, x1 = (3 * w) >> 2;
    const y0 = h >> 2, y1 = (3 * h) >> 2;
    for (let y = y0; y < y1; y += 8) {
      const row = y * bpr;
      for (let x = x0; x < x1; x += 8) {
        const i = row + x * 4;
        b += data[i + bOff];
        g += data[i + 1];
        r += data[i + rOff];
        count++;
      }
    }
    if (count > 0) push(frame.timestamp, r / count, g / count, b / count);
  }, [push, rOff, bOff]);

  if (!device || !hasPermission) return null;
  const fps = format ? Math.min(60, format.maxFps) : 30;
  return (
    <Camera
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      device={device}
      isActive={running}
      torch={running && initialized && !torchBlip && device.hasTorch ? 'on' : 'off'}
      format={format}
      fps={fps}
      pixelFormat="rgb"
      frameProcessor={running ? frameProcessor : undefined}
      audio={false}
      onInitialized={() => setInitialized(true)}
      onError={(e: unknown) => { console.warn('PPG camera error', e); }}
    />
  );
}
