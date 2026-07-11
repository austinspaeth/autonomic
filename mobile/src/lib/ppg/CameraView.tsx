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

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    // pixelFormat "rgb" is BGRA on iOS. Strided mean over the center half of
    // the frame — keep the worklet trivial, detection happens in JS.
    const data = new Uint8Array(frame.toArrayBuffer());
    const w = frame.width, h = frame.height;
    const bpr = frame.bytesPerRow;
    let r = 0, g = 0, b = 0, count = 0;
    const x0 = w >> 2, x1 = (3 * w) >> 2;
    const y0 = h >> 2, y1 = (3 * h) >> 2;
    for (let y = y0; y < y1; y += 8) {
      const row = y * bpr;
      for (let x = x0; x < x1; x += 8) {
        const i = row + x * 4;
        b += data[i];
        g += data[i + 1];
        r += data[i + 2];
        count++;
      }
    }
    if (count > 0) push(frame.timestamp, r / count, g / count, b / count);
  }, [push]);

  if (!device) return null;
  const fps = format ? Math.min(60, format.maxFps) : 30;
  return (
    <Camera
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      device={device}
      isActive={running}
      torch={running && device.hasTorch ? 'on' : 'off'}
      format={format}
      fps={fps}
      pixelFormat="rgb"
      frameProcessor={running ? frameProcessor : undefined}
      audio={false}
    />
  );
}
