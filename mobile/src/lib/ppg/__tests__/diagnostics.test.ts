import {
  PPG_ATTEMPTS, PPG_MILESTONES, cameraVerdict, firstUnreached, formatCameraDiagnostics, ppgTrace,
  type CameraDiagnostics, type PpgMilestone,
} from '../diagnostics';

/** Milestones reached, in order, up to and including `upTo`. */
function reachedUpTo(upTo: PpgMilestone): Partial<Record<PpgMilestone, number>> {
  const out: Partial<Record<PpgMilestone, number>> = {};
  for (const m of PPG_MILESTONES) {
    out[m] = PPG_MILESTONES.indexOf(m) * 100;
    if (m === upTo) break;
  }
  return out;
}

function report(over: Partial<CameraDiagnostics> = {}): CameraDiagnostics {
  return {
    at: '2026-07-31T10:00:00.000Z',
    app: { 'app version': '1.21.0' },
    platform: { os: 'android', model: 'SM-S911B' },
    modules: { 'react-native-vision-camera': 'loaded' },
    permission: { status: 'granted', osCheck: 'granted' },
    devices: [],
    chosen: null,
    formatSamples: [],
    formatError: null,
    layout: { shape: 'tall', flash: 'top' },
    trace: { ...ppgTrace.snapshot(), reached: reachedUpTo('format-chosen') },
    notes: [],
    ...over,
  };
}

describe('firstUnreached', () => {
  it('is null when the whole path completed', () => {
    expect(firstUnreached(reachedUpTo('pulse-locked'))).toBeNull();
  });

  it('names the first gap, not the last milestone reached', () => {
    expect(firstUnreached(reachedUpTo('device-found'))).toBe('format-chosen');
  });

  it('reports an empty trace as never having opened the card', () => {
    expect(firstUnreached({})).toBe('card-opened');
  });

  // A later milestone reached without an earlier one is the case that matters:
  // "session initialized but the torch never came on" must still blame the torch.
  it('ignores milestones reached out of order after the gap', () => {
    const reached = { ...reachedUpTo('session-initialized'), 'frames-arriving': 900 };
    expect(firstUnreached(reached)).toBe('torch-on');
  });
});

describe('cameraVerdict', () => {
  it('leads with the permission when that is the blocker', () => {
    const v = cameraVerdict(report({ trace: { ...ppgTrace.snapshot(), reached: reachedUpTo('module-loaded') } }));
    expect(v).toContain('Camera permission is NOT granted');
    expect(v).toContain('never reached');
  });

  // The friend's exact symptom: everything resolves, the view mounts, and then
  // CameraX never binds — no preview, no torch, no error the user can see.
  it('blames the session bind when the view mounted but never initialized', () => {
    const v = cameraVerdict(report({ trace: { ...ppgTrace.snapshot(), reached: reachedUpTo('view-mounted') } }));
    expect(v).toContain('never finished binding a session');
    expect(v).toContain('black preview, no flash');
  });

  it('calls a complete run complete', () => {
    const v = cameraVerdict(report({ trace: { ...ppgTrace.snapshot(), reached: reachedUpTo('pulse-locked') } }));
    expect(v).toContain('completed');
  });

  it('treats a placement problem as placement, not a fault', () => {
    const v = cameraVerdict(report({ trace: { ...ppgTrace.snapshot(), reached: reachedUpTo('finger-detected') } }));
    expect(v).toContain('placement/pressure problem, not a fault');
  });
});

describe('formatCameraDiagnostics', () => {
  it('prints the checklist with a cross at the stall and no cross after it', () => {
    const text = formatCameraDiagnostics(report({ trace: { ...ppgTrace.snapshot(), reached: reachedUpTo('device-found') } }));
    expect(text).toMatch(/✓ Rear camera device found/);
    expect(text).toMatch(/✗ Capture format chosen/);
    expect(text.match(/✗/g)).toHaveLength(1);
  });

  it('carries the platform, version and device identity a support reply needs', () => {
    const text = formatCameraDiagnostics(report());
    expect(text).toContain('1.21.0');
    expect(text).toContain('SM-S911B');
    expect(text).toContain('android');
  });

  it('lists every attempted configuration with its error', () => {
    const trace = ppgTrace.snapshot();
    trace.attempts = [
      { n: 0, label: '320×240, up to 60 fps', requested: { resolution: '320×240', fps: 60 }, resolved: '640×480 @ 30–30 fps', appliedFps: 30, initialized: false, frames: 0, error: 'format/invalid-fps: 60 is higher than the format maximum' },
      { n: 1, label: '320×240, device default fps', requested: { resolution: '320×240', fps: null }, resolved: '640×480 @ 30–30 fps', appliedFps: null, initialized: true, frames: 118, error: null },
    ];
    const text = formatCameraDiagnostics(report({ trace }));
    expect(text).toContain('ATTEMPTS (2)');
    expect(text).toContain('format/invalid-fps');
    expect(text).toContain('frames 118');
  });

  it('says so plainly when no session was ever attempted', () => {
    expect(formatCameraDiagnostics(report())).toContain('never got as far as configuring a session');
  });

  it('carries no health data', () => {
    const text = formatCameraDiagnostics(report()).toLowerCase();
    for (const word of ['rmssd', 'sdnn', 'heart rate', 'bpm', 'sleep']) expect(text).not.toContain(word);
  });
});

describe('ppgTrace', () => {
  beforeEach(() => {
    let t = 0;
    ppgTrace.__setClock(() => (t += 10));
    ppgTrace.reset();
  });
  afterAll(() => ppgTrace.__setClock(() => Date.now()));

  it('opens with the card milestone and a wall-clock start', () => {
    const s = ppgTrace.snapshot();
    expect(s.reached['card-opened']).toBeDefined();
    expect(s.startedAt).toBeTruthy();
  });

  it('keeps the first timestamp when a milestone is reached twice', () => {
    ppgTrace.mark('device-found');
    const first = ppgTrace.snapshot().reached['device-found'];
    ppgTrace.mark('device-found');
    expect(ppgTrace.snapshot().reached['device-found']).toBe(first);
  });

  // The camera view writes from its render path, so a patch that changes
  // nothing must not append an event on every commit.
  it('drops a set() that changes nothing', () => {
    ppgTrace.set({ torch: 'off' }, 'torch');
    const n = ppgTrace.snapshot().events.length;
    ppgTrace.set({ torch: 'off' }, 'torch');
    ppgTrace.set({ torch: 'off' }, 'torch');
    expect(ppgTrace.snapshot().events).toHaveLength(n);
    ppgTrace.set({ torch: 'on' }, 'torch');
    expect(ppgTrace.snapshot().events.length).toBe(n + 1);
  });

  it('marks frames-arriving on the first frame only, and counts the rest', () => {
    ppgTrace.beginAttempt({ n: 0, label: 'x', requested: { resolution: null, fps: null }, resolved: null, appliedFps: null, initialized: false, frames: 0, error: null });
    const before = ppgTrace.snapshot().events.length;
    for (let i = 0; i < 50; i++) ppgTrace.countFrame();
    const s = ppgTrace.snapshot();
    expect(s.frames).toBe(50);
    expect(s.attempts[0].frames).toBe(50);
    expect(s.reached['frames-arriving']).toBeDefined();
    // One milestone event, not fifty — a per-frame event log is unreadable.
    expect(s.events.length).toBe(before + 1);
  });

  it('caps the event log without losing the opening events', () => {
    for (let i = 0; i < 400; i++) ppgTrace.note('noise', String(i));
    const s = ppgTrace.snapshot();
    expect(s.events.length).toBeLessThanOrEqual(161);
    expect(s.events[0].tag).toBe('card-opened');
  });

  it('hands out snapshots immune to later mutation', () => {
    const s = ppgTrace.snapshot();
    ppgTrace.note('after');
    expect(ppgTrace.snapshot().events.length).toBe(s.events.length + 1);
  });
});

describe('PPG_ATTEMPTS', () => {
  it('degrades strictly: each rung asks for less than the one before', () => {
    expect(PPG_ATTEMPTS[0].fps).toBe(60);
    expect(PPG_ATTEMPTS[PPG_ATTEMPTS.length - 1].width).toBeNull();
    expect(PPG_ATTEMPTS[PPG_ATTEMPTS.length - 1].fps).toBeNull();
  });
});
