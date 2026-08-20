/**
 * Exercise-zone model for the imported-workout report: the zone table anchors
 * on an age-estimated max HR, every bpm lands in exactly one zone, and
 * time-in-zones ignores sensor-dropout gaps.
 */
import { estimatedHrMax, hrZones, timeInZones, zoneFor } from '../workoutZones';

describe('estimatedHrMax', () => {
  it('applies Tanaka (208 − 0.7 × age)', () => {
    expect(estimatedHrMax(40)).toBe(180);
    expect(estimatedHrMax(20)).toBe(194);
  });
  it('returns null without a plausible age', () => {
    expect(estimatedHrMax(null)).toBeNull();
    expect(estimatedHrMax(5)).toBeNull();
    expect(estimatedHrMax(130)).toBeNull();
  });
});

describe('hrZones / zoneFor', () => {
  const zones = hrZones(180);

  it('builds five contiguous bands at 60/70/80/90%', () => {
    expect(zones.map((z) => z.from)).toEqual([0, 108, 126, 144, 162]);
    expect(zones[4].to).toBe(Infinity);
    for (let i = 0; i < 4; i++) expect(zones[i].to).toBe(zones[i + 1].from);
  });

  it('places every bpm in exactly one zone', () => {
    expect(zoneFor(90, zones).z).toBe(1);   // warm-up below 60% is still Z1
    expect(zoneFor(108, zones).z).toBe(2);  // boundaries belong to the upper zone
    expect(zoneFor(125, zones).z).toBe(2);
    expect(zoneFor(150, zones).z).toBe(4);
    expect(zoneFor(200, zones).z).toBe(5);
  });
});

describe('timeInZones', () => {
  const zones = hrZones(180);

  it('credits each sample interval to its starting zone', () => {
    const trace = [
      { t: 0, bpm: 100 },   // Z1 for 10 s
      { t: 10, bpm: 130 },  // Z3 for 10 s
      { t: 20, bpm: 130 },
    ];
    const secs = timeInZones(trace, zones);
    expect(secs[0]).toBe(10);
    expect(secs[2]).toBe(10);
    expect(secs.reduce((s, v) => s + v, 0)).toBe(20);
  });

  it('skips dropout gaps instead of crediting a zone for minutes of silence', () => {
    const trace = [
      { t: 0, bpm: 100 },
      { t: 5, bpm: 100 },
      { t: 300, bpm: 100 }, // 295 s sensor gap — not counted
      { t: 305, bpm: 100 },
    ];
    const secs = timeInZones(trace, zones);
    expect(secs[0]).toBe(10);
  });
});
