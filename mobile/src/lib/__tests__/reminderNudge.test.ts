import {
  NUDGE_SKIP, emptyNudgeMemory, nudgeDecision, nudgeDismissed, nudgeSkipped, suggestedReminderTime,
} from '../reminderNudge';

describe('reminder nudge pacing', () => {
  it('offers on the first reading and never once the reminder is on', () => {
    expect(nudgeDecision(emptyNudgeMemory(), false)).toBe('show');
    expect(nudgeDecision(emptyNudgeMemory(), true)).toBe('never');
  });

  it('the first dismissal buys exactly ten readings of silence', () => {
    let m = nudgeDismissed(emptyNudgeMemory());
    for (let i = 0; i < NUDGE_SKIP; i += 1) {
      expect(nudgeDecision(m, false)).toBe('skip');
      m = nudgeSkipped(m);
    }
    expect(nudgeDecision(m, false)).toBe('show');
  });

  it('a second dismissal retires it for good', () => {
    let m = nudgeDismissed(emptyNudgeMemory());
    for (let i = 0; i < NUDGE_SKIP; i += 1) m = nudgeSkipped(m);
    m = nudgeDismissed(m);
    expect(nudgeDecision(m, false)).toBe('never');
    for (let i = 0; i < 50; i += 1) m = nudgeSkipped(m);
    expect(nudgeDecision(m, false)).toBe('never');
  });
});

describe('suggestedReminderTime', () => {
  it('rounds the reading to the quarter hour', () => {
    expect(suggestedReminderTime('06:34', '08:00')).toBe('06:30');
    expect(suggestedReminderTime('06:38', '08:00')).toBe('06:45');
    expect(suggestedReminderTime('07:00', '08:00')).toBe('07:00');
  });

  it('falls back outside a plausible morning, and on junk', () => {
    expect(suggestedReminderTime('21:10', '08:00')).toBe('08:00');
    expect(suggestedReminderTime('03:00', '08:00')).toBe('08:00');
    expect(suggestedReminderTime('', '08:00')).toBe('08:00');
  });
});
