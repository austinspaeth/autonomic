import { cycleOfferDue } from '../offer';

const base = { sex: 'Female', setUp: false, dismissed: false, hasReading: true, isToday: true };

it('offers to a female or unset profile, never to a male one', () => {
  expect(cycleOfferDue(base)).toBe(true);
  expect(cycleOfferDue({ ...base, sex: '' })).toBe(true);
  expect(cycleOfferDue({ ...base, sex: 'Male' })).toBe(false);
});

it('asks once, after the first reading, on today only', () => {
  expect(cycleOfferDue({ ...base, dismissed: true })).toBe(false);
  expect(cycleOfferDue({ ...base, setUp: true })).toBe(false);
  expect(cycleOfferDue({ ...base, hasReading: false })).toBe(false);
  expect(cycleOfferDue({ ...base, isToday: false })).toBe(false);
});
