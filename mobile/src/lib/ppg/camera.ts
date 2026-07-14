/**
 * Phone-camera PPG manager (react-native-vision-camera). Fingertip over the
 * rear camera + torch; frames arrive as per-frame channel means (pushed by
 * {@link PpgCameraView}'s frame-processor worklet), beats are detected in JS
 * (`detect.ts`), and the manager streams the same `{ hr, rr[] }` sample shape
 * as the BLE strap so `Session.tsx` treats every source uniformly.
 *
 * The camera is the lowest-quality HRV source: frame-rate timing (even with
 * sub-frame refinement) and finger movement can't match a chest strap's R-peak
 * clock. `onSignal` reports finger placement so the UI can hold "Start" until
 * a steady pulse is locked.
 *
 * Guarded so the module can be imported on a device without the native module
 * present (Expo Go / simulator / web) without crashing — createPpg() returns a
 * stub that reports unavailable.
 */
import { assessPulse, detectBeats, fingerPresent, type PulseQuality } from './detect';
import { mean } from '../hrv';

export interface PpgSignal { locked: boolean; quality: PulseQuality }

export interface PpgManagerApi {
  available: boolean;
  requestPermissions(): Promise<boolean>; // camera permission
  // Streams the same shape as BLE: hr (bpm) + rr intervals (ms).
  // signalState reports finger-placement quality for the pre-start lock.
  start(
    onSample: (s: { hr: number; rr: number[] }) => void,
    onSignal: (s: PpgSignal) => void,
  ): Promise<void>;
  // Swap the sample/signal consumers of an already-running stream without
  // resetting detection state — the session card takes over the stream the
  // camera-setup card locked, keeping the pulse lock and RR buffer intact.
  retarget(
    onSample: (s: { hr: number; rr: number[] }) => void,
    onSignal: (s: PpgSignal) => void,
  ): void;
  stop(): Promise<void>;
}

/* ---------- shared signal state (manager ⇄ camera view bridge) ---------- */

const BUFFER_MS = 12000; // trailing brightness kept for detection
const SIGNAL_WINDOW_MS = 5000; // pulse-quality / lock assessment window
const ANALYZE_EVERY_MS = 250; // detection cadence (frames arrive at 30–60 Hz)
const FINGER_FLIP_FRAMES = 4; // debounce finger on/off across frames

let onSampleCb: ((s: { hr: number; rr: number[] }) => void) | null = null;
let onSignalCb: ((s: PpgSignal) => void) | null = null;
let running = false;
const runListeners = new Set<(running: boolean) => void>();

let tBuf: number[] = [];
let vBuf: number[] = [];
let fingerOn = false;
let fingerStreak = 0;
let lastEmittedPeak = 0;
let lastAnalyzedAt = 0;
let lastSignalKey = '';
let recentRr: number[] = [];
// Frame timestamps arrive in whatever unit the platform uses (ns/µs/ms/s);
// the scale is inferred from the first inter-frame delta.
let tScale: number | null = null;
let prevRawT: number | null = null;

function resetSignalState() {
  tBuf = [];
  vBuf = [];
  fingerOn = false;
  fingerStreak = 0;
  lastEmittedPeak = 0;
  lastAnalyzedAt = 0;
  lastSignalKey = '';
  recentRr = [];
  tScale = null;
  prevRawT = null;
}

function emitSignal(s: PpgSignal) {
  const key = `${s.locked}:${s.quality}`;
  if (key === lastSignalKey) return;
  lastSignalKey = key;
  onSignalCb?.(s);
}

/** Returns ms, or null while the scale is still being established. */
function normalizeT(rawT: number): number | null {
  if (tScale == null) {
    if (prevRawT == null) { prevRawT = rawT; return null; }
    const dt = Math.abs(rawT - prevRawT);
    prevRawT = rawT;
    // Pick the scale that lands a plausible inter-frame delta (4–200 ms).
    for (const scale of [1, 1e-3, 1e-6, 1e3]) {
      if (dt * scale >= 4 && dt * scale <= 200) { tScale = scale; break; }
    }
    if (tScale == null) return null; // duplicate/garbage timestamp — wait
  }
  return rawT * tScale;
}

function analyze(now: number) {
  if (now - lastAnalyzedAt < ANALYZE_EVERY_MS) return;
  lastAnalyzedAt = now;

  if (!fingerOn) {
    emitSignal({ locked: false, quality: 'none' });
    return;
  }

  const from = now - SIGNAL_WINDOW_MS;
  let lo = 0;
  while (lo < tBuf.length && tBuf[lo] < from) lo++;
  const quality = assessPulse(tBuf.slice(lo), vBuf.slice(lo));
  emitSignal({ locked: quality === 'good', quality });

  // Beat emission over the full buffer: peaks newer than the last emitted one
  // become RR intervals (their spacing to the preceding detected peak).
  const { peakTimes } = detectBeats(tBuf, vBuf);
  const fresh: number[] = [];
  for (let i = 1; i < peakTimes.length; i++) {
    // Small tolerance so re-detection jitter on an already-emitted peak
    // doesn't double-count it.
    if (peakTimes[i] <= lastEmittedPeak + 150) continue;
    const interval = peakTimes[i] - peakTimes[i - 1];
    if (interval >= 300 && interval <= 1430) fresh.push(interval);
    lastEmittedPeak = peakTimes[i];
  }
  if (fresh.length && onSampleCb) {
    recentRr = [...recentRr, ...fresh].slice(-5);
    const hr = Math.round(60000 / mean(recentRr));
    onSampleCb({ hr, rr: fresh });
  }
}

/**
 * Internal bridge for {@link PpgCameraView} — not part of the public API.
 * The view pushes per-frame channel means here and mirrors `running` into the
 * camera's active/torch state.
 */
export const ppgBridge = {
  isRunning: () => running,
  subscribe(fn: (running: boolean) => void): () => void {
    runListeners.add(fn);
    return () => { runListeners.delete(fn); };
  },
  pushFrame(rawT: number, red: number, green: number, blue: number) {
    if (!running) return;
    const t = normalizeT(rawT);
    if (t == null) return;

    // Debounced finger presence: a few consecutive agreeing frames flip state,
    // so a single blurry frame doesn't drop the lock.
    const present = fingerPresent(red, green, blue);
    fingerStreak = present === fingerOn ? 0 : fingerStreak + 1;
    if (fingerStreak >= FINGER_FLIP_FRAMES) {
      fingerOn = present;
      fingerStreak = 0;
      if (!fingerOn) { tBuf = []; vBuf = []; recentRr = []; }
    }
    if (!fingerOn) { analyze(t); return; }

    tBuf.push(t);
    vBuf.push(red);
    let trim = 0;
    while (trim < tBuf.length && tBuf[trim] < t - BUFFER_MS) trim++;
    if (trim > 0) { tBuf = tBuf.slice(trim); vBuf = vBuf.slice(trim); }
    analyze(t);
  },
};

/* ---------- public manager ---------- */

const stub: PpgManagerApi = {
  available: false,
  async requestPermissions() { return false; },
  async start() { throw new Error('The camera is not available in this build.'); },
  retarget() { /* no-op */ },
  async stop() { /* no-op */ },
};

export function createPpg(): PpgManagerApi {
  let CameraModule: typeof import('react-native-vision-camera');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    CameraModule = require('react-native-vision-camera');
  } catch {
    return stub;
  }
  const { Camera } = CameraModule;
  if (!Camera) return stub;

  return {
    available: true,
    async requestPermissions() {
      try {
        const status = await Camera.requestCameraPermission();
        return status === 'granted';
      } catch {
        return false;
      }
    },
    async start(onSample, onSignal) {
      resetSignalState();
      onSampleCb = onSample;
      onSignalCb = onSignal;
      running = true;
      runListeners.forEach((fn) => fn(true));
    },
    retarget(onSample, onSignal) {
      onSampleCb = onSample;
      onSignalCb = onSignal;
      lastSignalKey = ''; // force a re-emit so the new consumer sees current state
    },
    async stop() {
      running = false;
      onSampleCb = null;
      onSignalCb = null;
      runListeners.forEach((fn) => fn(false));
      resetSignalState();
    },
  };
}

/** Singleton so the stream survives sheet navigation. */
let singleton: PpgManagerApi | null = null;
export function ppg(): PpgManagerApi {
  if (!singleton) singleton = createPpg();
  return singleton;
}
