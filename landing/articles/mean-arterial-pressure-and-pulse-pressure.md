---
title: "Mean Arterial Pressure & Pulse Pressure, Explained"
slug: mean-arterial-pressure-and-pulse-pressure
published: true
summary: "Systolic over diastolic is only the start. Two derived numbers, mean arterial pressure and pulse pressure, often say more about how well your circulation is actually perfusing your organs, and both are quietly informative in POTS and orthostatic intolerance."
description: "Mean arterial pressure (MAP) and pulse pressure explained: the formulas, what they reveal about perfusion and stroke volume, and why a low pulse pressure matters in POTS."
keywords: "mean arterial pressure, MAP, pulse pressure, MAP formula, low pulse pressure, pulse pressure POTS, arterial stiffness, perfusion pressure, orthostatic intolerance"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1760985882646-84ff241429b8?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Rusty Watson / Unsplash"
tldr: "Mean arterial pressure (MAP) is the average pressure perfusing your organs across the whole heartbeat, estimated as (systolic + 2 x diastolic) / 3: diastole is weighted double because it lasts about twice as long. Pulse pressure (PP) is simply systolic minus diastolic, the size of the push each beat delivers, and a rough proxy for stroke volume and arterial stiffness. A low pulse pressure (under roughly 25 mmHg) can signal poor flow and is worth watching in POTS; a high one often reflects stiff arteries. The app grades both against a recovery-optimum band and tracks their trend."
categories:
  - basics
faq:
  - q: "What is mean arterial pressure?"
    a: "Mean arterial pressure (MAP) is the average pressure in your arteries across one full heartbeat, the pressure that actually drives blood into your organs. Because your heart spends about twice as long resting (diastole) as contracting (systole), MAP sits closer to the diastolic number than to the systolic. It is estimated as (systolic + 2 x diastolic) / 3, and a MAP of roughly 70 mmHg or more is generally needed to perfuse the organs at rest."
  - q: "What is pulse pressure?"
    a: "Pulse pressure is systolic minus diastolic: the difference between the peak and the trough of a heartbeat. It reflects how big a push each beat delivers, which tracks loosely with stroke volume (how much blood the heart ejects per beat) and with the stiffness of your large arteries. A typical resting pulse pressure is around 40 mmHg."
  - q: "Is a low pulse pressure dangerous?"
    a: "A low pulse pressure, roughly under 25 mmHg, means each beat is delivering only a small push, which can point to reduced stroke volume or low blood volume, both relevant in POTS and orthostatic intolerance. On its own it is not an emergency, but a low or falling pulse pressure, especially when it drops further on standing, is worth tracking and mentioning to a clinician."
  - q: "What causes a high pulse pressure?"
    a: "A wide pulse pressure most often reflects arterial stiffness: as the large arteries lose their springiness, the systolic peak climbs while the diastolic trough falls, widening the gap. Vigorous exercise, fever and anxiety can widen it temporarily. A persistently wide resting pulse pressure is worth discussing with a clinician."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this raw script is what makes the in-article calculator run in the browser.
  const mapScript = `<script>
(function () {
  var sys = document.getElementById('map-sys');
  var dia = document.getElementById('map-dia');
  if (!sys || !dia) return;
  var mapGrade = document.getElementById('map-map-grade');
  var mapNote = document.getElementById('map-map-note');
  var ppGrade = document.getElementById('map-pp-grade');
  var ppNote = document.getElementById('map-pp-note');
  var card = document.getElementById('map-calc');
  function mapBand(m) {
    if (m >= 116) return [1, 'Crash', '#b91c1c'];
    if (m >= 106) return [2, 'Compromised', '#f97316'];
    if (m >= 101) return [3, 'Moderate', '#eab308'];
    if (m >= 96) return [4, 'Good', '#22c55e'];
    if (m >= 80) return [5, 'Excellent', '#54d98a'];
    if (m >= 75) return [4, 'Good', '#22c55e'];
    if (m >= 70) return [3, 'Moderate', '#eab308'];
    if (m >= 65) return [2, 'Compromised', '#f97316'];
    return [1, 'Crash', '#b91c1c'];
  }
  function ppBand(p) {
    if (p >= 71) return [1, 'Crash', '#b91c1c'];
    if (p >= 61) return [2, 'Compromised', '#f97316'];
    if (p >= 56) return [3, 'Moderate', '#eab308'];
    if (p >= 51) return [4, 'Good', '#22c55e'];
    if (p >= 35) return [5, 'Excellent', '#54d98a'];
    if (p >= 30) return [4, 'Good', '#22c55e'];
    if (p >= 25) return [3, 'Moderate', '#eab308'];
    if (p >= 20) return [2, 'Compromised', '#f97316'];
    return [1, 'Crash', '#b91c1c'];
  }
  function reset() {
    mapGrade.textContent = 'Enter both numbers';
    mapGrade.style.color = '';
    mapNote.textContent = 'MAP = (systolic + 2 x diastolic) / 3.';
    ppGrade.textContent = '–';
    ppGrade.style.color = '';
    ppNote.textContent = 'Pulse pressure = systolic - diastolic.';
    if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
  }
  function update() {
    var s = parseFloat(sys.value);
    var d = parseFloat(dia.value);
    if (isNaN(s) || isNaN(d)) { reset(); return; }
    var m = Math.round((s + 2 * d) / 3);
    var p = Math.round(s - d);
    var mb = mapBand(m);
    var pb = ppBand(p);
    mapGrade.textContent = mb[1];
    mapGrade.style.color = mb[2];
    mapNote.textContent = 'MAP ' + m + ' mmHg, the average pressure perfusing your organs.';
    ppGrade.textContent = pb[1];
    ppGrade.style.color = pb[2];
    ppNote.textContent = 'Pulse pressure ' + p + ' mmHg, the size of each beat push.';
    var worse = mb[0] <= pb[0] ? mb : pb;
    if (card) card.style.setProperty('--mc-accent', worse[2]);
  }
  sys.addEventListener('input', update);
  dia.addEventListener('input', update);
  reset();
})();
<\/script>`;
</script>

## Past the top and bottom numbers

A [blood-pressure reading](/insights/basics/blood-pressure-basics-systolic-diastolic-pulse/) gives you systolic over diastolic, and most conversations stop there. But two numbers hidden inside that pair often carry more meaning than either one alone: the **mean arterial pressure**, which tells you whether your organs are actually being perfused, and the **pulse pressure**, which tells you how much push each heartbeat is delivering. Neither shows up on a basic cuff display, but both fall straight out of the two numbers you already have, and both are quietly useful when you are recovering from [POTS, long COVID or dysautonomia](/insights/postviral/pots-long-covid-and-mcas-overlap/).

## Mean arterial pressure: the number your organs feel

Your systolic pressure exists only for a split second at the top of each beat. Your organs do not care about that instantaneous peak; they care about the *average* pressure pushing blood through them across the entire cardiac cycle. That average is **mean arterial pressure (MAP)**, and it is the pressure that genuinely governs whether your brain, kidneys and other tissues get enough flow.

MAP is not the simple midpoint between systolic and diastolic, because the heart does not spend equal time at each. It spends roughly **twice as long resting** (diastole) as contracting (systole), so the diastolic pressure gets weighted double in the estimate:

<div class="callout callout-note">
  <strong>MAP = (systolic + 2 × diastolic) ÷ 3</strong><br />
  For a reading of 116/74, that is (116 + 148) ÷ 3 ≈ <strong>93 mmHg</strong>. Notice the answer sits much closer to the diastolic 74 than to the systolic 116, because diastole dominates the timeline.
</div>

Clinicians generally treat a MAP of about **70 mmHg** as the floor for perfusing the organs at rest; below that, tissues start to be shortchanged. That is why MAP, not systolic, is the pressure watched most closely in critical-care settings. For recovery tracking, a MAP that trends downward over weeks, or dips below your usual range when you stand, is a more honest early warning than the top number alone.

## Pulse pressure: the size of each push

Where MAP averages the cycle, **pulse pressure (PP)** measures its *range*, the distance from the diastolic trough up to the systolic peak:

<div class="callout callout-note">
  <strong>Pulse pressure = systolic − diastolic</strong><br />
  For 116/74, that is <strong>42 mmHg</strong>, a healthy, typical push. A resting pulse pressure around 40 mmHg is normal.
</div>

Pulse pressure is a rough proxy for two things at once. It tracks loosely with **stroke volume** (how much blood the heart ejects per beat) because a bigger ejection into the arteries produces a bigger pressure swing. And it reflects the **stiffness of your large arteries**, because springy, elastic vessels cushion the peak while stiff ones let it spike.

That gives the two extremes very different meanings:

- **Low pulse pressure (under ~25 mmHg):** each beat is delivering only a small push. This can point to reduced stroke volume or low blood volume, both common threads in POTS and orthostatic intolerance, where blood pools and the heart ends up ejecting less per beat. A narrowing pulse pressure on standing is a classic low-flow signal.
- **High pulse pressure (wide):** the systolic peak climbs while the diastolic trough sags, usually because the large arteries have stiffened and lost their cushion. Exercise, fever and anxiety widen it briefly; a persistently wide resting value is worth a clinician's attention.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 240" role="img" aria-label="A blood pressure reading of 116 over 74 broken into mean arterial pressure and pulse pressure on a vertical scale">
    <line x1="120" y1="30" x2="120" y2="210" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="112" y1="50" x2="128" y2="50" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="112" y1="150" x2="128" y2="150" stroke="var(--line-2)" stroke-width="1.5" />
    <text x="108" y="55" text-anchor="end" fill="#e03127" font-family="Space Mono, monospace" font-size="13" font-weight="700">116</text>
    <text x="108" y="155" text-anchor="end" fill="#58c4f2" font-family="Space Mono, monospace" font-size="13" font-weight="700">74</text>
    <text x="108" y="42" text-anchor="end" fill="var(--dim)" font-family="Space Mono, monospace" font-size="9">systolic</text>
    <text x="108" y="168" text-anchor="end" fill="var(--dim)" font-family="Space Mono, monospace" font-size="9">diastolic</text>
    <line x1="200" y1="50" x2="200" y2="150" stroke="#eab308" stroke-width="10" opacity="0.75" />
    <text x="220" y="96" fill="#eab308" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">Pulse pressure</text>
    <text x="220" y="116" fill="var(--dim)" font-family="Space Mono, monospace" font-size="12">116 − 74 = 42 mmHg</text>
    <line x1="440" y1="122" x2="700" y2="122" stroke="#54d98a" stroke-width="2" stroke-dasharray="5 4" />
    <circle cx="440" cy="122" r="5" fill="#54d98a" />
    <text x="452" y="112" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">Mean arterial pressure</text>
    <text x="452" y="140" fill="var(--dim)" font-family="Space Mono, monospace" font-size="12">(116 + 2 × 74) / 3 ≈ 93 mmHg</text>
    <text x="452" y="160" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">sits near diastolic, not the midpoint</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 280" role="img" aria-label="A blood pressure reading of 116 over 74 broken into mean arterial pressure and pulse pressure on a vertical scale">
    <line x1="66" y1="30" x2="66" y2="200" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="58" y1="50" x2="74" y2="50" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="58" y1="150" x2="74" y2="150" stroke="var(--line-2)" stroke-width="1.5" />
    <text x="54" y="55" text-anchor="end" fill="#e03127" font-family="Space Mono, monospace" font-size="13" font-weight="700">116</text>
    <text x="54" y="155" text-anchor="end" fill="#58c4f2" font-family="Space Mono, monospace" font-size="13" font-weight="700">74</text>
    <text x="54" y="42" text-anchor="end" fill="var(--dim)" font-family="Space Mono, monospace" font-size="9">systolic</text>
    <text x="54" y="168" text-anchor="end" fill="var(--dim)" font-family="Space Mono, monospace" font-size="9">diastolic</text>
    <line x1="104" y1="50" x2="104" y2="150" stroke="#eab308" stroke-width="10" opacity="0.75" />
    <text x="124" y="78" fill="#eab308" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">Pulse pressure</text>
    <text x="124" y="96" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">116 − 74 = 42 mmHg</text>
    <line x1="104" y1="122" x2="344" y2="122" stroke="#54d98a" stroke-width="2" stroke-dasharray="5 4" />
    <circle cx="104" cy="122" r="5" fill="#54d98a" />
    <text x="124" y="140" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">Mean arterial pressure</text>
    <text x="124" y="158" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">(116 + 2 × 74) / 3</text>
    <text x="124" y="174" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">≈ 93 mmHg</text>
    <text x="20" y="230" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">MAP sits near diastolic, not the</text>
    <text x="20" y="250" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">midpoint: the heart rests longer</text>
    <text x="20" y="270" fill="var(--dim)" font-family="-apple-system, sans-serif" font-size="12">than it contracts.</text>
  </svg>
  <figcaption>From one reading: pulse pressure is the height of the bar (the push), while MAP is the weighted average, pulled down toward diastolic because the heart rests longer than it contracts.</figcaption>
</figure>

## How Autonomic grades MAP and pulse pressure

Both metrics are graded against U-shaped recovery bands: there is an optimal middle, and drifting too far in either direction grades down. A plain left-to-right bar would be misleading here, so each is shown as a table with a low side and a high side.

**Mean arterial pressure (recovery grade bands):**

| Grade | MAP (mmHg) |
| --- | --- |
| Excellent | 80–95 |
| Good | 75–79 (low) · 96–100 (high) |
| Moderate | 70–74 (low) · 101–105 (high) |
| Compromised | 65–69 (low) · 106–115 (high) |
| Crash | under 65 (low) · 116+ (high) |

**Pulse pressure (recovery grade bands):**

| Grade | Pulse pressure (mmHg) |
| --- | --- |
| Excellent | 35–50 |
| Good | 30–34 (low) · 51–55 (high) |
| Moderate | 25–29 (low) · 56–60 (high) |
| Compromised | 20–24 (low) · 61–70 (high) |
| Crash | under 20 (low) · 71+ (high) |

Enter a reading and the calculator computes both derived numbers and grades each one:

<div class="metric-calc" id="map-calc">
  <p class="mc-head">MAP & pulse pressure calculator</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="map-sys">Systolic (mmHg)</label>
      <input class="mc-input" id="map-sys" type="number" inputmode="decimal" placeholder="e.g. 116" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="map-dia">Diastolic (mmHg)</label>
      <input class="mc-input" id="map-dia" type="number" inputmode="decimal" placeholder="e.g. 74" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="map-map-grade">Enter both numbers</span>
    <span class="mc-note" id="map-map-note">MAP = (systolic + 2 x diastolic) / 3.</span>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="map-pp-grade">–</span>
    <span class="mc-note" id="map-pp-note">Pulse pressure = systolic - diastolic.</span>
  </div>
</div>

{@html mapScript}

## Why these two matter in POTS and orthostatic intolerance

The reason MAP and pulse pressure earn a place in recovery tracking is that they catch problems the raw systolic can miss. In POTS and orthostatic intolerance, the failure mode is usually low flow: reduced blood volume, pooling in the legs on standing, and a smaller amount of blood ejected per beat. A shrinking pulse pressure is one of the cleanest fingerprints of that, and a MAP that sags toward the perfusion floor is what actually leaves your brain short when you stand and feel the room swim.

This is exactly why the [orthostatic stand test](/insights/pots/the-orthostatic-stand-test-at-home/) is so revealing: watching MAP and pulse pressure *change* between lying and standing exposes the low-flow response that a single seated reading hides. And because these numbers are derived from the same cuff reading you already take, they cost nothing extra to track. <a href="https://www.dysautonomiainternational.org/page.php?ID=30" target="_blank" rel="noopener">Dysautonomia International</a> describes orthostatic intolerance as a disorder of the circulatory response to standing, and these are the numbers that describe that response most directly. For blood-pressure context and the categories these values build on, the <a href="https://www.ahajournals.org/doi/10.1161/HYP.0000000000000065" target="_blank" rel="noopener">2017 ACC/AHA guideline</a> is the reference.

<details class="prose-details">
  <summary><strong>Worked example: a narrowing pulse pressure on standing</strong></summary>
  <p>Lying down, a reading is 112/70: MAP about 84 (Excellent), pulse pressure 42 (Excellent). After three minutes standing, it becomes 104/84: the systolic drifts down while the diastolic climbs as vessels clamp to defend pressure. MAP is now about 91 (still Excellent), but pulse pressure has collapsed to 20 (Compromised). The average pressure looks fine, yet the push per beat has shrunk by half, a signature of reduced stroke volume and pooling. Tracking only systolic, you would have seen an unremarkable 8-point dip. Tracking pulse pressure, you see the real story.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic computes both automatically.</strong> Every blood-pressure reading you log is turned into MAP and pulse pressure, graded against these recovery bands, and charted over time next to your systolic, diastolic, heart rate and stand test, so a narrowing pulse pressure shows up as a trend, not a number you have to work out by hand. <a href="/">See how it works →</a>
</div>

## The bottom line

Mean arterial pressure is the average pressure actually perfusing your organs, estimated as (systolic + 2 × diastolic) ÷ 3, weighted toward diastolic because the heart rests longer than it contracts, and a value around 70 mmHg or more is the resting floor for good perfusion. Pulse pressure is systolic minus diastolic, the size of each beat's push, and a proxy for stroke volume and arterial stiffness. A low or narrowing pulse pressure is a meaningful low-flow signal in POTS and orthostatic intolerance, while a wide one usually points to stiff arteries. Both come free from the reading you already take, both are graded on a two-sided recovery band, and both are best read as a trend beside your other numbers. For the autonomic-balance indices built from these same values, see [the autonomic blood-pressure indices](/insights/basics/autonomic-blood-pressure-indices-kerdo-robinson-kvas/).

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. If your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
