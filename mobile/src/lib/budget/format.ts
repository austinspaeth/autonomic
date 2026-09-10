/**
 * How the budget says a quantity of time.
 *
 * The app already has `fmtDuration` in lib/dates, but it writes "45 min" and
 * "1h 5m", and the design writes "45m" and "1h 05m" — the two-digit minute
 * matters because these figures sit in a tabular-numeral row where a jumping
 * width reads as the number changing. Kept here rather than added to
 * lib/dates so the rest of the app's durations do not silently restyle.
 *
 * Pure.
 */

/** "3h 20m", "45m", "1h 05m". Negative values lose their sign — the caller
 *  decides whether a negative reads as "over by" or as a credit. */
export function hm(min: number): string {
  const m = Math.max(0, Math.round(Math.abs(min)));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${String(rest).padStart(2, '0')}m` : `${h}h`;
}

/** The provisional form: "About 3h", "About 4h 30m".
 *
 *  Rounded to the half hour because the language has to match the graphic. A
 *  hatched bar under a figure of "3h 17m" tells the reader two different
 *  things about the same estimate, and they will believe the number. */
export function about(min: number): string {
  const m = Math.max(0, Math.round(Math.abs(min) / 30) * 30);
  if (m < 60) return `About ${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `About ${h}h 30m` : `About ${h}h`;
}

/** "4:10pm" — the clock form used by the pace projection and the drill-in's
 *  stretch times. `min` is minutes past local midnight. */
export function clock(min: number): string {
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 < 12 ? 'am' : 'pm';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

/** "6,400" — a step count, grouped so it can be read at a glance. */
export function steps(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
