import { CAMERA_MAX_RMSSD_SDNN, computeHrv } from '..';
import { refusalSignature } from '../refusal';

/** Seeded so a failure reproduces. */
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

/** ~5 min at 72 bpm: slow real variability (breathing + drift), plus optional
 *  random error in where each BEAT was marked (camera timing noise). */
function series(jitterMs: number, seed = 3): number[] {
  const r = rng(seed);
  const beats: number[] = [0];
  for (let i = 1; i < 360; i++) {
    const t = beats[i - 1];
    const rr = 830 + 18 * Math.sin((2 * Math.PI * t) / 4500) + 22 * Math.sin((2 * Math.PI * t) / 40000) + 4 * gauss(r);
    beats.push(t + rr);
  }
  const marked = beats.map((b) => b + jitterMs * gauss(r));
  return marked.slice(1).map((b, i) => b - marked[i]);
}

describe('camera beat-timing gate', () => {
  it('passes a camera reading with real variability and clean timing', () => {
    const res = computeHrv(series(0), { source: 'camera', durationSec: 300 });
    expect(res.time.rmssd / res.time.sdnn).toBeLessThan(CAMERA_MAX_RMSSD_SDNN);
    expect(res.jittery).toBe(false);
    expect(res.ok).toBe(true);
  });

  it('refuses a camera reading whose timing is mostly noise, and never offers it', () => {
    const res = computeHrv(series(40), { source: 'camera', durationSec: 300 });
    expect(res.time.rmssd / res.time.sdnn).toBeGreaterThan(CAMERA_MAX_RMSSD_SDNN);
    expect(res.jittery).toBe(true);
    expect(res.ok).toBe(false);
    expect(res.salvageable).toBe(false);
    expect(res.reason).toMatch(/beat timing/);
    expect(res.confidence).toBe('low');
  });

  it('leaves straps and watches alone, whatever the ratio', () => {
    for (const source of ['polar', 'watch', 'garmin']) {
      const res = computeHrv(series(40), { source, durationSec: 300 });
      expect(res.jittery).toBe(false);
    }
  });

  it('files the refusal under its own signature kind', () => {
    const sig = refusalSignature({ source: 'camera', artifactPct: 6, coverageSec: 280, durationSec: 300, hasFields: true, beats: 330, jittery: true });
    expect(sig.startsWith('camera jitter ')).toBe(true);
  });
});
