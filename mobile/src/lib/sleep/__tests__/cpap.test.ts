import { addDays } from '../../dates';
import { CPAP_INTERRUPTED_AWAKE_MIN, scoreSet, sleepGrade, sleepGradeParts, sleepInterruption } from '../../scoring/day';
import { profileCtx } from '../../scoring';
import { buildMilestoneDays } from '../../analysis/milestones';
import { buildFactors } from '../../insights/factors';
import { profileLine } from '../../analysis/reports';
import type { AppState, DayRecord } from '../../types';
import { buildSleepReport, gradeNote, gradeReasons } from '../index';

// A CPAP user's watch stages every mask adjustment as Awake, and the import
// marks any night with more than 10 minutes of it interrupted. With the switch
// on, only a long wake counts; duration and overnight HR are untouched.

type Days = Record<string, DayRecord>;
const dk = '2026-08-10';
const cpap = { cpap: true };
const day = (over: Partial<DayRecord> = {}): DayRecord => ({ readings: [], activities: [], meds: [], symptoms: [], ...over } as DayRecord);

/** 23:12 → 07:18 is an 8h06m window: stages sum to it, so they describe it. */
const staged = (awake: number, over: Record<string, unknown> = {}) => day({
  sleep: { bed: '23:12', wake: '07:18', quality: 'interrupted', stages: { deep: 90, rem: 100, core: 296 - awake, awake }, ...over } as never,
});

describe('sleepInterruption', () => {
  it('without CPAP, is the recorded flag', () => {
    const s = staged(25).sleep;
    expect(sleepInterruption(s)).toMatchObject({ interrupted: true, cpapRule: false, recorded: true });
  });

  it('with CPAP, judges the awake minutes against the bar, strictly greater', () => {
    expect(sleepInterruption(staged(25).sleep, cpap)).toMatchObject({ interrupted: false, cpapRule: true, awakeMin: 25 });
    expect(sleepInterruption(staged(CPAP_INTERRUPTED_AWAKE_MIN).sleep, cpap).interrupted).toBe(false);
    expect(sleepInterruption(staged(60).sleep, cpap).interrupted).toBe(true);
  });

  it('honours a hand-marked night with no stages', () => {
    const s = day({ sleep: { bed: '23:12', wake: '07:18', quality: 'interrupted' } as never }).sleep;
    expect(sleepInterruption(s, cpap)).toMatchObject({ interrupted: true, cpapRule: false });
  });

  it('honours the flag when the window was edited away from its stages', () => {
    const s = staged(25, { bed: '01:30' }).sleep; // window no longer matches the stage total
    expect(sleepInterruption(s, cpap)).toMatchObject({ interrupted: true, cpapRule: false });
  });
});

describe('cpap sleep grade', () => {
  it('lifts a long night of brief wakes back to great', () => {
    const days: Days = { [dk]: staged(25) };
    // At 8h+ the interrupted flag costs TWO steps: the ladder only ever
    // reaches great uninterrupted, and 7h+ interrupted is ok.
    expect(sleepGrade(days, dk)).toBe('ok');
    expect(sleepGrade(days, dk, cpap)).toBe('great');
  });

  it('still costs a step past the bar', () => {
    const days: Days = { [dk]: staged(60) };
    expect(sleepGrade(days, dk)).toBe('ok');
    expect(sleepGrade(days, dk, cpap)).toBe('ok');
  });

  it('does not touch the overnight heart rate', () => {
    expect(sleepGrade({ [dk]: staged(25, { hrLow: 78, hrHigh: 100 }) }, dk, cpap)).toBe('ok'); // two steps off great
    expect(sleepGrade({ [dk]: staged(25, { hrLow: 55, hrHigh: 120 }) }, dk, cpap)).toBe('good'); // peak costs one
  });

  it('combines with a pacemaker: low ignored, interruption judged on the bar', () => {
    const both = { cpap: true, pacemaker: true };
    expect(sleepGrade({ [dk]: staged(25, { hrLow: 78 }) }, dk, both)).toBe('great');
    expect(sleepGrade({ [dk]: staged(60, { hrLow: 78 }) }, dk, both)).toBe('ok');
  });

  it('explains itself with the awake minutes', () => {
    const under = gradeReasons({ [dk]: staged(25) }, dk, cpap)[0];
    expect(under.text).toContain('CPAP');
    expect(under.text).toContain('25m');
    expect(under.text).toContain('cost nothing');
    expect(under.cat).toBe('great');
    const over = gradeReasons({ [dk]: staged(65) }, dk, cpap)[0];
    expect(over.text).toContain('costs a step');
    expect(over.cat).toBe('ok');
    expect(gradeNote({ [dk]: staged(25, { hrLow: 55 }) }, dk, cpap)).toContain('CPAP');
    expect(gradeNote({ [dk]: staged(25, { hrLow: 55 }) }, dk)).not.toContain('CPAP');
    expect(buildSleepReport({ [dk]: staged(25) }, dk, addDays, cpap)!.cpap).toBe(true);
  });

  it('reports the recorded flag beside the graded one', () => {
    const parts = sleepGradeParts({ [dk]: staged(25) }, dk, cpap)!;
    expect(parts).toMatchObject({ interrupted: false, recordedInterrupted: true, cpapRule: true, awakeMin: 25 });
  });
});

describe('cpap reaches every reader of the flag', () => {
  it('day score: the Sleep component is 100 rather than 60', () => {
    const d = staged(25);
    const sleepP = (ctx = {}) => scoreSet([], d, dk, { [dk]: d }, ctx).comps.find((c) => c.label === 'Sleep')!.p;
    expect(sleepP()).toBe(60);
    expect(sleepP(cpap)).toBe(100);
  });

  it('milestones count the night as good sleep', () => {
    const days: Days = { [dk]: staged(25) };
    expect(buildMilestoneDays(days, {}).map[dk].sleepGood).toBe(false);
    expect(buildMilestoneDays(days, cpap).map[dk].sleepGood).toBe(true);
  });

  it('the insights factor reads the graded value', () => {
    const days: Days = { [dk]: staged(25) };
    const f = buildFactors({ days } as unknown as AppState, [dk]).find((x) => x.id === 'sleep:interrupted')!;
    expect(f.value(days[dk], dk, days, {})).toBe(1);
    expect(f.value(days[dk], dk, days, cpap)).toBe(0);
  });

  it('profileCtx carries it, and the AI profile line says so', () => {
    expect(profileCtx({ cpap: true }).cpap).toBe(true);
    expect(profileCtx({}).cpap).toBe(false);
    expect(profileLine({ sex: '', birthday: '', weight: '', height: '', cpap: true })).toContain('CPAP');
  });
});

describe('cpap explain', () => {
  it('drops ", interrupted" from the Sleep value and says why in the note', () => {
    const d = staged(25);
    const sleep = (ctx = {}) => scoreSet([], d, dk, { [dk]: d }, ctx).comps.find((c) => c.label === 'Sleep')!.detail;
    expect(sleep().value).toContain('interrupted');
    expect(sleep(cpap).value).not.toContain('interrupted');
    expect(sleep(cpap).note).toContain('CPAP');
    expect(sleep().note).not.toContain('CPAP');
  });
});
