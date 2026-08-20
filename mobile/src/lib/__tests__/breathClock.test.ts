import { cycleMs, glowAt, parsePattern, phaseAt, phaseList, progressAt } from '../breathClock';

const P46 = parsePattern('4/6');
const BOX = parsePattern('4/4/4/4');

describe('parsePattern', () => {
  it('reads two-, three- and four-part patterns', () => {
    expect(P46).toEqual({ inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 });
    expect(parsePattern('4/7/8')).toEqual({ inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 });
    expect(BOX).toEqual({ inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 });
  });
  it('falls back to 4/6 on junk', () => {
    expect(parsePattern(undefined)).toEqual(P46);
    expect(parsePattern('')).toEqual(P46);
  });
});

describe('phaseAt', () => {
  it('drops zero-length phases from the cycle', () => {
    expect(phaseList(P46).map((p) => p.key)).toEqual(['in', 'out']);
    expect(cycleMs(P46)).toBe(10_000);
    expect(cycleMs(BOX)).toBe(16_000);
  });

  it('walks the cycle and wraps', () => {
    expect(phaseAt(P46, 0).phase).toBe('in');
    expect(phaseAt(P46, 3_999).phase).toBe('in');
    expect(phaseAt(P46, 4_000).phase).toBe('out');
    expect(phaseAt(P46, 9_999).phase).toBe('out');
    // A second cycle is the first cycle again — this is what lets a view that
    // mounts ten minutes in land in the right place.
    expect(phaseAt(P46, 10_000 * 37 + 4_500)).toMatchObject({ phase: 'out', index: 1 });
  });

  it('reports the time left in the phase, which is what a scheduler sleeps for', () => {
    expect(phaseAt(P46, 1_000).remainMs).toBe(3_000);
    expect(phaseAt(P46, 4_000).remainMs).toBe(6_000);
  });

  it('does not wrap backwards when elapsed is negative', () => {
    expect(phaseAt(P46, -500)).toMatchObject({ phase: 'in', t: 0 });
  });
});

describe('progressAt', () => {
  it('runs 0 → 1 over the inhale and back over the exhale', () => {
    expect(progressAt(P46, 0)).toBeCloseTo(0, 5);
    expect(progressAt(P46, 2_000)).toBeCloseTo(0.5, 5);
    expect(progressAt(P46, 3_999)).toBeGreaterThan(0.99);
    expect(progressAt(P46, 7_000)).toBeCloseTo(0.5, 5);
    expect(progressAt(P46, 9_999)).toBeLessThan(0.01);
  });

  it('holds position through a hold — the rings brighten, they do not move', () => {
    expect(progressAt(BOX, 5_000)).toBe(1);   // top hold
    expect(progressAt(BOX, 13_000)).toBe(0);  // bottom hold
  });

  it('is continuous across a phase boundary, so a remount cannot jump', () => {
    expect(Math.abs(progressAt(P46, 3_990) - progressAt(P46, 4_010))).toBeLessThan(0.02);
  });
});

describe('glowAt', () => {
  it('is flat for a pattern with no holds', () => {
    expect(glowAt(P46, 1_000)).toBe(0);
    expect(glowAt(P46, 7_000)).toBe(0);
  });
  it('builds over a hold and releases through the phase after it', () => {
    expect(glowAt(BOX, 4_000)).toBeCloseTo(0, 5);
    expect(glowAt(BOX, 7_900)).toBeGreaterThan(0.9);
    expect(glowAt(BOX, 8_200)).toBeGreaterThan(0.5); // releasing into the exhale
    expect(glowAt(BOX, 11_500)).toBe(0);             // released well before it ends
  });
});
