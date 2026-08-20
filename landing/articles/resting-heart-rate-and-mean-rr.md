---
title: "Resting Heart Rate & Mean RR: Your Simplest Autonomic Signal"
slug: resting-heart-rate-and-mean-rr
published: true
summary: "Resting heart rate is the plainest read on your autonomic load, and a creeping baseline is often the first sign of a bad stretch. Here's why position changes the number, how mean RR is the same information seen from beat-to-beat space, and how to read a rising resting HR in POTS recovery."
description: "Resting heart rate and mean RR interval explained: why lying runs lower than sitting, how mean RR relates to heart rate, and what a creeping resting HR signals in POTS and long COVID recovery."
keywords: "resting heart rate, mean RR interval, resting HR POTS, what is a good resting heart rate, mean RR, RR interval, resting heart rate position, orthostatic intolerance, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1568617935424-49ab968826d7?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Dan Burton / Unsplash"
tldr: "Resting heart rate is the simplest autonomic signal there is: it rises with sympathetic load, so a creeping baseline is often the first hint of illness, a bad stretch, or overreaching. Position matters (lying runs lower than sitting), so the app grades them on separate scales. Mean RR is the same information in beat-to-beat space: the average gap between beats in milliseconds, equal to 60000 divided by heart rate, and the number all HRV math is built on. Read your own trend, measured the same way each time."
categories:
  - basics
  - hrv
faq:
  - q: "What is a good resting heart rate?"
    a: "For a relaxed lying reading, roughly 62 bpm or lower is excellent and under about 68 is good, while a sitting reading runs a few beats higher for the same person. But the healthy range is wide and personal: a resting HR that is steady or slowly falling over weeks is a better sign than any single number, and your own baseline matters more than a population chart."
  - q: "Why is my resting heart rate higher sitting than lying?"
    a: "Sitting up asks your cardiovascular system to work slightly harder to return blood against gravity, so the sympathetic branch nudges the heart a little faster. The difference is normal and usually a handful of beats. It's exactly why resting HR should be compared like-for-like: a sitting reading against sitting readings, lying against lying."
  - q: "What is mean RR?"
    a: "Mean RR is the average length of the gaps between your heartbeats in a reading, measured in milliseconds. It's the same information as heart rate seen from the other direction: mean RR equals 60000 divided by your heart rate in bpm. A heart rate of 60 bpm is a mean RR of 1000 ms. HRV is calculated from these RR intervals, so mean RR is the baseline the variability sits on."
  - q: "Is a high resting heart rate a sign of POTS?"
    a: "A high resting heart rate alone isn't diagnostic, but resting tachycardia and a large heart-rate jump on standing are common in POTS. What defines POTS is a sustained rise of 30 bpm or more when moving from lying to standing, which is why a stand test matters more than the resting number by itself. Persistent resting tachycardia is worth raising with a clinician."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this raw script is what makes the in-article grader run in the browser.
  const rhrScript = `<script>
(function () {
  var input = document.getElementById('rhr-in');
  if (!input) return;
  var grade = document.getElementById('rhr-grade');
  var note = document.getElementById('rhr-note');
  var card = document.getElementById('rhr-calc');
  function pos() {
    var radios = document.getElementsByName('rhr-pos');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) return radios[i].value;
    }
    return 'lying';
  }
  function bandLying(n) {
    if (n <= 62) return ['Excellent', '#54d98a', 'Strong resting rate for a lying reading.'];
    if (n <= 68) return ['Good', '#22c55e', 'A healthy lying resting heart rate.'];
    if (n <= 75) return ['Moderate', '#eab308', 'Middle of the range, watch the weekly trend.'];
    if (n <= 85) return ['Compromised', '#f97316', 'Elevated for lying. Common on an under-recovered day.'];
    return ['Crash', '#b91c1c', 'High resting rate: heavy sympathetic load.'];
  }
  function bandSitting(n) {
    if (n <= 68) return ['Excellent', '#54d98a', 'Strong resting rate for a sitting reading.'];
    if (n <= 78) return ['Good', '#22c55e', 'A healthy sitting resting heart rate.'];
    if (n <= 88) return ['Moderate', '#eab308', 'Middle of the range, watch the weekly trend.'];
    if (n <= 98) return ['Compromised', '#f97316', 'Elevated for sitting. Common when under-recovered.'];
    return ['Crash', '#b91c1c', 'High resting rate: heavy sympathetic load.'];
  }
  function update() {
    var n = parseFloat(input.value);
    if (isNaN(n) || n <= 0) {
      grade.textContent = 'Enter a value';
      grade.style.color = '';
      note.textContent = 'Pick your position and enter your resting heart rate.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    var b = pos() === 'sitting' ? bandSitting(n) : bandLying(n);
    grade.textContent = b[0];
    grade.style.color = b[1];
    note.textContent = b[2];
    if (card) card.style.setProperty('--mc-accent', b[1]);
  }
  input.addEventListener('input', update);
  var radios = document.getElementsByName('rhr-pos');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', update);
  }
  update();
})();
<\/script>`;
</script>

## The signal you already trust

Long before you'd heard of heart rate variability, you knew that a pounding heart at rest meant something was off. **Resting heart rate** is the oldest and simplest autonomic signal there is (a single number you can take with two fingers on your wrist), and it still carries a surprising amount of information. It tracks your **sympathetic load**: how hard the "fight or flight" branch of your [autonomic nervous system](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/) is leaning on the accelerator right now.

When you're rested and calm, the parasympathetic brake dominates and the heart idles slowly. When you're stressed, fighting off a virus, dehydrated, or simply overreaching after too many hard days, the sympathetic branch pushes the resting rate up. That's why a **creeping resting heart rate is so often the first thing to move**: it can rise a day or two before you consciously feel a cold coming on or a crash setting in.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 220" role="img" aria-label="A resting heart rate baseline holding steady for two weeks then creeping upward over several days">
    <line x1="60" y1="180" x2="700" y2="180" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="60" y1="180" x2="60" y2="24" stroke="var(--line-2)" stroke-width="1.5" />
    <text x="30" y="60" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">80</text>
    <text x="30" y="150" text-anchor="middle" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">60</text>
    <polyline points="80,132 130,128 180,134 230,126 280,130 330,128 380,124 430,120 480,108 530,92 580,74 630,60 680,50" fill="none" stroke="#e03127" stroke-width="2.5" />
    <g fill="#e03127"><circle cx="80" cy="132" r="3"/><circle cx="180" cy="134" r="3"/><circle cx="280" cy="130" r="3"/><circle cx="380" cy="124" r="3"/><circle cx="480" cy="108" r="3"/><circle cx="580" cy="74" r="3"/><circle cx="680" cy="50" r="3"/></g>
    <text x="230" y="200" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">steady baseline</text>
    <text x="590" y="200" text-anchor="middle" fill="#e03127" font-family="-apple-system, sans-serif" font-size="12">creeping upward</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 208" role="img" aria-label="A resting heart rate baseline holding steady for two weeks then creeping upward over several days">
    <line x1="40" y1="176" x2="344" y2="176" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="40" y1="176" x2="40" y2="34" stroke="var(--line-2)" stroke-width="1.5" />
    <text x="34" y="70" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">80</text>
    <text x="34" y="152" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">60</text>
    <polyline points="50,132 73,129 97,134 121,127 144,130 168,129 192,125 216,121 240,110 263,96 287,80 311,67 334,58" fill="none" stroke="#e03127" stroke-width="2.5" />
    <g fill="#e03127"><circle cx="50" cy="132" r="3"/><circle cx="97" cy="134" r="3"/><circle cx="144" cy="130" r="3"/><circle cx="192" cy="125" r="3"/><circle cx="240" cy="110" r="3"/><circle cx="287" cy="80" r="3"/><circle cx="334" cy="58" r="3"/></g>
    <text x="50" y="198" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="11.5">steady baseline</text>
    <text x="344" y="198" text-anchor="end" fill="#e03127" font-family="-apple-system, sans-serif" font-size="11.5">creeping upward</text>
  </svg>
  <figcaption>A resting heart rate that drifts up over several days is often the earliest warning of illness, poor sleep or overreaching, visible before the symptoms are.</figcaption>
</figure>

## Position changes the number

Here's the catch that trips people up: **resting heart rate depends heavily on your position.** Lying down, blood returns to the heart easily and the sympathetic branch can relax, so the rate is at its lowest. Sit up and gravity starts pulling blood toward your legs; your body compensates by nudging the heart a few beats faster to keep blood pressure steady. Stand, and it climbs further still, the basis of [the orthostatic stand test](/insights/pots/the-orthostatic-stand-test-at-home/).

So the same healthy person can read 60 bpm lying and 70 bpm sitting within the same minute, and neither is "wrong." This is why Autonomic grades lying and sitting readings on **separate scales**, and why measuring in a consistent position matters so much. The [measure-well guide](/insights/basics/how-to-measure-hrv-accurately-at-home/) walks through building a repeatable routine (same posture, same time of day, same conditions) so your numbers stay comparable.

<div class="callout callout-note">
  <strong>Compare like with like.</strong> A sitting reading only means something against your other sitting readings. Mixing positions is the fastest way to invent a "trend" that's really just you sitting up one morning. Pick a posture and stick to it.
</div>

## Mean RR: the same signal, from the other side

Heart rate counts beats per minute. **Mean RR** measures the average *gap between* beats, in milliseconds, the "RR interval" being the distance from one heartbeat to the next on an ECG. They are the same information seen from opposite directions, linked by a simple formula:

**Mean RR (ms) = 60000 ÷ heart rate (bpm)**

A heart rate of 60 bpm is a mean RR of 1000 ms. At 75 bpm it's 800 ms; at 50 bpm it's 1200 ms. Faster heart rate, shorter gaps, smaller mean RR, always inversely.

Why bother with the RR view at all? Because **all HRV math happens in RR space.** Variability is defined as how much those gaps change from beat to beat, so every HRV metric, from [RMSSD](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) to [SDNN](/insights/basics/what-is-sdnn-in-hrv/), is computed from the string of RR intervals, not from heart rate. Mean RR is the flat baseline those variations ride on top of; the [RR intervals and tachogram explainer](/insights/basics/rr-intervals-and-the-tachogram-explained/) shows the raw signal itself. Knowing mean RR also keeps you honest: a large variability number sitting on a very short mean RR reads differently than the same variability on a long one.

<details class="prose-details">
  <summary><strong>Quick conversions: heart rate to mean RR</strong></summary>
  <p>50 bpm → 1200 ms · 55 bpm → 1091 ms · 60 bpm → 1000 ms · 65 bpm → 923 ms · 70 bpm → 857 ms · 75 bpm → 800 ms · 80 bpm → 750 ms · 90 bpm → 667 ms · 100 bpm → 600 ms. The relationship is a curve, not a straight line: the same 10-bpm change shortens the interval more at low heart rates than at high ones, which is worth remembering when you compare readings taken at different rates.</p>
</details>

## How Autonomic grades resting heart rate

The app scores resting HR against posture-specific bands. Lying readings run lower than sitting for the same person, so each has its own scale.

**Resting HR, lying (bpm):**

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>&le; 62</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>63–68</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>69–75</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>76–85</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>&gt; 85</small></span>
</div>

| Grade | Lying (bpm) | What it usually reflects |
| --- | --- | --- |
| Excellent | 62 or less | Strong parasympathetic idle |
| Good | 63–68 | Healthy resting rate |
| Moderate | 69–75 | Middle of the range, watch the trend |
| Compromised | 76–85 | Elevated; common when under-recovered |
| Crash | Above 85 | Heavy sympathetic load |

**Resting HR, sitting (bpm):**

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>&le; 68</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>69–78</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>79–88</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>89–98</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>&gt; 98</small></span>
</div>

| Grade | Sitting (bpm) | What it usually reflects |
| --- | --- | --- |
| Excellent | 68 or less | Strong resting rate seated |
| Good | 69–78 | Healthy seated resting rate |
| Moderate | 79–88 | Middle of the range, watch the trend |
| Compromised | 89–98 | Elevated; common when under-recovered |
| Crash | Above 98 | Heavy sympathetic load |

Pick your position and check your own number against the same bands the app uses:

<div class="metric-calc" id="rhr-calc">
  <p class="mc-head">Resting heart rate grade check</p>
  <div class="mc-row">
    <div class="mc-field">
      <span class="mc-label">Position</span>
      <label class="mc-radio"><input type="radio" name="rhr-pos" value="lying" checked /> Lying</label>
      <label class="mc-radio"><input type="radio" name="rhr-pos" value="sitting" /> Sitting</label>
    </div>
    <div class="mc-field">
      <label class="mc-label" for="rhr-in">Resting HR (bpm)</label>
      <input class="mc-input" id="rhr-in" type="number" inputmode="numeric" placeholder="e.g. 66" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="rhr-grade">Enter a value</span>
    <span class="mc-note" id="rhr-note">Pick your position and enter your resting heart rate.</span>
  </div>
</div>

{@html rhrScript}

<div class="callout callout-note">
  <strong>One reading is a snapshot.</strong> A single high morning can come from poor sleep, caffeine, a warm room or a stressful day. It's the run of readings (the baseline holding, falling, or creeping) that carries the signal.
</div>

## Reading resting HR in POTS and recovery

In POTS and other forms of orthostatic intolerance, resting heart rate is often elevated even before you stand, because the sympathetic branch is already working overtime to hold blood pressure together. That's why it pairs so naturally with the stand test: the resting rate sets the floor, and the [orthostatic rise](/insights/pots/the-orthostatic-stand-test-at-home/) measures how much further the system has to reach.

The hopeful side is that resting heart rate is also one of the **clearest recovery signals** you have. As the autonomic system settles over months of pacing and careful rebuilding, a **falling resting HR** is one of the most common and encouraging patterns people see, often moving steadily downward before energy and symptoms catch up. We trace that arc in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/), and it's a number worth bringing to appointments, as covered in [turning your data into a doctor conversation](/insights/recovery/turn-your-data-into-a-doctor-conversation/).

<div class="callout callout-tip">
  <strong>Autonomic tracks it automatically.</strong> Every reading logs resting HR and mean RR against the right posture scale and charts them beside your HRV and stand test, so a creeping baseline or a slow recovery shows up as a line you can actually see. <a href="/">See how it works →</a>
</div>

## The bottom line

Resting heart rate is the simplest window into autonomic load: it rises with sympathetic strain, so a creeping baseline is often the earliest warning you'll get, and a falling one is among the most reassuring recovery signals. Because position changes the number, measure the same way every time and compare lying to lying, sitting to sitting. Mean RR is the very same signal expressed in the beat-to-beat space where HRV is calculated: 60000 divided by your heart rate. Watch your own trend rather than a population chart, read it beside your HRV and stand test, and this plain, familiar number becomes one of the most useful you can track.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
