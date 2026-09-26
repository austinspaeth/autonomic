/**
 * beatTrace is what the summary's beat chart draws. Its one promise: it marks
 * exactly the beats the reading's numbers corrected and exactly the stretches
 * they dropped, because it runs the same per-segment pipeline computeHrv does.
 */
import { beatTrace, computeHrv } from '../index';

function wave(n: number, base = 900, seed = 1): number[] {
  let x = seed;
  const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => base + 60 * Math.sin(i / 3) + (r() - 0.5) * 20);
}

describe('beatTrace', () => {
  it('marks nothing on a clean strap trace', () => {
    const t = beatTrace(wave(300));
    expect(t.rr).toHaveLength(300);
    expect(t.corrected.some(Boolean)).toBe(false);
    expect(t.dropped.some(Boolean)).toBe(false);
  });

  it('marks an injected spike as corrected and draws its corrected value', () => {
    const rr = wave(300);
    rr[120] = 1900;
    const t = beatTrace(rr);
    expect(t.corrected[120]).toBe(true);
    expect(t.rr[120]).toBeLessThan(1200);
    expect(t.dropped.some(Boolean)).toBe(false);
  });

  it('marks a hopeless segment as dropped, and the used beats are what computeHrv kept', () => {
    // Middle segment sits at half the true rate: triage throws it away.
    const rr = [...wave(120, 900, 2), ...wave(40, 1800, 3), ...wave(120, 900, 4)];
    const starts = [120, 160];
    const t = beatTrace(rr, { segmentStarts: starts, source: 'camera' });
    const res = computeHrv(rr, { segmentStarts: starts, source: 'camera' });
    expect(t.dropped.filter(Boolean).length).toBeGreaterThan(0);
    const used = t.rr.filter((_, i) => !t.dropped[i]);
    expect(used).toEqual(res.rrClean);
  });
});
