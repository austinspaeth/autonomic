/**
 * ECG metric tests. Fixtures are synthetic single-lead waveforms built from
 * Gaussian P/Q/R/S/T deflections at a known heart rate, so we can check that
 * R-peak detection recovers the right HR and beat count, that HRV responds to
 * RR variability, that a premature beat is flagged as ectopic, and that the
 * (approximate) interval estimates stay inside their physiologic clamps.
 */
import { computeEcgMetrics, RawEcgSample } from '../ecgMetrics';

const FS = 512;

const gauss = (t: number, c: number, amp: number, w: number) =>
  amp * Math.exp(-((t - c) ** 2) / (2 * w * w));

/** Build a lead-I µV waveform whose R peaks sit at the given times (seconds). */
function synthEcg(rTimes: number[], durationSec: number): number[] {
  const n = Math.round(durationSec * FS);
  const v = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    let s = 0;
    for (const tr of rTimes) {
      if (Math.abs(t - tr) > 0.5) continue; // only nearby beats matter
      s += gauss(t, tr - 0.16, 150, 0.018);  // P
      s += gauss(t, tr - 0.02, -120, 0.008); // Q
      s += gauss(t, tr, 1100, 0.008);        // R
      s += gauss(t, tr + 0.02, -260, 0.008); // S
      s += gauss(t, tr + 0.30, 320, 0.040);  // T
    }
    v[i] = s;
  }
  return v;
}

function sample(rTimes: number[], durationSec: number, extra: Partial<RawEcgSample> = {}): RawEcgSample {
  const voltages = synthEcg(rTimes, durationSec);
  return {
    uuid: 'test',
    start: 0,
    end: durationSec * 1000,
    classification: 'sinusRhythm',
    symptomsStatus: 'none',
    numberOfVoltageMeasurements: voltages.length,
    samplingFrequency: FS,
    voltages,
    ...extra,
  };
}

/** Evenly-spaced R peaks at the given RR (seconds). */
function regular(rrSec: number, durationSec: number): number[] {
  const times: number[] = [];
  for (let t = 0.5; t < durationSec - 0.5; t += rrSec) times.push(t);
  return times;
}

describe('computeEcgMetrics', () => {
  it('recovers heart rate and beat count from a clean 60 bpm strip', () => {
    const m = computeEcgMetrics(sample(regular(1.0, 30), 30));
    expect(m.hr).toBeGreaterThanOrEqual(57);
    expect(m.hr).toBeLessThanOrEqual(63);
    expect(m.beats).toBeGreaterThanOrEqual(27);
    expect(m.sdnn).not.toBeNull();
    expect(m.sdnn as number).toBeLessThan(30); // near-constant RR → low SDNN
    expect(m.ectopic).toBe(0);
    expect(m.classification).toBe('sinusRhythm');
  });

  it('recovers a faster rate (100 bpm)', () => {
    const m = computeEcgMetrics(sample(regular(0.6, 30), 30));
    expect(m.hr).toBeGreaterThanOrEqual(95);
    expect(m.hr).toBeLessThanOrEqual(105);
  });

  it('reflects RR variability in SDNN', () => {
    // Alternate RR 0.9 / 1.1 s → mean 1.0 s (60 bpm) but real beat-to-beat spread.
    const times: number[] = [];
    let t = 0.6;
    let i = 0;
    while (t < 29.5) { times.push(t); t += i % 2 === 0 ? 0.9 : 1.1; i++; }
    const m = computeEcgMetrics(sample(times, 30));
    expect(m.hr).toBeGreaterThanOrEqual(56);
    expect(m.hr).toBeLessThanOrEqual(64);
    expect(m.sdnn as number).toBeGreaterThan(50); // ±100 ms swing
  });

  it('flags a premature (ectopic) beat', () => {
    const times = regular(1.0, 30);
    // Insert an early beat 0.45 s after the 10th beat (well under 0.8×median RR).
    times.splice(10, 0, times[9] + 0.45);
    const m = computeEcgMetrics(sample(times.sort((a, b) => a - b), 30));
    expect(m.ectopic).toBeGreaterThanOrEqual(1);
  });

  it('keeps interval estimates within physiologic clamps (or null)', () => {
    const m = computeEcgMetrics(sample(regular(1.0, 30), 30));
    for (const val of [m.qrs, m.qtc, m.pr]) {
      if (val != null) expect(Number.isFinite(val)).toBe(true);
    }
    if (m.qrs != null) { expect(m.qrs).toBeGreaterThanOrEqual(40); expect(m.qrs).toBeLessThanOrEqual(200); }
    if (m.qtc != null) { expect(m.qtc).toBeGreaterThanOrEqual(300); expect(m.qtc).toBeLessThanOrEqual(650); }
    if (m.pr != null) { expect(m.pr).toBeGreaterThanOrEqual(80); expect(m.pr).toBeLessThanOrEqual(320); }
  });

  it('falls back to Apple average HR when the waveform is too short', () => {
    const m = computeEcgMetrics({
      uuid: 'x', start: 0, end: 1000, classification: 'sinusRhythm', symptomsStatus: 'none',
      numberOfVoltageMeasurements: 10, samplingFrequency: FS, voltages: [1, 2, 3], averageHeartRate: 72,
    });
    expect(m.hr).toBe(72);
    expect(m.beats).toBe(0);
  });
});
