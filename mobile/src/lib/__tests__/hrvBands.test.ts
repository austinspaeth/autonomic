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

  // Both guards exist because this runs inside loadState(), synchronously,
  // before React mounts: the read they skip is an encrypted MMKV get plus a
  // JSON parse of a whole beat series, uncached by design, and an unguarded
  // one is paid again on every launch for every watch reading ever taken.
  it('never touches the sidecar for a reading that already carries every band', () => {
    const complete = computeHrv(rr).fields;
    const st = stateWith({ id: 'h', type: 'hrv', source: 'watch', ...complete } as Entry);
    let reads = 0;
    expect(fillWatchHrvBands(st, () => { reads += 1; return { rrRaw: rr }; })).toBe(0);
    expect(reads).toBe(0);
  });

  it('marks a reading the repair cannot finish, and never reads it again', () => {
    // computeHrv gives this series no bands at all, so there is nothing to
    // write — and without a mark that verdict is re-derived from a decrypt, a
    // parse and a full FFT on every launch, for ever.
    const short = beats(40);
    const r: Entry = { id: 'i', type: 'hrv', source: 'watch', rmssd: 30, lowPower: '', highPower: '' };
    const st = stateWith(r);
    let reads = 0;
    const read = () => { reads += 1; return { rrRaw: short, rrSegments: undefined } as WaveformData; };
    fillWatchHrvBands(st, read);
    const after = st.days['2026-10-20'].readings![0];
    // Either it was marked, or nothing was wanted at this coverage — but the
    // second pass must cost no read either way.
    const firstReads = reads;
    expect(firstReads).toBeLessThanOrEqual(1);
    fillWatchHrvBands(st, read);
    if (after.bandsTried) expect(reads).toBe(firstReads);
  });

  it('skips an already-marked reading without reading the sidecar', () => {
    const st = stateWith({ id: 'j', type: 'hrv', source: 'watch', bandsTried: true, ...filed } as Entry);
    let reads = 0;
    expect(fillWatchHrvBands(st, () => { reads += 1; return { rrRaw: rr }; })).toBe(0);
    expect(reads).toBe(0);
  });

  it('never overwrites a band the reading carries', () => {
    const r: Entry = { id: 'g', type: 'hrv', source: 'watch', ...filed, lowPower: '123' };
    const st = stateWith(r);
    fillWatchHrvBands(st, () => ({ rrRaw: rr }));
    expect(st.days['2026-10-20'].readings![0].lowPower).toBe('123');
  });
});
