---
title: "Resonant Breathing & HRV Biofeedback: The 6-Breaths-a-Minute Protocol"
slug: resonant-breathing-hrv-biofeedback
published: true
summary: "Slowing your breath to about six breaths a minute is one of the few things that reliably raises HRV in real time. Here is the mechanism, a concrete protocol, and honest caveats for sensitive nervous systems."
description: "A practical guide to resonant (coherence) breathing and HRV biofeedback: why ~6 breaths per minute boosts vagal tone, a step-by-step protocol, and what the early long COVID evidence shows."
keywords: "resonant breathing, HRV biofeedback, coherence breathing, 6 breaths per minute, slow breathing vagus, baroreflex, long COVID breathing, paced breathing, vagal tone"
date: 2026-06-25
updated: 2026-06-25
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1522075782449-e45a34f1ddfb?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Sage Friedman / Unsplash"
tldr: "Breathing at roughly 5.5 to 6 breaths per minute (a slow inhale, a slightly longer exhale) synchronizes your heart rate with your breath and drives HRV up while you do it. Practiced 10 to 20 minutes once or twice a day, it is a gentle, low-cost way to nudge a stressed autonomic system toward balance. It is supportive, not curative, and a few people with dysautonomia feel air-hungry or lightheaded, so start short and stay seated."
categories:
  - hrv
  - recovery
  - research
faq:
  - q: "What is resonant breathing?"
    a: "Resonant breathing, also called coherence breathing, is slow, even breathing at roughly five to six breaths per minute. At that pace your heart rate rises on the inhale and falls on the exhale in a large, smooth wave, which maximizes the natural coupling between your breath, blood pressure and heart rate. The practical effect is a temporary, measurable rise in heart rate variability."
  - q: "How many breaths per minute is best for HRV?"
    a: "For most adults the sweet spot sits between about 5.5 and 6.5 breaths per minute, often written as ~6. That usually means an inhale of around 4 to 5 seconds and an exhale of around 5 to 6 seconds. Each person has a slightly different 'resonance frequency,' so it is fine to experiment within that range and settle on the pace that feels smoothest and produces the biggest, calmest heart-rate wave."
  - q: "Does HRV biofeedback work for Long COVID?"
    a: "The evidence is early but encouraging. Small feasibility and pilot studies in people with long COVID and post-viral dysautonomia have found slow-paced breathing and HRV biofeedback to be well tolerated and associated with improvements in symptoms and wellbeing. These are not large randomized trials, so treat it as a promising, low-risk support rather than a proven treatment."
  - q: "How long until breathing improves my HRV?"
    a: "You will usually see HRV rise during a session almost immediately: that within-session lift is the point of the practice. Lasting changes to your resting baseline, if they come, tend to build over weeks of near-daily practice. As with everything in recovery, watch the trend over weeks rather than judging a single day."
---

Of all the things people try to raise heart rate variability, slow breathing is the one with the most direct, measurable effect: you can often watch your HRV climb in real time as you do it. This is the mechanism behind resonant breathing and HRV biofeedback, and it is refreshingly simple to start.

## What resonant breathing actually is

Resonant breathing, also called **coherence breathing** or paced breathing, means slowing your breath to about **5.5 to 6 breaths per minute**. That is far slower than the 12 to 18 breaths a minute most of us default to. Each breath becomes long and even: a slow inhale, a slightly longer exhale, through the nose, with a relaxed belly.

At that pace, something striking happens. Your heart rate rises smoothly on each inhale and falls on each exhale, tracing a big, regular wave. Breath, heart rate and blood pressure fall into step, the "coherence" the name refers to. And because HRV is literally the beat-to-beat variation in your heart rate, that large wave shows up as a sharp, temporary jump in HRV.

<figure class="prose-figure">
  <svg viewBox="0 0 720 240" role="img" aria-label="A breathing pacer wave rising for about four seconds on the inhale and falling for about six seconds on the exhale, repeating at roughly six breaths per minute.">
    <defs>
      <linearGradient id="rb-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <!-- baseline -->
    <line x1="40" y1="180" x2="700" y2="180" stroke="var(--line)" stroke-width="1"/>
    <!-- filled wave: two full cycles, ~4s up / ~6s down each -->
    <path d="M40 180
             C64 60, 96 60, 120 60
             C156 60, 216 180, 240 180
             C264 60, 296 60, 320 60
             C356 60, 416 180, 440 180
             C464 60, 496 60, 520 60
             C556 60, 616 180, 640 180
             L640 180 L40 180 Z"
          fill="url(#rb-fill)"/>
    <path d="M40 180
             C64 60, 96 60, 120 60
             C156 60, 216 180, 240 180
             C264 60, 296 60, 320 60
             C356 60, 416 180, 440 180
             C464 60, 496 60, 520 60
             C556 60, 616 180, 640 180"
          fill="none" stroke="#38bdf8" stroke-width="2.5"/>
    <!-- inhale/exhale labels for first cycle -->
    <text x="90" y="46" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="15" fill="var(--dim-2)">inhale</text>
    <text x="90" y="30" text-anchor="middle" font-family="Space Mono, monospace" font-size="13" fill="#38bdf8">~4s</text>
    <text x="185" y="210" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="15" fill="var(--dim-2)">exhale</text>
    <text x="185" y="226" text-anchor="middle" font-family="Space Mono, monospace" font-size="13" fill="#54d98a">~6s</text>
    <!-- one full breath bracket -->
    <line x1="40" y1="200" x2="240" y2="200" stroke="var(--line)" stroke-width="1"/>
    <text x="140" y="232" text-anchor="middle" font-family="Space Mono, monospace" font-size="12" fill="var(--dim-2)">one breath ≈ 10s → 6 / min</text>
  </svg>
  <figcaption>A resonant-breathing pacer: rise gently for about four seconds on the inhale, then let the exhale trail down for about six. One 10-second breath, repeated, is roughly six breaths a minute.</figcaption>
</figure>

## Why it drives HRV up

The engine underneath is the **baroreflex**, the loop your body uses to keep blood pressure stable. When you breathe slowly, small swings in blood pressure and the breath-driven rise and fall of heart rate line up in phase. Around six breaths a minute, they reinforce each other most strongly. That is your "resonance frequency," and hitting it maximizes baroreflex gain.

A stronger baroreflex means more parasympathetic (vagal) engagement on each beat, and vagal activity is exactly what produces high HRV. So resonant breathing is not a trick that fakes a good number. It genuinely recruits the "rest and digest" side of your nervous system, the same branch that tends to be suppressed in POTS, dysautonomia and long COVID.

This is why breathing shows up again and again in the [things that actually move HRV](/insights/hrv/how-to-improve-hrv-what-works/), and why it fits neatly alongside the broader picture in the [complete guide to HRV](/insights/hrv/hrv-complete-guide/).

<div class="callout callout-note">
Resonant breathing raises HRV <strong>while you do it</strong>, and often for a while afterward. Whether it lifts your resting baseline over time is a longer game, one measured in weeks of near-daily practice, not single sessions.
</div>

## A simple protocol you can start today

You do not need any equipment to begin. The pace is the whole practice.

1. Sit comfortably, or lie down if standing is hard for you. Let your shoulders drop.
2. Breathe **in through the nose for about 4 seconds**, letting your belly expand rather than your chest.
3. Breathe **out for about 6 seconds**, slow and unforced, a soft, long exhale.
4. Keep it smooth and quiet. No breath-holding, no straining for a "deep" breath.
5. Continue for **10 to 20 minutes, once or twice a day**.

The exact numbers are a starting point, not a rule. Some people resonate closer to 5.5 breaths a minute, some closer to 6.5. Nudge the inhale and exhale a second in either direction and settle on the rhythm that feels effortless and produces the biggest, calmest wave.

## What HRV biofeedback adds

Paced breathing on its own is powerful. **HRV biofeedback** adds a live signal: a heart-rate trace or coherence score that moves as you breathe, so you can *see* the wave grow and shrink and tune your pace to make it as large and smooth as possible.

That feedback loop is the difference between guessing and training. Instead of hoping you are at your resonance frequency, you watch the display and let it teach you where your own breath and heart lock together. Over sessions, you learn the pace by feel and eventually need the screen less.

| | Paced breathing alone | Full HRV biofeedback |
| --- | --- | --- |
| **Equipment** | None (a timer or the pacer above) | A heart-rate sensor + display |
| **What you steer by** | The clock and how it feels | A live HRV / coherence signal |
| **Main benefit** | Simple, always available | Finds and reinforces *your* resonance |
| **Best for** | Getting started, daily practice | Dialing in the pace, staying motivated |

## Honest caveats for sensitive nervous systems

This is gentle, but it is not automatically easy for everyone with dysautonomia. Deliberately slowing the breath can trigger **air hunger** (a feeling that you are not getting enough air) or **lightheadedness**, especially early on or if you push the exhale too long.

If that happens, it does not mean you are doing it wrong or that the practice is off-limits. It usually means start smaller: shorten the session to two or three minutes, ease the ratio closer to even (4 seconds in, 4 out), and always stay seated or lying down until you know how you respond. Build from there.

<div class="callout callout-warn">
<strong>Start short and stay seated.</strong> If slow breathing makes you dizzy, breathless or air-hungry, stop, breathe normally and try a gentler pace another time. This is meant to calm your system, not fight it.
</div>

## What the evidence actually says

The research is early but genuinely promising, and much of the recent interest comes from post-viral illness. A feasibility study of HRV-biofeedback breathing in people with long COVID dysautonomia (the [HEARTLOC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10826406/)) found the approach practical and well tolerated in a population that is often hard to treat. A separate pilot reported that [resonant breathing improved symptoms and wellbeing in long COVID](https://www.medrxiv.org/content/10.1101/2024.03.25.24304856). And work on [HRV during deep breathing in long COVID](https://www.nature.com/articles/s41598-023-50276-0) has documented the autonomic dysregulation these practices aim to nudge.

None of these are large randomized trials, so the honest framing is: low-risk, biologically plausible, and encouraging, a support worth trying, not a cure. It sits well alongside the rest of a recovery toolkit, from [pacing within your energy envelope](/insights/recovery/pacing-101-energy-envelope/) to the broader arc of [recovering from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/). If you want the deeper dive on the science specifically, see [does HRV biofeedback work for long COVID](/insights/research/does-hrv-biofeedback-work-long-covid/).

## How Autonomic helps

Because resonant breathing's effect shows up in HRV, it is a practice you can actually measure. Take a short HRV reading before a session and another after, or watch your morning baseline across a few weeks of daily practice, that is where a subtle, real change becomes visible.

<div class="callout callout-tip">
<strong>Watch the trend, not the day.</strong> Log an HRV reading before and after breathing sessions in Autonomic and let it chart the change over weeks. It is all on-device and private, <a href="/">see how it works</a>.
</div>

## The bottom line

Resonant breathing at around six breaths a minute is one of the simplest, best-supported ways to engage the calming side of your nervous system, and its effect is visible in your HRV as it happens. Practice it gently, respect the caveats, and judge it, like everything in recovery, by the trend over weeks rather than any single session.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and not a substitute
  for personalized care. <em>Stop any breathing exercise that causes dizziness, breathlessness or air hunger, and remember that resonant breathing is a supportive practice, not a treatment for POTS, long COVID or any other condition.</em> Talk with a qualified
  clinician before making changes to medication, diet or exercise.
</div>
