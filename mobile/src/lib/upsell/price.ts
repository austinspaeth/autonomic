/**
 * Reading and re-writing the localized price strings StoreKit / Play return
 * ("$29.99", "29,99 €", "1.234,56 kr", "¥3,500"). Pure, so the offer cards'
 * arithmetic can be tested in every currency shape they will meet.
 */

interface ParsedPrice {
  /** The numeric run exactly as it appeared in the string. */
  match: string;
  amount: number;
  /** The decimal separator this price uses ('.' when it shows none). */
  decimal: '.' | ',';
  /** Digits after the decimal separator (0 for "¥3,500"). */
  places: number;
}

function parsePrice(s: string): ParsedPrice | null {
  const m = s.match(/\d[\d.,\s]*\d|\d/);
  if (!m) return null;
  const raw = m[0].replace(/\s/g, '');
  // The LAST separator is the decimal point when two or fewer digits follow it;
  // with three after it, it is a grouping separator ("¥3,500", "1.234").
  const lastSep = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  const hasDecimal = lastSep >= 0 && raw.length - lastSep <= 3;
  const norm = hasDecimal
    ? `${raw.slice(0, lastSep).replace(/[.,]/g, '')}.${raw.slice(lastSep + 1)}`
    : raw.replace(/[.,]/g, '');
  const amount = parseFloat(norm);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  let decimal: '.' | ',' = '.';
  if (hasDecimal) decimal = raw[lastSep] as '.' | ',';
  else if (lastSep >= 0 && raw[lastSep] === '.') decimal = ',';   // "1.234" groups with '.'
  return { match: m[0], amount, decimal, places: hasDecimal ? raw.length - lastSep - 1 : 0 };
}

/** The numeric amount of a localized price, or null when it doesn't parse. */
export function priceAmount(s: string): number | null {
  return parsePrice(s)?.amount ?? null;
}

/**
 * Monthly equivalent of a localized yearly price, keeping whatever currency
 * shape the store handed us — symbol, its position and the decimal separator
 * ("29,99 €" → "2,50 €"). Null when the price doesn't parse, in which case the
 * caller leaves the clause off rather than guessing at it.
 *
 * Two precisions, because the offer card needs both. `precise` is the EXACT
 * division in the currency's own minor units, printed beside the real yearly
 * price where a rounded figure would not multiply back up. Otherwise it is the
 * figure the sentence says "about" in front of: whole units once the amount is
 * large enough that cents are noise, two places below that, since "about $2"
 * for $2.50 undersells the monthly cost by a fifth.
 */
export function perMonth(price: string, precise: boolean): string | null {
  const p = parsePrice(price);
  if (!p) return null;
  const each = p.amount / 12;
  const places = precise ? p.places : (each >= 10 ? 0 : p.places);
  const text = each.toFixed(places).replace('.', p.decimal);
  return price.replace(p.match, text);
}
