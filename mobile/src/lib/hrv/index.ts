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

/**
 * Wide moving-median window (beats) and the deviation from it beyond which a
 * beat cannot be the same person's rhythm. 61 beats ≈ 45 s at rest: wide enough
 * that a multi-second dropout can't dominate it, narrow enough to track real HR
 * drift over a reading. 0.38 sits well clear of the ±12-15% swing that deep
 * respiratory sinus arrhythmia produces, so the actual HRV signal is untouched.
 */
const WIDE_WINDOW = 61;
const WIDE_DEV = 0.38;

export interface ArtifactResult {
  clean: number[];
  artifactPct: number;
  flags: boolean[]; // aligned to the *input* array
}

/**
 * Flag RR intervals deviating > `threshold` (fraction) from a local moving
 * median, then correct them by interpolating between the nearest good beats.
 * Ectopic/missed beats, movement and swallowing show up as spikes here.
 *
 * Detection runs in three stages, then iterates:
 *  1. Absolute physiologic guard rails — RR outside 300-2000 ms (30-200 bpm)
 *     can never be a real sinus beat, so it's flagged up front and excluded
 *     from every median below.
 *  2. Deviation from a WIDE (~61-beat) moving median. The local test in stage 3
 *     is structurally blind to a long burst: when a dozen consecutive beats are
 *     junk, the ±3-beat window at the burst's center contains only junk, so its
 *     baseline is corrupted and the interior never flags no matter how many
 *     passes run. That is exactly the shape a camera dropout-and-reacquire
 *     makes, and it was the dominant source of inflated SDNN/RMSSD on camera
 *     readings. A 61-beat window centered on such a burst is still dominated by
 *     good beats, so the burst flags wholesale. The window moves, so genuine
 *     slow HR drift across a reading is tracked rather than flagged.
 *  3. Relative deviation from a LOCAL median, recomputed each pass from beats
 *     NOT yet flagged. This catches the short stuff — a single swallow, an
 *     ectopic beat — and iterating peels a short burst from the outside in: its
 *     edge beats (which still have clean neighbors) flag on the first pass; with
 *     those excluded, the interior beats compare against clean baselines and
 *     flag on the next.
 *
 * Because both baselines are medians over windows far wider than a breath,
 * genuine respiratory sinus arrhythmia — the smooth beat-to-beat oscillation
 * that IS the HRV signal — is preserved: a real beat never deviates far from
 * its neighbors, so it never flags no matter how many passes run.
 */
export function correctArtifacts(rr: number[], threshold = 0.25, window = 7, maxPasses = 4): ArtifactResult {
  const n = rr.length;
  if (n === 0) return { clean: [], artifactPct: 0, flags: [] };
  const flags = new Array(n).fill(false);
  const half = Math.max(1, Math.floor(window / 2));
  // Stage 1: absolute guard rails, so grossly impossible beats never pollute a
  // neighbor's median.
  for (let i = 0; i < n; i++) if (rr[i] < 300 || rr[i] > 2000) flags[i] = true;
  // Stage 2: wide moving median — the long-burst catcher.
  const wideHalf = Math.floor(WIDE_WINDOW / 2);
  for (let i = 0; i < n; i++) {
    if (flags[i]) continue;
    const seg: number[] = [];
    const lo = Math.max(0, i - wideHalf), hi = Math.min(n, i + wideHalf + 1);
    for (let j = lo; j < hi; j++) if (rr[j] >= 300 && rr[j] <= 2000) seg.push(rr[j]);
    if (seg.length < 8) continue; // too little context to judge — leave to stage 3
    const med = median(seg);
    if (med > 0 && Math.abs(rr[i] - med) / med > WIDE_DEV) flags[i] = true;
  }
  // Stage 3: relative deviation from a clean local median, iterated to convergence.
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (flags[i]) continue;
      const seg: number[] = [];
      const lo = Math.max(0, i - half), hi = Math.min(n, i + half + 1);
      for (let j = lo; j < hi; j++) if (j !== i && !flags[j]) seg.push(rr[j]);
      const med = median(seg.length ? seg : [rr[i]]);
      if (med > 0 && Math.abs(rr[i] - med) / med > threshold) {
        flags[i] = true;
        changed = true;
      }
    }
    if (!changed) break; // clean data settles after one pass — no behaviour change
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

/**
 * Camera-PPG beat repair — a pre-pass BEFORE {@link correctArtifacts}, targeting
 * the two error modes optical peak detection produces that a spike corrector
 * can't fix by interpolation because they change the *beat count*:
 *
 *  - **Missed beat**: the detector skips a pulse, so one RR interval spans two
 *    real beats (~2× the local median, ~3× for two skips). Left alone it reads
 *    as a single long beat; interpolating it away loses the beat entirely. We
 *    split it into equal sub-intervals so the tachogram keeps the right count.
 *  - **Extra (false) beat**: a dicrotic notch or motion bump is detected as a
 *    pulse, splitting one real interval into a short pair that sums back to a
 *    plausible beat. We merge the pair.
 *
 * Both are judged against a LOCAL median (robust to the very outlier being
 * tested), so genuine sinus arrhythmia is untouched. Strap/ECG sources don't
 * need this and don't run it — their R-peak clock doesn't miss or double beats.
 */
export function repairBeats(rr: number[]): number[] {
  return repairBeatsCounted(rr).rr;
}

/**
 * {@link repairBeats} plus a count of how many intervals it rewrote. The count
 * matters for honesty: repair MANUFACTURES plausible beats (a junk 1400 ms
 * interval becomes two tidy 700 ms ones), which means it can launder noise into
 * data that the artifact detector then scores as clean. Surfacing the repair
 * rate alongside the artifact rate keeps a heavily-reconstructed reading from
 * presenting itself as pristine.
 */
export function repairBeatsCounted(rr: number[]): { rr: number[]; repaired: number } {
  const n = rr.length;
  if (n < 3) return { rr: rr.slice(), repaired: 0 };
  let repaired = 0;
  const localMed = (i: number) => median(rr.slice(Math.max(0, i - 3), Math.min(n, i + 4)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = localMed(i);
    if (m <= 0) { out.push(rr[i]); continue; }
    const ratio = rr[i] / m;
    // One missed beat → split in two; two missed → split in three.
    if (ratio >= 1.6 && ratio <= 2.4) { out.push(rr[i] / 2, rr[i] / 2); repaired++; continue; }
    if (ratio > 2.4 && ratio <= 3.4) { out.push(rr[i] / 3, rr[i] / 3, rr[i] / 3); repaired++; continue; }
    // Extra beat → merge the short pair back into one interval.
    if (ratio < 0.7 && i + 1 < n) {
      const pair = rr[i] + rr[i + 1];
      const pr = pair / m;
      if (pr >= 0.7 && pr <= 1.4) { out.push(pair); i++; repaired++; continue; }
    }
    out.push(rr[i]);
  }
  return { rr: out, repaired };
}

/* ---------- segmentation ---------- */

/**
 * A reading is captured as one or more segments of continuously-tracked pulse.
 * `starts` are indices into `rr` at which a NEW segment begins (index 0 is
 * implicit). An empty/absent `starts` means the whole reading is continuous,
 * which is the strap/ECG case.
 */
export function splitSegments(rr: number[], starts?: number[]): number[][] {
  if (!starts || !starts.length) return [rr];
  const bounds = Array.from(new Set([0, ...starts.filter((i) => i > 0 && i < rr.length)])).sort((a, b) => a - b);
  return bounds.map((s, k) => rr.slice(s, k + 1 < bounds.length ? bounds[k + 1] : rr.length)).filter((s) => s.length > 0);
}

/**
 * Segment triage. A stitched reading is only as good as the pieces it's made
 * of, and interpolating a hopeless stretch back onto the baseline still leaves
 * fabricated beats in the statistics. Better to throw the piece away and say so.
 *
 * A segment is discarded when it is too short to carry a stable statistic, when
 * too much of it had to be corrected, or when its own median heart rate sits
 * far off the rest of the reading — the "that clearly wasn't their pulse" case,
 * typically the detector locking onto the dicrotic notch (half the true rate)
 * or onto motion after a reacquire.
 */
const MIN_SEGMENT_BEATS = 20;
const SEGMENT_MAX_ARTIFACT = 30;
const SEGMENT_MEDIAN_DEV = 0.2;

export interface SegmentTriage {
  kept: number[][];
  keptStarts: number[];
  dropped: number;
  droppedBeats: number;
}

export function triageSegments(cleaned: { clean: number[]; artifactPct: number }[]): SegmentTriage {
  const recordMed = median(cleaned.flatMap((c) => c.clean));
  const kept: number[][] = [];
  const keptStarts: number[] = [];
  let dropped = 0, droppedBeats = 0, cursor = 0;
  for (const c of cleaned) {
    const segMed = median(c.clean);
    const offBaseline = recordMed > 0 && Math.abs(segMed - recordMed) / recordMed > SEGMENT_MEDIAN_DEV;
    if (c.clean.length < MIN_SEGMENT_BEATS || c.artifactPct > SEGMENT_MAX_ARTIFACT || offBaseline) {
      dropped++;
      droppedBeats += c.clean.length;
      continue;
    }
    keptStarts.push(cursor);
    cursor += c.clean.length;
    kept.push(c.clean);
  }
  return { kept, keptStarts, dropped, droppedBeats };
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
  return timeDomainSegments([rr]);
}

/**
 * Time-domain metrics over a reading captured as one or more DISCONTINUOUS
 * segments (camera PPG drops signal and reacquires; each stretch of locked
 * pulse is a segment). Passing a single segment reproduces the classic
 * whole-array formulas exactly, so strap/ECG readings are unaffected.
 *
 * Two things must not cross a segment boundary:
 *
 *  - **Successive-difference metrics** (RMSSD, pNN50, and SD1 which derives
 *    from RMSSD). The "difference" between the last beat before a dropout and
 *    the first beat after it spans however many seconds of missing data — it is
 *    not a beat-to-beat difference at all, and feeding it in inflates RMSSD.
 *    Differences are summed within segments and pooled by degrees of freedom.
 *  - **SDNN's mean.** A reacquired segment often sits at a slightly different
 *    heart rate (the user shifted, or simply relaxed further). Taking one grand
 *    mean charges that offset to variability, which is how clean data alone can
 *    report SDNN in the 60s. Deviations are taken from each segment's OWN mean
 *    and pooled — the within-segment variance the user actually produced.
 *
 * The tradeoff is honest and worth stating: pooled SDNN excludes drift BETWEEN
 * segments, some of which is real slow variability. It under-reports slightly
 * rather than over-reporting wildly, which is the right direction to err.
 */
export function timeDomainSegments(segments: number[][]): TimeDomain | null {
  const segs = segments.filter((s) => s.length >= 2);
  const rr = segs.flat();
  const n = rr.length;
  if (n < 2) return null;
  const meanRr = mean(rr);
  const hr = 60000 / meanRr;

  // Pooled within-segment SD: deviations from each segment's own mean, with one
  // degree of freedom spent per segment mean.
  let ss = 0, sdDof = 0;
  for (const s of segs) {
    const m = mean(s);
    for (const v of s) ss += (v - m) * (v - m);
    sdDof += s.length - 1;
  }
  const sdnn = Math.sqrt(ss / (sdDof || 1));

  // Successive differences, never across a seam.
  let sq = 0, over50 = 0, diffs = 0;
  for (const s of segs) {
    for (let i = 1; i < s.length; i++) {
      const diff = s[i] - s[i - 1];
      sq += diff * diff;
      if (Math.abs(diff) > 50) over50++;
      diffs++;
    }
  }
  const rmssd = Math.sqrt(sq / (diffs || 1));
  const pnn50 = (over50 / (diffs || 1)) * 100;
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
  /** Seconds of usable cardiac data actually behind the numbers. */
  coverageSec: number;
  /** Longest unbroken stretch — what the frequency bands are gated on. */
  longestCleanSec: number;
  /** Segment boundaries within `rrClean` (indices where a new segment begins). */
  cleanSegmentStarts: number[];
  segmentsUsed: number;
  segmentsDropped: number;
  /** % of beats reconstructed by {@link repairBeats} before correction. */
  repairPct: number;
  confidence: 'high' | 'fair' | 'low';
}

const r3 = (v: number) => Number(v.toFixed(3));
const r0 = (v: number) => Math.round(v);

/**
 * Frequency-domain reliability floors. Welch resolution over a short record is
 * too coarse to separate the low bands: LF needs ~2 min to resolve, VLF ~5 min
 * (Task Force / Kubios guidance). Below these the corresponding metrics swing
 * wildly reading-to-reading, so we omit them entirely rather than report noise
 * as a number — a camera reading finished early, or a 30 s Apple ECG, simply
 * won't carry LF/HF or VLF. Time-domain metrics (RMSSD, SD1, pNN50) and the
 * time-domain PNS/SNS composites stay valid at short durations and are kept.
 *
 * VLF sits at 240 s rather than the textbook 300 s deliberately. These floors
 * are charged against `longestCleanSec` — the summed RR of the longest unbroken
 * kept segment — which for a nominal 300 s strap/watch capture always lands a
 * few seconds short: collection starts on the first notification, the session
 * stops mid-beat, and a single dropout splits the record. At a 300 s floor a
 * clean 5-minute reading passes or fails on a coin flip. 240 s gives it real
 * headroom while still excluding the 180 s camera capture and 30 s Apple ECG.
 * The cost is bounded: `frequencyDomain` caps its Welch window at 256 samples
 * (64 s at FS=4), so band RESOLUTION is identical either way — a shorter record
 * only averages fewer segments (8 at 300 s vs 6 at 240 s), so VLF is slightly
 * noisier, not coarser.
 */
const MIN_SEC_LFHF = 120;
const MIN_SEC_VLF = 240;
/** A stable reading needs a floor of clean beats behind its statistics. */
const MIN_CLEAN_BEATS = 30;
/** Fraction of the attempted reading that must survive cleaning to be trusted. */
const MIN_COVERAGE_RATIO = 0.5;

export function computeHrv(
  rrRaw: number[],
  opts: {
    style?: string; maxArtifactPct?: number; source?: string; durationSec?: number;
    /** Indices into `rrRaw` where tracking resumed after a dropout. */
    segmentStarts?: number[];
  } = {},
): HrvResult {
  const segmented = !!(opts.segmentStarts && opts.segmentStarts.length);
  const rawSegments = splitSegments(rrRaw, opts.segmentStarts);

  // Camera PPG misses and doubles beats optically; repair those before the
  // spike corrector runs. Strap/watch/ECG sources have a true R-peak clock.
  // Repair and correction both run PER SEGMENT so neither one reasons across a
  // seam it can't see.
  let repaired = 0;
  const cleaned = rawSegments.map((seg) => {
    const pre = opts.source === 'camera' ? repairBeatsCounted(seg) : { rr: seg, repaired: 0 };
    repaired += pre.repaired;
    return correctArtifacts(pre.rr);
  });
  const repairPct = rrRaw.length ? (repaired / rrRaw.length) * 100 : 0;

  const { kept, keptStarts, dropped, droppedBeats } = triageSegments(cleaned);
  const clean = kept.flat();

  // Artifact rate is charged over everything we started with — beats thrown out
  // with a discarded segment count against the reading, they don't vanish.
  const analyzedBeats = clean.length + droppedBeats;
  const flaggedBeats = cleaned.reduce((s, c) => s + (c.artifactPct / 100) * c.clean.length, 0);
  const artifactPct = analyzedBeats ? ((flaggedBeats + droppedBeats) / analyzedBeats) * 100 : 0;

  const time = timeDomainSegments(kept);
  // The bands need an unbroken stretch: Welch over a tachogram stitched across
  // dropouts reads the seams as spectral content. Use the longest segment.
  const longest = kept.reduce((best, s) => (s.length > best.length ? s : best), [] as number[]);
  const freq = frequencyDomain(longest);
  const secOf = (s: number[]) => s.reduce((a, x) => a + x, 0) / 1000;
  const coverageSec = secOf(clean);
  const longestCleanSec = secOf(longest);

  // Camera is the noisiest source, so hold it to a tighter artifact ceiling.
  const maxArt = opts.maxArtifactPct ?? (opts.source === 'camera' ? 15 : 30);
  const durationSec = opts.durationSec ?? coverageSec;
  const noisy = artifactPct > maxArt;
  const tooFew = clean.length < MIN_CLEAN_BEATS;
  // Only a segmented (live camera) capture knows its own wall-clock gaps, so
  // only it can be judged on coverage. An imported series has no such notion.
  const thin = segmented && durationSec > 0 && coverageSec / durationSec < MIN_COVERAGE_RATIO;
  if (!time || !freq || tooFew) {
    const reason = tooFew && time
      ? 'Not enough clean beats to compute HRV. Try a longer, steadier reading.'
      : 'Not enough clean data to compute HRV.';
    return {
      ok: false, reason, artifactPct,
      rrClean: clean, time: time as TimeDomain, freq: freq as FrequencyDomain, fields: {},
      coverageSec, longestCleanSec, cleanSegmentStarts: keptStarts,
      segmentsUsed: kept.length, segmentsDropped: dropped, repairPct, confidence: 'low',
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
  };
  // Frequency-domain metrics only when an UNBROKEN stretch is long enough to
  // resolve them — 120 s of coverage in four fragments resolves nothing.
  if (longestCleanSec >= MIN_SEC_LFHF) {
    fields.lowPower = r0(freq.lowPower).toString();
    fields.highPower = r0(freq.highPower).toString();
    fields.lfPeak = r3(freq.lfPeak).toString();
    fields.hfPeak = r3(freq.hfPeak).toString();
  }
  if (longestCleanSec >= MIN_SEC_VLF) {
    fields.vlowPower = r0(freq.vlowPower).toString();
  }

  const coverageRatio = durationSec > 0 ? Math.min(1, coverageSec / durationSec) : 1;
  const confidence: HrvResult['confidence'] =
    artifactPct <= 5 && repairPct <= 5 && dropped === 0 && coverageRatio >= 0.9 ? 'high'
      : !noisy && !thin && artifactPct <= 10 && coverageRatio >= 0.7 ? 'fair'
        : 'low';

  const reason = noisy
    ? `Signal too noisy (${Math.round(artifactPct)}% artifacts). ${opts.source === 'camera' ? 'Hold your finger still with light pressure and try again.' : 'Adjust the strap and try again.'}`
    : thin
      ? `Only ${Math.round(coverageSec)}s of usable pulse out of ${Math.round(durationSec)}s. Keep your finger still and fully covering the lens, then try again.`
      : undefined;

  return {
    ok: !noisy && !thin,
    reason,
    artifactPct, rrClean: clean, time, freq, fields,
    coverageSec, longestCleanSec, cleanSegmentStarts: keptStarts,
    segmentsUsed: kept.length, segmentsDropped: dropped, repairPct, confidence,
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
