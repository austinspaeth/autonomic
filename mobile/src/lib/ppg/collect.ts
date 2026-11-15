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

import { cameraPermissionStatus, loadPpgModules } from './modules';

function moduleReport(): Record<string, string> {
  const { vc, worklets, frameWorklets } = loadPpgModules();
  const out: Record<string, string> = {};
  out['react-native-vision-camera'] = vc ? 'loaded' : 'MISSING';
  out['Camera component'] = vc?.Camera ? 'present' : 'MISSING';
  // The frame processor needs both: `scheduleOnRN` to get a frame's channel
  // means back to JS, and a Synchronizable to hold the unreadable-frame count
  // the worklet gates itself on.
  out['react-native-worklets'] = worklets ? 'loaded' : 'MISSING (or without scheduleOnRN + createSynchronizable)';
  // The bridge that puts a worklet runtime on the camera's frame thread. In a
  // release build stripped of its keep rules this is where it falls over.
  out['react-native-vision-camera-worklets'] = frameWorklets ? 'loaded' : 'MISSING';
  try {
    // Touching the Nitro factory is the cheapest proof the native side installed.
    out['VisionCamera factory'] = vc ? `installed (multi-cam ${vc.VisionCamera.supportsMultiCamSessions ? 'yes' : 'no'})` : 'MISSING';
  } catch (e) {
    out['VisionCamera factory'] = `unreadable (${describeError(e)})`;
  }
  return out;
}

/** The slice of VisionCamera 5's `CameraDevice` the report reads. */
type AnyDevice = {
  id: string; position: string; localizedName: string; type?: string; hasTorch: boolean; hasFlash: boolean;
  physicalDevices?: { type?: string }[];
  supportedFPSRanges?: { min: number; max: number }[];
  getSupportedResolutions?: (stream: 'stream') => { width: number; height: number }[];
  supportsFPS?: (fps: number) => boolean;
};

/** Frame-output ('stream') sizes, the ones a frame processor is fed from. */
function streamSizes(d: AnyDevice): { width: number; height: number }[] {
  try { return d.getSupportedResolutions?.('stream') ?? []; } catch { return []; }
}

function toDeviceReport(d: AnyDevice): CameraDeviceReport {
  const sizes = streamSizes(d);
  const ranges = d.supportedFPSRanges ?? [];
  const fps = ranges.length
    ? `${Math.min(...ranges.map((r) => r.min))}–${Math.max(...ranges.map((r) => r.max))}`
    : null;
  const smallest = sizes.length
    ? sizes.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b))
    : null;
  return {
    id: d.id,
    position: d.position,
    name: d.localizedName,
    hasTorch: d.hasTorch,
    hasFlash: d.hasFlash,
    // VisionCamera 5 does not surface Camera2's hardware level; the lens type
    // is the nearest thing it says about what kind of device this is.
    hardwareLevel: d.type ?? null,
    physicalDevices: (d.physicalDevices ?? []).map((p) => p.type ?? '?'),
    formatCount: sizes.length,
    fpsRange: fps,
    smallestVideo: smallest ? `${smallest.width}×${smallest.height}` : null,
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
  const { vc } = loadPpgModules();
  const trace = ppgTrace.snapshot();

  let permissionStatus = 'unknown';
  try { permissionStatus = cameraPermissionStatus(); }
  catch (e) { permissionStatus = `unreadable (${describeError(e)})`; }

  let devices: CameraDeviceReport[] = [];
  let chosen: CameraDeviceReport | null = null;
  let chosenRaw: AnyDevice | null = null;
  try {
    const list = (vc ? vc.getAllCameraDevices() : []) as unknown as AnyDevice[];
    devices = list.map(toDeviceReport);
    chosenRaw = vc ? ((await vc.getDefaultCameraDevice('back')) as unknown as AnyDevice | undefined) ?? null : null;
    chosen = chosenRaw ? toDeviceReport(chosenRaw) : null;
  } catch (e) {
    notes.push(`Enumerating camera devices failed: ${describeError(e)}`);
  }

  // Walk the real ladder against what THIS device says it offers: the frame
  // size closest to each rung's request (the same "closest to" rule the frame
  // output resolves with) and whether the rung's frame rate is on offer at all.
  const formatSamples: string[] = [];
  let formatError: string | null = null;
  if (chosenRaw) {
    const sizes = streamSizes(chosenRaw);
    for (const a of PPG_ATTEMPTS) {
      try {
        const want = a.width && a.height ? a.width * a.height : null;
        const near = want && sizes.length
          ? sizes.reduce((x, y) => (Math.abs(x.width * x.height - want) <= Math.abs(y.width * y.height - want) ? x : y))
          : null;
        const size = want ? (near ? `${near.width}×${near.height}` : 'no stream sizes reported') : 'library default size';
        const rate = a.fps ? `${a.fps} fps ${chosenRaw.supportsFPS?.(a.fps) ? 'offered' : 'NOT offered (device default used)'}` : 'device default fps';
        formatSamples.push(`${a.label} → ${size}, ${rate}`);
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
    notes.push('The rear camera reports zero capture formats, which is a driver-level fault — no session can be configured on it.');
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
    // "No frames" and "no READABLE frames" reach here identically — a frame
    // that cannot be read is never counted — and they want opposite answers,
    // so the counter is what decides which note is written.
    notes.push(trace.frameFaults > 0
      ? `The session initialized and delivered frames, but ${trace.frameFaults} of them could not be locked for reading at all (${trace.lastFrameFault}). That is the device refusing to release its capture buffer to the CPU, so the worklet is fine and the format is not — see ATTEMPTS for what was tried.`
      : 'The session initialized but produced no frames at all. In a release build that points at the frame-processor worklet (react-native-vision-camera-worklets / react-native-worklets) rather than the camera.');
  }
  if (trace.frames > 0 && trace.frameFaults > 0) {
    notes.push(`${trace.frameFaults} frame(s) could not be locked for reading, but the reading ran on the rest — the fallback found a format this device would release.`);
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
    modules: moduleReport(),
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
