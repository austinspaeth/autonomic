/**
 * A symptom lasts, so its form offers an optional end time (and the Notes
 * textarea every entry already gets). Two things are worth pinning: the end
 * field is `optional`, because a non-optional time field defaults to "now" and
 * would silently claim every symptom ended the moment it was logged; and it is
 * stamped by `typesFor` rather than by each registry def, so a symptom the user
 * created themselves — including one saved before this shipped — gets it too.
 */
import { entryFields, SYMPTOM_TYPES, MED_TYPES } from '../registry';
import { typesFor } from '../typeCatalog';
import type { AppState, TypeDef } from '../types';

// typeCatalog's write helpers pull in the MMKV store; typesFor itself is pure.
// (The call is hoisted above the imports, which is the point of it.)
jest.mock('../../store/store', () => ({ getState: jest.fn(), save: jest.fn() }));

const state = (custom?: Record<string, TypeDef>) => ({
  hiddenTypes: {},
  customTypes: custom ? { symptoms: custom } : {},
} as unknown as AppState);

const endOf = (def: TypeDef) => entryFields(def).find((f) => f.key === 'endTime');

describe('symptom end time', () => {
  it('is offered for every symptom, right after the start time', () => {
    const types = typesFor(state(), 'symptoms');
    Object.keys(types).forEach((k) => {
      const def = types[k];
      if (def.noTime) return; // "Sick" is a whole-day flag, with no start to end
      const fields = entryFields(def);
      const start = fields.findIndex((f) => f.type === 'time' && f.key === 'time');
      const end = fields.findIndex((f) => f.key === 'endTime');
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBe(start + 1);
      expect(fields[end].optional).toBe(true);
    });
  });

  it('leaves the whole-day "Sick" flag alone', () => {
    const types = typesFor(state(), 'symptoms');
    expect(endOf(types.sick)).toBeUndefined();
  });

  it('reaches user-created symptoms, which are stored as plain JSON', () => {
    const mine: TypeDef = { label: 'Jaw ache', icon: 'alert', fields: [], userDefined: true };
    const types = typesFor(state({ 'custom-jaw-ache': mine }), 'symptoms');
    expect(endOf(types['custom-jaw-ache'])?.optional).toBe(true);
    expect(mine.ends).toBeUndefined(); // stamped on the copy, never on stored state
  });

  it('is a symptom thing only', () => {
    expect(endOf(MED_TYPES.other)).toBeUndefined();
    expect(endOf(SYMPTOM_TYPES.fatigue)).toBeUndefined(); // the raw registry def is untouched
  });

  it('still ends with the Notes textarea', () => {
    const fields = entryFields(typesFor(state(), 'symptoms').fatigue);
    expect(fields[fields.length - 1]).toMatchObject({ type: 'textarea', key: 'note' });
  });
});
