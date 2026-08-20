---
title: "How Autonomic Scores Your Readings Against Medical Thresholds"
slug: how-autonomic-scores-your-readings
published: true
summary: "A raw HRV or heart-rate number means almost nothing on its own. Here is how Autonomic turns each reading into a grade zone, scored against recovery-relevant thresholds and your own rolling baseline."
description: "How Autonomic scores health readings against medical thresholds and a personal rolling baseline, using grade zones to make HRV, heart rate and stand tests legible at a glance."
keywords: "how to interpret HRV, health reading scores, medical thresholds, rolling baseline, HRV zones, reading grading, personal baseline vs population average, autonomic recovery"
date: 2026-06-02
updated: 2026-06-02
author: "Austin Spaeth"
photoLocation: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1760&auto=format&fit=crop"
photoAttribution: "Luke Chesser / Unsplash"
tldr: "A single HRV or heart-rate value is meaningless without context, and population 'normal' charts often mislead people who are ill. Autonomic scores each reading into grade zones (great, good, ok, bad, crash, plus a cautionary warning band) against recovery-relevant medical thresholds, then charts it against your own rolling baseline so today is judged against your recent normal. The direction of your baseline matters more than any single number."
categories:
  - app
  - hrv
faq:
  - q: "What does it mean to score a reading against medical thresholds?"
    a: "It means each number is compared to the ranges clinicians and researchers actually use to interpret that metric, rather than left as a bare figure. Autonomic sorts a reading into a grade zone (great, good, ok, bad or crash, with a cautionary warning band) so you can see at a glance whether it sits in a healthy range or one worth noticing. The thresholds are educational reference points, not a diagnosis."
  - q: "What is a rolling baseline?"
    a: "A rolling baseline is a moving average of your own recent readings, usually over the last week or two, that represents your current normal. Today's number is compared to that personal baseline instead of a textbook figure, so a reading that is fine for the general population but low for you still shows up. As you recover, the baseline itself shifts, and its direction is the real signal."
  - q: "Why not just compare my HRV to normal ranges?"
    a: "Population normal ranges are built from large, mostly healthy groups and vary enormously by age, sex, fitness and measurement method. If you have POTS, dysautonomia or long COVID, your HRV can sit well below the population average while still improving week over week. Comparing to your own baseline captures that progress; comparing to a generic chart often just tells you that you are ill, which you already know."
  - q: "Does Autonomic diagnose anything?"
    a: "No. Autonomic is an educational tracking tool, not a medical device. Its grade zones and thresholds are designed to help you notice patterns and have better conversations with your clinician, not to diagnose or rule out any condition. Any concerning or persistent finding should be discussed with a qualified professional."
---

Open a fitness app and you will see a number: an HRV of 34, a resting heart rate of 72. On its own, that number tells you almost nothing. Is 34 good? Good for whom, on what day, compared to what? This is the problem Autonomic is built to solve: turning a raw reading into something you can actually act on.

## The problem with raw numbers and "normal" charts

A single measurement is a snapshot with no context. Heart rate variability in particular is famously noisy; it moves with sleep, hydration, alcohol, a late meal, the time of day, even the position you were sitting in. One low morning tells you very little, and one high morning is not a victory.

The usual fix, comparing your number to a population "normal" range, is worse than it looks. Those ranges are averaged across large, mostly healthy groups and swing widely by age, sex and fitness. If you are recovering from POTS or long COVID, your readings can sit well below the population average for months while still climbing steadily. HRV is deeply personal, and in illness the relationship between an individual and the population average [breaks down further still](https://www.nature.com/articles/s41598-023-50276-0). A chart that keeps telling you that you are "below normal" is not information. It is just discouraging.

<div class="callout callout-note">
The core idea running through this whole app: <strong>track trends, not days</strong>. A number is only meaningful next to your own recent history and the direction it is heading.
</div>

## What Autonomic does instead: grade zones

Rather than hand you a bare figure, Autonomic scores each reading into a **grade zone**. Every scorable metric is sorted into one of five bands, with an extra cautionary band layered in:

| Zone | What it signals |
| --- | --- |
| **Great** | Comfortably in a healthy range for this metric. |
| **Good** | Solid; a normal, unremarkable reading. |
| **Ok** | Middle ground. Neither a win nor a worry. |
| **Bad** | Outside the comfortable range; worth noticing. |
| **Crash** | Well outside range (or "concerning" for clinical metrics). |
| **Warning** | A cautionary blue band flagging a value that needs context, not necessarily a bad one. |

The value in each row is tinted by its zone, so a good morning reads green and a rough one reads red before you have parsed a single digit. The point is not to grade your worth or your effort. It is to make a wall of numbers legible in a second.

<figure class="prose-figure">
  <svg class="fig-d" viewBox="0 0 720 210" role="img" aria-label="A horizontal scale of five grade zones from crash to great, with a reading dot placed in the good zone.">
    <rect x="40" y="70" width="128" height="34" fill="#e03127" opacity="0.85"/>
    <rect x="168" y="70" width="128" height="34" fill="#f5a524" opacity="0.85"/>
    <rect x="296" y="70" width="128" height="34" fill="var(--dim-2)" opacity="0.55"/>
    <rect x="424" y="70" width="128" height="34" fill="#54d98a" opacity="0.7"/>
    <rect x="552" y="70" width="128" height="34" fill="#54d98a" opacity="0.95"/>
    <text x="104" y="128" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="14">crash</text>
    <text x="232" y="128" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="14">bad</text>
    <text x="360" y="128" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="14">ok</text>
    <text x="488" y="128" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="14">good</text>
    <text x="616" y="128" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="14">great</text>
    <circle cx="488" cy="87" r="13" fill="var(--accent)" stroke="#fff" stroke-width="3"/>
    <text x="488" y="55" text-anchor="middle" fill="var(--accent)" font-family="Space Mono, monospace" font-size="15">HRV 34</text>
    <text x="40" y="175" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="13">Lower for this metric</text>
    <text x="680" y="175" text-anchor="end" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="13">Higher for this metric</text>
  </svg>
  <svg class="fig-m" viewBox="0 0 360 176" role="img" aria-label="A horizontal scale of five grade zones from crash to great, with a reading dot placed in the good zone.">
    <rect x="20" y="70" width="62" height="34" fill="#e03127" opacity="0.85"/>
    <rect x="82" y="70" width="62" height="34" fill="#f5a524" opacity="0.85"/>
    <rect x="144" y="70" width="62" height="34" fill="var(--dim-2)" opacity="0.55"/>
    <rect x="206" y="70" width="62" height="34" fill="#54d98a" opacity="0.7"/>
    <rect x="268" y="70" width="62" height="34" fill="#54d98a" opacity="0.95"/>
    <text x="51" y="122" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="12">crash</text>
    <text x="113" y="122" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="12">bad</text>
    <text x="175" y="122" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="12">ok</text>
    <text x="237" y="122" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="12">good</text>
    <text x="299" y="122" text-anchor="middle" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="12">great</text>
    <circle cx="237" cy="87" r="12" fill="var(--accent)" stroke="#fff" stroke-width="3"/>
    <text x="237" y="52" text-anchor="middle" fill="var(--accent)" font-family="Space Mono, monospace" font-size="14">HRV 34</text>
    <text x="20" y="160" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="11.5">Lower for this metric</text>
    <text x="340" y="160" text-anchor="end" fill="var(--dim-2)" font-family="Space Grotesk, sans-serif" font-size="11.5">Higher for this metric</text>
  </svg>
  <figcaption>Each reading lands in a zone. The same "34" that looks meaningless on a fitness app becomes a placed, colored signal.</figcaption>
</figure>

## Judged against your baseline, not a textbook

Grade zones give you a fixed frame of reference, but the more powerful layer is the **rolling baseline**. Autonomic charts a moving average of your own recent readings so that today is measured against *your* normal from the last week or two, not a figure pulled from a population study.

This is what makes the app useful when you are ill. A reading that a generic chart would wave through as "fine" can still be low *for you*, and Autonomic will show it. And when your baseline itself starts to climb, that trend is the recovery signal, the thing no single day can tell you. If your [HRV drops overnight](/insights/hrv/hrv-dropped-overnight-how-to-read-it/), the baseline is what keeps one dip in perspective.

<div class="callout callout-tip">
<strong>Trends, not days.</strong> Your baseline and its direction matter more than any absolute number. A slowly rising baseline over six weeks means more than the best single morning inside it.
</div>

## Sparklines that carry their own scale

A trend line only helps if you can read it. Under each metric, Autonomic draws a **sparkline with grade-zone bands** painted behind it, the same colors from the scale above. So the line does not just wander up and down in the abstract; you can see when it crossed from "bad" into "ok," or when a run of readings settled into "good." The zones travel with the chart, so a glance tells you both the direction and where it sits.

That legibility is the whole reason to score readings at all. It is the difference between collecting data and being able to [measure, analyze, monitor and act](/insights/app/autonomic-app-measure-analyze-monitor-act/) on it. It is also what separates Autonomic from a general-purpose [fitness tracker](/insights/app/autonomic-vs-fitness-trackers/), which will happily show you a number but rarely tells you what it means for a body that is recovering.

## Where the thresholds come from

The zone boundaries are not invented. They are ported from an established scoring framework, using thresholds that clinicians and researchers already use to interpret each metric, whether that is an [orthostatic stand test](/insights/pots/the-orthostatic-stand-test-at-home/) heart-rate rise, a QTc adjusted for your profile, or the HRV ranges covered in the [complete guide to HRV](/insights/hrv/hrv-complete-guide/). Where a metric depends on sex or body size, Autonomic uses your profile to adjust the bands rather than applying one generic cutoff to everyone.

Crucially, these thresholds are used as *educational* reference points. They help you notice a reading that sits outside a typical range and bring it to someone qualified. They are not a verdict.

## How Autonomic helps

All of this runs quietly, on-device, every time you log a reading. You capture a number; the app scores it into a zone, tints the row, updates your rolling baseline, and redraws the sparkline with its bands. You do not configure anything. The raw measurement becomes a placed, colored, trend-aware signal you can read in a second, and a body of data you can hand to a doctor.

<div class="callout callout-tip">
<strong>See it in action.</strong> Log a morning HRV or a stand test in Autonomic and watch it land in a zone, then follow the trend against your own baseline. <a href="/">See how it works.</a>
</div>

## The bottom line

A raw number is a question, not an answer. Autonomic answers it by scoring each reading against recovery-relevant thresholds and, more importantly, against your own rolling baseline, then showing the result as a colored zone and a banded trend. Learn your baseline, respect its direction, and let the single rough mornings go.

<div class="callout callout-warn">
  <strong>Not medical advice.</strong> This article is educational and not a substitute
  for personalized care. <em>Autonomic's grade zones and thresholds are an educational signal to help you notice patterns, not a diagnosis of any condition.</em> Talk with a qualified
  clinician before making changes to medication, diet or exercise.
</div>
