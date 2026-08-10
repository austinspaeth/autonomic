---
title: "HRV Histogram Metrics: Mode, AMo50, MxDMn and CV"
slug: hrv-histogram-mode-amo50-mxdmn-cv
published: true
summary: "Mode, AMo50, MxDMn and CV are the geometric HRV metrics: four different reads on the shape of your heartbeat-interval histogram. They're the raw ingredients behind the Baevsky stress index. Here's what each one describes and how to grade it."
description: "What Mode, AMo50, MxDMn and CV mean in HRV: how these geometric histogram metrics describe the shape of your RR-interval distribution, healthy ranges, and how they feed the Baevsky stress index."
keywords: "HRV histogram, Mode HRV, AMo50, MxDMn, coefficient of variation HRV, CV HRV, geometric HRV metrics, Baevsky stress index, heart rate variability, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1768207750856-e1241dd2888b?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Edwin Rodriguez / Unsplash"
tldr: "Mode, AMo50, MxDMn and CV are geometric HRV metrics: different ways of describing the shape of the histogram your heartbeat intervals form. Mode is the histogram's center (your most common interval), AMo50 is its peak height (how concentrated the rhythm is; it rises under strain), MxDMn is its full width (how much your intervals range), and CV is heart-rate-normalized variability (SDNN divided by mean interval). Mode, AMo50 and MxDMn are the raw ingredients of the Baevsky stress index. Trust the trend, since a single artifact can distort the shape."
categories:
  - basics
  - hrv
faq:
  - q: "What is AMo50 in HRV?"
    a: "AMo50 is the amplitude of the mode: the percentage of your heartbeat intervals that fall inside the single most common 50 ms bin of the histogram. It measures how tall and concentrated the histogram's peak is. A high AMo50 means the rhythm has narrowed onto one dominant interval, which happens under sympathetic strain, so with AMo50, lower is generally better."
  - q: "What is the coefficient of variation in HRV?"
    a: "The coefficient of variation (CV) is SDNN divided by the mean interval, times 100, expressed as a percent. It normalizes your variability to your heart rate, so a fast-heart reading and a slow-heart reading become comparable. It answers 'how variable is this rhythm relative to its own pace?' rather than in raw milliseconds."
  - q: "What is MxDMn?"
    a: "MxDMn is the maximum interval minus the minimum interval in a reading, in seconds: the full width of your histogram. A wide MxDMn means your beat intervals ranged freely (healthy); a narrow one means a rigid rhythm. Because it depends on the two most extreme beats, a single artifact can inflate it, so it's best read as a trend."
  - q: "How do these relate to the stress index?"
    a: "Mode, AMo50 and MxDMn are the three raw ingredients of the Baevsky stress index, a geometric measure of sympathetic strain. The index rises when the histogram is tall and narrow (high AMo50, small MxDMn) and falls when it's low and wide, so these three metrics are what the stress index is built from."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what makes the in-article calculator run in the browser.
  const cvScript = `<script>
(function () {
  var sdnnIn = document.getElementById('cv-sdnn');
  if (!sdnnIn) return;
  var rrIn = document.getElementById('cv-rr');
  var out = document.getElementById('cv-value');
  var grade = document.getElementById('cv-grade');
  var note = document.getElementById('cv-note');
  var card = document.getElementById('cv-calc');
  function band(n) {
    if (isNaN(n)) return null;
    if (n >= 7) return ['Excellent', '#54d98a', 'Strong rate-normalized variability.'];
    if (n >= 5.5) return ['Good', '#22c55e', 'A healthy coefficient of variation.'];
    if (n >= 4.5) return ['Moderate', '#eab308', 'Middle of the range. Watch the weekly trend.'];
    if (n >= 3) return ['Compromised', '#f97316', 'Below target, common on an under-recovered day.'];
    return ['Bad', '#ef4444', 'Very little variation relative to heart rate.'];
  }
  function update() {
    var sdnn = parseFloat(sdnnIn.value);
    var rr = parseFloat(rrIn.value);
    if (isNaN(sdnn) || isNaN(rr) || rr <= 0) {
      out.textContent = '-';
      grade.textContent = 'Enter values';
      grade.style.color = '';
      note.textContent = 'Enter your SDNN and mean interval to compute CV.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    var cv = sdnn / rr * 100;
    out.textContent = cv.toFixed(1) + '%';
    var b = band(cv);
    grade.textContent = b[0];
    grade.style.color = b[1];
    note.textContent = b[2];
    if (card) card.style.setProperty('--mc-accent', b[1]);
  }
  sdnnIn.addEventListener('input', update);
  rrIn.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## Four ways to read the shape of your heartbeat

Most HRV numbers are statistics on a list of intervals. The geometric family works differently: it treats those intervals as a **histogram** (a bar chart of how often each interval length shows up) and then measures the *shape* of that chart. Pile up a few minutes of beats and they form a hump: some interval length is most common, the rest fan out on either side. **Mode**, **AMo50**, **MxDMn** and **CV** are four different rulers held against that hump.

This lineage traces back to the Russian physiologist R.M. Baevsky, whose work on the geometry of the [RR-interval](/insights/basics/rr-intervals-and-the-tachogram-explained/) distribution gave us the stress index still used today. The appeal is intuition: instead of an abstract standard deviation, you get the center, the height, and the width of a picture you can actually imagine.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 280" role="img" aria-label="An RR-interval histogram with bars forming a hump, labeling the Mode as the center peak, AMo50 as the peak height, and MxDMn as the full width from the shortest to longest interval">
    <line x1="60" y1="230" x2="700" y2="230" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="60" y1="40" x2="60" y2="230" stroke="var(--line-2)" stroke-width="1.5" />
    <g fill="#58c4f2" opacity="0.85">
      <rect x="150" y="200" width="34" height="30"/>
      <rect x="188" y="170" width="34" height="60"/>
      <rect x="226" y="120" width="34" height="110"/>
      <rect x="264" y="70" width="34" height="160"/>
      <rect x="302" y="120" width="34" height="110"/>
      <rect x="340" y="150" width="34" height="80"/>
      <rect x="378" y="185" width="34" height="45"/>
      <rect x="416" y="205" width="34" height="25"/>
    </g>
    <line x1="281" y1="60" x2="281" y2="230" stroke="#e03127" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="281" y="52" text-anchor="middle" fill="#e03127" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">Mode</text>
    <text x="281" y="70" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="9">center</text>
    <line x1="470" y1="70" x2="470" y2="230" stroke="var(--dim-2)" stroke-width="1"/>
    <text x="486" y="150" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">AMo50 = peak height</text>
    <line x1="150" y1="248" x2="450" y2="248" stroke="var(--dim-2)" stroke-width="1"/>
    <text x="300" y="266" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">MxDMn = full width (max − min)</text>
    <text x="380" y="223" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-size="12">RR interval length →</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 262" role="img" aria-label="An RR-interval histogram with bars forming a hump, labeling the Mode as the center peak, AMo50 as the peak height, and MxDMn as the full width from the shortest to longest interval">
    <line x1="44" y1="214" x2="344" y2="214" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="44" y1="40" x2="44" y2="214" stroke="var(--line-2)" stroke-width="1.5" />
    <g fill="#58c4f2" opacity="0.85">
      <rect x="70" y="187" width="28" height="27"/>
      <rect x="102" y="159" width="28" height="55"/>
      <rect x="134" y="113" width="28" height="101"/>
      <rect x="166" y="67" width="28" height="147"/>
      <rect x="198" y="113" width="28" height="101"/>
      <rect x="230" y="141" width="28" height="73"/>
      <rect x="262" y="173" width="28" height="41"/>
      <rect x="294" y="191" width="28" height="23"/>
    </g>
    <line x1="180" y1="57" x2="180" y2="214" stroke="#e03127" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="180" y="24" text-anchor="middle" fill="#e03127" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">Mode</text>
    <text x="180" y="38" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="9.5">center</text>
    <line x1="194" y1="67" x2="344" y2="67" stroke="var(--dim-2)" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="344" y="60" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">AMo50 = peak height</text>
    <line x1="70" y1="226" x2="322" y2="226" stroke="var(--dim-2)" stroke-width="1"/>
    <text x="196" y="242" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">MxDMn = full width (max − min)</text>
    <text x="196" y="260" text-anchor="middle" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-size="11">RR interval length →</text>
  </svg>
  <figcaption>The same reading as a histogram. Mode is where the peak sits, AMo50 is how tall that peak is, and MxDMn is how wide the whole distribution spreads.</figcaption>
</figure>

## Mode: the center of the histogram

**Mode** (Mo) is the most common interval length in the reading: the tallest bar's position. Because it's the interval your heart returned to most often, it tracks your underlying resting rate closely: it's essentially a robust cousin of your mean interval, read off the histogram's peak instead of a raw average. It's reported in milliseconds and sits on the same scale as [mean RR and resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/): a Mode of 950 ms corresponds to roughly 63 bpm.

<div class="callout callout-note">
  <strong>Mode moves the whole picture left or right.</strong> Where AMo50 and MxDMn describe the histogram's shape, Mode describes its position. A Mode drifting toward shorter intervals (a faster resting rate) is the geometric echo of a rising resting heart rate, often an early sign the system is under load.
</div>

## AMo50: the height of the peak

**AMo50** (amplitude of the mode) is the percentage of all intervals that fall inside the single most common 50 ms bin. In histogram terms, it's the **height of the peak**. When your rhythm is varied and healthy, the beats spread across many bins and no single bin holds many, AMo50 is low. When the system tightens under sympathetic strain, the rhythm concentrates onto one dominant interval, the peak spikes, and **AMo50 rises**. So unlike most HRV metrics, with AMo50 *lower is better*.

## MxDMn: the width of the histogram

**MxDMn** is the maximum interval minus the minimum interval, reported in **seconds**: the histogram's full width. A wide MxDMn means your intervals ranged freely from short to long, the mark of a flexible, healthy rhythm; a narrow one means the beats were penned into a small range, a rigid rhythm. Because it depends entirely on the two most extreme beats in the reading, a single stray or mis-detected beat can stretch it artificially, so of the four, MxDMn is the one to read as a trend and never trust on a single noisy recording.

## CV: variability, normalized to your rate

**CV**, the coefficient of variation, solves a nagging problem: raw variability in milliseconds partly depends on how fast your heart is beating. CV divides that out. It's [SDNN](/insights/basics/what-is-sdnn-in-hrv/) divided by the mean interval, times 100, expressed as a percent:

<div class="callout callout-note">
  <strong>CV = SDNN ÷ mean RR × 100</strong>. An SDNN of 45 ms on a mean interval of 850 ms gives a CV of about 5.3%. The same 45 ms of variation on a faster 700 ms rhythm gives 6.4%, more variable *relative to its pace*. That's what CV captures: how much your rhythm varies compared to its own baseline rate, so readings taken at different heart rates become comparable.
</div>

## How these feed the stress index

Three of these four (Mode, AMo50 and MxDMn) are the raw ingredients of the **Baevsky stress index**, the geometric measure of sympathetic strain. As the <a href="https://www.kubios.com/hrv-analysis-methods/" target="_blank" rel="noopener">Kubios HRV analysis methods</a> describe, the index combines them so that it climbs when the histogram is **tall and narrow** (high AMo50, small MxDMn, centered on a short Mode) and falls when it's **low and wide**. In other words, these metrics aren't just descriptive: they're the geometry the stress index reads. We unpack that composite in [the PNS, SNS and stress index explainer](/insights/basics/pns-index-sns-index-stress-index-explained/).

## How Autonomic grades these metrics

Autonomic grades each geometric metric against the recovery framework's thresholds, tuned for the few-minute readings the app captures.

**Mode (ms)**, same scale as mean RR; too high can signal a very slow rhythm, so the bottom band brackets both extremes:

| Grade | Mode (ms) | What it usually reflects |
| --- | --- | --- |
| Excellent | 950+ | Relaxed, slow resting rhythm |
| Good | 870–949 | Healthy resting interval |
| Moderate | 790–869 | Middle of the range |
| Compromised | 720–789 | Faster resting rate; under load |
| Crash | Under 720 or over 1090 | Very fast, or unusually slow, read in context |

**AMo50 (%)**, lower is better; a tall peak means a concentrated, strained rhythm:

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>&lt; 30</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>30–39</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>40–49</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>50–59</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>60+</small></span>
</div>

| Grade | AMo50 (%) | What it usually reflects |
| --- | --- | --- |
| Excellent | Under 30 | Spread-out rhythm, low concentration |
| Good | 30–39 | Healthy, varied distribution |
| Moderate | 40–49 | Middle of the range |
| Compromised | 50–59 | Peak narrowing; sympathetic strain |
| Crash | 60+ | Rhythm collapsed onto one interval |

**MxDMn (seconds)**, wider is better:

| Grade | MxDMn (s) | What it usually reflects |
| --- | --- | --- |
| Excellent | 0.35+ | Wide, freely ranging intervals |
| Good | 0.25–0.34 | Healthy spread |
| Moderate | 0.18–0.24 | Middle of the range |
| Compromised | 0.12–0.17 | Narrowing range; rigid rhythm |
| Bad | Under 0.12 | Very tight range, low variability |

**CV (%)**, rate-normalized variability:

<div class="metric-scale">
  <span class="ms-seg" style="background:#ef4444">Bad<small>&lt; 3</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>3–4.4</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>4.5–5.4</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>5.5–6.9</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>7+</small></span>
</div>

| Grade | CV (%) | What it usually reflects |
| --- | --- | --- |
| Excellent | 7+ | Strong variability relative to rate |
| Good | 5.5–6.9 | Healthy rate-normalized variability |
| Moderate | 4.5–5.4 | Middle of the range |
| Compromised | 3–4.4 | Below target; under-recovered |
| Bad | Under 3 | Very little variation for the heart rate |

Compute your own CV from an SDNN and a mean interval:

<div class="metric-calc" id="cv-calc">
  <p class="mc-head">CV calculator</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="cv-sdnn">SDNN (ms)</label>
      <input class="mc-input" id="cv-sdnn" type="number" inputmode="decimal" placeholder="e.g. 45" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="cv-rr">Mean RR (ms)</label>
      <input class="mc-input" id="cv-rr" type="number" inputmode="decimal" placeholder="e.g. 850" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="cv-grade">Enter values</span>
    <span class="mc-note" id="cv-note">Enter your SDNN and mean interval to compute CV.</span>
  </div>
  <p class="mc-note" style="margin-top:0.4rem">CV = <span id="cv-value">-</span></p>
</div>

{@html cvScript}

<div class="callout callout-note">
  <strong>Trust the trend, not the artifact.</strong> The geometric metrics (MxDMn especially) are sensitive to a single stray beat. One noisy reading can distort the histogram's shape without telling you anything about your physiology. As always, a run of readings measured the same way is what carries the signal.
</div>

## Reading them as a recovery signal

These four rarely headline a daily check. [RMSSD and pNN50](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) are quicker to interpret morning to morning. Where the geometric family earns its place is as a second lens on the *shape* of your regulation, and especially as the machinery behind the stress index. A histogram that grows taller and narrower over weeks (rising AMo50, shrinking MxDMn) tells the same story a climbing stress index does: the system is tightening. One that spreads and lowers is loosening: the direction you want in recovery.

In POTS, long COVID and post-viral dysautonomia, a concentrated, narrow histogram is common because the system is sympathetically biased; see [POTS, long COVID and MCAS](/insights/postviral/pots-long-covid-and-mcas-overlap/) for that overlap, and [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/) for how the shape tends to open back up over a recovery arc.

<details class="prose-details">
  <summary><strong>Worked example: computing CV from a reading</strong></summary>
  <p>Suppose a five-minute reading gives you an SDNN of 42 ms on a mean interval of 900 ms (a resting rate near 67 bpm). CV is 42 ÷ 900 × 100 = 4.7%, landing in the "Moderate" band. Now imagine the same 42 ms of variation on a faster reading with a 720 ms mean interval (about 83 bpm): 42 ÷ 720 × 100 = 5.8%, which grades "Good." The raw variability is identical, but relative to the faster pace it's proportionally larger, and that's the whole reason CV exists. It lets you compare a calm-morning reading and a tired-afternoon one on equal footing, which raw SDNN can't do.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic does this for you.</strong> Every HRV reading you log is broken down into its geometric metrics, scored against these thresholds, and charted over time, so you can watch the shape of your histogram, and the stress index it feeds, move alongside your other numbers. <a href="/">See how it works →</a>
</div>

## The bottom line

Mode, AMo50, MxDMn and CV are the geometric HRV metrics: four rulers held against the histogram your heartbeat intervals form. Mode marks its center (your resting rate), AMo50 its peak height (concentration, which rises under strain), MxDMn its full width (range, where wider is healthier), and CV its variability normalized to heart rate. Three of them are the raw ingredients of the Baevsky stress index, which makes this family the geometry underneath one of the most useful autonomic-strain measures you can track. They're sensitive to artifacts, so read them as trends, but followed over weeks, the changing shape of your histogram is a real and readable picture of recovery.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
