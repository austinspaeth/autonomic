import { logTriggers, removeTriggerLog, sortedTriggerLogs, ungroupedTriggers } from '../triggerLogs';
import { migrate } from '../migrate';
import type { FoodRecord, TriggerLog } from '../types';

const food = (triggers: Record<string, number> = {}): FoodRecord => ({ water: 0, calories: 0, triggers, meals: [] });

describe('trigger groups', () => {
  it('a logged group is present in the counts every consumer reads', () => {
    const f = food();
    const logs = logTriggers(f, ['heat', 'stress'], '14:30');
    expect(f.triggers).toEqual({ heat: 1, stress: 1 });
    expect(logs.map((l) => l.types)).toEqual([['heat'], ['stress']]);
    expect(f.triggerLogs).toHaveLength(2);
  });

  it('removing a group removes its triggers, but not one another group still holds', () => {
    const f = food();
    const [heat, stress] = logTriggers(f, ['heat', 'stress'], '09:00');
    logTriggers(f, ['stress', 'alcohol'], '18:00');
    removeTriggerLog(f, heat.id);
    removeTriggerLog(f, stress.id);
    expect(f.triggers).toEqual({ stress: 1, alcohol: 1 });
    expect(f.triggerLogs).toHaveLength(2);
  });

  it('removing the last group leaves no empty list behind', () => {
    const f = food();
    const [a] = logTriggers(f, ['heat'], '09:00');
    removeTriggerLog(f, a.id);
    expect(f).toEqual(food());
  });

  it('triggers logged before groups existed are ungrouped, and survive a group delete', () => {
    const f = food({ heat: 1 });
    const [a] = logTriggers(f, ['stress'], '09:00');
    expect(ungroupedTriggers(f)).toEqual(['heat']);
    removeTriggerLog(f, a.id);
    expect(f.triggers).toEqual({ heat: 1 });
  });

  it('sorts groups by time', () => {
    const f = food();
    logTriggers(f, ['heat'], '18:00');
    logTriggers(f, ['stress'], '09:00');
    expect(sortedTriggerLogs(f).map((l) => l.time)).toEqual(['09:00', '18:00']);
  });

  it('survives migrate(), with its time and note', () => {
    const f = food();
    const log: TriggerLog = { id: 'g1', time: '14:30', types: ['heat', 'stress'] };
    f.triggers = { heat: 1, stress: 1 };
    f.triggerLogs = [log];
    log.note = 'Long walk in the sun';
    const out = migrate({ version: 1, days: { '2026-10-11': { food: f } } });
    expect(out.days['2026-10-11'].food.triggerLogs).toEqual([
      { id: log.id, time: '14:30', note: 'Long walk in the sun', types: ['heat', 'stress'] },
    ]);
    expect(out.days['2026-10-11'].food.triggers).toEqual({ heat: 1, stress: 1 });
  });

  it('migrate() drops a malformed group and re-asserts the counts for a good one', () => {
    const out = migrate({ version: 1, days: { '2026-10-11': { food: {
      triggers: {},
      triggerLogs: [{ id: 'a', types: ['heat', 7] }, { id: 'b', types: [] }, 'nope'],
    } } } });
    const f = out.days['2026-10-11'].food;
    expect(f.triggerLogs).toEqual([{ id: 'a', types: ['heat'] }]);
    expect(f.triggers).toEqual({ heat: 1 });
  });
});
