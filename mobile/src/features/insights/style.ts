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
 * The rule that follows from that: every padding, margin, font size and line
 * height that affects layout belongs HERE, not inline in either file. Colour and
 * anything else purely visual can stay at the call site.
 */
import type { TextStyle, ViewStyle } from 'react-native';
import { VISIBLE_CORRELATIONS } from '../../lib/insights';

/** Green for "this is working". Accent red is the palette's, for "this isn't". */
export const GOOD = '#3ec46d';

/* ---------- containers ---------- */

/** The headline card. Softer than the app's `radius.card` per the design comp. */
export const PANEL: ViewStyle = { borderWidth: 1, borderRadius: 20, padding: 15 };

/** Every list row: correlations, observations, trend watch. */
export const ROW: ViewStyle = { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 9 };

/** Trend watch rows are shorter and wider than the others. */
export const WATCH_ROW: ViewStyle = { borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 9 };

/** The uppercase section heading band. */
export const SECTION_BAND: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 };

/** "Show all N". */
export const SHOW_ALL: ViewStyle = { alignItems: 'center', paddingVertical: 12, borderRadius: 999, borderWidth: 1, marginTop: 1 };

/* ---------- type ---------- */

export const SECTION_LABEL: TextStyle = { fontSize: 12, fontWeight: '700', letterSpacing: 1.4 };
export const SECTION_RIGHT: TextStyle = { fontSize: 12 };

export const EYEBROW: TextStyle = { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 };
export const HEADLINE: TextStyle = { fontSize: 18.5, fontWeight: '700', letterSpacing: -0.3 };
export const BODY: TextStyle = { fontSize: 13, lineHeight: 19.5 };
export const BAR_LABEL: TextStyle = { fontSize: 11 };
export const BAR_VALUE: TextStyle = { fontSize: 18, fontWeight: '700' };
export const CONF_LABEL: TextStyle = { fontSize: 12 };
export const CONF_WORD: TextStyle = { fontSize: 12.5, fontWeight: '700' };

export const PAIR_TEXT: TextStyle = { fontSize: 14, fontWeight: '700' };
export const R_VALUE: TextStyle = { fontSize: 16.5, fontWeight: '700' };
export const ROW_NOTE: TextStyle = { fontSize: 12 };

export const OBS_TITLE: TextStyle = { fontSize: 13.5, fontWeight: '700' };
export const OBS_BODY: TextStyle = { fontSize: 12.5, lineHeight: 18 };

export const WATCH_TITLE: TextStyle = { fontSize: 13.5, fontWeight: '700' };
export const WATCH_SUB: TextStyle = { fontSize: 12 };
export const WATCH_VALUE: TextStyle = { fontSize: 13.5, fontWeight: '700' };

export const FOOTER_TEXT: TextStyle = { fontSize: 11.5, lineHeight: 17 };
export const SHOW_ALL_TEXT: TextStyle = { fontSize: 13.5, fontWeight: '600' };

/* ---------- fixed sizes ---------- */

/** The before/after bars in the headline card. */
export const BAR_H = 9;
/** Trend watch sparkline. */
export const SPARK_W = 64;
export const SPARK_H = 26;
/** How many correlation rows are visible before "Show all". Re-exported from the
 *  engine rather than copied, so the skeleton and the list cannot disagree about
 *  how many rows to draw. */
export const VISIBLE_ROWS = VISIBLE_CORRELATIONS;

/** Confidence pips. */
export const PIP_H = 5;
export const PIP_W = 13;
export const PIP_W_WIDE = 14;

/* ---------- gaps the skeleton has to reproduce ---------- */

export const EYEBROW_GAP = 11;      // eyebrow row -> headline
export const HEADLINE_GAP = 6;      // headline -> body
export const BODY_GAP = 15;         // body -> bars
export const BARS_GAP = 14;         // bars -> confidence footer
export const BAR_LABEL_GAP = 6;     // "Before" -> bar
export const BAR_VALUE_GAP = 7;     // bar -> value
export const CONF_PAD = 12;         // confidence footer's top padding
export const PAIR_GAP = 9;          // correlation pair row -> pips row
export const OBS_TITLE_GAP = 3;     // observation title -> body
export const WATCH_TITLE_GAP = 2;   // watch title -> sub
export const FOOTER_TOP = 18;
export const FOOTER_BOTTOM = 4;

/**
 * Text the skeleton measures against.
 *
 * These are real strings the engine produces, at representative length, because
 * `TextGhost` sizes itself from an invisible copy of the sample in the real style.
 * A short sample under-reserves and the content jumps; that is the entire class of
 * bug this file prevents. Wrapping does the work, so length matters more than
 * wording.
 */
export const SAMPLE = {
  // The multi-line ones, where length genuinely decides the reserved height.
  headline: 'Diastolic pressure is up since you started magnesium glycinate',
  body: 'In the 26 days since, diastolic pressure ran 38.5 mmHg higher than the 26 days before. This is an association in your own log, not proof of a cause.',
  obsTitle: 'Headache and postural lightheadedness travel together',
  obsBody: 'RMSSD before noon averages 3.6 ms above the other half of the day, across 194 readings. Taking readings at a consistent hour makes every trend here sharper.',
  rowNote: 'Next day · 47.9 vs 28.4 ms · 34 days with it, 26 without',
  // Single-line ones. Their height comes from font metrics rather than wrapping,
  // so these only set the ghost's WIDTH, and they are sized to the longest real
  // value so the block never looks narrower than the number it replaces.
  barValue: '2797 ms²',
  confWord: 'Very strong',
  driver: 'Magnesium Glycinate',
  metric: 'SDNN',
  rValue: '+0.68',
  watchTitle: 'Bedtime consistency',
  watchSub: 'Steadier by 40 min vs last month',
  watchValue: '2797 ms²',
} as const;
