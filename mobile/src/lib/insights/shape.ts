/**
 * The rules behind the skeleton's shape memory. Pure: no MMKV, no store.
 *
 * Split from ./shapeMemory the way ../upsell/annual.ts is split from
 * annualMemory.ts, and for the same reason: the interesting part is the
 * normalisation, and a module that imports `react-native-mmkv` cannot be unit
 * tested under this project's plain-node jest environment.
 *
 * What it exists for: the skeleton is fluid because it renders each card at exactly
 * the height the real one measured last time, rather than rebuilding the interior and
 * hoping. That makes a stored blob load-bearing for layout, so everything read back
 * out of it is clamped before it can reserve a screen and a half of blank card.
 */

/** Per-card measured height in points, or 0 when this install has never shown it. */
export type CardHeights = Record<'change' | 'correlations' | 'observations' | 'watch', number>;

export const HEIGHT_KEYS = ['change', 'correlations', 'observations', 'watch'] as const;

/** The three cards that hold rows. */
export type RowKey = 'correlations' | 'observations' | 'watch';
export const ROW_KEYS = ['correlations', 'observations', 'watch'] as const;
/**
 * Measured height of EACH bubble row, per list card. Empty when never shown.
 *
 * Per row rather than one figure per card, because observation rows genuinely differ:
 * a title wraps to one line or two and a body to two, three or four, so applying the
 * first row's height to all three left the later bubbles sitting where no row would be.
 * Correlation and trend-watch rows are uniform and will simply store identical values.
 */
export type RowHeights = Record<RowKey, number[]>;

export interface InsightsShape {
  change: boolean;
  correlations: number;
  observations: number;
  watch: number;
  /**
   * What each card actually MEASURED last time it rendered.
   *
   * Reproducing a card's height by rebuilding its interior can never be exact: a
   * headline wraps to one line or two, a body to three or four, an observation title
   * to either. So the skeleton stops guessing and pins each card to the height the
   * real one had, which makes the swap dimensionally identical rather than close.
   *
   * 0 means unknown, and the skeleton falls back to reserving from its samples. That
   * happens once per install, on the very first open.
   */
  heights: CardHeights;
  /**
   * How tall ONE row is in each list card.
   *
   * The card height above pins the outer frame; this is what puts the bubbles where
   * the real rows will actually be. With the row height known and the card's chrome
   * rendered for real, N bubbles land at exactly the N row positions, which is the
   * difference between a skeleton that resembles the card and one that occupies it.
   */
  rows: RowHeights;
}

export const ZERO_HEIGHTS: CardHeights = { change: 0, correlations: 0, observations: 0, watch: 0 };
export const ZERO_ROWS: RowHeights = { correlations: [], observations: [], watch: [] };

/** No single row is taller than this. */
export const MAX_ROW_H = 220;

/** No single card is taller than this. Enforced on read, not on write, because the
 *  value that has to be safe is the one coming back out of storage. */
export const MAX_CARD_H = 900;

/** Most rows any one card will draw, so a stored count cannot ask for hundreds. */
export const MAX_ROWS = { correlations: 8, observations: 3, watch: 5 } as const;

/**
 * What a first-ever launch assumes.
 *
 * A full-looking page rather than an empty one: the first build is the one most
 * likely to find something (it has the whole journal to work with), and
 * over-reserving costs a little empty space for one frame while under-reserving costs
 * a visible jump. Only ever wrong once per install.
 */
export const DEFAULT_SHAPE: InsightsShape = { change: true, correlations: 4, observations: 3, watch: 4, heights: ZERO_HEIGHTS, rows: ZERO_ROWS };

/** Nothing at all, for the locked and genuinely-empty cases. */
export const EMPTY_SHAPE: InsightsShape = { change: false, correlations: 0, observations: 0, watch: 0, heights: ZERO_HEIGHTS, rows: ZERO_ROWS };

const clamp = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0;
};

/**
 * A stored row-height list, clamped both in length and per element: this decides
 * where every bubble sits, so a corrupt entry dislocates the card rather than merely
 * looking odd. A non-array reads as empty, which routes to the measured fallback.
 *
 * POSITION IS PRESERVED, so an unmeasured row reads as 0 and stays at its own index.
 * Dropping the zeros compacted the list and shifted every later row up one — row 2's
 * bubble drawn at row 1's height — which is the exact class of misplacement this
 * per-row memory exists to prevent. A 0 is a real answer here: the consumer falls
 * back to the first known height for it.
 */
const rowList = (v: unknown, maxLen: number): number[] => {
  const out = (Array.isArray(v) ? v : []).slice(0, maxLen).map((x) => clamp(x, MAX_ROW_H));
  // Trailing zeros carry no position worth keeping, and dropping them keeps the
  // stored blob (and `sameShape`) from treating "not measured yet" as a difference.
  while (out.length && out[out.length - 1] === 0) out.pop();
  return out;
};

/** A stored blob made safe to lay out with. Anything unparseable reads as unknown,
 *  which routes the skeleton to its measured fallback rather than to a broken frame. */
export function normalizeShape(raw: unknown): InsightsShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const h = (o.heights || {}) as Record<string, unknown>;
  const r = (o.rows || {}) as Record<string, unknown>;
  return {
    change: !!o.change,
    correlations: clamp(o.correlations, MAX_ROWS.correlations),
    observations: clamp(o.observations, MAX_ROWS.observations),
    watch: clamp(o.watch, MAX_ROWS.watch),
    heights: {
      change: clamp(h.change, MAX_CARD_H),
      correlations: clamp(h.correlations, MAX_CARD_H),
      observations: clamp(h.observations, MAX_CARD_H),
      watch: clamp(h.watch, MAX_CARD_H),
    },
    rows: {
      correlations: rowList(r.correlations, MAX_ROWS.correlations),
      observations: rowList(r.observations, MAX_ROWS.observations),
      watch: rowList(r.watch, MAX_ROWS.watch),
    },
  };
}

/**
 * Are these the same shape for layout purposes?
 *
 * Heights compare to the point, not exactly: `onLayout` reports fractional values
 * that wobble by a fraction between renders, and rewriting storage on every one of
 * those would be a write per frame for no visible benefit.
 */
export const sameShape = (a: InsightsShape, b: InsightsShape) =>
  a.change === b.change && a.correlations === b.correlations
  && a.observations === b.observations && a.watch === b.watch
  && HEIGHT_KEYS.every((k) => Math.round(a.heights[k]) === Math.round(b.heights[k]))
  && ROW_KEYS.every((k) => sameRows(a.rows[k], b.rows[k]));

/** Row lists compare element-wise, to the point, for the same reason card heights do. */
const sameRows = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => Math.round(v) === Math.round(b[i]));
