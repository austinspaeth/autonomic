/**
 * HRV pipeline tests. Fixture: a synthetic 5-minute RR series with a known
 * mean HR, a respiratory (HF) oscillation at 0.25 Hz, and a slower LF component
 * at ~0.1 Hz. The pipeline must (a) recover physiologically sane time-domain
 * numbers, (b) place spectral peaks in the right bands, and (c) correct injected
 * artifacts. See makeFixture() below for the exact construction.
 */
import {
  computeHrv, correctArtifacts, fft, frequencyDomain,
  parseHeartRateMeasurement, repairBeats, resampleTachogram, splitSegments, std,
  timeDomain, timeDomainSegments,
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

  it('flags an entire consecutive burst (swallow / camera dropout), not just its edges', () => {
    // Three adjacent bad beats — a swallow burst. A one-pass median taken over
    // the burst is dominated by bad beats, so the middle one used to hide; the
    // iterated peel must catch all three.
    const rr = new Array(40).fill(900);
    rr[20] = 1350; rr[21] = 1400; rr[22] = 1300; // +44-56% run
    const { clean, flags } = correctArtifacts(rr);
    expect(flags[20]).toBe(true);
    expect(flags[21]).toBe(true);
    expect(flags[22]).toBe(true);
    // Interpolated back onto the ~900 baseline, so SDNN isn't blown up.
    [20, 21, 22].forEach((i) => expect(clean[i]).toBeCloseTo(900, 0));
  });

  it('preserves real respiratory sinus arrhythmia (no false positives)', () => {
    // A smooth ±12% breathing oscillation is the HRV signal itself — every beat
    // stays close to its neighbors, so nothing should flag.
    const rr = Array.from({ length: 120 }, (_, i) => 900 + 110 * Math.sin((2 * Math.PI * i) / 12));
    const { artifactPct } = correctArtifacts(rr);
    expect(artifactPct).toBe(0);
  });

  it('cleans a scattered noise cluster without touching the clean run around it', () => {
    const rr = new Array(60).fill(850);
    rr[30] = 400; rr[31] = 1300; rr[32] = 450; // erratic camera cluster
    const { clean, flags } = correctArtifacts(rr);
    expect(flags[30] && flags[31] && flags[32]).toBe(true);
    // Beats outside the cluster are untouched.
    expect(flags.filter(Boolean)).toHaveLength(3);
    [29, 33].forEach((i) => expect(clean[i]).toBe(850));
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
      'stressIndex', 'pns', 'sns', 'vlowPower', 'lowPower', 'highPower', 'lfPeak', 'hfPeak']
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

describe('repairBeats (camera missed/extra beats)', () => {
  it('splits a missed beat into two, restoring the beat count', () => {
    const rr = new Array(40).fill(800);
    rr[20] = 1600; // detector skipped a pulse → one interval spans two beats
    const out = repairBeats(rr);
    expect(out.length).toBe(41); // one beat recovered
    expect(Math.max(...out)).toBeLessThan(1000); // no double-length interval left
  });
  it('merges an extra (false) beat back into one interval', () => {
    const rr = new Array(40).fill(800);
    rr[20] = 350; rr[21] = 450; // a spurious peak split one beat into a short pair
    const out = repairBeats(rr);
    expect(out.length).toBe(39); // the false beat removed
    expect(Math.min(...out)).toBeGreaterThan(500); // no implausibly short interval left
  });
  it('leaves genuine sinus arrhythmia untouched', () => {
    const rr = Array.from({ length: 120 }, (_, i) => 900 + 110 * Math.sin((2 * Math.PI * i) / 12));
    expect(repairBeats(rr)).toEqual(rr);
  });
});

describe('computeHrv duration gating', () => {
  // ~100 s of clean beats: long enough for time-domain, too short for the bands.
  const shortRr = Array.from({ length: 130 }, (_, i) => 800 + 25 * Math.sin((2 * Math.PI * i) / 12));
  // ~180 s: LF/HF resolve, VLF (needs ~5 min) still does not.
  const midRr = Array.from({ length: 225 }, (_, i) => 800 + 30 * Math.sin((2 * Math.PI * i) / 8));

  it('keeps time-domain but omits LF/HF/VLF below ~2 minutes', () => {
    const r = computeHrv(shortRr, { source: 'camera' });
    expect(r.ok).toBe(true);
    expect(r.fields.rmssd).toBeDefined();
    expect(r.fields.pns).toBeDefined();
    expect(r.fields.lowPower).toBeUndefined();
    expect(r.fields.highPower).toBeUndefined();
    expect(r.fields.vlowPower).toBeUndefined();
  });
  it('adds LF/HF at ~3 minutes but still withholds VLF', () => {
    const r = computeHrv(midRr, { source: 'camera' });
    expect(r.fields.lowPower).toBeDefined();
    expect(r.fields.highPower).toBeDefined();
    expect(r.fields.vlowPower).toBeUndefined();
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

/**
 * Camera readings are captured as discontinuous segments and arrive with long
 * noise bursts where the pulse was lost and reacquired. These cover the three
 * defenses added for that: the wide-median burst catcher, segment-aware
 * metrics, and segment triage + coverage gating.
 */
describe('long-burst artifact detection', () => {
  it('flags a 12-beat scattered burst the local median alone cannot see', () => {
    // A burst longer than the ±3-beat local window corrupts its own baseline,
    // so every interior beat used to pass inspection and its swings went
    // straight into SDNN. The wide moving median judges each beat against ~61
    // beats, which a burst this long cannot dominate.
    const rr = new Array(180).fill(860);
    // Scattered across the detector's full 300-1430 ms output range, which is
    // what lost-signal peak detection actually produces. Deterministic.
    const scatter = [1290, 340, 980, 420, 1410, 610, 1150, 380, 890, 1360, 470, 1240];
    for (let i = 0; i < 12; i++) rr[90 + i] = scatter[i];
    const { flags, clean } = correctArtifacts(rr);
    const caught = flags.slice(90, 102).filter(Boolean).length;
    expect(caught).toBeGreaterThanOrEqual(10);
    // Which is what matters: SDNN comes back to the clean baseline instead of
    // being blown into the 90s.
    expect(std(clean)).toBeLessThan(15);
  });

  it('cannot rescue junk that happens to land near the true rate', () => {
    // The honest limit of any beat-by-beat filter. A burst that stays inside
    // ±38% of the real interval is, one beat at a time, indistinguishable from
    // a real beat — nothing downstream can recover it, which is exactly why
    // the capture-side quality gate (ppg/camera.ts) has to keep it out of the
    // array in the first place. Documented so the ceiling is not mistaken for
    // a bug later.
    const rr = new Array(180).fill(860);
    for (let i = 0; i < 12; i++) rr[90 + i] = 700 + i * 30; // 700-1030, all "plausible"
    const { flags } = correctArtifacts(rr);
    expect(flags.slice(90, 102).filter(Boolean).length).toBeLessThan(6);
  });

  it('catches a sustained half-rate latch (dicrotic notch lock-on)', () => {
    // The classic camera failure after repositioning: the detector locks onto
    // the dicrotic notch and reports ~2x the true rate for many seconds.
    const rr = new Array(200).fill(880);
    for (let i = 0; i < 15; i++) rr[100 + i] = 435;
    const { flags, clean } = correctArtifacts(rr);
    for (let i = 100; i < 115; i++) expect(flags[i]).toBe(true);
    expect(std(clean)).toBeLessThan(5); // interpolated flat, not inflated
  });

  it('still leaves deep respiratory sinus arrhythmia alone', () => {
    // ±15% swing — deeper than the ±12% case above, at the edge of what paced
    // breathing produces. The wide median must not mistake it for artifact.
    const rr = Array.from({ length: 200 }, (_, i) => 900 + 135 * Math.sin((2 * Math.PI * i) / 10));
    expect(correctArtifacts(rr).artifactPct).toBe(0);
  });
});

describe('splitSegments', () => {
  it('treats an absent/empty start list as one continuous take', () => {
    expect(splitSegments([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(splitSegments([1, 2, 3], [])).toEqual([[1, 2, 3]]);
  });
  it('splits at the given indices and ignores out-of-range ones', () => {
    expect(splitSegments([1, 2, 3, 4, 5], [2])).toEqual([[1, 2], [3, 4, 5]]);
    expect(splitSegments([1, 2, 3], [0, 99])).toEqual([[1, 2, 3]]);
  });
});

describe('segment-aware time domain', () => {
  it('matches the classic whole-array formulas for a single segment', () => {
    const rr = makeFixture();
    const flat = timeDomain(rr)!;
    const seg = timeDomainSegments([rr])!;
    expect(seg.sdnn).toBeCloseTo(flat.sdnn, 9);
    expect(seg.rmssd).toBeCloseTo(flat.rmssd, 9);
    expect(seg.pnn50).toBeCloseTo(flat.pnn50, 9);
  });

  it('does not treat a seam as a beat-to-beat difference', () => {
    // Two flat runs 300 ms apart. Across the seam that is a 300 ms "successive
    // difference" that never happened — it spans the dropout.
    const a = new Array(60).fill(800);
    const b = new Array(60).fill(1100);
    expect(timeDomain([...a, ...b])!.rmssd).toBeGreaterThan(25);
    expect(timeDomainSegments([a, b])!.rmssd).toBeCloseTo(0, 6);
  });

  it('does not charge a between-segment HR offset to variability', () => {
    // Three internally-identical segments captured at different heart rates,
    // which is what reacquiring after a dropout looks like.
    const seg = (base: number) => Array.from({ length: 60 }, (_, i) => base + 20 * Math.sin(i));
    const segs = [seg(860), seg(940), seg(800)];
    const flat = timeDomain(segs.flat())!;
    const aware = timeDomainSegments(segs)!;
    expect(flat.sdnn).toBeGreaterThan(2 * aware.sdnn);
    // Mean HR still reflects the whole reading — only the spread is scoped.
    expect(aware.hr).toBeCloseTo(flat.hr, 6);
  });
});

describe('segment triage and coverage', () => {
  const good = (n: number, base = 860) => Array.from({ length: n }, (_, i) => base + 25 * Math.sin(i));

  it('discards a stretch whose rate is nowhere near the rest of the reading', () => {
    // 40 beats at half the true interval — the detector was not tracking a pulse.
    const rr = [...good(120), ...good(40, 430)];
    const r = computeHrv(rr, { source: 'camera', segmentStarts: [120] });
    expect(r.segmentsDropped).toBe(1);
    expect(r.segmentsUsed).toBe(1);
    expect(r.rrClean.length).toBe(120);
  });

  it('discards a stretch too short to carry a statistic', () => {
    const rr = [...good(120), ...good(8)];
    const r = computeHrv(rr, { source: 'camera', segmentStarts: [120] });
    expect(r.segmentsDropped).toBe(1);
    expect(r.rrClean.length).toBe(120);
  });

  it('rejects a reading that lost most of its pulse', () => {
    const r = computeHrv(good(50), { source: 'camera', segmentStarts: [25], durationSec: 180 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/usable pulse/);
    expect(r.confidence).toBe('low');
  });

  it('gates the frequency bands on the longest UNBROKEN stretch', () => {
    // ~190 s of total coverage, but in two ~95 s pieces: LF cannot resolve.
    const piece = Array.from({ length: 120 }, (_, i) => 800 + 30 * Math.sin((2 * Math.PI * i) / 8));
    const fragmented = computeHrv([...piece, ...piece], { source: 'camera', segmentStarts: [120] });
    expect(fragmented.fields.rmssd).toBeDefined();
    expect(fragmented.fields.lowPower).toBeUndefined();
    // The same beat count in one continuous take does resolve LF/HF.
    const whole = computeHrv([...piece, ...piece], { source: 'camera' });
    expect(whole.fields.lowPower).toBeDefined();
  });

  it('reports repair rate separately so reconstruction is not hidden', () => {
    const rr = new Array(120).fill(800);
    for (let i = 0; i < 10; i++) rr[10 * i + 5] = 1600; // missed beats, repairable
    const r = computeHrv(rr, { source: 'camera' });
    expect(r.repairPct).toBeGreaterThan(5);
    expect(r.confidence).not.toBe('high');
  });

  it('leaves a clean continuous strap reading at high confidence', () => {
    const r = computeHrv(makeFixture(), { source: 'polar', durationSec: 330 });
    expect(r.ok).toBe(true);
    expect(r.confidence).toBe('high');
    expect(r.segmentsUsed).toBe(1);
    expect(r.segmentsDropped).toBe(0);
  });
});
