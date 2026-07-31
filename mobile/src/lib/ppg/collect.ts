/**
 * Camera diagnostics collection — the impure half of `diagnostics.ts`.
 *
 * Reads, never requests: a dump must observe the current state, not change it.
 * Asking for camera permission here would rewrite the very fact the report
 * exists to establish (and on Android would burn the user's last prompt).
 *
 * Never throws. A missing native module, a camera the OS refuses to enumerate,
 * an unreadable permission — those ARE the diagnosis, not a reason to fail.
 */
import { Platform } from 'react-native';
import { appInfo, describeError, platformInfo } from '../diagnostics/env';
import {
  PPG_ATTEMPTS, firstUnreached, ppgTrace,
  type CameraDeviceReport, type CameraDiagnostics,
} from './diagnostics';

type VisionCamera = typeof import('react-native-vision-camera');

function loadVisionCamera(): VisionCamera | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
}

function moduleReport(vc: VisionCamera | null): Record<string, string> {
  const out: Record<string, string> = {};
  out['react-native-vision-camera'] = vc ? 'loaded' : 'MISSING';
  out['Camera component'] = vc?.Camera ? 'present' : 'MISSING';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const w = require('react-native-worklets-core');
    out['react-native-worklets-core'] = w?.useRunOnJS ? 'loaded' : 'loaded but useRunOnJS missing';
  } catch (e) {
    out['react-native-worklets-core'] = `MISSING (${describeError(e)})`;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const proxy = require('react-native-vision-camera').VisionCameraProxy;
    // Touching the proxy is the cheapest proof the JSI side installed. In a
    // release build stripped of its keep rules this is where it falls over.
    out['VisionCameraProxy'] = proxy ? `installed (${typeof proxy.initFrameProcessorPlugin === 'function' ? 'usable' : 'no plugin API'})` : 'MISSING';
  } catch (e) {
    out['VisionCameraProxy'] = `unreadable (${describeError(e)})`;
  }
  return out;
}

type AnyDevice = {
  id: string; position: string; name: string; hasTorch: boolean; hasFlash: boolean;
  hardwareLevel?: string; physicalDevices?: string[];
  formats?: { videoWidth: number; videoHeight: number; minFps: number; maxFps: number }[];
};

function toDeviceReport(d: AnyDevice): CameraDeviceReport {
  const formats = d.formats ?? [];
  const fps = formats.length
    ? `${Math.min(...formats.map((f) => f.minFps))}–${Math.max(...formats.map((f) => f.maxFps))}`
    : null;
  const smallest = formats.length
    ? formats.reduce((a, b) => (a.videoWidth * a.videoHeight <= b.videoWidth * b.videoHeight ? a : b))
    : null;
  return {
    id: d.id,
    position: d.position,
    name: d.name,
    hasTorch: d.hasTorch,
    hasFlash: d.hasFlash,
    hardwareLevel: d.hardwareLevel ?? null,
    physicalDevices: d.physicalDevices ?? [],
    formatCount: formats.length,
    fpsRange: fps,
    smallestVideo: smallest ? `${smallest.videoWidth}×${smallest.videoHeight} @ ${smallest.minFps}–${smallest.maxFps} fps` : null,
  };
}

/** The OS-level grant, read without prompting. iOS has no equivalent check that
 *  doesn't go through VisionCamera, so it reports null there. */
async function osPermissionCheck(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PermissionsAndroid } = require('react-native');
    return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)) ? 'granted' : 'denied';
  } catch (e) {
    return `unreadable (${describeError(e)})`;
  }
}

/**
 * Collect everything needed to diagnose "the camera reading never starts" from
 * the user's own phone. `layout` is the saved shape/flash pick — passed in
 * rather than read, so this module stays independent of the store.
 */
export async function collectCameraDiagnostics(
  layout?: { shape?: string; flash?: string },
): Promise<CameraDiagnostics> {
  const notes: string[] = [];
  const vc = loadVisionCamera();
  const trace = ppgTrace.snapshot();

  let permissionStatus = 'unknown';
  try { permissionStatus = vc?.Camera ? String(vc.Camera.getCameraPermissionStatus()) : 'no native module'; }
  catch (e) { permissionStatus = `unreadable (${describeError(e)})`; }

  let devices: CameraDeviceReport[] = [];
  let chosen: CameraDeviceReport | null = null;
  let chosenRaw: AnyDevice | null = null;
  try {
    const list = (vc?.Camera ? vc.Camera.getAvailableCameraDevices() : []) as unknown as AnyDevice[];
    devices = list.map(toDeviceReport);
    chosenRaw = (vc?.getCameraDevice?.(list as never, 'back') as unknown as AnyDevice) ?? null;
    chosen = chosenRaw ? toDeviceReport(chosenRaw) : null;
  } catch (e) {
    notes.push(`Enumerating camera devices failed: ${describeError(e)}`);
  }

  // Run the real ladder through the real format picker, so the report shows
  // what each rung would resolve to on THIS device rather than in theory.
  const formatSamples: string[] = [];
  let formatError: string | null = null;
  if (chosenRaw && vc?.getCameraFormat) {
    for (const a of PPG_ATTEMPTS) {
      try {
        const filters = [
          ...(a.width && a.height ? [{ videoResolution: { width: a.width, height: a.height } }] : []),
          ...(a.fps ? [{ fps: a.fps }] : []),
        ];
        const f = vc.getCameraFormat(chosenRaw as never, filters as never) as unknown as {
          videoWidth: number; videoHeight: number; minFps: number; maxFps: number; photoWidth: number; photoHeight: number;
        };
        formatSamples.push(
          `${a.label} → ${f.videoWidth}×${f.videoHeight} video, ${f.photoWidth}×${f.photoHeight} photo, ${f.minFps}–${f.maxFps} fps`,
        );
      } catch (e) {
        formatError = describeError(e);
        formatSamples.push(`${a.label} → FAILED: ${formatError}`);
      }
    }
  }

  /* ---- notes: the things worth saying out loud, in the order they bite ---- */

  if (!vc) {
    notes.push('react-native-vision-camera is not in this build, so no camera reading can ever start here.');
  }
  if (permissionStatus !== 'granted') {
    notes.push(`Camera permission reports "${permissionStatus}". The camera view refuses to mount without a granted permission, which produces exactly the "no preview, no flash" symptom.`);
    if (Platform.OS === 'android') {
      notes.push('Android stops showing the permission prompt after it has been refused, so this cannot be fixed from inside the app — it needs Settings → Apps → Autonomic → Permissions → Camera.');
    }
  }
  if (permissionStatus === 'granted' && !chosen) {
    notes.push('Permission is granted but no back-facing camera was returned. On Android 12+ check the system "Camera access" privacy toggle in Quick Settings, and close any other app holding the camera.');
  }
  if (chosen && !chosen.hasTorch) {
    notes.push('The rear camera reports no torch. A camera reading is possible but will be far weaker without the flash lighting the fingertip.');
  }
  if (chosen && chosen.formatCount === 0) {
    notes.push('The rear camera reports zero capture formats, which is a driver-level fault — VisionCamera throws device/invalid-device for this.');
  }
  const failed = trace.attempts.filter((a) => a.error);
  if (failed.length) {
    notes.push(`${failed.length} of ${trace.attempts.length} configuration attempt(s) failed. First error: ${failed[0].error}`);
  }
  if (trace.attempts.length > 1) {
    notes.push('The camera fell back from its preferred format. Readings still work, but at a lower frame rate, which coarsens RR timing.');
  }
  if (trace.frames > 0 && !trace.fingerOn) {
    notes.push('Frames are arriving but the lens never read as covered — this is placement, not a fault.');
  }
  if (trace.reached['session-initialized'] != null && trace.frames === 0) {
    notes.push('The session initialized but produced no frames at all. In a release build that points at the frame-processor worklet (react-native-worklets-core) rather than the camera.');
  }
  if (!trace.startedAt) {
    notes.push('The trace is empty: this dump was collected without the camera setup card having run, so it shows device capability only.');
  }
  const stalled = firstUnreached(trace.reached);
  if (stalled) notes.push(`First unreached milestone: ${stalled}.`);

  return {
    at: new Date().toISOString(),
    app: appInfo(),
    platform: platformInfo(),
    modules: moduleReport(vc),
    permission: { status: permissionStatus, osCheck: await osPermissionCheck() },
    devices,
    chosen,
    formatSamples,
    formatError,
    layout: { shape: layout?.shape ?? null, flash: layout?.flash ?? null },
    trace,
    notes,
  };
}
