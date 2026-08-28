/**
 * The live HRV reading, hoisted out of the card that shows it.
 *
 * The capture used to live entirely inside `HrvSession` — timer, BLE stream,
 * rolling SDNN, breathing clock and haptics were all component state, so the
 * reading existed exactly as long as that sheet stayed on screen. That was fine
 * while the card was the only way to see it, and stopped being fine the moment
 * the card could be MINIMIZED into a pill: unmounting the sheet would have
 * dropped the strap, reset the timer and restarted the breathing pattern
 * mid-reading. A paced reading whose pattern jumps is not a cosmetic problem,
 * it is a ruined reading.
 *
 * So the engine lives here, in the same shape `watchSyncStore` already uses for
 * the same reason: a module-level store plus `useSyncExternalStore`. The card
 * (`Session.tsx`), the minimized pill (`SessionPill.tsx`) and the host that
 * opens the results sheet (`SessionHost.tsx`) are all VIEWS over this, and can
 * mount and unmount freely without the reading noticing. The breathing pace is
 * derived from the wall clock (`lib/breathClock`) rather than animated from
 * wherever a component happened to mount, which is what keeps the guide
 * identical across a minimize/restore.
 *
 * What stays OUT of here: anything needing React. `finish()` records a result
 * and flips the status; opening the results (or watch-sync) sheet is the host's
 * job, exactly as `watchSyncStore` leaves the sheet to `WatchSyncPill`.
 */
import { useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ble } from '../../lib/ble/manager';
import { ppg, type PpgSignal } from '../../lib/ppg/camera';
import { correctArtifacts, std } from '../../lib/hrv';
import { notifyHrvComplete } from '../../lib/reminders';
import { logError } from '../../lib/diagnostics/errorLog';
import { getState } from '../../store/store';
import {
  type BreathPattern, type BreathPhase, parsePattern, phaseAt,
} from '../../lib/breathClock';
import { pingActivation, pingCaptureCompleted, pingCaptureStarted } from '../../store/ping';

export interface SessionConfig {
  kind: 'breath' | 'unstructured';
  style?: string; // e.g. "4/6"
  source: 'polar' | 'watch' | 'garmin' | 'camera';
  period?: 'Morning' | 'Evening' | 'Other';
}

export interface SessionResult {
  rr: number[];
  segmentStarts: number[];
  hrSamples: { t: number; bpm: number }[];
  sdnnSamples: { t: number; sdnn: number }[];
  durationSec: number;
}

/**
 * Strap and watch readings — training or baseline — run the full 5 minutes.
 * Camera (finger) readings run 3: long enough to resolve the LF band and settle
 * RMSSD (a 1-minute optical reading swings too much to compare against a
 * dedicated app), still realistic to hold a fingertip still.
 */
export const durationFor = (config: SessionConfig) => (config.source === 'camera' ? 180 : 300);

/**
 * Does this source feed live beats to the phone DURING the reading?
 *
 * A wrist source does not: the Apple Watch shares nothing in real time, and
 * Garmin sends its whole series in one message at the end. Anything that shows
 * a running heart rate or SDNN has to check this first, or it renders dashes
 * for five minutes and reads as broken rather than as "not applicable".
 */
export const streamsLive = (source: SessionConfig['source']) =>
  source !== 'watch' && source !== 'garmin';

/**
 * How much of each live series the views get. The traces are redrawn on every
 * sample, so they are trimmed HERE rather than in the chart: a 5-minute reading
 * accumulates ~300 HR points, and a path with 300 segments redrawn at 1 Hz is
 * pure waste when the card is 170pt wide. The window is what fits legibly.
 */
const HR_TRACE = 72;
const SDNN_TRACE = 72;
const RR_TRACE = 64;

export type SessionStatus = 'idle' | 'armed' | 'running' | 'finished';

export interface SessionSnapshot {
  status: SessionStatus;
  config: SessionConfig | null;
  pattern: BreathPattern;
  durationSec: number;
  /** When the guide started pacing (card open), NOT when collection began. */
  breathStartMs: number;
  /** When collection began. 0 until Start is pressed. The watch path needs it:
   *  the sync window is the reading's, not "whenever the app came back". */
  startedAtMs: number;
  elapsed: number;
  hr: number | null;
  sdnn: number | null;
  beats: number;
  connected: boolean;
  artifact: boolean;
  signal: PpgSignal;
  phase: BreathPhase;
  /** Card folded away into the floating pill; the reading carries on. */
  minimized: boolean;
  /** Focus mode: rings and timer only, everything else stripped back. */
  hidden: boolean;
  hrTrace: number[];
  sdnnTrace: number[];
  rrTrace: number[];
  result: SessionResult | null;
}

const IDLE: SessionSnapshot = {
  status: 'idle', config: null, pattern: parsePattern('4/6'), durationSec: 300,
  breathStartMs: 0, startedAtMs: 0, elapsed: 0, hr: null, sdnn: null, beats: 0, connected: false,
  artifact: false, signal: { locked: false, quality: 'none' }, phase: 'in',
  minimized: false, hidden: false, hrTrace: [], sdnnTrace: [], rrTrace: [], result: null,
};

/* ---------- live state (mutable; the snapshot is rebuilt from it) ---------- */

let snap: SessionSnapshot = IDLE;
const listeners = new Set<() => void>();

let rr: number[] = [];
let segmentStarts: number[] = [];
let hrSamples: { t: number; bpm: number }[] = [];
let sdnnSamples: { t: number; sdnn: number }[] = [];
let recentRr: number[] = [];

let startedAtMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let breathTimer: ReturnType<typeof setTimeout> | null = null;
let appSub: NativeEventSubscription | null = null;
let bleAlive = false;
let bleRetry: ReturnType<typeof setTimeout> | null = null;

function emit() { listeners.forEach((f) => f()); }

/** Rebuild the immutable snapshot views read. Called on every change. */
function bump(patch: Partial<SessionSnapshot> = {}) {
  snap = {
    ...snap,
    ...patch,
    beats: rr.length,
    hrTrace: hrSamples.length ? hrSamples.slice(-HR_TRACE).map((s) => s.bpm) : [],
    sdnnTrace: sdnnSamples.length ? sdnnSamples.slice(-SDNN_TRACE).map((s) => s.sdnn) : [],
    rrTrace: rr.length ? rr.slice(-RR_TRACE) : [],
  };
  emit();
}

/** Read through a call so TypeScript cannot narrow `snap.status` across the
 *  async BLE closures below and then declare a later re-check impossible. */
const statusNow = (): SessionStatus => snap.status;

export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getSessionSnapshot(): SessionSnapshot { return snap; }

/**
 * Subscribe a view to the reading. Pass a selector returning a PRIMITIVE where a
 * view only needs one field: the snapshot object is rebuilt on every sample, so
 * a component reading the whole thing re-renders at the sample rate whether or
 * not anything it draws changed.
 */
export function useSession<T>(selector: (s: SessionSnapshot) => T): T {
  return useSyncExternalStore(subscribeSession, () => selector(snap), () => selector(snap));
}

/* ---------- collection ---------- */

/**
 * Shared RR/HR/SDNN collection — the BLE strap and the camera PPG stream emit
 * the same `{ hr, rr[] }` sample shape into this.
 */
function collect(s: { hr: number; rr: number[]; gap?: boolean }) {
  const now = Date.now();
  let hr = snap.hr;
  if (s.hr) { hr = s.hr; hrSamples.push({ t: now, bpm: s.hr }); }
  // Tracking resumed after a lapse: mark a boundary before these beats land, and
  // start the live artifact window over — its first "successive difference"
  // would otherwise straddle the gap.
  if (s.gap && rr.length) { segmentStarts.push(rr.length); recentRr = []; }
  s.rr.forEach((v) => rr.push(v));

  // Live artifact hint over the last ~10 beats.
  let artifact = snap.artifact;
  recentRr = [...recentRr, ...s.rr].slice(-12);
  if (recentRr.length >= 6) artifact = correctArtifacts(recentRr).artifactPct > 20;

  // Rolling SDNN over the trailing ~60 s of beats (artifact-corrected), sampled
  // once per notification (~1 Hz).
  let sdnn = snap.sdnn;
  if (s.rr.length) {
    let sum = 0, i = rr.length;
    while (i > 0 && sum < 60000) { i--; sum += rr[i]; }
    const win = rr.slice(i);
    if (win.length >= 10) {
      sdnn = Math.round(std(correctArtifacts(win).clean));
      sdnnSamples.push({ t: now, sdnn });
    }
  }
  bump({ hr, sdnn, artifact });
}

/* ---------- the clocks ---------- */

/**
 * Elapsed time is derived from the wall clock, not counted interval ticks: iOS
 * suspends JS timers while the app is backgrounded (fully so for the watch
 * source, which holds no BLE/camera session), and tick-counting made the reading
 * appear to pause until the app returned. BLE samples keep flowing in the
 * background (bluetooth-central mode), so the reading itself never stopped —
 * only the clock did.
 */
function syncElapsed() {
  if (snap.status !== 'running') return;
  const e = Math.floor((Date.now() - startedAtMs) / 1000);
  if (e !== snap.elapsed) bump({ elapsed: Math.min(e, snap.durationSec) });
  if (e >= snap.durationSec) void finishSession();
}

/**
 * The breathing pace: re-read from the wall clock at every phase boundary rather
 * than stepped, so a backgrounded stretch (or a minimize) resumes in the right
 * place instead of resuming wherever it was interrupted. The haptic and the
 * phase word live here, not in the view, because the guide must keep ticking
 * while the card is folded into the pill.
 */
function armBreath() {
  if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; }
  if (snap.status === 'idle' || snap.status === 'finished') return;
  if (snap.config?.kind !== 'breath') return;
  const pt = phaseAt(snap.pattern, Date.now() - snap.breathStartMs);
  if (pt.phase !== snap.phase) {
    bump({ phase: pt.phase });
    Haptics.impactAsync(PHASE_HAPTIC[pt.phase]).catch(() => {});
  }
  breathTimer = setTimeout(armBreath, Math.max(40, pt.remainMs));
}

const PHASE_HAPTIC: Record<BreathPhase, Haptics.ImpactFeedbackStyle> = {
  in: Haptics.ImpactFeedbackStyle.Medium,
  out: Haptics.ImpactFeedbackStyle.Light,
  holdIn: Haptics.ImpactFeedbackStyle.Soft,
  holdOut: Haptics.ImpactFeedbackStyle.Soft,
};

/** ~1 s strong buzz: expo-haptics has no long-duration vibration on iOS, so a
 *  dense train of heavy impacts reads as one sustained buzz. */
async function completionBuzz() {
  for (let i = 0; i < 10; i++) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
  }
}

/* ---------- lifecycle ---------- */

/**
 * Open a reading. Idempotent for the same card: the session card calls this on
 * mount, and a restore from the pill must NOT restart the reading it is
 * restoring.
 */
export function startSession(config: SessionConfig, autoStart?: boolean) {
  // A reading already in progress wins, whatever config the caller asked for:
  // there is one strap, one camera and one breathing pace, so a second reading
  // cannot exist. Reopening from the pill relies on exactly this.
  if (snap.status !== 'idle') return;
  rr = []; segmentStarts = []; hrSamples = []; sdnnSamples = []; recentRr = [];
  startedAtMs = 0;
  const now = Date.now();
  snap = {
    ...IDLE,
    status: 'armed',
    config,
    pattern: parsePattern(config.style),
    durationSec: durationFor(config),
    breathStartMs: now,
    // The camera-setup card only hands over once the pulse has locked, so a
    // camera session starts locked rather than warning about a lifted finger.
    signal: config.source === 'camera'
      ? { locked: true, quality: 'good' }
      : { locked: false, quality: 'none' },
  };
  emit();

  // The phone must not sleep mid-reading — the timer, BLE stream and breathing
  // guide all die with the screen.
  activateKeepAwakeAsync('hrv-session').catch(() => {});
  armBreath();

  // Returning to the foreground: re-sync both clocks immediately (and auto-finish
  // if the duration passed while away) instead of waiting for the next tick.
  appSub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') return;
    syncElapsed();
    armBreath();
  });

  if (config.source === 'polar') connectStrap();
  if (config.source === 'camera') {
    // The stream is already running — the camera-setup card beneath locked the
    // pulse and keeps the camera view mounted. Point the manager's callbacks at
    // this collector; detection state (and the lock) carries over untouched.
    ppg().retarget(
      (s) => { if (snap.status === 'running') collect(s); },
      (sig) => bump({ signal: sig }),
    );
  }
  if (autoStart) beginCollection();
}

/**
 * BLE source: connect to the saved strap the moment the card opens, so the link
 * is already up when Start is pressed instead of initializing during the
 * reading. Live HR shows pre-start as a connection cue; RR collection is still
 * gated on Start. Retries quietly until the strap answers.
 */
function connectStrap() {
  const saved = getState().settings.lastBleDeviceId;
  const mgr = ble();
  if (!saved || !mgr.available) return;
  bleAlive = true;
  const attempt = async () => {
    if (!bleAlive || statusNow() === 'finished') return;
    try {
      await mgr.requestPermissions();
      await mgr.connect(
        saved,
        (s) => {
          // Pre-start, the live HR IS the connection cue, so it is pushed here.
          // Once running, `collect` owns it — bumping in both places would
          // re-render every view twice per sample for one number.
          if (!snap.connected) bump({ connected: true });
          if (statusNow() !== 'running' && s.hr && s.hr !== snap.hr) bump({ hr: s.hr });
          // Backgrounded, the 1 s interval is frozen but BLE samples still
          // arrive — drive the clock from them so the reading finishes on time
          // instead of over-collecting until the app returns.
          syncElapsed();
          if (statusNow() === 'running') collect(s);
        },
        () => {
          bump({ connected: false });
          if (bleAlive && snap.status !== 'finished') bleRetry = setTimeout(attempt, 2000);
        },
      );
    } catch {
      bump({ connected: false });
      if (bleAlive && snap.status !== 'finished') bleRetry = setTimeout(attempt, 3000);
    }
  };
  void attempt();
}

/** Start the timer and RR collection. The breathing guide was already running. */
export function beginCollection() {
  if (snap.status !== 'armed') return;
  startedAtMs = Date.now();
  // watch: the ECG is recorded on the wrist; camera + BLE: already streaming
  // since the card opened (their samples start being collected now).
  // Watch, Garmin and camera are all "connected" by definition: none of them is
  // a BLE peripheral this session dials into, so waiting on a connection would
  // hang a session that is working perfectly.
  const src = snap.config?.source;
  const connected = (src === 'watch' || src === 'garmin' || src === 'camera') ? true : snap.connected;
  bump({ status: 'running', connected, elapsed: 0, startedAtMs });
  // A reading has genuinely begun — the counterpart of the completion ping in
  // `finishSession`. Counted in the engine rather than where the card is
  // mounted because this is the one path a running reading can start from,
  // whatever opened it and wherever it is later minimized to.
  pingCaptureStarted(src);
  if (timer) clearInterval(timer);
  timer = setInterval(syncElapsed, 1000);
}

/**
 * End the reading and hand the collected series over. Opening the results (or
 * the watch-sync) sheet is deliberately NOT done here — that needs React, and
 * the host watching `status === 'finished'` owns it.
 */
export async function finishSession() {
  if (snap.status === 'finished' || snap.status === 'idle') return;
  // Wall-clock capture length: auto-finish can fire long after the duration if
  // the app was backgrounded, and never before `beginCollection` stamped a start.
  const capturedSec = startedAtMs
    ? Math.min(snap.durationSec, Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)))
    : 0;
  // Stop the breathing guide (and its in/out haptics) immediately, then mark
  // completion with one strong sustained buzz.
  if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; }
  if (timer) { clearInterval(timer); timer = null; }
  bump({
    status: 'finished',
    minimized: false,
    hidden: false,
    result: {
      rr: rr.slice(),
      segmentStarts: segmentStarts.slice(),
      hrSamples: hrSamples.slice(),
      sdnnSamples: sdnnSamples.slice(),
      durationSec: capturedSec,
    },
  });
  // A reading exists now, whether or not it is ever saved. Both counters fire
  // here: the daily one, and the once-per-install activation for whoever has
  // just finished their first.
  pingCaptureCompleted(snap.config?.source);
  pingActivation(snap.config?.source);
  void completionBuzz();
  // Backgrounded (a BLE reading keeps running while the phone is set aside), iOS
  // never plays the buzz above — post a notification so completion is still
  // felt. Foreground readings feel the buzz, so skip it there.
  if (AppState.currentState !== 'active') void notifyHrvComplete();
  await releaseCapture();
}

/** Drop the strap / camera. Safe to call twice. */
async function releaseCapture() {
  bleAlive = false;
  if (bleRetry) { clearTimeout(bleRetry); bleRetry = null; }
  const src = snap.config?.source;
  try {
    if (src === 'polar') await ble().disconnect();
    if (src === 'camera') await ppg().stop();
  } catch (e) { logError('hrv.session.release', e); }
}

/**
 * Tear the session down: nothing is left running and the pill disappears. Called
 * when the reading is abandoned before it starts, and once the results sheet
 * that consumed it goes away.
 */
export function endSession() {
  if (snap.status === 'idle') return;
  if (timer) { clearInterval(timer); timer = null; }
  if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; }
  appSub?.remove(); appSub = null;
  void releaseCapture();
  deactivateKeepAwake('hrv-session');
  rr = []; segmentStarts = []; hrSamples = []; sdnnSamples = []; recentRr = [];
  snap = IDLE;
  emit();
}

/* ---------- presentation state (still the session's, not a view's) ---------- */

/**
 * Fold the card away into the floating pill. The reading is untouched — that is
 * the whole point — so this only records that no card is on screen.
 *
 * Not offered for a camera reading: the finger stream is served by the camera
 * view mounted in the setup card BENEATH this one, and closing the sheet stack
 * would unmount it mid-capture.
 */
export function minimizeSession() {
  if (snap.status === 'idle' || snap.config?.source === 'camera') return;
  bump({ minimized: true, hidden: false });
}
export function restoreSession() { if (snap.minimized) bump({ minimized: false }); }
export const canMinimize = (c: SessionConfig | null) => !!c && c.source !== 'camera';

/** Focus mode: rings and timer on black, everything else stripped away. */
export function setSessionHidden(hidden: boolean) {
  if (snap.status !== 'idle') bump({ hidden });
}
