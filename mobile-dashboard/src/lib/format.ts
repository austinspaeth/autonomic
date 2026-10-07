export function int(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function one(n: number): string {
  return n >= 100 ? int(n) : n.toFixed(1);
}

export function money(n: number, currency = '$'): string {
  const abs = Math.abs(n);
  const body = abs >= 1000 ? `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k` : abs.toFixed(abs >= 100 ? 0 : 2);
  return `${n < 0 ? '−' : ''}${currency}${body}`;
}

export function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : '—';
}
