import type { BudgetView } from '../index';
import {
  AHEAD_MIN_ELAPSED, EXERTION_REPEAT_MIN, MAX_PER_DAY, MIN_GAP_MIN,
  alertsEnabled, currentHrRun, decidePacingAlert, loggedWindows,
  type AlertMemory, type PacingAlert, type PacingAlertInput,
} from '../alerts';

const DK = '2026-09-10';
const at = (hhmm: string) => new Date(`${DK}T${hhmm}:00`);

const view = (over: Partial<BudgetView> = {}): BudgetView => ({
  state: 'healthy',
  envelope: { effortMin: 200, confidence: 'high', learning: 1 } as BudgetView['envelope'],
  burn: { effortMin: 100 } as BudgetView['burn'],
  pace: { expected: 0.5, byNowMin: 100, status: 'under', runsOutMin: null },
  accuracy: {} as BudgetView['accuracy'],
  leftMin: 100, overByMin: null, fill: 0.5,
  figure: '', figureSub: '', sub: '', flag: null, rightLabel: null,
  recommendation: null, ceilingMoved: null,
  learning: false, past: false, skeleton: false, stepsMissing: false,
  ...over,
});

const input = (over: Partial<PacingAlertInput> = {}): PacingAlertInput => ({
  dk: DK,
  now: at('14:00'),
  view: view(),
  yesterday: null,
  wakeMin: 7 * 60,
  hr: null,
  lineBpm: 95,
  activities: [],
  enabled: alertsEnabled(undefined),
  memory: null,
  crashFiredToday: false,
  ...over,
});

const over = view({ state: 'over', overByMin: 25, leftMin: -25, fill: 1.12 });
const nearly = view({ fill: 0.9, leftMin: 20, burn: { effortMin: 180 } as BudgetView['burn'] });
const ahead = view({
  state: 'ahead', fill: 0.6, leftMin: 80,
  burn: { effortMin: 120 } as BudgetView['burn'],
  pace: { expected: 0.35, byNowMin: 70, status: 'ahead', runsOutMin: 17 * 60 + 30 },
});

/** Seconds-past-midnight samples, one a minute, [fromMin, toMin]. */
const series = (fromMin: number, toMin: number, bpm: number) =>
  Array.from({ length: toMin - fromMin + 1 }, (_, i) => ({ t: (fromMin + i) * 60, bpm }));
/** Resting until 1:29pm, then 120 bpm from 1:30pm to 1:58pm. */
const hardStretch = [...series(12 * 60, 13 * 60 + 29, 60), ...series(13 * 60 + 30, 13 * 60 + 58, 120)];

const memory = (fired: AlertMemory['fired'], dk = DK): AlertMemory => ({ dk, fired });
const ms = (hhmm: string) => at(hhmm).getTime();

describe('alertsEnabled', () => {
  it('reads a kind nobody chose for as on', () => {
    expect(alertsEnabled(undefined)).toEqual({ ahead: true, nearly: true, over: true, exertion: true, easy: true });
  });

  it('keeps an explicit off', () => {
    expect(alertsEnabled({ pacingAlerts: { easy: false } }).easy).toBe(false);
    expect(alertsEnabled({ pacingAlerts: { easy: false } }).over).toBe(true);
  });

  it('lets the master switch silence every kind without forgetting them', () => {
    const off = alertsEnabled({ pacingAlertsEnabled: false, pacingAlerts: { over: true } });
    expect(Object.values(off).some(Boolean)).toBe(false);
    const back = alertsEnabled({ pacingAlertsEnabled: true, pacingAlerts: { easy: false } });
    expect(back.easy).toBe(false);
    expect(back.over).toBe(true);
  });
});

describe('decidePacingAlert', () => {
  it('says nothing on an ordinary afternoon', () => {
    expect(decidePacingAlert(input())).toBeNull();
  });

  it('tells somebody over budget by how much', () => {
    expect(decidePacingAlert(input({ view: over }))).toEqual({
      kind: 'over',
      title: "Over today's pacing budget",
      body: 'Over by 25m of your pacing budget. Resting now brings this back down.',
    });
  });

  it('fires each kind once a day', () => {
    expect(decidePacingAlert(input({ view: over, memory: memory({ over: [ms('11:00')] }) }))).toBeNull();
  });

  it('forgets yesterday at midnight', () => {
    const a = decidePacingAlert(input({ view: over, memory: memory({ over: [ms('11:00')] }, '2026-09-09') }));
    expect(a?.kind).toBe('over');
  });

  it('warns before the budget runs out, naming what is left', () => {
    expect(decidePacingAlert(input({ view: nearly }))).toEqual({
      kind: 'nearly',
      title: 'Pacing budget nearly spent',
      body: "20m left of today's 3h 20m pacing budget. A good time to slow down.",
    });
  });

  it('softens the ceiling while the budget is still learning', () => {
    const learning = view({ ...nearly, envelope: { effortMin: 200, confidence: 'medium', learning: 0.2 } as BudgetView['envelope'] });
    expect(decidePacingAlert(input({ view: learning }))!.body).toBe("20m left of today's roughly 3h 30m pacing budget. A good time to slow down.");
  });

  it('only ever escalates', () => {
    // "Over" has been said, so neither of the softer warnings may follow it.
    const said = memory({ over: [ms('10:00')] });
    expect(decidePacingAlert(input({ view: nearly, memory: said }))).toBeNull();
    expect(decidePacingAlert(input({ view: ahead, memory: said }))).toBeNull();
    // "Nearly" has been said: "ahead" is behind us, "over" is still to come.
    const nearlySaid = memory({ nearly: [ms('10:00')] });
    expect(decidePacingAlert(input({ view: ahead, memory: nearlySaid }))).toBeNull();
    expect(decidePacingAlert(input({ view: over, memory: nearlySaid }))?.kind).toBe('over');
  });

  it('keeps a gap between any two alerts', () => {
    const recent = memory({ nearly: [ms('14:00') - (MIN_GAP_MIN - 1) * 60_000] });
    expect(decidePacingAlert(input({ view: over, memory: recent }))).toBeNull();
    const later = memory({ nearly: [ms('14:00') - (MIN_GAP_MIN + 1) * 60_000] });
    expect(decidePacingAlert(input({ view: over, memory: later }))?.kind).toBe('over');
  });

  it('stops at the daily cap', () => {
    const full = memory({ ahead: [ms('09:00')], nearly: [ms('10:00')], exertion: Array(MAX_PER_DAY - 2).fill(ms('11:00')) });
    expect(decidePacingAlert(input({ view: over, memory: full }))).toBeNull();
  });

  it('is silent before wake and after the day ends', () => {
    expect(decidePacingAlert(input({ view: over, now: at('06:30') }))).toBeNull();
    expect(decidePacingAlert(input({ view: over, now: at('23:00') }))).toBeNull();
    expect(decidePacingAlert(input({ view: over, now: at('06:30'), wakeMin: 6 * 60 }))?.kind).toBe('over');
  });

  it('adds nothing on a day the crash warning already fired', () => {
    expect(decidePacingAlert(input({ view: over, crashFiredToday: true }))).toBeNull();
  });

  it('publishes no budget number on a suppressed day', () => {
    const paused = view({ state: 'suppressed', leftMin: null, overByMin: null, fill: 0, pace: null });
    expect(decidePacingAlert(input({ view: paused }))).toBeNull();
  });

  it('never fires a kind the user turned off', () => {
    expect(decidePacingAlert(input({ view: over, enabled: alertsEnabled({ pacingAlerts: { over: false } }) }))).toBeNull();
  });

  describe('ahead of pace', () => {
    it('names the time the budget runs out', () => {
      expect(decidePacingAlert(input({ view: ahead }))).toEqual({
        kind: 'ahead',
        title: 'Running ahead of pace',
        body: '2h of your pacing budget spent by 2:00pm. At this pace it runs out around 5:30pm.',
      });
    });

    it('waits for enough of the day to have a pace', () => {
      const early = at('07:00');
      early.setMinutes(AHEAD_MIN_ELAPSED - 1);
      expect(decidePacingAlert(input({ view: ahead, now: early }))).toBeNull();
    });

    it('does not call a small spend a pace', () => {
      expect(decidePacingAlert(input({ view: view({ ...ahead, fill: 0.2 }) }))).toBeNull();
    });
  });

  describe('heart rate', () => {
    it('names the bpm and how long, never "the line"', () => {
      expect(decidePacingAlert(input({ hr: hardStretch }))).toEqual({
        kind: 'exertion',
        title: 'Heart rate above 95 bpm for 28m',
        body: 'Since 1:30pm. Sitting or lying down now lets it settle.',
      });
    });

    it('needs a stretch long enough to matter', () => {
      const short = [...series(12 * 60, 13 * 60 + 44, 60), ...series(13 * 60 + 45, 13 * 60 + 58, 120)];
      expect(decidePacingAlert(input({ hr: short }))).toBeNull();
    });

    it('stays quiet when the watch has stopped reporting', () => {
      expect(decidePacingAlert(input({ hr: hardStretch, now: at('14:30') }))).toBeNull();
    });

    it('stays quiet during a workout the user logged', () => {
      const activities = loggedWindows([{ time: '13:25', duration: '40' }]);
      expect(decidePacingAlert(input({ hr: hardStretch, activities }))).toBeNull();
    });

    it('can fire twice in a day, hours apart', () => {
      const soon = memory({ exertion: [ms('14:00') - (EXERTION_REPEAT_MIN - 1) * 60_000] });
      expect(decidePacingAlert(input({ hr: hardStretch, memory: soon }))).toBeNull();
      const hoursAgo = memory({ exertion: [ms('14:00') - (EXERTION_REPEAT_MIN + 1) * 60_000] });
      expect(decidePacingAlert(input({ hr: hardStretch, memory: hoursAgo }))?.kind).toBe('exertion');
      const twice = memory({ exertion: [ms('07:30'), ms('10:31')] });
      expect(decidePacingAlert(input({ hr: hardStretch, memory: twice }))).toBeNull();
    });

    it('still speaks on a suppressed day, since it carries no budget number', () => {
      const paused = view({ state: 'suppressed', leftMin: null, fill: 0, pace: null });
      expect(decidePacingAlert(input({ view: paused, hr: hardStretch }))?.kind).toBe('exertion');
    });
  });

  describe('the morning after', () => {
    const overYesterday = view({ state: 'final-over', past: true, overByMin: 50, pace: null });

    it('nudges the morning after an over day', () => {
      expect(decidePacingAlert(input({ now: at('09:00'), yesterday: overYesterday }))).toEqual({
        kind: 'easy',
        title: 'Yesterday ran over budget',
        body: 'It finished 50m over your pacing budget. Effort often catches up a day or two later, so pace gently today.',
      });
    });

    it('is a morning thing only', () => {
      expect(decidePacingAlert(input({ now: at('13:00'), yesterday: overYesterday }))).toBeNull();
    });

    it('leaves a bad day to the downturn card', () => {
      const paused = view({ state: 'suppressed', leftMin: null, fill: 0, pace: null });
      expect(decidePacingAlert(input({ now: at('09:00'), view: paused, yesterday: overYesterday }))).toBeNull();
    });

    it('says nothing after an under-budget day', () => {
      const fine = view({ state: 'final-under', past: true, pace: null });
      expect(decidePacingAlert(input({ now: at('09:00'), yesterday: fine }))).toBeNull();
    });
  });

  it('keeps its copy plain', () => {
    const all: PacingAlert[] = [
      decidePacingAlert(input({ view: over })),
      decidePacingAlert(input({ view: nearly })),
      decidePacingAlert(input({ view: ahead })),
      decidePacingAlert(input({ hr: hardStretch })),
      decidePacingAlert(input({ now: at('09:00'), yesterday: view({ state: 'final-over', past: true, overByMin: 50 }) })),
    ].filter((a): a is PacingAlert => a != null);
    expect(all).toHaveLength(5);
    all.forEach((a) => {
      const text = `${a.title} ${a.body}`;
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(/\bline\b/i);
      // Never an invitation to spend what is left.
      expect(text).not.toMatch(/\b(still have|plenty|room to|use it)\b/i);
    });
  });
});

describe('currentHrRun', () => {
  it('ends a run at a gap in the samples', () => {
    const gapped = [...series(13 * 60, 13 * 60 + 20, 120), ...series(13 * 60 + 30, 13 * 60 + 58, 120)];
    const run = currentHrRun(gapped, 95, (14 * 60) * 60);
    expect(run?.startMin).toBe(13 * 60 + 30);
  });

  it('is null when the newest sample sits under the line', () => {
    expect(currentHrRun([...series(13 * 60, 13 * 60 + 58, 120), { t: (13 * 60 + 59) * 60, bpm: 60 }], 95, 14 * 3600)).toBeNull();
  });
});
