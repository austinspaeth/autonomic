/**
 * ECG metric math (pure — no native imports, so it is unit-testable).
 *
 * A local native module (modules/ecg-health) hands us the raw lead-I voltage
 * waveform plus Apple's own classification and average HR (see ecg.ts). Here we
 * turn a waveform into the metrics our `ecg` reading type stores.
 *
 * HONESTY NOTE: heart rate, HRV (SDNN/RMSSD), and ectopic-beat count are derived
 * from R-peak detection and are reliable. QRS, QTc and PR are *estimated* by
 * single-lead wave delineation — they are approximate and must not be used for
 * clinical decisions. We clamp them to physiologic ranges and drop low-confidence
 * results. Apple itself does not publish QT/PR/QRS.
 */

/** One ECG sample as returned by the native HKElectrocardiogramQuery bridge. */
export interface RawEcgSample {
  uuid: string;
  start: number; // epoch ms
  end: number;   // epoch ms
  classification: string;   // sinusRhythm | atrialFibrillation | inconclusive* | notSet | unrecognized
  symptomsStatus: string;   // present | none | notSet
  numberOfVoltageMeasurements: number;
  samplingFrequency?: number; // Hz
  averageHeartRate?: number;  // bpm, Apple's own average
  voltages: number[];         // lead-I microvolts, in acquisition order
}

export interface EcgMetrics {
  hr: number | null;        // bpm
  sdnn: number | null;      // ms  (our "HRV" field)
  rmssd: number | null;     // ms
  qrs: number | null;       // ms  (estimated)
  qtc: number | null;       // ms  (estimated, Bazett)
  pr: number | null;        // ms  (estimated)
  ectopic: number;          // premature beats detected
  beats: number;            // total R-peaks
  classification: string;
  symptomsStatus: string;
}

/** Fields shaped for the registry `ecg` reading type + a timestamp. */
export interface EcgImport {
  uuid: string;
  startISO: string;
  fields: Record<string, string | boolean>;
  metrics: EcgMetrics;
}

/** Turn a raw native sample into an import record with registry-shaped fields. */
export function toImport(s: RawEcgSample): EcgImport {
  const metrics = computeEcgMetrics(s);
  return { uuid: s.uuid, startISO: new Date(s.start).toISOString(), fields: metricsToFields(s, metrics), metrics };
}

/** Sampling rate: prefer the reported frequency, else infer from count / duration. */
function sampleRate(s: RawEcgSample): number {
  const durationSec = Math.max(0.001, (s.end - s.start) / 1000);
  return s.samplingFrequency && s.samplingFrequency > 1 ? s.samplingFrequency : s.voltages.length / durationSec;
}

/**
 * Beat-to-beat RR intervals (ms) from an ECG's lead-I waveform — the input the
 * HRV pipeline wants. Only physiologic gaps (30–200 bpm) are kept; the HRV
 * pipeline's artifact correction handles the rest.
 */
export function rrFromEcg(s: RawEcgSample): number[] {
  const v = s.voltages;
  if (!v || v.length < 100) return [];
  const fs = sampleRate(s);
  const signal = detrend(v, fs);
  const peaks = detectRPeaks(signal, fs);
  const rr: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const ms = ((peaks[i] - peaks[i - 1]) / fs) * 1000;
    if (ms > 250 && ms < 2500) rr.push(ms);
  }
  return rr;
}

/* ------------------------------------------------------------------ */
/* Metric computation                                                  */
/* ------------------------------------------------------------------ */

export function computeEcgMetrics(s: RawEcgSample): EcgMetrics {
  const cls = s.classification || 'notSet';
  const base: EcgMetrics = {
    hr: null, sdnn: null, rmssd: null, qrs: null, qtc: null, pr: null,
    ectopic: 0, beats: 0, classification: cls, symptomsStatus: s.symptomsStatus || 'notSet',
  };
  const v = s.voltages;
  if (!v || v.length < 100) {
    if (s.averageHeartRate) base.hr = Math.round(s.averageHeartRate);
    return base;
  }
  // Sampling rate: prefer reported frequency, else infer from count / duration.
  const durationSec = Math.max(0.001, (s.end - s.start) / 1000);
  const fs = s.samplingFrequency && s.samplingFrequency > 1
    ? s.samplingFrequency
    : v.length / durationSec;

  const signal = detrend(v, fs);
  const rPeaks = detectRPeaks(signal, fs);
  base.beats = rPeaks.length;

  // Raw RR (seconds), then a physiologic + robust-deviation filter so a missed
  // or doubled R-peak detection doesn't blow up SDNN/RMSSD (the "HRV 191"
  // failure mode: one spurious interval dominates the spread).
  const rrRaw: number[] = [];
  for (let i = 1; i < rPeaks.length; i++) rrRaw.push((rPeaks[i] - rPeaks[i - 1]) / fs);
  const physiologic = rrRaw.filter((x) => x >= 0.3 && x <= 2.0); // 30–200 bpm
  const medRr = physiologic.length ? median(physiologic) : 1;
  // Keep only normal-to-normal intervals: within 25% of the running median.
  const rrNN = physiologic.filter((x) => Math.abs(x - medRr) / medRr <= 0.25);
  if (rrNN.length >= 2) {
    const meanRr = mean(rrNN);
    base.hr = Math.round(60 / meanRr);
    base.sdnn = Math.round(std(rrNN) * 1000);
    base.rmssd = Math.round(rmssd(rrNN) * 1000);
    base.ectopic = physiologic.filter((x) => x > 0 && x < 0.8 * medRr).length;
  } else if (physiologic.length >= 2) {
    base.hr = Math.round(60 / mean(physiologic));
  }
  // Apple's HR is authoritative when we couldn't derive one.
  if (base.hr == null && s.averageHeartRate) base.hr = Math.round(s.averageHeartRate);

  // Interval estimates from a SIGNAL-AVERAGED beat. Aligning every normal beat
  // on its R peak and averaging cancels uncorrelated noise, so wave onsets and
  // offsets (P, QRS, T) are far cleaner than any single beat on a wrist lead.
  // NB: delineation runs on the RAW voltages (with per-beat baseline removal),
  // NOT the high-passed `signal` — the 200 ms moving-average detrend used for
  // peak detection depresses the isoelectric region around the QRS and would
  // defeat amplitude-based onset/offset finding.
  const iv = estimateIntervalsAveraged(v, fs, rPeaks, rrNN.length ? median(rrNN) : medRr);
  base.qrs = iv.qrs;
  base.pr = iv.pr;
  base.qtc = iv.qtc;

  return base;
}

/** Map metrics onto the registry `ecg` reading fields. */
function metricsToFields(s: RawEcgSample, m: EcgMetrics): Record<string, string | boolean> {
  const cls = m.classification;
  const parts: string[] = [`Apple Watch ECG — ${humanClass(cls)}`];
  if (m.symptomsStatus === 'present') parts.push('symptoms present');
  const est: string[] = [];
  if (m.qrs != null || m.qtc != null || m.pr != null) est.push('QRS/QTc/PR are single-lead estimates, not clinical values.');
  return {
    hr: m.hr != null ? String(m.hr) : '',
    hrv: m.sdnn != null ? String(m.sdnn) : '',
    qrs: m.qrs != null ? String(m.qrs) : '',
    qtc: m.qtc != null ? String(m.qtc) : '',
    pr: m.pr != null ? String(m.pr) : '',
    ectopic: m.ectopic > 0 ? String(m.ectopic) : '',
    sinus: cls === 'sinusRhythm',
    svt: false, // Apple does not classify SVT
    otherArrhythmia: cls === 'atrialFibrillation',
    note: parts.join('; '),
    techReview: est.join(' '),
  };
}

function humanClass(c: string): string {
  switch (c) {
    case 'sinusRhythm': return 'sinus rhythm';
    case 'atrialFibrillation': return 'atrial fibrillation';
    case 'inconclusiveLowHeartRate': return 'inconclusive (low HR)';
    case 'inconclusiveHighHeartRate': return 'inconclusive (high HR)';
    case 'inconclusivePoorReading': return 'inconclusive (poor reading)';
    case 'inconclusiveOther': return 'inconclusive';
    default: return 'unclassified';
  }
}

/* ------------------------------------------------------------------ */
/* Signal processing                                                   */
/* ------------------------------------------------------------------ */

/** Remove baseline wander by subtracting a ~200 ms moving average. */
function detrend(v: number[], fs: number): number[] {
  const w = Math.max(3, Math.round(0.2 * fs));
  const out = new Array<number>(v.length);
  let acc = 0;
  const half = Math.floor(w / 2);
  // simple centered moving average via prefix sums
  const prefix = new Array<number>(v.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < v.length; i++) prefix[i + 1] = prefix[i] + v[i];
  for (let i = 0; i < v.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(v.length, i + half + 1);
    const avg = (prefix[hi] - prefix[lo]) / (hi - lo);
    out[i] = v[i] - avg;
  }
  void acc;
  return out;
}

/**
 * Pan-Tompkins-style R-peak detection: derivative → square → moving-window
 * integration → adaptive threshold with a refractory period, then refine each
 * candidate to the nearest true extremum in the detrended signal.
 */
function detectRPeaks(signal: number[], fs: number): number[] {
  const n = signal.length;
  if (n < 10) return [];
  // 5-point derivative
  const deriv = new Array<number>(n).fill(0);
  for (let i = 2; i < n - 2; i++) {
    deriv[i] = (2 * signal[i + 1] + signal[i + 2] - signal[i - 2] - 2 * signal[i - 1]) / 8;
  }
  const squared = deriv.map((x) => x * x);
  // moving-window integration ~150 ms
  const w = Math.max(1, Math.round(0.15 * fs));
  const integ = new Array<number>(n).fill(0);
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += squared[i];
    if (i >= w) run -= squared[i - w];
    integ[i] = run / w;
  }
  // Adaptive threshold: fraction of a slow-decaying running peak.
  const refractory = Math.round(0.25 * fs); // 250 ms → max ~240 bpm
  const globalMax = Math.max(...integ);
  if (!(globalMax > 0)) return [];
  let threshold = 0.35 * meanOfTop(integ, 0.02);
  const peaks: number[] = [];
  let last = -refractory;
  for (let i = 1; i < n - 1; i++) {
    if (integ[i] > threshold && integ[i] >= integ[i - 1] && integ[i] > integ[i + 1] && i - last > refractory) {
      // refine to the local |signal| extremum within ±60 ms
      const r = refinePeak(signal, i, Math.round(0.06 * fs));
      peaks.push(r);
      last = i;
      // update threshold toward the found peak level (running estimate)
      threshold = 0.5 * threshold + 0.5 * (0.4 * integ[i]);
    }
  }
  return peaks;
}

function refinePeak(signal: number[], center: number, win: number): number {
  const lo = Math.max(0, center - win);
  const hi = Math.min(signal.length - 1, center + win);
  let best = center; let bestVal = -Infinity;
  for (let i = lo; i <= hi; i++) {
    const a = Math.abs(signal[i]);
    if (a > bestVal) { bestVal = a; best = i; }
  }
  return best;
}

/**
 * Build a signal-averaged beat (ensemble average) and delineate P/QRS/T on it,
 * returning QRS, PR and QTc in ms. Averaging every normal beat aligned on its R
 * peak raises the SNR enormously, so amplitude-threshold onsets/offsets are
 * stable in a way per-beat delineation on a wrist lead never is. Each interval
 * is clamped to a physiologic range and dropped (null) if it lands out of range
 * or too few beats were available.
 */
function estimateIntervalsAveraged(signal: number[], fs: number, rPeaks: number[], medRrSec: number) {
  const pre = Math.round(0.35 * fs);   // samples kept before R (covers the P wave)
  const post = Math.round(0.50 * fs);  // samples kept after R (covers the T wave)
  const beatLen = pre + post + 1;
  if (rPeaks.length < 3) return { qrs: null, pr: null, qtc: null };

  // Ensemble-average, baseline-correcting each beat on its PR/TP segment so
  // wander doesn't bias the mean. Skip beats too close to the recording edges.
  const acc = new Array<number>(beatLen).fill(0);
  let used = 0;
  const baseLo = 0, baseHi = Math.max(1, pre - Math.round(0.22 * fs)); // pre-P isoelectric region
  for (const r of rPeaks) {
    if (r - pre < 0 || r + post >= signal.length) continue;
    let bl = 0;
    for (let i = baseLo; i < baseHi; i++) bl += signal[r - pre + i];
    bl /= (baseHi - baseLo);
    for (let i = 0; i < beatLen; i++) acc[i] += signal[r - pre + i] - bl;
    used++;
  }
  if (used < 3) return { qrs: null, pr: null, qtc: null };
  const beat = acc.map((x) => x / used);

  const R = pre; // R peak sits at the alignment index
  const rAmp = Math.abs(beat[R]) || 1;

  // Q / S troughs immediately flanking R.
  const qWin = Math.round(0.06 * fs);
  const q = localMinIndex(beat, Math.max(0, R - qWin), R);
  const s = localMinIndex(beat, R, Math.min(beatLen - 1, R + qWin));

  // QRS onset/offset: nearest point outside Q/S where the trace settles back
  // within a small band of the isoelectric baseline (0 after correction).
  const qrsThr = 0.06 * rAmp;
  const onset = returnToBaseline(beat, q, -1, qrsThr, Math.round(0.08 * fs));
  const offset = returnToBaseline(beat, s, +1, qrsThr, Math.round(0.08 * fs));
  const qrsMs = ((offset - onset) / fs) * 1000;
  const qrs = qrsMs >= 40 && qrsMs <= 200 ? Math.round(qrsMs) : null;

  // P wave: the dominant deflection in the segment before QRS onset.
  let pr: number | null = null;
  const pLo = Math.max(0, R - Math.round(0.30 * fs));
  const pHi = Math.max(pLo + 1, onset - Math.round(0.01 * fs));
  if (pHi - pLo > 3) {
    const pPeak = maxAbsIndex(beat, pLo, pHi);
    const pAmp = Math.abs(beat[pPeak]) || 1;
    // Only trust a P wave that's a real deflection, not baseline noise.
    if (pAmp > 0.04 * rAmp) {
      const pOnset = returnToBaseline(beat, pPeak, -1, 0.15 * pAmp, Math.round(0.08 * fs));
      const prMs = ((onset - pOnset) / fs) * 1000;
      if (prMs >= 80 && prMs <= 320) pr = Math.round(prMs);
    }
  }

  // T wave: the dominant deflection after QRS offset → QT (onset→T end), QTc Bazett.
  let qtc: number | null = null;
  const tLo = Math.min(beatLen - 1, offset + Math.round(0.04 * fs));
  const tHi = Math.min(beatLen - 1, R + Math.round(Math.min(0.5, medRrSec * 0.65) * fs));
  if (tHi - tLo > 5) {
    const tPeak = maxAbsIndex(beat, tLo, tHi);
    const tEnd = tangentTEnd(beat, tPeak, tHi);
    const qt = (tEnd - onset) / fs; // seconds
    if (qt >= 0.25 && qt <= 0.6 && medRrSec > 0.3) {
      const qtcMs = (qt / Math.sqrt(medRrSec)) * 1000;
      if (qtcMs >= 300 && qtcMs <= 650) qtc = Math.round(qtcMs);
    }
  }

  return { qrs, pr, qtc };
}

function localMinIndex(x: number[], lo: number, hi: number): number {
  let idx = lo; let val = Infinity;
  for (let i = lo; i <= hi; i++) if (x[i] < val) { val = x[i]; idx = i; }
  return idx;
}
function maxAbsIndex(x: number[], lo: number, hi: number): number {
  let idx = lo; let val = -Infinity;
  for (let i = lo; i <= hi; i++) { const a = Math.abs(x[i]); if (a > val) { val = a; idx = i; } }
  return idx;
}
/**
 * Walk from `start` in `dir` until the trace stays within `thr` of the
 * (corrected) isoelectric baseline for two consecutive samples — the wave
 * boundary. Falls back to the last stepped index if it never settles.
 */
function returnToBaseline(x: number[], start: number, dir: number, thr: number, maxSteps: number): number {
  let i = start;
  for (let step = 0; step < maxSteps; step++) {
    const j = i + dir;
    if (j < 1 || j >= x.length - 1) break;
    if (Math.abs(x[j]) < thr && Math.abs(x[j - dir]) < thr) return j;
    i = j;
  }
  return i;
}
/** T-wave end by the tangent method: steepest descent after the T peak,
 *  extrapolated to the local baseline. */
function tangentTEnd(x: number[], tPeak: number, hi: number): number {
  // find steepest downslope after the peak
  let steepIdx = tPeak; let steepSlope = 0;
  for (let i = tPeak; i < hi - 1; i++) {
    const slope = x[i + 1] - x[i];
    if (slope < steepSlope) { steepSlope = slope; steepIdx = i; }
  }
  if (steepSlope >= 0) return Math.min(hi, tPeak + 1);
  // baseline ≈ signal at hi (isoelectric before next beat)
  const baseline = x[hi];
  // tangent line: y = x[steepIdx] + steepSlope*(i-steepIdx); solve y=baseline
  const di = (baseline - x[steepIdx]) / steepSlope;
  const end = Math.round(steepIdx + di);
  return Math.max(tPeak + 1, Math.min(hi, end));
}

/* ------------------------------------------------------------------ */
/* Small stats helpers                                                 */
/* ------------------------------------------------------------------ */
function mean(a: number[]): number { return a.reduce((s, x) => s + x, 0) / a.length; }
function std(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
}
function rmssd(rr: number[]): number {
  if (rr.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < rr.length; i++) s += (rr[i] - rr[i - 1]) ** 2;
  return Math.sqrt(s / (rr.length - 1));
}
function median(a: number[]): number {
  const b = [...a].sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
/** Mean of the top `frac` fraction of values — a robust peak-level estimate. */
function meanOfTop(a: number[], frac: number): number {
  const b = [...a].sort((x, y) => y - x);
  const n = Math.max(1, Math.round(a.length * frac));
  return mean(b.slice(0, n));
}
