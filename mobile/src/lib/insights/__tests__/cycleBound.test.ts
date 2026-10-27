/**
 * A factor logged mostly on period days is the cycle wearing its name, and
 * must not be tested as an on/off comparison — the "ibuprofen days show lower
 * RMSSD" finding that is really the period.
 */
import { regimeFactorIds } from '../correlate';
import type { DayMatrix } from '../matrix';
import { buildCycleModel, setCycleModel, shiftDay } from '../../cycle';

const DAYS = 140;
const keys = Array.from({ length: DAYS }, (_, i) => shiftDay('2026-01-01', i));
const starts = Array.from({ length: 5 }, (_, i) => shiftDay('2026-01-01', i * 28));
const period = new Set(starts.flatMap((s) => [0, 1, 2, 3, 4].map((d) => shiftDay(s, d))));

function matrix(cols: Record<string, (dk: string, i: number) => number>): DayMatrix {
  const defs = Object.keys(cols).map((id) => ({ id, label: id, driver: id, group: 'med', kind: 'binary', lags: [0], blocks: [] }));
  return {
    keys, logged: keys.map(() => true), outcomes: {},
    factors: Object.fromEntries(Object.entries(cols).map(([id, f]) => [id, keys.map((k, i) => f(k, i))])),
    defs: defs as never, ctx: {} as never, days: {},
  } as DayMatrix;
}

const m = matrix({
  'med:ibuprofen': (dk) => (period.has(dk) ? 1 : 0),
  'med:magnesium': (_, i) => (i % 2 ? 1 : 0),
});

afterEach(() => setCycleModel(null));

it('keeps a period-day painkiller out of the sweep with tracking on', () => {
  const days = Object.fromEntries([...period].map((dk) => [dk, { cycle: { flow: 'medium' as const } }]));
  setCycleModel(buildCycleModel({ days, mode: 'regular', today: keys[DAYS - 1] }));
  const out = regimeFactorIds(m);
  expect(out.has('med:ibuprofen')).toBe(true);
  expect(out.has('med:magnesium')).toBe(false);
});

it('is a no-op with tracking off', () => {
  expect(regimeFactorIds(m).has('med:ibuprofen')).toBe(false);
});
