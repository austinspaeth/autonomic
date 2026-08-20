import { hrRecovery, recoveryBaseline, stopHr } from '../hrRecovery';
import type { Entry } from '../types';

const act = (f: Partial<Entry>): Entry => ({ id: 'a1', type: 'bike', time: '10:00', ...f } as Entry);
const ramp = (bpm: number[]): { t: number; bpm: number }[] => bpm.map((b, i) => ({ t: i * 5, bpm: b }));

describe('stopHr', () => {
  it('is the median of the final seconds, not the last sample', () => {
    // 15s window at 5s spacing = the last four samples; the 190 spike is a
    // dropout and must not become the reference.
    expect(stopHr(ramp([150, 140, 120, 110, 108, 190]))).toBe(115);
  });
  it('is null without a trace', () => {
    expect(stopHr(null)).toBe(null);
    expect(stopHr([])).toBe(null);
  });
});

describe('recoveryBaseline', () => {
  it('prefers the stop rate over the logged peak', () => {
    const a = act({ maxHr: '170', hr60: '95' });
    expect(recoveryBaseline(a, () => ramp([170, 168, 130, 120, 118, 116]))).toBe(119);
  });
  it('falls back to maxHr on a hand-logged workout', () => {
    expect(recoveryBaseline(act({ maxHr: '170' }))).toBe(170);
    expect(recoveryBaseline(act({}))).toBe(null);
  });
});

describe('hrRecovery', () => {
  it('reads the fall as a negative change from the stop rate', () => {
    const a = act({ maxHr: '170', hr60: '95' });
    // Measured from the 119 bpm cool-down, not the 170 peak: -24, not -75.
    expect(hrRecovery(a, () => ramp([170, 168, 130, 120, 118, 116]))).toBe(-24);
  });
  it('needs the hand-entered hr60', () => {
    expect(hrRecovery(act({ maxHr: '170' }))).toBe(null);
  });
  it('drops a session whose rate did not fall', () => {
    expect(hrRecovery(act({ maxHr: '120', hr60: '130' }))).toBe(null);
  });
});
