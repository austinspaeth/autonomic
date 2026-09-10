/**
 * The trend registry is the product — every number that leaves it becomes a
 * factual claim made to the user about their own health data — so these pin the
 * statistics and the copy, not just the branches.
 *
 * Score fixtures lean on the unstructured RMSSD bands, same as the scoring
 * tests: an 'hrv' reading with only rmssd set makes the day score exactly its
 * grade points (40→100, 30→80, 25→60, 20→35, 15→10).
 */
import type { DayRecord, Entry } from '../../types';
import { addDays } from '../../dates';
import { IMPORTED_HRV_MIN_SEC } from '../../hrvQuality';
import {
  INSIGHT_OUTCOMES, OUTCOME_FAMILY, TREND_METRICS, TREND_PRIORITY, TREND_WINDOW_DAYS, WATCH_PRIORITY,
  TREND_FAMILY_COOLDOWN_DAYS, TREND_LIVE_HOURS, TREND_MIN_DAYS_BETWEEN,
  claimTrend, compareWindows, emptyTrendMemory, findTrend, keyRange, metricSeries, phraseOf,
  trendDirection, trendGate,
  type TrendMetricId,
} from '../index';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [],
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

const DK = '2026-03-31';
const W = TREND_WINDOW_DAYS;

/** Build a 60-day map: `prior` fills the older window, `recent` the newer. */
function build(prior: (k: string) => DayRecord | null, recent: (k: string) => DayRecord | null) {
  const keys = keyRange(DK, W * 2, addDays);
  const days: Record<string, DayRecord> = {};
  keys.forEach((k, i) => {
    const d = i < W ? prior(k) : recent(k);
    if (d) days[k] = d;
  });
  return days;
}

const hrvR = (rmssd: number, over: Partial<Entry> = {}): Entry =>
  ({ id: `r${rmssd}${Math.random()}`, type: 'hrv', time: '08:00', rmssd: String(rmssd), ...over });
const hrvDay = (rmssd: number) => day({ readings: [hrvR(rmssd)] });
const rhrDay = (hr: number) => day({ readings: [{ id: `h${hr}${Math.random()}`, type: 'restingHr', time: '08:00', hr: String(hr) }] });
const sleepDay = (bed: string, wake: string) => day({ sleep: { bed, wake } });

/** Hours of sleep as a bed/wake pair starting at 23:00. */
const sleptFor = (hours: number) => {
  const mins = Math.round(hours * 60);
  const wakeH = Math.floor((23 * 60 + mins) / 60) % 24;
  const wakeM = (23 * 60 + mins) % 60;
  return sleepDay('23:00', `${String(wakeH).padStart(2, '0')}:${String(wakeM).padStart(2, '0')}`);
};

describe('compareWindows — coverage', () => {
  const def = TREND_METRICS.restingHr;

  it('returns unknown, never flat, below minPoints in the recent window', () => {
    // Huge delta, but only 2 recent points against 10 prior.
    const series = [...Array(10).fill(80), ...Array(2).fill(50)];
    const r = compareWindows(series, 2, 10, def);
    expect(r.direction).toBe('unknown');
    expect(r.significant).toBe(false);
  });

  it('returns unknown below minPoints in the PRIOR window too', () => {
    const series = [...Array(2).fill(80), ...Array(10).fill(50)];
    expect(compareWindows(series, 10, 2, def).direction).toBe('unknown');
  });

  it('counts only present days toward minPoints', () => {
    const series = [...Array(10).fill(80), ...Array(4).fill(50), null, null, null, null, null, null];
    expect(compareWindows(series, 10, 10, def).direction).toBe('unknown');
  });
});

describe('compareWindows — thresholds', () => {
  it('fires at exactly minDelta and stays silent just below it', () => {
    const def = TREND_METRICS.restingHr;                       // 3 bpm absolute
    const at = compareWindows([...Array(6).fill(65), ...Array(6).fill(62)], 6, 6, def);
    expect(at.direction).toBe('improving');
    expect(at.significant).toBe(true);

    const below = compareWindows([...Array(6).fill(65), ...Array(6).fill(62.5)], 6, 6, def);
    expect(below.direction).toBe('flat');
    expect(below.significant).toBe(false);
  });

  it('treats a relative threshold as a fraction of the prior window', () => {
    const def = TREND_METRICS.rmssd;                           // 10% relative
    const at = compareWindows([...Array(6).fill(40), ...Array(6).fill(44)], 6, 6, def);
    expect(at.direction).toBe('improving');
    const below = compareWindows([...Array(6).fill(40), ...Array(6).fill(43.9)], 6, 6, def);
    expect(below.direction).toBe('flat');
  });

  it('reads a rise in resting HR as declining — lower is better', () => {
    const def = TREND_METRICS.restingHr;
    const r = compareWindows([...Array(6).fill(60), ...Array(6).fill(70)], 6, 6, def);
    expect(r.direction).toBe('declining');
    expect(r.significant).toBe(true);
  });
});

describe('compareWindows — medians, not means', () => {
  it('one outlier cannot flip a verdict', () => {
    const def = TREND_METRICS.restingHr;
    // Both windows sit at 60. One 200 bpm artifact in the recent window would
    // drag a MEAN to ~83 and report a 23 bpm decline; the median ignores it.
    const prior = Array(10).fill(60);
    const recent = [...Array(9).fill(60), 200];
    const r = compareWindows([...prior, ...recent], 10, 10, def);
    expect(r.direction).toBe('flat');
    expect(r.recent).toBe(60);
  });
});

describe('sleepDuration — banded, not monotonic', () => {
  const def = TREND_METRICS.sleepDuration;

  it('reports nothing when 8h becomes 11h', () => {
    const r = compareWindows([...Array(10).fill(8), ...Array(10).fill(11)], 10, 10, def);
    expect(r.direction).toBe('declining');   // moved AWAY from the band
    expect(r.direction).not.toBe('improving');
  });

  it('improves when 5h becomes 7h', () => {
    const r = compareWindows([...Array(10).fill(5), ...Array(10).fill(7)], 10, 10, def);
    expect(r.direction).toBe('improving');
    expect(r.significant).toBe(true);
  });

  it('reports nothing when both windows already sit inside the band', () => {
    const r = compareWindows([...Array(10).fill(7.2), ...Array(10).fill(8.9)], 10, 10, def);
    expect(r.direction).toBe('flat');
    expect(r.significant).toBe(false);
  });
});

describe('badDays — counted, not medianed', () => {
  it('a 0/1 indicator still clears a 2-day threshold', () => {
    const def = TREND_METRICS.badDays;
    const prior = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0];   // 4 bad days
    const recent = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];  // 1 bad day
    const r = compareWindows([...prior, ...recent], 10, 10, def);
    expect(r.prior).toBe(4);
    expect(r.recent).toBe(1);
    expect(r.direction).toBe('improving');
  });
});

describe('sleepConsistency — dispersion, not level', () => {
  it('improves when the spread narrows, whatever the level', () => {
    const def = TREND_METRICS.sleepConsistency;
    const prior = [600, 700, 800, 620, 780, 660, 740, 690];   // wide
    const recent = [700, 702, 698, 701, 699, 700, 703, 697];  // tight
    const r = compareWindows([...prior, ...recent], 8, 8, def);
    expect(r.direction).toBe('improving');
    expect(r.recent).toBeLessThan(r.prior);
  });
});

describe('rmssd extraction respects the HRV trust bar', () => {
  it('ignores imported HRV under IMPORTED_HRV_MIN_SEC', () => {
    const short = day({ readings: [hrvR(60, { imported: true, durationSec: IMPORTED_HRV_MIN_SEC - 1 })] });
    const long = day({ readings: [hrvR(60, { imported: true, durationSec: IMPORTED_HRV_MIN_SEC })] });
    expect(TREND_METRICS.rmssd.value(short, DK, {}, {})).toBeNull();
    expect(TREND_METRICS.rmssd.value(long, DK, {}, {})).toBe(60);
  });

  it('never lets a passive sample fabricate a trend', () => {
    const days = build(
      () => hrvDay(30),
      () => day({ readings: [hrvR(90, { imported: true, durationSec: 60 })] }),
    );
    expect(trendDirection(days, DK, 'rmssd', W)).toBe('unknown');
  });
});

describe('findTrend', () => {
  it('returns null on a journal too thin to say anything', () => {
    const days: Record<string, DayRecord> = {};
    for (let i = 0; i < 9; i++) days[addDays(DK, -i)] = hrvDay(40);
    expect(findTrend(days, DK)).toBeNull();
  });

  it('surfaces an improvement and returns exactly one finding', () => {
    const days = build(() => hrvDay(25), () => hrvDay(40));
    const f = findTrend(days, DK);
    expect(f).not.toBeNull();
    expect(f!.metric).toBe('score');
    expect(f!.headline).toContain('since last month');
    expect(Object.keys(f!)).toEqual(['metric', 'headline', 'detail', 'delta']);
  });

  it('never reports bad news — every metric declining returns null', () => {
    const days = build(() => hrvDay(40), () => hrvDay(25));
    expect(findTrend(days, DK)).toBeNull();
  });

  it('stays silent during a downturn even when a metric improved', () => {
    // A month of steady low days, then a clear improvement... ending in a slide
    // over the last few days that detectDownturn will flag.
    const days = build(() => hrvDay(20), () => hrvDay(40));
    // Overwrite the tail with a sharp fall so today is mid-downturn.
    days[addDays(DK, -2)] = hrvDay(30);
    days[addDays(DK, -1)] = hrvDay(25);
    days[DK] = hrvDay(15);
    expect(findTrend(days, DK)).toBeNull();
  });

  it('honours TREND_PRIORITY when several metrics qualify', () => {
    // Score AND resting HR both improve; score leads the priority list.
    const days = build(
      (k) => ({ ...hrvDay(25), readings: [...hrvDay(25).readings!, { id: `p${k}`, type: 'restingHr', time: '09:00', hr: '75' }] }),
      (k) => ({ ...hrvDay(40), readings: [...hrvDay(40).readings!, { id: `r${k}`, type: 'restingHr', time: '09:00', hr: '60' }] }),
    );
    expect(findTrend(days, DK)!.metric).toBe('score');
  });

  it('builds its copy from the user\'s own numbers', () => {
    // A resting-HR reading also feeds the day score, so 'score' legitimately
    // wins the priority walk here — that is the behaviour, not a fixture bug.
    const days = build(() => rhrDay(70), () => rhrDay(60));
    const f = findTrend(days, DK);
    expect(f!.metric).toBe('score');
    expect(f!.headline).toMatch(/^Your daily scores are up [\d.]+ points on average since last month!$/);
    expect(f!.detail).toMatch(/^[\d.]+ → [\d.]+ pts · 30 scored days$/);
  });

  it('agrees in number with the figure it prints', () => {
    // "up 1 points" was on the Journal's one congratulatory card. The rounded
    // number is what the reader sees, so it is what decides the noun.
    expect(TREND_METRICS.score.phrase(1)).toBe('up 1 point');
    expect(TREND_METRICS.score.phrase(-1)).toBe('down 1 point');
    expect(TREND_METRICS.score.phrase(2.4)).toBe('up 2.4 points');
    expect(TREND_METRICS.badDays.phrase(-1)).toBe('down 1 day');
    expect(TREND_METRICS.badDays.phrase(-3)).toBe('down 3 days');
    expect(TREND_METRICS.cleanDays.phrase(1)).toBe('up 1 day');
    // A delta that ROUNDS to one is still one: 1.4 prints "1".
    expect(TREND_METRICS.symptomLoad.phrase(-1.4)).toBe('down 1 entry');
    expect(TREND_METRICS.symptomLoad.phrase(-4)).toBe('down 4 entries');
    expect(TREND_METRICS.pnn50.phrase(1)).toBe('up 1 point');
  });

  it('says "on average" for a median row and only for a median row', () => {
    // The window's number for a median row is a typical DAY, and a sentence that
    // doesn't say so reads as a claim about this morning.
    expect(phraseOf(TREND_METRICS.score, 1)).toBe('up 1 point on average');
    expect(phraseOf(TREND_METRICS.restingHr, -6)).toBe('down 6 bpm on average');
    // A count is a window TOTAL, and a stdev has no per-day value at all.
    expect(phraseOf(TREND_METRICS.badDays, -3)).toBe('down 3 days');
    expect(phraseOf(TREND_METRICS.symptomLoad, -4)).toBe('down 4 entries');
    expect(phraseOf(TREND_METRICS.sleepConsistency, -89)).toBe('much more consistent');
  });

  it('phrases resting heart rate as a fall, not a rise', () => {
    const def = TREND_METRICS.restingHr;
    expect(def.phrase(-6)).toBe('down 6 bpm');
    expect(`${def.subject} ${def.phrase(-6)} since last month`)
      .toBe('Your resting heart rate is down 6 bpm since last month');
    expect(`${def.fmt(62)} → ${def.fmt(56)} ${def.unit} · 21 ${def.countNoun}`)
      .toBe('62 → 56 bpm · 21 readings');
  });

  it('puts no number on a spread metric, and grades the word instead', () => {
    // sleepConsistency is a STDEV: its delta is a change in scatter, which is
    // not an amount of time anything moved. "Steadier by 89 min" and "swings
    // 1h 29m less" both shipped and both read as nonsense, because there is no
    // question "89 minutes" is the answer to.
    const def = TREND_METRICS.sleepConsistency;
    expect(`${def.subject} ${def.phrase(-89)} ${def.tail}!`)
      .toBe('Your bedtime is much more consistent than last month!');
    expect(def.phrase(-25)).toBe('more consistent');
    expect(def.phrase(-89)).toBe('much more consistent');
    expect(def.phrase(-140)).toBe('far more consistent');
    // Trend Watch reports declines, and the scale has to work both ways.
    expect(def.phrase(89)).toBe('much more variable');
  });

  it('closes a comparative headline with "than", not "since"', () => {
    // "...more consistent since last month" is ungrammatical; every other row
    // states a change ("up 6 bpm") and reads correctly with the default tail.
    expect(TREND_METRICS.sleepConsistency.tail).toBe('than last month');
    expect(TREND_METRICS.restingHr.tail).toBeUndefined();
  });

  it('phrases a sleep-duration gain in minutes, not decimal hours', () => {
    const def = TREND_METRICS.sleepDuration;
    expect(def.phrase(0.8)).toBe('up 48 min');
    expect(def.phrase(-1.5)).toBe('down 1h 30m');
  });

  it('skips whole families the card has already celebrated', () => {
    // Score and resting HR both improve here; score normally wins the walk.
    const days = build(() => rhrDay(70), () => rhrDay(60));
    expect(findTrend(days, DK)!.metric).toBe('score');
    // Retiring the score family must hand the slot to a DIFFERENT subject, not
    // to badDays — which is the same family and would restate the same news.
    const f = findTrend(days, DK, {}, undefined, undefined, ['score']);
    expect(f!.metric).toBe('restingHr');
    expect(OUTCOME_FAMILY[f!.metric]).not.toBe('score');
  });

  it('says nothing when every eligible family is retired', () => {
    const days = build(() => rhrDay(70), () => rhrDay(60));
    const all = TREND_PRIORITY.map((id) => OUTCOME_FAMILY[id]);
    expect(findTrend(days, DK, {}, undefined, undefined, all)).toBeNull();
  });
});

/**
 * The pacing is the whole reason the card is tolerable: on an improving journal
 * `findTrend` has an answer every single day, and the card shipped restating it
 * with a slightly different number each morning.
 */
describe('trend pacing', () => {
  const NOW = 1_800_000_000_000;
  const DAYS = (n: number) => n * 86_400_000;

  it('searches on a blank memory, excluding nothing', () => {
    expect(trendGate(emptyTrendMemory(), DK, NOW)).toEqual({ kind: 'search', exclude: [] });
  });

  it('pins the claimed headline for the rest of that day', () => {
    const m = claimTrend(emptyTrendMemory(), { metric: 'sleepConsistency', headline: 'H!', dk: DK, atMs: NOW });
    const g = trendGate(m, DK, NOW + DAYS(0.5));
    expect(g.kind).toBe('pinned');
    // The pinned copy is the string as claimed — the recomputed number never
    // reaches the screen, which is the drift the user saw (130 → 125 → 120).
    expect(g.kind === 'pinned' && g.claim.headline).toBe('H!');
  });

  it('goes quiet once the claim expires, and for a week after', () => {
    const m = claimTrend(emptyTrendMemory(), { metric: 'sleepConsistency', headline: 'H!', dk: DK, atMs: NOW });
    expect(trendGate(m, DK, NOW + DAYS(TREND_LIVE_HOURS / 24) + 1).kind).toBe('quiet');
    // ...and on any other day the user opens, immediately.
    expect(trendGate(m, addDays(DK, 1), NOW + 1000).kind).toBe('quiet');
    expect(trendGate(m, DK, NOW + DAYS(TREND_MIN_DAYS_BETWEEN) - 1).kind).toBe('quiet');
  });

  it('speaks again after a week, about a different subject', () => {
    const m = claimTrend(emptyTrendMemory(), { metric: 'sleepConsistency', headline: 'H!', dk: DK, atMs: NOW });
    const g = trendGate(m, DK, NOW + DAYS(TREND_MIN_DAYS_BETWEEN) + 1);
    expect(g).toEqual({ kind: 'search', exclude: ['sleep'] });
  });

  it('lets a subject come back after its month is up', () => {
    const m = claimTrend(emptyTrendMemory(), { metric: 'sleepConsistency', headline: 'H!', dk: DK, atMs: NOW });
    const g = trendGate(m, DK, NOW + DAYS(TREND_FAMILY_COOLDOWN_DAYS) + 1);
    expect(g).toEqual({ kind: 'search', exclude: [] });
  });

  it('keeps every family that is still inside its cooldown', () => {
    let m = claimTrend(emptyTrendMemory(), { metric: 'score', headline: 'A!', dk: DK, atMs: NOW });
    m = claimTrend(m, { metric: 'restingHr', headline: 'B!', dk: DK, atMs: NOW + DAYS(8) });
    const g = trendGate(m, DK, NOW + DAYS(16));
    expect(g.kind === 'search' && g.exclude.sort()).toEqual(['hr', 'score']);
  });

  it('treats a backwards clock as expired rather than pinning forever', () => {
    const m = claimTrend(emptyTrendMemory(), { metric: 'score', headline: 'A!', dk: DK, atMs: NOW });
    expect(trendGate(m, DK, NOW - DAYS(3)).kind).toBe('search');
  });
});

describe('trendDirection — neutral, and used by the widgets', () => {
  it('shows nothing for a 1% move', () => {
    const days = build(() => rhrDay(60), () => rhrDay(60.5));
    expect(trendDirection(days, DK, 'restingHr', W)).toBe('flat');
  });

  it('does report declines, unlike findTrend', () => {
    const days = build(() => rhrDay(60), () => rhrDay(70));
    expect(trendDirection(days, DK, 'restingHr', W)).toBe('declining');
  });

  it('is unknown on a sparse journal rather than flat', () => {
    const days: Record<string, DayRecord> = { [DK]: rhrDay(60) };
    expect(trendDirection(days, DK, 'restingHr', W)).toBe('unknown');
  });
});

describe('metricSeries', () => {
  it('is index-aligned to the keys, with null for days that say nothing', () => {
    const keys = keyRange(DK, 5, addDays);
    const days = { [keys[1]]: rhrDay(60), [keys[3]]: rhrDay(64) };
    const s = metricSeries(days, keys, ['restingHr']);
    expect(s.restingHr).toEqual([null, 60, null, 64, null]);
  });

  it('scores each day once for both score-derived metrics', () => {
    const keys = keyRange(DK, 3, addDays);
    const days = { [keys[0]]: hrvDay(40), [keys[1]]: hrvDay(15), [keys[2]]: hrvDay(40) };
    const s = metricSeries(days, keys, ['score', 'badDays']);
    expect(s.score).toEqual([100, 10, 100]);
    expect(s.badDays).toEqual([0, 1, 0]);
  });
});

/* Adding a registry entry without a test should fail here, not ship. */
describe('registry coverage', () => {
  it.each(INSIGHT_OUTCOMES)('%s declares a complete, self-consistent definition', (id: TrendMetricId) => {
    const def = TREND_METRICS[id];
    expect(def.id).toBe(id);
    expect(def.label.length).toBeGreaterThan(0);
    expect(def.subject.length).toBeGreaterThan(0);
    expect(def.countNoun.length).toBeGreaterThan(0);
    expect(def.minPoints).toBeGreaterThan(0);
    expect(def.minDelta).toBeGreaterThan(0);
    expect(['up', 'down', 'band']).toContain(def.better);
    expect(['median', 'count', 'stdev']).toContain(def.aggregate);
    if (def.better === 'band') expect(def.target).toHaveLength(2);
    // Copy must name a direction and a magnitude, with no subject in it. A
    // dispersion metric is the exception and must carry NO number: its delta is
    // a change in scatter, which no reader can picture (see sleepConsistency).
    if (def.aggregate === 'stdev') {
      expect(def.phrase(5)).not.toMatch(/\d/);
      expect(def.phrase(-5)).not.toMatch(/\d/);
    } else {
      expect(def.phrase(5)).toMatch(/\d/);
      expect(def.phrase(-5)).toMatch(/\d/);
    }
    expect(def.phrase(5)).not.toBe(def.phrase(-5));
    expect(def.fmt(7)).toMatch(/\d/);
  });

  it('lists every metric exactly once in INSIGHT_OUTCOMES', () => {
    expect(INSIGHT_OUTCOMES.slice().sort()).toEqual(Object.keys(TREND_METRICS).sort());
    expect(new Set(INSIGHT_OUTCOMES).size).toBe(INSIGHT_OUTCOMES.length);
  });

  // TREND_PRIORITY and WATCH_PRIORITY are curated subsets, not the whole table:
  // the Journal card shows one finding and Trend Watch at most five, so both are
  // edited by hand. They still may not name a metric that doesn't exist.
  it('keeps the curated subsets valid and duplicate-free', () => {
    [TREND_PRIORITY, WATCH_PRIORITY].forEach((list) => {
      expect(new Set(list).size).toBe(list.length);
      list.forEach((id) => expect(TREND_METRICS[id]).toBeTruthy());
    });
  });

  it('assigns every metric an outcome family, so findings can be deduped', () => {
    INSIGHT_OUTCOMES.forEach((id) => expect(typeof OUTCOME_FAMILY[id]).toBe('string'));
  });
});

describe('sleep fixtures round-trip through the real extractors', () => {
  it('reads duration from bed/wake', () => {
    const days = { [DK]: sleptFor(7.5) };
    expect(TREND_METRICS.sleepDuration.value(days[DK], DK, days, {})).toBeCloseTo(7.5, 5);
  });

  it('maps bedtime to minutes past noon so midnight does not wrap', () => {
    const late = TREND_METRICS.sleepConsistency.value(sleepDay('23:30', '07:00'), DK, {}, {})!;
    const past = TREND_METRICS.sleepConsistency.value(sleepDay('00:30', '08:00'), DK, {}, {})!;
    expect(past - late).toBe(60);
  });
});
