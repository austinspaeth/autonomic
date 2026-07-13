import { buildStandTestFields, computedMaxHr, meanBpm, potsThresholdFor, restingBaseline, type HrPoint } from '../live';

/** Flat series: `bpm` from t=from+1..to (matches the 1 Hz tick, one sample/s). */
const flat = (from: number, to: number, bpm: number): HrPoint[] => {
  const out: HrPoint[] = [];
  for (let t = from + 1; t <= to; t++) out.push({ t, bpm });
  return out;
};

describe('restingBaseline', () => {
  it('averages only the last two minutes of rest', () => {
    // 60→180 s at 70 bpm, 180→300 s at 60 bpm: window (t>180) is all 60s.
    const series = [...flat(60, 180, 70), ...flat(180, 300, 60)];
    expect(restingBaseline(series, 300)).toBe(60);
  });
  it('falls back to all rest data when the window is empty', () => {
    // Skipped ahead at t=60: nothing sits inside (endT-120, endT].
    const series = flat(0, 50, 72);
    expect(restingBaseline(series, 300)).toBe(72);
  });
  it('is null with no samples at all', () => {
    expect(restingBaseline([], 300)).toBeNull();
  });
});

describe('computedMaxHr', () => {
  it('uses Tanaka by default and Gulati for female profiles', () => {
    expect(computedMaxHr(40)).toBeCloseTo(208 - 0.7 * 40);
    expect(computedMaxHr(40, 'Female')).toBeCloseTo(206 - 0.88 * 40);
    expect(computedMaxHr(null)).toBeNull();
  });
});

describe('buildStandTestFields', () => {
  const base = { restSeconds: 300, endedEarly: false, age: 40, sex: 'Male' as string | null };

  it('computes baseline/peak/sustained from the series', () => {
    // Rest 0..300 @60, stand at 300, standing 300..900 @95 (Δ+35 sustained).
    const series = [...flat(0, 300, 60), ...flat(300, 900, 95)];
    const f = buildStandTestFields({ ...base, series, baseline: 60, standAt: 300, endT: 900 });
    expect(f.baselineHr).toBe(60);
    expect(f.peakHr).toBe(95);
    expect(f.peakDelta).toBe(35);
    expect(f.sustainedDelta).toBe(35); // last minute all at Δ+35
    expect(f.metThreshold).toBe(true); // ≥30 adult criterion
    expect(f.maxHrReached).toBe(95);
    expect(f.maxHrComputed).toBe(180);
    expect(f.endedEarly).toBeUndefined();
    expect(f.baselineUnstable).toBeUndefined();
  });

  it('sustained delta is the mean over the final minute only', () => {
    // Standing spike to 100 early, settling to 80 for the last minute.
    const series = [...flat(0, 300, 60), ...flat(300, 840, 100), ...flat(840, 900, 80)];
    const f = buildStandTestFields({ ...base, series, baseline: 60, standAt: 300, endT: 900 });
    expect(f.sustainedDelta).toBe(20);
    expect(f.peakDelta).toBe(40);
    expect(f.metThreshold).toBe(false); // sustained 20 < 30
  });

  it('applies the adolescent 40 bpm threshold', () => {
    expect(potsThresholdFor(15)).toBe(40);
    const series = [...flat(0, 300, 60), ...flat(300, 900, 95)]; // sustained +35
    const teen = buildStandTestFields({ ...base, age: 15, series, baseline: 60, standAt: 300, endT: 900 });
    expect(teen.metThreshold).toBe(false); // 35 < 40
  });

  it('flags a short resting phase and an early finish', () => {
    const series = [...flat(0, 60, 60), ...flat(60, 200, 92)];
    const f = buildStandTestFields({ ...base, restSeconds: 60, endedEarly: true, series, baseline: 60, standAt: 60, endT: 200 });
    expect(f.baselineUnstable).toBe(true);
    expect(f.endedEarly).toBe(true);
  });

  it('handles a test that never reached standing', () => {
    const series = flat(0, 120, 62);
    const f = buildStandTestFields({ ...base, series, baseline: 62, standAt: null, endT: 120, endedEarly: true });
    expect(f.peakHr).toBeUndefined();
    expect(f.sustainedDelta).toBeUndefined();
    expect(f.metThreshold).toBe(false);
    expect(f.maxHrReached).toBe(62);
  });

  it('meanBpm averages samples', () => {
    expect(meanBpm([{ t: 1, bpm: 60 }, { t: 2, bpm: 70 }])).toBe(65);
    expect(meanBpm([])).toBeNull();
  });
});
