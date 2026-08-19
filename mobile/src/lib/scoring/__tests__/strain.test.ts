/**
 * detectStrain: the warning card's second detector.
 *
 * The tests that matter most here are the NEGATIVE ones. This card fires while
 * the daily score still reads fine, so its whole value rests on restraint: one
 * marker off, or two markers barely off, must produce nothing. Each "fires"
 * test below has a mirror that moves one threshold back and expects null.
 *
 * Fixtures use a 49-day range ending at DK: the last 7 are the recent window,
 * the 42 before it the baseline.
 */
import type { DayRecord, Entry } from '../../types';
import { addDays } from '../../dates';
import { detectStrain, RECENT_DAYS, BASELINE_DAYS } from '../strain';

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  sleep: { bed: '', wake: '' },
  readings: [],
  activities: [],
  meds: [],
  symptoms: [],
  food: { water: 0, calories: 0, triggers: {}, meals: [] },
  digestion: { movements: [] },
  ...over,
});

const DK = '2026-03-01';
const TOTAL = RECENT_DAYS + BASELINE_DAYS;
/** Day keys oldest → newest, ending at DK. */
const KEYS = Array.from({ length: TOTAL }, (_, i) => addDays(DK, -(TOTAL - 1 - i)));
const BASE_KEYS = KEYS.slice(0, TOTAL - RECENT_DAYS);
const RECENT_KEYS = KEYS.slice(-RECENT_DAYS);

type Days = Record<string, DayRecord>;

/** Every day present and empty, so "no record" never silently does the work. */
const blank = (): Days => {
  const d: Days = {};
  KEYS.forEach((k) => { d[k] = day(); });
  return d;
};

let seq = 0;
const id = () => `e${seq++}`;

const addEntry = (days: Days, k: string, kind: 'readings' | 'activities' | 'symptoms', e: Entry) => {
  days[k] = { ...days[k], [kind]: [...(days[k][kind] || []), e] };
};

/** A resting-HR reading, the extractor `restingHr` prefers. */
const restingOn = (days: Days, ks: string[], hr: number) =>
  ks.forEach((k) => addEntry(days, k, 'readings', { id: id(), type: 'restingHr', time: '07:00', hr: String(hr) }));

/** A workout carrying a peak and a hand-entered one-minute rate. */
const workoutOn = (days: Days, ks: string[], peak: number, hr60: number) =>
  ks.forEach((k) => addEntry(days, k, 'activities', {
    id: id(), type: 'walk', time: '10:00', maxHr: String(peak), hr60: String(hr60),
  }));

const legsUpOn = (days: Days, ks: string[], lowHr: number) =>
  ks.forEach((k) => addEntry(days, k, 'activities', { id: id(), type: 'legsUp', time: '18:00', lowHr: String(lowHr) }));

// A short night on purpose: eight hours on every day of the fixture scores the
// day high enough to trip the Excellent ceiling, which is a real behaviour of
// the detector but not what these cases are testing.
const sleepingHrOn = (days: Days, ks: string[], hrLow: number) =>
  ks.forEach((k) => { days[k] = { ...days[k], sleep: { bed: '23:30', wake: '05:00', hrLow: String(hrLow) } }; });

const orthoOn = (days: Days, ks: string[], before: number, after: number) =>
  ks.forEach((k) => addEntry(days, k, 'readings', {
    id: id(), type: 'orthostatic', time: '09:00', beforeHr: String(before), afterHr: String(after),
  }));

/** Two markers up hard enough to fire: resting HR and heart-rate recovery. */
function twoMarkers(): Days {
  const d = blank();
  restingOn(d, BASE_KEYS, 60);
  restingOn(d, RECENT_KEYS, 66);          // +6 bpm
  workoutOn(d, BASE_KEYS.slice(-8), 150, 110);   // 40 bpm drop
  workoutOn(d, RECENT_KEYS.slice(-2), 150, 135); // 15 bpm drop, sagging 25 (weight 2)
  return d;
}

describe('detectStrain — restraint', () => {
  it('null on an empty journal', () => {
    expect(detectStrain(blank(), DK)).toBeNull();
  });

  it('null when one marker moved alone, however far', () => {
    const d = blank();
    restingOn(d, BASE_KEYS, 60);
    restingOn(d, RECENT_KEYS, 75); // +15, a weight-2 move all by itself
    expect(detectStrain(d, DK)).toBeNull();
  });

  it('null when two markers moved but neither cleared its threshold', () => {
    const d = blank();
    restingOn(d, BASE_KEYS, 60);
    restingOn(d, RECENT_KEYS, 63);   // +3, under HR_RISE
    sleepingHrOn(d, BASE_KEYS, 55);
    sleepingHrOn(d, RECENT_KEYS, 58); // +3, under HR_RISE
    expect(detectStrain(d, DK)).toBeNull();
  });

  it('null on two weight-1 signals: two distinct signals is not enough on its own', () => {
    const d = blank();
    restingOn(d, BASE_KEYS, 60);
    restingOn(d, RECENT_KEYS, 65);    // +5, weight 1
    sleepingHrOn(d, BASE_KEYS, 55);
    sleepingHrOn(d, RECENT_KEYS, 60); // +5, weight 1
    expect(detectStrain(d, DK)).toBeNull();
  });

  it('null when only the baseline has data (the recent window says nothing)', () => {
    const d = blank();
    restingOn(d, BASE_KEYS, 60);
    workoutOn(d, BASE_KEYS.slice(-8), 150, 110);
    expect(detectStrain(d, DK)).toBeNull();
  });

  it('null when there is no baseline to compare against', () => {
    const d = blank();
    restingOn(d, RECENT_KEYS, 80);
    workoutOn(d, RECENT_KEYS, 150, 140);
    expect(detectStrain(d, DK)).toBeNull();
  });

  it('null when heavy activity is the only thing found (context never fires alone)', () => {
    const d = blank();
    RECENT_KEYS.slice(-4).forEach((k) => addEntry(d, k, 'activities', { id: id(), type: 'strenuousWork', time: '12:00' }));
    expect(detectStrain(d, DK)).toBeNull();
  });
});

describe('detectStrain — when it fires', () => {
  it('fires on two markers off together', () => {
    const w = detectStrain(twoMarkers(), DK)!;
    expect(w).not.toBeNull();
    expect(w.signals.map((s) => s.id).sort()).toEqual(['hrRecovery', 'restingHr']);
    expect(w.weight).toBeGreaterThanOrEqual(3);
  });

  it('leads on a measurement, never on heavy activity', () => {
    const d = twoMarkers();
    RECENT_KEYS.slice(-4).forEach((k) => addEntry(d, k, 'activities', { id: id(), type: 'strenuousWork', time: '12:00' }));
    const w = detectStrain(d, DK)!;
    expect(w.signals.some((s) => s.id === 'exertion')).toBe(true);
    expect(w.signals[0].kind).toBe('marker');
  });

  it('escalates to alert as the evidence piles up', () => {
    const d = twoMarkers();
    expect(detectStrain(d, DK)!.severity).toBe('watch');
    legsUpOn(d, BASE_KEYS.slice(-10), 62);
    legsUpOn(d, RECENT_KEYS.slice(-3), 76); // +14, weight 2
    const w = detectStrain(d, DK)!;
    expect(w.severity).toBe('alert');
  });

  it('catches a worsening standing response beside a rising overnight rate', () => {
    const d = blank();
    orthoOn(d, BASE_KEYS.slice(-6), 70, 92);   // +22
    orthoOn(d, RECENT_KEYS.slice(-2), 70, 110); // +40, weight 2
    sleepingHrOn(d, BASE_KEYS, 55);
    sleepingHrOn(d, RECENT_KEYS, 60);           // +5, weight 1
    const w = detectStrain(d, DK)!;
    expect(w.signals.map((s) => s.id).sort()).toEqual(['orthostatic', 'sleepingHr']);
  });

  it('says nothing on an Excellent day, whatever the markers did', () => {
    const d = twoMarkers();
    // An unstructured RMSSD of 40 scores the day 100.
    KEYS.forEach((k) => addEntry(d, k, 'readings', { id: id(), type: 'hrv', time: '08:00', rmssd: '40' }));
    expect(detectStrain(d, DK)).toBeNull();
  });
});

describe('detectStrain — what it says', () => {
  it('the headline carries the lead marker and its number', () => {
    const w = detectStrain(twoMarkers(), DK)!;
    expect(w.headline).toMatch(/bpm/);
    expect(w.headline).toMatch(/plus 1 other sign/);
    expect(w.headline).not.toMatch(/—/); // copy rule: no em dashes
  });

  it('every signal becomes a sheet row with a value in its own unit', () => {
    const w = detectStrain(twoMarkers(), DK)!;
    expect(w.factors).toHaveLength(w.signals.length);
    w.factors.forEach((f) => {
      expect(f.label).toBeTruthy();
      expect(f.value).toMatch(/bpm|day|days/);
      expect(f.detail.length).toBeGreaterThan(20);
    });
  });

  it('the readout tile counts markers rather than inventing a score move', () => {
    const w = detectStrain(twoMarkers(), DK)!;
    expect(w.readout.value).toBe('2 markers off');
    expect(w.readout.sub).toBe(`over the last ${RECENT_DAYS} days`);
  });

  it('never diagnoses', () => {
    const w = detectStrain(twoMarkers(), DK)!;
    expect(w.body).toMatch(/not a diagnosis/i);
  });
});
