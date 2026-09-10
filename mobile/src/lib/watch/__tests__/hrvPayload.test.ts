import { mapHrvPayload, mapWatchPayload } from '../payload';

/**
 * The Garmin watch is the only companion that sends RAW beat-to-beat data, so
 * this mapper is the one place a foreign RR series enters the journal. The
 * guards below are the ones that keep a bad series from being scored as if it
 * were a clean seated reading.
 */

// ~65 bpm with real variation, long enough to be a plausible reading.
const rr = Array.from({ length: 300 }, (_, i) => 900 + ((i * 37) % 61) - 30);

const base = () => ({
  id: 'garmin-1',
  type: 'hrv',
  schemaVersion: 1,
  time: '2026-07-12T09:30:00',
  elapsedSec: 300,
  rrMs: rr,
  device: 'venu4',
});

describe('mapHrvPayload', () => {
  it('maps a Garmin reading onto the hrv reading type', () => {
    const m = mapHrvPayload(base());
    expect(m).not.toBeNull();
    expect(m!.entry.type).toBe('hrv');
    expect(m!.entry.id).toBe('garmin-1');
    expect(m!.entry.source).toBe('garmin');
    expect(m!.dayKey).toBe('2026-07-12');
  });

  it('logs the time the reading happened, in local time', () => {
    // The payload carries no timezone on purpose: the watch and the phone are
    // in the same place, so a bare date-time must read as local on both sides.
    const m = mapHrvPayload(base());
    expect(m!.entry.time).toBe('09:30');
  });

  it('computes HRV fields from the raw series rather than trusting the watch', () => {
    const m = mapHrvPayload(base());
    // The whole point of shipping RR rather than summary stats: the same
    // pipeline a strap capture uses produces the numbers.
    expect(m!.entry.rmssd).toBeDefined();
    expect(m!.entry.sdnn).toBeDefined();
  });

  it('sends the RR series to the waveform sidecar, never the journal entry', () => {
    const m = mapHrvPayload(base());
    expect(m!.waveform?.rrRaw).toHaveLength(rr.length);
    // An inline waveform in the journal is the thing the store explicitly bans.
    expect((m!.entry as Record<string, unknown>).rrRaw).toBeUndefined();
  });

  it("stamps durationSec from the watch's elapsed time, not the RR sum", () => {
    // A shortfall between the two IS the dropped-beat signal; inferring
    // duration from the sum would erase the evidence.
    const short = { ...base(), elapsedSec: 600 };
    expect(mapHrvPayload(short)!.entry.durationSec).toBe(600);
  });

  it('falls back to the RR sum when the watch sent no elapsed time', () => {
    const noElapsed: Record<string, unknown> = { ...base() };
    delete noElapsed.elapsedSec;
    const m = mapHrvPayload(noElapsed);
    expect(m!.entry.durationSec).toBeGreaterThan(200);
  });

  it('rejects a payload with too few intervals to be a reading', () => {
    expect(mapHrvPayload({ ...base(), rrMs: [900] })).toBeNull();
    expect(mapHrvPayload({ ...base(), rrMs: [] })).toBeNull();
  });

  it('rejects a schema newer than this build understands', () => {
    // An old phone must not half-import a future watch payload.
    expect(mapHrvPayload({ ...base(), schemaVersion: 2 })).toBeNull();
  });

  it('rejects missing id and unparseable time', () => {
    expect(mapHrvPayload({ ...base(), id: '' })).toBeNull();
    expect(mapHrvPayload({ ...base(), time: 'not a date' })).toBeNull();
  });

  it('drops non-numeric junk out of the RR series', () => {
    const dirty = { ...base(), rrMs: [900, 'x', null, 880, undefined, 910] };
    const m = mapHrvPayload(dirty as Record<string, unknown>);
    expect(m!.waveform?.rrRaw).toEqual([900, 880, 910]);
  });

  it('is reachable through the shared dispatcher', () => {
    // Garmin rides the same contract as the Apple Watch rather than a
    // parallel pipeline — this is what makes that true.
    const m = mapWatchPayload(base());
    expect(m?.section).toBe('readings');
    expect(m?.entry.type).toBe('hrv');
  });

  it('ignores payloads of another type', () => {
    expect(mapHrvPayload({ ...base(), type: 'standTest' })).toBeNull();
  });
});
