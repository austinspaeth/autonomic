/**
 * The camera-PPG native stack, loaded guardedly in ONE place.
 *
 * Three packages have to be in the build for a camera reading to exist:
 * react-native-vision-camera (the Nitro camera), react-native-worklets (the
 * worklet runtime the frame processor runs in — the same one Reanimated uses)
 * and react-native-vision-camera-worklets (the bridge that puts a worklet
 * runtime on the camera's frame thread). A static `import` of any of them
 * throws at module load where the native side is missing (Expo Go, web, jest,
 * a broken release build), so they are required inside a try and everything
 * downstream degrades to "camera unavailable" rather than a launch crash.
 */
type VisionCameraModule = typeof import('react-native-vision-camera');
type WorkletsModule = typeof import('react-native-worklets');

export interface PpgModules {
  vc: VisionCameraModule | null;
  worklets: WorkletsModule | null;
  /** react-native-vision-camera-worklets resolved and exports its provider. */
  frameWorklets: boolean;
}

let cached: PpgModules | null = null;

export function loadPpgModules(): PpgModules {
  if (cached) return cached;
  const out: PpgModules = { vc: null, worklets: null, frameWorklets: false };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vc = require('react-native-vision-camera') as VisionCameraModule;
    // `VisionCamera` is the Nitro factory; its absence means the JS loaded
    // over a binary that does not carry the native half.
    const probe = vc as Partial<VisionCameraModule> | null;
    out.vc = probe?.Camera && probe?.VisionCamera ? vc : null;
  } catch { out.vc = null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const w = require('react-native-worklets') as WorkletsModule;
    const probe = w as Partial<WorkletsModule> | null;
    out.worklets = probe?.scheduleOnRN && probe?.createSynchronizable ? w : null;
  } catch { out.worklets = null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    out.frameWorklets = !!require('react-native-vision-camera-worklets')?.provider;
  } catch { out.frameWorklets = false; }
  cached = out;
  return out;
}

/**
 * Camera permission in the app's own vocabulary.
 *
 * VisionCamera 5 says `'authorized'` where every caller here (the permission
 * gate, the trace, the support dump and their tests) was written against
 * `'granted'`, so the translation happens once, at the edge. Everything else
 * (`'not-determined'`, `'denied'`, `'restricted'`) passes through untouched.
 * A READ, never a request.
 */
export function cameraPermissionStatus(): string {
  const { vc } = loadPpgModules();
  if (!vc) return 'no native module';
  const status = String(vc.VisionCamera.cameraPermissionStatus);
  return status === 'authorized' ? 'granted' : status;
}

/** Ask for the camera. Resolves in the same vocabulary as the read above. */
export async function requestCameraPermission(): Promise<string> {
  const { vc } = loadPpgModules();
  if (!vc) return 'no native module';
  const ok = await vc.VisionCamera.requestCameraPermission();
  return ok ? 'granted' : cameraPermissionStatus();
}
