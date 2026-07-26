/** buildEventInsightPrompt / buildReadingInsightPrompt /
 *  buildWorkoutInsightPrompt — the single-entry AI prompts behind the
 *  "Get AI Insights" buttons on the reading and workout summaries. */
import { buildEventInsightPrompt, buildReadingInsightPrompt, buildWorkoutInsightPrompt } from '../reports';
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

const hrvReading: Entry = {
  id: 'h1', type: 'breathHrv', time: '07:45', style: '4/6', period: 'Morning',
  hr: '58', rmssd: '42', sdnn: '55', pnn50: '18', lowPower: '900', highPower: '450',
  source: 'polar', sourceName: 'Polar H10', note: 'Slept well',
} as unknown as Entry;

const bpReading: Entry = {
  id: 'b1', type: 'bp', time: '08:00', sys: '110', dia: '70', pulse: '64', period: 'Morning',
} as unknown as Entry;

const rhrReading: Entry = { id: 'r1', type: 'restingHr', time: '07:00', hr: '62' } as unknown as Entry;

const readingDays = {
  '2026-07-19': { readings: [hrvReading, bpReading, rhrReading] },
  '2026-07-10': { readings: [{ id: 'r0', type: 'restingHr', time: '07:15', hr: '66' } as unknown as Entry] },
} as unknown as DaysMap;

describe('buildReadingInsightPrompt', () => {
  it('builds an HRV prompt with the metrics, derived values, and doctor reminder', () => {
    const { prompt, rangeText } = buildReadingInsightPrompt(readingDays, profile, {}, hrvReading, '2026-07-19');
    expect(rangeText).toContain('July 19, 2026');
    expect(prompt).toContain('training HRV reading');
    expect(prompt).toContain('Breathing style: 4/6');
    expect(prompt).toContain('Capture source: Polar H10');
    expect(prompt).toContain('RMSSD: 42 ms');
    expect(prompt).toContain('Total power: 1350 ms²'); // 900 + 450, VLF absent
    expect(prompt).toContain('LF/HF ratio: 2.00');
    expect(prompt).toContain('User note: Slept well');
    expect(prompt).toContain('RECENT HRV HISTORY');
    expect(prompt).toContain('PROFILE (self-entered): Age:');
    expect(prompt).toContain('talk with their doctor');
    // No RR series was passed, so the trace block must be absent entirely.
    expect(prompt).not.toContain('BEAT-TO-BEAT');
  });

  it('thins a long RR series and labels the thinning', () => {
    const rr = Array.from({ length: 600 }, (_, i) => 900 + (i % 60));
    const { prompt } = buildReadingInsightPrompt(readingDays, profile, {}, hrvReading, '2026-07-19', rr);
    expect(prompt).toContain('BEAT-TO-BEAT (RR) INTERVALS');
    expect(prompt).toContain('showing 1 of every 3 of 600 intervals'); // ceil(600/200)
  });

  it('builds a BP prompt with the derived circulation indexes', () => {
    const { prompt } = buildReadingInsightPrompt(readingDays, profile, {}, bpReading, '2026-07-19');
    expect(prompt).toContain('blood-pressure reading');
    expect(prompt).toContain('Blood pressure: 110/70 mmHg');
    expect(prompt).toContain('Pulse pressure: 40 mmHg');
    expect(prompt).toContain('MAP (mean arterial pressure):');
    expect(prompt).toContain('Kerdo index:');
    expect(prompt).toContain('Kvas coefficient:');
    expect(prompt).toContain('RECENT BLOOD PRESSURE HISTORY');
  });

  it('builds a resting-HR prompt with the position default and 30-day history', () => {
    const { prompt } = buildReadingInsightPrompt(readingDays, profile, {}, rhrReading, '2026-07-19');
    expect(prompt).toContain('resting-heart-rate reading');
    expect(prompt).toContain('Resting HR: 62 bpm');
    expect(prompt).toContain('Position: Laying');
    expect(prompt).toContain('RECENT RESTING HEART RATE HISTORY');
    expect(prompt).toContain('HR: 66'); // the 7-10 reading is inside the window
  });
});

const workout: Entry = {
  id: 'w1', type: 'run', time: '17:30', source: 'health',
  duration: '31', distance: '3.1', avgHr: '148', maxHr: '171', note: 'Warm evening',
} as unknown as Entry;

const workoutDays = {
  '2026-07-19': { activities: [workout] },
  '2026-07-12': { activities: [{ id: 'w0', type: 'walk', time: '09:00', duration: '40' } as unknown as Entry] },
} as unknown as DaysMap;

describe('buildWorkoutInsightPrompt', () => {
  it('builds a workout prompt with fields, derived pace, and activity history', () => {
    const { prompt, rangeText } = buildWorkoutInsightPrompt(workoutDays, profile, undefined, workout, '2026-07-19');
    expect(rangeText).toContain('July 19, 2026');
    expect(prompt).toContain('single recorded workout (Run)');
    expect(prompt).toContain('Duration: 31 min');
    expect(prompt).toContain('Distance: 3.1 mi');
    expect(prompt).toContain('Pace: 10:00 /mi'); // 31 min / 3.1 mi
    expect(prompt).toContain('Avg HR: 148 bpm');
    expect(prompt).toContain('User note: Warm evening');
    expect(prompt).toContain('RECENT ACTIVITY HISTORY');
    expect(prompt).toContain('Walk'); // the 7-12 activity is inside the window
    expect(prompt).toContain('post-exertional');
    expect(prompt).toContain('talk with their doctor');
    // No trace, so the zone and trace blocks must be absent entirely.
    expect(prompt).not.toContain('TIME IN EXERCISE ZONES');
    expect(prompt).not.toContain('HEART-RATE TRACE');
  });

  it('fills HR stats from the trace, computes zone time, and thins the trace', () => {
    const curve = Array.from({ length: 600 }, (_, i) => ({ t: i * 3, bpm: 120 + (i % 50) }));
    const { prompt } = buildWorkoutInsightPrompt(workoutDays, profile, undefined, { ...workout, avgHr: '', maxHr: '' } as Entry, '2026-07-19', curve);
    expect(prompt).toContain('Min HR: 120 bpm'); // no field — filled from the curve
    expect(prompt).toContain('Max HR: 169 bpm');
    expect(prompt).toContain('TIME IN EXERCISE ZONES'); // profile birthday gives an age
    expect(prompt).toContain('Z1 Recovery');
    expect(prompt).toContain('showing 1 of every 4 samples'); // ceil(600/150)
  });
});
