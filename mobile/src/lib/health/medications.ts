/**
 * A medication dose out of Apple Health, as the journal would write it. Pure +
 * tested — the native read is in ../../../modules/ecg-health, the offer is
 * built in ./updateSet.
 *
 * Two questions, and both of them are about not being wrong.
 *
 * WHICH TYPE IS IT? The Health app's name for a medication is whatever the
 * person picked from Apple's catalogue ("Fexofenadine Hydrochloride 180 mg
 * tablet"), and the journal's name is whatever they typed ("Allegra"). A
 * strict label match therefore imports almost nothing, which is the failure
 * mode that looks like the feature working. So a name is reduced to a
 * CANONICAL form — strength and dose form dropped, a small synonym table
 * applied — and BOTH sides go through it, so brand↔generic matches in either
 * direction. What is deliberately NOT done is fuzzy matching: a prefix or
 * substring rule pairs "Magnesium Citrate" with "Magnesium Glycinate", which
 * are different products with different effects, and the Insights sweep would
 * then report findings about the wrong one. No match is an honest answer, and
 * the import offers to CREATE the type instead (./updateSet).
 *
 * HOW MUCH WAS IT? `doseQuantity` is a number and a `HKUnit`, and the journal's
 * amount field is free text that already holds its unit ("400mg", "1 scoop"),
 * so the unit is kept. A count-based dose says what it is counting when the
 * medication's form is known ("2 capsules"), because "2" on its own is not an
 * amount anybody can read later.
 */

/** Strength tokens: a number with a unit, which says nothing about WHICH
 *  medication this is. "0.1 mg" and "100 mcg" are the same product. */
const STRENGTH = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|µg|g|kg|ml|l|iu|units?|meq|%|mg\/ml|mcg\/ml)\b/g;
/** Dose form and release qualifiers. Salts that distinguish one supplement
 *  from another (citrate, glycinate, oxide, malate) are NOT here on purpose. */
const FORM_WORDS = new Set([
  'tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules', 'cap', 'caps',
  'caplet', 'caplets', 'softgel', 'softgels', 'gelcap', 'gelcaps', 'pill', 'pills',
  'oral', 'orally', 'solution', 'suspension', 'syrup', 'liquid', 'powder',
  'spray', 'drops', 'patch', 'cream', 'ointment', 'lotion', 'foam', 'gel',
  'injection', 'inhaler', 'suppository', 'device',
  'er', 'xr', 'sr', 'cr', 'dr', 'xl', 'la', 'odt', 'ec',
  'hcl', 'hydrochloride',
]);

/** Lowercased, accent-stripped, strength/form/punctuation-free, single-spaced. */
export function normalizeMedName(raw: string): string {
  const flat = String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // café → cafe
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')              // "(generic)" says nothing
    .replace(STRENGTH, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  // Numbers that survived the strength pass are kept: in a medication name
  // they are part of it ("omega 3", "coq10", "vitamin b12"), and Apple's own
  // names always write a strength with its unit, so there is little left to
  // strip. Keeping one can only ever cost a match (the dose is then offered as
  // a new type); dropping one could pair two different products.
  return flat
    .split(' ')
    .filter((w) => w && !FORM_WORDS.has(w))
    .join(' ');
}

/**
 * Synonyms, as normalized-name → normalized-canonical-name.
 *
 * Only pairs that are genuinely the same product: a brand and its active
 * ingredient, or the two spellings of one supplement. Both the Health name and
 * the journal label are resolved through it, so "Allegra" in the journal still
 * matches "fexofenadine" in Health and the reverse.
 */
const SYNONYMS: Record<string, string> = {
  // antihistamines / acid
  fexofenadine: 'allegra',
  famotidine: 'pepsid ac',
  'pepcid ac': 'pepsid ac',      // Apple spells it correctly; the journal does not
  pepcid: 'pepsid ac',
  pepsid: 'pepsid ac',
  loratadine: 'claritin',
  cetirizine: 'zyrtec',
  // supplements
  'coenzyme q10': 'coq10',
  'co q10': 'coq10',
  'coenzyme q 10': 'coq10',
  ubiquinol: 'coq10',
  ubiquinone: 'coq10',
  cholecalciferol: 'vitamin d3',
  'vitamin d': 'vitamin d3',
  'vitamin d 3': 'vitamin d3',
  thiamine: 'vitamin b1',
  thiamin: 'vitamin b1',
  'vitamin b 1': 'vitamin b1',
  'fish oil': 'omega 3',
  omega3: 'omega 3',
  'omega 3 fatty acids': 'omega 3',
  'mag citrate': 'magnesium citrate',
  'magnesium bisglycinate': 'magnesium glycinate',
  'mag glycinate': 'magnesium glycinate',
  'psyllium husk': 'metamucil',
  psyllium: 'metamucil',
  'liquid i v': 'liquid iv',
  'ascorbic acid': 'vitamin c',
  'vitamin b 12': 'vitamin b12',
  cyanocobalamin: 'vitamin b12',
  methylcobalamin: 'vitamin b12',
};

/** The one form both a Health name and a journal label are compared in. */
export const canonicalMedName = (raw: string): string => {
  const n = normalizeMedName(raw);
  return SYNONYMS[n] ?? n;
};

/**
 * The med type key this dose belongs to, or null when the user has no type for
 * it. `labels` is `typesFor(state, 'meds')` reduced to key → label, so a custom
 * type the user created ("Ivabradine") is matched exactly like a built-in.
 *
 * Ties go to the FIRST key in iteration order rather than to a guess: two types
 * that canonicalise the same are already a duplicate the catalog would have
 * refused.
 */
export function matchMedType(name: string, labels: Record<string, string>): string | null {
  const want = canonicalMedName(name);
  if (!want) return null;
  for (const key of Object.keys(labels)) {
    if (canonicalMedName(labels[key]) === want) return key;
  }
  return null;
}

/** What a medication's own name should be called in the journal when a type has
 *  to be created for it: the person's nickname if they set one (that is what
 *  they call it), else Health's name with the strength and form left ON — a
 *  type they will see in a picker forever should read the way the bottle does,
 *  and it is theirs to rename. */
export function medTypeLabel(dose: { name: string; nickname?: string | null }): string {
  const nick = (dose.nickname || '').trim();
  const name = (dose.name || '').trim();
  const label = nick || name;
  // A label the catalog would refuse (blank) is never offered.
  return label.length > 60 ? label.slice(0, 60).trim() : label;
}

/** HKMedicationGeneralForm → what one of them is called, singular/plural. */
const FORM_NOUN: Record<string, [string, string]> = {
  tablet: ['tablet', 'tablets'],
  capsule: ['capsule', 'capsules'],
  drops: ['drop', 'drops'],
  patch: ['patch', 'patches'],
  spray: ['spray', 'sprays'],
  injection: ['injection', 'injections'],
  suppository: ['suppository', 'suppositories'],
  inhaler: ['puff', 'puffs'],
};

/** 1 → "1", 0.5 → "0.5", 2.0 → "2". A dose is read by a person, so it carries
 *  no trailing zeros; three decimals keep a 0.025 mg thyroid dose intact. */
const numText = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * The amount as the journal's free-text dose field should hold it, or null when
 * Health recorded none.
 *
 * A missing dose is NOT zero: plenty of medications are logged as "taken" with
 * no amount, and "0 mg" would be a claim that nothing was taken.
 */
export function medAmountText(dose: {
  dose?: number | null; unit?: string | null; form?: string | null;
}): string | null {
  const n = typeof dose.dose === 'number' && Number.isFinite(dose.dose) ? dose.dose : null;
  if (n == null || n <= 0) return null;
  const unit = (dose.unit || '').trim();
  const qty = numText(n);
  // 'count' is HealthKit's unit for "this many of them", which is not a word
  // anybody writes down. Say what is being counted when the form is known.
  if (!unit || unit === 'count') {
    const noun = FORM_NOUN[(dose.form || '').trim()];
    if (!noun) return qty;
    return `${qty} ${n === 1 ? noun[0] : noun[1]}`;
  }
  return `${qty} ${unit}`;
}
