/**
 * Apple Health symptoms → the journal's own symptom types. Pure + tested.
 *
 * HealthKit has a fixed list of ~40 symptom category types and the journal has
 * its own list, written for this population. This is the JOIN, by hand, and it
 * is deliberately conservative: a symptom filed under the wrong name is worse
 * than one not imported at all, because it becomes a row in the Insights sweep
 * and a claim about somebody's body. So a HealthKit type is mapped only where
 * the journal has a type that means the SAME THING, and every omission below is
 * a decision rather than an oversight.
 *
 * Two HealthKit types may map to one journal type (runny nose and sinus
 * congestion are both "Congestion / runny nose"); the import's own
 * same-type-within-10-minutes dedup then files one entry, which is the right
 * answer — the journal has one word for it.
 *
 * NOT mapped, on purpose:
 *  - Diarrhea, constipation: the journal tracks these as BOWEL MOVEMENTS, with
 *    a Bristol form that grades them (src/lib/digestion.ts). Importing them as
 *    symptoms too would count one event twice, in two different places, and
 *    the gut rules read movements rather than symptoms.
 *  - Vomiting: nausea is the nearest type and is not the same event.
 *  - Fever, chills-adjacent "generalized body ache", coughing, wheezing,
 *    shortness-of-breath-adjacent "rapid breathing", loss of smell/taste,
 *    sore throat's neighbours: the journal has `sick` as one type for being
 *    unwell and no per-symptom equivalents, and filing a fever under "Sick"
 *    would make every cold look like a flare.
 *  - Acne, dry skin, hair loss, appetite changes, bladder incontinence, pelvic
 *    pain, vaginal dryness, sleep changes, lower back pain's neighbours: no
 *    journal type, and inventing one from an import is the type catalog's job
 *    (the user's), not a mapping's.
 *  - Sexual activity, contraceptive, lactation, pregnancy, the test results:
 *    not symptoms, and the cycle module owns that ground.
 */

/** HealthKit category identifier → journal symptom type key (registry). */
export const SYMPTOM_IMPORT: Record<string, string> = {
  HKCategoryTypeIdentifierAbdominalCramps: 'cramps',
  HKCategoryTypeIdentifierBloating: 'bloating',
  HKCategoryTypeIdentifierBreastPain: 'breastTenderness',
  HKCategoryTypeIdentifierChestTightnessOrPain: 'chestPain',
  HKCategoryTypeIdentifierChills: 'chills',
  HKCategoryTypeIdentifierDizziness: 'lightHeaded',
  HKCategoryTypeIdentifierFainting: 'syncope',
  HKCategoryTypeIdentifierFatigue: 'fatigue',
  HKCategoryTypeIdentifierHeadache: 'headache',
  HKCategoryTypeIdentifierHeartburn: 'reflux',
  HKCategoryTypeIdentifierHotFlashes: 'flushing',
  HKCategoryTypeIdentifierLowerBackPain: 'backPain',
  // Apple's name for it; "brain fog" is what everybody in this population
  // calls the same thing, and it is the journal's own word.
  HKCategoryTypeIdentifierMemoryLapse: 'brainFog',
  HKCategoryTypeIdentifierMoodChanges: 'moodChanges',
  HKCategoryTypeIdentifierNausea: 'nausea',
  HKCategoryTypeIdentifierNightSweats: 'sweating',
  HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat: 'palpitations',
  HKCategoryTypeIdentifierRunnyNose: 'congestion',
  HKCategoryTypeIdentifierShortnessOfBreath: 'shortnessOfBreath',
  HKCategoryTypeIdentifierSinusCongestion: 'congestion',
  HKCategoryTypeIdentifierSkippedHeartbeat: 'palpitations',
  HKCategoryTypeIdentifierSoreThroat: 'soreThroat',
  HKCategoryTypeIdentifierThroatTightness: 'throatTightness',
};

/** Every HealthKit type worth asking permission for — the map's own keys, so
 *  the permission set and the mapping can never disagree. */
export const SYMPTOM_READ_IDS: string[] = Object.keys(SYMPTOM_IMPORT).sort();

/**
 * What a symptom sample's `value` means for us.
 *
 * Symptom types carry either `HKCategoryValueSeverity` (0 unspecified,
 * 1 notPresent, 2 mild, 3 moderate, 4 severe) or `HKCategoryValuePresence`
 * (0 present, 1 notPresent). The two overlap usefully: **1 is notPresent in
 * both**, and 0 is "it happened, with no grade" in both. So one rule reads
 * either enum, and the one case that must never be imported — the person
 * recording that they did NOT have the symptom — is the one value both enums
 * agree on.
 *
 * Returns the severity word for the row, `''` for an ungraded present sample,
 * or null when the sample is not an occurrence at all.
 */
export function symptomSeverity(value: number): string | null {
  if (value === 1) return null;       // notPresent, in both enums
  if (value === 0) return '';         // present / unspecified
  if (value === 2) return 'Mild';
  if (value === 3) return 'Moderate';
  if (value === 4) return 'Severe';
  return null;                        // a value from an enum we do not know
}
