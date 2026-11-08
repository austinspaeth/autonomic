import { LOGS_SWEEP_MIN_MS, logsSweepDue, noteLogsSweep } from '../logsSweep';

const T = 1_700_000_000_000;

describe('logsSweepDue', () => {
  it('runs with nothing recorded', () => {
    expect(logsSweepDue(null, '2026-11-08', T)).toBe(true);
    expect(logsSweepDue({}, '2026-11-08', T)).toBe(true);
  });

  it('holds off for an hour, then runs', () => {
    const mem = noteLogsSweep('2026-11-08', T);
    expect(logsSweepDue(mem, '2026-11-08', T)).toBe(false);
    expect(logsSweepDue(mem, '2026-11-08', T + LOGS_SWEEP_MIN_MS - 1)).toBe(false);
    expect(logsSweepDue(mem, '2026-11-08', T + LOGS_SWEEP_MIN_MS)).toBe(true);
  });

  it('always runs on the first check of a new day', () => {
    // The day the reads are ABOUT is new, whatever the clock says.
    const mem = noteLogsSweep('2026-11-08', T);
    expect(logsSweepDue(mem, '2026-11-09', T + 60_000)).toBe(true);
  });

  it('always runs when the user asked', () => {
    // Settings -> "Check for updates" and the Journal's pull-to-refresh. An
    // explicit action bypasses the throttle, the same way the 24-hour sweep
    // ignores the pill's seen memory.
    const mem = noteLogsSweep('2026-11-08', T);
    expect(logsSweepDue(mem, '2026-11-08', T, true)).toBe(true);
    expect(logsSweepDue(mem, '2026-11-08', T + 1, true)).toBe(true);
  });

  it('reads a record with no timestamp as due rather than as fresh', () => {
    expect(logsSweepDue({ dk: '2026-11-08' }, '2026-11-08', T)).toBe(true);
  });
});

describe('noteLogsSweep', () => {
  it('stamps the day and the instant', () => {
    expect(noteLogsSweep('2026-11-08', T)).toEqual({ dk: '2026-11-08', at: T });
  });

  it('is the ONLY thing that moves the clock, so a skipped read cannot', () => {
    // The shell stamps only after a read actually went out. Asking the
    // question must never be what pushes the next sweep an hour away.
    const mem = noteLogsSweep('2026-11-08', T);
    const later = T + LOGS_SWEEP_MIN_MS / 2;
    // Asked and skipped, repeatedly: the memory is unchanged, so the hour
    // still runs from the sweep that really happened.
    expect(logsSweepDue(mem, '2026-11-08', later)).toBe(false);
    expect(mem).toEqual({ dk: '2026-11-08', at: T });
    expect(logsSweepDue(mem, '2026-11-08', T + LOGS_SWEEP_MIN_MS)).toBe(true);
  });
});
