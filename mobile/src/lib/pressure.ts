/**
 * Barometric pressure, as the phone's own barometer saw it.
 *
 * WHY THIS EXISTS AT ALL, and why it is so quiet about it: plenty of people with
 * dysautonomia are sure the weather gets to them, and some of them are right. The
 * app cannot know which from a textbook, so it does not say anything to anybody by
 * default. Pressure is recorded in the background, becomes one more generated
 * factor in the Insights sweep (`pressure:low` in ./insights/factors), and is only
 * ever SHOWN once that sweep finds low-pressure days genuinely linked to one of this
 * person's own measures, through the same false-discovery correction every other
 * claim passes. No link, no feature.
 *
 * WHAT "LOW" MEANS, and why it is relative. Sea-level pressure means nothing to
 * somebody who lives at 5,000 feet, and the phone reads the air where it is, not a
 * weather station's sea-level figure. So a day is low against the user's OWN
 * recent normal: its median sits `LOW_BELOW_INHG` or more under the median of the
 * previous `BASELINE_DAYS` days. That is also the rule the Journal's warning card
 * asks of today, so the card can never fire on a day the finding would not have
 * counted.
 *
 * WHAT THE BAROMETER GETS WRONG. It measures altitude as much as weather: an
 * elevator is a third of a millibar a floor, and a drive into the hills is ten.
 * Two defences, both cheap: a day is its MEDIAN sample (an elevator ride is one
 * reading among several), and a day further than `ALTITUDE_JUMP_HPA` from normal is
 * UNKNOWN rather than low, because weather does not move that far in a day and a
 * trip does. A week somewhere higher will still read as a low week. That is the
 * honest limit of a sensor with no location, and it costs a finding rather than
 * inventing one: the trip's days land in the "low" group with outcomes unrelated to
 * the weather, which dilutes a real link rather than faking one.
 *
 * Storage is `state.pressure`, TOP LEVEL and never on a day record: a day that
 * holds nothing but an automatic sensor reading must not count as a day the user
 * logged (`hasOwnData`, engaged days, the review ask and the Insights day count all
 * read `state.days`). Hectopascals inside, inches of mercury on screen.
 *
 * Pure: no store, no expo, no React.
 */

/** One day's samples, keyed by the hour they were taken ("08"), in hPa. One per
 *  hour at most, the latest winning, which is what bounds the map and what stops
 *  a burst of foregrounds from weighting the median toward one moment. */
export type PressureDay = Record<string, number>;
/** Day key → that day's samples. */
export type PressureMap = Record<string, PressureDay>;

export const HPA_PER_INHG = 33.8639;
/** How far under the user's own normal a day has to sit to be LOW. 0.20 inHg is
 *  about 6.8 hPa: a proper low-pressure system, not a front's passing wobble, and
 *  on a typical mid-latitude year somewhere near one day in six. */
export const LOW_BELOW_INHG = 0.2;
export const LOW_BELOW_HPA = LOW_BELOW_INHG * HPA_PER_INHG;
/** Past this far from normal it is the phone that moved, not the air. */
export const ALTITUDE_JUMP_HPA = 30;
/** The window "your usual" is read from, and how much of it must be known. */
export const BASELINE_DAYS = 30;
export const BASELINE_MIN_DAYS = 7;
/** Days of samples kept. The analysis reads 180 days plus a month of baseline
 *  before the first of them; anything older is never read again. */
export const KEEP_DAYS = 240;

/** A plausible reading from a phone on Earth, sea level to a high pass. */
export const isPlausibleHpa = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 500 && v < 1100;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A day's pressure: the median of its samples, or null with none. */
export function dayPressure(map: PressureMap | undefined, dk: string): number | null {
  const d = map && map[dk];
  return d ? median(Object.values(d).filter(isPlausibleHpa)) : null;
}

/** Day keys in ISO form subtract cleanly once parsed as UTC midnight. */
function shiftKey(dk: string, delta: number): string {
  const t = Date.UTC(+dk.slice(0, 4), +dk.slice(5, 7) - 1, +dk.slice(8, 10)) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The user's own normal going INTO `dk`: the median day over the previous
 *  BASELINE_DAYS, excluding `dk` itself (a day must not be graded against an
 *  average it is part of). Null until BASELINE_MIN_DAYS of them are known. */
export function pressureBaseline(map: PressureMap | undefined, dk: string): number | null {
  if (!map) return null;
  const days: number[] = [];
  for (let i = 1; i <= BASELINE_DAYS; i++) {
    const v = dayPressure(map, shiftKey(dk, -i));
    if (v != null) days.push(v);
  }
  return days.length >= BASELINE_MIN_DAYS ? median(days) : null;
}

export interface PressureReading {
  /** The day's median, hPa. */
  hpa: number;
  /** The normal it was read against, hPa. */
  baseline: number;
  /** How far under normal, hPa (negative when above). */
  below: number;
  low: boolean;
}

/** The whole verdict for one day, or null when it cannot be judged: no samples,
 *  no baseline yet, or a jump only a change of altitude explains. */
export function readPressure(map: PressureMap | undefined, dk: string): PressureReading | null {
  const hpa = dayPressure(map, dk);
  if (hpa == null) return null;
  const baseline = pressureBaseline(map, dk);
  if (baseline == null) return null;
  const below = baseline - hpa;
  if (Math.abs(below) > ALTITUDE_JUMP_HPA) return null;
  return { hpa, baseline, below, low: below >= LOW_BELOW_HPA };
}

/** 1 for a low day, 0 for an ordinary one, null for unknown: the factor column. */
export function lowPressureValue(map: PressureMap | undefined, dk: string): number | null {
  const r = readPressure(map, dk);
  return r ? (r.low ? 1 : 0) : null;
}

/**
 * The map with one more sample in it, as a NEW object (so anything memoized on
 * `state.pressure` sees the change), trimmed to KEEP_DAYS. An implausible
 * reading is dropped rather than stored.
 */
export function addPressureSample(map: PressureMap | undefined, dk: string, hour: number, hpa: number): PressureMap {
  const base = map || {};
  if (!isPlausibleHpa(hpa)) return base;
  const hh = String(Math.max(0, Math.min(23, Math.floor(hour)))).padStart(2, '0');
  const next: PressureMap = { ...base, [dk]: { ...(base[dk] || {}), [hh]: Math.round(hpa * 10) / 10 } };
  const oldest = shiftKey(dk, -KEEP_DAYS);
  for (const k of Object.keys(next)) if (k < oldest) delete next[k];
  return next;
}

/** Days holding at least one sample, oldest first. */
export function pressureDays(map: PressureMap | undefined): string[] {
  return map ? Object.keys(map).filter((k) => dayPressure(map, k) != null).sort() : [];
}

/** "29.72" — inches of mercury to two places, the way US weather reports it. */
export const fmtInHg = (hpa: number) => (hpa / HPA_PER_INHG).toFixed(2);
