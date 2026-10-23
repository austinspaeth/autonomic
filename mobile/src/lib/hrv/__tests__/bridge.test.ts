/**
 * A watch heartbeat series is cut wherever the watch lost a beat, and the
 * bands used to be resolved over the longest piece only — so five minutes
 * holding 4m 40s of clean pulse, cut three times, carried no power at all.
 * With the time each seam lost, the pieces go back on the real clock and the
 * bands are resolved across them, but only while the holes stay small.
 */
import { BRIDGE_MIN_COVERAGE, computeHrv, frequencyDomain, frequencyDomainTimed, MIN_SEC_LFHF } from '../index';

/** ~70 s pieces of a 0.1 Hz (LF) + 0.25 Hz (HF) rhythm sampled on one clock. */
function series(pieces: number, beatsPer: number, gapMs: number) {
  const rr: number[] = [];
  const starts: number[] = [];
  const gaps: number[] = [];
  let t = 0;
  for (let p = 0; p < pieces; p++) {
    if (p > 0) { starts.push(rr.length); gaps.push(gapMs); t += gapMs / 1000; }
    for (let i = 0; i < beatsPer; i++) {
      const v = 950 + 40 * Math.sin(2 * Math.PI * 0.1 * t) + 25 * Math.sin(2 * Math.PI * 0.25 * t);
      rr.push(v);
      t += v / 1000;
    }
  }
  return { rr, starts, gaps };
}

describe('bridging a watch series across its seams', () => {
  it('resolves every band when the holes are small', () => {
    const { rr, starts, gaps } = series(4, 74, 5000); // 4 x ~70 s, three 5 s holes
    const pieces = computeHrv(rr, { segmentStarts: starts });
    expect(pieces.longestCleanSec).toBeLessThan(MIN_SEC_LFHF);
    expect(pieces.fields.lowPower).toBeUndefined();

    const bridged = computeHrv(rr, { segmentStarts: starts, seamGapsMs: gaps });
    expect(bridged.bridged).toBe(true);
    expect(bridged.bandSec).toBeCloseTo(bridged.coverageSec);
    for (const k of ['vlowPower', 'lowPower', 'highPower', 'lfPeak', 'hfPeak']) expect(bridged.fields[k]).toBeDefined();
    // The time domain is still built per piece: bridging changes the bands only.
    expect(bridged.fields.rmssd).toBe(pieces.fields.rmssd);
    expect(+bridged.fields.hfPeak).toBeCloseTo(0.25, 1);
  });

  it('does not bridge holes that are a large share of the record', () => {
    const { rr, starts, gaps } = series(4, 74, 40000); // 120 s of holes in ~400 s
    const res = computeHrv(rr, { segmentStarts: starts, seamGapsMs: gaps });
    expect(res.coverageSec / (res.coverageSec + 120)).toBeLessThan(BRIDGE_MIN_COVERAGE);
    expect(res.bridged).toBe(false);
    expect(res.fields.lowPower).toBeUndefined();
  });

  it('never bridges without the seam times', () => {
    const { rr, starts } = series(4, 74, 5000);
    expect(computeHrv(rr, { segmentStarts: starts }).bridged).toBe(false);
  });

  it('matches the spliced spectrum on a record with no holes', () => {
    const { rr } = series(1, 300, 0);
    let at = 0;
    const t = rr.map((v) => (at += v) / 1000);
    const a = frequencyDomain(rr)!, b = frequencyDomainTimed(t, rr)!;
    expect(b.lowPower).toBeCloseTo(a.lowPower, 0);
    expect(b.highPower).toBeCloseTo(a.highPower, 0);
  });
});
