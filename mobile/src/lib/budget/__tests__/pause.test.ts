import { addDays } from '../../dates';
import { crashIsFall, CRASH_DROP_PTS, CRASH_REL_MIN_DAYS } from '../envelope';
import {
  notePaused, pauseReasonText, pauseRunBefore, PAUSE_MEMORY_DAYS, PAUSE_RUN_MAX,
  unpausedBy, unpausedText,
} from '../pause';

const DK = '2026-09-18';
const back = (n: number) => addDays(DK, -n);
const fill = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('crashIsFall', () => {
  it('suppresses a crash that is a real drop from the usual', () => {
    expect(crashIsFall(20, fill(20, 60))).toBe(true);
  });

  it('does NOT suppress a crash-grade day at the user own floor', () => {
    // The whole point: someone whose ordinary day scores 21 has not crashed
    // at 22, and pausing there switched the feature off permanently for the
    // population it was built for.
    expect(crashIsFall(22, fill(20, 21))).toBe(false);
  });

  it('is decided by the DROP, not by how low the score is', () => {
    // Two users, identical score today; only their own history differs.
    expect(crashIsFall(18, fill(20, 18))).toBe(false);
    expect(crashIsFall(18, fill(20, 55))).toBe(true);
  });

  it('errs toward suppressing when the journal cannot answer', () => {
    // Honesty rule 5: too few days to know what usual means for this person.
    expect(crashIsFall(10, fill(CRASH_REL_MIN_DAYS - 1, 10))).toBe(true);
    expect(crashIsFall(10, [])).toBe(true);
  });

  it('uses the median, so one bad day in the window cannot flip it', () => {
    // A single 5 among twenty 21s must not drag "usual" down.
    expect(crashIsFall(21, [5, ...fill(20, 21)])).toBe(false);
  });

  it('holds the threshold exactly at CRASH_DROP_PTS', () => {
    expect(crashIsFall(40 - CRASH_DROP_PTS, fill(20, 40))).toBe(true);
    expect(crashIsFall(40 - CRASH_DROP_PTS + 1, fill(20, 40))).toBe(false);
  });
});

describe('pauseRunBefore', () => {
  it('counts consecutive paused days back from the day', () => {
    expect(pauseRunBefore(DK, [back(1), back(2), back(3)], addDays)).toBe(3);
  });

  it('stops at a gap: three pauses in a fortnight is not a feature gone quiet', () => {
    expect(pauseRunBefore(DK, [back(1), back(3), back(4)], addDays)).toBe(1);
  });

  it('ignores the day itself', () => {
    expect(pauseRunBefore(DK, [DK], addDays)).toBe(0);
  });

  it('is zero on an empty memory', () => {
    expect(pauseRunBefore(DK, [], addDays)).toBe(0);
  });
});

describe('unpausedBy', () => {
  it('opens the valve at PAUSE_RUN_MAX and not before', () => {
    expect(unpausedBy({ userAsked: false, run: PAUSE_RUN_MAX - 1 })).toBeNull();
    expect(unpausedBy({ userAsked: false, run: PAUSE_RUN_MAX })).toBe('run');
  });

  it('reports the user choice ahead of the valve, so the copy can differ', () => {
    expect(unpausedBy({ userAsked: true, run: PAUSE_RUN_MAX })).toBe('user');
    expect(unpausedBy({ userAsked: true, run: 0 })).toBe('user');
  });
});

describe('notePaused', () => {
  it('is idempotent, so a Journal that rebuilds all day records one day', () => {
    const once = notePaused([], DK);
    expect(notePaused(once, DK)).toBe(once);
  });

  it('caps the list', () => {
    let list: string[] = [];
    for (let i = 40; i >= 0; i--) list = notePaused(list, back(i));
    expect(list).toHaveLength(PAUSE_MEMORY_DAYS);
    expect(list[list.length - 1]).toBe(DK);
  });
});

describe('copy', () => {
  it('never promises the budget resumes tomorrow', () => {
    const all = (['downturn', 'crash', 'strain-alert'] as const).flatMap((r) => [
      pauseReasonText(r), pauseReasonText(r, true),
      unpausedText(r, 'user'), unpausedText(r, 'run'),
    ]);
    all.forEach((t) => expect(t.toLowerCase()).not.toContain('tomorrow'));
  });

  it('names each reason distinctly: a strain alert is not a downturn', () => {
    const d = pauseReasonText('downturn');
    const s = pauseReasonText('strain-alert');
    const c = pauseReasonText('crash');
    expect(new Set([d, s, c]).size).toBe(3);
    expect(s.toLowerCase()).not.toContain('downturn');
    expect(c.toLowerCase()).not.toContain('downturn');
  });

  it('keeps the advice on a revealed day, and never invites spending', () => {
    (['user', 'run'] as const).forEach((why) => {
      const t = unpausedText('downturn', why).toLowerCase();
      expect(t).toMatch(/rest|downturn/);
      expect(t).not.toMatch(/you can|go ahead|free to|safe to/);
    });
  });

  it('uses the past tense for a finished day', () => {
    expect(pauseReasonText('crash', true)).toContain('That day');
    expect(pauseReasonText('strain-alert', true)).toContain('that day');
  });
});
