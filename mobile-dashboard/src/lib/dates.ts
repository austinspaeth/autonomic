/* Ping counters are bucketed by US Eastern day on the server, so "today" here
   is Eastern too. Mirrors easternDay in mobile/src/lib/ping.ts and the ping
   lambda; move one and you must move the others. */

function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

function isEasternDst(ms: number): boolean {
  const year = new Date(ms).getUTCFullYear();
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 7);
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 6);
  return ms >= start && ms < end;
}

export function easternDay(ms = Date.now()): string {
  const offsetMs = (isEasternDst(ms) ? 4 : 5) * 3600 * 1000;
  return new Date(ms - offsetMs).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of ISO days ending at `end`. */
export function dayRange(end: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addDays(end, -i));
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function shortDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

export function longDate(iso: string): string {
  const wd = WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return `${wd}, ${shortDate(iso)}`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** How much of the current US Eastern day has passed, 0..1. */
export function easternDayFraction(ms = Date.now()): number {
  const offsetMs = (isEasternDst(ms) ? 4 : 5) * 3600 * 1000;
  return (((ms - offsetMs) % 864e5) + 864e5) % 864e5 / 864e5;
}
