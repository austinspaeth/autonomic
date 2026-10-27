import { buildCycleModel, shiftDay } from '..';
import { chipLabel, forecastLine, periodPromptLine } from '../copy';
import type { CycleMode } from '../../types';

const starts = Array.from({ length: 4 }, (_, i) => shiftDay('2026-01-05', i * 28));
const days: Record<string, { cycle: { flow: 'medium' } }> = {};
starts.forEach((s) => { for (let i = 0; i < 5; i++) days[shiftDay(s, i)] = { cycle: { flow: 'medium' } }; });
const m = (mode: CycleMode, today = '2026-04-20') => buildCycleModel({ days, mode, today });

it('names a phase only where the mode allows one', () => {
  expect(chipLabel(m('regular'), '2026-04-20')).toBe('Day 22 · Luteal');
  expect(chipLabel(m('irregular'), '2026-04-20')).toBe('Day 22 since period');
  expect(chipLabel(m('contraception'), '2026-04-20')).toBeNull();
  expect(chipLabel(m('contraception'), '2026-04-01')).toBe('Bleeding day 3');
  expect(chipLabel(m('pregnant'), '2026-04-01')).toBeNull();
  expect(chipLabel(null, '2026-04-01')).toBeNull();
});

it('says a forecast is a forecast, and says late plainly', () => {
  expect(forecastLine(m('regular'))).toMatch(/^Next period predicted /);
  expect(forecastLine(m('regular', '2026-05-05'))).toMatch(/later than predicted$/);
  expect(forecastLine(m('irregular'))).toBe('Irregular or PCOS');
});

describe('period started prompt', () => {
  const predicted = '2026-04-27';
  it('asks on a predicted day with nothing logged', () => {
    const md = buildCycleModel({ days, mode: 'regular', today: predicted });
    expect(periodPromptLine(md, days, predicted)).toBe('Predicted for around today');
  });
  it('never asks again the day after a Yes', () => {
    const answered = { ...days, [predicted]: { cycle: { flow: 'medium' as const } } };
    const next = shiftDay(predicted, 1);
    const md = buildCycleModel({ days: answered, mode: 'regular', today: next });
    expect(periodPromptLine(md, answered, next)).toBeNull();
    // ...and not on the Yes day itself either.
    expect(periodPromptLine(buildCycleModel({ days: answered, mode: 'regular', today: predicted }), answered, predicted)).toBeNull();
  });
  it('counts cycle symptoms logged today as an answer', () => {
    const logged = { ...days, [predicted]: { cycle: undefined, symptoms: [{ type: 'cramps' }] } };
    const md = buildCycleModel({ days: logged, mode: 'regular', today: predicted });
    expect(periodPromptLine(md, logged, predicted)).toBeNull();
    const other = { ...days, [predicted]: { cycle: undefined, symptoms: [{ type: 'fatigue' }] } };
    expect(periodPromptLine(buildCycleModel({ days: other, mode: 'regular', today: predicted }), other, predicted)).toBe('Predicted for around today');
  });
  it('never asks on a past day or outside regular mode', () => {
    const md = buildCycleModel({ days, mode: 'regular', today: predicted });
    expect(periodPromptLine(md, days, shiftDay(predicted, -1))).toBeNull();
    expect(periodPromptLine(buildCycleModel({ days, mode: 'irregular', today: predicted }), days, predicted)).toBeNull();
  });
});
