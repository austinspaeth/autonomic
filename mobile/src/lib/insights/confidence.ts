/**
 * "How much should you trust anything on this screen?", as one number.
 *
 * Every finding in Insights carries its own confidence, but those are all
 * conditional on the data being there in the first place, and a user has no way
 * to see that a whole section is empty because their coverage is thin rather than
 * because nothing is happening. This is that missing number, and the ring in the
 * header is the only honest place to put it.
 *
 * It is coverage, not quality: the weights say what the engine actually needs.
 * Trusted HRV readings and logged days carry most of it because almost every
 * outcome and every factor is gated on them; recency and journal span are small
 * modifiers rather than pillars.
 *
 * `topFix` exists so the tap-through can say ONE thing to do. A list of five gaps
 * is a list nobody acts on.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { trustedReadings } from '../hrvQuality';
import type { DaysMap } from '../scoring/day';
import { addDays } from '../dates';
import { engagedDayCount } from '../review/eligibility';
import { dayHasOwnData } from '../demo';

/** The window coverage is judged over. */
export const CONFIDENCE_WINDOW_DAYS = 30;
/** Journal length at which the span component is full — two comparable months. */
export const CONFIDENCE_FULL_SPAN_DAYS = 60;

export interface ConfidencePart {
  key: 'logged' | 'hrv' | 'sleep' | 'recency' | 'span';
  label: string;
  /** 0–1 coverage for this component. */
  ratio: number;
  /** Share of the total this component can contribute. */
  weight: number;
  /** What it currently reads, in the user's terms. */
  detail: string;
  /** What would raise it. Empty when the component is already full. */
  fix: string;
}

export interface DataConfidence {
  /** 0–100, rounded. */
  pct: number;
  parts: ConfidencePart[];
  /** The single highest-impact gap, or null when there isn't one. */
  topFix: string | null;
  /**
   * The header's "N days logged" — days holding something the user entered
   * THEMSELVES, all time.
   *
   * Deliberately not the same count the coverage components use. Connecting
   * Health back-fills a year in one tap, so counting imported days would greet
   * somebody on their second day with "384 days logged", which is both untrue as
   * a statement about them and useless as a sense of how much they have built up.
   * Imported data still counts toward `parts` below, because it genuinely does
   * feed the analysis — the two numbers measure different things on purpose.
   *
   * Shares its definition with the review gate (`engagedDayCount`), which needs
   * exactly the same distinction for exactly the same reason.
   */
  daysLogged: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Days with any trace of the user's input, from ../demo — one definition of
 *  "this day has something in it", shared with `hasOwnData` and the AI sheet's
 *  period picker. */
const isLogged = (days: DaysMap, k: string) => dayHasOwnData(days[k]);

export function dataConfidence(days: DaysMap, dk: string): DataConfidence {
  const window: string[] = [];
  for (let i = CONFIDENCE_WINDOW_DAYS - 1; i >= 0; i--) window.push(addDays(dk, -i));

  let logged = 0, withHrv = 0, withSleep = 0, mostRecent = -1;
  window.forEach((k, i) => {
    if (!isLogged(days, k)) return;
    logged++;
    mostRecent = i;
    const d = days[k];
    if (trustedReadings(d.readings).some((r) => r.type === 'hrv' || r.type === 'breathHrv')) withHrv++;
    if (d.sleep && (d.sleep.bed || d.sleep.wake)) withSleep++;
  });

  const allKeys = Object.keys(days).filter((k) => isLogged(days, k)).sort();
  const spanDays = allKeys.length
    ? Math.round((new Date(allKeys[allKeys.length - 1]).getTime() - new Date(allKeys[0]).getTime()) / 86400000) + 1
    : 0;
  // Days since the last logged day, from the end of the window.
  const staleDays = mostRecent < 0 ? CONFIDENCE_WINDOW_DAYS : CONFIDENCE_WINDOW_DAYS - 1 - mostRecent;

  const N = CONFIDENCE_WINDOW_DAYS;
  const parts: ConfidencePart[] = [
    {
      // "Days with data", not "Days logged": this one counts imported days too,
      // because they feed the analysis. The header's count is stricter — see
      // `daysLogged`.
      key: 'logged', label: 'Days with data', weight: 0.30, ratio: clamp01(logged / N),
      detail: `${logged} of the last ${N} days`,
      fix: logged >= N * 0.85 ? '' : 'Log something on more days. Even one entry makes a day countable.',
    },
    {
      key: 'hrv', label: 'HRV readings', weight: 0.30, ratio: clamp01(withHrv / (N * 0.7)),
      detail: `${withHrv} days with a full HRV reading`,
      fix: withHrv >= N * 0.7 ? '' : 'Take a seated HRV reading on more mornings. It feeds more findings here than anything else.',
    },
    {
      key: 'sleep', label: 'Sleep recorded', weight: 0.20, ratio: clamp01(withSleep / (N * 0.85)),
      detail: `${withSleep} of ${N} nights`,
      fix: withSleep >= N * 0.85 ? '' : 'Record bed and wake times, or connect Health so nights fill in on their own.',
    },
    {
      key: 'recency', label: 'Up to date', weight: 0.10, ratio: clamp01(1 - staleDays / 7),
      detail: staleDays <= 0 ? 'Logged today' : staleDays === 1 ? 'Last logged yesterday' : `Last logged ${staleDays} days ago`,
      fix: staleDays <= 1 ? '' : 'Log today. Recent days carry the most weight in every comparison.',
    },
    {
      key: 'span', label: 'History', weight: 0.10, ratio: clamp01(spanDays / CONFIDENCE_FULL_SPAN_DAYS),
      detail: spanDays ? `${spanDays} days of history` : 'No history yet',
      fix: spanDays >= CONFIDENCE_FULL_SPAN_DAYS ? '' : `Keep going. Comparisons need two months to be solid; you have ${spanDays}.`,
    },
  ];

  const pct = Math.round(parts.reduce((s, p) => s + p.ratio * p.weight, 0) * 100);
  // Highest-impact gap: the biggest weighted shortfall, not the smallest ratio —
  // a half-empty 30% component matters more than an empty 10% one.
  const gaps = parts.filter((p) => p.fix).sort((a, b) => (1 - a.ratio) * a.weight - (1 - b.ratio) * b.weight);
  return { pct, parts, topFix: gaps.length ? gaps[gaps.length - 1].fix : null, daysLogged: engagedDayCount(days) };
}
