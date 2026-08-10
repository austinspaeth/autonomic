---
title: "What Is SDNN in HRV? Your Total Variability, Explained"
slug: what-is-sdnn-in-hrv
published: true
summary: "SDNN is the broadest single HRV number: the standard deviation of the gaps between your heartbeats. Here's what it measures, why short readings run lower than the figures you see quoted, and how to read it as a recovery signal."
description: "What SDNN means in heart rate variability: how it's calculated, normal ranges for short readings, why it differs from 24-hour SDNN, and how to track it in POTS and long COVID recovery."
keywords: "SDNN, what is SDNN, SDNN normal range, HRV SDNN, standard deviation NN, heart rate variability, RMSSD vs SDNN, SDNN meaning, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1524863479829-916d8e77f114?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Eneko Uruñuela / Unsplash"
tldr: "SDNN is the standard deviation of all the intervals between your heartbeats in a reading, the single broadest measure of heart rate variability. Higher generally means a more adaptable, better-regulated nervous system. It blends every rhythm in the recording, so it's a capacity number rather than a pure vagal one. Short at-home readings run far lower than the 24-hour SDNN values you'll see quoted, so compare yourself only to your own baseline and watch the multi-week trend."
categories:
  - basics
  - hrv
faq:
  - q: "What is a good SDNN number?"
    a: "For a short at-home reading of a few minutes, an SDNN above roughly 50 ms is a strong result and above 60 ms is excellent, while under 30 ms is low. But SDNN is highly individual and depends heavily on reading length, so your own baseline and its direction over weeks matter far more than hitting any specific number."
  - q: "Why is my SDNN so much lower than 141 ms?"
    a: "The often-quoted SDNN of around 141 ms comes from full 24-hour recordings, which capture slow day-night rhythms that a short reading never sees. A 1–5 minute at-home reading typically lands in the tens of milliseconds. They are different measurements and shouldn't be compared directly."
  - q: "What's the difference between SDNN and RMSSD?"
    a: "SDNN captures the overall spread of your beat-to-beat intervals and blends every influence on the rhythm, so it's a broad capacity measure. RMSSD isolates the rapid beat-to-beat changes driven mainly by the vagus nerve, so it's the cleaner day-to-day recovery signal. Most people track RMSSD daily and use SDNN as the wider view."
  - q: "Does a low SDNN mean something is wrong?"
    a: "Not on its own. A single low reading can come from a poor night, stress, alcohol, a short or noisy recording, or simply measuring at a different time of day. A persistently low SDNN trend across weeks is more meaningful, and is best read alongside your resting heart rate and stand test rather than in isolation."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what makes the in-article calculator run in the browser.
  const sdnnScript = `<script>
(function () {
  var input = document.getElementById('sdnn-in');
  if (!input) return;
  var grade = document.getElementById('sdnn-grade');
  var note = document.getElementById('sdnn-note');
  var card = document.getElementById('sdnn-calc');
  function band(n) {
    if (isNaN(n)) return null;
    if (n >= 60) return ['Excellent', '#54d98a', 'Well above target: strong total variability.'];
    if (n >= 50) return ['Good', '#22c55e', 'A healthy short-reading SDNN.'];
    if (n >= 40) return ['Moderate', '#eab308', 'Middle of the range. Watch the weekly trend.'];
    if (n >= 30) return ['Compromised', '#f97316', 'Below target, common on an under-recovered day.'];
    return ['Bad', '#ef4444', 'Low total variability: a rigid rhythm.'];
  }
  function update() {
    var b = band(parseFloat(input.value));
    if (!b) {
      grade.textContent = 'Enter a value';
      grade.style.color = '';
      note.textContent = 'See where your reading lands on the recovery scale.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    grade.textContent = b[0];
    grade.style.color = b[1];
    note.textContent = b[2];
    if (card) card.style.setProperty('--mc-accent', b[1]);
  }
  input.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## The one number that summarizes your variability

If you could keep only a single heart rate variability figure, **SDNN** would be a strong candidate. It stands for the **standard deviation of the NN intervals**, "NN" meaning the normal-to-normal gaps between heartbeats, and it answers one blunt question: *across this whole reading, how much did the spacing between beats vary?*

A healthy heart is not a metronome. The gap between beats is constantly stretching and shrinking, and that restlessness is a good sign: it means your [autonomic nervous system](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/) is flexible enough to adjust the heart moment to moment. SDNN puts a single number on the size of that restlessness. When the spread is wide, SDNN is high. When the rhythm goes rigid and metronomic, SDNN collapses.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 250" role="img" aria-label="Two readings compared: a high-SDNN reading with beat intervals scattered widely around the mean, and a low-SDNN reading with intervals clustered tightly around the mean">
    <text x="20" y="26" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">High SDNN, wide spread</text>
    <line x1="20" y1="70" x2="700" y2="70" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4" />
    <text x="705" y="66" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">mean</text>
    <g fill="#54d98a"><circle cx="70" cy="44" r="4"/><circle cx="130" cy="92" r="4"/><circle cx="190" cy="52" r="4"/><circle cx="250" cy="96" r="4"/><circle cx="310" cy="40" r="4"/><circle cx="370" cy="84" r="4"/><circle cx="430" cy="56" r="4"/><circle cx="490" cy="98" r="4"/><circle cx="550" cy="48" r="4"/><circle cx="610" cy="88" r="4"/><circle cx="670" cy="60" r="4"/></g>
    <text x="20" y="150" fill="#ef4444" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">Low SDNN, rigid rhythm</text>
    <line x1="20" y1="195" x2="700" y2="195" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4" />
    <text x="705" y="191" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">mean</text>
    <g fill="#ef4444"><circle cx="70" cy="190" r="4"/><circle cx="130" cy="200" r="4"/><circle cx="190" cy="189" r="4"/><circle cx="250" cy="201" r="4"/><circle cx="310" cy="191" r="4"/><circle cx="370" cy="199" r="4"/><circle cx="430" cy="188" r="4"/><circle cx="490" cy="202" r="4"/><circle cx="550" cy="190" r="4"/><circle cx="610" cy="200" r="4"/><circle cx="670" cy="192" r="4"/></g>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 240" role="img" aria-label="Two readings compared: a high-SDNN reading with beat intervals scattered widely around the mean, and a low-SDNN reading with intervals clustered tightly around the mean">
    <text x="20" y="20" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13.5">High SDNN, wide spread</text>
    <line x1="20" y1="70" x2="344" y2="70" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4" />
    <text x="344" y="64" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">mean</text>
    <g fill="#54d98a"><circle cx="44" cy="44" r="4"/><circle cx="72" cy="92" r="4"/><circle cx="101" cy="52" r="4"/><circle cx="130" cy="96" r="4"/><circle cx="158" cy="40" r="4"/><circle cx="187" cy="84" r="4"/><circle cx="215" cy="56" r="4"/><circle cx="244" cy="98" r="4"/><circle cx="273" cy="48" r="4"/><circle cx="301" cy="88" r="4"/><circle cx="330" cy="60" r="4"/></g>
    <text x="20" y="150" fill="#ef4444" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13.5">Low SDNN, rigid rhythm</text>
    <line x1="20" y1="196" x2="344" y2="196" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4" />
    <text x="344" y="190" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">mean</text>
    <g fill="#ef4444"><circle cx="44" cy="191" r="4"/><circle cx="72" cy="201" r="4"/><circle cx="101" cy="190" r="4"/><circle cx="130" cy="202" r="4"/><circle cx="158" cy="192" r="4"/><circle cx="187" cy="200" r="4"/><circle cx="215" cy="189" r="4"/><circle cx="244" cy="203" r="4"/><circle cx="273" cy="191" r="4"/><circle cx="301" cy="201" r="4"/><circle cx="330" cy="193" r="4"/></g>
  </svg>
  <figcaption>Each dot is one beat-to-beat interval. SDNN measures how far the dots stray from the average: wide scatter is high SDNN, a tight line is low.</figcaption>
</figure>

If you're new to the beat-to-beat view, the [RR intervals and tachogram explainer](/insights/basics/rr-intervals-and-the-tachogram-explained/) covers the raw data SDNN is built from.

## How SDNN is calculated

The math is exactly what the name says. Take every NN interval in the reading (in milliseconds), find the average, then compute the standard deviation of those values around that average. That's SDNN. A reading whose intervals cluster tightly around, say, 850 ms produces a small standard deviation; one that swings between 750 ms and 1000 ms produces a large one.

Because it's a plain standard deviation, SDNN captures **every** source of variation in the recording at once: the fast flutter of your breathing, the slower waves of blood-pressure regulation, and slower autonomic swings still. That breadth is its strength and its catch. It's a great *summary*, but it doesn't tell you *which* system is driving the number. For that you separate the branches with [RMSSD and the frequency bands](/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/).

<div class="callout callout-note">
  <strong>SDNN scales with reading length.</strong> A longer recording sees slower rhythms, so it almost always produces a bigger SDNN. This is why you can't compare a 1-minute reading to a 5-minute one, or either to a 24-hour figure. Keep your reading length consistent and you keep SDNN comparable.
</div>

## Why your SDNN looks "low"

Search for SDNN and you'll quickly hit the number **141 ms**, often with a note that lower values predict worse outcomes. That figure comes from the landmark <a href="https://www.ahajournals.org/doi/10.1161/01.CIR.93.5.1043" target="_blank" rel="noopener">1996 Task Force standards</a>, and it's a **24-hour** SDNN, a full day and night of beats, including the big swing between daytime activity and deep sleep.

A short at-home reading never sees that day-night swing, so its SDNN lands an order of magnitude lower, usually in the tens of milliseconds. That's not a worse heart; it's a shorter ruler. As the overview by <a href="https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full" target="_blank" rel="noopener">Shaffer and Ginsberg (2017)</a> lays out, short-term and 24-hour HRV norms simply aren't interchangeable. The practical rule: **compare yourself only to your own past readings, taken the same way.**

## How Autonomic grades SDNN

Autonomic grades short-reading SDNN against the recovery framework's thresholds. These are tuned for the few-minute readings the app captures, not 24-hour values:

<div class="metric-scale">
  <span class="ms-seg" style="background:#ef4444">Bad<small>&lt; 30</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>30–39</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>40–49</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>50–59</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>60+</small></span>
</div>

| Grade | SDNN (ms) | What it usually reflects |
| --- | --- | --- |
| Excellent | 60+ | Strong, freely varying rhythm |
| Good | 50–59 | Healthy short-reading variability |
| Moderate | 40–49 | Middle of the range, watch the trend |
| Compromised | 30–39 | Below target; common when under-recovered |
| Bad | Under 30 | Rigid rhythm, low total variability |

Try your own number against the same bands the app uses:

<div class="metric-calc" id="sdnn-calc">
  <p class="mc-head">SDNN grade check</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="sdnn-in">Your SDNN (ms)</label>
      <input class="mc-input" id="sdnn-in" type="number" inputmode="decimal" placeholder="e.g. 45" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="sdnn-grade">Enter a value</span>
    <span class="mc-note" id="sdnn-note">See where your reading lands on the recovery scale.</span>
  </div>
</div>

{@html sdnnScript}

<div class="callout callout-note">
  <strong>A grade is a snapshot, not a verdict.</strong> One reading in the "Compromised" band means very little by itself. The framework exists so a run of readings can show you a direction, and direction is the thing worth trusting.
</div>

## Reading SDNN like a recovery signal

SDNN earns its keep as a **trend line**, not a daily grade. A few habits make it trustworthy:

- **Measure the same way every time**: same posture, same time of day, same reading length. Consistency matters more than the device. The [measuring-well guide](/insights/basics/how-to-measure-hrv-accurately-at-home/) covers this in full.
- **Watch 7–14 days, not one morning.** A single rough reading is noise; a two-week slide is signal.
- **Pair it with other windows.** SDNN alongside a falling [resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/) and a shrinking [stand-test rise](/insights/pots/the-orthostatic-stand-test-at-home/) is a much stronger recovery story than any one of them alone.

In POTS, long COVID and post-viral illness, a suppressed SDNN is common and expected: the system is biased toward "fight or flight," which flattens variability. The encouraging part is that many people watch their SDNN baseline climb over months of pacing and recovery, and often see it move *before* they feel the difference. We cover that arc in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/).

<details class="prose-details">
  <summary><strong>Worked example: two readings, same average heart rate</strong></summary>
  <p>Say two readings both average 70 bpm (a mean interval of about 857 ms). In the first, the intervals range from roughly 780 to 940 ms, the standard deviation works out near 55 ms, a "Good" reading. In the second, they barely move, from 845 to 870 ms, a standard deviation closer to 12 ms, deep in the "Bad" band. Same heart rate, wildly different variability. That gap is exactly what SDNN exists to surface, and why average heart rate alone can hide a struggling autonomic system.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic does this for you.</strong> Every HRV reading you log is scored against these thresholds and charted over time, so you can see your SDNN trend next to RMSSD, heart rate and your stand test: one picture instead of scattered numbers. <a href="/">See how it works →</a>
</div>

## The bottom line

SDNN is the broad-strokes measure of heart rate variability: the standard deviation of the gaps between your heartbeats, and a summary of how freely your rhythm varies. Higher usually means a more adaptable, better-regulated nervous system. Because it blends every rhythm in the reading and grows with reading length, it's a capacity number best read as your own trend rather than against population charts or 24-hour figures. Measure it the same way each time, follow it over weeks, and read it beside RMSSD, heart rate and your stand test, and a single ambiguous number becomes a real window on recovery.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
