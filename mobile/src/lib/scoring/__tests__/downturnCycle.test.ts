/**
 * The downturn card with cycle-aware tracking on. The verdict and the crash
 * notification must fire exactly as before; only the words change, and they
 * may only call a slide "in line" when it is no deeper than the same days
 * before this person's past periods.
 */
import type { DayRecord } from '../../types';
import { detectDownturn } from '../downturn';
import { buildCycleModel, setCycleModel, shiftDay } from '../../cycle';

const day = (rmssd: number | null, flow?: boolean): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: rmssd == null ? [] : [{ id: `r${Math.random()}`, type: 'breathHrv', time: '08:00', rmssd: String(rmssd) }],
  activities: [], meds: [], symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...(flow ? { cycle: { flow: 'medium' as const } } : {}),
});

const STARTS = Array.from({ length: 5 }, (_, i) => shiftDay('2026-01-05', i * 28));
const TODAY = shiftDay(STARTS[4], 27); // the day before the forecast period

function journal(pastPremen: number, current: number[]): Record<string, DayRecord> {
  const days: Record<string, DayRecord> = {};
  for (let dk = STARTS[0]; dk <= TODAY; dk = shiftDay(dk, 1)) days[dk] = day(40);
  for (const s of STARTS) for (let i = 0; i < 4; i++) days[shiftDay(s, i)] = day(null, true);
  // The five days before each past period.
  for (const s of STARTS.slice(1)) for (let i = 1; i <= 5; i++) days[shiftDay(s, -i)] = day(pastPremen);
  current.forEach((v, i) => { days[shiftDay(TODAY, i - current.length + 1)] = day(v); });
  return days;
}

afterEach(() => setCycleModel(null));

const arm = (days: Record<string, DayRecord>) =>
  setCycleModel(buildCycleModel({ days, mode: 'regular', today: TODAY }));

it('a slide no deeper than her usual pre-period dip is attributed to the cycle', () => {
  const days = journal(25, [40, 40, 30, 25, 20]);
  const plain = detectDownturn(days, TODAY);
  expect(plain?.cause).toBe('unexplained');
  arm(days);
  const d = detectDownturn(days, TODAY);
  expect(d?.severity).toBe(plain?.severity); // the verdict is untouched
  expect(d?.cause).toBe('cycle');
  expect(d?.cycle?.verdict).toBe('typical');
  expect(d?.headline).toBe('Your score usually dips before your period. This one is in line with your last 4 cycles');
});

it('a slide deeper than her usual dip says so, louder', () => {
  const days = journal(30, [30, 25, 20, 20, 20]);
  arm(days);
  const d = detectDownturn(days, TODAY);
  expect(d?.cycle?.verdict).toBe('deeper');
  expect(d?.cause).toBe('unexplained');
  expect(d?.headline).toMatch(/^Your score is down more than in your last 4 cycles before a period/);
});

it('says nothing about the cycle with tracking off', () => {
  const d = detectDownturn(journal(25, [40, 40, 30, 25, 20]), TODAY);
  expect(d?.cycle).toBeUndefined();
});
