/**
 * The Apple Health → journal symptom join. Two things are load-bearing: every
 * target must be a real symptom type (a typo here files entries under a type no
 * picker can show), and a sample saying the symptom was NOT present must never
 * become an entry.
 */
import { SYMPTOM_IMPORT, SYMPTOM_READ_IDS, symptomSeverity } from '../symptomMap';
import { SYMPTOM_TYPES } from '../../registry';

describe('SYMPTOM_IMPORT', () => {
  it('maps only onto real journal symptom types', () => {
    const missing = Object.entries(SYMPTOM_IMPORT).filter(([, type]) => !SYMPTOM_TYPES[type]);
    expect(missing).toEqual([]);
  });

  it('only ever names HealthKit category identifiers', () => {
    const bad = Object.keys(SYMPTOM_IMPORT).filter((id) => !id.startsWith('HKCategoryTypeIdentifier'));
    expect(bad).toEqual([]);
  });

  it('asks permission for exactly what it can file', () => {
    expect([...SYMPTOM_READ_IDS].sort()).toEqual(Object.keys(SYMPTOM_IMPORT).sort());
  });

  it('leaves the gut to the digestion log', () => {
    // Diarrhea and constipation are bowel movements with a Bristol form in this
    // app, so importing them as symptoms would count one event twice.
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierDiarrhea).toBeUndefined();
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierConstipation).toBeUndefined();
  });

  it('covers the symptoms this population actually logs', () => {
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierDizziness).toBe('lightHeaded');
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierFainting).toBe('syncope');
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierFatigue).toBe('fatigue');
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat).toBe('palpitations');
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierChestTightnessOrPain).toBe('chestPain');
    expect(SYMPTOM_IMPORT.HKCategoryTypeIdentifierMemoryLapse).toBe('brainFog');
  });
});

describe('symptomSeverity', () => {
  it('never imports a sample recording that the symptom was ABSENT', () => {
    // 1 is notPresent in HKCategoryValueSeverity AND in HKCategoryValuePresence,
    // which is what lets one rule read either enum.
    expect(symptomSeverity(1)).toBeNull();
  });

  it('reads an ungraded occurrence as present with no grade', () => {
    // 0 is `unspecified` for a severity type and `present` for a presence one.
    expect(symptomSeverity(0)).toBe('');
  });

  it('names the grade when there is one', () => {
    expect(symptomSeverity(2)).toBe('Mild');
    expect(symptomSeverity(3)).toBe('Moderate');
    expect(symptomSeverity(4)).toBe('Severe');
  });

  it('refuses a value from an enum it does not know', () => {
    expect(symptomSeverity(7)).toBeNull();
    expect(symptomSeverity(-1)).toBeNull();
    expect(symptomSeverity(Number.NaN)).toBeNull();
  });
});
