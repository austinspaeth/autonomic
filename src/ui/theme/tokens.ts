// Theme tokens — a 1:1 port of the CSS custom properties in docs/index.html
// (`:root` + `html[data-theme=...]`, lines 16-59). The 279 `var(--x)` usages in
// the legacy app become `theme.x` references via useTheme().
import type { ThemeName } from '@core/types';

/** Theme-independent design tokens (legacy `:root`). */
export const base = {
  accent: '#e03127',
  accentSoft: 'rgba(224, 49, 39, 0.12)',
  radius: 14,
  radiusSm: 10,
  gap: 14,
  maxw: 640,
  // RN resolves the platform system font when fontFamily is undefined; on web we
  // set the same Apple/system stack the legacy app used via a global style.
  fontFamily: undefined as string | undefined,
} as const;

/** Theme-dependent tokens. Color-with-alpha values use rgba()/8-digit hex,
 *  both of which React Native accepts. */
export interface Tokens {
  // theme-dependent
  bg: string;
  bgGlass: string;
  surface: string;
  surface2: string;
  text: string;
  textDim: string;
  border: string;
  glassBg: string;
  glassBorder: string;
  glassActive: string;
  gaugeTrack: string;
  headerGlass: string;
  headerLine: string;
  /** box-shadow split into RN shadow props (legacy `--shadow`). */
  shadow: Shadow;
  // theme-independent (folded in for convenience)
  accent: string;
  accentSoft: string;
  radius: number;
  radiusSm: number;
  gap: number;
  maxw: number;
  fontFamily: string | undefined;
}

export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

const light: Tokens = {
  bg: '#f5f5f7',
  bgGlass: 'rgba(245, 245, 247, 0.96)',
  surface: '#ffffff',
  surface2: '#f0f0f3',
  text: '#1c1c1e',
  textDim: '#6b6b70',
  border: '#e3e3e8',
  glassBg: 'rgba(255, 255, 255, 0.55)',
  glassBorder: 'rgba(255, 255, 255, 0.7)',
  glassActive: 'rgba(0, 0, 0, 0.07)',
  gaugeTrack: '#aaaaaa66',
  headerGlass: 'rgba(245, 245, 247, 0.88)',
  headerLine: '#b8b8be',
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  ...base,
};

const dark: Tokens = {
  bg: '#000000',
  bgGlass: 'rgba(0, 0, 0, 0.96)',
  surface: '#1a1a1c',
  surface2: '#242427',
  text: '#f2f2f5',
  textDim: '#9a9aa0',
  border: '#303034',
  glassBg: 'rgba(28, 28, 30, 0.55)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassActive: 'rgba(255, 255, 255, 0.14)',
  gaugeTrack: '#00000066',
  headerGlass: 'rgba(0, 0, 0, 0.88)',
  headerLine: '#4d4d50',
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  ...base,
};

export const THEMES: Record<ThemeName, Tokens> = { light, dark };

/** The web/system font stack the legacy app used (applied globally on web). */
export const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
