/**
 * Exercise heart-rate zones for the imported-workout report — pure and
 * unit-tested. Zones are the classic five %-of-max bands (Z1 <60% … Z5 ≥90%),
 * anchored on an age-estimated max HR (Tanaka: 208 − 0.7 × age). Without a
 * birthday there is no max to anchor on, so callers render the trace unzoned.
 */

export interface HrZone {
  z: number;         // 1..5
  label: string;     // "Recovery" … "Max effort"
  from: number;      // bpm, inclusive
  to: number;        // bpm, exclusive (Infinity for Z5)
  color: string;
}

/** Estimated max heart rate (Tanaka), or null without an age. */
export function estimatedHrMax(age: number | null): number | null {
  if (age == null || age < 10 || age > 120) return null;
  return Math.round(208 - 0.7 * age);
}

/** Cool grey → watch blue → the grade greens/orange/red the app already uses,
 *  so effort reads on the same visual scale as everything else. */
const ZONE_COLORS = ['#94a3b8', '#4aa3f0', '#16a34a', '#f97316', '#ef4444'];
const ZONE_LABELS = ['Recovery', 'Easy', 'Aerobic', 'Threshold', 'Max effort'];
const ZONE_EDGES = [0, 0.6, 0.7, 0.8, 0.9];

/** The five zones in ascending order. Z1 runs from 0 so every sample lands
 *  somewhere (warm-up beats below 50% still count as recovery). */
export function hrZones(hrMax: number): HrZone[] {
  return ZONE_EDGES.map((frac, i) => ({
    z: i + 1,
    label: ZONE_LABELS[i],
    from: Math.round(hrMax * frac),
    to: i === 4 ? Infinity : Math.round(hrMax * ZONE_EDGES[i + 1]),
    color: ZONE_COLORS[i],
  }));
}

/** The zone a bpm value falls in. */
export function zoneFor(bpm: number, zones: HrZone[]): HrZone {
  for (let i = zones.length - 1; i > 0; i--) if (bpm >= zones[i].from) return zones[i];
  return zones[0];
}

/**
 * Seconds spent in each zone (indexed by zone - 1) over an HR trace. Each
 * sample owns the interval to the next one; gaps beyond `maxGapSec` are
 * treated as sensor dropout and not counted toward any zone.
 */
export function timeInZones(
  samples: { t: number; bpm: number }[],
  zones: HrZone[],
  maxGapSec = 30,
): number[] {
  const secs = zones.map(() => 0);
  for (let i = 0; i < samples.length - 1; i++) {
    const dt = samples[i + 1].t - samples[i].t;
    if (dt <= 0 || dt > maxGapSec) continue;
    secs[zoneFor(samples[i].bpm, zones).z - 1] += dt;
  }
  return secs;
}
