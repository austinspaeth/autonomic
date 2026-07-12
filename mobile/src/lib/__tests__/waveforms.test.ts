/**
 * The waveform sidecar helpers move big HRV arrays out of the journal blob
 * (see src/lib/waveforms.ts). These tests pin the contract the store relies
 * on: splitting is lossless-or-untouched, extraction is idempotent, import
 * validation rejects hostile shapes, and a legacy export round-trips through
 * migrate() → extract → export shape → import without losing waveforms.
 */
import { migrate } from '../migrate';
import type { AppState, Entry } from '../types';
import {
  collectImportWaveforms, extractWaveforms, findEmbeddedWaveform, readingIds,
  splitWaveform, type WaveformData,
} from '../waveforms';

const RR = [812, 830, 799, 845, 820];
const HR_SAMPLES = [{ t: 0, bpm: 62 }, { t: 1, bpm: 64 }];

const hrvEntry = (over: Partial<Entry> = {}): Entry => ({
  id: 'r1', type: 'hrv', time: '08:00', note: '', sdnn: '48',
  rrRaw: [...RR], rrClean: [...RR], sampledHr: [...HR_SAMPLES],
  ...over,
});

const stateWith = (readings: Entry[]): AppState =>
  migrate({ meta: { sleepReframed: true }, days: { '2026-01-01': { readings } } });

describe('splitWaveform', () => {
  it('strips all waveform fields and keeps everything else', () => {
    const { entry, waveform } = splitWaveform(hrvEntry());
    expect(entry.rrRaw).toBeUndefined();
    expect(entry.rrClean).toBeUndefined();
    expect(entry.sampledHr).toBeUndefined();
    expect(entry.id).toBe('r1');
    expect(entry.sdnn).toBe('48');
    expect(waveform).toEqual({ rrRaw: RR, sampledHr: HR_SAMPLES });
  });

  it('drops rrClean when rrRaw is present (derived, recomputed on view)', () => {
    const { waveform } = splitWaveform(hrvEntry());
    expect(waveform!.rrClean).toBeUndefined();
    expect(waveform!.rrRaw).toEqual(RR);
  });

  it('keeps rrClean when it is the only series', () => {
    const { entry, waveform } = splitWaveform(hrvEntry({ rrRaw: undefined }));
    expect(entry.rrClean).toBeUndefined();
    expect(waveform).toEqual({ rrClean: RR, sampledHr: HR_SAMPLES });
  });

  it('returns the same object untouched when there is nothing to strip', () => {
    const plain: Entry = { id: 'r2', type: 'bp', time: '09:00', sys: '110', dia: '70' };
    const { entry, waveform } = splitWaveform(plain);
    expect(entry).toBe(plain);
    expect(waveform).toBeNull();
  });

  it('strips empty arrays without storing them', () => {
    const { entry, waveform } = splitWaveform(hrvEntry({ rrRaw: [], rrClean: [], sampledHr: [] }));
    expect(entry.rrRaw).toBeUndefined();
    expect(waveform).toBeNull();
  });
});

describe('extractWaveforms', () => {
  it('moves arrays off readings into the sidecar and reports the count', () => {
    const put: Record<string, WaveformData> = {};
    const s = stateWith([hrvEntry(), { id: 'r2', type: 'bp', time: '09:00' }]);
    const moved = extractWaveforms(s, (id, data) => { put[id] = data; });
    expect(moved).toBe(1);
    expect(Object.keys(put)).toEqual(['r1']);
    expect(put.r1.rrRaw).toEqual(RR);
    expect(findEmbeddedWaveform(s)).toBeNull();
    // Metrics stay on the entry.
    expect(s.days['2026-01-01'].readings[0].sdnn).toBe('48');
  });

  it('is idempotent — a second run moves nothing', () => {
    const s = stateWith([hrvEntry()]);
    extractWaveforms(s, () => {});
    expect(extractWaveforms(s, () => { throw new Error('should not put'); })).toBe(0);
  });
});

describe('readingIds / findEmbeddedWaveform', () => {
  it('collects every reading id across days', () => {
    const s = migrate({
      meta: { sleepReframed: true },
      days: {
        '2026-01-01': { readings: [{ id: 'a', type: 'hrv' }] },
        '2026-01-02': { readings: [{ id: 'b', type: 'bp' }] },
      },
    });
    expect([...readingIds(s)].sort()).toEqual(['a', 'b']);
  });

  it('findEmbeddedWaveform names the first offender', () => {
    const s = stateWith([hrvEntry()]);
    expect(findEmbeddedWaveform(s)).toBe('2026-01-01/hrv:rrRaw');
  });
});

describe('collectImportWaveforms', () => {
  const ids = new Set(['r1']);

  it('accepts well-shaped waveforms for known readings', () => {
    const out = collectImportWaveforms({ waveforms: { r1: { rrRaw: RR } } }, ids);
    expect(out.r1).toEqual({ rrRaw: RR });
  });

  it('drops unknown ids, junk values, and non-array fields', () => {
    const out = collectImportWaveforms({
      waveforms: {
        ghost: { rrRaw: RR },          // no such reading
        r1: { rrRaw: 'nope', sampledHr: 12, rrClean: [] }, // nothing valid inside
      },
    }, ids);
    expect(out).toEqual({});
  });

  it('skips "__proto__" without polluting the output prototype', () => {
    const parsed = JSON.parse('{"waveforms": {"__proto__": {"rrRaw": [1, 2, 3]}}}');
    const out = collectImportWaveforms(parsed, new Set(['__proto__']));
    expect(Object.keys(out)).toEqual([]);
    expect(({} as Record<string, unknown>).rrRaw).toBeUndefined();
  });

  it('returns empty for files without a waveforms map', () => {
    expect(collectImportWaveforms({ days: {} }, ids)).toEqual({});
    expect(collectImportWaveforms(null, ids)).toEqual({});
    expect(collectImportWaveforms({ waveforms: [1, 2] }, ids)).toEqual({});
  });
});

describe('round trip: legacy export → sidecar → new export → import', () => {
  it('preserves waveforms and keeps the journal clean at every step', () => {
    // A legacy export with arrays embedded on the entry (pre-sidecar builds).
    const legacyExport = { meta: { sleepReframed: true }, days: { '2026-01-01': { readings: [hrvEntry()] } } };

    // Load path: migrate must let arrays through, extraction then strips them.
    const sidecar: Record<string, WaveformData> = {};
    const loaded = migrate(legacyExport);
    expect(loaded.days['2026-01-01'].readings[0].rrRaw).toEqual(RR); // pass-through contract
    extractWaveforms(loaded, (id, data) => { sidecar[id] = data; });
    expect(findEmbeddedWaveform(loaded)).toBeNull();

    // Export shape: journal + top-level waveforms map (what serializeState builds).
    const exported = JSON.parse(JSON.stringify({ ...loaded, waveforms: sidecar }));

    // Import path: state from migrate(), waveforms from the top-level map.
    const reimported = migrate(exported);
    const collected = collectImportWaveforms(exported, readingIds(reimported));
    expect(findEmbeddedWaveform(reimported)).toBeNull();
    expect(collected.r1.rrRaw).toEqual(RR);
    expect(collected.r1.sampledHr).toEqual(HR_SAMPLES);
    // The journal half survived intact.
    expect(reimported.days['2026-01-01'].readings[0].sdnn).toBe('48');
  });
});
