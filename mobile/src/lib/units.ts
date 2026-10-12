/**
 * Imperial / metric, as a DISPLAY preference and nothing else.
 *
 * The journal never changes units. Water is stored in litres, weight in pounds,
 * height in inches, distance in miles and pressure in hPa, exactly as before
 * this existed, so an export reads the same on any phone, the scoring and the
 * Insights sweep see one scale, and switching the setting rewrites no data.
 * Everything here converts at the edge: a stored value on its way to the
 * screen, or a typed value on its way to the journal.
 *
 * The active system is ambient (`getUnits`), the way a locale is. The store
 * owns it and re-syncs on every save (`settings.units`); threading it as an
 * argument through the type registry, the trends registry and the report
 * builders would touch every signature in the app to carry one word. Every
 * helper still takes it as an optional last argument, which is what the tests
 * use.
 *
 * Pure apart from that one module variable.
 */

export type UnitSystem = 'imperial' | 'metric';

let active: UnitSystem = 'imperial';

export const getUnits = (): UnitSystem => active;
export function setUnits(u: UnitSystem) { active = u; }

/** The stored choice. IMPERIAL is the default: an install that never chose
 *  reads imperial whatever its region, and metric is always an explicit pick. */
export function resolveUnits(setting: unknown): UnitSystem {
  return setting === 'metric' ? 'metric' : 'imperial';
}

const round = (n: number, dp: number) => { const f = 10 ** dp; return Math.round(n * f) / f; };
const parse = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/* ---------- water (stored: litres) ---------- */

export const L_PER_OZ = 0.0295735;
/** One glass in the water drawer. A quarter litre in BOTH systems, so a glass
 *  tapped under one setting is still exactly one glass under the other; in
 *  ounces that is 8.45, which the drawer calls "about 8 oz". */
export const CUP_L = 0.25;

export const waterUnit = (u: UnitSystem = active) => (u === 'metric' ? 'L' : 'oz');
/** The word, for a label that spells it out ("OR ENTER OUNCES"). */
export const waterUnitWord = (u: UnitSystem = active) => (u === 'metric' ? 'liters' : 'ounces');

/** Litres as a number in the display unit: whole ounces, or litres to `dp`. */
export function waterNum(liters: number, u: UnitSystem = active, dp = 2): number {
  return u === 'metric' ? round(liters, dp) : Math.round(liters / L_PER_OZ);
}
/** "2.5 L" / "85 oz". */
export const fmtWater = (liters: number, u: UnitSystem = active, dp = 2) => `${waterNum(liters, u, dp)} ${waterUnit(u)}`;
/** A typed amount back to litres. Kept to 10 ml, which is finer than an ounce,
 *  so a typed "64" reads back as 64. */
export function waterToL(shown: number, u: UnitSystem = active): number {
  return round(u === 'metric' ? shown : shown * L_PER_OZ, 2);
}
/** "250 ml" / "8 oz": what one glass holds, for the drawer's hint. */
export const cupText = (u: UnitSystem = active) => (u === 'metric' ? '250 ml' : '8 oz');

/* ---------- weight (stored: pounds, as the profile's string) ---------- */

export const LB_PER_KG = 2.20462;
export const weightUnit = (u: UnitSystem = active) => (u === 'metric' ? 'kg' : 'lb');

/** The stored pounds as the text a weight field should show. */
export function weightText(lb: string | undefined, u: UnitSystem = active): string {
  const n = parse(lb);
  if (n == null) return '';
  return u === 'metric' ? String(round(n / LB_PER_KG, 1)) : String(lb).trim();
}
/** Typed text back to stored pounds. */
export function weightToLb(text: string, u: UnitSystem = active): string {
  const n = parse(text);
  if (n == null) return '';
  return u === 'metric' ? String(round(n * LB_PER_KG, 2)) : text.trim();
}
/** "154 lb" / "70 kg", '' when unset. */
export function fmtWeight(lb: string | undefined, u: UnitSystem = active): string {
  const n = parse(lb);
  if (n == null || n <= 0) return '';
  return `${u === 'metric' ? round(n / LB_PER_KG, 1) : round(n, 1)} ${weightUnit(u)}`;
}

/* ---------- height (stored: inches, as the profile's string) ---------- */

export const CM_PER_IN = 2.54;

/** The stored inches as whole centimetres, '' when unset. */
export function heightCmText(inches: string | undefined): string {
  const n = parse(inches);
  return n == null || n <= 0 ? '' : String(Math.round(n * CM_PER_IN));
}
/** Typed centimetres back to stored inches. Two decimals, so 170 cm reads back
 *  as 170 rather than as the nearest whole inch. */
export function cmToInches(text: string): string {
  const n = parse(text);
  return n == null || n <= 0 ? '' : String(round(n / CM_PER_IN, 2));
}
/** `5′ 8″` / "173 cm", '' when unset. */
export function fmtHeight(inches: string | undefined, u: UnitSystem = active): string {
  const n = parse(inches);
  if (n == null || n <= 0) return '';
  if (u === 'metric') return `${Math.round(n * CM_PER_IN)} cm`;
  // Rounded BEFORE the split: 71.6 in is 6′ 0″, never 5′ 12″.
  const total = Math.round(n);
  return `${Math.floor(total / 12)}′ ${total % 12}″`;
}

/* ---------- distance (stored: miles, as an entry's string) ---------- */

export const KM_PER_MI = 1.609344;
export const distUnit = (u: UnitSystem = active) => (u === 'metric' ? 'km' : 'mi');

/** Stored miles as the display number, to two decimals at most. */
export function distNum(mi: unknown, u: UnitSystem = active): number | null {
  const n = parse(mi);
  if (n == null) return null;
  return round(u === 'metric' ? n * KM_PER_MI : n, 2);
}
/** "3.1 mi" / "5 km", '' when unset. */
export function fmtDist(mi: unknown, u: UnitSystem = active): string {
  const n = distNum(mi, u);
  return n == null ? '' : `${n} ${distUnit(u)}`;
}
/** The stored miles as the text a distance field should show. Imperial hands
 *  the stored text back untouched, so an edit form never reformats what was
 *  typed. */
export function distText(mi: unknown, u: UnitSystem = active): string {
  if (u !== 'metric') return mi == null ? '' : String(mi);
  const n = distNum(mi, u);
  return n == null ? '' : String(n);
}
/** Typed text back to stored miles. Three decimals, so 5 km reads back as 5. */
export function distToMi(text: string, u: UnitSystem = active): string {
  if (u !== 'metric') return text.trim();
  const n = parse(text);
  return n == null ? '' : String(round(n / KM_PER_MI, 3));
}

/** "10:24 /mi" / "6:28 /km" from duration (min) and distance (STORED miles).
 *  Null outside a plausible pace, which is a bad field entry rather than a run. */
export function paceStr(durationMin: number, distanceMi: number, u: UnitSystem = active): string | null {
  if (!(durationMin > 0) || !(distanceMi > 0)) return null;
  const secPerMi = (durationMin * 60) / distanceMi;
  if (secPerMi < 120 || secPerMi > 3600) return null;
  const sec = Math.round(u === 'metric' ? secPerMi / KM_PER_MI : secPerMi);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} /${distUnit(u)}`;
}

/* ---------- registry fields ----------
 * A type's field schema declares its unit once, in the stored unit. These three
 * are how a form, a row and a report read such a field without knowing which
 * ones convert. Today that is distance alone. */

/** The unit a field's label should carry. */
export const fieldUnit = (unit: string | undefined, u: UnitSystem = active) => (unit === 'mi' ? distUnit(u) : unit);
/** Stored value → what to show (and what an edit form opens holding). */
export const fieldShown = (unit: string | undefined, v: unknown, u: UnitSystem = active): string =>
  (unit === 'mi' ? distText(v, u) : v == null ? '' : String(v));
/** Typed value → what to store. */
export const fieldStored = (unit: string | undefined, text: string, u: UnitSystem = active): string =>
  (unit === 'mi' ? distToMi(text, u) : text);

/* ---------- barometric pressure (stored: hPa) ---------- */

export const HPA_PER_INHG = 33.8639;
/** A pressure DIFFERENCE in words: "0.20 inHg" / "7 hPa". */
export function fmtPressureGap(hpa: number, u: UnitSystem = active): string {
  return u === 'metric' ? `${Math.round(hpa)} hPa` : `${(hpa / HPA_PER_INHG).toFixed(2)} inHg`;
}
