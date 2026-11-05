/**
 * Matching a Health-app medication to one of the user's own types, and writing
 * its dose down. Both are places where being WRONG is worse than importing
 * nothing, so the tests are mostly about what must NOT match.
 */
import {
  canonicalMedName, matchMedType, medAmountText, medTypeLabel, normalizeMedName,
} from '../medications';
import { MED_TYPES } from '../../registry';

const BUILTIN = Object.fromEntries(Object.keys(MED_TYPES).map((k) => [k, MED_TYPES[k].label]));

describe('normalizeMedName', () => {
  it('drops the strength and the dose form', () => {
    expect(normalizeMedName('Fexofenadine Hydrochloride 180 mg tablet')).toBe('fexofenadine');
    expect(normalizeMedName('Magnesium Glycinate 400mg capsules')).toBe('magnesium glycinate');
    expect(normalizeMedName('Midodrine 2.5 mg oral tablet')).toBe('midodrine');
    expect(normalizeMedName('Levothyroxine 0.025mg')).toBe('levothyroxine');
    expect(normalizeMedName('Vitamin D3 5000 IU softgel')).toBe('vitamin d3');
  });

  it('ignores case, punctuation, accents and release qualifiers', () => {
    expect(normalizeMedName('  Propranolol-ER  ')).toBe('propranolol');
    expect(normalizeMedName('CoQ10 (ubiquinol)')).toBe('coq10');
    expect(normalizeMedName('Café-Latte Powder')).toBe('cafe latte');
  });

  it('keeps the salt, because the salt is the product', () => {
    expect(normalizeMedName('Magnesium Citrate')).not.toBe(normalizeMedName('Magnesium Glycinate'));
  });

  it('keeps a number that is part of the name', () => {
    expect(normalizeMedName('Omega 3')).toBe('omega 3');
    expect(normalizeMedName('Vitamin B12')).toBe('vitamin b12');
  });
});

describe('matchMedType', () => {
  it('matches a Health name to the built-in type', () => {
    expect(matchMedType('Magnesium Glycinate 400 mg', BUILTIN)).toBe('magGlycinate');
    expect(matchMedType('Melatonin 3mg tablet', BUILTIN)).toBe('melatonin');
    expect(matchMedType('Quercetin', BUILTIN)).toBe('quercetin');
  });

  it('matches a generic to a brand type, and a brand to a generic one', () => {
    expect(matchMedType('Fexofenadine 180 mg', BUILTIN)).toBe('allegra');
    expect(matchMedType('Famotidine 20mg', BUILTIN)).toBe('pepsidAc');
    // Apple spells it Pepcid; the journal's built-in label does not.
    expect(matchMedType('Pepcid AC', BUILTIN)).toBe('pepsidAc');
    expect(matchMedType('Cholecalciferol 2000 IU', BUILTIN)).toBe('vitD3');
    expect(matchMedType('Thiamine HCl 100 mg', BUILTIN)).toBe('vitB1');
    expect(matchMedType('Fish Oil', BUILTIN)).toBe('omega3');
    expect(matchMedType('Ubiquinol 100mg', BUILTIN)).toBe('coq10');
    // and the other direction: the user's own type named after the ingredient
    expect(matchMedType('Allegra', { mine: 'Fexofenadine' })).toBe('mine');
  });

  it('matches a custom type the user created, by its own spelling', () => {
    const mine = { 'custom-ivabradine': 'Ivabradine', 'custom-ldn': 'LDN' };
    expect(matchMedType('Ivabradine 5 mg tablet', mine)).toBe('custom-ivabradine');
    expect(matchMedType('LDN', mine)).toBe('custom-ldn');
  });

  it('REFUSES a near miss rather than guessing', () => {
    // The whole reason there is no substring rule: these are different products.
    expect(matchMedType('Magnesium Oxide 400 mg', BUILTIN)).toBeNull();
    expect(matchMedType('Magnesium', BUILTIN)).toBeNull();
    expect(matchMedType('Vitamin B6', BUILTIN)).toBeNull();
    expect(matchMedType('Propranolol', BUILTIN)).toBeNull();
    expect(matchMedType('', BUILTIN)).toBeNull();
    expect(matchMedType('   ', BUILTIN)).toBeNull();
  });

  it('canonicalises both sides, so the comparison is symmetric', () => {
    expect(canonicalMedName('Fish Oil 1000mg')).toBe(canonicalMedName('Omega 3'));
    expect(canonicalMedName('Magnesium Citrate')).not.toBe(canonicalMedName('Magnesium Glycinate'));
  });
});

describe('medTypeLabel', () => {
  it('prefers the name the person gave it in Health', () => {
    expect(medTypeLabel({ name: 'Ivabradine 5 mg tablet', nickname: 'Corlanor' })).toBe('Corlanor');
    expect(medTypeLabel({ name: 'Ivabradine 5 mg tablet', nickname: '' })).toBe('Ivabradine 5 mg tablet');
    expect(medTypeLabel({ name: 'Ivabradine' })).toBe('Ivabradine');
  });

  it('bounds a label that would not fit a picker row', () => {
    expect(medTypeLabel({ name: 'x'.repeat(200) }).length).toBe(60);
  });
});

describe('medAmountText', () => {
  it('keeps the unit, because the journal dose field holds one', () => {
    expect(medAmountText({ dose: 400, unit: 'mg' })).toBe('400 mg');
    expect(medAmountText({ dose: 0.025, unit: 'mg' })).toBe('0.025 mg');
    expect(medAmountText({ dose: 2000, unit: 'IU' })).toBe('2000 IU');
    expect(medAmountText({ dose: 2.5, unit: 'mL' })).toBe('2.5 mL');
  });

  it('says what a count is counting when the form is known', () => {
    expect(medAmountText({ dose: 1, unit: 'count', form: 'tablet' })).toBe('1 tablet');
    expect(medAmountText({ dose: 2, unit: 'count', form: 'capsule' })).toBe('2 capsules');
    expect(medAmountText({ dose: 2, unit: 'count', form: 'suppository' })).toBe('2 suppositories');
    expect(medAmountText({ dose: 1, unit: 'count', form: 'inhaler' })).toBe('1 puff');
    expect(medAmountText({ dose: 2, unit: 'count', form: 'unknown' })).toBe('2');
    expect(medAmountText({ dose: 2, unit: 'count' })).toBe('2');
  });

  it('reports NO amount rather than zero when Health recorded none', () => {
    expect(medAmountText({ dose: null, unit: 'mg' })).toBeNull();
    expect(medAmountText({ unit: 'mg' })).toBeNull();
    expect(medAmountText({ dose: 0, unit: 'mg' })).toBeNull();
    expect(medAmountText({ dose: Number.NaN, unit: 'mg' })).toBeNull();
  });

  it('is a number a spreadsheet can still sum', () => {
    // lib/export/csv parseFloats the dose field for the daily total.
    expect(parseFloat(medAmountText({ dose: 400, unit: 'mg' })!)).toBe(400);
    expect(parseFloat(medAmountText({ dose: 2, unit: 'count', form: 'tablet' })!)).toBe(2);
  });
});
