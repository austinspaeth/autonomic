import type { DayMatrix } from '../matrix';
import { MIN_GAP, MIN_WEEKS, WEEKS_FOR_THREE, findWeeks } from '../weeks';

/** A matrix of whole weeks, oldest first. Each week is one score held for seven
 *  days, with any other column given per week the same way. */
function matrix(scores: (number | null)[], cols: {
  outcomes?: Record<string, (number | null)[]>;
  factors?: Record<string, (number | null)[]>;
  defs?: { id: string; kind: 'binary' | 'continuous'; driver: string; group: string }[];
} = {}): DayMatrix {
  const days = <T>(perWeek: T[]): T[] => perWeek.flatMap((v) => Array(7).fill(v));
  const keys = days(scores).map((_, i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
  const spread = (o: Record<string, (number | null)[]> = {}) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, days(v)]));
  return {
    keys, logged: keys.map(() => true),
    outcomes: { score: days(scores), ...spread(cols.outcomes) },
    factors: spread(cols.factors),
    defs: (cols.defs || []) as never,
    ctx: {} as never, days: {},
  } as DayMatrix;
}

const NINE = [90, 88, 86, 75, 74, 73, 60, 58, 56];

describe('findWeeks', () => {
  it('needs enough ranked weeks to have both kinds', () => {
    const short = Array(MIN_WEEKS - 1).fill(0).map((_, i) => 90 - i * 10);
    expect(findWeeks(matrix(short, { outcomes: { rmssd: short.map((s) => s / 2) } }))).toBeNull();
  });

  it('takes two a side on a short journal and three once there is room', () => {
    const six = [90, 88, 75, 74, 60, 58];
    const rmssd = (s: number[]) => ({ outcomes: { rmssd: s.map((v) => v / 2) } });
    expect(findWeeks(matrix(six, rmssd(six)))!.best.count).toBe(2);
    expect(NINE.length).toBe(WEEKS_FOR_THREE);
    const nine = findWeeks(matrix(NINE, rmssd(NINE)))!;
    expect(nine.best.count).toBe(3);
    expect(nine.weeks.filter((w) => w.side === 'best').map((w) => w.score)).toEqual([90, 88, 86]);
    expect(nine.weeks.filter((w) => w.side === 'worst').map((w) => w.score)).toEqual([60, 58, 56]);
  });

  it('says nothing when the weeks were much alike', () => {
    const flat = NINE.map((_, i) => 70 + (i % 2) * (MIN_GAP - 1));
    expect(findWeeks(matrix(flat, { outcomes: { rmssd: flat.map((_, i) => 20 + i * 5) } }))).toBeNull();
  });

  it('leaves a week with too few scored days unranked, and keeps it on the strip', () => {
    const m = matrix(NINE, { outcomes: { rmssd: NINE.map((v) => v / 2) } });
    // The second week keeps three scored days: under the bar.
    for (let i = 10; i < 14; i++) m.outcomes.score![i] = null;
    const w = findWeeks(m)!;
    expect(w.weeks).toHaveLength(9);
    expect(w.weeks[1].score).toBeNull();
    expect(w.weeks[1].side).toBeNull();
    expect(w.best.count).toBe(2);
  });

  it('shows a metric row only past its own minDelta', () => {
    const w = findWeeks(matrix(NINE, { outcomes: {
      rmssd: [40, 40, 40, 30, 30, 30, 22, 22, 22],          // well past 10%
      restingHr: [66, 66, 66, 67, 67, 67, 67, 67, 67],      // 1 bpm, under the 3 bpm bar
    } }))!;
    expect(w.rows.map((r) => r.id)).toEqual(['rmssd']);
    expect(w.rows[0]).toMatchObject({ group: 'body', best: '40', worst: '22', unit: 'ms' });
  });

  it('prints sleep as a duration and habits as days a week', () => {
    const on = (weeks: number[]) => NINE.map((_, i) => (weeks.includes(i) ? 1 : 0));
    const w = findWeeks(matrix(NINE, {
      outcomes: { sleepDuration: [9, 9, 9, 8.5, 8.5, 8.5, 8, 8, 8] },
      factors: { 'activity:any': on([0, 1, 2, 3]), 'activity:indoorBike': on([0, 1, 2]) },
      defs: [
        { id: 'activity:any', kind: 'binary', driver: 'Any activity', group: 'activity' },
        { id: 'activity:indoorBike', kind: 'binary', driver: 'Indoor bike', group: 'activity' },
      ],
    }))!;
    expect(w.rows.find((r) => r.id === 'sleepDuration')).toMatchObject({ best: '9h', worst: '8h', unit: '' });
    expect(w.rows.find((r) => r.id === 'activity:any')).toMatchObject({ best: '7', worst: '0', unit: 'days a week' });
    expect(w.rows.find((r) => r.id === 'activity:indoorBike')).toMatchObject({ label: 'Indoor bike', best: '7', worst: '0' });
  });

  it('never reads a week from before a log began as a week without it', () => {
    // Supplements were not logged at all in the best weeks: unknown, not "off".
    const col = [null, null, null, 0, 0, 0, 1, 1, 1];
    const w = findWeeks(matrix(NINE, {
      outcomes: { rmssd: NINE.map((v) => v / 2) },
      factors: { 'med:zinc': col },
      defs: [{ id: 'med:zinc', kind: 'binary', driver: 'Zinc', group: 'supplement' }],
    }))!;
    expect(w.taking).toEqual({ best: [], worst: [], medication: false });
  });

  it('names what was taken through one set of weeks and rarely in the other', () => {
    const w = findWeeks(matrix(NINE, {
      factors: {
        'med:mag': [1, 1, 1, 1, 0, 0, 0, 0, 0],
        'med:zyrtec': [0, 0, 0, 0, 1, 1, 1, 1, 1],
        'med:daily': [1, 1, 1, 1, 1, 1, 1, 1, 1],
      },
      defs: [
        { id: 'med:mag', kind: 'binary', driver: 'Magnesium Citrate', group: 'supplement' },
        { id: 'med:zyrtec', kind: 'binary', driver: 'Zyrtec', group: 'medication' },
        { id: 'med:daily', kind: 'binary', driver: 'CoQ10', group: 'supplement' },
      ],
    }))!;
    expect(w.taking).toEqual({ best: ['Magnesium Citrate'], worst: ['Zyrtec'], medication: true });
  });

  it('returns nothing rather than an empty table', () => {
    expect(findWeeks(matrix(NINE))).toBeNull();
  });
});
