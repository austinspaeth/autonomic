/**
 * Design system — ported from the PWA's CSS variables and refined into one
 * consistent spacing/type scale. Colors match the web app exactly.
 */
export const ACCENT = '#e03127';
export const ACCENT_SOFT = 'rgba(224,49,39,0.12)';

/** Hydration — water amounts/progress render in blue, not the red accent. */
export const WATER_BLUE = '#4a9de0';
export const WATER_BLUE_SOFT = 'rgba(74,157,224,0.14)';

/** Grade / score color scale — identical to SCORE_COLORS in the scoring engine.
 *  Unified with the day-score bands: Excellent → Crash (see SCORE_COLORS). */
export const GRADE_COLORS = {
  great: '#2ee06a',       // Excellent (bright luminous green — the peak tier pops)
  good: '#16a34a',        // Good (deep solid green)
  ok: '#eab308',          // Moderate
  bad: '#f97316',         // Compromised
  crash: '#ef4444',       // Bad
  concerning: '#b91c1c',  // Crash
  warning: '#a78bfa',     // Warning (kept violet)
} as const;

export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  /** Insets that should recede a step below `surface` (rows nested in a card). */
  sunk: string;
  text: string;
  textDim: string;
  border: string;
  accent: string;
  accentSoft: string;
  gaugeTrack: string;
  overlay: string;
}

const dark: Palette = {
  dark: true,
  bg: '#000000',
  surface: '#1a1a1c',
  surface2: '#242427',
  sunk: '#141416',
  text: '#f2f2f5',
  textDim: '#9a9aa0',
  border: '#303034',
  accent: ACCENT,
  accentSoft: ACCENT_SOFT,
  gaugeTrack: 'rgba(0,0,0,0.4)',
  overlay: 'rgba(0,0,0,0.38)',
};

/** One consistent spacing scale (4/8/12/16/20/24). No ad-hoc margins. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const radius = { card: 14, control: 10, pill: 999 } as const;

/**
 * Custom type faces (loaded in app/_layout.tsx via expo-font). Manrope gives the
 * big Progress readout numbers a rounder, more deliberate look; IBM Plex Mono is
 * used for chart tick/axis figures. Reference these family names rather than the
 * raw strings so a weight swap is one edit.
 */
export const fonts = {
  numHeavy: 'Manrope_800ExtraBold',
  numBold: 'Manrope_700Bold',
  numMed: 'Manrope_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
} as const;

/**
 * The dim text that trails a big Progress readout: the unit, then the period the
 * value belongs to ("bpm on 7/27", "ms in July"). Cards that show a value for a
 * period fold that phrase in here rather than parking it in a column of its own,
 * so the whole line reads as one sentence. Either half may be missing (a unitless
 * index still gets its period; a card without one shows just the unit).
 *
 * `when` is the complete phrase, preposition included \u2014 the range decides the
 * wording, so it is built by `bucketWhen` (day/week/month/year) or `onDay` for a
 * plain calendar date, never assembled here.
 *
 * A symbol unit hugs the number on a narrow space, so it reads as part of the
 * value ("56 bpm"). A unit that is a word of its own takes a full space, as does
 * a tail that opens on the phrase because its card has no unit ("82 on 7/27").
 * The string carries its own leading space, so callers render it straight after
 * the value and add no spacing of their own.
 */
const WORD_UNITS = new Set(['days', 'hours', 'mins', 'times', 'litres', 'reps', 'nights', 'asleep', 'in bed', 'dip', 'minutes']);
const NARROW_SPACE = '\u2005';
export const readoutTail = (unit?: string | null, when?: string | null) => {
  const t = [unit || '', when || ''].filter(Boolean).join(' ');
  if (!t) return '';
  return (!unit || WORD_UNITS.has(unit) ? ' ' : NARROW_SPACE) + t;
};

/** Sized between the metric label and the big value it follows. */
export const TAIL_STYLE = (p: { textDim: string }) => ({
  fontSize: 16, fontWeight: '600' as const, fontFamily: undefined, color: p.textDim,
});

/** Type scale: hero number, card title, row label, caption. */
export const type = {
  hero: { fontSize: 57, fontWeight: '800' as const, letterSpacing: -1 },
  h1: { fontSize: 29, fontWeight: '800' as const },
  h2: { fontSize: 21, fontWeight: '700' as const },
  title: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  section: { fontSize: 14, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
};

/** Dark is the only theme now. */
export function usePalette(): Palette {
  return dark;
}
