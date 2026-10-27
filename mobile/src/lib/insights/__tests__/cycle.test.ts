import { cycleMetricValue, findCycleInsight, phaseContrast, phaseDetail } from '../cycle';
import { buildCycleModel, shiftDay } from '../../cycle';
import type { DayRecord } from '../../types';

const starts = Array.from({ length: 5 }, (_, i) => shiftDay('2026-01-05', i * 28));
const today = shiftDay(starts[4], 10);

function journal(cycles: number) {
  const days: Record<string, DayRecord> = {};
  const day = (rmssd: number, hr: number, flow?: boolean): DayRecord => ({
    sleep: { bed: '', wake: '' }, activities: [], meds: [], symptoms: [],
    readings: [{ id: Math.random().toString(), type: 'hrv', time: '07:00', rmssd: String(rmssd), avgHr: String(hr) }],
    food: { water: 0, calories: 0, triggers: {}, meals: [] }, digestion: { movements: [] },
    ...(flow ? { cycle: { flow: 'medium' as const } } : {}),
  });
  for (const s of starts.slice(0, cycles + 1)) {
    for (let i = 0; i < 28; i++) {
      const luteal = i >= 14;
      days[shiftDay(s, i)] = day(luteal ? 35 : 44, luteal ? 66 : 62, i < 5);
    }
  }
  return days;
}

it('describes the luteal side against the follicular side, in each unit', () => {
  const days = journal(4);
  const m = buildCycleModel({ days, mode: 'regular', today });
  const out = findCycleInsight(m, days, {});
  expect(out?.kind).toBe('ready');
  if (out?.kind !== 'ready') return;
  const hrv = out.rows.find((r) => r.id === 'baseline')!;
  expect(hrv.text).toBe('-9 ms');
  expect(out.rows.find((r) => r.id === 'restingHr')!.text).toBe('+4 bpm');
  expect(out.cycles).toBe(4);
});

it('reports learning below three finished cycles', () => {
  const days = journal(2);
  const m = buildCycleModel({ days, mode: 'regular', today: shiftDay(starts[2], 10) });
  expect(findCycleInsight(m, days, {})).toEqual({ kind: 'learning', have: 2, need: 3 });
});

it('claims nothing with contraception or with tracking off', () => {
  const days = journal(4);
  expect(findCycleInsight(buildCycleModel({ days, mode: 'contraception', today }), days, {})).toBeNull();
  expect(findCycleInsight(null, days, {})).toBeNull();
});

describe('the phase note', () => {
  const days = journal(4);
  const m = buildCycleModel({ days, mode: 'regular', today: shiftDay(starts[4], 20) });
  const lutDay = shiftDay(starts[4], 20);
  const value = cycleMetricValue('baseline', days, {});

  it('compares the phase with the follicular side, and is silent on the reference side', () => {
    expect(phaseContrast(m, value, lutDay)).toEqual({ phase: 'luteal', delta: -9 });
    expect(phaseContrast(m, value, shiftDay(starts[4], 10))).toBeNull();
  });

  it('carries the 30-day usual, the phase usual and where this reading sat', () => {
    const d = phaseDetail(m, value, lutDay, 30)!;
    expect(d.phaseUsual).toBe(35);
    expect(d.cycles).toBe(4);
    expect(d.vsPhase).toBe(-5);
    expect(d.usual).not.toBeNull();
    expect(d.vsUsual).toBe(30 - (d.usual as number));
  });


});
