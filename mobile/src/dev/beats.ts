/**
 * Synthetic beat-to-beat intervals for the marketing screenshot harness.
 * DEV ONLY — nothing here is reachable from a release build.
 *
 * WHY THIS EXISTS. Four of the app's best screens only exist while a sensor is
 * streaming: the paced HRV session with its breathing rings, the live RR trace,
 * the minimized session pill, and the POTS stand test with the heart rate
 * actually climbing. A simulator has no camera pulse and no Bluetooth, so those
 * screens could not be photographed at all.
 *
 * WHAT IS AND IS NOT SYNTHETIC. This module invents ONE thing: the interval
 * between beats. Everything downstream is the real app — `correctArtifacts`,
 * `computeHrv`, the rolling SDNN, the coverage and artifact gates, the stand
 * test's own baseline and delta maths, the results card, the entry it writes.
 * So the numbers on a shot are genuinely computed from the series below, and a
 * series that is not physiological produces numbers that are not either. That
 * is the whole reason this file models the physiology rather than emitting
 * noise around a mean.
 *
 * THE PHYSIOLOGY, and where each number comes from:
 *
 * - Heart rate is generated as an instantaneous rate, and a beat is emitted by
 *   stepping forward 60000/rate ms. This is the right way round: RR intervals
 *   are the SAMPLES of a continuous rate, which is why beats bunch up where the
 *   rate is high. Generating RR directly from a distribution loses that and
 *   produces an RMSSD unrelated to the breathing.
 *
 * - RESPIRATORY SINUS ARRHYTHMIA is the dominant source of short-term HRV: the
 *   rate rises through inhalation and falls through exhalation. Its amplitude
 *   depends strongly on breathing RATE, peaking near 0.1 Hz (six breaths a
 *   minute) — the "resonance" the app's 4/6 pattern is built to hit. Hence
 *   `PACED` carries a much larger swing than `BASELINE` at a spontaneous ~14
 *   breaths a minute. A paced reading genuinely has a far higher RMSSD and SDNN
 *   than the same person's quiet baseline; that is the point of pacing, and it
 *   is why the app scores the two on separate ladders.
 *
 * - A SLOW (Mayer-wave, ~0.1 Hz) component rides under spontaneous breathing,
 *   which is what gives a baseline reading SDNN noticeably above its RMSSD.
 *
 * - A small amount of beat-level noise stands in for everything not modelled.
 *   It is kept low on purpose: pushed up it reads as ectopy, `correctArtifacts`
 *   starts flagging beats, and the session shows "Signal noisy" over a reading
 *   nobody was taking badly.
 *
 * - ORTHOSTATIC RESPONSE (`standProfile`): on standing, 300-800 ml of blood
 *   pools in the legs, stroke volume drops and the baroreflex answers with an
 *   immediate rate rise — fast over the first 10-15 s, overshooting, then
 *   settling to a sustained plateau. A POTS stand test is read on exactly that
 *   plateau (a sustained rise of 30+ bpm in an adult with no drop in pressure),
 *   so the shape of the settle is the measurement, not decoration. The rise is
 *   modelled as an exponential approach with an early overshoot that decays.
 *
 * The generator is DETERMINISTIC (a seeded PRNG), so the same shot re-shot a
 * year from now produces the same numbers and the index stays true.
 */

/** Instantaneous heart rate (bpm) at `t` seconds into the recording. */
export type RateFn = (t: number) => number;

/** Mulberry32 — small, fast, and stable across runs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian noise, so the beat-level jitter is not uniformly distributed. */
function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export interface RateOpts {
  /** Resting rate the oscillations ride on. */
  meanBpm: number;
  /** Peak-to-trough RSA swing, in bpm. */
  rsaBpm: number;
  /** Breathing period in seconds (10 = the app's 4/6 paced pattern). */
  breathSec: number;
  /** Amplitude of the ~0.1 Hz slow wave, in bpm. */
  slowBpm?: number;
  /** Drift across the whole reading, in bpm (fatigue, settling). */
  driftBpm?: number;
}

/**
 * A quiet seated/supine rate: small RSA at a spontaneous breathing rate, with a
 * Mayer wave under it. Produces RMSSD in the high twenties — an ordinary adult
 * baseline, not an athlete's.
 */
export function baselineRate(o?: Partial<RateOpts>): RateFn {
  return rateFn({ meanBpm: 63, rsaBpm: 2.2, breathSec: 4.3, slowBpm: 7.5, driftBpm: -1.5, ...o });
}

/**
 * A paced reading at the app's own 4/6 pattern. Breathing at 0.1 Hz sits on the
 * baroreflex resonance, so the RSA swing is several times the spontaneous one
 * and the rate traces a clean slow wave — which is exactly what the live RR
 * trace on the session card is there to show.
 */
export function pacedRate(o?: Partial<RateOpts>): RateFn {
  return rateFn({ meanBpm: 61, rsaBpm: 13, breathSec: 10, slowBpm: 0, driftBpm: -2, ...o });
}

function rateFn(o: RateOpts): RateFn {
  const { meanBpm, rsaBpm, breathSec, slowBpm = 0, driftBpm = 0 } = o;
  return (t) => {
    // Nobody breathes to a metronome, not even against one: the phase wanders
    // by a fraction of a breath and the depth varies cycle to cycle. Without
    // this the RR trace on the session card is a textbook sine wave, which is
    // the single clearest tell that a screenshot was not taken from a person.
    const wander = 0.55 * Math.sin((2 * Math.PI * t) / 47 + 0.7) + 0.3 * Math.sin((2 * Math.PI * t) / 23);
    const depth = 1 + 0.16 * Math.sin((2 * Math.PI * t) / 31 + 2.1);
    return meanBpm
      + (rsaBpm / 2) * depth * Math.sin((2 * Math.PI * t) / breathSec + wander)
      + (slowBpm / 2) * Math.sin((2 * Math.PI * t) / 10 + 1.1)
      + driftBpm * Math.min(1, t / 240);
  };
}

/**
 * The orthostatic response, as a rate function over a whole stand test.
 *
 * Supine until `standAtSec`, then an immediate climb: an exponential approach
 * to `riseBpm` with a decaying overshoot on top, which is the shape a real
 * tachogram has — the first fifteen seconds are the steepest part of the whole
 * test, and the peak sits ahead of the plateau. RSA shrinks on standing
 * (vagal withdrawal), so the swing is reduced with the rise.
 */
export function standProfile(opts?: {
  supineBpm?: number; riseBpm?: number; standAtSec?: number;
  overshootBpm?: number; tauSec?: number;
}): RateFn {
  const supine = opts?.supineBpm ?? 58;
  const rise = opts?.riseBpm ?? 34;
  const standAt = opts?.standAtSec ?? 300;
  const overshoot = opts?.overshootBpm ?? 13;
  const tau = opts?.tauSec ?? 6;
  return (t) => {
    const supineRsa = 5.5;
    if (t < standAt) {
      return supine + (supineRsa / 2) * Math.sin((2 * Math.PI * t) / 4.4)
        + 1.2 * Math.sin((2 * Math.PI * t) / 10 + 0.4);
    }
    const s = t - standAt;
    const climb = rise * (1 - Math.exp(-s / tau));
    // Overshoot peaks a few seconds in and washes out over ~a minute.
    const peak = overshoot * Math.exp(-s / 40) * (1 - Math.exp(-s / 4));
    // Standing drift: the plateau creeps up slightly over ten minutes.
    const creep = 2.2 * Math.min(1, s / 420);
    // Vagal withdrawal: RSA is roughly halved standing.
    const rsa = supineRsa * 0.45;
    return supine + climb + peak + creep
      + (rsa / 2) * Math.sin((2 * Math.PI * t) / 3.6);
  };
}

export interface Beat { /** ms from the start of the recording. */ at: number; rr: number }

/**
 * Walk the rate function, emitting one beat at a time. `jitterMs` is the
 * beat-level noise; everything structural belongs in the rate function.
 */
export function beatsFrom(rate: RateFn, seconds: number, opts?: { seed?: number; jitterMs?: number }): Beat[] {
  const r = rng(opts?.seed ?? 20260101);
  const jitter = opts?.jitterMs ?? 9;
  const out: Beat[] = [];
  let t = 0;
  while (t < seconds * 1000) {
    const bpm = Math.max(32, rate(t / 1000));
    const rr = Math.round(60000 / bpm + gauss(r) * jitter);
    if (rr < 300 || rr > 2000) break;
    t += rr;
    out.push({ at: t, rr });
  }
  return out;
}
