/**
 * PPG beat-detection tests. Fixture: a synthetic camera-brightness series — a
 * sine at a known BPM sampled at a camera frame rate (30/60 fps), optionally
 * with baseline drift and deterministic high-frequency noise. The detector
 * must (a) recover the mean RR / HR within tolerance, (b) beat frame-clock
 * quantization via sub-frame refinement, and (c) reject junk.
 */
import { assessPulse, bandpass, detectBeats, fingerPresent } from '../detect';

/** Brightness series at `fps` for `seconds`, pulsing at `bpm`. */
function makeSeries(opts: {
  bpm: number; fps: number; seconds: number;
  amplitude?: number; drift?: boolean; noise?: number;
}): { ts: number[]; vs: number[] } {
  const { bpm, fps, seconds, amplitude = 12, drift = false, noise = 0 } = opts;
  const ts: number[] = [];
  const vs: number[] = [];
  const n = Math.floor(seconds * fps);
  for (let i = 0; i < n; i++) {
    const t = (i / fps) * 1000; // ms
    let v = 150 + amplitude * Math.sin(2 * Math.PI * (bpm / 60) * (t / 1000));
    if (drift) v += 20 * Math.sin(2 * Math.PI * 0.08 * (t / 1000));
    // Deterministic pseudo-noise (no Math.random, keeps the test reproducible).
    if (noise) v += noise * Math.sin(12.9898 * i) * Math.cos(78.233 * i);
    ts.push(t);
    vs.push(v);
  }
  return { ts, vs };
}

describe('bandpass', () => {
  it('removes baseline drift but keeps the cardiac oscillation', () => {
    const { vs } = makeSeries({ bpm: 72, fps: 30, seconds: 20, drift: true });
    const f = bandpass(vs, 30);
    const m = f.reduce((s, x) => s + x, 0) / f.length;
    expect(Math.abs(m)).toBeLessThan(1); // DC + drift gone
    expect(Math.max(...f)).toBeGreaterThan(5); // pulse survives
  });
});

describe('detectBeats on a clean 30 fps sine', () => {
  const { ts, vs } = makeSeries({ bpm: 72, fps: 30, seconds: 20 });
  const { peakTimes, rr } = detectBeats(ts, vs);
  const trueRr = 60000 / 72; // 833.3 ms

  it('finds roughly one peak per beat', () => {
    expect(peakTimes.length).toBeGreaterThanOrEqual(21);
    expect(peakTimes.length).toBeLessThanOrEqual(25);
  });
  it('recovers the mean RR / HR within tolerance', () => {
    const meanRr = rr.reduce((s, x) => s + x, 0) / rr.length;
    expect(Math.abs(meanRr - trueRr)).toBeLessThan(8);
    const hr = 60000 / meanRr;
    expect(Math.abs(hr - 72)).toBeLessThan(1);
  });
  it('sub-frame refinement beats the 33 ms frame clock', () => {
    // Without interpolation, peak times quantize to the frame grid and RR
    // jitters by up to a frame; refined intervals must sit far tighter.
    rr.forEach((v) => expect(Math.abs(v - trueRr)).toBeLessThan(12));
  });
});

describe('detectBeats with drift + noise at 60 fps', () => {
  const { ts, vs } = makeSeries({ bpm: 95, fps: 60, seconds: 20, drift: true, noise: 2 });
  const { rr } = detectBeats(ts, vs);
  it('still recovers HR within a couple bpm', () => {
    const meanRr = rr.reduce((s, x) => s + x, 0) / rr.length;
    const hr = 60000 / meanRr;
    expect(Math.abs(hr - 95)).toBeLessThan(2);
  });
});

describe('detectBeats guards', () => {
  it('returns nothing for too-short input', () => {
    const { ts, vs } = makeSeries({ bpm: 72, fps: 30, seconds: 1 });
    expect(detectBeats(ts, vs).rr).toHaveLength(0);
  });
  it('returns nothing for a flat (fingerless) signal', () => {
    const ts = Array.from({ length: 150 }, (_, i) => i * 33.3);
    const vs = new Array(150).fill(40);
    expect(detectBeats(ts, vs).peakTimes).toHaveLength(0);
  });
  it('drops physiologically impossible intervals', () => {
    // 30 bpm → 2000 ms intervals, below the 42 bpm floor.
    const { ts, vs } = makeSeries({ bpm: 30, fps: 30, seconds: 20 });
    expect(detectBeats(ts, vs).rr).toHaveLength(0);
  });
});

describe('assessPulse', () => {
  it("grades a steady pulse 'good'", () => {
    const { ts, vs } = makeSeries({ bpm: 72, fps: 30, seconds: 6 });
    expect(assessPulse(ts, vs)).toBe('good');
  });
  it("grades a flat signal 'none'", () => {
    const ts = Array.from({ length: 180 }, (_, i) => i * 33.3);
    expect(assessPulse(ts, new Array(180).fill(120))).toBe('none');
  });
  it("grades an erratic signal below 'good'", () => {
    // Beat spacing that lurches between rates never settles into a rhythm.
    const ts: number[] = [];
    const vs: number[] = [];
    let t = 0;
    for (let i = 0; i < 200; i++) {
      ts.push(t);
      const rate = i % 40 < 20 ? 1.0 : 2.6; // Hz, swapping every ~0.7 s
      vs.push(150 + 12 * Math.sin(2 * Math.PI * rate * (t / 1000)) + 6 * Math.sin(17.7 * i));
      t += 33.3;
    }
    expect(assessPulse(ts, vs)).not.toBe('good');
  });
});

describe('fingerPresent', () => {
  it('accepts a bright red-dominant frame (fingertip over torch)', () => {
    expect(fingerPresent(210, 60, 40)).toBe(true);
  });
  it('rejects a dim frame and a gray scene', () => {
    expect(fingerPresent(30, 10, 8)).toBe(false); // camera covered, torch off
    expect(fingerPresent(120, 118, 115)).toBe(false); // pointing at a room
  });
});
