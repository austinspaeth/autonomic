/**
 * PPG beat detection — pure, framework-free, unit-tested.
 *
 * Input: a fingertip-brightness series from the camera (mean red channel per
 * frame, with frame timestamps in ms). Output: beat (peak) times and RR
 * intervals in the same {@link HrSample}-compatible ms units the BLE strap
 * emits, so everything downstream of `Session.tsx` is source-agnostic.
 *
 * A 30–60 fps frame clock is far too coarse for HRV on its own (33 ms
 * quantization ≈ the whole signal), so each detected peak is refined with
 * parabolic interpolation around the sample max to recover sub-frame timing.
 */
import { mean, std } from '../hrv';

/** Plausible heart-rate band: 42–200 bpm → RR 300–1428 ms (0.7–3.3 Hz). */
const RR_MIN_MS = 300;
const RR_MAX_MS = 1430;
/** Refractory period between accepted peaks (200 bpm ceiling). */
const MIN_PEAK_GAP_MS = 300;

export interface BeatDetection {
  /** Refined beat times (ms, same clock as the input timestamps). */
  peakTimes: number[];
  /** Successive peak-to-peak intervals (ms), impossible values dropped. */
  rr: number[];
}

export type PulseQuality = 'none' | 'weak' | 'good';

/** Centered moving average; the window shrinks at the edges. */
function movingAverage(vs: number[], window: number): number[] {
  const n = vs.length;
  const half = Math.max(1, Math.floor(window / 2));
  const out = new Array<number>(n);
  // Prefix sums keep this O(n) even for the long detrend window.
  const prefix = new Array<number>(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + vs[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    out[i] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
  return out;
}

/**
 * Detrend + band-pass the brightness series to the plausible HR band
 * (~0.7–3.3 Hz): a short moving average knocks out frame noise above the band,
 * and subtracting a ~1.4 s moving average removes baseline drift below it.
 */
export function bandpass(vs: number[], fs: number): number[] {
  const lowpassWin = Math.max(1, Math.round(fs / 6)); // ~6 Hz corner
  const detrendWin = Math.max(3, Math.round(fs / 0.7)); // ~0.7 Hz corner
  const smoothed = movingAverage(vs, lowpassWin);
  const baseline = movingAverage(vs, detrendWin);
  return smoothed.map((v, i) => v - baseline[i]);
}

/**
 * Detect beats in a brightness series. `ts` are frame timestamps (ms,
 * monotonic), `vs` the mean red-channel values, index-aligned.
 *
 * Note: blood-volume peaks make the fingertip *darker*, but the sign is
 * irrelevant for RR — troughs of a periodic signal are just as evenly spaced
 * as peaks, so we detect maxima of the band-passed series either way.
 */
export function detectBeats(ts: number[], vs: number[]): BeatDetection {
  const n = ts.length;
  if (n < 8 || n !== vs.length) return { peakTimes: [], rr: [] };
  const spanMs = ts[n - 1] - ts[0];
  if (spanMs < 2000) return { peakTimes: [], rr: [] };
  const fs = (1000 * (n - 1)) / spanMs;

  const f = bandpass(vs, fs);

  // Adaptive threshold from a robust amplitude estimate (90th pct of |f|),
  // so a strong pulse and a faint one both detect without hand-tuned units.
  const absSorted = f.map(Math.abs).sort((a, b) => a - b);
  const p90 = absSorted[Math.min(n - 1, Math.floor(n * 0.9))];
  if (p90 <= 0) return { peakTimes: [], rr: [] };
  const threshold = 0.35 * p90;

  const peakTimes: number[] = [];
  let lastIdx = -1;
  for (let i = 1; i < n - 1; i++) {
    if (f[i] < threshold || f[i] < f[i - 1] || f[i] <= f[i + 1]) continue;
    if (lastIdx >= 0 && ts[i] - ts[lastIdx] < MIN_PEAK_GAP_MS) {
      // Within the refractory window: keep whichever candidate is taller.
      if (f[i] > f[lastIdx]) {
        peakTimes[peakTimes.length - 1] = refinePeak(ts, f, i);
        lastIdx = i;
      }
      continue;
    }
    peakTimes.push(refinePeak(ts, f, i));
    lastIdx = i;
  }

  const rr: number[] = [];
  for (let i = 1; i < peakTimes.length; i++) {
    const interval = peakTimes[i] - peakTimes[i - 1];
    if (interval >= RR_MIN_MS && interval <= RR_MAX_MS) rr.push(interval);
  }
  return { peakTimes, rr };
}

/**
 * Sub-frame peak timing: fit a parabola through the sample max and its
 * neighbors and take the vertex. This is what recovers usable RR resolution
 * from a 30–60 fps signal.
 */
function refinePeak(ts: number[], f: number[], i: number): number {
  const y0 = f[i - 1], y1 = f[i], y2 = f[i + 1];
  const denom = y0 - 2 * y1 + y2;
  const delta = denom === 0 ? 0 : Math.max(-1, Math.min(1, (0.5 * (y0 - y2)) / denom));
  const dt = (ts[i + 1] - ts[i - 1]) / 2;
  return ts[i] + delta * dt;
}

/**
 * Grade the pulse in a (~5 s) trailing window: 'good' needs several beats at a
 * consistent rhythm — this is the pre-start finger-lock criterion — while
 * scattered/irregular peaks read as 'weak' and no periodicity as 'none'.
 */
export function assessPulse(ts: number[], vs: number[]): PulseQuality {
  const { rr } = detectBeats(ts, vs);
  if (rr.length < 2) return 'none';
  const cv = std(rr) / mean(rr);
  if (rr.length >= 3 && cv < 0.18) return 'good';
  return 'weak';
}

/**
 * Finger-presence heuristic: with a fingertip covering lens + torch the frame
 * is bright and strongly red-dominant (the torch shines through blood-filled
 * tissue). Channel means are 0–255.
 */
export function fingerPresent(red: number, green: number, blue: number): boolean {
  return red > 70 && red > 1.4 * green && red > 1.4 * blue;
}
