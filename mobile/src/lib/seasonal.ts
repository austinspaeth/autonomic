/**
 * Seasonal dressing: the weeks the app wears something.
 *
 * Halloween week 2026 runs Sunday the 25th through Saturday the 31st. Day keys
 * are ISO, so a string compare is a date compare. It is decoration only — the
 * nav mark in pumpkin orange, a web in the Outlook card's corner, a spider in
 * the Journal header — and nothing about layout, the accent red or any number
 * changes. Come Sunday November 1st it is simply gone.
 */
export const HALLOWEEN_START = '2026-10-25';
export const HALLOWEEN_END = '2026-10-31';

/** The pumpkin orange the brand mark wears for the week. */
export const PUMPKIN = '#f08a24';

export const isHalloweenWeek = (dk: string): boolean => dk >= HALLOWEEN_START && dk <= HALLOWEEN_END;

/**
 * Thanksgiving 2026 falls on Thursday the 26th; the dressing runs Sunday the
 * 22nd through Friday the 27th, so it covers the travel weekend before and the
 * day after. Decoration only, same as above: the nav mark becomes the brand
 * squiggle read as a turkey (<TurkeyMark/>, a feather fan behind the mark it
 * already is), and nothing else in the app moves. Come Saturday the 28th it is
 * simply gone.
 */
export const THANKSGIVING_START = '2026-11-22';
export const THANKSGIVING_END = '2026-11-27';

export const isThanksgivingWeek = (dk: string): boolean => dk >= THANKSGIVING_START && dk <= THANKSGIVING_END;
