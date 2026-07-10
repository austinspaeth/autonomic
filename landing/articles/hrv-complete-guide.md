---
title: "HRV: The Complete Guide to Reading Your Nervous System"
slug: hrv-complete-guide
published: true
summary: "Heart rate variability is the single clearest at-home window into your autonomic nervous system. This is the complete guide: what RMSSD, SDNN, HF and LF actually mean, what moves them, how to measure well, and how to read the trend without spiraling."
description: "The complete guide to heart rate variability (HRV) for POTS, dysautonomia and long COVID recovery: RMSSD vs SDNN, HF and LF power, normal ranges, how to measure, what raises HRV, and how to read the trend."
keywords: "HRV, heart rate variability, RMSSD, SDNN, HF power, LF power, vagal tone, parasympathetic, how to improve HRV, HRV normal range, POTS, long COVID"
date: 2026-07-09
updated: 2026-07-09
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1719550371336-7bb64b5cacfa?q=80&w=1760&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
tldr: "HRV is the beat-to-beat variation in the time between heartbeats, and more of it usually means a better-regulated nervous system. The number worth watching daily is RMSSD (your parasympathetic 'recovery' signal); SDNN is a broader capacity measure. HRV is deeply personal, so ignore population 'normal' charts and track your own baseline. Measure the same way every morning, watch a 7–14 day trend, never react to one day, and use it as one input among heart rate and the stand test, not a grade on your worth."
categories:
  - hrv
  - recovery
faq:
  - q: "What is a good HRV number?"
    a: "There is no universal 'good' number: HRV varies enormously by age, genetics and measurement method, so two healthy people can differ by 5x. What matters is your own baseline and its direction over weeks. A rising personal trend is good news regardless of the absolute value; comparing yourself to population charts is mostly noise."
  - q: "What's the difference between RMSSD and SDNN?"
    a: "RMSSD reflects rapid beat-to-beat changes driven mainly by the parasympathetic (vagus) nerve; it's your day-to-day recovery signal. SDNN captures the overall spread of variability across a reading and blends both branches, a broader capacity measure. For daily tracking, RMSSD is usually the more useful number."
  - q: "Why is my HRV so low with POTS or long COVID?"
    a: "In POTS, dysautonomia and long COVID the autonomic nervous system is often biased toward sympathetic 'fight or flight' activation, which suppresses the parasympathetic tone that drives HRV. A lower HRV than before you got sick is common and expected; the goal isn't a textbook number, it's watching your own baseline climb back over time."
  - q: "How do I raise my HRV?"
    a: "The biggest levers are sleep, pacing to avoid overexertion, limiting alcohol, gentle consistent movement within your limits, hydration and electrolytes (especially in POTS), and slow breathing or coherence practice. But the honest answer is that in post-viral illness, HRV rises mostly as the underlying dysregulation heals; chasing the number directly is less useful than removing what suppresses it and tracking the trend."
  - q: "When should I measure HRV?"
    a: "First thing in the morning, before caffeine, ideally lying down or seated in the same position each day. Consistency of time, posture and method matters more than the specific device; an inconsistent measurement tells you almost nothing, no matter how accurate the sensor."
---

## What HRV actually is

Your heart is not a metronome. Even when it's beating at a steady 60 times a minute, the gap between one beat and the next is constantly shifting: a few milliseconds longer, a few shorter. That tiny, continuous variation is **heart rate variability (HRV)**, and counterintuitively, *more* of it is usually better.

The variation exists because of the tug-of-war we cover in the [autonomic nervous system guide](/insights/basics/autonomic-nervous-system-and-dysautonomia-guide/): the **parasympathetic** ("rest and digest") branch slows the heart and *increases* variability, while the **sympathetic** ("fight or flight") branch speeds it up and *decreases* it. High HRV means the calming, parasympathetic side is engaged and your system can respond flexibly. When HRV collapses, it usually means the sympathetic side has taken over.

<figure class="prose-figure">
  <svg viewBox="0 0 720 220" role="img" aria-label="Two rows of heartbeats showing high variability versus low variability in the gaps between beats">
    <text x="20" y="34" fill="#54d98a" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15">High HRV: flexible, well-regulated</text>
    <line x1="20" y1="70" x2="700" y2="70" stroke="var(--line)" stroke-width="1" />
    <g stroke="#54d98a" stroke-width="2.5" fill="none">
      <path d="M40 70 L40 44 M110 70 L110 44 M200 70 L200 44 M275 70 L275 44 M380 70 L380 44 M470 70 L470 44 M580 70 L580 44 M680 70 L680 44" />
    </g>
    <text x="70" y="88" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">920ms</text>
    <text x="150" y="88" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">1010ms</text>
    <text x="232" y="88" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">870ms</text>
    <text x="330" y="88" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">980ms</text>
    <text x="425" y="88" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">905ms</text>
    <text x="700" y="34" fill="#e03127" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="15" text-anchor="end">Low HRV: stuck "on"</text>
    <line x1="20" y1="175" x2="700" y2="175" stroke="var(--line)" stroke-width="1" />
    <g stroke="#e03127" stroke-width="2.5" fill="none">
      <path d="M40 175 L40 149 M115 175 L115 149 M192 175 L192 149 M270 175 L270 149 M348 175 L348 149 M426 175 L426 149 M504 175 L504 149 M582 175 L582 149 M660 175 L660 149" />
    </g>
    <text x="70" y="193" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">780ms</text>
    <text x="150" y="193" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">775ms</text>
    <text x="232" y="193" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">782ms</text>
    <text x="330" y="193" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">778ms</text>
    <text x="425" y="193" fill="var(--dim-2)" font-family="Space Mono, monospace" font-size="10">781ms</text>
  </svg>
  <figcaption>Same average heart rate, very different variability. HRV measures the spacing between beats, not the rate itself.</figcaption>
</figure>

The key insight from that figure: **two people can have the identical average heart rate and completely different HRV.** HRV isn't about how fast your heart beats; it's about how flexibly the spacing between beats changes. That flexibility is the thing that erodes in dysautonomia.

## The metrics worth knowing

You'll see a wall of HRV metrics across different apps and devices. Most of the weight sits on just a few. Here's what each actually tells you.

| Metric | What it measures | Driven by | Use it for |
| --- | --- | --- | --- |
| **RMSSD** | Rapid beat-to-beat change | Parasympathetic (vagus) | Your daily recovery signal: the one to watch |
| **SDNN** | Overall spread of variability | Both branches | Broader capacity over a longer reading |
| **HF power** | High-frequency variability | Parasympathetic | Confirms vagal tone; tracks with RMSSD |
| **LF power** | Low-frequency variability | Both (mixed) | Context, not a clean "stress" number |
| **pNN50** | % of beats differing 50ms+ | Parasympathetic | A more intuitive cousin of RMSSD |

A simple way to hold the two that matter most: **RMSSD is your recovery number; SDNN is your capacity number.**

<div class="callout callout-warn">
  <strong>Ignore the "LF/HF ratio as stress balance" myth.</strong> It's widely repeated and poorly supported. LF power is a mix of both branches, so the ratio doesn't cleanly measure "sympathetic vs parasympathetic." Anchor on RMSSD and its trend instead.
</div>

## Why there is no "normal" HRV

This is the most important thing to internalize, and the thing generic fitness apps get most wrong. **HRV is intensely individual.** It varies by age, genetics, fitness, and, enormously, by *how* it's measured. Two perfectly healthy people can differ by 5x. A number that's low for one person is a great day for another.

That means population "normal range" charts are close to useless for you. What's meaningful is:

- **Your own baseline**: where your HRV typically sits.
- **Your own trend**: which direction it's moving over 7 to 14 days.

<div class="callout callout-note">
  In POTS, dysautonomia and long COVID, HRV is often <em>lower</em> than it was before you got sick, because the system is biased toward sympathetic activation. That's expected. Recovery isn't hitting a universal target; it's watching <em>your</em> baseline slowly climb back toward where it used to be.
</div>

## How to measure HRV well

An inaccurate reading is bad; an *inconsistent* reading is worse, because you can't tell change from noise. Consistency beats precision.

1. **Same time, every day.** First thing in the morning is the gold standard: before you're on your feet, before caffeine, before the day's stressors.
2. **Same position.** Lying or seated, but pick one and keep it. Posture alone can swing HRV substantially.
3. **Same method.** A chest strap, a good ring, or a dedicated reading, whatever you use, use it the same way. Morning readings are more comparable than all-day averages.
4. **Long enough.** A 1–5 minute clean reading is far more reliable than a 30-second glance.
5. **Note the context.** Poor sleep, alcohol, a late meal, illness, or dehydration all move HRV. Logging them turns "why was it low?" into an answer.

## What actually moves HRV

Two categories: things that *suppress* it (remove these) and things that *support* it (build these). In post-viral illness especially, removing suppressors usually does more than chasing boosters.

| Lowers HRV | Raises HRV |
| --- | --- |
| Poor or short sleep | Consistent, sufficient sleep |
| Alcohol (even one drink) | Hydration + electrolytes |
| Overexertion / pushing past limits | Pacing within your energy envelope |
| Illness, inflammation | Gentle, consistent movement |
| Dehydration | Slow breathing / coherence practice |
| Late-night eating | A regular daily rhythm |

<div class="callout callout-tip">
  <strong>The honest truth about "raising" HRV:</strong> in dysautonomia, HRV climbs mostly as the underlying dysregulation heals. You can stack the deck (sleep, pacing, hydration, breathing), but the biggest driver is recovery itself. Which is exactly why <em>tracking</em> HRV beats <em>chasing</em> it.
</div>

## How to actually use it, without spiraling

HRV is noisy. A single low morning can be caused by a bad night, a late glass of wine, dehydration, or nothing you can identify. The mistake almost everyone makes is reacting to one data point and spiraling.

Do this instead:

1. **Watch the trend, not the day.** A 7-to-14-day moving direction tells you far more than this morning's number.
2. **Treat a low reading as information, not failure.** Low HRV after a hard day or a known trigger is your body reporting accurately; that's the system *working*.
3. **Never train, restrict, or panic off a single reading.** One number is weather; the trend is climate.
4. **Pair it with your other signals.** HRV alongside [resting heart rate and the stand test](/insights/pots/the-orthostatic-stand-test-at-home/) is far more informative than HRV alone.

This is exactly the gap the **Autonomic** app is built to close. It scores each reading against its zone, then shows the trend with a rolling baseline, so one rough morning never derails you, and a real upward trend is impossible to miss. We go deeper on turning these signals into decisions in [Recovery from post-viral dysautonomia](/insights/recovery/recovery-from-post-viral-dysautonomia/).

<div class="callout callout-tip">
  <strong>Track your HRV trend, privately.</strong> Autonomic scores your morning HRV against medical zones and charts the baseline over weeks: no account, no cloud, all on your iPhone. <a href="/">See how it works →</a>
</div>

## The bottom line

HRV is not a grade on your worth or even your effort. It's a window into how regulated your nervous system is on a given day, and, tracked patiently over weeks, one of the clearest signs your recovery is moving the right way. Learn your baseline, respect the trend, watch RMSSD, and let the single bad mornings go.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> HRV is an educational signal for tracking your own patterns, not a diagnostic tool. Discuss any health concerns with a qualified clinician.
</div>
