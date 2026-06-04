// Pure date helpers — ported verbatim from docs/index.html:1290-1349.
// No DOM / RN imports.
import type { DateKey } from '@core/types';

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const pad = (n: number): string => String(n).padStart(2, '0');

export const keyOf = (d: Date): DateKey =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dateFromKey = (k: DateKey): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const nowTime = (): string => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Actual age in years from a YYYY-MM-DD birthday. */
export function ageFromBirthday(bday: string, asOf?: Date): number | null {
  if (!bday) return null;
  const b = dateFromKey(bday);
  if (isNaN(b.getTime())) return null;
  const d = asOf || new Date();
  let a = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) a--;
  return a >= 0 && a < 150 ? a : null;
}

/** "13:30" -> "1:30pm" for display (stored value stays 24h). */
export const fmtTime12 = (t: string | undefined): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  let h = +m[1];
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m[2]}${ap}`;
};

/** Time-of-day bucket: Morning < 10:30am, Afternoon < 4pm, else Night. */
export const periodOf = (t: string | undefined): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return '';
  const mins = +m[1] * 60 + +m[2];
  if (mins < 630) return 'Morning';
  if (mins < 960) return 'Afternoon';
  return 'Night';
};

export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const fmtDateLong = (k: DateKey): string => {
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
