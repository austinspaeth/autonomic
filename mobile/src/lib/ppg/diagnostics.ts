/**
 * Camera-PPG diagnostics: the running trace, and the pure formatter that turns
 * a collected report into the text the user copies out.
 *
 * Why this exists: "the flash never came on and the camera never appeared" has
 * at least six silent causes — permission never granted, the OS camera privacy
 * toggle, another app holding the camera, no back device, a format/fps
 * combination CameraX refuses to bind, and a bound session that streams no
 * frames — and the flow distinguishes none of them. Every one of them lands the
 * user on the same screen: a black circle, no torch, "Waiting for a steady
 * pulse…" forever.
 *
 * The fix is to record the path rather than the symptom. {@link ppgTrace} is a
 * milestone tracker: the camera flow reports how far it got, in order, so the
 * report can say "reached the format, never mounted the view" instead of
 * "didn't work". Milestones are ordered, so the FIRST unreached one is the
 * answer, and the notes are written against exactly that.
 *
 * Deliberately free of `react-native` and `react-native-vision-camera` imports
 * so it stays unit-testable — the collection side lives in `collect.ts`.
 */
import { line, yn } from '../diagnostics/format';

/* ---------- milestones ---------- */

/**
 * The camera path, in the order it must be walked. The furthest milestone
 * reached is the single most useful fact in the whole dump: everything below is
 * detail explaining why the NEXT one never happened.
 */
export const PPG_MILESTONES = [
  'card-opened',
  'module-loaded',
  'permission-granted',
  'device-found',
  'format-chosen',
  'view-mounted',
  'session-initialized',
  'torch-on',
  'frames-arriving',
  'finger-detected',
  'pulse-locked',
] as const;
export type PpgMilestone = (typeof PPG_MILESTONES)[number];

/** Plain-language label per milestone, for the report's checklist. */
const MILESTONE_LABEL: Record<PpgMilestone, string> = {
  'card-opened': 'Camera setup card opened',
  'module-loaded': 'VisionCamera + Worklets loaded',
  'permission-granted': 'Camera permission granted',
  'device-found': 'Rear camera device found',
  'format-chosen': 'Capture format chosen',
  'view-mounted': '<Camera> actually mounted',
  'session-initialized': 'Camera session initialized (onInitialized)',
  'torch-on': 'Torch prop switched on',
  'frames-arriving': 'Frames reaching the frame processor',
  'finger-detected': 'Fingertip detected on the lens',
  'pulse-locked': 'Steady pulse locked',
};

/** What to tell the user when the flow stopped at each milestone. Keyed by the
 *  FIRST milestone that was never reached. */
const STALLED_NOTE: Record<PpgMilestone, string> = {
  'card-opened': 'The setup card never reported opening — the trace is empty, so this dump was taken from somewhere else in the app.',
  'module-loaded': 'react-native-vision-camera or react-native-worklets-core is missing from this build. Camera readings cannot work at all here (Expo Go, a simulator, or a broken release build).',
  'permission-granted': 'Camera permission is NOT granted, so the camera view is never even mounted. Grant Camera to Autonomic in system Settings. On Android a second refusal makes the prompt stop appearing entirely.',
  'device-found': 'Permission is granted but the OS reported no rear camera. Suspect a system camera-privacy toggle (Android Quick Settings "Camera access"), a work-profile/MDM restriction, or another app holding the camera exclusively.',
  'format-chosen': 'A rear camera exists but no usable capture format came back from it. The device reports an empty format list, which is a driver-level problem.',
  'view-mounted': 'Everything resolved but the camera view was never mounted — see "render blocked" below for the exact reason.',
  'session-initialized': 'The view mounted but CameraX/AVFoundation never finished binding a session. This is the classic "black preview, no flash" failure: the requested format/fps combination was refused, or another app owns the camera. See ATTEMPTS for what was tried and the error each time.',
  'torch-on': 'The session initialized but the torch was never switched on. Either the device reports no torch, or the reading was stopped before the torch engaged.',
  'frames-arriving': 'The session is live and the torch is on, but zero frames reached the frame processor. Suspect the frame processor worklet (worklets-core not installed correctly, or stripped by R8 in a release build).',
  'finger-detected': 'Frames are arriving but none look like a covered lens. The fingertip is not over the camera, or the torch is not lighting it — check that the flash chosen in setup matches the real flash position.',
  'pulse-locked': 'Frames arrive and a finger is detected, but no steady pulse was found. This is a placement/pressure problem, not a fault: lighter pressure, cover both lens and flash, hold still.',
};

/* ---------- the configuration ladder ---------- */

/**
 * What the camera view asks the device for, in order, falling to the next rung
 * whenever a session fails to bind OR binds but streams nothing.
 *
 * Rung 0 is what we actually want: the smallest sensor mode at the highest
 * frame rate, because RR timing resolution is set by the frame interval and the
 * per-frame GPU→CPU copy is the only thing that costs anything. But
 * `getCameraFormat` only promises the CLOSEST available format, and CameraX
 * hard-asserts the requested fps against that format's range before binding —
 * so on a device whose closest match can't hold 60, rung 0 throws and the user
 * gets a black circle with no torch and no explanation. The lower rungs trade
 * timing resolution for a session that actually starts; a 30 fps reading beats
 * no reading.
 */
export const PPG_ATTEMPTS: { label: string; width: number | null; height: number | null; fps: number | null }[] = [
  { label: '320×240, up to 60 fps', width: 320, height: 240, fps: 60 },
  { label: '320×240, device default fps', width: 320, height: 240, fps: null },
  { label: 'device default format and fps', width: null, height: null, fps: null },
];

/** How long a rung gets to bind a session, and then to produce a first frame,
 *  before we treat it as failed and drop to the next one. Generous: a cold
 *  camera on a mid-range Android takes well over a second to bind. */
export const ATTEMPT_INIT_TIMEOUT_MS = 5000;
export const ATTEMPT_FRAME_TIMEOUT_MS = 4000;

/* ---------- trace ---------- */

export interface PpgTraceEvent {
  /** ms since the trace was reset (i.e. since the setup card opened). */
  ms: number;
  tag: string;
  detail?: string;
}

/** One pass at binding a camera session. The ladder in `CameraView` walks these
 *  in order, so a report shows exactly which configurations the device refused. */
export interface PpgAttempt {
  n: number;
  label: string;
  /** What we asked the device for. */
  requested: { resolution: string | null; fps: number | null };
  /** What `getCameraFormat` actually returned for that request. */
  resolved: string | null;
  /** The fps we ended up passing to <Camera>, after clamping to the format. */
  appliedFps: number | null;
  initialized: boolean;
  frames: number;
  error: string | null;
}

export interface PpgTraceState {
  /** Wall-clock start, for the report header. */
  startedAt: string | null;
  reached: Partial<Record<PpgMilestone, number>>;
  events: PpgTraceEvent[];
  moduleLoaded: boolean | null;
  workletsLoaded: boolean | null;
  /** Last status `Camera.getCameraPermissionStatus()` reported. */
  permissionStatus: string | null;
  /** Result of the one `requestCameraPermission()` call the flow makes. */
  permissionRequested: string | null;
  device: string | null;
  hasTorch: boolean | null;
  /** Why `<Camera>` returned null instead of rendering, if it did. */
  renderBlocked: string | null;
  attempts: PpgAttempt[];
  attempt: number;
  torch: string | null;
  frames: number;
  firstFrameMs: number | null;
  lastFrameMs: number | null;
  /** Inferred frame-timestamp unit; null means the scale was never resolved. */
  tScale: number | null;
  fps: number | null;
  fingerOn: boolean;
  quality: string | null;
  locked: boolean;
  lastError: string | null;
  stopped: boolean;
}

const MAX_EVENTS = 160;

function emptyState(): PpgTraceState {
  return {
    startedAt: null,
    reached: {},
    events: [],
    moduleLoaded: null,
    workletsLoaded: null,
    permissionStatus: null,
    permissionRequested: null,
    device: null,
    hasTorch: null,
    renderBlocked: null,
    attempts: [],
    attempt: 0,
    torch: null,
    frames: 0,
    firstFrameMs: null,
    lastFrameMs: null,
    tScale: null,
    fps: null,
    fingerOn: false,
    quality: null,
    locked: false,
    lastError: null,
    stopped: false,
  };
}

let state = emptyState();
let t0 = 0;
/** Injectable clock: jest has no wall clock worth asserting against. */
let now: () => number = () => Date.now();

const listeners = new Set<(s: PpgTraceState) => void>();
// Deferred and coalesced: the camera view writes to the trace from its render
// path, and a synchronous notify there would setState on a subscriber mid-render.
let flushing = false;
function notify() {
  if (flushing || !listeners.size) return;
  flushing = true;
  const fire = () => { flushing = false; listeners.forEach((fn) => fn(state)); };
  if (typeof queueMicrotask === 'function') queueMicrotask(fire);
  else setTimeout(fire, 0);
}

/**
 * The live trace. Every write is cheap and total — this runs inside the camera
 * render path and the per-frame push, so it must never throw and never allocate
 * per frame beyond a counter bump.
 */
export const ppgTrace = {
  /** Called when the camera-setup card opens: a fresh attempt, a fresh trace. */
  reset() {
    state = emptyState();
    t0 = now();
    state.startedAt = new Date(t0).toISOString();
    this.mark('card-opened');
  },
  /** Milestones are monotonic — reaching one twice keeps the first timestamp. */
  mark(m: PpgMilestone, detail?: string) {
    if (state.reached[m] == null) {
      state.reached[m] = now() - t0;
      this.note(m, detail);
    } else if (detail) {
      this.note(m, detail);
    }
  },
  note(tag: string, detail?: string) {
    state.events.push({ ms: now() - t0, tag, detail });
    // Keep the head: the first events explain a failure that already happened,
    // while a long tail is just frames ticking by.
    if (state.events.length > MAX_EVENTS) state.events.splice(MAX_EVENTS / 2, 1);
    notify();
  },
  /**
   * Merge fields into the state and emit one event describing the change.
   * A patch that changes nothing is dropped entirely — the camera view calls
   * this from its render path, where re-emitting on every commit would both
   * flood the event log and defeat the point of a readable trace.
   */
  set(patch: Partial<PpgTraceState>, tag?: string, detail?: string) {
    const keys = Object.keys(patch) as (keyof PpgTraceState)[];
    if (!keys.some((k) => state[k] !== patch[k])) return;
    Object.assign(state, patch);
    if (tag) this.note(tag, detail);
    else notify();
  },
  beginAttempt(a: PpgAttempt) {
    state.attempts = [...state.attempts, a];
    state.attempt = a.n;
    this.note('attempt', `#${a.n} ${a.label}`);
  },
  /** Patch the attempt currently in flight (init, error, frame count). */
  patchAttempt(patch: Partial<PpgAttempt>) {
    const last = state.attempts[state.attempts.length - 1];
    if (!last) return;
    Object.assign(last, patch);
    notify();
  },
  countFrame() {
    const ms = now() - t0;
    state.frames++;
    if (state.firstFrameMs == null) {
      state.firstFrameMs = ms;
      this.mark('frames-arriving');
    }
    state.lastFrameMs = ms;
    const last = state.attempts[state.attempts.length - 1];
    if (last) last.frames++;
    // No notify() per frame — subscribers only care about the state changes
    // above, and this runs at up to 60 Hz.
  },
  /** Cheap read for the frame watchdog — no snapshot allocation. */
  frameCount() { return state.frames; },
  snapshot(): PpgTraceState {
    // Deep enough to be immune to later mutation of the arrays we hand out.
    return { ...state, reached: { ...state.reached }, events: [...state.events], attempts: state.attempts.map((a) => ({ ...a })) };
  },
  subscribe(fn: (s: PpgTraceState) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  /** Test seam. */
  __setClock(fn: () => number) { now = fn; },
};

/* ---------- report ---------- */

export interface CameraDiagnostics {
  at: string;
  app: Record<string, string | number | boolean | null>;
  platform: Record<string, string | number | boolean | null>;
  /** Native module presence, checked at collection time. */
  modules: Record<string, string>;
  /** VisionCamera's own view of the grant, plus the raw OS permission. */
  permission: { status: string; osCheck: string | null };
  /** Every camera the OS lists, so a missing back device is provable. */
  devices: CameraDeviceReport[];
  /** The device the flow would use, and the formats around what we ask for. */
  chosen: CameraDeviceReport | null;
  formatSamples: string[];
  formatError: string | null;
  /** Saved shape/flash pick from the setup wizard. */
  layout: { shape: string | null; flash: string | null };
  trace: PpgTraceState;
  notes: string[];
}

export interface CameraDeviceReport {
  id: string;
  position: string;
  name: string;
  hasTorch: boolean;
  hasFlash: boolean;
  hardwareLevel: string | null;
  physicalDevices: string[];
  formatCount: number;
  /** min/max fps across every format — proves whether 60 was ever available. */
  fpsRange: string | null;
  /** Smallest video resolution offered, i.e. the closest thing to our 320×240. */
  smallestVideo: string | null;
}

/** First milestone in PPG_MILESTONES that was never reached, or null if all were. */
export function firstUnreached(reached: Partial<Record<PpgMilestone, number>>): PpgMilestone | null {
  return PPG_MILESTONES.find((m) => reached[m] == null) ?? null;
}

/** One-line plain-language verdict — usually the whole answer. */
export function cameraVerdict(d: CameraDiagnostics): string {
  const stalled = firstUnreached(d.trace.reached);
  if (!stalled) return 'The full camera path completed: session live, torch on, frames arriving, pulse locked.';
  if (stalled === 'card-opened') return STALLED_NOTE['card-opened'];
  const last = PPG_MILESTONES[PPG_MILESTONES.indexOf(stalled) - 1];
  return `Stopped after "${MILESTONE_LABEL[last]}" — never reached "${MILESTONE_LABEL[stalled]}". ${STALLED_NOTE[stalled]}`;
}

function attemptLines(a: PpgAttempt): string[] {
  return [
    `  #${a.n} ${a.label}`,
    `      requested     ${a.requested.resolution ?? 'device default'} @ ${a.requested.fps == null ? 'device default fps' : `${a.requested.fps} fps`}`,
    `      resolved      ${a.resolved ?? '—'}${a.appliedFps == null ? '' : `  (applied ${a.appliedFps} fps)`}`,
    `      initialized   ${yn(a.initialized)}   frames ${a.frames}`,
    `      error         ${a.error ?? 'none'}`,
  ];
}

function deviceLines(d: CameraDeviceReport): string[] {
  return [
    `  ${d.position} · ${d.name || d.id}`,
    `      id            ${d.id}`,
    `      torch ${yn(d.hasTorch)}   flash ${yn(d.hasFlash)}   hardware level ${d.hardwareLevel ?? '—'}`,
    `      lenses        ${d.physicalDevices.join(', ') || '—'}`,
    `      formats       ${d.formatCount}${d.fpsRange ? `, fps ${d.fpsRange}` : ''}`,
    `      smallest video ${d.smallestVideo ?? '—'}`,
  ];
}

/**
 * Render the dump as plain text for the copy/share box. Readable rather than
 * JSON — it gets pasted into an email by a user who is already having a bad
 * time, and read by whoever answers it. Contains no health data.
 */
export function formatCameraDiagnostics(d: CameraDiagnostics): string {
  const out: string[] = [];
  const t = d.trace;

  out.push('AUTONOMIC — CAMERA HRV DIAGNOSTICS', d.at, '');

  out.push('VERDICT');
  for (const chunk of cameraVerdict(d).match(/.{1,74}(\s|$)/g) ?? []) out.push(`  ${chunk.trim()}`);
  out.push('');

  out.push('HOW FAR IT GOT');
  const stalled = firstUnreached(t.reached);
  for (const m of PPG_MILESTONES) {
    const ms = t.reached[m];
    const glyph = ms != null ? '✓' : m === stalled ? '✗' : '·';
    out.push(`  ${glyph} ${MILESTONE_LABEL[m].padEnd(44)}${ms != null ? `${ms} ms` : ''}`);
  }
  out.push('');

  out.push('APP');
  for (const [k, v] of Object.entries(d.app)) out.push(line(k, v));
  out.push('', 'PLATFORM');
  for (const [k, v] of Object.entries(d.platform)) out.push(line(k, v));

  out.push('', 'NATIVE MODULES');
  for (const [k, v] of Object.entries(d.modules)) out.push(line(k, v));

  out.push('', 'PERMISSION');
  out.push(line('VisionCamera status', d.permission.status));
  out.push(line('OS check', d.permission.osCheck));
  out.push(line('requested this run', t.permissionRequested));
  out.push(line('last seen by view', t.permissionStatus));

  out.push('', `CAMERA DEVICES (${d.devices.length})`);
  if (d.devices.length) d.devices.forEach((dev) => out.push(...deviceLines(dev)));
  else out.push('  none reported by the OS');

  out.push('', 'DEVICE IN USE');
  if (d.chosen) out.push(...deviceLines(d.chosen));
  else out.push('  no back-facing device resolved');
  if (d.formatError) out.push(line('format error', d.formatError));
  if (d.formatSamples.length) {
    out.push('  formats closest to what we request:');
    d.formatSamples.forEach((f) => out.push(`      ${f}`));
  }

  out.push('', `ATTEMPTS (${t.attempts.length})`);
  if (t.attempts.length) t.attempts.forEach((a) => out.push(...attemptLines(a)));
  else out.push('  none — the camera view never got as far as configuring a session');

  out.push('', 'SESSION');
  out.push(line('render blocked by', t.renderBlocked));
  out.push(line('torch prop', t.torch));
  out.push(line('device has torch', yn(t.hasTorch)));
  out.push(line('fps applied', t.fps));
  out.push(line('frames', t.frames));
  out.push(line('first frame', t.firstFrameMs == null ? null : `${t.firstFrameMs} ms`));
  out.push(line('last frame', t.lastFrameMs == null ? null : `${t.lastFrameMs} ms`));
  out.push(line('timestamp scale', t.tScale));
  out.push(line('finger detected', yn(t.fingerOn)));
  out.push(line('pulse quality', t.quality));
  out.push(line('pulse locked', yn(t.locked)));
  out.push(line('last error', t.lastError));
  out.push(line('stopped', yn(t.stopped)));

  out.push('', 'SAVED LAYOUT');
  out.push(line('camera shape', d.layout.shape));
  out.push(line('flash position', d.layout.flash));

  out.push('', `TRACE (${t.events.length} events)`);
  for (const e of t.events) out.push(`  ${String(e.ms).padStart(6)} ms  ${e.tag}${e.detail ? `  ${e.detail}` : ''}`);

  if (d.notes.length) {
    out.push('', 'NOTES');
    for (const n of d.notes) out.push(`  · ${n}`);
  }

  return out.join('\n');
}
