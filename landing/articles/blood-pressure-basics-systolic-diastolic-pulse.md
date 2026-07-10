---
title: "Blood Pressure Basics: Systolic, Diastolic & Pulse"
slug: blood-pressure-basics-systolic-diastolic-pulse
published: true
summary: "The three numbers on a blood-pressure reading each tell a different story: systolic is the peak as your heart contracts, diastolic is the resting pressure between beats, and pulse is how fast it all repeats. Here is what each one means and how a recovery-focused reading differs from the clinical chart."
description: "What systolic, diastolic and pulse pressure mean, the AHA blood pressure categories, and why low readings matter in POTS and orthostatic intolerance recovery."
keywords: "blood pressure basics, systolic, diastolic, pulse, what is systolic, what is diastolic, blood pressure chart, AHA blood pressure, low blood pressure POTS, orthostatic intolerance"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1723764881665-5b40cea01c9b?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Alex Moliski / Unsplash"
tldr: "A blood-pressure reading has three numbers. Systolic (the top) is the peak pressure as your heart contracts; diastolic (the bottom) is the resting pressure between beats; pulse is how many times that cycle repeats per minute. The AHA calls under 120/80 normal, but recovery tracking uses a tighter optimum band, and it treats low readings as meaningful too, because in POTS and orthostatic intolerance the problem is often too little pressure and pooling blood, not too much. Track your own numbers over weeks rather than chasing a single ideal."
categories:
  - basics
faq:
  - q: "What is a good blood pressure?"
    a: "Clinically, the American Heart Association calls anything under 120/80 mmHg normal. For recovery tracking the app aims tighter, treating a systolic around 108 to 118 and a diastolic around 65 to 78 as the optimum band. But the most useful target is your own stable baseline, read over weeks, rather than any single ideal number."
  - q: "Is low blood pressure bad, especially in POTS?"
    a: "It can matter more than high blood pressure in this context. Standard medicine often ignores low readings unless you have symptoms, but in POTS and orthostatic intolerance, low pressure and blood pooling in the legs are frequently part of the problem. A reading that drops when you stand, or a chronically low baseline with dizziness and fatigue, is worth tracking and discussing with a clinician."
  - q: "What is the difference between systolic and diastolic?"
    a: "Systolic, the top number, is the peak pressure in your arteries during the instant your heart contracts and pushes blood out. Diastolic, the bottom number, is the lower resting pressure between beats while the heart refills. Both matter: systolic reflects the force of each ejection, diastolic reflects the baseline load your vessels carry all the time."
  - q: "What is the AHA blood pressure chart?"
    a: "The 2017 ACC/AHA guideline sorts readings into: Normal (under 120 and under 80), Elevated (120 to 129 and under 80), Stage 1 Hypertension (130 to 139 or 80 to 89), and Stage 2 Hypertension (140 or higher, or 90 or higher). A reading above 180/120 is a hypertensive crisis needing urgent care."
---

<script>
  // Injected verbatim into the prerendered HTML via {@html} below. With csr off,
  // this raw script is what makes the in-article calculator run in the browser.
  const bpScript = `<script>
(function () {
  var sys = document.getElementById('bp-sys');
  var dia = document.getElementById('bp-dia');
  if (!sys || !dia) return;
  var appGrade = document.getElementById('bp-app-grade');
  var appNote = document.getElementById('bp-app-note');
  var ahaGrade = document.getElementById('bp-aha-grade');
  var ahaNote = document.getElementById('bp-aha-note');
  var card = document.getElementById('bp-calc');
  function sysBand(n) {
    if (n >= 150) return [1, 'Crash', '#b91c1c'];
    if (n >= 136) return [2, 'Compromised', '#f97316'];
    if (n >= 129) return [3, 'Moderate', '#eab308'];
    if (n >= 119) return [4, 'Good', '#22c55e'];
    if (n >= 108) return [5, 'Excellent', '#54d98a'];
    if (n >= 100) return [3, 'Moderate', '#eab308'];
    return [2, 'Compromised', '#f97316'];
  }
  function diaBand(n) {
    if (n >= 95) return [1, 'Crash', '#b91c1c'];
    if (n >= 88) return [2, 'Compromised', '#f97316'];
    if (n >= 83) return [3, 'Moderate', '#eab308'];
    if (n >= 79) return [4, 'Good', '#22c55e'];
    if (n >= 65) return [5, 'Excellent', '#54d98a'];
    if (n >= 60) return [3, 'Moderate', '#eab308'];
    return [2, 'Compromised', '#f97316'];
  }
  function aha(s, d) {
    if (s >= 180 || d >= 120) return ['Hypertensive crisis', '#b91c1c', 'Above 180/120: seek urgent care.'];
    if (s >= 140 || d >= 90) return ['Stage 2 Hypertension', '#ef4444', 'Systolic 140+ or diastolic 90+.'];
    if (s >= 130 || d >= 80) return ['Stage 1 Hypertension', '#f97316', 'Systolic 130 to 139 or diastolic 80 to 89.'];
    if (s >= 120) return ['Elevated', '#eab308', 'Systolic 120 to 129 with diastolic under 80.'];
    return ['Normal', '#54d98a', 'Under 120 and under 80.'];
  }
  function reset() {
    appGrade.textContent = 'Enter both numbers';
    appGrade.style.color = '';
    appNote.textContent = 'The app grade is the worse of your systolic and diastolic grades.';
    ahaGrade.textContent = '';
    ahaGrade.style.color = '';
    ahaNote.textContent = 'The clinical AHA category, for context.';
    if (card) card.style.setProperty('--mc-accent', 'var(--line-2)');
  }
  function update() {
    var s = parseFloat(sys.value);
    var d = parseFloat(dia.value);
    if (isNaN(s) || isNaN(d)) { reset(); return; }
    var sb = sysBand(s);
    var db = diaBand(d);
    var worse = sb[0] <= db[0] ? sb : db;
    appGrade.textContent = worse[1];
    appGrade.style.color = worse[2];
    var driver = sb[0] < db[0] ? 'systolic is the weaker side' : (db[0] < sb[0] ? 'diastolic is the weaker side' : 'both sides agree');
    appNote.textContent = 'Recovery grade for ' + s + '/' + d + ' mmHg, ' + driver + '.';
    var a = aha(s, d);
    ahaGrade.textContent = a[0];
    ahaGrade.style.color = a[1];
    ahaNote.textContent = a[2];
    if (card) card.style.setProperty('--mc-accent', worse[2]);
  }
  sys.addEventListener('input', update);
  dia.addEventListener('input', update);
  reset();
})();
<\/script>`;
</script>

## Three numbers, three different questions

Every blood-pressure reading hands you a little story in three parts. Most people glance at the top number, decide it looks "fine," and move on. But each figure answers a genuinely different question about how your circulation is working, and when you are recovering from [POTS, long COVID or dysautonomia](/insights/postviral/pots-long-covid-and-mcas-overlap/), the differences between them are exactly where the useful signal lives.

A cuff reading looks like **118/76**, sometimes with a small heart on the display showing **64**. Read left to right, that is:

- **Systolic (118):** the *peak* pressure in your arteries during the split second your heart contracts and ejects blood.
- **Diastolic (76):** the *resting* pressure between beats, while the heart relaxes and refills.
- **Pulse (64):** how many times per minute that whole cycle repeats.

The first two are pressures, measured in millimeters of mercury (mmHg). The third is a rate, the same thing as your [resting heart rate](/insights/basics/resting-heart-rate-and-mean-rr/). Together they describe both how hard your circulation is pushing and how often.

## Systolic: the peak of the push

Each time your heart's main pumping chamber squeezes, it forces a bolus of blood into the aorta and the pressure in your arteries spikes. **Systolic pressure is the height of that spike.** It reflects the force of each ejection and how stiff or springy your large arteries are as they absorb it.

A systolic number that runs high means your heart is working against more resistance or your vessels have stiffened. A systolic number that runs low (common in slim, well-conditioned people, but also in dehydration and in the blood-volume problems that shadow POTS) means each beat is delivering a gentler push. Neither extreme is automatically good or bad; context is everything.

## Diastolic: the pressure that never lets up

Between beats, your heart relaxes and refills, but your arteries do not empty. They stay under pressure, and **diastolic is that baseline load**: the pressure your vessels carry every second of every day, even at rest. Because diastole (the resting phase) lasts roughly twice as long as systole, this lower number is doing a lot of quiet work keeping your organs perfused.

A low diastolic can mean your arteries are relaxed and elastic, which is often healthy, but a *very* low diastolic can leave the heart's own blood supply short, since the heart muscle is fed mostly during diastole. A high diastolic points to vessels that stay tense between beats.

<figure class="prose-figure">
  <svg viewBox="0 0 720 280" role="img" aria-label="One arterial pressure waveform showing the systolic peak as the heart contracts and the diastolic trough as it rests between beats">
    <line x1="60" y1="40" x2="60" y2="240" stroke="var(--line-2)" stroke-width="1" />
    <line x1="60" y1="240" x2="700" y2="240" stroke="var(--line-2)" stroke-width="1" />
    <line x1="60" y1="72" x2="700" y2="72" stroke="#e03127" stroke-width="1" stroke-dasharray="4 4" opacity="0.55" />
    <line x1="60" y1="196" x2="700" y2="196" stroke="#58c4f2" stroke-width="1" stroke-dasharray="4 4" opacity="0.65" />
    <path d="M 60 196 C 95 196 105 74 138 72 C 165 71 172 130 190 140 C 200 146 210 132 224 140 C 262 162 340 196 400 196 C 435 196 445 74 478 72 C 505 71 512 130 530 140 C 540 146 550 132 564 140 C 602 162 660 196 700 196" fill="none" stroke="var(--text)" stroke-width="2.5" />
    <circle cx="138" cy="72" r="5" fill="#e03127" />
    <circle cx="400" cy="196" r="5" fill="#58c4f2" />
    <text x="150" y="60" fill="#e03127" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">Systolic, heart contracts</text>
    <text x="410" y="220" fill="#58c4f2" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="14">Diastolic, resting between beats</text>
    <text x="705" y="68" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">peak</text>
    <text x="705" y="192" text-anchor="end" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">trough</text>
    <text x="230" y="262" fill="var(--dim)" font-family="Space Mono, monospace" font-size="11">one beat</text>
    <line x1="138" y1="250" x2="478" y2="250" stroke="var(--dim)" stroke-width="1" />
    <text x="308" y="248" text-anchor="middle" fill="var(--dim)" font-family="Space Mono, monospace" font-size="10">pulse = beats per minute</text>
  </svg>
  <figcaption>One cardiac cycle. The curve climbs to the systolic peak as the heart contracts, then falls to the diastolic trough as it refills. How often this repeats is your pulse.</figcaption>
</figure>

## Pulse: how often the cycle repeats

The third number is simply your heart rate at the moment of measurement. It is not a pressure at all, but it belongs on the same reading because pressure and rate are constantly traded off against each other. When blood volume drops or you stand up and blood pools in your legs, the body often defends its pressure by speeding the heart, which is the exact mechanism behind the tachycardia in POTS. That is why the [orthostatic stand test](/insights/pots/the-orthostatic-stand-test-at-home/) watches heart rate and blood pressure together rather than either one alone.

The gap between systolic and diastolic (the **pulse pressure**) and the average across the whole cycle (the **mean arterial pressure**) each carry extra meaning of their own, enough that they get [their own article](/insights/basics/mean-arterial-pressure-and-pulse-pressure/).

## The clinical chart, for context

The most widely used reference is the <a href="https://www.ahajournals.org/doi/10.1161/HYP.0000000000000065" target="_blank" rel="noopener">2017 ACC/AHA blood pressure guideline</a>, which sorts readings into categories built around the risk of *high* pressure over time:

| AHA category | Systolic (mmHg) | | Diastolic (mmHg) |
| --- | --- | --- | --- |
| Normal | under 120 | and | under 80 |
| Elevated | 120–129 | and | under 80 |
| Stage 1 Hypertension | 130–139 | or | 80–89 |
| Stage 2 Hypertension | 140+ | or | 90+ |

<div class="callout callout-note">
  <strong>The clinical chart only looks upward.</strong> Notice there is no "too low" row. Standard hypertension guidance is built to catch pressure that is dangerously high, and it largely ignores low readings unless you have symptoms. For someone recovering from dysautonomia, that blind spot is the whole problem: low pressure is often the story.
</div>

## Why recovery tracking uses a tighter, two-sided band

Autonomic grades blood pressure against a **recovery optimum** that is narrower than "normal" and, crucially, treats both directions as meaningful. The bands are U-shaped: there is a sweet spot in the middle, and drifting too low is graded down just as drifting too high is. That reflects the reality of orthostatic intolerance, where a chronically low baseline, a big drop on standing, or blood pooling in the legs can leave your brain under-perfused even when a clinician would call the number "fine."

**Systolic recovery grade bands:**

| Grade | Reading (mmHg) |
| --- | --- |
| Excellent | 108–118 |
| Good | 119–128 |
| Moderate | 100–107 (low) · 129–135 (high) |
| Compromised | under 100 (low) · 136–149 (high) |
| Crash | 150+ |

**Diastolic recovery grade bands:**

| Grade | Reading (mmHg) |
| --- | --- |
| Excellent | 65–78 |
| Good | 79–82 |
| Moderate | 60–64 (low) · 83–87 (high) |
| Compromised | under 60 (low) · 88–94 (high) |
| Crash | 95+ |

Your overall blood-pressure grade in the app is simply the **worse of the two**, if your systolic lands in Good but your diastolic slips to Moderate, the reading grades as Moderate. That keeps a weak side from hiding behind a strong one. If you want the wider picture of how single-metric grades roll up into one score, see [the autonomic score and grade bands](/insights/basics/the-autonomic-score-and-grade-bands/).

Enter a reading to see both the recovery grade and the AHA category side by side:

<div class="metric-calc" id="bp-calc">
  <p class="mc-head">Blood pressure classifier</p>
  <div class="mc-row">
    <div class="mc-field">
      <label class="mc-label" for="bp-sys">Systolic (mmHg)</label>
      <input class="mc-input" id="bp-sys" type="number" inputmode="decimal" placeholder="e.g. 116" />
    </div>
    <div class="mc-field">
      <label class="mc-label" for="bp-dia">Diastolic (mmHg)</label>
      <input class="mc-input" id="bp-dia" type="number" inputmode="decimal" placeholder="e.g. 74" />
    </div>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="bp-app-grade">Enter both numbers</span>
    <span class="mc-note" id="bp-app-note">The app grade is the worse of your systolic and diastolic grades.</span>
  </div>
  <div class="mc-out">
    <span class="mc-grade" id="bp-aha-grade"></span>
    <span class="mc-note" id="bp-aha-note">The clinical AHA category, for context.</span>
  </div>
</div>

{@html bpScript}

## Low blood pressure and the POTS connection

For most of medicine, "watch your blood pressure" means watch it stay *down*. In the world of [POTS and orthostatic intolerance](/insights/postviral/pots-long-covid-and-mcas-overlap/), the opposite worry is usually more relevant. Many people with post-viral dysautonomia run low blood volume; when they stand, gravity pulls blood into the legs and abdomen faster than the autonomic system can clamp the vessels down, so pressure to the brain sags and the heart races to compensate. The result is the familiar cluster: lightheadedness, a pounding heart, tunnel vision, fatigue.

A single low reading on the couch is rarely a crisis. What matters is the *pattern*: is your resting pressure trending downward over weeks, does it fall sharply when you stand, and does that line up with how you feel? Those are questions a trend answers and a snapshot cannot. As <a href="https://www.dysautonomiainternational.org/page.php?ID=30" target="_blank" rel="noopener">Dysautonomia International</a> outlines, orthostatic intolerance is defined by what happens to your circulation *on standing*, which is why posture-matched, repeated readings beat any one number.

<details class="prose-details">
  <summary><strong>Worked example: two "normal" readings that are not the same</strong></summary>
  <p>Person A reads 116/75 sitting and 112/74 after three minutes of standing, with a pulse that rises from 68 to 78. Person B reads 104/66 sitting and 92/60 standing, with a pulse that jumps from 74 to 116. A clinic glancing at either resting number might wave both through as "normal-ish." But B is showing a real orthostatic pattern (pressure sagging, heart rate leaping to defend it) that A is not. The recovery bands grade B's standing numbers as Compromised and flag the heart-rate jump, surfacing a problem the raw sitting value hides. Same "normal," very different circulation.</p>
</details>

<div class="callout callout-tip">
  <strong>Autonomic tracks all three together.</strong> Log a blood-pressure reading and the app grades systolic, diastolic and pulse against the recovery bands, charts them over weeks, and lines them up next to your HRV and stand test, so a low reading that matters stands out instead of getting waved through. <a href="/">See how it works →</a>
</div>

## The bottom line

Systolic is the peak of each heartbeat's push, diastolic is the steady pressure your arteries hold between beats, and pulse is how often the cycle repeats. The AHA chart is built to catch pressure that climbs too high, but recovery from POTS and dysautonomia usually turns on the opposite worry, pressure that runs too low or sags on standing, so the app grades a tighter, two-sided band and treats the worse of your two pressures as the reading. Track your own three numbers the same way over weeks, watch them alongside your heart rate and stand test, and the pattern will tell you far more than any single "normal" ever could.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and meant to help you understand and track your own data, not to diagnose or treat any condition. Blood-pressure readings that concern you, or symptoms that are worsening, deserve evaluation by a clinician who can examine you properly.
</div>
