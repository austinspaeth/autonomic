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
import {
  noteRrSample, rrSupport, RR_WATCH_START, type RrSupport, type RrWatch,
} from '../../lib/ble/rrSupport';
import { ppg, type PpgSignal } from '../../lib/ppg/camera';
import { computeHrv, correctArtifacts, hopelessCoverage, std } from '../../lib/hrv';
import { readingDoneCopy } from '../../lib/notifications';
import { notifyHrvComplete } from '../../lib/reminders';
import { logError } from '../../lib/diagnostics/errorLog';
import { getState } from '../../store/store';
import {
  type BreathPattern, type BreathPhase, parsePattern, phaseAt,
} from '../../lib/breathClock';
import { pingActivation, pingCaptureCompleted, pingCaptureStarted, pingReadingKind } from '../../store/ping';
import { isFirstBaseline } from '../../lib/ping';
import { todayKey } from '../../lib/dates';

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
 * Every reading — strap, watch or camera, training or baseline — runs the full
 * 5 minutes. Camera readings used to run 3, which left them the one source that
 * could never resolve VLF and the one whose numbers were not comparable to a
 * seated 5-minute reading from anything else.
 */
export const durationFor = (_config: SessionConfig) => 300;

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

/**
 * Why a reading ended WITHOUT a result, when it did.
 *
 * `null` is the ordinary case: the duration ran out or Finish now was pressed,
 * and `result` holds the beats. The two values here are the same event seen
 * from either side — the app worked out the reading could not get there, or the
 * user did — and both mean there is nothing to hand to `Results`, so the host
 * raises the trouble card instead.
 *
 * It is deliberately NOT a variant of finishing. A reading abandoned this way
 * fires no completion or activation ping: an abandoned session is the one place
 * in the whole counter system where a capture that started and never finished
 * is visible at all, and crediting it would close the only gap we have.
 */
export type SessionStopReason = 'signal' | 'user';

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
  /**
   * Whether the connected BLE device sends beat intervals at all. Only the strap
   * path ever feeds this, so it stays 'unknown' for the camera, watch and Garmin
   * sources — none of them is a device we discover a capability of.
   */
  rrSupport: RrSupport;
  artifact: boolean;
  signal: PpgSignal;
  /**
   * Seconds of pulse actually collected — the summed RR, not the clock.
   *
   * The camera emits no beats at all from a window that does not read as a
   * steady pulse (`ppgBridge.analyze`), so on that source this and `elapsed`
   * diverge exactly as much as the finger is misbehaving, and the gap is what
   * the stop rule reads. An optimistic upper bound on the pipeline's own
   * `coverageSec`, which is over CLEAN kept beats — so a stop decision taken
   * from it only ever errs toward letting the reading continue.
   */
  usableSec: number;
  /** Set only when the reading ended with no result. See {@link SessionStopReason}. */
  stopReason: SessionStopReason | null;
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
  rrSupport: 'unknown',
  artifact: false, signal: { locked: false, quality: 'none' }, usableSec: 0, stopReason: null, phase: 'in',
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
/** Running total of collected RR (ms), kept rather than re-summed: `bump` runs
 *  on every sample and a 5-minute reading is ~350 beats. */
let usableMs = 0;
/** What the strap has told us about its own capability. Not reset on a
 *  reconnect: this is a fact about the device, not about the link. */
let rrWatch: RrWatch = RR_WATCH_START;

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
    usableSec: Math.round(usableMs / 1000),
    rrSupport: rrSupport(rrWatch),
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
  s.rr.forEach((v) => { rr.push(v); usableMs += v; });

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
  if (e >= snap.durationSec) { void finishSession(); return; }
  // A camera reading that cannot reach the coverage bar is stopped where it is
  // rather than run to the end.
  //
  // The whole cost of a bad finger placement used to be paid at 3:00, in the
  // form of a card declining to save anything — which is the right verdict at
  // the worst possible moment, and a user who repeats the attempt has spent
  // twenty minutes to be told the same sentence seven times. The decision was
  // already made by 0:45; the only thing the remaining time bought was the
  // user's patience. `hopelessCoverage` is the arithmetic, and it never stops a
  // reading holding enough pulse to be offered.
  //
  // Camera only: a strap either delivers beats or does not, and that question
  // is answered before the reading starts (`rrSupport`).
  if (snap.config?.source === 'camera' && hopelessCoverage({
    usableSec: usableMs / 1000, elapsedSec: e, durationSec: snap.durationSec,
  })) {
    void abandonSession('signal');
  }
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
    // Not on the camera: the phone IS the sensor, and a vibration under the
    // fingertip shakes the very pulse signal being read.
    if (snap.config.source !== 'camera') Haptics.impactAsync(PHASE_HAPTIC[pt.phase]).catch(() => {});
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
  usableMs = 0;
  rrWatch = RR_WATCH_START;
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
          // Learn whether this device sends beats at all, from what it actually
          // sends. It has to happen HERE rather than in `collect`: pre-start
          // nothing is collected, and pre-start is exactly when the answer is
          // worth having — a device that streams a pulse and no intervals can
          // never produce a reading, and the alternative is the user finding
          // out five minutes later.
          rrWatch = noteRrSample(rrWatch, s);
          // Pre-start, the live HR IS the connection cue, so it is pushed here.
          // Once running, `collect` owns it — bumping in both places would
          // re-render every view twice per sample for one number.
          //
          // The verdict above is derived inside `bump`, but on a steady heart
          // rate nothing below here would call it, so the moment it settles has
          // to force one of its own.
          if (!snap.connected || rrSupport(rrWatch) !== snap.rrSupport) bump({ connected: true });
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
    } catch (e) {
      // A strap that will not pair is the single most common way a reading
      // never happens, and this loop retried every three seconds forever
      // without leaving a trace anywhere — so "my strap doesn't work" arrived
      // with no evidence at all. Logged on every attempt on purpose: the log
      // collapses consecutive repeats into a count, and the fault report
      // buffers occurrences, so a phone that never connects reports the
      // failure once and then its true volume rather than one line or forty.
      logError('hrv.strap.connect', e);
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
  // A camera reading is taken face down, so the screen cannot say it started.
  // The placement card promises this buzz; the completion buzz is its pair.
  if (src === 'camera') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
  // Which kind it was. Nothing has been written yet (Results files it), so the
  // day's readings are exactly the ones before this one.
  if (snap.config) {
    pingReadingKind(
      snap.config.kind === 'breath' ? 'breathHrv' : 'hrv',
      isFirstBaseline(getState().days[todayKey()]?.readings),
    );
  }
  void completionBuzz();
  // Backgrounded (a BLE reading keeps running while the phone is set aside), iOS
  // never plays the buzz above — post a notification so completion is still
  // felt. Foreground readings feel the buzz, so skip it there. It says what the
  // results card will say (saved, needs a decision, or unusable), so the verdict
  // is taken here with the same pipeline; a watch reading's beats are still on
  // the wrist, so it has none to judge.
  if (AppState.currentState !== 'active') {
    const cfg = snap.config;
    const onWrist = cfg?.source === 'watch' || cfg?.source === 'garmin';
    let result = null;
    if (!onWrist && cfg) {
      try {
        result = computeHrv(rr, { style: cfg.style, source: cfg.source, durationSec: capturedSec, segmentStarts });
      } catch (e) { logError('hrv.notify', e); }
    }
    if (onWrist || result) {
      void notifyHrvComplete(readingDoneCopy(result, cfg?.source === 'garmin' ? 'Garmin' : 'Apple Watch'));
    }
  }
  await releaseCapture();
}

/**
 * End the reading with NO result: the signal was never going to get there, or
 * the user said so. `SessionHost` raises the trouble card off `stopReason`.
 *
 * Deliberately not a flavour of `finishSession`. It writes no result, so
 * nothing downstream can mistake this for a reading; and it fires neither the
 * completion nor the activation ping, because the gap between `cap` and `hrv`
 * is the ONLY place an abandoned capture is visible in the counters at all, and
 * an abandoned session is the opposite of an activation.
 *
 * The elapsed clock and `usableSec` are left exactly as they were: the card
 * says what it saw ("stopped at 0:48, 14s of usable pulse"), and a number that
 * had been reset to zero would be the app failing to explain itself at the one
 * moment it is trying to.
 */
export async function abandonSession(reason: SessionStopReason) {
  if (snap.status === 'finished' || snap.status === 'idle') return;
  if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; }
  if (timer) { clearInterval(timer); timer = null; }
  bump({ status: 'finished', minimized: false, hidden: false, result: null, stopReason: reason });
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
  usableMs = 0;
  rrWatch = RR_WATCH_START;
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
