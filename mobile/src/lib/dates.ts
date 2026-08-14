/** Date/time helpers ported from the PWA. */

export const pad = (n: number) => String(n).padStart(2, '0');

export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dateFromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = () => keyOf(new Date());

export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Default clock time for a new entry on day `dk`: the current time when
 *  logging today; 23:59 when back-filling a past day (e.g. logging just after
 *  midnight for yesterday) so the entry sorts inside that day. */
export const defaultTimeFor = (dk: string) => (dk === todayKey() ? nowTime() : '23:59');

export const addDays = (k: string, delta: number) => {
  const d = dateFromKey(k);
  d.setDate(d.getDate() + delta);
  return keyOf(d);
};

/** "13:30" -> "1:30pm" for display (stored value stays 24h). */
export const fmtTime12 = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  let h = +m[1];
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m[2]}${ap}`;
};

const clockMins = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
};

/** Minutes from one "HH:MM" to another on the same day. Null unless the end is
 *  genuinely after the start: a symptom whose end reads earlier either crossed
 *  midnight (a different day, so this entry can't say how long) or was mistyped,
 *  and inventing a negative or wrapped duration is worse than showing none. */
export const minsBetween = (start?: string, end?: string): number | null => {
  const a = clockMins(start);
  const b = clockMins(end);
  if (a == null || b == null || b <= a) return null;
  return b - a;
};

/** Minutes as a duration a person reads rather than converts: "2h 15m", "45 min". */
export const fmtDuration = (mins: number) => {
  const m = Math.round(Math.abs(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};

/** Time-of-day bucket: Morning < 10:30am, Afternoon < 4pm, else Evening. */
export const periodOf = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return '';
  const mins = +m[1] * 60 + +m[2];
  if (mins < 630) return 'Morning';
  if (mins < 960) return 'Afternoon';
  return 'Evening';
};

export const fmtDateLong = (k: string) => {
  const d = dateFromKey(k);
  const today = keyOf(new Date());
  const yest = keyOf(new Date(Date.now() - 86400000));
  const tom = keyOf(new Date(Date.now() + 86400000));
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  if (k === tom) return 'Tomorrow';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

export const fmtShort = (dk: string) =>
  dateFromKey(dk).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** "1st", "2nd", "11th", "23rd". The teens are the exception every naive version
 *  gets wrong (11th, not 11st). */
const ordinal = (n: number) => {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
};

/** "2026-07-01" -> "July 1st". For dates inside SENTENCES: a bare ISO key reads as
 *  a database field, and the year is noise when the copy is about the recent past. */
export const fmtMonthDay = (k: string) => {
  const d = dateFromKey(k);
  if (isNaN(d.getTime())) return k;
  return `${d.toLocaleDateString(undefined, { month: 'long' })} ${d.getDate()}${ordinal(d.getDate())}`;
};

/** "1990-01-31" -> "January 31, 1990" for display (stored value stays ISO). */
export const fmtDateFull = (k: string) => {
  const d = dateFromKey(k);
  if (isNaN(d.getTime())) return k;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

/** Human-readable timestamp (menu footer). */
export const fmtStamp = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Actual age in years from a YYYY-MM-DD birthday. */
export function ageFromBirthday(bday?: string, asOf?: Date): number | null {
  if (!bday) return null;
  const b = dateFromKey(bday);
  if (isNaN(b.getTime())) return null;
  const d = asOf || new Date();
  let a = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) a--;
  return a >= 0 && a < 150 ? a : null;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};
