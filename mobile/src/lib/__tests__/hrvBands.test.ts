import { fillWatchHrvBands } from '../hrvBands';
import { computeHrv } from '../hrv';
import type { AppState, Entry } from '../types';
import type { WaveformData } from '../waveforms';

function beats(n: number): number[] {
  let t = 0;
  return Array.from({ length: n }, () => {
    const v = 950 + 40 * Math.sin(2 * Math.PI * 0.1 * t) + 25 * Math.sin(2 * Math.PI * 0.25 * t);
    t += v / 1000;
    return v;
  });
}

function stateWith(r: Entry): AppState {
  return { version: 1, settings: {}, profile: {}, meta: {}, days: { '2026-10-20': { readings: [r] } } } as unknown as AppState;
}

describe('fillWatchHrvBands', () => {
  const rr = beats(296); // ~280 s
  const starts = [74, 148, 222];
  // What the old pipeline filed: time domain from the pieces, no bands.
  const filed = computeHrv(rr, { segmentStarts: starts }).fields;

  it('fills the bands an Apple Watch import is missing, and nothing else', () => {
    expect(filed.lowPower).toBeUndefined();
    const r: Entry = { id: 'a', type: 'hrv', source: 'watch', imported: true, ...filed };
    const st = stateWith(r);
    const n = fillWatchHrvBands(st, () => ({ rrRaw: rr }));
    expect(n).toBe(1);
    const out = st.days['2026-10-20'].readings![0];
    for (const k of ['vlowPower', 'lowPower', 'highPower', 'lfPeak', 'hfPeak']) expect(out[k]).toBeDefined();
    expect(out.rmssd).toBe(filed.rmssd);
    expect(out.scores).toBeDefined();
    // Idempotent.
    expect(fillWatchHrvBands(st, () => ({ rrRaw: rr }))).toBe(0);
  });

  it('uses the stored seams of an in-app watch capture', () => {
    const r: Entry = { id: 'b', type: 'breathHrv', source: 'watch', ...filed };
    const st = stateWith(r);
    expect(fillWatchHrvBands(st, () => ({ rrRaw: rr, rrSegments: starts }))).toBe(1);
    expect(st.days['2026-10-20'].readings![0].vlowPower).toBeDefined();
  });

  it('leaves other sources, bridged readings and short readings alone', () => {
    const w: WaveformData = { rrRaw: rr };
    for (const r of [
      { id: 'c', type: 'hrv', source: 'polar', ...filed },
      { id: 'd', type: 'hrv', source: 'garmin', ...filed },
    ] as Entry[]) expect(fillWatchHrvBands(stateWith(r), () => w)).toBe(0);
    const bridged = stateWith({ id: 'e', type: 'hrv', source: 'watch', ...filed } as Entry);
    expect(fillWatchHrvBands(bridged, () => ({ rrRaw: rr, rrSegments: starts, rrSeamGaps: [1, 1, 1] }))).toBe(0);
    const short = stateWith({ id: 'f', type: 'hrv', source: 'watch', rmssd: '30' } as Entry);
    expect(fillWatchHrvBands(short, () => ({ rrRaw: beats(100) }))).toBe(0);
  });

  it('never overwrites a band the reading carries', () => {
    const r: Entry = { id: 'g', type: 'hrv', source: 'watch', ...filed, lowPower: '123' };
    const st = stateWith(r);
    fillWatchHrvBands(st, () => ({ rrRaw: rr }));
    expect(st.days['2026-10-20'].readings![0].lowPower).toBe('123');
  });
});
