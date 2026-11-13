/**
 * The synthetic beat series, measured through the REAL HRV engine.
 *
 * `dev/beats.ts` exists so the live-capture screenshots can be taken at all,
 * and its whole justification is that only the intervals are invented: every
 * number on those shots is computed by `computeHrv` from the series below. That
 * claim is worth nothing if the series drifts out of the physiological range —
 * a reading the engine flags as artifact-ridden, or one with an athlete's HRV
 * on a card describing an ordinary user, is a fabricated screenshot wearing the
 * engine's authority. So the bounds are pinned here.
 */
import { baselineRate, pacedRate, standProfile, beatsFrom } from '../beats';
import { computeHrv } from '../../lib/hrv';

const rrOf = (r: ReturnType<typeof beatsFrom>) => r.map((b) => b.rr);

describe('synthetic beats, judged by the engine that will grade them', () => {
  it('a baseline reading passes the gates and lands in an ordinary adult range', () => {
    const res = computeHrv(rrOf(beatsFrom(baselineRate(), 300)), { durationSec: 300 });
    expect(res.ok).toBe(true);
    // Not flagged as a noisy capture: the session card must not show
    // "Signal noisy" over a reading nobody was taking badly.
    expect(res.artifactPct).toBeLessThan(5);
    expect(res.confidence).toBe('high');
    // An ordinary adult baseline, NOT an athlete's. The app's own unrecentered
    // ladder calls 27-34 ms 'good', which is where a 38-year-old should sit.
    expect(res.time.rmssd).toBeGreaterThan(18);
    expect(res.time.rmssd).toBeLessThan(45);
    // A Mayer wave under spontaneous breathing is what puts SDNN above RMSSD.
    expect(res.time.sdnn).toBeGreaterThan(res.time.rmssd);
    expect(res.time.hr).toBeGreaterThan(55);
    expect(res.time.hr).toBeLessThan(72);
  });

  it('a paced reading is markedly higher than the same person’s baseline', () => {
    const paced = computeHrv(rrOf(beatsFrom(pacedRate(), 300, { seed: 7 })), { durationSec: 300 });
    const base = computeHrv(rrOf(beatsFrom(baselineRate(), 300)), { durationSec: 300 });
    expect(paced.ok).toBe(true);
    expect(paced.artifactPct).toBeLessThan(5);
    // Breathing at 0.1 Hz sits on the baroreflex resonance. If this stops being
    // true the 4/6 pattern the app teaches has no visible effect on the card.
    expect(paced.time.rmssd).toBeGreaterThan(base.time.rmssd * 1.5);
    expect(paced.time.sdnn).toBeGreaterThan(base.time.sdnn);
    // Still a person, not a sine wave.
    expect(paced.time.rmssd).toBeLessThan(130);
  });

  it('the stand test shows a sustained orthostatic rise, peaking before it settles', () => {
    const beats = beatsFrom(standProfile(), 900, { seed: 3 });
    const hrAt = (s: number) => {
      const w = beats.filter((b) => b.at > s * 1000 - 15000 && b.at <= s * 1000);
      return 60000 / (w.reduce((a, b) => a + b.rr, 0) / w.length);
    };
    const supine = hrAt(290);
    expect(supine).toBeGreaterThan(52);
    expect(supine).toBeLessThan(66);
    // The steepest part of the test is the first fifteen seconds upright.
    expect(hrAt(316) - supine).toBeGreaterThan(20);
    // Overshoot sits AHEAD of the plateau, then washes out.
    expect(hrAt(330)).toBeGreaterThan(hrAt(480));
    // And the plateau is what a stand test is actually read on: a sustained
    // rise past the 30 bpm mark, held for the whole ten minutes.
    expect(hrAt(600) - supine).toBeGreaterThan(30);
    expect(hrAt(890) - supine).toBeGreaterThan(30);
    expect(hrAt(890) - supine).toBeLessThan(55);
  });
});
