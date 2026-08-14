/**
 * The Insights view's shared measurements, imported by BOTH ./Sections (the real
 * content) and ./InsightsSkeleton (its placeholder).
 *
 * This file exists because the skeleton's whole job is to be exactly as tall as
 * what it becomes. `ProgressSkeleton` achieves that by copying `CardView`'s style
 * constants with a comment warning that they must move together, which works but
 * relies on somebody reading the comment. These two files live in the same folder,
 * so they can share the constants outright and the drift becomes impossible.
 *
 * EVERYTHING HERE IS PROGRESS'S GRAMMAR, not a second design language. The card
 * chrome, the 15px uppercase tracked title, the 13/19 description, the stat tiles
 * and the hairline row dividers are all lifted from `CardView` in
 * app/(tabs)/analysis.tsx so Insights reads as the same app. Where the Claude
 * Design comp differs (22px radii, borderless cards, 14px gutters) the app wins:
 * the comp's own notes ask for the app's card grammar, and this is what that
 * grammar actually is.
 */
import type { TextStyle, ViewStyle } from 'react-native';
import { radius } from '../../theme';
import { VISIBLE_CORRELATIONS } from '../../lib/insights';

/** Green for "this is working". Accent red is the palette's, for "this isn't". */
export const GOOD = '#3ec46d';
/** The middle tone: noticed, neither good nor bad. */
export const NEUTRAL = '#9a9aa0';

/* ---------- containers ---------- */

/** A card. Verbatim from `CardView`: 16pt padding, `radius.card`, 12pt gutter. */
export const CARD: ViewStyle = { borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12 };

/** The title band inside a card. */
export const CARD_HEAD: ViewStyle = { flexDirection: 'row', alignItems: 'center' };

/** A stat tile in the three-up row. Verbatim from `CardView`'s `card.tiles`. */
export const TILE: ViewStyle = { flex: 1, minWidth: 96, borderWidth: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 };
export const TILE_ROW: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, marginBottom: 6 };

/**
 * A row inside a card: a bubble, not a divided line.
 *
 * It reads as a button because it is one — every row here goes somewhere. Hairline
 * dividers said "list" and left the first row butted against the description with
 * a stray line above it; an inset bubble on the card's own background is the same
 * treatment the stat tiles wear, so the card holds one kind of object throughout.
 */
/**
 * The bubble's fill: one step above the card it sits in, one step below `surface2`.
 *
 * A literal because there is no palette token between the two, and both neighbours
 * failed — the card's own `surface` erases the bubble, and `surface2` (what the card
 * BUTTON wears) made every row read as a control. Lives here so ./InsightsSkeleton
 * draws its placeholder bubbles in the same colour.
 */
export const ROW_BG = '#232326';

/**
 * The tone tile on a "worth a look" row, and — because it is the tallest thing any
 * row contains — the figure every row's height is derived from.
 *
 * EVERY ROW IN THIS VIEW IS THE SAME HEIGHT. The cards sit one under another and a
 * list whose rows stand half a line taller than the list below it reads as two
 * different components. So the tile is sized first and `ROW` carries a `minHeight`
 * of the tile plus its own padding; a text-only row (a correlation) then matches a
 * row with a tile in it rather than sitting shorter.
 */
export const TONE_BOX = 26;
const ROW_PAD_V = 12;
export const ROW_MIN_H = TONE_BOX + ROW_PAD_V * 2;

export const ROW: ViewStyle = {
  minHeight: ROW_MIN_H, flexDirection: 'row', alignItems: 'center', gap: 12,
  borderWidth: 1, borderRadius: radius.card, paddingVertical: ROW_PAD_V, paddingHorizontal: 13, marginTop: 8,
};
export const ROW_TALL: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: radius.card, paddingVertical: 13, paddingHorizontal: 13, marginTop: 8 };

/** The full-width action that closes a card, e.g. "Show all 24 correlations". */
export const CARD_BUTTON: ViewStyle = { alignItems: 'center', borderWidth: 1, borderRadius: radius.control, paddingVertical: 13, marginTop: 10 };
export const CARD_BUTTON_TEXT: TextStyle = { fontSize: 14.5, fontWeight: '600' };

/** The first bubble sits a little clear of the title or description above it. */
export const ROWS_TOP = 4;

/* ---------- type, all of it Progress's ---------- */

/** `CardView`'s title: 15/700 uppercase, tracked out, dim. */
export const CARD_TITLE: TextStyle = { flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 };
/** `CardView`'s description under the title. */
export const CARD_DESC: TextStyle = { fontSize: 13, lineHeight: 19, marginTop: 8 };
/** The red text action on the right of a card title ("Show all"). */
export const CARD_ACTION: TextStyle = { fontSize: 13, fontWeight: '700' };

/** The stat tile's numeral. Manrope, tabular, exactly as Progress renders it. */
export const TILE_VALUE: TextStyle = { fontSize: 25 };
export const TILE_LABEL: TextStyle = { fontSize: 12, marginTop: 2 };

export const HEADLINE: TextStyle = { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, marginTop: 10 };
export const BODY: TextStyle = { fontSize: 13, lineHeight: 19, marginTop: 6 };

export const PAIR_DRIVER: TextStyle = { fontSize: 14.5, fontWeight: '700' };
export const PAIR_METRIC: TextStyle = { fontSize: 14.5, fontWeight: '600' };
export const ROW_NOTE: TextStyle = { fontSize: 12 };
// Close to the pair's own size (14.5), a hair above it: the delta reads as the end
// of the row's sentence rather than as a separate readout, but still leads it.
export const R_VALUE: TextStyle = { fontSize: 16, fontWeight: '700' };

export const ROW_TITLE: TextStyle = { fontSize: 14, fontWeight: '700' };
export const ROW_SUB: TextStyle = { fontSize: 12.5, lineHeight: 18 };
export const WATCH_VALUE: TextStyle = { fontSize: 15, fontWeight: '700' };

export const CONF_LABEL: TextStyle = { fontSize: 12.5 };
export const FOOTER_TEXT: TextStyle = { fontSize: 11.5, lineHeight: 17 };

/* ---------- fixed sizes ---------- */

/**
 * The confidence bar under the headline card, and in the confidence sheet: a solid
 * fill on a dark track, the same shape as the milestone progress bar. Segmented
 * pips were a chart type nothing else in the app used. Correlation ROWS carry no
 * strength notation at all: the list's order is the strength, and the sheet spells
 * it out for a row worth opening.
 */
export const CONF_BAR_H = 6;
/** Trend watch sparkline. */
export const SPARK_W = 64;
export const SPARK_H = 26;
/** The "new" dot at the start of a card title. */
export const NEW_DOT = 8;

/* ---------- gaps the skeleton has to reproduce ---------- */

export const CONF_TOP = 13;      // hairline above the confidence block
export const CONF_GAP = 8;       // "Confidence" row -> bar
export const PAIR_GAP = 5;       // pair line -> the sheet's extra note line
export const FOOTER_TOP = 4;
export const FOOTER_BOTTOM = 4;

/** How many correlation rows show before "Show all". Re-exported from the engine
 *  rather than copied, so the skeleton and the list cannot disagree. */
export const VISIBLE_ROWS = VISIBLE_CORRELATIONS;

/**
 * Text the skeleton measures against.
 *
 * These are used ONLY by the skeleton's once-per-install fallback, the path taken
 * before any card has been measured. After that, heights come from
 * `shape.heights`/`shape.rows` and none of this is consulted.
 *
 * They work by measurement rather than by a number: an invisible copy of the sample in
 * the real style reserves exactly the space that string would take, so a sample
 * shorter than reality under-reserves and the first open jumps.
 * `../../lib/insights/__tests__/skeleton.test.ts` fails if any of them falls short of
 * what the demo month really produces.
 */
export const SAMPLE = {
  headline: 'Diastolic pressure is up since you started magnesium glycinate',
  obsTitle: 'Magnesium glycinate and vitamin D3 travel together',
  pair: 'Magnesium glycinate → Diastolic pressure',
  watchTitle: 'Bedtime consistency',
} as const;
