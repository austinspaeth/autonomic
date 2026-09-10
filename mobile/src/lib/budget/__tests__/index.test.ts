import { addDays, todayKey } from '../../dates';
import { demoDays } from '../../demo';
import { scoreCat, type DaysMap } from '../../scoring/day';
import { dayScore } from '../../trends/metrics';
import { buildBudget, hm } from '../index';
import { outcomeOf } from '../outcome';
import type { AppState, DayLoad, DayRecord, Entry } from '../../types';

const AT_2PM = () => {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  return d;
};

const OPTS = { addDays, downturn: false, strain: null as null, stepsGranted: true };

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [], activities: [], meds: [], symptoms: [],
  food: { water: 0, meals: [], triggers: {} },
  digestion: { movements: [] },
  ...over,
} as DayRecord);

const stateOf = (days: DaysMap): AppState => ({
  version: 1,
  settings: {},
  profile: {},
  customTypes: {},
  hiddenTypes: {},
  meta: { lastUpdated: '' },
  days,
} as unknown as AppState);

/** A trusted in-app HRV reading: never filtered, however short. */
const hrv = (rmssd: number, hr = 70): Entry =>
  ({ id: `h${rmssd}-${hr}`, type: 'hrv', time: '07:30', rmssd: String(rmssd), avgHr: String(hr), sdnn: String(rmssd) } as Entry);

const resting = (hr: number): Entry => ({ id: `r${hr}`, type: 'restingHr', time: '07:00', hr: String(hr) } as Entry);

/** A stand test, which is what fits the standing band to this person. */
const stand = (delta: number): Entry =>
  ({ id: `st${delta}`, type: 'standTest', time: '08:00', baselineHr: '65', peakHr: String(65 + delta), sustainedDelta: String(delta) } as Entry);

const act = (type: string, duration: string): Entry =>
  ({ id: `${type}${duration}${Math.random()}`, type, time: '10:00', duration } as Entry);

/** A day the app can actually SEE: steps read and a full heart-rate series.
 *  Without one the engine correctly drops to low confidence and asks for
 *  steps, which is a different state from the one these tests are about. */
const seen = (over: Partial<DayLoad> = {}): DayLoad => ({
  steps: 3000, walkingMin: 30, standMin: null, stillUprightMin: null,
  uprightSpans: null, uprightByHour: null, hrAboveMin: 0, hrBands: null, hrBelowMin: null, hrBelowByHour: null, hrCoverageMin: 800, hrStretches: 0,
  longestStretch: null, peakBpm: 90, lineBpm: 100, readAt: null,
  ...over,
});

/* ------------------------------------------------------------------ *
 * The gate the plan puts before any UI: look at the numbers on the
 * demo journal and make sure they are sensible.
 * ------------------------------------------------------------------ */

describe('the demo journal, run through the real engine', () => {
  const st = stateOf(demoDays());
  const keys = Object.keys(st.days).sort();

  it('prints the 60-day table so a human can sanity-check it', () => {
    const rows = keys.map((dk) => {
      const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM(), brief: true });
      const s = dayScore(st.days[dk], dk, st.days, {});
      return {
        dk,
        grade: s == null ? '-' : scoreCat(s).short,
        env: v.envelope.effortMin,
        spend: Math.round(v.burn.effortMin),
        state: v.state,
        outcome: outcomeOf(st.days, dk, {}, addDays),
      };
    });
    const line = (r: (typeof rows)[number]) =>
      `${r.dk}  ${String(r.grade).padEnd(11)} env ${String(r.env ?? '-').padStart(4)}  spend ${String(r.spend).padStart(4)}  ${r.state.padEnd(10)} ${r.outcome}`;
    console.log('\n' + rows.map(line).join('\n') + '\n');
    expect(rows).toHaveLength(keys.length);
  });

  it('publishes NO number on a crash-grade day', () => {
    keys.forEach((dk) => {
      const s = dayScore(st.days[dk], dk, st.days, {});
      if (s == null || scoreCat(s).short !== 'Crash') return;
      const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM(), brief: true });
      expect(v.state).toBe('suppressed');
      expect(v.envelope.effortMin).toBeNull();
      expect(v.leftMin).toBeNull();
    });
  });

  it('gives a bad day a smaller budget than a good one', () => {
    const graded = keys
      .map((dk) => ({ dk, s: dayScore(st.days[dk], dk, st.days, {}) }))
      .filter((r): r is { dk: string; s: number } => r.s != null);
    const worst = graded.slice().sort((a, b) => a.s - b.s).filter((r) => scoreCat(r.s).short !== 'Crash')[0];
    const best = graded.slice().sort((a, b) => b.s - a.s)[0];
    const bad = buildBudget(st, worst.dk, {}, { ...OPTS, now: AT_2PM(), brief: true });
    const good = buildBudget(st, best.dk, {}, { ...OPTS, now: AT_2PM(), brief: true });
    expect(bad.envelope.effortMin!).toBeLessThan(good.envelope.effortMin!);
  });

  it('never spends a negative day and never renders a null as zero', () => {
    keys.forEach((dk) => {
      const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM(), brief: true });
      expect(v.burn.effortMin).toBeGreaterThanOrEqual(0);
      if (v.state === 'suppressed') {
        expect(v.figure).not.toMatch(/\d/);
      } else {
        expect(v.envelope.effortMin).toBeGreaterThan(0);
      }
    });
  });
});

/* ------------------------------------------------------------------ *
 * Day one. The whole point of the prior.
 * ------------------------------------------------------------------ */

describe('day one', () => {
  const dk = todayKey();

  it('produces a real budget from a single morning reading', () => {
    const st = stateOf({ [dk]: day({ readings: [hrv(40), resting(65)], sleep: { bed: '23:00', wake: '07:00' } }) });
    const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v.state).not.toBe('suppressed');
    expect(v.envelope.effortMin).toBeGreaterThan(0);
    expect(v.leftMin).not.toBeNull();
  });

  it('says it is Learning rather than claiming a fitted ceiling', () => {
    const st = stateOf({ [dk]: day({ readings: [hrv(40), resting(65)], sleep: { bed: '23:00', wake: '07:00' } }) });
    const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v.learning).toBe(true);
    expect(v.rightLabel).toContain('Learning');
    // And the language matches the graphic: a soft figure, not a firm one.
    expect(v.figure).toMatch(/^About /);
  });

  it('claims no hit rate from a journal with no history', () => {
    const st = stateOf({ [dk]: day({ readings: [hrv(40)] }) });
    const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v.accuracy.ready).toBe(false);
    expect(v.accuracy.of).toBe(0);
  });

  it('asks for the one most valuable missing thing, never a list', () => {
    const bare = stateOf({ [dk]: day({}) });
    const v1 = buildBudget(bare, dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v1.recommendation!.id).toBe('hrv');

    const withHrv = stateOf({ [dk]: day({ readings: [hrv(40)] }) });
    const v2 = buildBudget(withHrv, dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v2.recommendation!.id).toBe('sleep');
  });
});

/* ------------------------------------------------------------------ *
 * Learning: the figure has to MOVE toward the person.
 * ------------------------------------------------------------------ */

describe('the ceiling learns', () => {
  const dk = todayKey();

  /** A journal of `n` held days, each spending `spend` minutes of errands. */
  function heldJournal(n: number, spendMin: number): AppState {
    const days: DaysMap = {};
    for (let i = n + 3; i >= 1; i--) {
      const k = addDays(dk, -i);
      days[k] = day({
        readings: [hrv(45), resting(62)],
        sleep: { bed: '23:00', wake: '07:00' },
        activities: [act('errands', String(spendMin))],
      });
    }
    days[dk] = day({ readings: [hrv(45), resting(62)], sleep: { bed: '23:00', wake: '07:00' } });
    return stateOf(days);
  }

  it('moves toward what this person has actually been getting away with', () => {
    const light = buildBudget(heldJournal(20, 60), dk, {}, { ...OPTS, now: AT_2PM() });
    const heavy = buildBudget(heldJournal(20, 400), dk, {}, { ...OPTS, now: AT_2PM() });
    // Same readings, same grades. The only difference is how much each person
    // has survived, and the ceiling follows it.
    expect(heavy.envelope.effortMin!).toBeGreaterThan(light.envelope.effortMin!);
  });

  it('stops saying Learning once the ceiling is fitted', () => {
    const young = buildBudget(heldJournal(3, 200), dk, {}, { ...OPTS, now: AT_2PM() });
    const grown = buildBudget(heldJournal(20, 200), dk, {}, { ...OPTS, now: AT_2PM() });
    expect(young.learning).toBe(true);
    expect(grown.learning).toBe(false);
    expect(grown.rightLabel).not.toMatch(/Learning/);
  });
});

/* ------------------------------------------------------------------ *
 * The live states.
 * ------------------------------------------------------------------ */

describe('states', () => {
  const dk = todayKey();
  const wellLogged = (activities: Entry[]) => stateOf({
    ...Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        addDays(dk, -(i + 1)),
        day({
          readings: [hrv(45), resting(62)],
          sleep: { bed: '23:00', wake: '07:00' },
          activities: [act('errands', '120')],
          load: seen(),
        }),
      ]),
    ),
    [dk]: day({
      readings: [hrv(45), resting(62), stand(28)],
      sleep: { bed: '23:00', wake: '07:00' },
      activities,
      load: seen(),
    }),
  });

  it('is healthy with some in reserve when under an even day', () => {
    const v = buildBudget(wellLogged([act('walk', '20')]), dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v.state).toBe('healthy');
    expect(v.flag).toBeNull();
    expect(v.sub).toMatch(/^Pacing well for .+, with some in reserve$/);
  });

  it('goes over with a caution, never a scolding', () => {
    const v = buildBudget(wellLogged([act('strenuousWork', '400')]), dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v.state).toBe('over');
    expect(v.figure).toMatch(/^Over by /);
    expect(v.figureSub).toBe('');
    expect(v.flag).toBe('red');
    expect(v.sub).toBe('Resting now brings this back down');
    // Nothing anywhere in the over state may read as a verdict on the person.
    expect(v.sub.toLowerCase()).not.toContain('you ');
  });

  it('suppresses everything on a downturn', () => {
    const v = buildBudget(wellLogged([]), dk, {}, { ...OPTS, now: AT_2PM(), downturn: true });
    expect(v.state).toBe('suppressed');
    expect(v.envelope.effortMin).toBeNull();
    expect(v.figure).toBe('Budget paused for today');
    expect(v.recommendation).toBeNull();
  });

  it('suppresses on a strain ALERT but only narrows on a watch', () => {
    const alert = buildBudget(wellLogged([]), dk, {}, { ...OPTS, now: AT_2PM(), strain: 'alert' });
    expect(alert.state).toBe('suppressed');

    const watch = buildBudget(wellLogged([]), dk, {}, { ...OPTS, now: AT_2PM(), strain: 'watch' });
    const plain = buildBudget(wellLogged([]), dk, {}, { ...OPTS, now: AT_2PM() });
    expect(watch.state).not.toBe('suppressed');
    expect(watch.envelope.effortMin!).toBeLessThan(plain.envelope.effortMin!);
    expect(watch.envelope.reduced).toBe('strain');
  });

  it('carries yesterday overspend into today', () => {
    const days: DaysMap = {};
    for (let i = 25; i >= 1; i--) {
      days[addDays(dk, -i)] = day({
        readings: [hrv(45), resting(62)],
        sleep: { bed: '23:00', wake: '07:00' },
        activities: [act('errands', '120')],
      });
    }
    days[addDays(dk, -1)] = day({
      readings: [hrv(45), resting(62)],
      sleep: { bed: '23:00', wake: '07:00' },
      activities: [act('strenuousWork', '500')],
    });
    days[dk] = day({ readings: [hrv(45), resting(62)], sleep: { bed: '23:00', wake: '07:00' } });
    const v = buildBudget(stateOf(days), dk, {}, { ...OPTS, now: AT_2PM() });
    expect(v.envelope.reduced).toBe('carryover');
    expect(v.envelope.inputs.some((i) => i.id === 'carryover')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Honesty rules, asserted directly.
 * ------------------------------------------------------------------ */

describe('honesty rules', () => {
  const dk = todayKey();

  it('renders an unknown input as a ghost, never as zero', () => {
    const st = stateOf({ [dk]: day({ readings: [hrv(40)] }) });
    const v = buildBudget(st, dk, {}, { ...OPTS, now: AT_2PM() });
    const sleep = v.envelope.inputs.find((i) => i.id === 'sleep')!;
    expect(sleep.known).toBe(false);
    expect(sleep.value).toBeNull();
    expect(sleep.vs).toBe('Not logged today');
    expect(sleep.factor).toBe(1);
  });

  it('never writes a causal or permission-granting sentence', () => {
    const st = stateOf(demoDays());
    Object.keys(st.days).forEach((k) => {
      const v = buildBudget(st, k, {}, { ...OPTS, now: AT_2PM(), brief: true });
      const copy = `${v.figure} ${v.figureSub} ${v.sub} ${v.rightLabel || ''}`;
      expect(copy).not.toMatch(/you may|you can|you should|will cause|because you/i);
      expect(copy).not.toContain('—');
    });
  });
});

/* ------------------------------------------------------------------ *
 * A finished day reflects; it does not track.
 * ------------------------------------------------------------------ */

describe('past days', () => {
  const dk = addDays(todayKey(), -3);

  const journal = (activities: Entry[], load: DayLoad | null = seen()) => {
    const days: DaysMap = {};
    for (let i = 1; i <= 25; i++) {
      const k = addDays(dk, -i);
      days[k] = day({
        readings: [hrv(45), resting(62)],
        sleep: { bed: '23:00', wake: '07:00' },
        activities: [act('errands', '120')],
        load: seen(),
      });
    }
    days[dk] = day({
      readings: [hrv(45), resting(62), stand(28)],
      sleep: { bed: '23:00', wake: '07:00' },
      activities,
      ...(load ? { load } : {}),
    });
    // The two days after, so the day has an outcome to be judged on.
    [1, 2].forEach((n) => {
      days[addDays(dk, n)] = day({ readings: [hrv(45), resting(62)], sleep: { bed: '23:00', wake: '07:00' } });
    });
    return stateOf(days);
  };

  const build = (st: AppState) => buildBudget(st, dk, {}, {
    ...OPTS, now: new Date(`${dk}T23:59:00`), past: true,
  });

  it('reports what the day cost against what it had, not what is left', () => {
    const v = build(journal([act('errands', '90')]));
    expect(v.past).toBe(true);
    expect(v.state).toBe('final-under');
    // The figure is the SPEND; "3h 20m left" is a live quantity and means
    // nothing once the day is over.
    expect(v.figure).toBe(hm(v.burn.effortMin));
    expect(v.figureSub).toMatch(/^of /);
  });

  it('speaks in the past tense and never suggests anything', () => {
    const under = build(journal([act('errands', '90')]));
    expect(under.sub).toMatch(/^Finished .* under budget$/);
    expect(under.recommendation).toBeNull();

    const over = build(journal([act('strenuousWork', '500')]));
    expect(over.state).toBe('final-over');
    expect(over.sub).toMatch(/^Finished .* over budget$/);
    expect(over.recommendation).toBeNull();
    // Nothing on a finished card may read as advice about a day that is gone.
    [under, over].forEach((v) => {
      expect(v.sub).not.toMatch(/Todo|now|rest|Learning/i);
    });
  });

  it('drops the pace line, which has no meaning once the day has ended', () => {
    expect(build(journal([act('errands', '90')])).pace).toBeNull();
  });

  it('never offers to connect steps for a day that has already happened', () => {
    const st = journal([act('errands', '90')], null);
    const v = buildBudget(st, dk, {}, {
      ...OPTS, now: new Date(`${dk}T23:59:00`), past: true, stepsGranted: false,
    });
    expect(v.stepsMissing).toBe(false);
  });

  it('says so rather than guessing when it never saw the day', () => {
    // No activities and no health read: the spend is unknown, not zero.
    const v = build(journal([], null));
    expect(v.state).toBe('unknown');
    expect(v.sub).toBe('No pacing data for this day');
    expect(v.leftMin).toBeNull();
    expect(v.figure).toBe('');
    expect(v.recommendation).toBeNull();
  });

  it('still describes a day it only half saw, and names the gap', () => {
    // Logged activities but no health read: knowable, and honest about it.
    const v = build(journal([act('errands', '90')], null));
    expect(v.state).toBe('final-under');
    expect(v.rightLabel).toBe('Logged activities only');
  });

  /* Every string a finished day publishes. The card that opens off the strip
     renders these, and a record of last Tuesday that says "so far" or "today"
     is describing a day that is still running. */
  it('publishes no present-tense copy anywhere in the view', () => {
    const v = build(journal([act('errands', '90')]));
    const strings = [
      v.figure, v.figureSub, v.sub, v.rightLabel || '',
      ...v.burn.rows.map((r) => `${r.label} ${r.detail}`),
      ...v.envelope.inputs.map((i) => `${i.label} ${i.vs}`),
    ];
    strings.forEach((t) => {
      expect(t).not.toMatch(/so far|\btoday\b|\byet\b|this morning|last night/i);
    });
  });

  it('reports the overage on a finished day rather than a green remainder', () => {
    const v = build(journal([act('strenuousWork', '500')]));
    expect(v.state).toBe('final-over');
    expect(v.overByMin).toBeGreaterThan(0);
    expect(v.leftMin).toBeLessThan(0);
  });

  it('keeps the suppression, in the past tense', () => {
    const v = buildBudget(journal([act('errands', '90')]), dk, {}, {
      ...OPTS, now: new Date(`${dk}T23:59:00`), past: true, downturn: true,
    });
    expect(v.state).toBe('suppressed');
    expect(v.sub).not.toMatch(/tomorrow/);
  });
});
