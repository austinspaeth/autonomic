import {
  noteRrSample, rrSupport, NO_RR_MEASUREMENTS, RR_WATCH_START, type RrWatch,
} from '../rrSupport';

/** A strap's notification: a pulse plus the intervals behind it. */
const withRr = { hr: 62, rr: [968, 972] };
/** A Fitbit Charge 6 sharing to gym equipment: flags 0x00, two bytes, no beats. */
const pulseOnly = { hr: 71, rr: [] };
/** Connected but not yet worn. */
const idle = { hr: 0, rr: [] };

const feed = (n: number, s: { hr: number; rr: number[] }, from: RrWatch = RR_WATCH_START) => {
  let w = from;
  for (let i = 0; i < n; i++) w = noteRrSample(w, s);
  return w;
};

describe('rrSupport', () => {
  it('starts unknown', () => {
    expect(rrSupport(RR_WATCH_START)).toBe('unknown');
  });

  it('settles on present from a single RR interval', () => {
    expect(rrSupport(noteRrSample(RR_WATCH_START, withRr))).toBe('present');
  });

  it('reports absent once enough pulses have arrived with no beats', () => {
    expect(rrSupport(feed(NO_RR_MEASUREMENTS, pulseOnly))).toBe('absent');
  });

  it('is still unknown one sample short of the bar', () => {
    // The honest state for a strap that has only just connected. Reporting this
    // as 'absent' is the failure the whole module exists to avoid.
    expect(rrSupport(feed(NO_RR_MEASUREMENTS - 1, pulseOnly))).toBe('unknown');
  });

  it('does not count samples that carry no pulse', () => {
    // A connected, unworn strap sends these all day. It has not declined to
    // report beats — it has not reported anything.
    expect(rrSupport(feed(NO_RR_MEASUREMENTS * 3, idle))).toBe('unknown');
  });

  it('rescues a slow starter: RR after a long pulse-only run still reads present', () => {
    const w = noteRrSample(feed(NO_RR_MEASUREMENTS * 2, pulseOnly), withRr);
    expect(rrSupport(w)).toBe('present');
  });

  it('stays present once latched, however many bare pulses follow', () => {
    // Contact lost mid-reading drops the intervals but not the capability.
    const w = feed(NO_RR_MEASUREMENTS * 2, pulseOnly, noteRrSample(RR_WATCH_START, withRr));
    expect(rrSupport(w)).toBe('present');
  });

  it('does not mutate the tally it is given', () => {
    const w = feed(3, pulseOnly);
    const before = { ...w };
    noteRrSample(w, pulseOnly);
    noteRrSample(w, withRr);
    expect(w).toEqual(before);
  });
});
