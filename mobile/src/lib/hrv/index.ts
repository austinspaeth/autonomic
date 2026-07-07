/**
 * HRV computation pipeline — pure, framework-free, unit-tested.
 *
 * Input: RR intervals (ms) collected over a ~5-minute reading (from BLE RR
 * values or HealthKit beat-to-beat). Output: every metric the manual HRV form
 * uses, keyed identically, so a captured reading is indistinguishable from a
 * typed-in one downstream (computeScores / summaries).
 *
 * Frequency domain: the RR tachogram is unevenly sampled, so we resample to
 * 4 Hz with linear interpolation, detrend, apply a Hann window, and run Welch's
 * method (overlapping segments, averaged periodograms) via a radix-2 FFT.
 */

export const HRV_BANDS = {
  vlf: [0.0033, 0.04],
  lf: [0.04, 0.15],
  hf: [0.15, 0.4],
} as const;

/* ---------- artifact detection & correction ---------- */
export interface ArtifactResult {
  clean: number[];
  artifactPct: number;
  flags: boolean[]; // aligned to the *input* array
}

/**
 * Flag RR intervals deviating > `threshold` (fraction) from a local moving
 * median, then correct them by interpolating between the nearest good beats.
 * Ectopic/missed beats, movement and swallowing show up as spikes here.
 */
export function correctArtifacts(rr: number[], threshold = 0.25, window = 5): ArtifactResult {
  const n = rr.length;
  if (n === 0) return { clean: [], artifactPct: 0, flags: [] };
  const flags = new Array(n).fill(false);
  const half = Math.max(1, Math.floor(window / 2));
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n, i + half + 1);
    const seg = rr.slice(lo, hi).filter((_, j) => lo + j !== i);
    const med = median(seg.length ? seg : [rr[i]]);
    // Physiologic guard rails: RR outside 300-2000 ms (30-200 bpm) is an artifact.
    if (rr[i] < 300 || rr[i] > 2000 || (med > 0 && Math.abs(rr[i] - med) / med > threshold)) {
      flags[i] = true;
    }
  }
  // Correct flagged beats by linear interpolation between nearest good neighbors.
  const clean = rr.slice();
  for (let i = 0; i < n; i++) {
    if (!flags[i]) continue;
    let a = i - 1;
    while (a >= 0 && flags[a]) a--;
    let b = i + 1;
    while (b < n && flags[b]) b++;
    if (a >= 0 && b < n) clean[i] = rr[a] + ((rr[b] - rr[a]) * (i - a)) / (b - a);
    else if (a >= 0) clean[i] = rr[a];
    else if (b < n) clean[i] = rr[b];
    // else: all flagged; leave as-is
  }
  const artifactPct = (flags.filter(Boolean).length / n) * 100;
  return { clean, artifactPct, flags };
}

/* ---------- time-domain ---------- */
export interface TimeDomain {
  meanRr: number;
  hr: number;
  sdnn: number;
  rmssd: number;
  pnn50: number;
  cv: number;
  mode: number;
  amo50: number;
  mxdmn: number; // seconds
  stressIndex: number;
  sd1: number; // Poincaré short-term (ms)
  sd2: number; // Poincaré long-term (ms)
  pns: number; // parasympathetic index (z-score composite)
  sns: number; // sympathetic index (z-score composite)
}

/**
 * Generic healthy-adult resting reference means/SDs used to normalize the
 * PNS/SNS composites. These are Kubios-style indices (a z-score blend of
 * vagal / sympathetic markers) built from population norms — they approximate
 * a device's PNS/SNS and are NOT guaranteed to match a specific device's
 * proprietary calibration to the decimal.
 */
const NORM = {
  meanRr: { m: 900, s: 110 },
  rmssd: { m: 42, s: 20 },
  sd1: { m: 30, s: 14 },
  hr: { m: 67, s: 10 },
  si: { m: 90, s: 45 }, // Baevsky stress index
};
const z = (x: number, ref: { m: number; s: number }) => (x - ref.m) / ref.s;

export function timeDomain(rr: number[]): TimeDomain | null {
  const n = rr.length;
  if (n < 2) return null;
  const meanRr = mean(rr);
  const hr = 60000 / meanRr;
  const sdnn = std(rr);
  let sq = 0, over50 = 0;
  for (let i = 1; i < n; i++) {
    const diff = rr[i] - rr[i - 1];
    sq += diff * diff;
    if (Math.abs(diff) > 50) over50++;
  }
  const rmssd = Math.sqrt(sq / (n - 1));
  const pnn50 = (over50 / (n - 1)) * 100;
  const cv = (sdnn / meanRr) * 100;

  // Baevsky: histogram in 50 ms bins. Mode = center of the most-populated bin;
  // AMo = % of RR in that bin; MxDMn = (max - min) in seconds.
  const binMs = 50;
  const bins = new Map<number, number>();
  rr.forEach((v) => { const b = Math.round(v / binMs); bins.set(b, (bins.get(b) || 0) + 1); });
  let modeBin = 0, modeCount = 0;
  bins.forEach((count, b) => { if (count > modeCount) { modeCount = count; modeBin = b; } });
  const mode = modeBin * binMs;
  const amo50 = (modeCount / n) * 100;
  const mxdmn = (Math.max(...rr) - Math.min(...rr)) / 1000;
  // Stress index (Baevsky): AMo / (2 * Mo(s) * MxDMn(s))
  const moSec = mode / 1000;
  const stressIndex = moSec > 0 && mxdmn > 0 ? amo50 / (2 * moSec * mxdmn) : 0;

  // Poincaré descriptors: SD1 (short-term, vagal) and SD2 (long-term).
  const sd1 = rmssd / Math.SQRT2;
  const sd2 = Math.sqrt(Math.max(0, 2 * sdnn * sdnn - sd1 * sd1));

  // PNS (parasympathetic): higher mean RR, RMSSD and SD1 all raise it.
  const pns = (z(meanRr, NORM.meanRr) + z(rmssd, NORM.rmssd) + z(sd1, NORM.sd1)) / 3;
  // SNS (sympathetic): higher HR and stress index raise it; higher RMSSD lowers it.
  const sns = (z(hr, NORM.hr) + z(stressIndex, NORM.si) - z(rmssd, NORM.rmssd)) / 3;

  return { meanRr, hr, sdnn, rmssd, pnn50, cv, mode, amo50, mxdmn, stressIndex, sd1, sd2, pns, sns };
}

/* ---------- frequency-domain (Welch PSD over a 4 Hz resampled tachogram) ---------- */
export interface FrequencyDomain {
  vlowPower: number; // VLF ms²
  lowPower: number; // LF ms²
  highPower: number; // HF ms²
  totalPower: number;
  lfhf: number;
  lfPeak: number; // Hz
  hfPeak: number; // Hz
  freqs: number[];
  psd: number[];
}

const FS = 4; // resample rate (Hz)

export function frequencyDomain(rr: number[]): FrequencyDomain | null {
  if (rr.length < 16) return null;
  const series = resampleTachogram(rr, FS);
  if (series.length < 16) return null;
  const detrended = detrend(series);

  // Welch: split into 50%-overlapping segments, Hann-window each, average PSDs.
  const segLen = Math.min(256, prevPow2(detrended.length));
  const step = Math.max(1, Math.floor(segLen / 2));
  const win = hann(segLen);
  const winPower = win.reduce((s, w) => s + w * w, 0);
  const half = segLen / 2;
  const psdAcc = new Array(half).fill(0);
  let segCount = 0;

  for (let start = 0; start + segLen <= detrended.length; start += step) {
    const seg = new Array(segLen);
    for (let i = 0; i < segLen; i++) seg[i] = detrended[start + i] * win[i];
    const { re, im } = fft(seg, new Array(segLen).fill(0));
    for (let k = 0; k < half; k++) {
      const mag2 = re[k] * re[k] + im[k] * im[k];
      // one-sided PSD scaling
      const scale = k === 0 ? 1 : 2;
      psdAcc[k] += (scale * mag2) / (FS * winPower);
    }
    segCount++;
  }
  if (segCount === 0) return null;
  const psd = psdAcc.map((v) => v / segCount);
  const df = FS / segLen;
  const freqs = psd.map((_, k) => k * df);

  const bandPower = (lo: number, hi: number) => {
    let sum = 0;
    for (let k = 0; k < psd.length; k++) if (freqs[k] >= lo && freqs[k] < hi) sum += psd[k] * df;
    return sum;
  };
  const bandPeak = (lo: number, hi: number) => {
    let pk = 0, pf = (lo + hi) / 2;
    for (let k = 0; k < psd.length; k++) if (freqs[k] >= lo && freqs[k] < hi && psd[k] > pk) { pk = psd[k]; pf = freqs[k]; }
    return pf;
  };

  const vlowPower = bandPower(HRV_BANDS.vlf[0], HRV_BANDS.vlf[1]);
  const lowPower = bandPower(HRV_BANDS.lf[0], HRV_BANDS.lf[1]);
  const highPower = bandPower(HRV_BANDS.hf[0], HRV_BANDS.hf[1]);
  const totalPower = vlowPower + lowPower + highPower;
  return {
    vlowPower, lowPower, highPower, totalPower,
    lfhf: highPower > 0 ? lowPower / highPower : 0,
    lfPeak: bandPeak(HRV_BANDS.lf[0], HRV_BANDS.lf[1]),
    hfPeak: bandPeak(HRV_BANDS.hf[0], HRV_BANDS.hf[1]),
    freqs, psd,
  };
}

/**
 * Frequency/power spectral-density curve for plotting — the resampled tachogram
 * run through the same Welch PSD as the metrics, trimmed to 0–0.5 Hz. Returns
 * null when there aren't enough beats. Used by the power-spectrum chart so it
 * shows the real distribution, not band rectangles.
 */
export function psdCurve(rr: number[]): { freqs: number[]; psd: number[] } | null {
  const { clean } = correctArtifacts(rr);
  const fd = frequencyDomain(clean);
  if (!fd) return null;
  const freqs: number[] = [];
  const psd: number[] = [];
  for (let i = 0; i < fd.freqs.length; i++) {
    if (fd.freqs[i] > 0.5) break;
    freqs.push(fd.freqs[i]);
    psd.push(fd.psd[i]);
  }
  return { freqs, psd };
}

/* ---------- top-level: full result ---------- */
export interface HrvResult {
  ok: boolean;
  reason?: string;
  artifactPct: number;
  rrClean: number[];
  time: TimeDomain;
  freq: FrequencyDomain;
  /** Fields ready to merge onto a reading (string values, PWA-compatible). */
  fields: Record<string, string>;
}

const r3 = (v: number) => Number(v.toFixed(3));
const r0 = (v: number) => Math.round(v);

export function computeHrv(rrRaw: number[], opts: { style?: string; maxArtifactPct?: number } = {}): HrvResult {
  const { clean, artifactPct } = correctArtifacts(rrRaw);
  const time = timeDomain(clean);
  const freq = frequencyDomain(clean);
  const maxArt = opts.maxArtifactPct ?? 30;
  if (!time || !freq) {
    return {
      ok: false, reason: 'Not enough clean data to compute HRV.', artifactPct,
      rrClean: clean, time: time as TimeDomain, freq: freq as FrequencyDomain, fields: {},
    };
  }
  const fields: Record<string, string> = {
    sdnn: r0(time.sdnn).toString(),
    rmssd: r0(time.rmssd).toString(),
    pnn50: r0(time.pnn50).toString(),
    meanRr: r0(time.meanRr).toString(),
    hr: r0(time.hr).toString(),
    avgHr: r0(time.hr).toString(),
    cv: Number(time.cv.toFixed(1)).toString(),
    mode: r0(time.mode).toString(),
    amo50: r0(time.amo50).toString(),
    mxdmn: r3(time.mxdmn).toString(),
    stressIndex: r0(time.stressIndex).toString(),
    pns: Number(time.pns.toFixed(1)).toString(),
    sns: Number(time.sns.toFixed(1)).toString(),
    vlowPower: r0(freq.vlowPower).toString(),
    lowPower: r0(freq.lowPower).toString(),
    highPower: r0(freq.highPower).toString(),
    lfPeak: r3(freq.lfPeak).toString(),
    hfPeak: r3(freq.hfPeak).toString(),
  };
  return {
    ok: artifactPct <= maxArt,
    reason: artifactPct > maxArt ? `Signal too noisy (${Math.round(artifactPct)}% artifacts). Adjust the strap and try again.` : undefined,
    artifactPct, rrClean: clean, time, freq, fields,
  };
}

/* ---------- math helpers ---------- */
export function mean(a: number[]): number { return a.reduce((s, x) => s + x, 0) / a.length; }
export function std(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1 || 1));
}
export function median(a: number[]): number {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function detrend(a: number[]): number[] { const m = mean(a); return a.map((x) => x - m); }
function hann(n: number): number[] {
  const w = new Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}
function prevPow2(n: number): number { let p = 1; while (p * 2 <= n) p *= 2; return p; }

/** Resample an RR tachogram to `fs` Hz by linear interpolation of the RR-vs-time curve. */
export function resampleTachogram(rr: number[], fs: number): number[] {
  // cumulative beat times (seconds), value = the RR interval ending at that time
  const t: number[] = [];
  let acc = 0;
  for (let i = 0; i < rr.length; i++) { acc += rr[i] / 1000; t.push(acc); }
  const duration = t[t.length - 1];
  const nSamples = Math.floor(duration * fs);
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < nSamples; i++) {
    const ts = i / fs;
    while (j < t.length - 1 && t[j] < ts) j++;
    const j0 = Math.max(0, j - 1);
    const t0 = t[j0], t1 = t[j];
    const v0 = rr[j0], v1 = rr[j];
    out.push(t1 === t0 ? v1 : v0 + ((v1 - v0) * (ts - t0)) / (t1 - t0));
  }
  return out;
}

/** In-place-safe iterative radix-2 Cooley–Tukey FFT. Input length must be a power of 2. */
export function fft(reIn: number[], imIn: number[]): { re: number[]; im: number[] } {
  const n = reIn.length;
  const re = reIn.slice(), im = imIn.slice();
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  return { re, im };
}

/**
 * Parse a Heart Rate Measurement characteristic (0x2A37) value into RR intervals
 * (ms) and the instantaneous HR. Flags byte: bit0 = 16-bit HR, bit4 = RR present.
 * RR values are in 1/1024-second units.
 */
export function parseHeartRateMeasurement(bytes: Uint8Array): { hr: number; rr: number[] } {
  const flags = bytes[0];
  let idx = 1;
  let hr: number;
  if (flags & 0x01) { hr = bytes[idx] | (bytes[idx + 1] << 8); idx += 2; }
  else { hr = bytes[idx]; idx += 1; }
  if (flags & 0x08) idx += 2; // energy expended present -> skip
  const rr: number[] = [];
  if (flags & 0x10) {
    for (; idx + 1 < bytes.length; idx += 2) {
      const raw = bytes[idx] | (bytes[idx + 1] << 8);
      rr.push((raw / 1024) * 1000);
    }
  }
  return { hr, rr };
}
