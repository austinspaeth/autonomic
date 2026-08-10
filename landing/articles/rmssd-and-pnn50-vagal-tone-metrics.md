---
title: "RMSSD and pNN50: Your Two Vagal-Tone Metrics, Explained"
slug: rmssd-and-pnn50-vagal-tone-metrics
published: true
summary: "RMSSD and pNN50 are the two time-domain numbers that track vagal tone, the parasympathetic 'rest and digest' side of your nervous system. RMSSD is the cleanest day-to-day recovery signal you have. Here's what each one means and how to read them."
description: "What RMSSD and pNN50 mean in HRV: how each vagal-tone metric is calculated, healthy ranges for short readings, why RMSSD swings day to day, and how to track them in POTS and long COVID recovery."
keywords: "RMSSD, pNN50, vagal tone, parasympathetic HRV, RMSSD normal range, what is RMSSD, RMSSD vs SDNN, pNN50 meaning, heart rate variability, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1593030019566-d681b01e877f?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Sarah Brown / Unsplash"
tldr: "RMSSD is the root mean square of the differences between successive heartbeat intervals: it isolates the fast, beat-to-beat changes driven mainly by the vagus nerve, which makes it the single cleanest day-to-day recovery signal in HRV. pNN50 is the percentage of successive intervals that differ by more than 50 ms; it tracks the same vagal activity but saturates at the extremes, so it's best read as a sustained trend that moves with RMSSD. Both run low in POTS and long COVID and typically climb over a recovery arc. Compare same-time-of-day readings only."
categories:
  - basics
  - hrv
faq:
  - q: "What is a good RMSSD number?"
    a: "For a short at-home reading, an RMSSD above roughly 34 ms is a strong result and the low 20s is middling, while under 17 ms is low. But RMSSD is highly individual and swings with sleep, stress and time of day, so your own baseline and its direction over weeks matter far more than any single target number."
  - q: "What's the difference between RMSSD and SDNN?"
    a: "RMSSD isolates the rapid beat-to-beat changes driven mainly by the vagus nerve, so it's a clean read on parasympathetic 'rest and digest' activity and the best day-to-day recovery signal. SDNN is the standard deviation of all your intervals and blends every rhythm at once, so it's a broader capacity measure. Most people track RMSSD daily and use SDNN as the wider view."
  - q: "Why does my RMSSD change so much day to day?"
    a: "Because it tracks the fast vagal signal, RMSSD is genuinely sensitive to how last night went: poor sleep, alcohol, stress, illness, dehydration and even the time of day all move it. That sensitivity is the point: it's why RMSSD is such a responsive recovery signal. The fix is to measure the same way each morning and follow the multi-week trend rather than reacting to any single number."
  - q: "What is pNN50?"
    a: "pNN50 is the percentage of successive heartbeat intervals that differ from the previous one by more than 50 milliseconds. Like RMSSD, it reflects vagal (parasympathetic) tone, but it saturates when variability is very high or very low, so it moves in step with RMSSD and is best read as a sustained trend rather than a precise daily figure."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this is what makes the in-article calculator run in the browser.
  const rmssdScript = `<script>
(function () {
  var input = document.getElementById('rmssd-in');
  if (!input) return;
  var grade = document.getElementById('rmssd-grade');
  var note = document.getElementById('rmssd-note');
  var card = document.getElementById('rmssd-calc');
  function band(n) {
    if (isNaN(n)) return null;
    if (n >= 34) return ['Excellent', '#54d98a', 'Strong vagal activity for a short reading.'];
    if (n >= 27) return ['Good', '#22c55e', 'A healthy short-reading RMSSD.'];
    if (n >= 22) return ['Moderate', '#eab308', 'Middle of the range. Watch the weekly trend.'];
    if (n >= 17) return ['Compromised', '#f97316', 'Below target, common on an under-recovered day.'];
    return ['Bad', '#ef4444', 'Low vagal tone: a rigid, sympathetically biased rhythm.'];
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

## The numbers that track your recovery day to day

Of all the heart rate variability figures you can capture, two stand slightly apart because they point at one specific thing: the **vagus nerve**, the main highway of your parasympathetic "rest and digest" system. Those two are **RMSSD** and **pNN50**. If [SDNN](/insights/basics/what-is-sdnn-in-hrv/) is the broad summary of your total variability, RMSSD and pNN50 are the close-ups: they isolate the fast, beat-to-beat flicker that your vagus nerve produces, and that flicker is the cleanest window you have onto whether you're recovered or running down.

The vagus nerve acts fast. It can slow your heart within a single beat and release it just as quickly, which shows up as rapid, short-lived changes in the spacing between beats. RMSSD and pNN50 are both built specifically to catch those quick changes and ignore the slower drifts, which is exactly why they're the metrics most people watch every morning.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 250" role="img" aria-label="Two tachograms compared: a high-RMSSD reading where each beat interval jumps sharply from the last, and a low-RMSSD reading where intervals change only slightly beat to beat">
    <text x="20" y="26" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">High RMSSD, big beat-to-beat jumps</text>
    <polyline fill="none" stroke="#54d98a" stroke-width="2.5" points="40,70 100,40 160,95 220,45 280,90 340,50 400,98 460,42 520,88 580,52 640,92 700,48" />
    <g fill="#54d98a"><circle cx="40" cy="70" r="4"/><circle cx="100" cy="40" r="4"/><circle cx="160" cy="95" r="4"/><circle cx="220" cy="45" r="4"/><circle cx="280" cy="90" r="4"/><circle cx="340" cy="50" r="4"/><circle cx="400" cy="98" r="4"/><circle cx="460" cy="42" r="4"/><circle cx="520" cy="88" r="4"/><circle cx="580" cy="52" r="4"/><circle cx="640" cy="92" r="4"/><circle cx="700" cy="48" r="4"/></g>
    <text x="20" y="150" fill="#ef4444" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">Low RMSSD, small beat-to-beat changes</text>
    <polyline fill="none" stroke="#ef4444" stroke-width="2.5" points="40,192 100,188 160,195 220,190 280,193 340,189 400,194 460,188 520,192 580,190 640,193 700,189" />
    <g fill="#ef4444"><circle cx="40" cy="192" r="4"/><circle cx="100" cy="188" r="4"/><circle cx="160" cy="195" r="4"/><circle cx="220" cy="190" r="4"/><circle cx="280" cy="193" r="4"/><circle cx="340" cy="189" r="4"/><circle cx="400" cy="194" r="4"/><circle cx="460" cy="188" r="4"/><circle cx="520" cy="192" r="4"/><circle cx="580" cy="190" r="4"/><circle cx="640" cy="193" r="4"/><circle cx="700" cy="189" r="4"/></g>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 244" role="img" aria-label="Two tachograms compared: a high-RMSSD reading where each beat interval jumps sharply from the last, and a low-RMSSD reading where intervals change only slightly beat to beat">
    <text x="20" y="18" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">High RMSSD, big</text>
    <text x="20" y="34" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">beat-to-beat jumps</text>
    <polyline fill="none" stroke="#54d98a" stroke-width="2.5" points="24,70 53,40 82,95 111,45 140,90 169,50 199,98 228,42 257,88 286,52 315,92 344,48" />
    <g fill="#54d98a"><circle cx="24" cy="70" r="4"/><circle cx="53" cy="40" r="4"/><circle cx="82" cy="95" r="4"/><circle cx="111" cy="45" r="4"/><circle cx="140" cy="90" r="4"/><circle cx="169" cy="50" r="4"/><circle cx="199" cy="98" r="4"/><circle cx="228" cy="42" r="4"/><circle cx="257" cy="88" r="4"/><circle cx="286" cy="52" r="4"/><circle cx="315" cy="92" r="4"/><circle cx="344" cy="48" r="4"/></g>
    <text x="20" y="146" fill="#ef4444" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">Low RMSSD, small</text>
    <text x="20" y="162" fill="#ef4444" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">beat-to-beat changes</text>
    <polyline fill="none" stroke="#ef4444" stroke-width="2.5" points="24,204 53,200 82,207 111,202 140,205 169,201 199,206 228,200 257,204 286,202 315,205 344,201" />
    <g fill="#ef4444"><circle cx="24" cy="204" r="4"/><circle cx="53" cy="200" r="4"/><circle cx="82" cy="207" r="4"/><circle cx="111" cy="202" r="4"/><circle cx="140" cy="205" r="4"/><circle cx="169" cy="201" r="4"/><circle cx="199" cy="206" r="4"/><circle cx="228" cy="200" r="4"/><circle cx="257" cy="204" r="4"/><circle cx="286" cy="202" r="4"/><circle cx="315" cy="205" r="4"/><circle cx="344" cy="201" r="4"/></g>
  </svg>
  <figcaption>RMSSD measures the size of the jump from each beat interval to the next, not the spread around an average. Big zig-zags mean high RMSSD; a nearly flat line means low.</figcaption>
</figure>

If you're new to the raw beat-to-beat data these are built from, the [RR intervals and tachogram explainer](/insights/basics/rr-intervals-and-the-tachogram-explained/) covers the ground they stand on.

## How RMSSD is calculated

The name is a recipe read backwards. Take each pair of **S**uccessive intervals and find the **D**ifference between them. **S**quare each difference (so ups and downs both count as size, not sign), take the **M**ean of those squares, then take the **R**oot. Root Mean Square of Successive Differences: RMSSD.

The clever part is that first step. By working with the *difference between neighbours* rather than the spread around a global average, RMSSD deliberately throws away the slow drifts and keeps only the fast, one-beat-to-the-next changes, and those are overwhelmingly the vagus nerve's signature. That's why the research literature treats it as the go-to time-domain marker of parasympathetic activity. Both <a href="https://www.frontiersin.org/articles/10.3389/fpubh.2017.00258/full" target="_blank" rel="noopener">Shaffer and Ginsberg (2017)</a> and the methodology review by <a href="https://www.frontiersin.org/articles/10.3389/fpsyg.2017.00213/full" target="_blank" rel="noopener">Laborde and colleagues (2017)</a> single out RMSSD as the most reliable short-recording index of vagal tone, and, helpfully, one that's relatively stable across reading lengths, unlike SDNN.

<div class="callout callout-note">
  <strong>RMSSD barely cares about reading length.</strong> Because it looks only at neighbouring beats, RMSSD doesn't balloon the way SDNN does when you record for longer. A one-minute and a five-minute RMSSD are far more comparable than the equivalent SDNN values, one reason it's the friendlier metric for quick daily readings.
</div>

## How pNN50 is calculated

pNN50 comes from the same raw material but reports it more simply. Walk through every pair of successive intervals, count how many differ by **more than 50 milliseconds**, and express that count as a **percentage** of all the pairs. That's pNN50: the share of your beats where the spacing jumped by at least 50 ms from the one before.

Because a 50 ms jump between beats is largely a vagal event, pNN50 rises and falls with parasympathetic activity, just like RMSSD. Its weakness is the fixed 50 ms threshold: when your variability is very low, almost no pairs clear the bar and pNN50 pins near zero; when it's very high, a large fraction clear it and the number saturates. So pNN50 is coarser than RMSSD at the extremes. Read it as a companion that confirms the RMSSD trend, not as a precise standalone dial.

## How Autonomic grades RMSSD

Autonomic grades short-reading RMSSD against the recovery framework's thresholds. These are tuned for the few-minute readings the app captures:

<div class="metric-scale">
  <span class="ms-seg" style="background:#ef4444">Bad<small>&lt; 17</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>17–21</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>22–26</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>27–33</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>34+</small></span>
</div>

| Grade | RMSSD (ms) | What it usually reflects |
| --- | --- | --- |
| Excellent | 34+ | Strong vagal activity, well-recovered |
| Good | 27–33 | Healthy short-reading vagal tone |
| Moderate | 22–26 | Middle of the range, watch the trend |
| Compromised | 17–21 | Below target; common when under-recovered |
| Bad | Under 17 | Low vagal tone, sympathetically biased |

<div class="callout callout-note">
  <strong>Paced breathing shifts the bar.</strong> If you take a slow-paced or resonance-breathing reading, your RMSSD will naturally run higher than a quiet unstructured one, so the app uses a slightly lower Excellent cutoff of 32 ms for those. The bands above are for the ordinary resting reading: match your grade to the way you actually measured.
</div>

Try your own resting number against the same bands the app uses:

<div class="metric-calc" id="rmssd-calc">
  <p class="mc-head">RMSSD grade check</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="rmssd-in">Your RMSSD (ms)</label>
      <input class="mc-input" id="rmssd-in" type="number" inputmode="decimal" placeholder="e.g. 28" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="rmssd-grade">Enter a value</span>
    <span class="mc-note" id="rmssd-note">See where your reading lands on the recovery scale.</span>
  </div>
</div>

{@html rmssdScript}

## How Autonomic grades pNN50

pNN50 gets its own bands, in percent. Because it saturates at the edges, treat these as a sustained-trend guide rather than a daily verdict:

<div class="metric-scale">
  <span class="ms-seg" style="background:#ef4444">Bad<small>&lt; 2</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>2–3</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>4–6</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>7–9</small></span>
  <span class="ms-seg" style="background:#54d98a">Excellent<small>10+</small></span>
</div>

| Grade | pNN50 (%) | What it usually reflects |
| --- | --- | --- |
| Excellent | 10+ | Frequent large beat-to-beat jumps, strong vagal tone |
| Good | 7–9 | Healthy parasympathetic activity |
| Moderate | 4–6 | Middle of the range, read the trend |
| Compromised | 2–3 | Few large jumps; under-recovered |
| Bad | Under 2 | Rhythm rarely varies by 50 ms, low vagal tone |

<div class="callout callout-note">
  <strong>A grade is a snapshot, not a verdict.</strong> One reading in the "Compromised" band means very little by itself, especially for pNN50, which is coarse at the low end. The bands exist so a run of readings can show you a direction, and direction is the thing worth trusting.
</div>

## Why RMSSD swings so much, and how to read it

RMSSD's sensitivity is a feature, but it means the number bounces around. A short night, a couple of drinks, a stressful day, a coming illness, dehydration, even measuring an hour later than usual, all of these visibly move RMSSD. That responsiveness is exactly what makes it a good early-warning signal, but only if you don't let the noise fool you.

A few habits keep it honest:

- **Measure the same way every time**: same posture, same time of day (first thing after waking is ideal), same reading length. The [measuring-well guide](/insights/basics/how-to-measure-hrv-accurately-at-home/) covers this in full, and it matters more for RMSSD than almost any other metric.
- **Follow 7–14 days, not one morning.** A single low reading is usually last night, not a trend. A two-week slide is signal.
- **Read it beside its siblings.** RMSSD next to a falling [resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/) and a shrinking [stand-test rise](/insights/pots/the-orthostatic-stand-test-at-home/) tells a far stronger recovery story than any one number alone, and the [complete HRV guide](/insights/hrv/hrv-complete-guide/) shows how they fit together.

In POTS, long COVID and post-viral dysautonomia, a suppressed RMSSD and pNN50 are typical: the system leans toward "fight or flight," which is precisely the state that flattens vagal variability. For the fuller picture of that overlap, see [POTS, long COVID and MCAS](/insights/postviral/pots-long-covid-and-mcas-overlap/). The encouraging part is that vagal tone is trainable and recoverable: many people watch their RMSSD baseline climb over months of pacing, and often see it move *before* they feel better. We follow that arc in [recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/).

<details class="prose-details">
  <summary><strong>Worked example: same average heart rate, opposite RMSSD</strong></summary>
  <p>Picture two readings that both average about 70 bpm (a mean interval near 857 ms). In the first, each beat interval swings sharply from the last: 820, 900, 810, 890, 815 ms and so on. Those successive differences run 60–90 ms, and the RMSSD lands in the mid-30s, comfortably "Excellent," with a pNN50 well into double digits. In the second, the intervals barely move (855, 858, 854, 859, 856 ms), so successive differences are a handful of milliseconds, the RMSSD sits near 5 ("Bad"), and pNN50 pins at zero because nothing clears the 50 ms bar. Identical heart rate, opposite vagal picture. That contrast is exactly what RMSSD and pNN50 exist to surface, and why average heart rate alone can hide a struggling autonomic system.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic does this for you.</strong> Every HRV reading you log is scored against these thresholds and charted over time, so you can watch your RMSSD and pNN50 trend next to SDNN, heart rate and your stand test: one picture instead of scattered numbers. <a href="/">See how it works →</a>
</div>

## The bottom line

RMSSD and pNN50 are your two vagal-tone metrics: both built from the fast, beat-to-beat changes the vagus nerve drives, and both a window on your parasympathetic "rest and digest" side. RMSSD is the sharper, more reliable of the pair and the single best day-to-day recovery signal in HRV; pNN50 is a coarser companion that confirms the trend and saturates at the extremes. Because RMSSD is so responsive, it will bounce night to night, so measure it the same way each morning, follow it across weeks, and read it beside SDNN, heart rate and your stand test. Do that, and a jumpy daily number becomes a genuine map of your recovery.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
