/**
 * The rules behind the skeleton's shape memory.
 *
 * This is what makes the placeholder-to-content swap fluid: rather than rebuilding a
 * card's interior and hoping the height comes out the same, the skeleton renders each
 * card at exactly the height the real one measured last time. That makes a stored blob
 * load-bearing for LAYOUT, so the parts worth pinning are the ones deciding whether a
 * stored value can be trusted — the clamps, and the write-skipping that stops a
 * fractional `onLayout` value rewriting storage on every frame.
 *
 * The MMKV half lives in ../shapeMemory and is deliberately not tested here, the way
 * ../../upsell/annualMemory.ts isn't: it cannot be imported under this project's
 * plain-node jest environment.
 */
import {
  DEFAULT_SHAPE, EMPTY_SHAPE, MAX_CARD_H, MAX_ROWS, MAX_ROW_H, ZERO_HEIGHTS, ZERO_ROWS,
  normalizeShape, sameShape, type InsightsShape,
} from '../shape';

const shape = (over: Partial<InsightsShape> = {}): InsightsShape => ({
  change: true,
  correlations: 4,
  observations: 3,
  noImpact: 0,
  watch: 5,
  heights: { change: 300, correlations: 420, observations: 260, noImpact: 0, watch: 240 },
  rows: { correlations: [74, 74, 74, 74], observations: [96, 118, 96], noImpact: [], watch: [58, 58] },
  ...over,
});

describe('defaults', () => {
  it('assumes a full-looking page on a first-ever launch', () => {
    // Over-reserving costs a little empty space for one frame; under-reserving costs
    // a visible jump. Only ever wrong once per install.
    expect(DEFAULT_SHAPE.change).toBe(true);
    expect(DEFAULT_SHAPE.correlations).toBeGreaterThan(0);
  });

  it('starts with no remembered heights, so the measured fallback runs', () => {
    expect(DEFAULT_SHAPE.heights).toEqual(ZERO_HEIGHTS);
    expect(DEFAULT_SHAPE.rows).toEqual(ZERO_ROWS);
  });

  it('has an empty shape for the locked and genuinely-empty cases', () => {
    expect(EMPTY_SHAPE.correlations).toBe(0);
    expect(EMPTY_SHAPE.heights).toEqual(ZERO_HEIGHTS);
  });
});

describe('normalizeShape', () => {
  it('round-trips a shape it wrote itself', () => {
    const s = shape();
    expect(normalizeShape(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('clamps a height so a corrupt value cannot reserve half a screen', () => {
    const out = normalizeShape(shape({ heights: { change: 99999, correlations: 420, observations: 260, noImpact: 0, watch: 240 } }))!;
    expect(out.heights.change).toBe(MAX_CARD_H);
  });

  it('reads a negative or absent height as unknown, not as a broken frame', () => {
    // 0 routes the skeleton to its measured fallback, which is the safe branch.
    const out = normalizeShape({ change: true, correlations: 2, observations: 0, watch: 0, heights: { change: -50 } })!;
    expect(out.heights.change).toBe(0);
    expect(out.heights.watch).toBe(0);
  });

  it('clamps the row counts to what the view can actually render', () => {
    const out = normalizeShape(shape({ correlations: 400, observations: 90, watch: 70 }))!;
    expect(out.correlations).toBe(MAX_ROWS.correlations);
    expect(out.observations).toBe(MAX_ROWS.observations);
    expect(out.watch).toBe(MAX_ROWS.watch);
  });

  it('rounds fractional heights, since onLayout reports them', () => {
    const out = normalizeShape(shape({ heights: { change: 300.6, correlations: 419.4, observations: 260, noImpact: 0, watch: 240 } }))!;
    expect(out.heights.change).toBe(301);
    expect(out.heights.correlations).toBe(419);
  });

  it('rejects junk rather than half-loading it', () => {
    expect(normalizeShape(null)).toBeNull();
    expect(normalizeShape('nope')).toBeNull();
    expect(normalizeShape(42)).toBeNull();
  });

  it('survives a blob with no heights at all, as an older build would have written', () => {
    const out = normalizeShape({ change: true, correlations: 4, observations: 3, watch: 5 })!;
    expect(out.heights).toEqual(ZERO_HEIGHTS);
    expect(out.rows).toEqual(ZERO_ROWS);
    expect(out.correlations).toBe(4);
  });

  it('clamps a row height, which decides where every bubble sits', () => {
    const out = normalizeShape(shape({ rows: { correlations: [9999, 74], observations: [-3, 96], noImpact: [], watch: [58] } }))!;
    expect(out.rows.correlations[0]).toBe(MAX_ROW_H);
    // A junk entry reads as 0 and KEEPS ITS INDEX. Dropping it compacted the list and
    // shifted every later row up one, so row 2's bubble was drawn at row 1's height —
    // the exact misplacement a per-row memory exists to prevent. The consumer treats a
    // 0 as "not measured" and falls back to the first known height.
    expect(out.rows.observations).toEqual([0, 96]);
    expect(out.rows.watch).toEqual([58]);
  });

  it('trims trailing unmeasured rows, which carry no position', () => {
    // A row never measured at the END of a card says nothing about where anything
    // sits, and keeping it would make "not measured yet" read as a shape change.
    const out = normalizeShape(shape({ rows: { correlations: [74, 74, 0, 0], observations: [], noImpact: [], watch: [] } }))!;
    expect(out.rows.correlations).toEqual([74, 74]);
  });

  it('caps how many row heights it will store per card', () => {
    const many = Array.from({ length: 40 }, () => 74);
    const out = normalizeShape(shape({ rows: { correlations: many, observations: many, noImpact: many, watch: many } }))!;
    expect(out.rows.correlations).toHaveLength(MAX_ROWS.correlations);
    expect(out.rows.observations).toHaveLength(MAX_ROWS.observations);
    expect(out.rows.watch).toHaveLength(MAX_ROWS.watch);
  });

  it('reads a non-array row list as empty rather than half-loading it', () => {
    const out = normalizeShape({ change: true, correlations: 4, observations: 0, watch: 0, rows: { correlations: 74 } })!;
    expect(out.rows.correlations).toEqual([]);
  });
});

describe('sameShape', () => {
  it('matches a shape against itself', () => {
    expect(sameShape(shape(), shape())).toBe(true);
  });

  it('ignores a sub-point height wobble', () => {
    // `onLayout` heights drift by a fraction between renders; writing storage for
    // each would be a write per frame for nothing visible.
    const a = shape({ heights: { change: 300, correlations: 420, observations: 260, noImpact: 0, watch: 240 } });
    const b = shape({ heights: { change: 300.2, correlations: 419.8, observations: 260.4, noImpact: 0.3, watch: 240.1 } });
    expect(sameShape(a, b)).toBe(true);
  });

  it('notices a real change of a point or more', () => {
    const a = shape({ heights: { change: 300, correlations: 420, observations: 260, noImpact: 0, watch: 240 } });
    const b = shape({ heights: { change: 318, correlations: 420, observations: 260, noImpact: 0, watch: 240 } });
    expect(sameShape(a, b)).toBe(false);
  });

  it('notices a row HEIGHT change, which moves a bubble', () => {
    expect(sameShape(shape(), shape({ rows: { correlations: [90, 74, 74, 74], observations: [96, 118, 96], noImpact: [], watch: [58, 58] } }))).toBe(false);
  });

  it('notices a row being added or removed', () => {
    expect(sameShape(shape(), shape({ rows: { correlations: [74, 74, 74], observations: [96, 118, 96], noImpact: [], watch: [58, 58] } }))).toBe(false);
  });

  it('ignores a sub-point wobble in a row height too', () => {
    expect(sameShape(shape(), shape({ rows: { correlations: [74.2, 73.8, 74, 74.1], observations: [96, 118.3, 95.7], noImpact: [], watch: [58, 58] } }))).toBe(true);
  });

  it('notices a row count change even when every height held', () => {
    expect(sameShape(shape(), shape({ watch: 2 }))).toBe(false);
    expect(sameShape(shape(), shape({ change: false }))).toBe(false);
  });
});
