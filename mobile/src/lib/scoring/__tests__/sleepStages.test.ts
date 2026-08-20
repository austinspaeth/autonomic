import { stagesForWindow } from '../day';
import type { SleepRecord } from '../../types';

const night = (bed: string, wake: string, stages?: SleepRecord['stages']): SleepRecord =>
  ({ bed, wake, ...(stages ? { stages } : {}) });

describe('stagesForWindow', () => {
  it('returns null when the night has no stages', () => {
    expect(stagesForWindow(night('23:00', '07:00'))).toBeNull();
    expect(stagesForWindow(undefined)).toBeNull();
  });

  it('keeps stages that span the recorded window', () => {
    // 23:00 → 07:00 = 480 min; stages total 480.
    const stages = { deep: 70, rem: 110, core: 280, awake: 20 };
    expect(stagesForWindow(night('23:00', '07:00', stages))).toEqual(stages);
  });

  it('tolerates the few minutes health sources round off', () => {
    const stages = { deep: 70, rem: 110, core: 275, awake: 10 };  // 465 vs 480
    expect(stagesForWindow(night('23:00', '07:00', stages))).toEqual(stages);
  });

  it('drops stages after the window is widened past them', () => {
    // Watch charged mid-night: Health saw ~4 h, user corrected it to 10 h.
    const stages = { deep: 35, rem: 55, core: 130, awake: 10 };
    expect(stagesForWindow(night('21:00', '07:00', stages))).toBeNull();
  });

  it('drops stages when the window is narrowed well inside them', () => {
    const stages = { deep: 70, rem: 110, core: 280, awake: 20 };
    expect(stagesForWindow(night('01:00', '05:00', stages))).toBeNull();
  });

  it('keeps stages when the window is unusable (no times)', () => {
    const stages = { deep: 70, rem: 110, core: 280, awake: 20 };
    expect(stagesForWindow(night('', '', stages))).toEqual(stages);
  });

  it('handles a window that wraps midnight', () => {
    const stages = { deep: 60, rem: 90, core: 270, awake: 20 };  // 440 vs 450
    expect(stagesForWindow(night('23:30', '07:00', stages))).toEqual(stages);
  });
});
