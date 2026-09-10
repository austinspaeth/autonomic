/**
 * The pacing feature's own measurements and colours.
 *
 * Lifted out of the components so the sheet, the drill-in and the pitch card
 * cannot drift apart — the same argument `features/insights/style.ts` makes
 * for its own numbers.
 */
/* The per-source colours and icons are gone. Six tinted glyphs turned a
   ranked list into a legend the reader had to learn before they could read the
   list, and the row's own NAME identifies it perfectly well. What is left of
   the colour is the green on a credit, which is the only row that means
   something different in kind from the others.  */

/** The history strip's cells. */
export const CELL_H = 26;
export const CELL_RADIUS = 6;

/** The big figure on the sheet's Today card. */
export const FIGURE_SIZE = 28;
/** A tile's figure, matching the Outlook card's own tiles. */
export const TILE_FIGURE = 17;

/* ---------------------------------------------------------------- *
 * The movement flash.
 *
 * One timeline, shared by the bar and the line of text under it, because the
 * two halves are one gesture: the bar travels for exactly as long as the
 * phrase naming the movement is arriving. Splitting these constants between
 * the two components is how they would drift.
 * ---------------------------------------------------------------- */

/** The bar travels to its new length. */
export const PULSE_GROW_MS = 850;
/** And how long the fill takes to become its new colour when the day crosses
 *  the pace marker or the ceiling. The bar's whole vocabulary for a movement is
 *  its LENGTH and its COLOUR: there is no moved slice in a colour of its own,
 *  because a red chip appearing on a bar that is otherwise green said "this
 *  much of you is bad" about minutes that are simply spent. */
export const PULSE_TINT_MS = 620;
/** How long the phrase naming the movement holds once the bar has arrived. */
export const PULSE_HOLD_MS = 1100;
/** And how long the gesture takes to finish after that: the phrase leaves and
 *  the subtext steps back in. */
export const PULSE_FADE_MS = 700;
/** The subtext steps aside, and the phrase steps in. */
export const PULSE_TEXT_OUT_MS = 190;
export const PULSE_TEXT_IN_MS = 260;
/** When the phrase starts leaving. */
export const PULSE_COLOR_MS = PULSE_GROW_MS + PULSE_HOLD_MS;
/** The whole gesture, after which the pulse is retired. */
export const PULSE_TOTAL_MS = PULSE_COLOR_MS + PULSE_FADE_MS;
