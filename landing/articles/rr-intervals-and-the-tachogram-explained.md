---
title: "RR Intervals & the Tachogram: The Raw Data Behind HRV"
slug: rr-intervals-and-the-tachogram-explained
published: true
summary: "Every HRV number you'll ever see is built from one simple series: the time in milliseconds between your heartbeats. This is the plain-language explainer for RR intervals, the tachogram that plots them, and why a healthy trace looks like rolling waves rather than a flat line."
description: "What RR and NN intervals are, how the tachogram plots them, why a healthy heart is not a metronome, and how artifacts get corrected before HRV metrics are computed."
keywords: "RR interval, NN interval, tachogram, heart rate variability, RR intervals explained, ectopic beat, artifact correction, respiratory sinus arrhythmia, HRV raw data, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1627302800387-8dbab13aefba?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Clay Banks / Unsplash"
tldr: "An RR interval is the time in milliseconds between two heartbeats. String those intervals together over a reading and plot them and you get a tachogram, the raw material every HRV metric is made of. A healthy trace isn't flat; it rolls in gentle waves as your breathing speeds and slows the heart, and that variation is the good part. A missed or extra beat shows up as a sharp spike, which HRV software detects and corrects before it computes anything, which is why your app sometimes 'drops' a beat. SDNN, RMSSD and the power bands are all just different summaries of this one series."
categories:
  - basics
  - hrv
faq:
  - q: "What is an RR interval?"
    a: "An RR interval is the time, measured in milliseconds, between two consecutive heartbeats, specifically between the R peaks of the QRS complex on an ECG, which is the sharp spike of each beat. A resting heart at 60 bpm has an average RR interval of about 1000 ms. When beats are confirmed to be normal ones, the intervals are often called NN (normal-to-normal) intervals, and that's the series HRV metrics are actually built from."
  - q: "What is a tachogram?"
    a: "A tachogram is a plot of your RR intervals over time: each point is one interval, and the line connecting them shows how the spacing between beats rises and falls across the reading. A healthy resting tachogram looks like gentle rolling waves rather than a flat line, because breathing rhythmically speeds and slows the heart."
  - q: "What is an ectopic beat or artifact?"
    a: "An ectopic beat is an early or extra beat that fires outside the normal rhythm, and an artifact is any interval that doesn't reflect a true normal beat: a missed beat, a doubled detection, or motion noise from the sensor. Both show up on the tachogram as a sudden spike that's out of step with the surrounding waves."
  - q: "Why does my HRV app remove or correct beats?"
    a: "Because a single bad interval can distort the whole reading. HRV metrics like RMSSD are very sensitive to sudden jumps, so one artifact can inflate or wreck the number. Software detects intervals that are implausibly different from their neighbours and corrects or removes them before computing anything, which is why you sometimes see an app 'drop' a beat. It's protecting the accuracy of the result."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what makes the in-article converter run in the browser.
  const rrScript = `<script>
(function () {
  var input = document.getElementById('rr-in');
  if (!input) return;
  var outMs = document.getElementById('rr-out-ms');
  var note = document.getElementById('rr-note');
  var card = document.getElementById('rr-calc');
  function update() {
    var hr = parseFloat(input.value);
    if (isNaN(hr) || hr <= 0) {
      outMs.textContent = '–';
      note.textContent = 'Enter a heart rate to see the matching mean RR interval.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    var rr = Math.round(60000 / hr);
    outMs.textContent = rr + ' ms';
    note.textContent = 'At ' + Math.round(hr) + ' bpm each beat sits about ' + rr + ' ms apart. A lower heart rate means a longer RR interval.';
    if (card) card.style.setProperty('--mc-accent', '#58c4f2');
  }
  input.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## The one series everything else is built from

Open any article on heart rate variability and you're quickly buried in acronyms: SDNN, RMSSD, pNN50, LF, HF. It's easy to miss that they all describe the *same* underlying thing. Every one of those numbers is a different way of summarizing a single, humble series of measurements: **the time between your heartbeats.**

That measurement is the **RR interval**, the gap, in milliseconds, from one heartbeat to the next. Learn to picture that series and the rest of HRV stops being a wall of jargon and becomes a set of tools that all point at one signal. This is the foundational explainer the other [HRV basics](/insights/hrv/hrv-complete-guide/) quietly assume you already understand.

## What an RR interval actually is

On an ECG trace, each heartbeat produces a sharp spike called the **R peak**. The RR interval is simply the time from one R peak to the next. Measure it in milliseconds and you have the raw unit of HRV: a heart beating once per second has an RR interval of 1000 ms.

You'll also see the term **NN interval**, "normal-to-normal." It means the same thing, with one restriction: only the intervals between confirmed *normal* beats count. Once the software has thrown out the odd or misread beats (more on that below), what's left is the NN series, and that clean series is what the metrics are actually computed from. RR is the raw recording; NN is the tidied version. If you see either term, picture the same thing: the spacing between beats.

<div class="callout callout-note">
  <strong>RR and heart rate are two views of one fact.</strong> Heart rate is beats per minute; the RR interval is the milliseconds per beat. They're reciprocals: <code>RR = 60000 ÷ HR</code>. A rising heart rate and a shortening RR interval are the exact same event described two ways. The converter further down lets you flip between them.
</div>

## The tachogram: your heartbeats, plotted over time

Line all your RR intervals up in order and plot them (interval length on the vertical axis, time across the horizontal) and you get a **tachogram**. Each point is one beat-to-beat gap; the line joining them shows how the spacing rises and falls across the reading.

Here's the part that surprises people: a healthy resting tachogram is **not** a flat line. It rolls.

<figure class="prose-figure">
  <svg viewBox="0 0 720 260" role="img" aria-label="A tachogram: RR interval length plotted over time as a wavy line rolling up and down with breathing, with one sharp downward spike labelled as an artifact from a missed or extra beat">
    <text x="20" y="24" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">Tachogram: RR interval over time</text>
    <line x1="52" y1="40" x2="52" y2="210" stroke="var(--line-2)" stroke-width="1" />
    <line x1="52" y1="210" x2="700" y2="210" stroke="var(--line-2)" stroke-width="1" />
    <text x="46" y="70" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">1000</text>
    <text x="46" y="130" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">900</text>
    <text x="46" y="190" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">800</text>
    <text x="20" y="128" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="11" transform="rotate(-90 20 128)">RR (ms)</text>
    <text x="376" y="234" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="11">time →</text>
    <line x1="52" y1="120" x2="700" y2="120" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4" />
    <text x="700" y="116" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">mean</text>
    <path d="M60 118 C 90 78, 120 76, 150 116 C 180 156, 210 158, 240 118 C 270 80, 300 78, 330 118 C 360 156, 390 158, 420 118 C 450 80, 480 82, 510 118 C 540 154, 570 156, 600 118 C 630 82, 660 84, 690 116" fill="none" stroke="#22c55e" stroke-width="2.5" />
    <g><circle cx="285" cy="196" r="4" fill="#ef4444" /><line x1="285" y1="120" x2="285" y2="192" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 3" /><text x="285" y="94" text-anchor="middle" fill="#ef4444" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="11">artifact</text><text x="285" y="108" text-anchor="middle" fill="var(--dim-2)" font-family="-apple-system, sans-serif" font-size="9">extra / missed beat</text></g>
  </svg>
  <figcaption>A resting tachogram rolls in gentle waves as breathing speeds and slows the heart. The lone downward spike is an artifact, a beat that doesn't fit the rhythm, which software corrects before computing HRV.</figcaption>
</figure>

## A healthy heart is not a metronome

Those rolling waves have a cause, and it's a good one. As you breathe in, your heart speeds up slightly (the RR interval shortens); as you breathe out, it slows (the interval lengthens). This breathing-linked rhythm is called **respiratory sinus arrhythmia**, and it's the single biggest driver of the waves you see in a resting tachogram.

As the researchers behind much of the modern HRV literature put it, <a href="https://www.frontiersin.org/articles/10.3389/fpsyg.2014.01040/full" target="_blank" rel="noopener">a healthy heart is not a metronome</a>: its "irregularity" is a sign that the [autonomic nervous system](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/) is flexible enough to adjust the heart beat by beat. A trace with big, easy waves reflects a responsive, well-regulated system. A trace that goes flat and metronomic, every interval nearly identical, reflects the opposite: a rhythm locked in place, low in variability.

This is exactly why HRV matters in POTS, long COVID and post-viral illness. When the system is biased toward "fight or flight," the waves shrink and the tachogram flattens. You can read more about that pattern in [what HRV is and why it matters for POTS recovery](/insights/hrv/what-is-hrv-and-why-it-matters-for-pots-recovery/) and in the [POTS, long COVID and MCAS overlap](/insights/postviral/pots-long-covid-and-mcas-overlap/).

## Artifacts, ectopic beats, and why your app "drops" beats

Not every point on a tachogram is a true heartbeat. Two things spoil the raw series:

- **Ectopic beats**: an early or extra beat that fires outside the normal rhythm. It creates one interval that's much too short, usually followed by one that's too long, producing a jagged spike out of step with the surrounding waves.
- **Artifacts**, anything the sensor got wrong: a beat it missed, a beat it counted twice, or plain motion noise. On the tachogram these also appear as sudden spikes.

The problem is that HRV metrics are *sensitive* to these spikes. Because a measure like RMSSD looks at the jump between neighbouring intervals, one bad beat can dramatically inflate or corrupt the number. So before computing anything, HRV software runs **artifact correction**: it scans for intervals that are implausibly different from their neighbours and either removes or interpolates them. That's what's happening when your app appears to "drop" a beat: it isn't losing your data, it's protecting the accuracy of the result.

<div class="callout callout-tip">
  <strong>Autonomic cleans the series for you.</strong> Every reading you log is artifact-corrected before it's scored, so your SDNN, RMSSD and frequency bands are computed from a clean NN series rather than raw noise, and you can watch the trend without doing any of the math. <a href="/">See how it works →</a>
</div>

## From one series to every HRV number

Once you have a clean tachogram, every HRV metric is just a different question asked of the same points:

- **[SDNN](/insights/basics/what-is-sdnn-in-hrv/)** asks: how spread out are all the intervals overall?
- **[RMSSD and pNN50](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/)** ask: how big are the jumps between one interval and the next?
- **The [frequency bands](/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/)** ask: how much of the waving happens at breathing speed versus slower rhythms?
- **[Mean RR and resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/)** ask: what's the average interval, and its bpm equivalent?

None of them is a separate measurement. They're all summaries of the tachogram, which is why understanding the raw series makes every other metric click into place.

## Convert heart rate to a mean RR interval

Because heart rate and RR interval are reciprocals, you can flip between them with one bit of arithmetic: <code>RR = 60000 ÷ HR</code>. Enter a resting heart rate and see the matching average interval, and notice that as heart rate falls, the RR interval grows.

<div class="metric-calc" id="rr-calc">
  <p class="mc-head">Heart rate to mean RR converter</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="rr-in">Heart rate (bpm)</label>
      <input class="mc-input" id="rr-in" type="number" inputmode="decimal" placeholder="e.g. 60" />
    </div>
    <div class="mc-field">
      <span class="mc-label">Mean RR interval</span>
      <span class="mc-grade" id="rr-out-ms">–</span>
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-note" id="rr-note">Enter a heart rate to see the matching mean RR interval.</span>
  </div>
</div>

{@html rrScript}

A few reference points to anchor the relationship:

| Heart rate | Mean RR interval |
| --- | --- |
| 50 bpm | 1200 ms |
| 60 bpm | 1000 ms |
| 70 bpm | 857 ms |
| 80 bpm | 750 ms |
| 100 bpm | 600 ms |

<details class="prose-details">
  <summary><strong>Worked example: what one breath does to the tachogram</strong></summary>
  <p>Imagine a calm reading averaging 60 bpm, a mean RR interval of 1000 ms. As you inhale, your heart nudges up to about 66 bpm, so those intervals shorten to roughly 910 ms. As you exhale, it eases to about 55 bpm, stretching the intervals to around 1090 ms. Nothing is wrong; you simply breathed. On the tachogram that single breath draws one full wave (down on the inhale, up on the exhale) swinging nearly 180 ms even though your average stayed at 1000. Multiply that by every breath in the reading and you get the rolling line of a healthy trace. A person whose intervals barely move from 1000 ms across the whole reading has the same average heart rate but almost none of the variability, and that difference is precisely what HRV metrics are built to catch.</p>
</details>

## The bottom line

Strip away the acronyms and heart rate variability comes down to one series: the RR intervals between your heartbeats, plotted as a tachogram. A healthy resting trace rolls in gentle waves because breathing speeds and slows the heart. A flat, metronomic line is the warning sign, not the goal. Odd and misread beats show up as spikes and get corrected before any metric is computed, which is why your app sometimes drops a beat. And every HRV number you'll ever track (SDNN, RMSSD, the power bands) is simply a different summary of this one underlying signal. Understand the tachogram and the rest of HRV falls into place.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
