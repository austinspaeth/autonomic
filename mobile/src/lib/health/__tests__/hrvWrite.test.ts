import { arrivalHealthWrite, hrvHealthWrite } from '../hrvWrite';
import type { Entry } from '../../types';

const NOW = Date.parse('2026-09-30T08:10:00Z');

const garmin = (over: Partial<Entry> = {}): Entry => ({
  id: 'g1', type: 'hrv', time: '08:00', source: 'garmin',
  startedAt: '2026-09-30T08:00:00.000Z', durationSec: 300,
  sdnn: '42', rmssd: '38', avgHr: '61',
  ...over,
});

describe('hrvHealthWrite', () => {
  it('publishes the metrics, parsing string fields', () => {
    expect(hrvHealthWrite(garmin(), { enabled: true })).toEqual({
      sdnnMs: 42, rmssdMs: 38, avgHr: 61,
      startISO: '2026-09-30T08:00:00.000Z', durationSec: 300,
    });
  });

  it('accepts numeric fields and prefers hr over avgHr', () => {
    const w = hrvHealthWrite(garmin({ sdnn: 40.5, hr: 58, avgHr: '61' }), { enabled: true });
    expect(w?.sdnnMs).toBe(40.5);
    expect(w?.avgHr).toBe(58);
  });

  it('writes nothing while Health is off', () => {
    expect(hrvHealthWrite(garmin(), { enabled: false })).toBeNull();
  });

  it('never publishes a degraded reading', () => {
    expect(hrvHealthWrite(garmin({ degraded: true }), { enabled: true })).toBeNull();
  });

  it('never writes an Apple Watch reading back to where it came from', () => {
    expect(hrvHealthWrite(garmin({ source: 'watch' }), { enabled: true })).toBeNull();
  });

  it('needs SDNN or RMSSD, and keeps whichever it has', () => {
    expect(hrvHealthWrite(garmin({ sdnn: undefined, rmssd: undefined }), { enabled: true })).toBeNull();
    expect(hrvHealthWrite(garmin({ sdnn: '', rmssd: 'n/a' }), { enabled: true })).toBeNull();
    const rmssdOnly = hrvHealthWrite(garmin({ sdnn: undefined }), { enabled: true });
    expect(rmssdOnly?.rmssdMs).toBe(38);
    expect(rmssdOnly?.sdnnMs).toBeUndefined();
  });

  it('leaves avgHr out rather than inventing one', () => {
    expect(hrvHealthWrite(garmin({ avgHr: undefined }), { enabled: true })?.avgHr).toBeUndefined();
  });

  it('covers training readings too, but nothing else', () => {
    expect(hrvHealthWrite(garmin({ type: 'breathHrv' }), { enabled: true })).not.toBeNull();
    expect(hrvHealthWrite(garmin({ type: 'standTest' }), { enabled: true })).toBeNull();
  });

  it('needs a real duration', () => {
    expect(hrvHealthWrite(garmin({ durationSec: 0 }), { enabled: true })).toBeNull();
    expect(hrvHealthWrite(garmin({ durationSec: undefined }), { enabled: true })).toBeNull();
  });

  it('takes the start from the caller, then the entry, then the clock', () => {
    const at = Date.parse('2026-09-30T07:00:00Z');
    expect(hrvHealthWrite(garmin(), { enabled: true, startMs: at })?.startISO).toBe('2026-09-30T07:00:00.000Z');
    expect(hrvHealthWrite(garmin({ startedAt: undefined }), { enabled: true, nowMs: NOW })?.startISO)
      .toBe('2026-09-30T08:05:00.000Z');
  });
});

describe('arrivalHealthWrite', () => {
  const arrival = (over: Partial<{ fresh: boolean; section: string; refused: boolean }> = {}) => ({
    fresh: true, section: 'readings', refused: false, entry: garmin(), ...over,
  });

  it('publishes a fresh reading', () => {
    expect(arrivalHealthWrite(arrival(), { enabled: true })).not.toBeNull();
  });

  it('never publishes a re-delivery, so a lost ack cannot write twice', () => {
    expect(arrivalHealthWrite(arrival({ fresh: false }), { enabled: true })).toBeNull();
  });

  it('skips a reading the capture gate would have refused', () => {
    expect(arrivalHealthWrite(arrival({ refused: true }), { enabled: true })).toBeNull();
  });

  it('skips anything that is not a reading', () => {
    expect(arrivalHealthWrite(arrival({ section: 'symptoms' }), { enabled: true })).toBeNull();
  });

  it('still obeys the shared rule', () => {
    expect(arrivalHealthWrite(arrival(), { enabled: false })).toBeNull();
  });
});
