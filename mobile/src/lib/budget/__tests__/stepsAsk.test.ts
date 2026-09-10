import { stepsAskDue, type StepsAskInput } from '../stepsAsk';

const base: StepsAskInput = { healthEnabled: true, everSeen: false, recentSteps: false, auth: null };

describe('stepsAskDue', () => {
  it('never asks somebody whose grant landed over an empty store', () => {
    // The reported bug: Connect, grant everything, no steps written yet.
    expect(stepsAskDue({ ...base, auth: 'granted' })).toBe(false);
  });

  it('never asks once HealthKit has been answered, since it will not say how', () => {
    expect(stepsAskDue({ ...base, auth: 'unknown' })).toBe(false);
  });

  it('stays quiet before the permission has been looked at', () => {
    expect(stepsAskDue({ ...base, auth: null })).toBe(false);
  });

  it('asks when the scope was never requested or was provably refused', () => {
    expect(stepsAskDue({ ...base, auth: 'shouldRequest' })).toBe(true);
    expect(stepsAskDue({ ...base, auth: 'denied' })).toBe(true);
  });

  it('lets steps in hand outrank the permission answer', () => {
    expect(stepsAskDue({ ...base, auth: 'denied', recentSteps: true })).toBe(false);
    expect(stepsAskDue({ ...base, auth: 'denied', everSeen: true })).toBe(false);
  });

  it('asks while Health is switched off, unless steps have ever arrived', () => {
    expect(stepsAskDue({ ...base, healthEnabled: false, auth: 'granted' })).toBe(true);
    expect(stepsAskDue({ ...base, healthEnabled: false, everSeen: true })).toBe(false);
  });
});
