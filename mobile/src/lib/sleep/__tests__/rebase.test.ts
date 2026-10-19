import { addDays } from '../../dates';
import type { DayRecord } from '../../types';
import { bedShiftSec, buildSleepReport, clipNight, rebaseNight, stagesFromSpans, type StageSpan } from '../index';

describe('a hand-corrected sleep window keeps its series', () => {
  it('measures a bedtime move the short way round the clock', () => {
    expect(bedShiftSec('23:30', '00:15')).toBe(45 * 60);
    expect(bedShiftSec('00:15', '23:30')).toBe(-45 * 60);
    expect(bedShiftSec('22:00', '22:00')).toBe(0);
    expect(bedShiftSec('', '22:00')).toBeNull();
  });

  it('shifts every point by the same amount and never drops one', () => {
    const night = { sampledHr: [{ t: 0, bpm: 60 }, { t: 3600, bpm: 55 }], stageSpans: [{ s: 0, d: 1800, v: 'core' as const }] };
    const later = rebaseNight(night, 1800); // bed moved 30 min later
    expect(later.sampledHr!.map((q) => q.t)).toEqual([-1800, 1800]);
    expect(later.stageSpans![0].s).toBe(-1800);
    // ...and moving it back is exactly the imported night.
    expect(rebaseNight(later, -1800)).toEqual(night);
  });

  it('reads only what falls inside bed → wake, cutting spans at the edges', () => {
    const spans: StageSpan[] = [{ s: -600, d: 1200, v: 'awake' }, { s: 600, d: 3000, v: 'deep' }, { s: 3600, d: 600, v: 'rem' }];
    const c = clipNight({ sampledHr: [{ t: -60, bpm: 70 }, { t: 60, bpm: 60 }, { t: 4000, bpm: 58 }], stageSpans: spans }, 3600);
    expect(c.sampledHr!.map((q) => q.t)).toEqual([60]);
    expect(c.stageSpans).toEqual([{ s: 0, d: 600, v: 'awake' }, { s: 600, d: 3000, v: 'deep' }]);
    expect(stagesFromSpans(c.stageSpans!)).toEqual({ deep: 50, rem: 0, core: 0, awake: 10 });
  });

  it('the report draws the curve over the corrected window', () => {
    const dk = '2026-10-18';
    const days = { [dk]: { readings: [], activities: [], meds: [], symptoms: [], sleep: { bed: '23:00', wake: '06:00' } } as unknown as DayRecord };
    const hr = [{ t: -1200, bpm: 80 }, { t: 600, bpm: 60 }, { t: 7 * 3600 + 60, bpm: 75 }];
    const r = buildSleepReport(days, dk, addDays, {}, null, { hr });
    expect(r!.hr!.map((q) => q.t)).toEqual([600]);
  });
});
