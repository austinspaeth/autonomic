---
title: "Autonomic BP Indices: Kérdő, Robinson & Kvas"
slug: autonomic-blood-pressure-indices-kerdo-robinson-kvas
published: true
summary: "From three simple numbers (systolic, diastolic and pulse) you can derive several older physiology indices that read autonomic balance and cardiovascular efficiency. They are research tools, not clinical verdicts, so their value is in your own trend. Here is what each one means and how to read it."
description: "The Kérdő, Robinson (rate-pressure product), Kvas and BCE indices explained: formulas, meaning, and how to read cardiovascular efficiency and autonomic balance from blood pressure and pulse."
keywords: "Kerdo index, vegetative index, Robinson index, rate pressure product, double product, Kvas index, blood circulation efficiency, autonomic balance, cardiovascular efficiency"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1521729839347-131a32f9abcb?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Willian Justen de Vasconcellos / Unsplash"
tldr: "Four derived indices squeeze extra meaning from a simple blood-pressure-plus-pulse reading. The Kérdő vegetative index reads autonomic balance (near zero is balanced, positive leans sympathetic, negative leans parasympathetic). The Robinson index (rate-pressure product) estimates the heart's workload. The Kvas index and BCE both gauge circulatory efficiency, where lower is better. None of these are routine clinical tests (they are older physiology formulas), so their real value is watching your own trend, not one number."
categories:
  - basics
faq:
  - q: "What is the Kérdő index?"
    a: "The Kérdő vegetative index estimates autonomic balance from a blood-pressure and pulse reading, using the formula (1 minus diastolic divided by pulse) times 100. A value near zero suggests the sympathetic and parasympathetic branches are roughly balanced; a positive value leans sympathetic (fight or flight), and a negative value leans parasympathetic (rest and digest). It is a rough physiology estimate, best read as a personal trend."
  - q: "What is the rate-pressure product?"
    a: "The rate-pressure product, or Robinson index (also called the double product), is systolic pressure times pulse, divided by 100. It estimates how much oxygen the heart muscle is demanding and, therefore, how hard the heart is working. At rest, a lower value means the heart is doing its job more efficiently. It rises predictably with exertion and stress."
  - q: "Are these indices clinically validated?"
    a: "Not as routine diagnostic tests. The Kérdő, Robinson, Kvas and BCE indices come from older physiology and sports-science research, and none is a standard clinical tool you would find on a lab report. Treat them as trend indicators for your own data rather than numbers with a fixed medical cutoff. Their strength is showing change over time, not labeling a single reading."
  - q: "What do these indices tell me about my autonomic balance?"
    a: "The Kérdő index is the one that speaks most directly to autonomic balance, estimating whether your sympathetic or parasympathetic branch is dominant from a resting reading. The others speak to cardiovascular efficiency: how hard the heart is working and how effectively blood is circulating. Read together and tracked over weeks, they add texture to what your HRV and stand test already show."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this raw script is what makes the in-article calculator run in the browser.
  const abpScript = `<script>
(function () {
  var sys = document.getElementById('abp-sys');
  var dia = document.getElementById('abp-dia');
  var pul = document.getElementById('abp-pul');
  if (!sys || !dia || !pul) return;
  var kG = document.getElementById('abp-kerdo-grade');
  var kN = document.getElementById('abp-kerdo-note');
  var rG = document.getElementById('abp-rob-grade');
  var rN = document.getElementById('abp-rob-note');
  var vG = document.getElementById('abp-kvas-grade');
  var vN = document.getElementById('abp-kvas-note');
  var bG = document.getElementById('abp-bce-grade');
  var bN = document.getElementById('abp-bce-note');
  var card = document.getElementById('abp-calc');
  function kerdoBand(k) {
    if (k <= -46) return [1, 'Crash', '#b91c1c'];
    if (k <= -31) return [2, 'Compromised', '#f97316'];
    if (k <= -21) return [3, 'Moderate', '#eab308'];
    if (k <= -11) return [4, 'Good', '#22c55e'];
    if (k <= 10) return [5, 'Excellent', '#54d98a'];
    if (k <= 20) return [4, 'Good', '#22c55e'];
    if (k <= 30) return [3, 'Moderate', '#eab308'];
    if (k <= 45) return [2, 'Compromised', '#f97316'];
    return [1, 'Crash', '#b91c1c'];
  }
  function robBand(r) {
    if (r < 71) return [5, 'Excellent', '#54d98a'];
    if (r <= 80) return [4, 'Good', '#22c55e'];
    if (r <= 90) return [3, 'Moderate', '#eab308'];
    if (r <= 100) return [2, 'Compromised', '#f97316'];
    return [1, 'Crash', '#b91c1c'];
  }
  function kvasBand(v) {
    if (v < 14) return [5, 'Excellent', '#54d98a'];
    if (v <= 16) return [4, 'Good', '#22c55e'];
    if (v <= 20) return [3, 'Moderate', '#eab308'];
    if (v <= 25) return [2, 'Compromised', '#f97316'];
    return [1, 'Crash', '#b91c1c'];
  }
  function bceBand(b) {
    if (b < 2601) return [5, 'Excellent', '#54d98a'];
    if (b <= 3000) return [4, 'Good', '#22c55e'];
    if (b <= 3500) return [3, 'Moderate', '#eab308'];
    if (b <= 4000) return [2, 'Compromised', '#f97316'];
    return [1, 'Crash', '#b91c1c'];
  }
  function reset() {
    kG.textContent = 'Enter all three';
    kG.style.color = '';
    kN.textContent = 'Kerdo = (1 - diastolic / pulse) x 100. Near 0 is balanced.';
    rG.textContent = '-';
    rG.style.color = '';
    rN.textContent = 'Robinson = systolic x pulse / 100. Lower is more efficient.';
    vG.textContent = '-';
    vG.style.color = '';
    vN.textContent = 'Kvas = 10 x pulse / (systolic - diastolic). Lower is better.';
    bG.textContent = '-';
    bG.style.color = '';
    bN.textContent = 'BCE = (systolic - diastolic) x pulse. Lower is better.';
    if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
  }
  function lean(k) {
    if (k > 10) return 'sympathetic-leaning.';
    if (k < -10) return 'parasympathetic-leaning.';
    return 'well balanced.';
  }
  function update() {
    var s = parseFloat(sys.value);
    var d = parseFloat(dia.value);
    var p = parseFloat(pul.value);
    if (isNaN(s) || isNaN(d) || isNaN(p) || p <= 0) { reset(); return; }
    var worst = 6;
    var kraw = (1 - d / p) * 100;
    var k = Math.round(kraw);
    var kb = kerdoBand(k);
    kG.textContent = kb[1];
    kG.style.color = kb[2];
    kN.textContent = 'Kerdo ' + k + ': autonomic balance is ' + lean(k);
    if (kb[0] < worst) worst = kb[0];
    var r = Math.round((s * p) / 100);
    var rb = robBand(r);
    rG.textContent = rb[1];
    rG.style.color = rb[2];
    rN.textContent = 'Robinson ' + r + ': estimated cardiac workload at rest.';
    if (rb[0] < worst) worst = rb[0];
    var pp = s - d;
    if (pp <= 0) {
      vG.textContent = 'n/a';
      vG.style.color = '';
      vN.textContent = 'Kvas needs systolic above diastolic to compute.';
      bG.textContent = '0';
      bG.style.color = '';
      bN.textContent = 'BCE needs a positive pulse pressure.';
    } else {
      var v = Math.round((10 * p) / pp * 10) / 10;
      var vb = kvasBand(v);
      vG.textContent = vb[1];
      vG.style.color = vb[2];
      vN.textContent = 'Kvas ' + v + ': circulatory efficiency ratio.';
      if (vb[0] < worst) worst = vb[0];
      var b = Math.round(pp * p);
      var bb = bceBand(b);
      bG.textContent = bb[1];
      bG.style.color = bb[2];
      bN.textContent = 'BCE ' + b + ': circulation efficiency.';
      if (bb[0] < worst) worst = bb[0];
    }
    var colors = ['#b91c1c', '#f97316', '#eab308', '#22c55e', '#54d98a'];
    if (card) card.style.setProperty('--mc-accent', worst >= 1 && worst <= 5 ? colors[worst - 1] : 'var(--line-2)');
  }
  sys.addEventListener('input', update);
  dia.addEventListener('input', update);
  pul.addEventListener('input', update);
  reset();
})();
<\/script>`;
</script>

## More signal from a simple reading

A blood-pressure cuff and a pulse are humble tools. But feed those three numbers ([systolic, diastolic and pulse](/insights/basics/blood-pressure-basics-systolic-diastolic-pulse/)) into a handful of old physiology formulas and you can read out things they were never obviously measuring: how balanced your [autonomic nervous system](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/) is, how hard your heart is working, and how efficiently blood is circulating. Autonomic computes four of these indices from every reading.

<div class="callout callout-note">
  <strong>Set expectations first.</strong> These are older research and sports-physiology indices, not routine clinical tests. You will not find them on a lab report, and none carries a validated medical cutoff. Their value is in tracking your <em>own</em> trend over weeks: watching a number drift as you recover or crash, not in reading a single value as a verdict. Held to that modest job, they are genuinely useful.
</div>

## The four indices, one reading

<figure class="prose-figure">
  <svg viewBox="0 0 720 260" role="img" aria-label="Diagram showing systolic, diastolic and pulse feeding into four derived indices: Kerdo, Robinson, Kvas and BCE">
    <rect x="40" y="96" width="150" height="72" rx="12" fill="none" stroke="#e03127" stroke-width="2" />
    <text x="115" y="124" text-anchor="middle" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">Systolic</text>
    <text x="115" y="144" text-anchor="middle" fill="var(--text)" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">Diastolic · Pulse</text>
    <line x1="190" y1="112" x2="300" y2="44" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="190" y1="132" x2="300" y2="104" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="190" y1="152" x2="300" y2="164" stroke="var(--line-2)" stroke-width="1.5" />
    <line x1="190" y1="160" x2="300" y2="224" stroke="var(--line-2)" stroke-width="1.5" />
    <rect x="300" y="26" width="380" height="40" rx="9" fill="none" stroke="#a78bfa" stroke-width="1.5" />
    <text x="314" y="51" fill="#a78bfa" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">Kérdő</text>
    <text x="392" y="51" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">autonomic balance</text>
    <rect x="300" y="86" width="380" height="40" rx="9" fill="none" stroke="#58c4f2" stroke-width="1.5" />
    <text x="314" y="111" fill="#58c4f2" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">Robinson</text>
    <text x="392" y="111" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">cardiac workload</text>
    <rect x="300" y="146" width="380" height="40" rx="9" fill="none" stroke="#22c55e" stroke-width="1.5" />
    <text x="314" y="171" fill="#22c55e" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">Kvas</text>
    <text x="392" y="171" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">circulatory efficiency</text>
    <rect x="300" y="206" width="380" height="40" rx="9" fill="none" stroke="#eab308" stroke-width="1.5" />
    <text x="314" y="231" fill="#eab308" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="13">BCE</text>
    <text x="392" y="231" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">circulation efficiency</text>
  </svg>
  <figcaption>Three measured numbers, four derived readouts. Each index reweights systolic, diastolic and pulse to expose a different facet of how your cardiovascular system is running.</figcaption>
</figure>

### Kérdő vegetative index: autonomic balance

**Kérdő = (1 − diastolic ÷ pulse) × 100**

The Kérdő index tries to read autonomic *balance* from a resting reading by comparing diastolic pressure against heart rate. The logic: when the sympathetic branch dominates, heart rate tends to run high relative to diastolic pressure, pushing the index positive; when the parasympathetic branch dominates, the opposite happens and it goes negative.

- **Near 0:** roughly balanced autonomic tone.
- **Positive:** sympathetic-leaning ("fight or flight" bias).
- **Negative:** parasympathetic-leaning ("rest and digest" bias).

It is the blood-pressure cousin of the HRV-derived balance measures. For the far more established version built from heart-rate variability, see the [PNS index, SNS index and stress index](/insights/basics/pns-index-sns-index-stress-index-explained/). Read the two together and they either agree, which is reassuring, or diverge, which is worth a closer look.

### Robinson index: the heart's workload

**Robinson = (systolic × pulse) ÷ 100**

Also called the **rate-pressure product** or **double product**, this is the closest thing on the list to a genuinely established measure. It estimates **myocardial oxygen demand** (how much work the heart muscle is doing) by multiplying the pressure it pumps against by how often it beats. At rest, a *lower* value means your heart is meeting the moment more efficiently. It climbs reliably with exertion, stress and stimulants, which is why it is used in exercise testing.

### Kvas index: circulatory efficiency

**Kvas = (10 × pulse) ÷ (systolic − diastolic) = 10 × HR ÷ pulse pressure**

The Kvas index divides heart rate by [pulse pressure](/insights/basics/mean-arterial-pressure-and-pulse-pressure/) (scaled by ten) to gauge how efficiently the circulation is moving blood. A high heart rate paired with a small pulse pressure (the heart beating fast but ejecting little per beat, a pattern that shows up in low-volume states like POTS) drives the index up. **Lower is better.** Because it divides by pulse pressure, it is undefined when systolic equals diastolic, so the calculator guards against that.

### BCE: blood circulation efficiency

**BCE = (systolic − diastolic) × pulse = pulse pressure × HR**

BCE multiplies pulse pressure by heart rate. It rises when the heart compensates for the work of circulation with more force per beat, more beats, or both. As with Kvas, **lower is better** at rest: a calm, efficient circulation produces a smaller product.

## How Autonomic grades the four indices

Three of these are graded lower-is-better and one, Kérdő, is U-shaped around zero (both strong sympathetic and strong parasympathetic dominance grade down).

**Kérdő index, U-shaped around 0:**

| Grade | Kérdő value |
| --- | --- |
| Excellent | −10 to 10 |
| Good | −20 to −11 (para) · 11 to 20 (symp) |
| Moderate | −30 to −21 (para) · 21 to 30 (symp) |
| Compromised | −45 to −31 (para) · 31 to 45 (symp) |
| Crash | below −45 · 46+ |

**Robinson index, lower is better:**

<div class="metric-scale">
  <span class="ms-seg" style="background:#54d98a">Excellent<small>&lt; 71</small></span>
  <span class="ms-seg" style="background:#22c55e">Good<small>71–80</small></span>
  <span class="ms-seg" style="background:#eab308">Moderate<small>81–90</small></span>
  <span class="ms-seg" style="background:#f97316">Compromised<small>91–100</small></span>
  <span class="ms-seg" style="background:#b91c1c">Crash<small>101+</small></span>
</div>

**Kvas index, lower is better:**

| Grade | Kvas value |
| --- | --- |
| Excellent | under 14 |
| Good | 14–16 |
| Moderate | 17–20 |
| Compromised | 21–25 |
| Crash | 26+ |

**BCE, lower is better:**

| Grade | BCE value |
| --- | --- |
| Excellent | under 2601 |
| Good | 2601–3000 |
| Moderate | 3001–3500 |
| Compromised | 3501–4000 |
| Crash | 4001+ |

Enter a full reading (systolic, diastolic and pulse) and the calculator computes and grades all four at once:

<div class="metric-calc" id="abp-calc">
  <p class="mc-head">Autonomic BP index calculator</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="abp-sys">Systolic (mmHg)</label>
      <input class="mc-input" id="abp-sys" type="number" inputmode="decimal" placeholder="e.g. 116" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="abp-dia">Diastolic (mmHg)</label>
      <input class="mc-input" id="abp-dia" type="number" inputmode="decimal" placeholder="e.g. 74" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="abp-pul">Pulse (bpm)</label>
      <input class="mc-input" id="abp-pul" type="number" inputmode="decimal" placeholder="e.g. 64" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="abp-kerdo-grade">Enter all three</span>
    <span class="mc-note" id="abp-kerdo-note">Kerdo = (1 - diastolic / pulse) x 100. Near 0 is balanced.</span>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="abp-rob-grade">-</span>
    <span class="mc-note" id="abp-rob-note">Robinson = systolic x pulse / 100. Lower is more efficient.</span>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="abp-kvas-grade">-</span>
    <span class="mc-note" id="abp-kvas-note">Kvas = 10 x pulse / (systolic - diastolic). Lower is better.</span>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="abp-bce-grade">-</span>
    <span class="mc-note" id="abp-bce-note">BCE = (systolic - diastolic) x pulse. Lower is better.</span>
  </div>
</div>

{@html abpScript}

## Reading them honestly

The temptation with a calculator like this is to fixate on one output and treat "Compromised" as a diagnosis. Resist it. These indices are coarse estimates built from a two-number cuff reading and a pulse. None of them measures autonomic tone or cardiac oxygen demand *directly*, and all of them move with the same everyday noise as your blood pressure itself: caffeine, a poor night, the time of day, how long you sat before measuring.

Where they earn their place is the **trend**. If your Robinson index at your usual morning reading drifts steadily upward over a fortnight, your heart is working harder at rest than it used to, a signal worth pairing with how you feel and what your [recovery arc](/insights/recovery/recovery-from-post-viral-dysautonomia/) is doing. If your Kérdő index swings persistently positive while your [HRV-based balance measures](/insights/basics/pns-index-sns-index-stress-index-explained/) also lean sympathetic, two independent windows are telling the same story, which is far more convincing than either alone.

<details class="prose-details">
  <summary><strong>Worked example: the same reading, read four ways</strong></summary>
  <p>Take a resting reading of 116/74 with a pulse of 64. Kérdő = (1 − 74/64) × 100 ≈ −16, mildly parasympathetic-leaning and graded Good: a calm, rested state. Robinson = 116 × 64 / 100 ≈ 74, a low resting workload, graded Good. Pulse pressure is 42, so Kvas = 640 / 42 ≈ 15, graded Good, and BCE = 42 × 64 ≈ 2688, graded Good. Four different formulas, one coherent picture: a relaxed, efficiently circulating system at rest. Now imagine a flare day reading of 104/72 with a pulse of 104: Kérdő jumps to about +31 (Compromised, strongly sympathetic), Robinson climbs to 108 (Crash), Kvas to 33 (Crash), BCE to 3328 (Moderate). The indices move together, and the shift (not the absolute numbers) is the message.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic does the math and the tracking.</strong> Every blood-pressure reading you log is turned into all four indices, graded, and charted over weeks alongside your HRV, heart rate and stand test, so you watch the trends instead of reaching for a calculator. <a href="/">See how it works →</a>
</div>

## The bottom line

The Kérdő, Robinson, Kvas and BCE indices extract extra meaning from a plain blood-pressure-and-pulse reading: Kérdő estimates autonomic balance (near zero is balanced, positive leans sympathetic, negative leans parasympathetic), Robinson estimates the heart's workload, and Kvas and BCE both gauge circulatory efficiency, where lower is better. They are older physiology tools rather than validated clinical tests, so read them modestly: as trend lines for your own data, cross-checked against your HRV and stand test, not as single-number verdicts. Tracked that way, four numbers you already own can add real texture to the recovery picture. For the raw pressures they are built from, start with [blood-pressure basics](/insights/basics/blood-pressure-basics-systolic-diastolic-pulse/) and the [MAP and pulse-pressure guide](/insights/basics/mean-arterial-pressure-and-pulse-pressure/).

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. These indices are not diagnostic tools; if your readings concern you or your symptoms are worsening, work with a clinician who can evaluate you properly.
</div>
