/**
 * Seasonal dressing: the one week a year the app wears something.
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
