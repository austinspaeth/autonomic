---
title: "HRV Frequency Domain: VLF, LF, HF & Total Power Explained"
slug: hrv-frequency-domain-vlf-lf-hf-power
published: true
summary: "Your heartbeat rhythm can be split into frequency bands, each reflecting a different piece of autonomic regulation. Here's what HF, LF, VLF and total power actually mean, why the mix matters more than the total, and how to read the LF/HF ratio without over-trusting it."
description: "The HRV frequency domain explained: HF, LF and VLF power bands, total power, and the LF/HF ratio: what each measures, good target ranges, and how to read them in POTS and long COVID recovery."
keywords: "HRV frequency domain, LF power, HF power, VLF, total power, LF/HF ratio, spectral analysis HRV, power spectrum, sympathovagal balance, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1747633126452-dee49902fc6e?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Zach Kessinger / Unsplash"
tldr: "Spectral analysis splits your heartbeat rhythm into frequency bands. HF (0.15–0.4 Hz) is the fast, breath-linked band and reads as almost pure vagal tone. LF (0.04–0.15 Hz) is the slower baroreflex band, a mix of both branches that leans sympathetic under stress. VLF (below 0.04 Hz) reflects slow regulatory processes and is unreliable in short readings. Total power is the sum, higher is generally better, but the mix across bands matters more than the total. The LF/HF ratio is a rough balance marker best judged on unstructured readings and on its trend."
categories:
  - basics
  - hrv
faq:
  - q: "What are LF and HF power in HRV?"
    a: "They are two frequency bands your heartbeat rhythm is split into. HF (high frequency, 0.15 to 0.4 Hz) is the fast, breathing-linked band and reflects almost pure parasympathetic (vagal) activity, so strong HF signals calm and recovery. LF (low frequency, 0.04 to 0.15 Hz) is a slower band tied to blood-pressure regulation via the baroreflex; it is a mix of both autonomic branches and leans sympathetic when you are stressed or standing."
  - q: "What is a good LF/HF ratio?"
    a: "On a relaxed, unstructured short reading, an LF/HF ratio under about 1.5 is excellent and roughly 1.5 to 3 is a healthy everyday range. Higher values suggest a shift toward sympathetic dominance, but the ratio is noisy and easily distorted by breathing and posture, so it is best read on trends rather than as a one-off verdict."
  - q: "Is high LF power bad?"
    a: "Not by itself. LF is a mix of sympathetic and parasympathetic influence, so high LF can mean stress, or it can simply mean you were breathing slowly. Slow paced breathing deliberately pumps LF up, so a large LF reading during a breathing exercise is expected and healthy, not a warning sign."
  - q: "Why is VLF unreliable in short readings?"
    a: "VLF sits below 0.04 Hz, meaning its slowest waves take longer than 25 seconds to complete a cycle. A one-to-five-minute reading only captures a handful of those cycles, which is not enough to estimate the band reliably. The 1996 Task Force standards recommend at least five minutes, and really longer, before VLF and even LF should be trusted."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what makes the in-article calculator run in the browser.
  const lfhfScript = `<script>
(function () {
  var lf = document.getElementById('lfhf-lf');
  var hf = document.getElementById('lfhf-hf');
  if (!lf || !hf) return;
  var ratio = document.getElementById('lfhf-ratio');
  var grade = document.getElementById('lfhf-grade');
  var note = document.getElementById('lfhf-note');
  var card = document.getElementById('lfhf-calc');
  function band(n) {
    if (isNaN(n)) return null;
    if (n < 1.5) return ['Excellent', '#54d98a', 'Balanced, vagally weighted rhythm.'];
    if (n <= 3) return ['Good', '#22c55e', 'A healthy everyday balance.'];
    if (n <= 5) return ['Moderate', '#eab308', 'Leaning sympathetic. Watch the trend.'];
    if (n <= 10) return ['Compromised', '#f97316', 'Sympathetic dominance in this reading.'];
    return ['Crash', '#b91c1c', 'Heavily sympathetic, or a low-HF artifact.'];
  }
  function update() {
    var lfv = parseFloat(lf.value);
    var hfv = parseFloat(hf.value);
    if (isNaN(lfv) || isNaN(hfv) || hfv <= 0) {
      ratio.textContent = '-';
      grade.textContent = 'Enter both values';
      grade.style.color = '';
      note.textContent = 'Enter LF and HF power to get your ratio.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    var r = lfv / hfv;
    var b = band(r);
    ratio.textContent = r.toFixed(2);
    grade.textContent = b[0];
    grade.style.color = b[1];
    note.textContent = b[2];
    if (card) card.style.setProperty('--mc-accent', b[1]);
  }
  lf.addEventListener('input', update);
  hf.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## Two ways to look at the same heartbeat

There are two ways to measure heart rate variability from the same recording. The **time domain** (metrics like [SDNN](/insights/basics/what-is-sdnn-in-hrv/) and [RMSSD](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/)) asks *how much* the intervals between beats vary. The **frequency domain** asks a subtler question: *at what speeds* do they vary?

It turns out your heartbeat rhythm is not one wave but several layered on top of each other: a fast ripple from your breathing, a slower swell from blood-pressure regulation, and slower tides still. Spectral analysis (an FFT applied to your [tachogram](/insights/basics/rr-intervals-and-the-tachogram-explained/)) pulls those layers apart and measures the **power** in each frequency band. Each band reflects a different piece of autonomic regulation, which is what makes the frequency view so informative.

## The three bands

The <a href="https://www.ahajournals.org/doi/10.1161/01.CIR.93.5.1043" target="_blank" rel="noopener">1996 Task Force standards</a> defined the band boundaries that are still used today, and the review by <a href="https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full" target="_blank" rel="noopener">Shaffer and Ginsberg (2017)</a> is a clear modern summary of what each one means.

<figure class="prose-figure">
  <svg viewBox="0 0 720 300" role="img" aria-label="An HRV power spectrum from 0 to 0.4 Hz, with the VLF band shaded purple on the left, the LF band shaded orange with a peak near 0.1 Hz, and the HF band shaded blue with a peak near 0.25 Hz">
    <!-- band shading -->
    <rect x="60" y="60" width="60" height="180" fill="#a78bfa" fill-opacity="0.12" />
    <rect x="120" y="60" width="165" height="180" fill="#f97316" fill-opacity="0.12" />
    <rect x="285" y="60" width="375" height="180" fill="#58c4f2" fill-opacity="0.12" />
    <!-- power curve -->
    <path d="M60,240 L90,205 L120,218 L160,150 L210,95 L260,158 L285,186 L340,150 L435,120 L520,176 L600,214 L660,238 L660,240 L60,240 Z" fill="var(--accent, #e03127)" fill-opacity="0.18" stroke="var(--accent, #e03127)" stroke-width="2" stroke-linejoin="round" />
    <!-- axis -->
    <line x1="60" y1="240" x2="660" y2="240" stroke="var(--line-2)" stroke-width="1.5" />
    <!-- band labels -->
    <text x="90" y="52" text-anchor="middle" fill="#a78bfa" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">VLF</text>
    <text x="202" y="52" text-anchor="middle" fill="#f97316" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">LF</text>
    <text x="472" y="52" text-anchor="middle" fill="#58c4f2" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">HF</text>
    <!-- x ticks -->
    <text x="60" y="262" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0</text>
    <text x="120" y="262" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0.04</text>
    <text x="285" y="262" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0.15</text>
    <text x="660" y="262" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0.4</text>
    <text x="360" y="286" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">frequency (Hz)</text>
    <text x="30" y="150" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12" transform="rotate(-90 30 150)">power</text>
  </svg>
  <figcaption>A short-reading power spectrum. The area under each shaded region is that band's power; a healthy rhythm spreads power across the bands rather than piling it into one.</figcaption>
</figure>

- **HF: high frequency (0.15–0.4 Hz).** The fast, **breath-linked** band. Every inhale speeds the heart slightly and every exhale slows it, and that respiratory rhythm shows up here. HF is **almost pure parasympathetic (vagal) tone**: strong HF means calm and recovery. It is the frequency-domain cousin of RMSSD.
- **LF: low frequency (0.04–0.15 Hz).** The slower **baroreflex** band, tied to the loop that regulates blood pressure. Crucially, LF is a **mix of both branches**, not a clean sympathetic marker, though it leans sympathetic when you are stressed or standing.
- **VLF: very low frequency (below 0.04 Hz).** Slow regulatory waves from thermoregulation, hormones and vascular tone. It carries real physiological meaning over long recordings but is **unreliable in short readings** (see below).

<div class="callout callout-note">
  <strong>Slow breathing pumps LF up on purpose.</strong> If you do a paced-breathing or coherence exercise at around six breaths a minute, your breathing rhythm drops to ~0.1 Hz, right in the middle of the LF band. A big LF reading during that exercise is <em>expected and healthy</em>, not a sign of stress. We cover why in <a href="/insights/basics/lf-peak-hf-peak-coherence-resonance/">LF peak, HF peak, coherence &amp; resonance</a>.
</div>

## Total power: the sum, but not the whole story

**Total power** is exactly what it sounds like: the sum of the energy across all the bands, essentially the frequency-domain version of overall variability. Higher total power generally means a rhythm that is varying freely, which is good.

<div class="metric-scale">
  <span class="ms-seg" style="background:#ef4444">Bad<small>&lt; 800</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>800–1499</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>1500–2199</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>2200–3499</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>3500+</small></span>
</div>

| Grade | Total power (ms²) | What it usually reflects |
| --- | --- | --- |
| Excellent | 3500+ | A freely varying, adaptable rhythm |
| Good | 2200–3499 | Healthy overall variability |
| Moderate | 1500–2199 | Middle of the range, watch the trend |
| Compromised | 800–1499 | Below target; common when under-recovered |
| Bad | Under 800 | Low total variability, a rigid rhythm |

But here is the key idea: **the mix matters more than the total.** A healthy reading *spreads* its power across the bands. Two readings can share the same total power while telling opposite stories: one with a balanced spread and healthy HF, the other piling nearly all its energy into LF with almost no HF. The second is a rhythm under sympathetic load wearing a respectable-looking total. Always read total power alongside the balance between bands, never on its own.

## VLF: real, but not from a short reading

VLF is where a lot of confusion starts, so it is worth being blunt. The slowest VLF waves sit below 0.04 Hz, meaning a single cycle takes **longer than 25 seconds**. A one-to-five-minute reading only contains a handful of those cycles, far too few for a stable estimate. The Task Force standards recommend **at least five minutes**, and really longer, before VLF (and even LF) can be trusted.

For that reason, in a short at-home reading, VLF is best treated as a **lower-is-better nuisance band**: a large VLF often just means baseline drift, movement or a slow trend contaminating the reading rather than genuine slow-wave regulation.

| Grade | VLF (ms², short reading) | What it usually reflects |
| --- | --- | --- |
| Excellent | Under 200 | Clean short reading, little drift |
| Good | 200–450 | Normal for a few-minute recording |
| Moderate | 451–700 | Some slow drift creeping in |
| Compromised | 701–1000 | Notable baseline wander |
| Bad | Over 1000 | Likely drift or movement artifact |

## The LF/HF ratio: useful, but handle with care

Divide LF power by HF power and you get the **LF/HF ratio**, historically read as a rough **sympatho-vagal balance** marker: higher meaning more sympathetic-leaning, lower meaning more vagally weighted. It is genuinely useful, and genuinely **controversial**, because LF is not a clean sympathetic signal and the ratio is easily distorted by breathing and posture.

Two rules keep it honest: judge it mainly on **unstructured** readings (not during paced breathing, which inflates LF), and read it on the **trend**, not a single value.

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>&lt; 1.5</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>1.5–3</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>3.01–5</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>5.01–10</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>&gt; 10</small></span>
</div>

| Grade | LF/HF ratio | What it usually reflects |
| --- | --- | --- |
| Excellent | Under 1.5 | Balanced, vagally weighted rhythm |
| Good | 1.5–3 | Healthy everyday balance |
| Moderate | 3.01–5 | Leaning sympathetic, watch the trend |
| Compromised | 5.01–10 | Sympathetic dominance in this reading |
| Crash | Over 10 | Heavily sympathetic, or a low-HF artifact |

Enter your LF and HF power to see the ratio and where it lands:

<div class="metric-calc" id="lfhf-calc">
  <p class="mc-head">LF/HF ratio calculator</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="lfhf-lf">LF power (ms²)</label>
      <input class="mc-input" id="lfhf-lf" type="number" inputmode="decimal" placeholder="e.g. 600" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="lfhf-hf">HF power (ms²)</label>
      <input class="mc-input" id="lfhf-hf" type="number" inputmode="decimal" placeholder="e.g. 400" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="lfhf-ratio">-</span>
    <span class="mc-grade" id="lfhf-grade">Enter both values</span>
    <span class="mc-note" id="lfhf-note">Enter LF and HF power to get your ratio.</span>
  </div>
</div>

{@html lfhfScript}

<details class="prose-details">
  <summary><strong>Worked example: same total power, opposite meaning</strong></summary>
  <p>Reading A has LF 900 ms² and HF 900 ms², total power roughly 1800, LF/HF of 1.0, a nicely balanced rhythm. Reading B has LF 1600 ms² and HF 200 ms², a similar total near 1800, but an LF/HF of 8.0, deep in the Compromised band. Same overall variability, very different autonomic state: reading B has almost no vagal (HF) activity left. This is the whole reason the mix matters more than the total, and why the app shows the bands, not just the sum.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic does the spectral math for you.</strong> Each reading is decomposed into VLF, LF, HF and total power, graded against these bands, and charted over time, so you can watch the mix, not just the number, and see it shift as you recover. <a href="/">See how it works →</a>
</div>

## Reading the frequency view in recovery

In POTS, long COVID and post-viral dysautonomia the frequency picture often shows the same "stuck on" bias as the rest of your data: **suppressed HF**, a **higher LF/HF ratio**, and total power that sits below where you would like it. That is the sympathetic tilt these conditions are known for, seen through a spectral lens.

As with every HRV metric, the individual number on any given morning matters far less than the **direction over weeks**. Many people watch their HF power climb and their LF/HF ratio settle as pacing pays off, often before the symptoms ease. Pair the frequency view with the [PNS, SNS and stress-index trio](/insights/basics/pns-index-sns-index-stress-index-explained/) and the [complete HRV guide](/insights/hrv/hrv-complete-guide/) for the fullest picture, and remember that reading length and consistency (covered in [how to measure HRV accurately at home](/insights/basics/how-to-measure-hrv-accurately-at-home/)) make or break the frequency numbers especially.

## The bottom line

The frequency domain splits your heartbeat rhythm into bands, each reflecting a different regulator: HF is the fast, breath-linked, almost purely vagal band; LF is the slower baroreflex band that mixes both branches and leans sympathetic under load; VLF is a slow-wave band that short readings cannot estimate reliably. Total power sums them, and higher is generally better, but the *mix* across bands tells you more than the total ever will. The LF/HF ratio is a helpful, imperfect balance marker best judged on unstructured readings and on its trend. Read the bands together, follow them over weeks, and the spectrum becomes a genuine window on how your nervous system is regulating.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
