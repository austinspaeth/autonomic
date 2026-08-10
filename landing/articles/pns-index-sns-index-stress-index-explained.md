---
title: "PNS Index, SNS Index & Stress Index: The Balance Trio"
slug: pns-index-sns-index-stress-index-explained
published: true
summary: "Three numbers the app shows side by side to describe autonomic balance: the PNS index (your rest-and-recover side), the SNS index (your fight-or-flight side), and the Baevsky stress index. Here's what each one means and how they move together."
description: "PNS index, SNS index and the Baevsky stress index explained: what each measures, why they see-saw, good target ranges, and how to read them together in POTS and long COVID recovery."
keywords: "PNS index, SNS index, stress index, Baevsky stress index, autonomic balance, parasympathetic index, sympathetic index, Kubios, HRV, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1516739063901-94072f684dfc?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Max Nguyen / Unsplash"
tldr: "The PNS index scores your rest-and-recover (parasympathetic) activity, the SNS index scores your fight-or-flight (sympathetic) activity, and the Baevsky stress index measures how rigid and concentrated your rhythm has become under load. When you are recovered they sit in a healthy pattern: PNS positive, SNS negative, stress index low. Under strain the pattern flips: SNS and the stress index climb while PNS drops. They are not perfect mirror images, and after a hard day both indices can be suppressed at once, so read the trio together rather than any one alone."
categories:
  - basics
  - hrv
faq:
  - q: "What is the PNS index and the SNS index?"
    a: "They are two balance scores computed from your heart rate variability. The PNS index summarizes parasympathetic (rest-and-recover) activity from mean RR, RMSSD and SD1, centred so 0 is an average healthy adult and positive is the good direction. The SNS index summarizes sympathetic (fight-or-flight) activity from heart rate, the Baevsky stress index and RMSSD, also centred on 0 but read the other way, where negative means calm and large positive means activation."
  - q: "What is the Baevsky stress index?"
    a: "The Baevsky stress index, also called the strain index, is a single always-positive number that rises steeply as your heartbeat rhythm becomes rigid and concentrated. It is built from the shape of the interval histogram: the most common interval, how tall that peak is, and the total spread. Low and stable is the goal; sharp spikes flag stress, illness or overreaching and often show up a day or two before you feel worse."
  - q: "What is a good stress index number?"
    a: "For a short at-home reading, a stress index around 100 or below is excellent and roughly 101 to 200 is a healthy everyday range. Values climbing past 350 suggest real sympathetic load, and above 600 usually means the rhythm has gone very rigid. Because it is highly individual, your own resting baseline and its direction over weeks matter more than any single figure."
  - q: "Do the PNS and SNS indices always mirror each other?"
    a: "Usually they move in opposite directions: when you are recovered the PNS index is positive and the SNS index is negative, and under load that flips. But they are not perfect mirror images. After a very hard day or during illness both can be suppressed at the same time, and readings taken standing or right after exertion can push both away from their resting values, which is exactly why you read all three numbers together."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what makes the in-article calculator run in the browser.
  const siScript = `<script>
(function () {
  var input = document.getElementById('si-in');
  if (!input) return;
  var grade = document.getElementById('si-grade');
  var note = document.getElementById('si-note');
  var card = document.getElementById('si-calc');
  function band(n) {
    if (isNaN(n)) return null;
    if (n <= 100) return ['Excellent', '#54d98a', 'Low and calm, a well-rested rhythm.'];
    if (n <= 200) return ['Good', '#22c55e', 'A healthy everyday resting range.'];
    if (n <= 350) return ['Moderate', '#eab308', 'Some load showing. Watch the trend.'];
    if (n <= 600) return ['Compromised', '#f97316', 'Elevated strain, the rhythm is tightening.'];
    return ['Crash', '#b91c1c', 'Very rigid rhythm, heavy sympathetic load.'];
  }
  function update() {
    var b = band(parseFloat(input.value));
    if (!b) {
      grade.textContent = 'Enter a value';
      grade.style.color = '';
      note.textContent = 'See where your stress index lands on the scale.';
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

## Three numbers, one balancing act

Open a reading in Autonomic and you will see three balance figures sitting together: the **PNS index**, the **SNS index**, and the **stress index**. They are the app's compact readout of where your [autonomic nervous system](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/) is sitting right now: how much of your rhythm is being driven by the rest-and-recover brake, how much by the fight-or-flight accelerator, and how much overall strain the system is under.

They are computed the way the widely used <a href="https://www.kubios.com/hrv-analysis-methods/" target="_blank" rel="noopener">Kubios HRV analysis methods</a> define them, so the numbers you see line up with the clinical literature. The point of showing all three is that no single HRV metric captures balance on its own. Read together, they tell a clearer story than any one number can.

## The PNS index: your rest-and-recover side

The **PNS index** (parasympathetic nervous system index) summarizes how active your **rest-and-digest**, vagal side is. It is a composite of three things that all rise when the parasympathetic brake is engaged: your **mean RR interval** (the average gap between beats: longer means a slower, calmer heart), your **RMSSD**, and **SD1** from the Poincaré plot. Those last two are the classic [vagal-tone metrics](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/).

The clever part is the scaling. Each input is expressed as a **z-score against a healthy reference population**, so the PNS index reads like a standardized score: **0 is an average healthy adult**, positive means *more* rest-and-recover activity than average, the good direction, and deeply negative means poor recovery, fatigue or illness.

<div class="metric-scale">
  <span class="ms-seg" style="background:#ef4444">Bad<small>&lt; −1.5</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>−1.5 to −0.5</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>−0.5 to 0.29</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>0.3 to 1.49</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>1.5+</small></span>
</div>

| Grade | PNS index | What it usually reflects |
| --- | --- | --- |
| Excellent | 1.5+ | Strong vagal recovery, well above average |
| Good | 0.3 to 1.49 | Healthy rest-and-recover activity |
| Moderate | −0.5 to 0.29 | Around the population average |
| Compromised | −1.5 to −0.49 | Below-average recovery; common when tired |
| Bad | Below −1.5 | Poor vagal activity: fatigue, illness or overreaching |

## The SNS index: your fight-or-flight side

The **SNS index** (sympathetic nervous system index) scores the *other* branch, the **fight-or-flight** accelerator. It is a composite of your **heart rate**, the **Baevsky stress index** (more on that below), and **RMSSD** read in reverse. Like the PNS index it is centred so **0 is average**, but the direction is flipped: **negative means below-average activation, calm, which is good**, and a large positive number means stress, exertion or illness.

That reversal trips people up at first. A *low* SNS index is the desirable one. If your SNS index sits comfortably below zero at rest, your accelerator is idling, exactly where it should be when you are recovered.

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>&lt; −0.5</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>−0.5 to 0.59</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>0.6 to 1.59</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>1.6 to 3.0</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>&gt; 3.0</small></span>
</div>

| Grade | SNS index | What it usually reflects |
| --- | --- | --- |
| Excellent | Below −0.5 | Accelerator idling: calm and recovered |
| Good | −0.5 to 0.59 | Around or just above the resting average |
| Moderate | 0.6 to 1.59 | Noticeable activation; upright or mildly stressed |
| Compromised | 1.6 to 3.0 | High sympathetic drive: stress or exertion |
| Crash | Above 3.0 | Very high activation: illness or heavy strain |

<div class="callout callout-note">
  <strong>Posture moves the SNS index on purpose.</strong> Standing up is <em>supposed</em> to raise sympathetic drive, so a reading taken upright will show a higher SNS index than one taken lying down. That is normal physiology, not a bad result. Just compare like-for-like readings taken in the same position.
</div>

## The stress index: strain, not balance

The **stress index** is different in kind from the other two. It is the **Baevsky strain index**, and it is **not centred on zero**: it is **always a positive number** that climbs steeply as the rhythm becomes rigid and concentrated under sympathetic load. Low and stable is the goal.

Where the PNS and SNS indices come from beat-to-beat variation, the stress index comes from the **shape of the interval histogram**: the most common interval length (**Mode**), how tall and narrow that peak is (**AMo50**), and the total spread (**MxDMn**). When your rhythm is healthy and varied, the histogram is broad and the stress index is small. When the rhythm collapses toward one dominant interval, the peak spikes and the index shoots up. The full mechanics live in the [histogram metrics explainer](/insights/basics/hrv-histogram-mode-amo50-mxdmn-cv/).

Because it responds sharply, the stress index is an early-warning number. A spike often **leads your symptoms by a day or two**, flagging stress, illness or overreaching before you consciously feel it.

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>≤ 100</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>101–200</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>201–350</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>351–600</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>&gt; 600</small></span>
</div>

| Grade | Stress index | What it usually reflects |
| --- | --- | --- |
| Excellent | 100 or less | Calm, freely varying rhythm |
| Good | 101–200 | Healthy everyday resting range |
| Moderate | 201–350 | Some load: watch the trend |
| Compromised | 351–600 | Rhythm tightening under strain |
| Crash | Above 600 | Very rigid rhythm; heavy sympathetic load |

Try a stress-index number against the same bands the app uses:

<div class="metric-calc" id="si-calc">
  <p class="mc-head">Stress index grade check</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="si-in">Your stress index</label>
      <input class="mc-input" id="si-in" type="number" inputmode="decimal" placeholder="e.g. 150" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="si-grade">Enter a value</span>
    <span class="mc-note" id="si-note">See where your stress index lands on the scale.</span>
  </div>
</div>

{@html siScript}

## The see-saw: how the trio moves together

The cleanest way to picture the trio is a **balance beam**. On the up-side is the parasympathetic PNS index, on the down-side the sympathetic SNS index, and the stress index is the load pressing down on the whole thing.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 320" role="img" aria-label="A see-saw balance diagram: the parasympathetic PNS side is raised and the sympathetic SNS side is lowered in a recovered state, with a stress-index load gauge reading low">
    <text x="360" y="28" text-anchor="middle" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="17">Recovered pattern</text>
    <!-- beam, tilted: PNS side (left) up, SNS side (right) down -->
    <line x1="120" y1="120" x2="600" y2="200" stroke="var(--line-2)" stroke-width="6" stroke-linecap="round" />
    <!-- fulcrum -->
    <polygon points="360,160 330,240 390,240" fill="var(--line-2)" />
    <!-- PNS weight (up side) -->
    <circle cx="120" cy="120" r="30" fill="#58c4f2" />
    <text x="120" y="116" text-anchor="middle" fill="#0b1220" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="14">PNS</text>
    <text x="120" y="133" text-anchor="middle" fill="#0b1220" font-family="Space Mono, monospace" font-size="10">+ up</text>
    <text x="120" y="72" text-anchor="middle" fill="#58c4f2" font-family="-apple-system, sans-serif" font-size="12">rest &amp; recover</text>
    <!-- SNS weight (down side) -->
    <circle cx="600" cy="200" r="30" fill="#f97316" />
    <text x="600" y="196" text-anchor="middle" fill="#0b1220" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="14">SNS</text>
    <text x="600" y="213" text-anchor="middle" fill="#0b1220" font-family="Space Mono, monospace" font-size="10">− down</text>
    <text x="600" y="258" text-anchor="middle" fill="#f97316" font-family="-apple-system, sans-serif" font-size="12">fight or flight</text>
    <!-- stress load gauge -->
    <rect x="270" y="278" width="180" height="26" rx="13" fill="none" stroke="var(--line-2)" stroke-width="1.5" />
    <rect x="273" y="281" width="54" height="20" rx="10" fill="#54d98a" />
    <text x="360" y="296" text-anchor="middle" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">stress index: low</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 300" role="img" aria-label="A see-saw balance diagram: the parasympathetic PNS side is raised and the sympathetic SNS side is lowered in a recovered state, with a stress-index load gauge reading low">
    <text x="180" y="24" text-anchor="middle" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="16">Recovered pattern</text>
    <text x="62" y="72" text-anchor="middle" fill="#58c4f2" font-family="-apple-system, sans-serif" font-size="11.5">rest &amp; recover</text>
    <line x1="62" y1="120" x2="298" y2="196" stroke="var(--line-2)" stroke-width="6" stroke-linecap="round" />
    <polygon points="180,158 152,238 208,238" fill="var(--line-2)" />
    <circle cx="62" cy="120" r="30" fill="#58c4f2" />
    <text x="62" y="116" text-anchor="middle" fill="#0b1220" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="14">PNS</text>
    <text x="62" y="133" text-anchor="middle" fill="#0b1220" font-family="Space Mono, monospace" font-size="10">+ up</text>
    <circle cx="298" cy="196" r="30" fill="#f97316" />
    <text x="298" y="192" text-anchor="middle" fill="#0b1220" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="14">SNS</text>
    <text x="298" y="209" text-anchor="middle" fill="#0b1220" font-family="Space Mono, monospace" font-size="10">− down</text>
    <text x="298" y="246" text-anchor="middle" fill="#f97316" font-family="-apple-system, sans-serif" font-size="11.5">fight or flight</text>
    <rect x="90" y="262" width="180" height="26" rx="13" fill="none" stroke="var(--line-2)" stroke-width="1.5" />
    <rect x="93" y="265" width="54" height="20" rx="10" fill="#54d98a" />
    <text x="210" y="280" text-anchor="middle" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">stress index: low</text>
  </svg>
  <figcaption>Recovered: the parasympathetic side is up (PNS positive), the sympathetic side is down (SNS negative), and the stress-index load runs low. Under strain the beam tips the other way and the load gauge fills.</figcaption>
</figure>

When you are **rested and recovered**, the beam sits in its healthy pose: **PNS positive, SNS negative, stress index low**. When you take on **load** (a poor night, a hard workout, a flare, an infection) the beam tips: the **SNS index and stress index rise together while the PNS index falls**. That coordinated flip is the single most useful pattern to learn.

But (and this matters) **they are not perfect mirror images.** Two caveats keep you honest:

- **Both branches can be suppressed at once.** After a genuinely hard day or during illness, the whole system can go quiet: PNS low *and* SNS not as high as you would expect, with the stress index still elevated. Do not assume a low PNS always means a high SNS.
- **They answer slightly different questions.** PNS and SNS describe *balance*; the stress index describes *strain*. You can be balanced but strained, or unbalanced with modest strain. Reading all three is what resolves the ambiguity.

<details class="prose-details">
  <summary><strong>Worked example: a good day versus an overreaching day</strong></summary>
  <p>On a well-recovered morning you might see PNS +1.1 (Good), SNS −0.6 (Excellent) and a stress index of 90 (Excellent): the brake is on, the accelerator is idling, strain is minimal. Two days after a hard push you might see PNS −0.8 (Compromised), SNS +2.2 (Compromised) and a stress index of 420 (Compromised): the beam has tipped and the load gauge has filled. Notice they all moved in agreement: that consensus is what makes the reading trustworthy. A day where only one number looks off, while the other two look fine, is usually noise rather than signal.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic charts the trio for you.</strong> Every reading is scored against these bands and plotted over time, so you can watch the see-saw tip and settle across weeks instead of decoding three raw numbers by hand. <a href="/">See how it works →</a>
</div>

## Reading the trio in recovery

In POTS, long COVID and post-viral dysautonomia the resting pattern is often skewed toward the sympathetic side: a **suppressed PNS index, an elevated SNS index, and a higher stress index** than a healthy baseline. That is the "stuck on" bias these conditions are known for, and it is exactly what the trio is good at showing.

The encouraging part is that the pattern *shifts as you recover*. Over months of pacing, many people watch their resting PNS index drift upward, their SNS index settle lower, and their stress-index spikes become smaller and rarer, often before they feel the change. Read these against your [resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/) and the [complete HRV picture](/insights/hrv/hrv-complete-guide/), and follow the multi-week trend rather than any single morning. We map that arc in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/).

## The bottom line

The PNS index, SNS index and stress index are three views of one balancing act: the PNS index scores your rest-and-recover side (0 is average, positive is good), the SNS index scores your fight-or-flight side (0 is average, negative is good), and the Baevsky stress index measures how rigid your rhythm has become under load (always positive, low is good). Recovered, they sit in a stable pattern; under strain, the pattern flips together. They are not perfect mirrors, and both can sag at once after a hard day, so read all three, follow the trend, and let the consensus between them, not any single number, tell you where your nervous system is heading.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
