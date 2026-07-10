---
title: "The Autonomic Score & Grade Bands: One Number, Explained"
slug: the-autonomic-score-and-grade-bands
published: true
summary: "Every colored tint in the app traces back to one system: a 0–100 readiness score and a ladder of grade bands from Excellent down to Crash, plus a violet Warning flag for readings that are suspiciously high. Here's how raw metrics become a single number, and how to read it without over-trusting it."
description: "How the Autonomic app turns raw HRV metrics into one 0–100 readiness score and a color grade: the weighting, the grade bands from Excellent to Crash, and the violet Warning flag explained."
keywords: "autonomic score, readiness score, HRV composite, grade bands, HRV score, recovery score, what is a good HRV score, HRV weighting, warning zone, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1754944014696-e8b3a3d3605c?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Tom Nazaret / Unsplash"
tldr: "The app rolls a reading's key metrics into a single weighted 0–100 readiness score, then maps it to a color grade: Excellent, Good, Moderate, Compromised, Bad, or Crash, plus a violet Warning band for scores so high they usually mean illness or an artifact rather than fitness. Unstructured and paced readings use slightly different weightings. Treat the score as your quick 'how recovered am I?' number, then drill into the individual metrics to see why, and trust the trend over any single day."
categories:
  - basics
  - app
faq:
  - q: "What is a good autonomic or readiness score?"
    a: "On the app's 0–100 scale, 70 to 85 is Excellent and 60 to 69 is Good, while below 50 signals a compromised or crashed day. But the score is designed to be read against your own baseline: a 62 that's ten points above your usual is great news, and a 62 that's ten points down is worth noticing. Direction over weeks matters more than the absolute number."
  - q: "Why can a very high score be a warning?"
    a: "Above about 86 the app flags a violet Warning instead of celebrating. A readiness score that spikes far above your normal usually isn't peak fitness: it more often reflects an oncoming illness, a measurement artifact, or an unusually low heart rate from something like a fever brewing. The Warning band is a nudge to check the raw reading rather than trust the high number at face value."
  - q: "How is the readiness score calculated?"
    a: "It's a weighted blend of the reading's key HRV metrics, each first graded on its own scale and then combined. An unstructured reading leans most on RMSSD and pNN50; a paced breathing reading shifts weight toward the LF and HF peaks, since those reflect whether the breathing actually drove the rhythm. The weighted pieces sum to a single 0–100 number."
  - q: "What do the grade colors mean?"
    a: "The colors run from green for Excellent and Good, through yellow for Moderate, orange for Compromised, and red to dark red for Bad and Crash, a simple traffic-light logic where greener is more recovered. Violet sits apart as a Warning: not good, not bad, but suspicious and worth a closer look at the underlying reading."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this raw script is what makes the in-article interpreter run in the browser.
  const scoreScript = `<script>
(function () {
  var input = document.getElementById('score-in');
  if (!input) return;
  var grade = document.getElementById('score-grade');
  var note = document.getElementById('score-note');
  var card = document.getElementById('score-calc');
  function band(n) {
    if (isNaN(n)) return null;
    if (n > 100 || n < 0) return ['Out of range', '', 'The score runs from 0 to 100.'];
    if (n >= 86) return ['Warning', '#a78bfa', 'Unusually high, often illness or an artifact, not peak fitness. Check the raw reading.'];
    if (n >= 70) return ['Excellent', '#54d98a', 'A strong, well-recovered reading.'];
    if (n >= 60) return ['Good', '#22c55e', 'A solid, healthy readiness score.'];
    if (n >= 50) return ['Moderate', '#eab308', 'Middle of the range, watch the weekly trend.'];
    if (n >= 35) return ['Compromised', '#f97316', 'Below baseline, common on an under-recovered day.'];
    return ['Crash', '#b91c1c', 'A heavily suppressed reading. Prioritize rest.'];
  }
  function update() {
    var b = band(parseFloat(input.value));
    if (!b) {
      grade.textContent = 'Enter a score';
      grade.style.color = '';
      note.textContent = 'Type a readiness score from 0 to 100.';
      if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
      return;
    }
    grade.textContent = b[0];
    grade.style.color = b[1];
    note.textContent = b[2];
    if (card) card.style.setProperty('--mc-accent', b[1] || 'var(--line-2)');
  }
  input.addEventListener('input', update);
  update();
})();
<\/script>`;
</script>

## From a dozen numbers to one

A single HRV reading throws a lot of numbers at you: RMSSD, pNN50, SDNN, total power, the LF and HF peaks, the LF/HF ratio. Each one is meaningful, but staring at six or seven metrics every morning is a fast way to stop tracking altogether. So the app does what a good coach does, reading all of them and giving you **one number and one color**: a 0–100 **readiness score** and a grade band. That score is the source of every colored tint you see elsewhere in the app, and this article is the key to reading all of them.

The idea is simple in spirit. Treat the score as your quick answer to "how recovered am I today?", glance at the color, and get on with your day. Then, when the number surprises you (a low grade, or a suspiciously high one) you **drill into the individual metrics** to see *why*. The score is the headline; the metrics are the story.

## The grade vocabulary

Every metric and every overall reading gets sorted into one of six grades, running best to worst, with one special seventh band standing off to the side.

<figure class="prose-figure">
  <svg viewBox="0 0 720 320" role="img" aria-label="A ladder of six grade bands from Excellent at the top down to Crash at the bottom, with a violet Warning tier shown separately to the right as a too-high flag">
    <text x="20" y="24" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">The grade ladder</text>
    <g font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">
      <rect x="20" y="40" width="360" height="36" rx="7" fill="#54d98a" /><text x="38" y="63" fill="#08140c">Excellent</text><text x="362" y="63" text-anchor="end" fill="#08140c" font-family="Space Mono, monospace" font-size="12">70–85</text>
      <rect x="20" y="82" width="330" height="36" rx="7" fill="#22c55e" /><text x="38" y="105" fill="#08140c">Good</text><text x="332" y="105" text-anchor="end" fill="#08140c" font-family="Space Mono, monospace" font-size="12">60–69</text>
      <rect x="20" y="124" width="300" height="36" rx="7" fill="#eab308" /><text x="38" y="147" fill="#1a1400">Moderate</text><text x="302" y="147" text-anchor="end" fill="#1a1400" font-family="Space Mono, monospace" font-size="12">50–59</text>
      <rect x="20" y="166" width="270" height="36" rx="7" fill="#f97316" /><text x="38" y="189" fill="#1a0d00">Compromised</text><text x="272" y="189" text-anchor="end" fill="#1a0d00" font-family="Space Mono, monospace" font-size="12">35–49</text>
      <rect x="20" y="208" width="240" height="36" rx="7" fill="#ef4444" /><text x="38" y="231" fill="#fff">Bad</text></g>
      <g font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14"><rect x="20" y="250" width="210" height="36" rx="7" fill="#b91c1c" /><text x="38" y="273" fill="#fff">Crash</text><text x="232" y="273" text-anchor="end" fill="#fff" font-family="Space Mono, monospace" font-size="12">&lt; 35</text></g>
    <line x1="470" y1="40" x2="470" y2="286" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="4 4" />
    <rect x="500" y="120" width="200" height="70" rx="10" fill="none" stroke="#a78bfa" stroke-width="2.5" />
    <text x="600" y="150" text-anchor="middle" fill="#a78bfa" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">Warning</text>
    <text x="600" y="172" text-anchor="middle" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">86+ · too high</text>
    <text x="600" y="212" text-anchor="middle" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="11">a flag, not a rank</text>
  </svg>
  <figcaption>Six grades run from Excellent down to Crash. The violet Warning band sits apart: it flags a reading that's suspiciously high rather than placing it on the good-to-bad scale.</figcaption>
</figure>

The six ranked grades follow a traffic-light logic: **Excellent** and **Good** in green, **Moderate** in yellow, **Compromised** in orange, and **Bad** then **Crash** in deepening red. Greener means more recovered; redder means more strained.

The seventh, **Warning**, is different. Rendered in violet, it isn't a rank: it's a **too-high flag.** When a readiness score climbs far above your normal, that usually isn't a sign of extraordinary fitness. More often it means something is *off*: an oncoming illness dropping your heart rate, a measurement artifact, or an unusually quiet reading that the math over-rewards. The Warning band exists to stop you from celebrating a number that deserves a second look instead. This mirrors the "blue zone" concept used on individual metrics, where a value can be too high as well as too low.

<div class="callout callout-note">
  <strong>Higher isn't always better.</strong> HRV in particular has a ceiling past which more is suspicious, not superior. A single reading that towers over your baseline is the classic signature of a brewing infection or a noisy recording, which is exactly what the violet Warning is there to catch.
</div>

## How the readiness score is built

The overall score (the **HRV composite**) is a weighted blend of the reading's key metrics. Each metric is first graded on its own scale (the same scales covered in the individual articles), and then those grades are combined with weights that reflect how much each one tells you about recovery. Crucially, the app uses **two weightings**, because a relaxed reading and a paced-breathing reading are answering slightly different questions.

For an **unstructured** HRV reading (you sitting or lying quietly, breathing however you breathe) the weighting leans on the vagal metrics:

| Metric | Weight |
| --- | --- |
| [RMSSD](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) | 25 |
| [pNN50](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) | 20 |
| [Total power](/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/) | 15 |
| [LF peak](/insights/basics/lf-peak-hf-peak-coherence-resonance/) | 15 |
| [SDNN](/insights/basics/what-is-sdnn-in-hrv/) | 15 |
| LF/HF ratio | 10 |

For a **paced / breathing** reading (where you followed a guided pace) the weighting shifts toward the peaks, because now the question is partly *did the breathing actually drive the rhythm?*

| Metric | Weight |
| --- | --- |
| [RMSSD](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) | 25 |
| [LF peak](/insights/basics/lf-peak-hf-peak-coherence-resonance/) | 20 |
| [pNN50](/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/) | 15 |
| [Total power](/insights/basics/hrv-frequency-domain-vlf-lf-hf-power/) | 15 |
| [HF peak](/insights/basics/lf-peak-hf-peak-coherence-resonance/) | 15 |
| LF/HF ratio | 10 |

Notice what changes: the paced weighting **adds the HF peak** and **raises the LF peak's weight**, because in a paced session those peaks reveal whether you actually hit your target pace and pulled power into the resonance zone. The vagal metrics still lead (RMSSD stays the single heaviest input in both) but the frequency picture earns more say when you're breathing on purpose. The weighting rationale traces back to the same framework laid out in the <a href="https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full" target="_blank" rel="noopener">Shaffer and Ginsberg (2017)</a> overview and the <a href="https://www.frontiersin.org/articles/10.3389/fpsyg.2017.00213/full" target="_blank" rel="noopener">Laborde et al. (2017)</a> methodological guidance.

<details class="prose-details">
  <summary><strong>Why weight RMSSD the heaviest?</strong></summary>
  <p>RMSSD is the cleanest, most reproducible read on vagal (parasympathetic) activity in a short reading, and parasympathetic tone is what "recovered" mostly means physiologically. It's also the least distorted by reading length and the least fussy about breathing, which makes it a stable backbone for the composite. pNN50 measures a closely related thing and reinforces it, which is why the two vagal metrics together carry the largest share of the score in both weightings.</p>
</details>

## The readiness score bands

Here's how the 0–100 composite maps to grades. Note the violet Warning sitting above Excellent, not below Crash:

<div class="metric-scale">
  <span class="ms-seg" style="background:#b91c1c">Crash<small>&lt; 35</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>35–49</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>50–59</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>60–69</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>70–85</small></span>
  <span class="ms-seg" style="background:#a78bfa">Warning<small>86+</small></span>
</div>

| Grade | Score | What it usually reflects |
| --- | --- | --- |
| Warning | 86+ | Suspiciously high, likely illness or an artifact |
| Excellent | 70–85 | A strong, well-recovered reading |
| Good | 60–69 | Solid, healthy readiness |
| Moderate | 50–59 | Middle of the range, watch the trend |
| Compromised | 35–49 | Below baseline; an under-recovered day |
| Crash | Below 35 | Heavily suppressed, prioritize rest |

Try a score against the same bands the app uses:

<div class="metric-calc" id="score-calc">
  <p class="mc-head">Readiness score interpreter</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="score-in">Readiness score (0–100)</label>
      <input class="mc-input" id="score-in" type="number" inputmode="numeric" placeholder="e.g. 64" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="score-grade">Enter a score</span>
    <span class="mc-note" id="score-note">Type a readiness score from 0 to 100.</span>
  </div>
</div>

{@html scoreScript}

<div class="callout callout-note">
  <strong>The bands are anchors, not judgments.</strong> A "Compromised" morning after a bad night is information, not a failing grade. The score earns its value as a run of readings that shows you a direction: greener over weeks is the thing worth chasing.
</div>

## Reading the score well

The score is designed to be **glanced at and then trusted only as a trend.** A few habits keep it honest:

- **Read it against your own baseline.** A 62 that's well above your usual is a great day; the same 62 after a run of 75s is a dip worth noticing. The absolute number matters less than where it sits relative to *you*.
- **Let a surprise send you into the metrics.** When the score is low, open the reading and see which metric dragged it: a collapsed RMSSD tells a different story than a wandering LF peak. When it's a violet Warning, check the raw tachogram for artifacts before assuming anything.
- **Follow the line, not the dot.** One reading is weather; the multi-week trend is climate. Recovery, covered in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/), shows up as a slowly rising floor, not a single perfect morning.

Because it distills everything into one trackable number, the readiness score is also the easiest thing to bring to an appointment. A clean chart of your score over months (with the metrics behind it available when asked) turns a vague "I've been feeling off" into something a clinician can actually work with, which is the whole point of [turning your data into a doctor conversation](/insights/recovery/turn-your-data-into-a-doctor-conversation/). For the bigger picture of how the app captures, analyzes and acts on these readings, see the [app overview](/insights/app/autonomic-app-measure-analyze-monitor-act/).

<div class="callout callout-tip">
  <strong>Autonomic scores every reading for you.</strong> The composite, the grade band and the color are computed automatically the moment you finish a reading, and you can always tap through to the individual metrics to see exactly why the score landed where it did. <a href="/">See how it works →</a>
</div>

## The bottom line

The autonomic score is the app's way of turning a scatter of HRV metrics into one honest answer: a weighted 0–100 readiness number and a color grade from Excellent to Crash, with a violet Warning reserved for readings too high to trust at face value. Unstructured and paced readings weight the metrics a little differently, but RMSSD leads both and the logic is the same: combine the pieces, then let you drill in for the why. Read it against your own baseline, follow the trend rather than the day, and use a surprising score as a prompt to look closer, not a verdict to take at face value.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
