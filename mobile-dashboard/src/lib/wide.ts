/* The wide layout: an iPad, or the app's window on a Mac. There the bar that
 * sits at the bottom of a phone moves to the top, the filter bar floats at the
 * bottom on its own and carries the date control, and anything that rises as
 * a card on a phone slides in from the right as a side panel instead.
 *
 * It is also not paged. A phone shows one view at a time; here every view is
 * on one board, as sections laid out in columns, because this is left open
 * beside other work as a command centre and nothing should be a tap away. */
import { useWindowDimensions } from 'react-native';

/** Narrower than this is a phone, and gets the phone layout untouched. */
export const WIDE_FROM = 700;
/** Height of the top navigation bar. */
export const NAV_H = 60;
/** The floating filter bar on a wide screen: a little taller, clear of the bottom edge. */
export const WIDE_FILTER_H = 62;
export const WIDE_FILTER_MARGIN = 18;
/** A side panel is never wider than this. */
export const PANEL_W = 400;
/* There is no content column: the board is as wide as the window, and gains
   columns as it grows (a window on a Mac is dragged to whatever suits). */
const COLUMN_MIN = 470;
export const BOARD_GUTTER = 24;
export const MAX_COLUMNS = 3;

/** How many columns of sections the wide board has at this window width. */
export function useColumns(): number {
  const w = useWindowDimensions().width;
  return w < WIDE_FROM ? 1 : Math.max(1, Math.min(MAX_COLUMNS, Math.floor((w - BOARD_GUTTER * 2) / COLUMN_MIN)));
}

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_FROM;
}
