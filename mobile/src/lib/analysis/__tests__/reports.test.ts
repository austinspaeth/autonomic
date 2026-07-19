/** buildEventInsightPrompt — the single-event AI prompt behind "Get AI
 *  Insights" on the POTS episode / stand-test deep dives. */
import { buildEventInsightPrompt } from '../reports';
import type { AppState, Entry } from '../../types';
import type { DaysMap } from '../../scoring/day';

const standTest: Entry = {
  id: 'st1', type: 'standTest', time: '08:30', note: 'Felt dizzy near the end',
  baselineHr: '62', peakHr: '104', peakDelta: '42', sustainedDelta: '34',
  metThreshold: true, maxHrReached: '104', source: 'watch',
} as unknown as Entry;

const episode: Entry = {
  id: 'o1', type: 'orthostatic', time: '09:00',
  beforeHr: '65', afterHr: '98', hr1min: '80', transition: 'Sitting to standing',
} as unknown as Entry;

const days = {
  '2026-07-19': { readings: [standTest] },
  '2026-07-01': { readings: [episode] },
} as unknown as DaysMap;

const profile = { sex: 'Female', birthday: '1990-05-01' } as AppState['profile'];

describe('buildEventInsightPrompt', () => {
  it('builds a stand-test prompt with the recorded numbers, criteria, and doctor reminder', () => {
    const { prompt, rangeText } = buildEventInsightPrompt(days, profile, standTest, '2026-07-19');
    expect(rangeText).toContain('July 19, 2026');
    expect(rangeText).toContain('8:30');
    expect(prompt).toContain('guided POTS stand test');
    expect(prompt).toContain('Supine baseline HR (last two minutes lying down): 62 bpm');
    expect(prompt).toContain('Sustained rise (final-minute standing average vs baseline): +34 bpm');
    expect(prompt).toContain('sustained rise of 30 bpm or more: Yes');
    expect(prompt).toContain('Capture source: Apple Watch');
    expect(prompt).toContain('User note: Felt dizzy near the end');
    expect(prompt).toContain('sustained heart-rate rise of 30 bpm or more (40 or more for ages 12 to 19)');
    expect(prompt).toContain('PROFILE (self-entered): Age:');
    expect(prompt).toContain('talk with their doctor');
    // No trace was captured, so the trace block must be absent entirely.
    expect(prompt).not.toContain('HEART-RATE TRACE');
  });

  it('builds an episode prompt with derived deltas and pulls both events into the 30-day history', () => {
    const { prompt } = buildEventInsightPrompt(days, profile, episode, '2026-07-01');
    expect(prompt).toContain('orthostatic episode');
    expect(prompt).toContain('Transition: Sitting to standing');
    expect(prompt).toContain('Max change from baseline: +33 bpm'); // 98 - 65
    expect(prompt).toContain('Recovery delta'); // 80 - 98
    expect(prompt).toContain('-18 bpm');
    expect(prompt).toContain('RECENT ORTHOSTATIC HISTORY');
    // The stand test on 7-19 is outside the window ENDING 7-01; only the episode line appears.
    expect(prompt).toContain('Before HR: 65');
    expect(prompt).not.toContain('POTS stand test');
  });

  it('includes the stand test in history when the window covers it, and thins long traces', () => {
    const curve = Array.from({ length: 600 }, (_, i) => ({ t: i, bpm: 60 + (i % 40) }));
    const { prompt } = buildEventInsightPrompt(days, profile, { ...standTest, standAt: 300 } as Entry, '2026-07-19', curve);
    expect(prompt).toContain('POTS stand test | Baseline HR: 62');
    expect(prompt).toContain('Before HR: 65'); // 7-01 episode is within 30 days of 7-19
    expect(prompt).toContain('Stood up at: 300s');
    expect(prompt).toContain('showing 1 of every 4 samples'); // ceil(600/150)
    expect(prompt).toContain('total length 599s');
  });
});
