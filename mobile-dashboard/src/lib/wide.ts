/* The wide layout: an iPad, or the app's window on a Mac. There the bar that
 * sits at the bottom of a phone moves to the top, the filter bar floats at the
 * bottom on its own and carries the date control, and anything that rises as
 * a card on a phone slides in from the right as a side panel instead.
 *
 * It is also not paged, and it tries not to scroll. A phone shows one view at
 * a time; here the views read all day are one board whose cards flow DOWN a
 * column and wrap into the next, sized so the whole of it is on screen
 * whenever the window can hold it. The views that are only visited (forecast,
 * links, access codes, raw pings) are side panels, opened from the top bar. */
import { createContext, useContext } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Narrower than this is a phone, and gets the phone layout untouched. */
export const WIDE_FROM = 700;
/** Height of the top navigation bar. */
export const NAV_H = 60;
/** The floating filter bar on a wide screen: a little taller, clear of the bottom edge. */
export const WIDE_FILTER_H = 62;
export const WIDE_FILTER_MARGIN = 18;
/** A side panel is never wider than this. */
export const PANEL_W = 600;
/* There is no content column: the board is as wide as the window. */
export const BOARD_GUTTER = 24;
/** Gaps between the board's cards, across and down. */
export const BOARD_GAP_X = 16;
export const BOARD_GAP_Y = 12;
/** A board column is never narrower than this, which caps how many there can be. */
export const BOARD_COLUMN_MIN = 340;

/* The board's column width, for the cards that stand directly on it. The
   board is one wrapping flow, so each card has to be told how wide a column
   is; null everywhere else (a phone, a side panel), where a card just fills
   what holds it. */
export const BoardWidth = createContext<number | null>(null);
export const useBoardWidth = () => useContext(BoardWidth);

/* A CARD's width on the board, when it differs from a column. A phone on its
   side lays its metric tiles and buttons out in narrow columns but gives a
   card (a chart, a table) nearly the whole visible width, or the charts are
   squeezed to a third of the screen. */
export const CardWidth = createContext<number | null>(null);

/* A section's title on the board. It is drawn BY the section's first card
   (its metric tiles) rather than as an item of its own, because a title that
   is its own item can be the last thing in a column, with its section
   starting at the top of the next one. */
export const BoardTitle = createContext<string | null>(null);

/* A phone is never wide, even on its side. Landscape there is 870 points
   across but only 400 tall, and the board's top bar and floating filter bar
   would take a third of that before a single card. A phone on its side keeps
   the phone layout, re-shaped for the short screen (`useLandscape`). */
const PHONE = Platform.OS === 'ios' && !Platform.isPad;

export function useWide(): boolean {
  return !PHONE && useWindowDimensions().width >= WIDE_FROM;
}

/** A phone on its side: one bottom band holds the date, the view picker and
 *  the filter; the alerts stand in a panel on the right; and the board's
 *  views are a strip of three columns that scrolls sideways, never down. */
export function useLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return PHONE && width > height;
}

/** Columns of cards across the visible strip, on a phone on its side. */
export const LANDSCAPE_COLS = 3;
export const LANDSCAPE_GAP = 12;
/** The alerts panel there, not counting the safe inset it pads itself by. */
export const ALERTS_PANEL_W = 240;
/** A board column narrower than this lists its metric tiles one per row, each its own item of the flow. */
export const NARROW_COLUMN = 260;
