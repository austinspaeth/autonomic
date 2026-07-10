---
title: "LF Peak, HF Peak, Coherence & Resonance Breathing"
slug: lf-peak-hf-peak-coherence-resonance
published: true
summary: "Frequency-domain HRV isn't only about how much power sits in each band: it's about where the power concentrates. Here's what the LF and HF peaks mean, why paced breathing pulls them into place, and how resonance-frequency breathing at about six breaths a minute maximizes your HRV."
description: "LF peak and HF peak in HRV explained: where each peak should sit, what coherence means, and how resonance-frequency breathing near 0.1 Hz maximizes variability in POTS and long COVID."
keywords: "LF peak, HF peak, HRV coherence, resonance frequency breathing, 0.1 Hz, paced breathing, resonance frequency, HRV biofeedback, breathing rate HRV, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1551845792-14bd50072632?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Priscilla Du Preez / Unsplash"
tldr: "The LF and HF peaks tell you where your heart-rate rhythm concentrates its energy, not how much there is. The HF peak sits at your breathing rate; the LF peak sits near 0.1 Hz, the baroreflex band. Breathing at your resonance frequency (roughly six breaths a minute, near 0.1 Hz) drives a big, clean, single peak that lines the two systems up. A tall, sharp peak there is high coherence, and it is the most reliable way to raise HRV on demand."
categories:
  - basics
  - hrv
faq:
  - q: "What breathing rate maximizes HRV?"
    a: "For most adults it's around six breaths per minute, which is close to 0.1 Hz. At that pace the rhythm of your breathing lines up with the baroreflex rhythm that controls blood pressure, and the two reinforce each other so beat-to-beat variability swings as wide as it can. The exact best pace is personal and usually lands between about 4.5 and 7 breaths per minute."
  - q: "What is resonance frequency breathing?"
    a: "Resonance frequency breathing means slowing your breath to the single pace where your heart-rate oscillations grow largest, typically near 0.1 Hz or about six breaths a minute. At that rate the breathing rhythm and the blood-pressure control loop resonate together, much like pushing a swing at just the right moment, producing the biggest possible variability from the smallest effort."
  - q: "What is coherence in HRV?"
    a: "Coherence describes how orderly your heart-rate rhythm is. A coherent reading concentrates its power into one tall, narrow peak rather than scattering it across many frequencies, which happens naturally when you breathe slowly and evenly at your resonance pace. High coherence is a sign the autonomic system is settling into a smooth, rhythmic state."
  - q: "Where should my HF and LF peak be?"
    a: "In a relaxed unstructured reading the HF peak sits at your spontaneous breathing rate, usually 0.15 to 0.31 Hz, and the LF peak sits near 0.1 Hz. During a paced breathing session the goal shifts: you want the peak to land squarely at the pace you are breathing, which pulls it down toward 0.1 Hz and makes it tall and sharp."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this raw script is what makes the in-article calculator run in the browser.
  const resScript = `<script>
(function () {
  var input = document.getElementById('res-in');
  if (!input) return;
  var freq = document.getElementById('res-freq');
  var grade = document.getElementById('res-grade');
  var note = document.getElementById('res-note');
  var card = document.getElementById('res-calc');
  function band(bpm) {
    if (isNaN(bpm) || bpm <= 0) return null;
    var hz = bpm / 60;
    var out = { hz: hz };
    if (bpm >= 5.5 && bpm <= 6.5) {
      out.label = 'At resonance';
      out.color = '#54d98a';
      out.msg = 'Right in the sweet spot near 0.1 Hz. This pace tends to maximize HRV.';
    } else if (bpm >= 5 && bpm <= 7) {
      out.label = 'Near resonance';
      out.color = '#22c55e';
      out.msg = 'Close to the resonance band. Nudge toward six breaths a minute to fine-tune.';
    } else if (bpm > 7 && bpm <= 9) {
      out.label = 'A little fast';
      out.color = '#eab308';
      out.msg = 'Slightly quicker than resonance. Try lengthening the exhale to slow down.';
    } else if (bpm >= 4 && bpm < 5) {
      out.label = 'A little slow';
      out.color = '#eab308';
      out.msg = 'Just below the usual sweet spot. Fine if it feels comfortable and unforced.';
    } else if (bpm > 9) {
      out.label = 'Above resonance';
      out.color = '#f97316';
      out.msg = 'This is everyday breathing, not a resonance pace. Slow down to concentrate the peak.';
    } else {
      out.label = 'Very slow';
      out.color = '#f97316';
      out.msg = 'Slower than most people can sustain without strain. Do not force the breath.';
    }
    return out;
  }
  function update() {
    var b = band(parseFloat(input.value));
    if (!b) {
      freq.textContent = '- Hz';
      grade.textContent = 'Enter a pace';
      grade.style.color = '';
      note.textContent = 'Type how many breaths per minute you are aiming for.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    freq.textContent = b.hz.toFixed(3) + ' Hz';
    grade.textContent = b.label;
    grade.style.color = b.color;
    note.textContent = b.msg;
    if (card) card.style.setProperty('--mc-accent', b.color);
  }
  input.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## Power tells you how much: the peak tells you where

If you've read about the [frequency-domain bands](/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/), you know HRV can be split into slow, medium and fast rhythms, and that each band holds a certain amount of *power*. Power is a magnitude: how much of your heart-rate variability lives in that band. But every band also has a **peak**: the single frequency inside it where the energy piles up highest. Power is *how much*; the peak is *where*. They are two different questions about the same spectrum, and the peak turns out to be the one you can steer with your breath.

Think of it like a radio dial. The total loudness is the power. The exact station the needle lands on is the peak. Two readings can be equally "loud" while their needles sit in completely different places, and where the needle sits tells you which control system is doing the driving.

<figure class="prose-figure">
  <svg viewBox="0 0 720 260" role="img" aria-label="A frequency spectrum showing a broad LF peak near 0.1 Hz and a taller HF peak at the breathing rate, with the resonance zone marked near 0.1 Hz">
    <line x1="60" y1="210" x2="700" y2="210" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="60" y1="210" x2="60" y2="30" stroke="var(--line-2)" stroke-width="1.5" />
    <rect x="150" y="30" width="70" height="180" fill="#a78bfa" opacity="0.14" />
    <text x="185" y="24" text-anchor="middle" fill="#a78bfa" font-family="Space Mono, monospace" font-size="10">resonance</text>
    <path d="M60 210 Q120 150 185 90 Q230 150 300 200" fill="none" stroke="#58c4f2" stroke-width="2.5" />
    <path d="M300 200 Q400 205 470 120 Q510 60 540 100 Q580 170 700 205" fill="none" stroke="#22c55e" stroke-width="2.5" />
    <text x="185" y="118" text-anchor="middle" fill="#58c4f2" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">LF peak</text>
    <text x="185" y="134" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">~0.1 Hz</text>
    <text x="505" y="52" text-anchor="middle" fill="#22c55e" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">HF peak</text>
    <text x="505" y="68" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">= breathing rate</text>
    <text x="60" y="230" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0</text>
    <text x="185" y="230" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0.10</text>
    <text x="505" y="230" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">0.25</text>
    <text x="380" y="252" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">frequency (Hz)</text>
  </svg>
  <figcaption>The LF peak sits near 0.1 Hz in the baroreflex band; the HF peak sits wherever you happen to be breathing. Paced breathing merges them toward the resonance zone.</figcaption>
</figure>

## The HF peak sits at your breath

Every time you breathe in, your heart speeds up a little; every time you breathe out, it slows. This is **respiratory sinus arrhythmia**, and it's the single largest, cleanest source of fast HRV. Because it is driven directly by breathing, the **HF peak lands exactly at your breathing rate.** Breathe fifteen times a minute and the peak sits at 0.25 Hz (15 ÷ 60). Breathe six times a minute and it drops to 0.1 Hz.

That makes the HF peak a kind of honesty check on the reading. If you meant to breathe slowly but the peak shows up high and fast, the reading knows you were breathing quickly. The [RMSSD and pNN50 vagal-tone metrics](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) move with this same respiratory rhythm, which is why slow, even breathing lifts them too.

## The LF peak and the baroreflex

The **LF peak** sits lower, right around **0.1 Hz**, and it comes from a different machine entirely: the **baroreflex**, the feedback loop that keeps your blood pressure steady. When pressure drifts up, the loop slows the heart; when it drifts down, it speeds up. That correction loop takes about ten seconds to go around, which is why it oscillates near 0.1 Hz: one cycle every ten seconds.

Here's the elegant part. Your breathing rhythm and your baroreflex rhythm are two separate oscillators, but they can be brought into step. If you slow your breathing down until it *also* cycles near 0.1 Hz, the two rhythms stop competing and start reinforcing each other. That alignment is the whole idea behind resonance-frequency breathing.

## Resonance: pushing the swing at the right moment

Every system that oscillates has a **resonance frequency**: the one pace at which a small, well-timed push produces the biggest swing. Push a playground swing at random and it barely moves; push it at its natural rhythm and it flies. Your cardiovascular system behaves the same way. As <a href="https://www.frontiersin.org/articles/10.3389/fpsyg.2014.00756/full" target="_blank" rel="noopener">Lehrer and Gevirtz (2014)</a> describe, breathing at your personal resonance frequency (for most adults near **0.1 Hz, about six breaths a minute**) makes the breathing rhythm and the baroreflex rhythm resonate, and beat-to-beat variability swells to its maximum.

When that happens, the messy, spread-out spectrum collapses into **one tall, narrow peak** near 0.1 Hz. That concentration of power into a single clean rhythm is what's meant by **coherence.** A highly coherent reading looks orderly (a smooth, regular wave instead of static) and it's the fingerprint of a nervous system settling into a calm, rhythmic state.

<div class="callout callout-note">
  <strong>Resonance frequency is personal.</strong> Six breaths a minute is the population average, but your own resonance can sit anywhere from roughly 4.5 to 7 breaths a minute, mostly depending on your height and build. The right pace is the one that feels effortless and produces your biggest, cleanest peak, not a number you force yourself to hit.
</div>

Convert any breathing pace to its frequency and see whether it lands in the resonance zone:

<div class="metric-calc" id="res-calc">
  <p class="mc-head">Breathing pace to frequency</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="res-in">Breaths per minute</label>
      <input class="mc-input" id="res-in" type="number" inputmode="decimal" placeholder="e.g. 6" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="res-grade">Enter a pace</span>
    <span class="mc-note" id="res-freq">- Hz</span>
    <span class="mc-note" id="res-note">Type how many breaths per minute you are aiming for.</span>
  </div>
</div>

{@html resScript}

## The app's paced-breathing styles

Autonomic offers several guided breathing patterns, each with an inhale and exhale count in seconds. The sum of the two counts sets your breathing period, and that period fixes where the HF peak lands. Slower patterns pull the peak down toward the 0.1 Hz resonance zone:

| Pattern (in / out) | Seconds per breath | Breaths / min | Target HF peak |
| --- | --- | --- | --- |
| 4 / 4 | 8 | 7.5 | 0.18–0.21 Hz |
| 4 / 5 | 9 | 6.7 | 0.17–0.20 Hz |
| 5 / 5 | 10 | 6.0 | 0.16–0.18 Hz |
| 4 / 6 | 10 | 6.0 | 0.15–0.18 Hz |

Notice how the longer patterns march the target peak downward. The **4 / 6** and **5 / 5** styles sit closest to resonance, which is why they tend to produce the tallest, sharpest peaks and the highest coherence. If you're new to slow breathing, starting at 4 / 4 and working down over a few weeks is gentler than jumping straight to the slowest pace.

<details class="prose-details">
  <summary><strong>Why lengthening the exhale helps</strong></summary>
  <p>The heart slows most during exhalation, when the vagus nerve is most active. A pattern like 4 seconds in and 6 seconds out spends more time in that slowing phase, which deepens each dip in heart rate and widens the overall swing. It also makes the slow pace easier to sustain: a long, relaxed exhale feels far more natural than a long, held inhale. That's why several of the app's patterns weight the exhale longer than the inhale.</p>
</details>

## Grading the peaks

For an unstructured resting reading, Autonomic grades where each peak lands. The bands are non-linear, both too-low and too-high can pull a peak out of its healthy zone, so they read most clearly as a table rather than a left-to-right bar.

**LF peak (Hz)**: you want this parked near the 0.1 Hz baroreflex frequency:

| Grade | LF peak (Hz) |
| --- | --- |
| Excellent | 0.090–0.105 |
| Good | 0.075–0.089 or above 0.105 |
| Moderate | 0.060–0.074 |
| Compromised | 0.045–0.059 |
| Crash | Below 0.045 |

**HF peak (Hz)**: this tracks your breathing rate, so a comfortable resting breath keeps it in range:

| Grade | HF peak (Hz) |
| --- | --- |
| Excellent | 0.20–0.31 |
| Good | 0.15–0.19 or 0.32–0.39 |
| Moderate | 0.12–0.14 or 0.40+ |
| Compromised | Below 0.12 |

A very low HF peak often just means you were breathing slowly (which is fine, and even the goal during a paced session), while a very high one can mean rapid, shallow breathing. This is why the app scores paced and unstructured readings with different expectations, a distinction covered in [the autonomic score and grade bands](/insights/basics/the-autonomic-score-and-grade-bands/). For the underlying methods, the <a href="https://www.kubios.com/hrv-analysis-methods/" target="_blank" rel="noopener">Kubios HRV analysis reference</a> and the <a href="https://www.ahajournals.org/doi/10.1161/01.CIR.93.5.1043" target="_blank" rel="noopener">1996 Task Force standards</a> both detail how these peaks are located.

<div class="callout callout-tip">
  <strong>Autonomic guides the breath and scores the result.</strong> Run a paced session with an on-screen pacer, and the app checks whether your peak actually landed where the pattern intended, turning "breathe slowly" into a number you can watch climb. <a href="/">See how it works →</a>
</div>

Slow breathing at resonance isn't only a way to score well on a reading: it's a trainable skill. Practiced regularly, it becomes one of the most reliable tools for calming an over-revved nervous system, which is why it features so heavily in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/). And because it acts directly on the [autonomic nervous system](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/), a few minutes of it is one of the few things you can do to shift your state on demand.

## The bottom line

The LF and HF peaks answer *where* your heart-rate rhythm concentrates, not how much power it holds. The HF peak sits at your breathing rate; the LF peak sits near 0.1 Hz, in the baroreflex band. Breathe slowly enough, around six breaths a minute, and the two rhythms resonate, driving a single tall, sharp peak and high coherence. That's the state the app's paced-breathing styles are built to reach, and it's the most direct lever you have for raising HRV in the moment. Track where your peaks land, practice the pace that feels effortless, and let the trend show you the skill taking hold.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
