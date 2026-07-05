/**
 * HRV pipeline tests. Fixture: a synthetic 5-minute RR series with a known
 * mean HR, a respiratory (HF) oscillation at 0.25 Hz, and a slower LF component
 * at ~0.1 Hz. The pipeline must (a) recover physiologically sane time-domain
 * numbers, (b) place spectral peaks in the right bands, and (c) correct injected
 * artifacts. See makeFixture() below for the exact construction.
 */
import {
  breathTargetHz, coherence, computeHrv, correctArtifacts, fft, frequencyDomain,
  parseHeartRateMeasurement, resampleTachogram, timeDomain,
} from '../index';

/** Build an RR series (ms) with mean HR, HF and LF sinusoidal modulation. */
function makeFixture(): number[] {
  const meanRr = 900; // ~66.7 bpm
  const rr: number[] = [];
  let t = 0; // seconds
  // Generate ~330 s so a 300 s window is comfortably covered.
  while (t < 330) {
    const hf = 30 * Math.sin(2 * Math.PI * 0.25 * t); // respiratory, HF band
    const lf = 25 * Math.sin(2 * Math.PI * 0.1 * t); // baroreflex, LF band
    const vlf = 15 * Math.sin(2 * Math.PI * 0.02 * t);
    const val = meanRr + hf + lf + vlf;
    rr.push(val);
    t += val / 1000;
  }
  return rr;
}

describe('fft', () => {
  it('transforms a pure tone into a single bin', () => {
    const n = 64;
    const re = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 4 * i) / n));
    const { re: fr, im: fi } = fft(re, new Array(n).fill(0));
    const mags = fr.map((r, k) => Math.hypot(r, fi[k]));
    let peak = 0, peakK = 0;
    for (let k = 1; k < n / 2; k++) if (mags[k] > peak) { peak = mags[k]; peakK = k; }
    expect(peakK).toBe(4);
  });
});

describe('resampleTachogram', () => {
  it('produces evenly-spaced samples near the mean RR', () => {
    const rr = new Array(100).fill(900);
    const out = resampleTachogram(rr, 4);
    expect(out.length).toBeGreaterThan(300);
    out.forEach((v) => expect(Math.abs(v - 900)).toBeLessThan(1e-6));
  });
});

describe('time domain on the fixture', () => {
  const td = timeDomain(makeFixture())!;
  it('mean HR is physiologic (~66-67 bpm)', () => {
    expect(td.hr).toBeGreaterThan(63);
    expect(td.hr).toBeLessThan(70);
    expect(td.meanRr).toBeGreaterThan(880);
    expect(td.meanRr).toBeLessThan(920);
  });
  it('RMSSD and SDNN land in a resting-adult range', () => {
    expect(td.rmssd).toBeGreaterThan(10);
    expect(td.rmssd).toBeLessThan(120);
    expect(td.sdnn).toBeGreaterThan(10);
    expect(td.sdnn).toBeLessThan(120);
  });
  it('MxDMn is in seconds and positive', () => {
    expect(td.mxdmn).toBeGreaterThan(0);
    expect(td.mxdmn).toBeLessThan(0.5);
  });
  it('Poincaré SD1 = RMSSD/√2 and SD2 is real', () => {
    expect(td.sd1).toBeCloseTo(td.rmssd / Math.SQRT2, 5);
    expect(td.sd2).toBeGreaterThan(0);
    expect(Number.isNaN(td.sd2)).toBe(false);
  });
  it('PNS/SNS composites are finite and move in opposite directions with vagal tone', () => {
    expect(Number.isFinite(td.pns)).toBe(true);
    expect(Number.isFinite(td.sns)).toBe(true);
    // A high-RMSSD (vagal) series should read more parasympathetic than a low one.
    const calm = timeDomain(new Array(120).fill(0).map((_, i) => 950 + 40 * Math.sin(i)))!;
    const tense = timeDomain(new Array(120).fill(0).map((_, i) => 650 + 6 * Math.sin(i)))!;
    expect(calm.pns).toBeGreaterThan(tense.pns);
    expect(calm.sns).toBeLessThan(tense.sns);
  });
});

describe('frequency domain on the fixture', () => {
  const fd = frequencyDomain(makeFixture())!;
  it('HF peak lands near 0.25 Hz', () => {
    expect(fd.hfPeak).toBeGreaterThan(0.2);
    expect(fd.hfPeak).toBeLessThan(0.3);
  });
  it('LF peak lands near 0.1 Hz', () => {
    expect(fd.lfPeak).toBeGreaterThan(0.07);
    expect(fd.lfPeak).toBeLessThan(0.13);
  });
  it('total power is positive and bands sum to it', () => {
    expect(fd.totalPower).toBeGreaterThan(0);
    expect(fd.vlowPower + fd.lowPower + fd.highPower).toBeCloseTo(fd.totalPower, 3);
  });
});

describe('artifact correction', () => {
  it('flags and interpolates a spike', () => {
    const rr = new Array(40).fill(900);
    rr[20] = 1800; // dropped-beat artifact (double interval)
    const { clean, artifactPct, flags } = correctArtifacts(rr);
    expect(flags[20]).toBe(true);
    expect(artifactPct).toBeGreaterThan(0);
    expect(clean[20]).toBeCloseTo(900, 0);
  });
  it('flags out-of-range beats', () => {
    const rr = new Array(20).fill(900);
    rr[5] = 250; // > 200 bpm
    const { flags } = correctArtifacts(rr);
    expect(flags[5]).toBe(true);
  });
});

describe('computeHrv end to end', () => {
  const res = computeHrv(makeFixture(), { style: '4/5' });
  it('returns ok with mergeable string fields', () => {
    expect(res.ok).toBe(true);
    expect(res.artifactPct).toBeLessThan(5);
    expect(Number(res.fields.hr)).toBeGreaterThan(60);
    expect(Number(res.fields.rmssd)).toBeGreaterThan(0);
    expect(Number(res.fields.lfPeak)).toBeGreaterThan(0);
    expect(Number(res.fields.hfPeak)).toBeGreaterThan(0.15);
    // fields are strings (PWA-compatible)
    expect(typeof res.fields.sdnn).toBe('string');
  });
  it('fills every manual number field except device-proprietary ones', () => {
    // Auto-computed unstructured/breathing HRV fields:
    ['sdnn', 'rmssd', 'pnn50', 'meanRr', 'hr', 'avgHr', 'cv', 'mode', 'amo50', 'mxdmn',
      'stressIndex', 'pns', 'sns', 'vlowPower', 'lowPower', 'highPower', 'lfPeak', 'hfPeak', 'coherence']
      .forEach((k) => expect(res.fields[k]).toBeDefined());
    // "age" (physiological age) is a device estimate, not derivable from RR — left blank.
    expect(res.fields.age).toBeUndefined();
  });
  it('rejects an all-noise series gracefully', () => {
    const noise = Array.from({ length: 200 }, (_, i) => (i % 2 ? 400 : 1500));
    const r = computeHrv(noise);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });
});

describe('coherence', () => {
  it('is higher for a clean paced oscillation than for noise', () => {
    const fd = frequencyDomain(makeFixture())!;
    const c = coherence(fd, breathTargetHz('5/5'));
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(10);
  });
  it('breathTargetHz maps in/out seconds to frequency', () => {
    expect(breathTargetHz('4/6')).toBeCloseTo(0.1);
    expect(breathTargetHz('5/5')).toBeCloseTo(0.1);
    expect(breathTargetHz('4/4')).toBeCloseTo(0.125);
  });
});

describe('parseHeartRateMeasurement', () => {
  it('parses uint8 HR + RR intervals (1/1024 s units)', () => {
    // flags = 0x10 (RR present, uint8 HR), HR=60, one RR = 1024 -> 1000 ms
    const bytes = new Uint8Array([0x10, 60, 0x00, 0x04]);
    const { hr, rr } = parseHeartRateMeasurement(bytes);
    expect(hr).toBe(60);
    expect(rr).toHaveLength(1);
    expect(rr[0]).toBeCloseTo(1000);
  });
  it('parses uint16 HR', () => {
    // flags = 0x01 (uint16 HR), HR = 300
    const bytes = new Uint8Array([0x01, 0x2c, 0x01]);
    const { hr } = parseHeartRateMeasurement(bytes);
    expect(hr).toBe(300);
  });
  it('handles multiple RR values per notification', () => {
    const bytes = new Uint8Array([0x10, 60, 0x00, 0x04, 0x00, 0x02]);
    const { rr } = parseHeartRateMeasurement(bytes);
    expect(rr).toHaveLength(2);
  });
});
