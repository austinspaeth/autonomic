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

  // RR-based metrics (reliable).
  const rr: number[] = []; // seconds
  for (let i = 1; i < rPeaks.length; i++) rr.push((rPeaks[i] - rPeaks[i - 1]) / fs);
  const rrValid = rr.filter((x) => x >= 0.3 && x <= 2.0); // 30–200 bpm
  if (rrValid.length >= 2) {
    const meanRr = mean(rrValid);
    base.hr = Math.round(60 / meanRr);
    base.sdnn = Math.round(std(rrValid) * 1000);
    base.rmssd = Math.round(rmssd(rrValid) * 1000);
    const medRr = median(rrValid);
    base.ectopic = rr.filter((x) => x > 0 && x < 0.8 * medRr).length;
  }
  // Apple's HR is authoritative when we couldn't derive one.
  if (base.hr == null && s.averageHeartRate) base.hr = Math.round(s.averageHeartRate);

  // Interval estimates (approximate; single lead).
  const iv = estimateIntervals(signal, fs, rPeaks, rr);
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
 * Estimate median QRS, PR and QTc across beats. Best-effort single-lead
 * delineation; each interval is clamped to a physiologic range and dropped if
 * out of range. Requires ≥3 valid beats to report a value.
 */
function estimateIntervals(signal: number[], fs: number, rPeaks: number[], rrSec: number[]) {
  const qrsVals: number[] = [];
  const prVals: number[] = [];
  const qtVals: number[] = []; // seconds, paired with rr for correction
  const qtcVals: number[] = [];

  for (let k = 0; k < rPeaks.length; k++) {
    const r = rPeaks[k];
    const nextR = k + 1 < rPeaks.length ? rPeaks[k + 1] : Math.min(signal.length - 1, r + Math.round(fs));
    const rr = rrSec[k] ?? (nextR - r) / fs;

    // Q and S troughs adjacent to R.
    const qWin = Math.round(0.06 * fs);
    const q = localMinIndex(signal, Math.max(0, r - qWin), r);
    const s = localMinIndex(signal, r, Math.min(signal.length - 1, r + qWin));

    // QRS onset/offset: walk out from Q/S until the slope flattens.
    const onset = walkToFlat(signal, q, -1, Math.round(0.05 * fs));
    const offset = walkToFlat(signal, s, +1, Math.round(0.05 * fs));
    const qrs = ((offset - onset) / fs) * 1000;
    if (qrs >= 40 && qrs <= 200) qrsVals.push(qrs);

    // P wave before QRS onset.
    const pHi = onset;
    const pLo = Math.max(0, r - Math.round(0.28 * fs));
    if (pHi - pLo > 3) {
      const pPeak = maxAbsIndex(signal, pLo, pHi);
      const pOnset = walkToFlat(signal, pPeak, -1, Math.round(0.06 * fs));
      const pr = ((onset - pOnset) / fs) * 1000;
      if (pr >= 80 && pr <= 320) prVals.push(pr);
    }

    // T wave after QRS offset → QT and QTc (Bazett).
    const tLo = Math.min(signal.length - 1, offset + Math.round(0.05 * fs));
    const tHi = Math.min(signal.length - 1, r + Math.round(Math.min(0.55, rr * 0.7) * fs));
    if (tHi - tLo > 5) {
      const tPeak = maxAbsIndex(signal, tLo, tHi);
      const tEnd = tangentTEnd(signal, tPeak, tHi);
      const qt = (tEnd - onset) / fs; // seconds
      if (qt >= 0.25 && qt <= 0.6 && rr > 0.3) {
        qtVals.push(qt);
        const qtc = (qt / Math.sqrt(rr)) * 1000;
        if (qtc >= 300 && qtc <= 650) qtcVals.push(qtc);
      }
    }
  }

  const pick = (arr: number[]) => (arr.length >= 3 ? Math.round(median(arr)) : null);
  void qtVals;
  return { qrs: pick(qrsVals), pr: pick(prVals), qtc: pick(qtcVals) };
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
/** Walk from `start` in `dir` until local slope drops near zero (wave boundary). */
function walkToFlat(x: number[], start: number, dir: number, maxSteps: number): number {
  let i = start;
  let prevSlope = Infinity;
  for (let step = 0; step < maxSteps; step++) {
    const j = i + dir;
    if (j < 1 || j >= x.length - 1) break;
    const slope = Math.abs(x[j + 1] - x[j - 1]);
    if (slope < 0.15 * prevSlope) { i = j; break; }
    prevSlope = Math.min(prevSlope, slope) || slope;
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
