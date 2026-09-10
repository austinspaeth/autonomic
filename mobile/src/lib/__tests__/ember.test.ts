import { EMBER_GLOW_MAX, EMBER_GLOW_MIN, EMBER_MS, emberStops } from '../ember';

/**
 * The seam test.
 *
 * A drifting gradient loops by translating a DOUBLED copy of a PERIODIC pattern
 * by exactly one period. Both halves of that sentence have to hold or the snap
 * back to the start is visible as a jolt once a cycle, which is exactly the bug
 * the first version shipped with (it translated a fixed 200pt along a bar that
 * was nearer 300 wide).
 *
 * The callers are responsible for translating by the measured period. This file
 * is responsible for the pattern being periodic in the first place.
 */
describe('ember stops', () => {
  const RED = '#e03127';

  it('repeats with a period of half the doubled shape', () => {
    const stops = emberStops(RED);
    const at = (o: number) => stops.find((s) => Math.abs(s.offset - o) < 1e-9);
    // Every stop in the first half has a twin exactly 0.5 later, same colour.
    stops.filter((s) => s.offset < 0.5).forEach((s) => {
      const twin = at(s.offset + 0.5);
      expect({ offset: s.offset, twin: twin?.color }).toEqual({ offset: s.offset, twin: s.color });
    });
  });

  it('starts and ends on the same colour, so the wrap is continuous', () => {
    const stops = emberStops(RED);
    expect(stops[0].offset).toBe(0);
    expect(stops[stops.length - 1].offset).toBe(1);
    expect(stops[stops.length - 1].color).toBe(stops[0].color);
  });

  it('anchors both ends on the base colour rather than a highlight', () => {
    const stops = emberStops(RED);
    expect(stops[0].color).toBe(RED);
    expect(stops[stops.length - 1].color).toBe(RED);
  });

  it('runs its offsets in order and stays inside the shape', () => {
    const stops = emberStops(RED);
    stops.forEach((s, i) => {
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset).toBeLessThanOrEqual(1);
      if (i) expect(s.offset).toBeGreaterThan(stops[i - 1].offset);
    });
  });

  it('lightens any grade colour rather than only the red it was drawn for', () => {
    // The gauge burns in the day's own colour, so orange and dark red have to
    // produce a visible highlight too, not a wash.
    const lum = (c: string) => {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c) || /^#(..)(..)(..)$/.exec(c);
      if (!m) return 0;
      const n = c.startsWith('#')
        ? [1, 2, 3].map((i) => parseInt(m[i], 16))
        : [1, 2, 3].map((i) => Number(m[i]));
      return n[0] * 0.299 + n[1] * 0.587 + n[2] * 0.114;
    };
    ['#f97316', '#ef4444', '#b91c1c', '#eab308'].forEach((base) => {
      const stops = emberStops(base);
      const hi = stops.find((s) => Math.abs(s.offset - 0.11) < 1e-9)!;
      expect(lum(hi.color)).toBeGreaterThan(lum(base) + 12);
    });
  });

  it('drifts slowly enough to read as heat rather than as loading', () => {
    expect(EMBER_MS).toBeGreaterThanOrEqual(3000);
    expect(EMBER_GLOW_MIN).toBeLessThan(EMBER_GLOW_MAX);
    expect(EMBER_GLOW_MAX).toBeLessThanOrEqual(1);
  });
});
