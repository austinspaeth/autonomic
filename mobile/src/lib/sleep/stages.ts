/**
 * Sleep-stage identity, shared by every surface that draws stages: the
 * Journal's "Last night" card, the sleep report's totals and hypnogram.
 *
 * Apple-Health-like: deep violet → REM light blue → core blue, awake neutral.
 * Validated for CVD separation + contrast on the dark surface; identity is
 * also carried by the labeled legend, never colour alone.
 *
 * Pure data (no React, no store) so it can be imported from lib and features
 * alike, and so there is exactly ONE set of stage hexes in the app.
 */
import type { SleepStages } from '../types';

export const STAGE_COLORS = { deep: '#8b5cf6', rem: '#3d93ee', core: '#2f66d0', awake: '#71717a' } as const;
export const STAGE_ORDER = ['deep', 'rem', 'core', 'awake'] as const;
export const STAGE_LABEL = { deep: 'Deep', rem: 'REM', core: 'Core', awake: 'Awake' } as const;

export type StageKey = (typeof STAGE_ORDER)[number];

/** Minutes as "7h 42m" / "42m" / "7h". */
export const fmtMin = (min: number) => {
  const t = Math.max(0, Math.round(min));
  const h = Math.floor(t / 60), m = t % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

/** Minutes actually asleep in a stage breakdown (awake-in-bed excluded). */
export const asleepMinutes = (s: SleepStages) => s.deep + s.rem + s.core;

/** Minutes the breakdown covers in total, awake included. */
export const stageTotalMinutes = (s: SleepStages) => s.deep + s.rem + s.core + s.awake;
